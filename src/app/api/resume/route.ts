import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { writeFile, unlink, stat } from 'fs/promises'
import path from 'path'

const RESUME_PATH = () => path.join(process.cwd(), 'public', 'resume.pdf')

// GET — check if resume exists on server
export async function GET(req: NextRequest) {
  const authError = await requireAuth(req)
  if (authError) return authError

  try {
    const s = await stat(RESUME_PATH())
    return NextResponse.json({ exists: true, sizeKb: Math.round(s.size / 1024), modifiedAt: s.mtime })
  } catch {
    return NextResponse.json({ exists: false })
  }
}

// POST — upload new resume
export async function POST(req: NextRequest) {
  const authError = await requireAuth(req)
  if (authError) return authError

  const formData = await req.formData()
  const resume = formData.get('resume') as File | null
  if (!resume) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const bytes = await resume.arrayBuffer()
  const buffer = Buffer.from(bytes)
  await writeFile(RESUME_PATH(), buffer)

  const s = await stat(RESUME_PATH())
  return NextResponse.json({ success: true, sizeKb: Math.round(s.size / 1024) })
}

// DELETE — remove resume from server
export async function DELETE(req: NextRequest) {
  const authError = await requireAuth(req)
  if (authError) return authError

  try {
    await unlink(RESUME_PATH())
    return NextResponse.json({ success: true, message: 'Resume deleted' })
  } catch {
    return NextResponse.json({ error: 'Resume not found' }, { status: 404 })
  }
}
