import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { resetTransporter } from '@/lib/mailer'

export async function GET(req: NextRequest) {
  const userIdOrRedirect = await getUserId(req)
  if (userIdOrRedirect instanceof NextResponse) return userIdOrRedirect
  const userId = userIdOrRedirect

  const settings = await prisma.settings.findUnique({ where: { userId } })
  if (settings) return NextResponse.json({ ...settings, gmailAppPass: '••••••••' })
  return NextResponse.json({ error: 'No settings' }, { status: 404 })
}

export async function PATCH(req: NextRequest) {
  const userIdOrRedirect = await getUserId(req)
  if (userIdOrRedirect instanceof NextResponse) return userIdOrRedirect
  const userId = userIdOrRedirect

  const body = await req.json()
  const {
    gmailUser, gmailAppPass, dailyLimit, pixelBaseUrl,
    aiBaseUrl, aiModel, sendingPaused, followUpDays,
    sendWindowStart, sendWindowEnd, linkedinUrl, systemPrompt,
    followUpLimit,
  } = body

  const data: Record<string, unknown> = {}
  if (gmailUser !== undefined) data.gmailUser = gmailUser
  if (gmailAppPass !== undefined && gmailAppPass !== '••••••••') {
    data.gmailAppPass = gmailAppPass
    resetTransporter(userId)
  }
  if (dailyLimit !== undefined) data.dailyLimit = parseInt(dailyLimit)
  if (pixelBaseUrl !== undefined) data.pixelBaseUrl = pixelBaseUrl
  if (aiBaseUrl !== undefined) data.aiBaseUrl = aiBaseUrl
  if (aiModel !== undefined) data.aiModel = aiModel
  if (sendingPaused !== undefined) data.sendingPaused = sendingPaused
  if (followUpDays !== undefined) data.followUpDays = followUpDays
  if (sendWindowStart !== undefined) data.sendWindowStart = sendWindowStart
  if (sendWindowEnd !== undefined) data.sendWindowEnd = sendWindowEnd
  if (linkedinUrl !== undefined) data.linkedinUrl = linkedinUrl
  if (systemPrompt !== undefined) data.systemPrompt = systemPrompt
  if (followUpLimit !== undefined) data.followUpLimit = parseInt(followUpLimit)

  const updated = await prisma.settings.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data } as Parameters<typeof prisma.settings.create>[0]['data'],
  })

  return NextResponse.json({ ...updated, gmailAppPass: '••••••••' })
}
