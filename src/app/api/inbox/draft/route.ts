import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { regenerateDraft } from '@/lib/ai'

export async function POST(req: NextRequest) {
  const userIdOrRedirect = await getUserId(req)
  if (userIdOrRedirect instanceof NextResponse) return userIdOrRedirect
  const userId = userIdOrRedirect

  const { emailId, instructions } = await req.json()
  if (!emailId) return NextResponse.json({ error: 'emailId required' }, { status: 400 })

  // Verify the email belongs to this user's companies
  const email = await prisma.incomingEmail.findFirst({
    where: { id: emailId },
    include: { company: { select: { userId: true } } },
  })
  if (!email) return NextResponse.json({ error: 'Email not found' }, { status: 404 })
  if (email.company && email.company.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const draft = await regenerateDraft(emailId, userId, instructions || '')
  return NextResponse.json({ draft })
}
