import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userIdOrRedirect = await getUserId(req)
  if (userIdOrRedirect instanceof NextResponse) return userIdOrRedirect
  const userId = userIdOrRedirect

  const { id } = await params
  const company = await prisma.company.findFirst({
    where: { id: parseInt(id), userId },
    include: {
      contacts: { include: { emailLogs: { orderBy: { sentAt: 'desc' } } } },
      incomingEmails: { orderBy: { receivedAt: 'desc' } },
    },
  })

  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(company)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userIdOrRedirect = await getUserId(req)
  if (userIdOrRedirect instanceof NextResponse) return userIdOrRedirect
  const userId = userIdOrRedirect

  const { id } = await params
  const { stage } = await req.json()

  const updated = await prisma.company.update({
    where: { id: parseInt(id), userId },
    data: { stage },
  })

  return NextResponse.json(updated)
}
