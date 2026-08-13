import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth'
import { deleteBouncedFromGmail } from '@/lib/imap'

export async function POST(req: NextRequest) {
  const userIdOrRedirect = await getUserId(req)
  if (userIdOrRedirect instanceof NextResponse) return userIdOrRedirect
  const userId = userIdOrRedirect

  const deleted = await deleteBouncedFromGmail(userId)
  return NextResponse.json({ success: true, deleted })
}
