import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { startCron } from '@/lib/cron'
import { ensureSettings } from '@/lib/db'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'InternReach CRM',
  description: 'AI-powered internship outreach system',
}

// Start background cron on server boot (only once)
if (typeof window === 'undefined') {
  ensureSettings().then(() => startCron()).catch(console.error)
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-gray-950 text-white min-h-screen">{children}</body>
    </html>
  )
}
