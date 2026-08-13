import nodemailer from 'nodemailer'
import { prisma } from './db'

const _transporters = new Map<number, nodemailer.Transporter>()

async function getTransporter(userId: number) {
  if (_transporters.has(userId)) return _transporters.get(userId)!
  const settings = await prisma.settings.findUnique({ where: { userId } })
  const user = settings?.gmailUser || process.env.GMAIL_USER || ''
  const pass = settings?.gmailAppPass || process.env.GMAIL_APP_PASSWORD || ''

  const t = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
    rateDelta: 1000,
    rateLimit: 1,
  })
  _transporters.set(userId, t)
  return t
}

export function resetTransporter(userId?: number) {
  if (userId !== undefined) {
    _transporters.delete(userId)
  } else {
    _transporters.clear()
  }
}

export interface SendOptions {
  to: string
  toName: string
  subject: string
  html: string
  pixelId: string
  pixelBaseUrl: string
  resumePath?: string
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<strong>(.*?)<\/strong>/gi, '$1')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function wrapInEmailHtml(body: string): string {
  if (body.toLowerCase().includes('<html')) return body
  const htmlBody = body
    .replace(/\n\n/g, '</p><p style="margin:0 0 10px 0;">')
    .replace(/\n/g, '<br/>')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a;">
<div style="max-width:600px;margin:0 auto;padding:20px 16px;">
<p style="margin:0 0 10px 0;">${htmlBody}</p>
</div>
</body>
</html>`
}

export async function sendEmail(opts: SendOptions, userId: number): Promise<boolean> {
  try {
    const transporter = await getTransporter(userId)
    const settings = await prisma.settings.findUnique({ where: { userId } })
    const fromUser = settings?.gmailUser || process.env.GMAIL_USER || ''

    const pixelHtml = opts.pixelBaseUrl
      ? `<img src="${opts.pixelBaseUrl}/api/r/${opts.pixelId}" width="1" height="1" style="opacity:0;border:0;outline:0;" alt="" />`
      : ''

    const wrappedHtml = wrapInEmailHtml(opts.html)
    const finalHtml   = wrappedHtml.replace('</body>', `${pixelHtml}</body>`)
    const plainText   = htmlToPlainText(opts.html)

    const user = await prisma.user.findUnique({ where: { id: userId } })
    const displayName = user?.displayName || fromUser.split('@')[0]

    const mailOptions: nodemailer.SendMailOptions = {
      from: `"${displayName}" <${fromUser}>`,
      to: `"${opts.toName}" <${opts.to}>`,
      subject: opts.subject,
      text: plainText,
      html: finalHtml,
      headers: {
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
      },
    }

    if (opts.resumePath) {
      mailOptions.attachments = [
        { filename: `Resume - ${displayName}.pdf`, path: opts.resumePath },
      ]
    }

    await transporter.sendMail(mailOptions)
    return true
  } catch (err) {
    console.error('[Mailer] Error sending to', opts.to, err)
    return false
  }
}

export async function sendReply(opts: {
  to: string
  toName: string
  subject: string
  html: string
  inReplyTo?: string
}, userId: number): Promise<boolean> {
  try {
    const transporter = await getTransporter(userId)
    const settings = await prisma.settings.findUnique({ where: { userId } })
    const fromUser = settings?.gmailUser || process.env.GMAIL_USER || ''

    await transporter.sendMail({
      from: `"${fromUser.split('@')[0]}" <${fromUser}>`,
      to: `"${opts.toName}" <${opts.to}>`,
      subject: opts.subject.startsWith('Re:') ? opts.subject : `Re: ${opts.subject}`,
      html: opts.html,
      ...(opts.inReplyTo ? { inReplyTo: opts.inReplyTo, references: opts.inReplyTo } : {}),
    })
    return true
  } catch (err) {
    console.error('[Mailer] Reply error:', err)
    return false
  }
}
