import { prisma } from './db'
import { sendEmail } from './mailer'
import { syncInbox, retryPendingClassifications } from './imap'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

let cronStarted = false
let sendTimer: ReturnType<typeof setInterval> | null = null
let inboxTimer: ReturnType<typeof setInterval> | null = null

// Follow-up day intervals (index = followUpCount - 1)
// followUpCount 1 = initial sent, then 2-6 are follow-ups
const DEFAULT_FOLLOWUP_DAYS = [3, 7, 14, 21, 30]

export function startCron() {
  if (cronStarted) return
  cronStarted = true
  console.log('[Cron] Starting scheduler...')

  // Send queue: check every 60s, send if within time window
  sendTimer = setInterval(async () => {
    await processSendQueue()
  }, 60_000)

  // Inbox sync every 2 minutes (fast enough to catch replies quickly)
  inboxTimer = setInterval(async () => {
    await syncInbox()
    await retryPendingClassifications() // catch up any emails Codex missed
  }, 2 * 60_000)

  // Retry any unclassified emails every 3 minutes
  setInterval(async () => {
    await retryPendingClassifications()
  }, 3 * 60_000)

  // Initial inbox sync + retry after 15s
  setTimeout(async () => {
    await syncInbox()
    await retryPendingClassifications()
  }, 15_000)

  // Midnight daily reset
  scheduleMidnightReset()

  console.log('[Cron] Started: email queue (60s) + inbox sync (2min) + AI retry (3min)')
}

function scheduleMidnightReset() {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setDate(midnight.getDate() + 1)
  midnight.setHours(0, 0, 0, 0)
  const msUntilMidnight = midnight.getTime() - now.getTime()

  setTimeout(async () => {
    await resetDailyCount()
    // Schedule next midnight reset
    scheduleMidnightReset()
  }, msUntilMidnight)
}

async function resetDailyCount() {
  const today = new Date().toISOString().split('T')[0]
  await prisma.settings.update({
    where: { id: 1 },
    data: { sentToday: 0, lastResetDate: today },
  })
  console.log('[Cron] Daily send counter reset for', today)
}

// ─── IST SEND WINDOW GUARD ────────────────────────────────────────────────────
// Only send Mon–Fri within the configured IST time window
// windowStart / windowEnd are "HH:MM" strings (IST), default "10:30" / "11:59"
function isWithinSendWindow(windowStart = '10:30', windowEnd = '11:59'): boolean {
  const nowUTC = new Date()

  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000
  const nowIST = new Date(nowUTC.getTime() + istOffset)

  const dayIST = nowIST.getUTCDay()     // 0=Sun, 6=Sat
  const hourIST = nowIST.getUTCHours()
  const minIST  = nowIST.getUTCMinutes()
  const nowMins = hourIST * 60 + minIST // minutes since midnight IST

  // Block weekends
  if (dayIST === 0 || dayIST === 6) return false

  // Parse window
  const [startH, startM] = windowStart.split(':').map(Number)
  const [endH,   endM  ] = windowEnd.split(':').map(Number)
  const startMins = startH * 60 + startM
  const endMins   = endH   * 60 + endM

  return nowMins >= startMins && nowMins <= endMins
}

async function processSendQueue() {
  try {
    const settings = await prisma.settings.findFirst({ where: { id: 1 } })
    if (!settings) return
    if (settings.sendingPaused) return

    // ── Time/day gate (reads from DB so you can change it in Settings UI) ──
    if (!isWithinSendWindow(settings.sendWindowStart, settings.sendWindowEnd)) return

    const today = new Date().toISOString().split('T')[0]

    // Reset counter if it's a new day
    if (settings.lastResetDate !== today) {
      await resetDailyCount()
      return
    }

    if (settings.sentToday >= settings.dailyLimit) return

    // ── Batch ordering ──────────────────────────────────────────────────────
    // Batch 1 (first 900 contacts, imported first) → Batch 2 (next 900)
    // Follow-ups run in same order naturally: Batch 1 got initial earlier,
    // so Batch 1 follow-up cutoff is hit one day before Batch 2.
    // orderBy: { lastSentAt: 'asc' } in sendNextFollowUp handles this.
    // ────────────────────────────────────────────────────────────────────────

    // Follow-ups first (existing relationships → higher reply chance)
    const followupSent = await sendNextFollowUp(settings)
    if (followupSent) return

    // Then initial emails for new contacts
    await sendNextInitial(settings)
  } catch (err) {
    console.error('[Cron] processSendQueue error:', err)
  }
}



