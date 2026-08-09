'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        router.push('/')
      } else {
        setError('Invalid password. Try again.')
      }
    } catch {
      setError('Connection error.')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at center, #0f172a 0%, #030712 70%)',
    }}>
      <div style={{ width: '100%', maxWidth: 380, padding: 20 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 56, height: 56, background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 16, marginBottom: 16, fontSize: 24,
            boxShadow: '0 0 40px rgba(255,255,255,0.08)',
          }}>📬</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#ffffff' }}>
            InternReach
          </h1>
          <p style={{ color: '#64748b', marginTop: 6, fontSize: 13.5 }}>Your AI outreach command centre</p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{
            background: '#0f172a', border: '1px solid #1e293b',
            borderRadius: 16, padding: 28,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <div className="form-group">
              <label className="form-label">Dashboard Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoFocus
                required
              />
            </div>

            {error && (
              <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 16, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary w-full" disabled={loading}
              style={{ justifyContent: 'center', width: '100%' }}>
              {loading ? 'Signing in...' : '→ Sign In'}
            </button>
          </div>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: '#334155' }}>
          InternReach CRM • Secured
        </p>
      </div>
    </div>
  )
}
