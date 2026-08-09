import { prisma } from './db'
import { sendEmail } from './mailer'
import { syncInbox, retryPendingClassifications } from './imap'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

let cronStarted  = false
let isSending    = false  // guard against concurrent sends
let sendTimer:  ReturnType<typeof setInterval> | null = null
let inboxTimer: ReturnType<typeof setInterval> | null = null

// Follow-up schedule: calendar days after initial email
// Day 4 → Day 8 → Day 15 → Day 22 → Day 30
// e.g. Mon initial → Fri follow-up (skips weekend automatically)
const DEFAULT_FOLLOWUP_DAYS = [4, 8, 15, 22, 30]

export function startCron() {
  if (cronStarted) return
  cronStarted = true
  console.log('[Cron] Starting scheduler...')

  // ── Send queue: check every 10 seconds ──────────────────────────────────────
  // 89-min window (10:30–11:59) = 534 × 10s intervals → enough for 499 emails
  sendTimer = setInterval(async () => {
    if (isSending) return  // skip if previous send is still in progress
    isSending = true
    try {
      await processSendQueue()
    } finally {
      isSending = false
    }
  }, 10_000)

  // ── Inbox sync every 2 minutes ───────────────────────────────────────────────
  inboxTimer = setInterval(async () => {
    await syncInbox()
    await retryPendingClassifications()
  }, 2 * 60_000)

  // Retry unclassified emails every 3 minutes (in case Codex was briefly down)
  setInterval(async () => {
    await retryPendingClassifications()
  }, 3 * 60_000)

  // Initial sync after 15s startup delay
  setTimeout(async () => {
    await syncInbox()
    await retryPendingClassifications()
  }, 15_000)

  scheduleMidnightReset()

  console.log('[Cron] Started: email queue (10s) + inbox sync (2min) + AI retry (3min)')
}

function scheduleMidnightReset() {
  const now      = new Date()
  const midnight = new Date(now)
  midnight.setDate(midnight.getDate() + 1)
  midnight.setHours(0, 0, 0, 0)

  setTimeout(async () => {
    await resetDailyCount()
    scheduleMidnightReset()
  }, midnight.getTime() - now.getTime())
}

async function resetDailyCount() {
  const today = new Date().toISOString().split('T')[0]
  await prisma.settings.update({
    where: { id: 1 },
    data: { sentToday: 0, lastResetDate: today },
  })
  console.log('[Cron] Daily send counter reset for', today)
}

// ─── IST send window guard ────────────────────────────────────────────────────
// Returns true only on Mon–Fri between windowStart and windowEnd (IST)
function isWithinSendWindow(windowStart = '10:30', windowEnd = '11:59'): boolean {
  const nowUTC  = new Date()
  const nowIST  = new Date(nowUTC.getTime() + 5.5 * 60 * 60 * 1000)

  const dayIST  = nowIST.getUTCDay()       // 0=Sun … 6=Sat
  const nowMins = nowIST.getUTCHours() * 60 + nowIST.getUTCMinutes()

  if (dayIST === 0 || dayIST === 6) return false   // weekend

  const [startH, startM] = windowStart.split(':').map(Number)
  const [endH,   endM  ] = windowEnd.split(':').map(Number)

  return nowMins >= startH * 60 + startM && nowMins <= endH * 60 + endM
}

// ─── Main send loop ───────────────────────────────────────────────────────────
async function processSendQueue() {
  try {
    const settings = await prisma.settings.findFirst({ where: { id: 1 } })
    if (!settings) return
    if (settings.sendingPaused) return
    if (!isWithinSendWindow(settings.sendWindowStart, settings.sendWindowEnd)) return

    // Reset counter on new day
    const today = new Date().toISOString().split('T')[0]
    if (settings.lastResetDate !== today) {
      await resetDailyCount()
      return
    }

    if (settings.sentToday >= settings.dailyLimit) return

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIORITY RULE (user-confirmed):
    //   1. Pending initials (never emailed) → fill slots first
    //   2. Due follow-ups → fill remaining slots
    //
    // This ensures ALL initials go out before follow-ups begin mixing in.
    // Once all initials are done, follow-up slots fill naturally each day.
    // ═══════════════════════════════════════════════════════════════════════════
    const initialSent = await sendNextInitial(settings)
    if (initialSent) return

    await sendNextFollowUp(settings)
  } catch (err) {
    console.error('[Cron] processSendQueue error:', err)
  }
}

