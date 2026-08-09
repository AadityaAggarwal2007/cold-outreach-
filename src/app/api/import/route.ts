import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import * as XLSX from 'xlsx'

export async function POST(req: NextRequest) {
  const authError = await requireAuth(req)
  if (authError) return authError

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

    // Group by company first
    const companyMap = new Map<string, Array<{ name: string; email: string; phone: string; tier: string; status: string }>>()

    let lastCompanyName = ''
    let lastTier = ''
    let lastStatus = ''

    for (const row of rows) {
      // Carry forward company name for blank continuation rows (Excel merged cells)
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

      // Skip rows with no email or obviously invalid emails
      if (!email || !email.includes('@') || email.startsWith('-')) continue

      if (!companyMap.has(companyName)) {
        companyMap.set(companyName, [])
      }
      companyMap.get(companyName)!.push({
        name: contactName || email.split('@')[0],
        email,
        phone,
        tier: lastTier,
        status: lastStatus,
      })
    }

    // Upsert companies and contacts
    for (const [companyName, contacts] of companyMap) {
      const firstContact = contacts[0]
      const company = await prisma.company.upsert({
        where: { name: companyName },
        update: {},
        create: {
          name: companyName,
          tier: firstContact.tier,
          statusSeen: firstContact.status,
        },
      })

      for (const c of contacts) {
        if (!c.email) continue
        try {
          await prisma.contact.upsert({
            where: { email: c.email },
            update: {},
            create: {
              companyId: company.id,
              name: c.name,
              email: c.email,
              phone: c.phone || null,
            },
          })
          imported++
        } catch {
          skipped++
        }
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      companies: companyMap.size,
    })
  } catch (err) {
    console.error('[Import] Error:', err)
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}

// DELETE — wipe all contacts, email logs, and companies for a fresh import
export async function DELETE(req: NextRequest) {
  const authError = await requireAuth(req)
  if (authError) return authError

  try {
    // Delete in dependency order (EmailLog → Contact → Company)
    const [logs, contacts, companies] = await Promise.all([
      prisma.emailLog.deleteMany({}),
      prisma.contact.deleteMany({}),
    ]).then(async ([logs, contacts]) => {
      const companies = await prisma.company.deleteMany({})
      return [logs, contacts, companies]
    })

    return NextResponse.json({
      success: true,
      deleted: { emailLogs: logs.count, contacts: contacts.count, companies: companies.count },
      message: `Cleared ${contacts.count} contacts from ${companies.count} companies`,
    })
  } catch (err) {
    console.error('[Import/DELETE] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
