import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { regenerateDraft } from '@/lib/ai'

// POST — regenerate AI draft for an incoming email
export async function POST(req: NextRequest) {
  const authError = await requireAuth(req)
  if (authError) return authError

  const { emailId } = await req.json()
  if (!emailId) return NextResponse.json({ error: 'emailId required' }, { status: 400 })

  const draft = await regenerateDraft(emailId)
  return NextResponse.json({ draft })
}
