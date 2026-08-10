import nodemailer from 'nodemailer'
import { prisma } from './db'

let _transporter: nodemailer.Transporter | null = null

async function getTransporter() {
  if (_transporter) return _transporter
  const settings = await prisma.settings.findFirst({ where: { id: 1 } })
  const user = settings?.gmailUser || process.env.GMAIL_USER || ''
  const pass = settings?.gmailAppPass || process.env.GMAIL_APP_PASSWORD || ''

  _transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
    rateDelta: 1000,
    rateLimit: 1, // 1 message per second max
  })
  return _transporter
}

// Reset transporter cache when settings change
export function resetTransporter() {
  _transporter = null
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

// Strip HTML tags to generate a plain-text fallback (required for good deliverability)
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

// Wrap raw template body in a clean, deliverable HTML structure
function wrapInEmailHtml(body: string): string {
  // If already has <html> tag, return as-is
  if (body.toLowerCase().includes('<html')) return body
  // Convert newlines to <br> for raw text templates
  const htmlBody = body
    .replace(/\n\n/g, '</p><p style="margin:0 0 16px 0;">')
    .replace(/\n/g, '<br/>')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
<p style="margin:0 0 16px 0;">${htmlBody}</p>
</div>
</body>
</html>`
}

export async function sendEmail(opts: SendOptions): Promise<boolean> {
  try {
    const transporter = await getTransporter()
    const settings = await prisma.settings.findFirst({ where: { id: 1 } })
    const fromUser = settings?.gmailUser || process.env.GMAIL_USER || ''

    // Pixel: use opacity:0 + tiny size instead of display:none
    // display:none is a known phishing/spam red flag — never use it
    const pixelHtml = opts.pixelBaseUrl
      ? `<img src="${opts.pixelBaseUrl}/api/r/${opts.pixelId}" width="1" height="1" style="opacity:0;border:0;outline:0;" alt="" />`
      : ''

    const wrappedHtml = wrapInEmailHtml(opts.html)
    const finalHtml   = wrappedHtml.replace('</body>', `${pixelHtml}</body>`)

    // Plain-text version is REQUIRED for good deliverability
    // Spam filters heavily penalise HTML-only emails
    const plainText = htmlToPlainText(opts.html)

    const mailOptions: nodemailer.SendMailOptions = {
      from: `"Aaditya Aggarwal" <${fromUser}>`,
      to: `"${opts.toName}" <${opts.to}>`,
      subject: opts.subject,
      text: plainText,    // Plain-text alternative — critical for inbox delivery
      html: finalHtml,
      headers: {
        // Prevents auto-replies from triggering our inbox sync
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
        // NO Precedence: bulk — that guarantees spam folder
      },
    }

    if (opts.resumePath) {
      mailOptions.attachments = [
        {
          filename: 'Resume - Aaditya Aggarwal.pdf',
          path: opts.resumePath,
        },
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
}): Promise<boolean> {
  try {
    const transporter = await getTransporter()
    const settings = await prisma.settings.findFirst({ where: { id: 1 } })
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
