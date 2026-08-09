import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/companies/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth(req)
  if (authError) return authError

  const { id } = await params
  const company = await prisma.company.findFirst({
    where: { id: parseInt(id) },
    include: {
      contacts: {
        include: {
          emailLogs: { orderBy: { sentAt: 'desc' } },
        },
      },
      incomingEmails: {
        orderBy: { receivedAt: 'desc' },
      },
    },
  })

  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(company)
}

// PATCH /api/companies/[id] — update stage
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth(req)
  if (authError) return authError

  const { id } = await params
  const body = await req.json()
  const { stage } = body

  const updated = await prisma.company.update({
    where: { id: parseInt(id) },
    data: { stage },
  })

  return NextResponse.json(updated)
}
