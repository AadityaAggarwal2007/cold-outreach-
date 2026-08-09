import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { syncInbox } from '@/lib/imap'

export async function POST(req: NextRequest) {
  const authError = await requireAuth(req)
  if (authError) return authError

  const count = await syncInbox()
  return NextResponse.json({ success: true, newEmails: count })
}
