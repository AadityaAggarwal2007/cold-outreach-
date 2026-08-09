import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { prisma } from './db'
import { classifyAndDraftReply } from './ai'

async function getImapClient() {
  const settings = await prisma.settings.findFirst({ where: { id: 1 } })
  const user = settings?.gmailUser || process.env.GMAIL_USER || ''
  const pass = settings?.gmailAppPass || process.env.GMAIL_APP_PASSWORD || ''

  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  })
}

// ─── Main inbox sync ───────────────────────────────────────────────────────────
export async function syncInbox() {
  let client: ImapFlow | null = null
  try {
    client = await getImapClient()
    await client.connect()

    // Build lookup maps: email/domain → companyId
    const contacts = await prisma.contact.findMany({
      select: { email: true, companyId: true },
    })
    const emailToCompanyId = new Map<string, number>()
    const domainToCompanyId = new Map<string, number>()
    for (const c of contacts) {
      emailToCompanyId.set(c.email.toLowerCase(), c.companyId)
      const domain = c.email.split('@')[1]?.toLowerCase()
      if (domain) domainToCompanyId.set(domain, c.companyId)
    }

    await client.mailboxOpen('INBOX')

    // Fetch last 30 days
    const since = new Date()
    since.setDate(since.getDate() - 30)

    const rawMessages: Array<{ uid: number; source: Buffer; envelope: { messageId?: string } }> = []

    for await (const msg of client.fetch({ since }, { envelope: true, source: true, uid: true })) {
      rawMessages.push(msg as typeof rawMessages[0])
    }

    let newCount = 0

    for (const msg of rawMessages) {
      const messageId = msg.envelope.messageId || ''
      if (!messageId) continue

      // Dedup
      const existing = await prisma.incomingEmail.findFirst({ where: { messageId } })
      if (existing) continue

      // ── Parse the raw MIME properly ──────────────────────────────────────────
      // mailparser handles: quoted-printable, base64, multipart, charsets, etc.
      const parsed = await simpleParser(msg.source)

      const fromAddr = parsed.from?.value?.[0]?.address?.toLowerCase() || ''
      const fromName = parsed.from?.value?.[0]?.name || fromAddr
      const subject  = parsed.subject || '(No Subject)'

      // Prefer plain text, fall back to HTML-stripped text
      let body = ''
      if (parsed.text) {
        body = parsed.text.trim()
      } else if (parsed.html) {
        body = parsed.html
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, ' ')
          .trim()
      }

      if (!body) body = '(No body content)'
      body = body.substring(0, 10000)

      // ── Match to a company ──────────────────────────────────────────────────
      let companyId: number | null = null
      if (emailToCompanyId.has(fromAddr)) {
        companyId = emailToCompanyId.get(fromAddr)!
      } else {
        const domain = fromAddr.split('@')[1]
        if (domain && domainToCompanyId.has(domain)) {
          companyId = domainToCompanyId.get(domain)!
        }
      }

      // Save with "new" status
      const incoming = await prisma.incomingEmail.create({
        data: {
          companyId,
          fromEmail: fromAddr,
          fromName,
          subject,
          body,
          messageId,
          aiStatus: 'new',
        },
      })

      // Classify + draft reply immediately (async, doesn't block sync)
      classifyAndDraftReply(incoming.id, body, subject, fromName, companyId, fromAddr)
        .catch(console.error)

      newCount++
    }

    console.log(`[IMAP] Synced: ${newCount} new emails from ${rawMessages.length} fetched`)
    return newCount
  } catch (err) {
    console.error('[IMAP] Sync error:', err)
    return 0
  } finally {
    if (client) {
      try { await client.logout() } catch {}
    }
  }
}

// ─── Retry classification for stuck "new" emails ──────────────────────────────
// Runs every cycle to pick up emails where Codex was offline during first sync
export async function retryPendingClassifications() {
  try {
    const stuck = await prisma.incomingEmail.findMany({
      where: { aiStatus: 'new' },
      take: 5, // process 5 at a time to avoid overloading AI
    })

    for (const email of stuck) {
      classifyAndDraftReply(
        email.id, email.body, email.subject, email.fromName || email.fromEmail,
        email.companyId, email.fromEmail
      ).catch(console.error)
    }

    if (stuck.length > 0) {
      console.log(`[IMAP] Retrying classification for ${stuck.length} pending emails`)
    }
  } catch (err) {
    console.error('[IMAP] Retry classification error:', err)
  }
}
