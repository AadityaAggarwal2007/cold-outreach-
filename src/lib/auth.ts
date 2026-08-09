import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-change-this-in-production'
)
const COOKIE_NAME = 'ir_session'
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'changeme123'

export async function createSession(): Promise<string> {
  return await new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET)
}

export async function verifySession(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, JWT_SECRET)
    return true
  } catch {
    return false
  }
}

export async function verifyPassword(input: string): Promise<boolean> {
  // Direct compare (password stored in env, not hashed DB)
  return input === DASHBOARD_PASSWORD
}

export function getSessionFromRequest(req: NextRequest): string | null {
  return req.cookies.get(COOKIE_NAME)?.value || null
}

export async function requireAuth(req: NextRequest): Promise<NextResponse | null> {
  const token = getSessionFromRequest(req)
  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  const valid = await verifySession(token)
  if (!valid) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return null // means auth passed
}

export { COOKIE_NAME }
