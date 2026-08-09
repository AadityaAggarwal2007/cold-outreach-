import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { resetTransporter } from '@/lib/mailer'

export async function GET(req: NextRequest) {
  const authError = await requireAuth(req)
  if (authError) return authError
  const settings = await prisma.settings.findFirst({ where: { id: 1 } })
  // Never expose password in response
  if (settings) {
    return NextResponse.json({ ...settings, gmailAppPass: '••••••••' })
  }
  return NextResponse.json({ error: 'No settings' }, { status: 404 })
}

export async function PATCH(req: NextRequest) {
  const authError = await requireAuth(req)
  if (authError) return authError

  const body = await req.json()
  const {
    gmailUser, gmailAppPass, dailyLimit, pixelBaseUrl,
    aiBaseUrl, aiModel, sendingPaused, followUpDays,
    sendWindowStart, sendWindowEnd,
  } = body

  const data: Record<string, unknown> = {}
  if (gmailUser !== undefined) data.gmailUser = gmailUser
  if (gmailAppPass !== undefined && gmailAppPass !== '••••••••') {
    data.gmailAppPass = gmailAppPass
    resetTransporter()
  }
  if (dailyLimit !== undefined) data.dailyLimit = parseInt(dailyLimit)
  if (pixelBaseUrl !== undefined) data.pixelBaseUrl = pixelBaseUrl
  if (aiBaseUrl !== undefined) data.aiBaseUrl = aiBaseUrl
  if (aiModel !== undefined) data.aiModel = aiModel
  if (sendingPaused !== undefined) data.sendingPaused = sendingPaused
  if (followUpDays !== undefined) data.followUpDays = followUpDays
  if (sendWindowStart !== undefined) data.sendWindowStart = sendWindowStart
  if (sendWindowEnd !== undefined) data.sendWindowEnd = sendWindowEnd


  const updated = await prisma.settings.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data } as Parameters<typeof prisma.settings.create>[0]['data'],
  })

  return NextResponse.json({ ...updated, gmailAppPass: '••••••••' })
}
