import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth'
import { writeFile, unlink, stat } from 'fs/promises'
import path from 'path'

const resumePath = (userId: number) =>
  path.join(process.cwd(), 'public', `resume-${userId}.pdf`)

export async function GET(req: NextRequest) {
  const userIdOrRedirect = await getUserId(req)
  if (userIdOrRedirect instanceof NextResponse) return userIdOrRedirect
  const userId = userIdOrRedirect

  try {
    const s = await stat(resumePath(userId))
    return NextResponse.json({ exists: true, sizeKb: Math.round(s.size / 1024), modifiedAt: s.mtime })
  } catch {
    return NextResponse.json({ exists: false })
  }
}

export async function POST(req: NextRequest) {
  const userIdOrRedirect = await getUserId(req)
  if (userIdOrRedirect instanceof NextResponse) return userIdOrRedirect
  const userId = userIdOrRedirect

  const formData = await req.formData()
  const resume = formData.get('resume') as File | null
  if (!resume) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const bytes = await resume.arrayBuffer()
  const buffer = Buffer.from(bytes)
  await writeFile(resumePath(userId), buffer)

  const s = await stat(resumePath(userId))
  return NextResponse.json({ success: true, sizeKb: Math.round(s.size / 1024) })
}

export async function DELETE(req: NextRequest) {
  const userIdOrRedirect = await getUserId(req)
  if (userIdOrRedirect instanceof NextResponse) return userIdOrRedirect
  const userId = userIdOrRedirect

  try {
    await unlink(resumePath(userId))
    return NextResponse.json({ success: true, message: 'Resume deleted' })
  } catch {
    return NextResponse.json({ error: 'Resume not found' }, { status: 404 })
  }
}