// ─── Send one initial email ───────────────────────────────────────────────────
async function sendNextInitial(settings: {
  gmailUser: string
  pixelBaseUrl: string
  sentToday: number
  dailyLimit: number
}): Promise<boolean> {
  const contact = await prisma.contact.findFirst({
    where: {
      status: 'pending',
      followUpCount: 0,
      company: { repliedAt: null },
    },
    include: { company: true },
    orderBy: { createdAt: 'asc' },  // top of import list first
  })

  if (!contact) return false

  const template = await prisma.template.findFirst({ where: { type: 'initial' } })
  if (!template) {
    console.warn('[Cron] No initial template — skipping')
    return false
  }

  const pixelId = uuidv4()
  const html    = personalizeTemplate(template.htmlBody, { companyName: contact.company.name, hrName: contact.name })
  const subject = personalizeTemplate(template.subject,  { companyName: contact.company.name, hrName: contact.name })

  const resumePath = path.join(process.cwd(), 'public', 'resume.pdf')
  const success = await sendEmail({
    to: contact.email, toName: contact.name,
    subject, html, pixelId,
    pixelBaseUrl: settings.pixelBaseUrl,
    resumePath,
  })

  if (success) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { status: 'sent', followUpCount: 1, lastSentAt: new Date() },
    })
    await prisma.emailLog.create({
      data: { contactId: contact.id, type: 'initial', subject, body: html, pixelId },
    })
    await prisma.settings.update({
      where: { id: 1 },
      data: { sentToday: { increment: 1 } },
    })
    console.log(`[Cron] Initial → ${contact.email} (${settings.sentToday + 1}/${settings.dailyLimit})`)
    return true
  }

  return false
}

// ─── Send one follow-up email ─────────────────────────────────────────────────
async function sendNextFollowUp(settings: {
  gmailUser: string
  pixelBaseUrl: string
  sentToday: number
  dailyLimit: number
  followUpDays: string
}): Promise<boolean> {
  const followUpDays = settings.followUpDays
    .split(',').map(d => parseInt(d.trim())).filter(Boolean)

  // Check each follow-up round in order (earliest first)
  for (let i = 0; i < followUpDays.length; i++) {
    const followUpNum  = i + 1
    const daysRequired = followUpDays[i]
    const cutoff       = new Date(Date.now() - daysRequired * 24 * 60 * 60 * 1000)

    // Find the contact who waited the longest (order by lastSentAt ASC)
    // This ensures Day 1 contacts get follow-ups before Day 2, Day 2 before Day 3, etc.
    const contact = await prisma.contact.findFirst({
      where: {
        status: 'sent',
        followUpCount: followUpNum,
        lastSentAt: { lte: cutoff },
        company: { repliedAt: null },
      },
      include: { company: true },
      orderBy: { lastSentAt: 'asc' },
    })

    if (!contact) continue

    const templateType = `followup_${followUpNum}`
    const template = await prisma.template.findFirst({ where: { type: templateType } })
    if (!template) {
      console.warn(`[Cron] No template for ${templateType} — skipping this contact for now`)
      continue
    }

    const pixelId = uuidv4()
    const html    = personalizeTemplate(template.htmlBody, { companyName: contact.company.name, hrName: contact.name })
    const subject = personalizeTemplate(template.subject,  { companyName: contact.company.name, hrName: contact.name })

    const success = await sendEmail({
      to: contact.email, toName: contact.name,
      subject, html, pixelId,
      pixelBaseUrl: settings.pixelBaseUrl,
    })

    if (success) {
      const newCount = contact.followUpCount + 1
      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          followUpCount: newCount,
          lastSentAt:    new Date(),
          status:        newCount > followUpDays.length ? 'stopped' : 'sent',
        },
      })
      await prisma.emailLog.create({
        data: { contactId: contact.id, type: templateType, subject, body: html, pixelId },
      })
      await prisma.settings.update({
        where: { id: 1 },
        data: { sentToday: { increment: 1 } },
      })
      console.log(`[Cron] followup_${followUpNum} → ${contact.email}`)
      return true
    }
  }

  return false
}

// ─── Template personalisation ─────────────────────────────────────────────────
function personalizeTemplate(
  template: string,
  vars: { companyName: string; hrName: string }
): string {
  return template
    .replace(/\{\{Company Name\}\}/gi, vars.companyName)
    .replace(/\{\{HR Name\}\}/gi,      vars.hrName)
    .replace(/\{\{company_name\}\}/gi, vars.companyName)
    .replace(/\{\{hr_name\}\}/gi,      vars.hrName)
    .replace(/\{\{name\}\}/gi,         vars.hrName)
}

export function stopCron() {
  if (sendTimer)  clearInterval(sendTimer)
  if (inboxTimer) clearInterval(inboxTimer)
  cronStarted = false
}
