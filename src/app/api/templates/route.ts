import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const userIdOrRedirect = await getUserId(req)
  if (userIdOrRedirect instanceof NextResponse) return userIdOrRedirect
  const userId = userIdOrRedirect

  const templates = await prisma.template.findMany({ where: { userId }, orderBy: { type: 'asc' } })
  return NextResponse.json(templates)
}

export async function POST(req: NextRequest) {
  const userIdOrRedirect = await getUserId(req)
  if (userIdOrRedirect instanceof NextResponse) return userIdOrRedirect
  const userId = userIdOrRedirect

  const { name, type, subject, htmlBody } = await req.json()
  if (!type || !subject || !htmlBody) {
    return NextResponse.json({ error: 'type, subject, htmlBody required' }, { status: 400 })
  }

  const template = await prisma.template.upsert({
    where: { userId_type: { userId, type } },
    update: { name, subject, htmlBody },
    create: { userId, name: name || type, type, subject, htmlBody },
  })

  return NextResponse.json(template)
}
