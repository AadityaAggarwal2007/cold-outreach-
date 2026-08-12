import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const userIdOrRedirect = await getUserId(req)
  if (userIdOrRedirect instanceof NextResponse) return userIdOrRedirect
  const userId = userIdOrRedirect

  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('companyId')

  const userCompanyIds = (await prisma.company.findMany({
    where: { userId },
    select: { id: true },
  })).map(c => c.id)

  const where: Record<string, unknown> = {
    companyId: { in: userCompanyIds },
    aiStatus: { notIn: ['irrelevant'] },
  }
  if (companyId) where.companyId = parseInt(companyId)

  const emails = await prisma.incomingEmail.findMany({
    where,
    include: { company: { select: { id: true, name: true } } },
    orderBy: { receivedAt: 'desc' },
    take: 200,
  })

  return NextResponse.json(emails)
}
