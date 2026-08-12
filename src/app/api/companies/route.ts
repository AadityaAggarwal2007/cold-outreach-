import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const userIdOrRedirect = await getUserId(req)
  if (userIdOrRedirect instanceof NextResponse) return userIdOrRedirect
  const userId = userIdOrRedirect

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const search = searchParams.get('search') || ''
  const stage = searchParams.get('stage') || ''
  const tier = searchParams.get('tier') || ''

  const where: Record<string, unknown> = { userId, name: { not: '_InternReach Test_' } }
  if (search) where.name = { contains: search }
  if (stage) where.stage = stage
  if (tier) where.tier = { contains: tier }
  if (searchParams.get('opened') === 'true') {
    where.contacts = { some: { emailLogs: { some: { openedAt: { not: null } } } } }
  }

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      include: {
        contacts: {
          select: {
            id: true, name: true, email: true, status: true,
            followUpCount: true, lastSentAt: true,
            emailLogs: {
              orderBy: { sentAt: 'desc' }, take: 10,
              select: { id: true, type: true, subject: true, sentAt: true, openedAt: true, openCount: true, status: true },
            },
          },
        },
        incomingEmails: {
          orderBy: { receivedAt: 'desc' }, take: 5,
          select: { id: true, fromEmail: true, fromName: true, subject: true, receivedAt: true, aiStatus: true, replied: true },
        },
        _count: { select: { contacts: true, incomingEmails: true } },
      },
      orderBy: [{ repliedAt: 'desc' }, { createdAt: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.company.count({ where }),
  ])

  return NextResponse.json({ companies, total, page, limit })
}
