import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { syncInbox } from '@/lib/imap'

// GET inbox emails
export async function GET(req: NextRequest) {
  const authError = await requireAuth(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || ''
  const companyId = searchParams.get('companyId')

  const where: Record<string, unknown> = {}
  if (status) where.aiStatus = status
  if (companyId) where.companyId = parseInt(companyId)
  // Only show internship-related or unclassified
  where.aiStatus = { notIn: ['irrelevant'] }

  const emails = await prisma.incomingEmail.findMany({
    where,
    include: {
      company: { select: { id: true, name: true } },
    },
    orderBy: { receivedAt: 'desc' },
    take: 200,
  })

  return NextResponse.json(emails)
}
