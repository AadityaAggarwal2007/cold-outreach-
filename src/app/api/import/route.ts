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

    for (const row of rows) {
      const companyName = (row['Company'] || '').trim()
      const contactName = (row['Contact Name'] || '').trim()
      const email = (row['Email'] || '').trim().toLowerCase()
      const phone = (row['Phone Number'] || '').toString().trim()
      const tier = (row['Priority Tier'] || '').trim()
      const statusSeen = (row['Status(es) Seen'] || '').trim()

      if (!companyName || !email) continue

      if (!companyMap.has(companyName)) {
        companyMap.set(companyName, [])
      }
      companyMap.get(companyName)!.push({
        name: contactName || email.split('@')[0],
        email,
        phone,
        tier,
        status: statusSeen,
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
