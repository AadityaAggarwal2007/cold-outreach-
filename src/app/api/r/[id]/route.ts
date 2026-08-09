import { NextRequest, NextResponse } from 'next/server'

// 1x1 transparent GIF bytes
const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  // Fire-and-forget — don't await DB write so the response is instant
  recordOpen(id).catch(() => {})

  return new NextResponse(PIXEL_GIF, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': PIXEL_GIF.length.toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}

async function recordOpen(pixelId: string) {
  // Dynamic import to avoid edge runtime issues
  const { prisma } = await import('@/lib/db')
  
  const log = await prisma.emailLog.findFirst({ where: { pixelId } })
  if (!log) return

  await prisma.emailLog.update({
    where: { id: log.id },
    data: {
      openedAt: log.openedAt || new Date(),
      openCount: { increment: 1 },
      status: 'opened',
    },
  })
}
