import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendEmail } from '@/lib/mailer'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'

// ─── Inline personalisation (mirrors cron.ts) ─────────────────────────────────
function personalize(template: string, vars: { companyName: string; hrName: string; linkedinUrl: string }) {
  return template
    .replace(/\{\{Recipient Name\}\}/gi, `<strong>${vars.hrName}</strong>`)
    .replace(/\{\{HR Name\}\}/gi,        `<strong>${vars.hrName}</strong>`)
    .replace(/\{\{name\}\}/gi,           `<strong>${vars.hrName}</strong>`)
    .replace(/\{\{Company Name\}\}/gi,   `<strong>${vars.companyName}</strong>`)
    .replace(/\{\{company_name\}\}/gi,   `<strong>${vars.companyName}</strong>`)
    .replace(/\{\{LinkedIn\}\}/gi,
      vars.linkedinUrl
        ? `<a href="${vars.linkedinUrl}" style="color:#2563eb;text-decoration:none">LinkedIn</a>`
        : '')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

export async function POST(req: NextRequest) {
  try {
    const { toEmail, toName, companyName, templateType } = await req.json()

    if (!toEmail || !companyName) {
      return NextResponse.json({ error: 'toEmail and companyName required' }, { status: 400 })
    }

    const settings = await prisma.settings.findFirst({ where: { id: 1 } })
    if (!settings?.gmailUser || !settings?.gmailAppPass) {
      return NextResponse.json({ error: 'Gmail not configured in Settings' }, { status: 400 })
    }

    const allTypes = ['initial', 'followup_1', 'followup_2', 'followup_3', 'followup_4', 'followup_5']
    // If a specific type is chosen, only send that one
    const typesToSend = (templateType && templateType !== 'all') ? [templateType] : allTypes

    const templates = await prisma.template.findMany({
      where: { type: { in: typesToSend } },
    })

    if (templates.length === 0) {
      return NextResponse.json({ error: 'No templates found. Run seed-templates.cjs on VPS first.' }, { status: 400 })
    }

    const vars = {
      hrName:      toName      || 'Test Recipient',
      companyName: companyName || 'Test Company',
      linkedinUrl: settings.linkedinUrl || '',
    }

    const results: { type: string; ok: boolean }[] = []

    for (const type of typesToSend) {
      const tpl = templates.find(t => t.type === type)
      if (!tpl) {
        results.push({ type, ok: false })
        continue
      }

      const html    = personalize(tpl.htmlBody, vars)
      const subject = personalize(tpl.subject, vars)  // No [TEST] prefix — real subject
      const pixelId = uuidv4()

      const resumePath = path.join(process.cwd(), 'public', 'resume.pdf')

      const ok = await sendEmail({
        to: toEmail,
        toName: toName || 'Test',
        subject,
        html,
        pixelId,
        pixelBaseUrl: settings.pixelBaseUrl || '',
        resumePath,
      })

      results.push({ type, ok })

      // Small delay between sends to avoid rate limiting
      if (typesToSend.length > 1) await new Promise(r => setTimeout(r, 1500))
    }

    const sent   = results.filter(r => r.ok).length
    const failed = results.filter(r => !r.ok).length

    return NextResponse.json({
      success: true,
      sent,
      failed,
      results,
      message: `Sent ${sent}/${typesToSend.length} email(s) to ${toEmail}`,
    })
  } catch (err) {
    console.error('[TestEmail]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
