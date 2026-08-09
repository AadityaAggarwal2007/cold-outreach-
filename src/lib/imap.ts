import { ImapFlow } from 'imapflow'
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
    logger: false, // suppress verbose logs
  })
}

// Sync inbox — fetch unseen emails since last check
export async function syncInbox() {
  let client: ImapFlow | null = null
  try {
    client = await getImapClient()
    await client.connect()

    // Get list of all companies we've emailed
    const companies = await prisma.company.findMany({
      select: { id: true, name: true },
    })

    // Build email domain → company map for fast lookup
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

    // Fetch messages from the last 30 days that are unseen or recent
    const since = new Date()
    since.setDate(since.getDate() - 30)

    const messages: Array<{
      uid: number
      envelope: {
        messageId?: string
        from?: Array<{ address?: string; name?: string }>
        subject?: string
        date?: Date
      }
      source: Buffer
    }> = []

    for await (const msg of client.fetch({ since }, { envelope: true, source: true, uid: true })) {
      messages.push(msg as typeof messages[0])
    }

    let newCount = 0

    for (const msg of messages) {
      const messageId = msg.envelope.messageId || ''
      if (!messageId) continue

      // Dedup by message ID
      const existing = await prisma.incomingEmail.findFirst({
        where: { messageId },
      })
      if (existing) continue

      const fromAddr = msg.envelope.from?.[0]?.address?.toLowerCase() || ''
      const fromName = msg.envelope.from?.[0]?.name || fromAddr
      const subject = msg.envelope.subject || '(No Subject)'

      // Extract plain text body from raw source
      const rawBody = msg.source.toString('utf-8')
      const body = extractBody(rawBody)

      // Match to a company
      let companyId: number | null = null
      if (emailToCompanyId.has(fromAddr)) {
        companyId = emailToCompanyId.get(fromAddr)!
      } else {
        const domain = fromAddr.split('@')[1]
        if (domain && domainToCompanyId.has(domain)) {
          companyId = domainToCompanyId.get(domain)!
        }
      }

      // Save to DB first with "new" status
      const incoming = await prisma.incomingEmail.create({
        data: {
          companyId,
          fromEmail: fromAddr,
          fromName,
          subject,
          body: body.substring(0, 10000), // cap at 10k chars
          messageId,
          aiStatus: 'new',
        },
      })

      // Classify and draft asynchronously
      classifyAndDraftReply(incoming.id, body, subject, fromName, companyId).catch(console.error)

      newCount++
    }

    console.log(`[IMAP] Synced inbox: ${newCount} new emails`)
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

// Extract readable body from raw email
function extractBody(raw: string): string {
  // Try to get text/plain section
  const plainMatch = raw.match(/Content-Type: text\/plain[\s\S]*?\r?\n\r?\n([\s\S]+?)(?=--|\r?\n\r?\nContent-Type:|$)/i)
  if (plainMatch) return plainMatch[1].trim()

  // Fallback: strip HTML tags
  const htmlMatch = raw.match(/Content-Type: text\/html[\s\S]*?\r?\n\r?\n([\s\S]+?)(?=--|$)/i)
  if (htmlMatch) {
    return htmlMatch[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
  }

  // Last resort: strip all angle brackets from raw
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 5000)
}
