import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET all templates
export async function GET(req: NextRequest) {
  const authError = await requireAuth(req)
  if (authError) return authError
  const templates = await prisma.template.findMany({ orderBy: { type: 'asc' } })
  return NextResponse.json(templates)
}

// POST create or upsert template
export async function POST(req: NextRequest) {
  const authError = await requireAuth(req)
  if (authError) return authError

  const { name, type, subject, htmlBody } = await req.json()
  if (!type || !subject || !htmlBody) {
    return NextResponse.json({ error: 'type, subject, htmlBody required' }, { status: 400 })
  }

  const template = await prisma.template.upsert({
    where: { type },
    update: { name, subject, htmlBody },
    create: { name: name || type, type, subject, htmlBody },
  })

  return NextResponse.json(template)
}
