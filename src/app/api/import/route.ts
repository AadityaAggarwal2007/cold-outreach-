import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth'
import { prisma } from '@/lib/db'
import * as XLSX from 'xlsx'

export async function POST(req: NextRequest) {
  const userIdOrRedirect = await getUserId(req)
  if (userIdOrRedirect instanceof NextResponse) return userIdOrRedirect
  const userId = userIdOrRedirect

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })

    let imported = 0
    let skipped = 0

    const companyMap = new Map<string, Array<{ name: string; email: string; phone: string; tier: string; status: string }>>()

    let lastCompanyName = ''
    let lastTier = ''
    let lastStatus = ''

    for (const row of rows) {
      const rawCompany = (row['Company'] || '').trim()
      if (rawCompany) {
        lastCompanyName = rawCompany
        lastTier        = (row['Priority Tier'] || '').trim()
        lastStatus      = (row['Status(es) Seen'] || '').trim()
      }
      const companyName = lastCompanyName
      if (!companyName) continue

      const contactName = (row['Contact Name'] || '').trim()
      const email       = (row['Email'] || '').toString().trim().toLowerCase()
      const phone       = (row['Phone Number'] || '').toString().trim()

      if (!email || !email.includes('@') || email.startsWith('-')) continue

      if (!companyMap.has(companyName)) companyMap.set(companyName, [])
      companyMap.get(companyName)!.push({
        name: contactName || email.split('@')[0],
        email, phone, tier: lastTier, status: lastStatus,
      })
    }

    for (const [companyName, contacts] of companyMap) {
      const firstContact = contacts[0]
      const company = await prisma.company.upsert({
        where: { userId_name: { userId, name: companyName } },
        update: {},
        create: { userId, name: companyName, tier: firstContact.tier, statusSeen: firstContact.status },
      })

      for (const c of contacts) {
        if (!c.email) continue
        try {
          await prisma.contact.upsert({
            where: { email: c.email },
            update: {},
            create: { companyId: company.id, name: c.name, email: c.email, phone: c.phone || null },
          })
          imported++
        } catch {
          skipped++
        }
      }
    }

    return NextResponse.json({ success: true, imported, skipped, companies: companyMap.size })
  } catch (err) {
    console.error('[Import] Error:', err)
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const userIdOrRedirect = await getUserId(req)
  if (userIdOrRedirect instanceof NextResponse) return userIdOrRedirect
  const userId = userIdOrRedirect

  try {
    const userCompanyIds = (await prisma.company.findMany({ where: { userId }, select: { id: true } })).map(c => c.id)

    const logs = await prisma.emailLog.deleteMany({ where: { contact: { companyId: { in: userCompanyIds } } } })
    const contacts = await prisma.contact.deleteMany({ where: { companyId: { in: userCompanyIds } } })
    const companies = await prisma.company.deleteMany({ where: { userId } })

    return NextResponse.json({
      success: true,
      deleted: { emailLogs: logs.count, contacts: contacts.count, companies: companies.count },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
