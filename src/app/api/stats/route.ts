import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const userIdOrRedirect = await getUserId(req)
  if (userIdOrRedirect instanceof NextResponse) return userIdOrRedirect
  const userId = userIdOrRedirect

  const today = new Date().toISOString().split('T')[0]

  const userCompanyIds = (await prisma.company.findMany({
    where: { userId },
    select: { id: true },
  })).map(c => c.id)

  const [
    totalContacts,
    totalCompanies,
    settings,
    totalSent,
    totalOpened,
    totalReplied,
    pendingFollowUps,
    inboxNew,
  ] = await Promise.all([
    prisma.contact.count({ where: { companyId: { in: userCompanyIds } } }),
    prisma.company.count({ where: { userId } }),
    prisma.settings.findUnique({ where: { userId } }),
    prisma.emailLog.count({ where: { contact: { companyId: { in: userCompanyIds } } } }),
    prisma.emailLog.count({ where: { openCount: { gt: 0 }, contact: { companyId: { in: userCompanyIds } } } }),
    prisma.company.count({ where: { userId, repliedAt: { not: null } } }),
    prisma.contact.count({
      where: {
        companyId: { in: userCompanyIds },
        status: 'sent',
        followUpCount: { lt: 6 },
        company: { repliedAt: null },
      },
    }),
    prisma.incomingEmail.count({
      where: {
        companyId: { in: userCompanyIds },
        aiStatus: { in: ['new', 'draft_ready'] },
      },
    }),
  ])

  const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0
  const replyRate = totalCompanies > 0 ? Math.round((totalReplied / totalCompanies) * 100) : 0

  return NextResponse.json({
    totalContacts,
    totalCompanies,
    sentToday: settings?.sentToday || 0,
    dailyLimit: settings?.dailyLimit || 499,
    sendingPaused: settings?.sendingPaused || false,
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
