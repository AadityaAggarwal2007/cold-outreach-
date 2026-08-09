import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const authError = await requireAuth(req)
  if (authError) return authError

  const today = new Date().toISOString().split('T')[0]

  const [
    totalContacts,
    totalCompanies,
    sentToday,
    totalSent,
    totalOpened,
    totalReplied,
    pendingFollowUps,
    inboxNew,
    settings,
  ] = await Promise.all([
    prisma.contact.count(),
    prisma.company.count(),
    prisma.settings.findFirst({ where: { id: 1 }, select: { sentToday: true, dailyLimit: true, sendingPaused: true } }),
    prisma.emailLog.count(),
    prisma.emailLog.count({ where: { openCount: { gt: 0 } } }),
    prisma.company.count({ where: { repliedAt: { not: null } } }),
    prisma.contact.count({
      where: {
        status: 'sent',
        followUpCount: { lt: 6 },
        company: { repliedAt: null },
      },
    }),
    prisma.incomingEmail.count({ where: { aiStatus: { in: ['new', 'draft_ready'] } } }),
    prisma.settings.findFirst({ where: { id: 1 } }),
  ])

  const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0
  const replyRate = totalCompanies > 0 ? Math.round((totalReplied / totalCompanies) * 100) : 0

  return NextResponse.json({
    totalContacts,
    totalCompanies,
    sentToday: sentToday?.sentToday || 0,
    dailyLimit: sentToday?.dailyLimit || 900,
    sendingPaused: sentToday?.sendingPaused || false,
    totalSent,
    totalOpened,
    openRate,
    totalReplied,
    replyRate,
    pendingFollowUps,
    inboxNew,
    date: today,
  })
}
