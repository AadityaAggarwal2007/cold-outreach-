import { NextRequest, NextResponse } from 'next/server'
import { verifySession, COOKIE_NAME } from './src/lib/auth'

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/r', '/r', '/api/cron']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next()
  }

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return NextResponse.redirect(new URL('/login', req.url))

  const session = await verifySession(token)
  if (!session) return NextResponse.redirect(new URL('/login', req.url))

  // Inject userId into request headers so API routes don't re-verify JWT
  const response = NextResponse.next()
  response.headers.set('x-user-id', String(session.userId))
  response.headers.set('x-username', session.username)
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
