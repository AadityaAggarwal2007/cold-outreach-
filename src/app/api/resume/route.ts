import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { writeFile } from 'fs/promises'
import path from 'path'

export async function POST(req: NextRequest) {
  const authError = await requireAuth(req)
  if (authError) return authError

  const formData = await req.formData()
  const resume = formData.get('resume') as File | null
  if (!resume) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const bytes = await resume.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const dest = path.join(process.cwd(), 'public', 'resume.pdf')
  await writeFile(dest, buffer)

  return NextResponse.json({ success: true })
}
