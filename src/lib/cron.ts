import { prisma } from './db'
import { sendEmail } from './mailer'
import { syncInbox, retryPendingClassifications } from './imap'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

let cronStarted  = false
let isSending    = false
let sendTimer:  ReturnType<typeof setInterval> | null = null
let inboxTimer: ReturnType<typeof setInterval> | null = null

const TOTAL_FOLLOWUP_ROUNDS = 5

export function startCron() {
  if (cronStarted) return
  cronStarted = true
  console.log('[Cron] Starting scheduler...')

  sendTimer = setInterval(async () => {
    if (isSending) return
    isSending = true
    try {
      await processSendQueue()
    } finally {
      isSending = false
    }
  }, 10_000)

  inboxTimer = setInterval(async () => {
    await syncAllUsers()
    await retryPendingClassifications()
  }, 2 * 60_000)

  setInterval(async () => {
    await retryPendingClassifications()
  }, 3 * 60_000)

  setTimeout(async () => {
    await syncAllUsers()
    await retryPendingClassifications()
  }, 15_000)

  scheduleMidnightReset()

  console.log('[Cron] Started: email queue (10s) + inbox sync (2min) + AI retry (3min)')
}

async function syncAllUsers() {
  const users = await prisma.user.findMany({ select: { id: true } })
  await Promise.all(users.map(u => syncInbox(u.id).catch(console.error)))
}

function scheduleMidnightReset() {
  const now      = new Date()
  const midnight = new Date(now)
  midnight.setDate(midnight.getDate() + 1)
  midnight.setHours(0, 0, 0, 0)

  setTimeout(async () => {
    await resetAllDailyCounts()
    scheduleMidnightReset()
  }, midnight.getTime() - now.getTime())
}

async function resetAllDailyCounts() {
  const today = new Date().toISOString().split('T')[0]
  await prisma.settings.updateMany({
    data: { sentToday: 0, lastResetDate: today },
  })
  console.log('[Cron] Daily send counter reset for', today)
}

async function resetDailyCount(userId: number) {
  const today = new Date().toISOString().split('T')[0]
  await prisma.settings.update({
    where: { userId },
    data: { sentToday: 0, lastResetDate: today },
  })
}

function isWithinSendWindow(windowStart = '10:30', windowEnd = '11:59'): boolean {
  const nowUTC  = new Date()
  const nowIST  = new Date(nowUTC.getTime() + 5.5 * 60 * 60 * 1000)

  const dayIST  = nowIST.getUTCDay()
  const nowMins = nowIST.getUTCHours() * 60 + nowIST.getUTCMinutes()

  if (dayIST === 0 || dayIST === 6) return false

  const [startH, startM] = windowStart.split(':').map(Number)
  const [endH,   endM  ] = windowEnd.split(':').map(Number)

  return nowMins >= startH * 60 + startM && nowMins <= endH * 60 + endM
}

const BATCH_PER_CALL = 10

export async function processSendQueue() {
  try {
    // Process each user's send queue independently
    const allSettings = await prisma.settings.findMany({
      where: { gmailUser: { not: '' }, gmailAppPass: { not: '' } },
    })

    for (const settings of allSettings) {
      await processUserSendQueue(settings.userId, settings).catch(err =>
        console.error(`[Cron] Error processing user ${settings.userId}:`, err)
      )
    }
  } catch (err) {
    console.error('[Cron] processSendQueue error:', err)
  }
}

async function processUserSendQueue(userId: number, settings: {
  sendingPaused: boolean
  sendWindowStart: string
  sendWindowEnd: string
  lastResetDate: string | null
  sentToday: number
  dailyLimit: number
}) {
  if (settings.sendingPaused) return
  if (!isWithinSendWindow(settings.sendWindowStart, settings.sendWindowEnd)) return

  const today = new Date().toISOString().split('T')[0]
  if (settings.lastResetDate !== today) {
    await resetDailyCount(userId)
    return
  }

  if (settings.sentToday >= settings.dailyLimit) return

  for (let i = 0; i < BATCH_PER_CALL; i++) {
    const s = await prisma.settings.findUnique({ where: { userId } })
    if (!s || s.sendingPaused || s.sentToday >= s.dailyLimit) break

    const initialSent = await sendNextInitial(userId, s)
    if (!initialSent) {
      const followUpSent = await sendNextFollowUp(userId, s)
      if (!followUpSent) break
    }

    if (i < BATCH_PER_CALL - 1) await new Promise(r => setTimeout(r, 1200))
  }
}

