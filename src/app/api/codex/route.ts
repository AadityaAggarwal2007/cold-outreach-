import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// POST — run openai-oauth login and return the auth URL/code
export async function POST(req: NextRequest) {
  const authError = await requireAuth(req)
  if (authError) return authError

  try {
    // Run login with no-browser flag — captures the URL to paste manually
    const { stdout, stderr } = await execAsync(
      'npx openai-oauth@latest login --no-browser 2>&1 || npx openai-oauth@latest login 2>&1',
      { timeout: 15000 }
    )

    const output = stdout + stderr

    // Extract URL from output (openai-oauth prints a URL to visit)
    const urlMatch = output.match(/https?:\/\/[^\s\n]+/g)
    const codeMatch = output.match(/code[:\s]+([A-Z0-9-]+)/i)

    return NextResponse.json({
      success: true,
      output: output.substring(0, 2000),
      authUrl: urlMatch?.[0] || null,
      code: codeMatch?.[1] || null,
    })
  } catch (err: unknown) {
    const error = err as { message?: string; stdout?: string; stderr?: string }
    const output = (error.stdout || '') + (error.stderr || '') + (error.message || '')
    const urlMatch = output.match(/https?:\/\/[^\s\n]+/g)

    return NextResponse.json({
      success: !!urlMatch,
      output: output.substring(0, 2000),
      authUrl: urlMatch?.[0] || null,
      code: null,
    })
  }
}

// GET — check if Codex gateway is running and authenticated
export async function GET(req: NextRequest) {
  const authError = await requireAuth(req)
  if (authError) return authError

  try {
    const { stdout } = await execAsync(
      'curl -s --max-time 3 http://localhost:10531/v1/models',
      { timeout: 5000 }
    )
    const data = JSON.parse(stdout)
    return NextResponse.json({
      running: true,
      models: data?.data?.map((m: { id: string }) => m.id) || [],
    })
  } catch {
    return NextResponse.json({ running: false, models: [] })
  }
}
