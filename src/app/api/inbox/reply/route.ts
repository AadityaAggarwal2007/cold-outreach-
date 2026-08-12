import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendReply } from '@/lib/mailer'

export async function POST(req: NextRequest) {
  const userIdOrRedirect = await getUserId(req)
  if (userIdOrRedirect instanceof NextResponse) return userIdOrRedirect
  const userId = userIdOrRedirect

  const { emailId, replyHtml } = await req.json()
  if (!emailId || !replyHtml) {
    return NextResponse.json({ error: 'emailId and replyHtml required' }, { status: 400 })
  }

  const incoming = await prisma.incomingEmail.findFirst({ where: { id: emailId } })
  if (!incoming) return NextResponse.json({ error: 'Email not found' }, { status: 404 })
  if (incoming.replied) return NextResponse.json({ error: 'Already replied' }, { status: 400 })

  const success = await sendReply({
    to: incoming.fromEmail,
    toName: incoming.fromName || incoming.fromEmail,
    subject: incoming.subject,
    html: replyHtml,
    inReplyTo: incoming.messageId || undefined,
  }, userId)

  if (!success) {
    return NextResponse.json({ error: 'Failed to send reply' }, { status: 500 })
  }

  await prisma.incomingEmail.update({
    where: { id: emailId },
    data: {
      replied: true,
      repliedAt: new Date(),
      aiStatus: 'replied',
    },
  })

  return NextResponse.json({ success: true })
}
