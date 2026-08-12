import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  const userIdOrRedirect = await getUserId(req)
  if (userIdOrRedirect instanceof NextResponse) return userIdOrRedirect
  const userId = userIdOrRedirect

  const { action } = await req.json()

  if (action === 'pause') {
    await prisma.settings.upsert({
      where: { userId },
      update: { sendingPaused: true },
      create: { userId, sendingPaused: true },
    })
    return NextResponse.json({ success: true, paused: true })
  }

  if (action === 'resume') {
    await prisma.settings.upsert({
      where: { userId },
      update: { sendingPaused: false },
      create: { userId, sendingPaused: false },
    })
    return NextResponse.json({ success: true, paused: false })
  }

  if (action === 'reset-daily') {
    const today = new Date().toISOString().split('T')[0]
    await prisma.settings.upsert({
      where: { userId },
      update: { sentToday: 0, lastResetDate: today },
      create: { userId, sentToday: 0, lastResetDate: today },
    })
    return NextResponse.json({ success: true, reset: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function GET(req: NextRequest) {
  const userIdOrRedirect = await getUserId(req)
  if (userIdOrRedirect instanceof NextResponse) return userIdOrRedirect
  const userId = userIdOrRedirect

  const settings = await prisma.settings.findUnique({ where: { userId } })

  const NOT_TEST = { name: { not: '_InternReach Test_' }, userId }
  const NOT_TEST_CONTACT = { company: NOT_TEST }

  const [
    totalCompanies,
    totalContacts,
    pendingInitial,
    sentContacts,
    stoppedContacts,
    bouncedContacts,
    openedContacts,
    repliedCompanies,
    pendingFollowUps,
  ] = await Promise.all([
    prisma.company.count({ where: NOT_TEST }),
    prisma.contact.count({ where: NOT_TEST_CONTACT }),
    prisma.contact.count({ where: { status: 'pending', ...NOT_TEST_CONTACT } }),
    prisma.contact.count({ where: { status: 'sent',    ...NOT_TEST_CONTACT } }),
    prisma.contact.count({ where: { status: 'stopped', ...NOT_TEST_CONTACT } }),
    prisma.contact.count({ where: { status: 'bounced', ...NOT_TEST_CONTACT } }),
    prisma.emailLog.count({ where: { openedAt: { not: null }, contact: NOT_TEST_CONTACT } }),
    prisma.company.count({ where: { repliedAt: { not: null }, ...NOT_TEST } }),
    prisma.contact.count({
      where: { status: 'sent', followUpCount: { lt: 6 }, company: { repliedAt: null, ...NOT_TEST } },
    }),
  ])

  return NextResponse.json({
    settings,
    totalCompanies, totalContacts, pendingInitial,
    sentContacts, stoppedContacts, bouncedContacts,
    openedContacts, repliedCompanies, pendingFollowUps,
  })
}