async function sendNextInitial(userId: number, settings: {
  gmailUser: string
  pixelBaseUrl: string
  linkedinUrl: string
  sentToday: number
  dailyLimit: number
}): Promise<boolean> {
  const contact = await prisma.contact.findFirst({
    where: {
      status: 'pending',
      followUpCount: 0,
      company: { repliedAt: null, userId },
    },
    include: { company: true },
    orderBy: { createdAt: 'asc' },
  })

  if (!contact) return false

  const template = await prisma.template.findFirst({ where: { type: 'initial', userId } })
  if (!template) {
    console.warn(`[Cron] User ${userId}: No initial template — skipping`)
    return false
  }

  const pixelId = uuidv4()
  const html    = personalizeTemplate(template.htmlBody, { companyName: contact.company.name, hrName: contact.name, linkedinUrl: settings.linkedinUrl })
  const subject = personalizeTemplate(template.subject,  { companyName: contact.company.name, hrName: contact.name, linkedinUrl: settings.linkedinUrl })

  const resumeFile = path.join(process.cwd(), 'public', `resume-${userId}.pdf`)
  const success = await sendEmail({
    to: contact.email, toName: contact.name,
    subject, html, pixelId,
    pixelBaseUrl: settings.pixelBaseUrl,
    resumePath: resumeFile,
  }, userId)

  if (success) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { status: 'sent', followUpCount: 1, lastSentAt: new Date() },
    })
    await prisma.emailLog.create({
      data: { contactId: contact.id, type: 'initial', subject, body: html, pixelId },
    })
    await prisma.settings.update({
      where: { userId },
      data: { sentToday: { increment: 1 } },
    })
    console.log(`[Cron] User ${userId} initial → ${contact.email} (${settings.sentToday + 1}/${settings.dailyLimit})`)
    return true
  }

  return false
}

async function sendNextFollowUp(userId: number, settings: {
  gmailUser: string
  pixelBaseUrl: string
  linkedinUrl: string
  sentToday: number
  dailyLimit: number
}): Promise<boolean> {
  for (let round = 1; round <= TOTAL_FOLLOWUP_ROUNDS; round++) {
    const templateType = `followup_${round}`
    const template = await prisma.template.findFirst({ where: { type: templateType, userId } })

    const contact = await prisma.contact.findFirst({
      where: {
        status: 'sent',
        followUpCount: round,
        company: { repliedAt: null, userId },
      },
      include: { company: true },
      orderBy: { lastSentAt: 'asc' },
    })

    if (!contact) continue

    if (!template) {
      console.warn(`[Cron] User ${userId}: No template for ${templateType} — skipping round ${round}`)
      continue
    }

    const pixelId = uuidv4()
    const html    = personalizeTemplate(template.htmlBody, { companyName: contact.company.name, hrName: contact.name, linkedinUrl: settings.linkedinUrl })
    const subject = personalizeTemplate(template.subject,  { companyName: contact.company.name, hrName: contact.name, linkedinUrl: settings.linkedinUrl })

    const resumeFile = path.join(process.cwd(), 'public', `resume-${userId}.pdf`)

    const success = await sendEmail({
      to: contact.email, toName: contact.name,
      subject, html, pixelId,
      pixelBaseUrl: settings.pixelBaseUrl,
      resumePath: resumeFile,
    }, userId)

    if (success) {
      const newCount = contact.followUpCount + 1
      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          followUpCount: newCount,
          lastSentAt:    new Date(),
          status:        newCount > TOTAL_FOLLOWUP_ROUNDS ? 'stopped' : 'sent',
        },
      })
      await prisma.emailLog.create({
        data: { contactId: contact.id, type: templateType, subject, body: html, pixelId },
      })
      await prisma.settings.update({
        where: { userId },
        data: { sentToday: { increment: 1 } },
      })
      console.log(`[Cron] User ${userId} ${templateType} → ${contact.email} (round ${round}/${TOTAL_FOLLOWUP_ROUNDS})`)
      return true
    }
  }

  return false
}

function personalizeTemplate(
  template: string,
  vars: { companyName: string; hrName: string; linkedinUrl: string }
): string {
  return template
    .replace(/\{\{Recipient Name\}\}/gi, `<strong>${vars.hrName}</strong>`)
    .replace(/\{\{HR Name\}\}/gi,        `<strong>${vars.hrName}</strong>`)
    .replace(/\{\{hr_name\}\}/gi,        `<strong>${vars.hrName}</strong>`)
    .replace(/\{\{name\}\}/gi,           `<strong>${vars.hrName}</strong>`)
    .replace(/\{\{Company Name\}\}/gi,   `<strong>${vars.companyName}</strong>`)
    .replace(/\{\{company_name\}\}/gi,   `<strong>${vars.companyName}</strong>`)
    .replace(/\{\{LinkedIn\}\}/gi,
      vars.linkedinUrl
        ? `<a href="${vars.linkedinUrl}" style="color:#2563eb;text-decoration:none">LinkedIn</a>`
        : '')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

export function stopCron() {
  if (sendTimer)  clearInterval(sendTimer)
  if (inboxTimer) clearInterval(inboxTimer)
  cronStarted = false
}
