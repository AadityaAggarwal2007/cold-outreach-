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

export async function sendEmail(opts: SendOptions): Promise<boolean> {
  try {
    const transporter = await getTransporter()
    const settings = await prisma.settings.findFirst({ where: { id: 1 } })
    const fromUser = settings?.gmailUser || process.env.GMAIL_USER || ''

    // Inject pixel as a clean resource URL (disguised as a web font/asset)
    // This avoids triggering spam filters that scan for "/track/" patterns
    const pixelHtml = opts.pixelBaseUrl
      ? `<img src="${opts.pixelBaseUrl}/api/r/${opts.pixelId}" width="1" height="1" style="display:none;border:0;outline:0;text-decoration:none;" alt="" />`
      : ''


    const finalHtml = opts.html + pixelHtml

    const mailOptions: nodemailer.SendMailOptions = {
      from: `"${fromUser.split('@')[0]}" <${fromUser}>`,
      to: `"${opts.toName}" <${opts.to}>`,
      subject: opts.subject,
      html: finalHtml,
      headers: {
        // Prevents auto-replies from triggering our inbox sync
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
        'Precedence': 'bulk',
      },
    }

    if (opts.resumePath) {
      mailOptions.attachments = [
        {
          filename: 'Resume.pdf',
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
