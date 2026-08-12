import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-change-this-in-production'
)
export const COOKIE_NAME = 'ir_session'

export interface SessionPayload {
  userId: number
  username: string
}

export async function createSession(userId: number, username: string): Promise<string> {
  return await new SignJWT({ userId, username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET)
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    if (typeof payload.userId === 'number' && typeof payload.username === 'string') {
      return { userId: payload.userId, username: payload.username }
    }
    return null
  } catch {
    return null
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function getSessionFromRequest(req: NextRequest): string | null {
  return req.cookies.get(COOKIE_NAME)?.value || null
}

export async function getSessionPayload(req: NextRequest): Promise<SessionPayload | null> {
  const token = getSessionFromRequest(req)
  if (!token) return null
  return verifySession(token)
}

// Returns null if auth passed, or a redirect response if not
export async function requireAuth(req: NextRequest): Promise<NextResponse | null> {
  const token = getSessionFromRequest(req)
  if (!token) return NextResponse.redirect(new URL('/login', req.url))
  const session = await verifySession(token)
  if (!session) return NextResponse.redirect(new URL('/login', req.url))
  return null
}

// Returns userId or redirects
export async function getUserId(req: NextRequest): Promise<number | NextResponse> {
  // Middleware injects x-user-id header for performance
  const headerUserId = req.headers.get('x-user-id')
  if (headerUserId) return parseInt(headerUserId)

  const token = getSessionFromRequest(req)
  if (!token) return NextResponse.redirect(new URL('/login', req.url))
  const session = await verifySession(token)
  if (!session) return NextResponse.redirect(new URL('/login', req.url))
  return session.userId
}