async function sendNextInitial(settings: {
  gmailUser: string
  pixelBaseUrl: string
  sentToday: number
  dailyLimit: number
}) {
  // Find a pending contact from a company that hasn't replied
  const contact = await prisma.contact.findFirst({
    where: {
      status: 'pending',
      followUpCount: 0,
      company: { repliedAt: null },
    },
    include: { company: true },
    orderBy: { createdAt: 'asc' },
  })

  if (!contact) return

  const template = await prisma.template.findFirst({ where: { type: 'initial' } })
  if (!template) {
    console.warn('[Cron] No initial template found — skipping')
    return
  }

  const pixelId = uuidv4()
  const html = personalizeTemplate(template.htmlBody, {
    companyName: contact.company.name,
    hrName: contact.name,
  })
  const subject = personalizeTemplate(template.subject, {
    companyName: contact.company.name,
    hrName: contact.name,
  })

  const resumePath = path.join(process.cwd(), 'public', 'resume.pdf')
  const success = await sendEmail({
    to: contact.email,
    toName: contact.name,
    subject,
    html,
    pixelId,
    pixelBaseUrl: settings.pixelBaseUrl,
    resumePath,
  })

  if (success) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { status: 'sent', followUpCount: 1, lastSentAt: new Date() },
    })
    await prisma.emailLog.create({
      data: {
        contactId: contact.id,
        type: 'initial',
        subject,
        body: html,
        pixelId,
      },
    })
    await prisma.settings.update({
      where: { id: 1 },
      data: { sentToday: { increment: 1 } },
    })
    console.log(`[Cron] Sent initial to ${contact.email}`)
  }
}

async function sendNextFollowUp(settings: {
  gmailUser: string
  pixelBaseUrl: string
  sentToday: number
  dailyLimit: number
  followUpDays: string
}): Promise<boolean> {
  const followUpDays = settings.followUpDays
    .split(',')
    .map((d) => parseInt(d.trim()))
    .filter(Boolean)

  // Find contacts eligible for follow-up
  // followUpCount 1 = initial sent, eligible for followup_1 after followUpDays[0] days
  for (let i = 0; i < followUpDays.length; i++) {
    const followUpNum = i + 1 // 1-indexed follow-up number
    const daysRequired = followUpDays[i]
    const cutoff = new Date(Date.now() - daysRequired * 24 * 60 * 60 * 1000)

    const contact = await prisma.contact.findFirst({
      where: {
        status: 'sent',
        followUpCount: followUpNum,      // has sent exactly followUpNum emails
        lastSentAt: { lte: cutoff },
        company: { repliedAt: null },
      },
      include: { company: true },
      orderBy: { lastSentAt: 'asc' },
    })

    if (!contact) continue

    const templateType = `followup_${followUpNum}`
    const template = await prisma.template.findFirst({ where: { type: templateType } })
    if (!template) continue

    const pixelId = uuidv4()
    const html = personalizeTemplate(template.htmlBody, {
      companyName: contact.company.name,
      hrName: contact.name,
    })
    const subject = personalizeTemplate(template.subject, {
      companyName: contact.company.name,
      hrName: contact.name,
    })

    const success = await sendEmail({
      to: contact.email,
      toName: contact.name,
      subject,
      html,
      pixelId,
      pixelBaseUrl: settings.pixelBaseUrl,
    })

    if (success) {
      const newFollowUpCount = contact.followUpCount + 1
      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          followUpCount: newFollowUpCount,
          lastSentAt: new Date(),
          status: newFollowUpCount > 5 ? 'stopped' : 'sent',
        },
      })
      await prisma.emailLog.create({
        data: {
          contactId: contact.id,
          type: templateType,
          subject,
          body: html,
          pixelId,
        },
      })
      await prisma.settings.update({
        where: { id: 1 },
        data: { sentToday: { increment: 1 } },
      })
      console.log(`[Cron] Sent ${templateType} to ${contact.email}`)
      return true
    }
  }

  return false
}

function personalizeTemplate(
  template: string,
  vars: { companyName: string; hrName: string }
): string {
  return template
    .replace(/\{\{Company Name\}\}/gi, vars.companyName)
    .replace(/\{\{HR Name\}\}/gi, vars.hrName)
    .replace(/\{\{company_name\}\}/gi, vars.companyName)
    .replace(/\{\{hr_name\}\}/gi, vars.hrName)
    .replace(/\{\{name\}\}/gi, vars.hrName)
}

export function stopCron() {
  if (sendTimer) clearInterval(sendTimer)
  if (inboxTimer) clearInterval(inboxTimer)
  cronStarted = false
}
