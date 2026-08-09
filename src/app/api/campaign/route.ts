import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Toggle pause/resume sending
export async function POST(req: NextRequest) {
  const authError = await requireAuth(req)
  if (authError) return authError

  const { action } = await req.json() // "pause" | "resume" | "reset-daily"

  if (action === 'pause') {
    await prisma.settings.update({ where: { id: 1 }, data: { sendingPaused: true } })
    return NextResponse.json({ success: true, paused: true })
  }

  if (action === 'resume') {
    await prisma.settings.update({ where: { id: 1 }, data: { sendingPaused: false } })
    return NextResponse.json({ success: true, paused: false })
  }

  if (action === 'reset-daily') {
    const today = new Date().toISOString().split('T')[0]
    await prisma.settings.update({
      where: { id: 1 },
      data: { sentToday: 0, lastResetDate: today },
    })
    return NextResponse.json({ success: true, reset: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// GET campaign queue stats
export async function GET(req: NextRequest) {
  const authError = await requireAuth(req)
  if (authError) return authError

  const settings = await prisma.settings.findFirst({ where: { id: 1 } })

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
    prisma.company.count(),
    prisma.contact.count(),
    prisma.contact.count({ where: { status: 'pending' } }),
    prisma.contact.count({ where: { status: 'sent' } }),
    prisma.contact.count({ where: { status: 'stopped' } }),
    prisma.contact.count({ where: { status: 'bounced' } }),
    prisma.emailLog.count({ where: { openedAt: { not: null } } }),
    prisma.company.count({ where: { repliedAt: { not: null } } }),
    prisma.contact.count({
      where: { status: 'sent', followUpCount: { lt: 6 }, company: { repliedAt: null } },
    }),
  ])

  return NextResponse.json({
    settings,
    totalCompanies,
    totalContacts,
    pendingInitial,
    sentContacts,
    stoppedContacts,
    bouncedContacts,
    openedContacts,
    repliedCompanies,
    pendingFollowUps,
  })
}
