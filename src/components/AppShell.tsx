'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

const NAV = [
  { href: '/', icon: '⚡', label: 'Dashboard' },
  { href: '/companies', icon: '🏢', label: 'Companies' },
  { href: '/inbox', icon: '📬', label: 'Inbox', badgeKey: 'inboxNew' },
  { href: '/campaigns', icon: '🚀', label: 'Campaigns' },
  { href: '/settings', icon: '⚙️', label: 'Settings' },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [inboxCount, setInboxCount] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(d => {
        setInboxCount(d.inboxNew || 0)
        setPaused(d.sendingPaused || false)
      })
      .catch(() => {})
  }, [pathname])

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/login')
  }

  return (
    <div className="app-shell">
      {/* ── Mobile top header ── */}
      <header className="mobile-header">
        <span style={{ fontSize: 20 }}>📬</span>
        <span>InternReach</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, color: paused ? '#ef4444' : '#10b981', fontWeight: 600 }}>
          <span className={`pulse-dot ${paused ? 'red' : ''}`} style={{ width: 6, height: 6 }} />
          {paused ? 'Paused' : 'Live'}
        </span>
      </header>

      {/* ── Desktop sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span style={{ fontSize: 22 }}>📬</span>
          InternReach
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 8,
          background: paused ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.06)',
          borderRadius: 8, fontSize: 12, color: paused ? '#ef4444' : '#ffffff', fontWeight: 600 }}>
          <span className={`pulse-dot ${paused ? 'red' : ''}`} />
          {paused ? 'Paused' : 'Sending Active'}
        </div>

        <div className="nav-section">Navigation</div>
        {NAV.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link ${pathname === item.href ? 'active' : ''}`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
            {item.badgeKey === 'inboxNew' && inboxCount > 0 && (
              <span className="badge">{inboxCount}</span>
            )}
          </Link>
        ))}

        <div className="sidebar-footer">
          <button onClick={logout} className="nav-link" style={{ color: '#ef4444' }}>
            <span>🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav className="mobile-nav">
        <div className="mobile-nav-inner">
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-nav-link ${pathname === item.href ? 'active' : ''}`}
            >
              {item.badgeKey === 'inboxNew' && inboxCount > 0 && (
                <span className="mobile-badge">{inboxCount}</span>
              )}
              <span className="mobile-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
          <button onClick={logout} className="mobile-nav-link" style={{ color: '#ef4444' }}>
            <span className="mobile-nav-icon">🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
