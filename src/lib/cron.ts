import { prisma } from './db'
import { sendEmail } from './mailer'
import { syncInbox, retryPendingClassifications } from './imap'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

let cronStarted  = false
let isSending    = false
let sendTimer:  ReturnType<typeof setInterval> | null = null
let inboxTimer: ReturnType<typeof setInterval> | null = null

// Total follow-up rounds (after initial = round 0)
// Round order: initial → FU1 → FU2 → FU3 → FU4 → FU5 → done
// Each round only starts after the PREVIOUS round is 100% complete
const TOTAL_FOLLOWUP_ROUNDS = 5

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

// ─── Send one follow-up email (completion-based, no time gap) ────────────────
// Only enters round N after round N-1 is 100% complete across all contacts.
async function sendNextFollowUp(settings: {
  gmailUser: string
  pixelBaseUrl: string
  sentToday: number
  dailyLimit: number
}): Promise<boolean> {
  // Check follow-up rounds in order: 1 → 2 → 3 → 4 → 5
  // For each round, find the oldest-waiting contact eligible for that round.
  // If a round has any eligible contacts → send to them (don't skip to next round).
  // Only when a round is fully exhausted do we move to the next.

  for (let round = 1; round <= TOTAL_FOLLOWUP_ROUNDS; round++) {
    const templateType = `followup_${round}`
    const template = await prisma.template.findFirst({ where: { type: templateType } })

    // Find contact eligible for this round:
    // followUpCount === round means they've received exactly `round` emails so far
    // (followUpCount 1 = initial sent, 2 = FU1 sent, etc.)
    const contact = await prisma.contact.findFirst({
      where: {
        status: 'sent',
        followUpCount: round,
        company: { repliedAt: null },
      },
      include: { company: true },
      orderBy: { lastSentAt: 'asc' },  // oldest first = same order as initials
    })

    if (!contact) continue  // this round fully done → check next round

    if (!template) {
      console.warn(`[Cron] No template for ${templateType} — skipping round ${round}`)
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
          // Stop after all 5 follow-up rounds sent (followUpCount becomes 6)
          status:        newCount > TOTAL_FOLLOWUP_ROUNDS ? 'stopped' : 'sent',
        },
      })
      await prisma.emailLog.create({
        data: { contactId: contact.id, type: templateType, subject, body: html, pixelId },
      })
      await prisma.settings.update({
        where: { id: 1 },
        data: { sentToday: { increment: 1 } },
      })
      console.log(`[Cron] ${templateType} → ${contact.email} (round ${round}/${TOTAL_FOLLOWUP_ROUNDS})`)
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
