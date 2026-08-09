'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import Link from 'next/link'

interface Stats {
  totalContacts: number
  totalCompanies: number
  sentToday: number
  dailyLimit: number
  sendingPaused: boolean
  totalSent: number
  totalOpened: number
  openRate: number
  totalReplied: number
  replyRate: number
  pendingFollowUps: number
  inboxNew: number
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
    const t = setInterval(loadStats, 30_000)
    return () => clearInterval(t)
  }, [])

  async function loadStats() {
    try {
      const r = await fetch('/api/stats')
      setStats(await r.json())
    } catch {}
    setLoading(false)
  }

  async function togglePause() {
    if (!stats) return
    const action = stats.sendingPaused ? 'resume' : 'pause'
    await fetch('/api/campaign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
    loadStats()
  }

  const progress = stats ? Math.min(100, Math.round((stats.sentToday / stats.dailyLimit) * 100)) : 0

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">Live overview of your outreach campaign</div>
        </div>
        <div className="flex gap-2">
          <button onClick={togglePause} className={`btn btn-sm ${stats?.sendingPaused ? 'btn-success' : 'btn-ghost'}`}>
            {stats?.sendingPaused ? '▶ Resume Sending' : '⏸ Pause'}
          </button>
          <Link href="/campaigns" className="btn btn-primary btn-sm">🚀 Campaign</Link>
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Loading stats...</div>
        ) : (
          <>
            {/* Daily Progress */}
            <div className="card mb-4">
              <div className="card-header">
                <span className="card-title">Today's Send Progress</span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {stats?.sentToday} / {stats?.dailyLimit} emails
                </span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex justify-between mt-4 text-sm text-muted" style={{ marginTop: 10 }}>
                <span>{progress}% of daily limit used</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className={`pulse-dot ${stats?.sendingPaused ? 'red' : ''}`} />
                  {stats?.sendingPaused ? 'Paused' : 'Sending every ~60s'}
                </span>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="stats-grid">
              <div className="stat-card primary">
                <div className="stat-label">Total Contacts</div>
                <div className="stat-value">{stats?.totalContacts?.toLocaleString()}</div>
                <div className="stat-sub">{stats?.totalCompanies} companies</div>
              </div>
              <div className="stat-card blue">
                <div className="stat-label">Emails Sent</div>
                <div className="stat-value">{stats?.totalSent?.toLocaleString()}</div>
                <div className="stat-sub">{stats?.sentToday} today</div>
              </div>
              <div className="stat-card yellow">
                <div className="stat-label">Open Rate</div>
                <div className="stat-value">{stats?.openRate}%</div>
                <div className="stat-sub">{stats?.totalOpened} opened</div>
              </div>
              <div className="stat-card green">
                <div className="stat-label">Replies</div>
                <div className="stat-value">{stats?.totalReplied}</div>
                <div className="stat-sub">{stats?.replyRate}% reply rate</div>
              </div>
              <div className="stat-card purple">
                <div className="stat-label">Follow-up Queue</div>
                <div className="stat-value">{stats?.pendingFollowUps?.toLocaleString()}</div>
                <div className="stat-sub">Pending follow-ups</div>
              </div>
              <div className="stat-card red">
                <div className="stat-label">New Inbox</div>
                <div className="stat-value">{stats?.inboxNew}</div>
                <div className="stat-sub">Awaiting your reply</div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid-2">
              <div className="card">
                <div className="card-header">
                  <span className="card-title">🚀 Quick Actions</span>
                </div>
                <div className="flex flex-col gap-2">
                  <Link href="/companies" className="btn btn-ghost">🏢 View All Companies</Link>
                  <Link href="/inbox" className="btn btn-ghost">📬 Check Inbox {stats?.inboxNew ? `(${stats.inboxNew} new)` : ''}</Link>
                  <Link href="/campaigns" className="btn btn-ghost">📄 Manage Templates</Link>
                  <Link href="/campaigns" className="btn btn-ghost">📊 Import Contacts</Link>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <span className="card-title">📊 Campaign Health</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    { label: 'Emails Sent', value: stats?.totalSent || 0, max: stats?.totalContacts || 1, color: 'var(--blue)' },
                    { label: 'Opens Tracked', value: stats?.totalOpened || 0, max: stats?.totalSent || 1, color: 'var(--yellow)' },
                    { label: 'Replies Received', value: stats?.totalReplied || 0, max: stats?.totalCompanies || 1, color: 'var(--green)' },
                  ].map(item => (
                    <div key={item.label}>
                      <div className="flex justify-between text-sm" style={{ marginBottom: 6, fontSize: 12.5 }}>
                        <span style={{ color: 'var(--text-dim)' }}>{item.label}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{item.value} / {item.max}</span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${Math.min(100, Math.round((item.value / item.max) * 100))}%`, background: item.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
