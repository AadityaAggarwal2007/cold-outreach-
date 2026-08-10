import { NextRequest, NextResponse } from 'next/server'
import { processSendQueue } from '@/lib/cron'

// Called by Linux crontab every minute during send window
// crontab: */1 5 * * 1-5 curl -s -X POST http://localhost:3000/api/cron/send
// (5 UTC = 10:30 IST)
export async function POST(req: NextRequest) {
  // Only allow from localhost (system cron)
  const forwarded = req.headers.get('x-forwarded-for')
  const host = req.headers.get('host') || ''
  const isLocal = !forwarded || forwarded === '127.0.0.1' || host.includes('localhost')

  // Also allow with secret header for manual triggers from the UI
  const secret = req.headers.get('x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET || 'internreach-cron-2024'

  if (!isLocal && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await processSendQueue()
    return NextResponse.json({ success: true, time: new Date().toISOString() })
  } catch (err) {
    console.error('[API/cron/send]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// GET for easy browser/curl testing
export async function GET(req: NextRequest) {
  return POST(req)
}
