import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendEmail } from '@/lib/mailer'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'

// ─── Inline personalisation ────────────────────────────────────────────────────
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

// Upsert a special "_Test_" company + contact so tracker works for test emails
async function ensureTestContact(toEmail: string, toName: string, companyName: string) {
  const company = await prisma.company.upsert({
    where:  { name: '_InternReach Test_' },
    update: {},
    create: { name: '_InternReach Test_', stage: 'test' },
  })
  // Upsert contact — if same email used again, reuse it
  const contact = await prisma.contact.upsert({
    where:  { email: toEmail },
    update: { name: toName, companyId: company.id },
    create: { name: toName, email: toEmail, companyId: company.id, status: 'sent', followUpCount: 0 },
  })
  return contact
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
    const typesToSend = (templateType && templateType !== 'all') ? [templateType] : allTypes

    const templates = await prisma.template.findMany({
      where: { type: { in: typesToSend } },
    })

    if (templates.length === 0) {
      return NextResponse.json({ error: 'No templates found. Run seed-templates.cjs on VPS first.' }, { status: 400 })
    }

    // Ensure test contact exists so tracker can write open data
    const testContact = await ensureTestContact(toEmail, toName || 'Test', companyName)

    const vars = {
      hrName:      toName      || 'Test Recipient',
      companyName: companyName || 'Test Company',
      linkedinUrl: settings.linkedinUrl || '',
    }

    const results: { type: string; ok: boolean; pixelId: string }[] = []

    for (const type of typesToSend) {
      const tpl = templates.find(t => t.type === type)
      if (!tpl) {
        results.push({ type, ok: false, pixelId: '' })
        continue
      }

      const html     = personalize(tpl.htmlBody, vars)
      const subject  = personalize(tpl.subject, vars)
      const pixelId  = uuidv4()
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

      if (ok) {
        // Create EmailLog so tracker pixel can record opens
        await prisma.emailLog.create({
          data: {
            contactId: testContact.id,
            type,
            subject,
            body: html,
            pixelId,
            status: 'sent',
          },
        })
      }

      results.push({ type, ok, pixelId })

      if (typesToSend.length > 1) await new Promise(r => setTimeout(r, 1500))
    }

    const sent   = results.filter(r => r.ok).length
    const failed = results.filter(r => !r.ok).length

    return NextResponse.json({
      success: true,
      sent,
      failed,
      results,
      pixelIds: Object.fromEntries(results.filter(r => r.ok).map(r => [r.type, r.pixelId])),
      message: `Sent ${sent}/${typesToSend.length} email(s) to ${toEmail}`,
    })
  } catch (err) {
    console.error('[TestEmail]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// GET — check open status for a set of pixelIds (polled by Settings UI)
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const ids  = url.searchParams.get('pixelIds')?.split(',').filter(Boolean) || []
  if (!ids.length) return NextResponse.json({ statuses: {} })

  const logs = await prisma.emailLog.findMany({ where: { pixelId: { in: ids } } })
  const statuses: Record<string, { sent: boolean; openedAt: string | null; openCount: number }> = {}

  for (const id of ids) {
    const log = logs.find(l => l.pixelId === id)
    statuses[id] = {
      sent:     !!log,
      openedAt: log?.openedAt ? log.openedAt.toISOString() : null,
      openCount: log?.openCount || 0,
    }
  }

  return NextResponse.json({ statuses })
}
