'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'

// ─── Codex Status & Login Component ───────────────────────────────────────────
function CodexStatus() {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const [models, setModels] = useState<string[]>([])
  const [logging, setLogging] = useState(false)
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const [loginOutput, setLoginOutput] = useState<string | null>(null)

  async function checkStatus() {
    setStatus('checking')
    try {
      const r = await fetch('/api/codex')
      const d = await r.json()
      setStatus(d.running ? 'online' : 'offline')
      setModels(d.models || [])
    } catch {
      setStatus('offline')
    }
  }

  async function loginWithCodex() {
    setLogging(true)
    setAuthUrl(null)
    setLoginOutput(null)
    try {
      const r = await fetch('/api/codex', { method: 'POST' })
      const d = await r.json()
      setLoginOutput(d.output || '')
      if (d.authUrl) setAuthUrl(d.authUrl)
      // Re-check status after login attempt
      setTimeout(checkStatus, 3000)
    } catch {
      setLoginOutput('Error reaching server. Is Codex gateway running?')
    }
    setLogging(false)
  }

  useEffect(() => { checkStatus() }, [])

  return (
    <div style={{
      padding: '14px 16px', borderRadius: 10,
      background: status === 'online' ? 'rgba(16,185,129,0.08)' : status === 'offline' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${status === 'online' ? 'rgba(16,185,129,0.25)' : status === 'offline' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)'}`,
      marginBottom: 0,
    }}>
      <div className="flex justify-between items-center">
        <div className="flex gap-2 items-center">
          <span className={`pulse-dot ${status === 'online' ? '' : status === 'offline' ? 'red' : 'yellow'}`} />
          <span style={{ fontWeight: 700, fontSize: 13.5, color: status === 'online' ? 'var(--green)' : status === 'offline' ? 'var(--red)' : 'var(--yellow)' }}>
            {status === 'online' ? `Gateway Online` : status === 'offline' ? 'Gateway Offline' : 'Checking...'}
          </span>
          {status === 'online' && models[0] && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-700)', padding: '2px 8px', borderRadius: 20 }}>
              {models[0]}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={checkStatus}>↻ Refresh</button>
          <button className="btn btn-sm" onClick={loginWithCodex} disabled={logging}
            style={{ background: '#fff', color: '#0a0f1e', fontWeight: 700 }}>
            {logging ? '⏳ Connecting...' : '🔑 Login with ChatGPT'}
          </button>
        </div>
      </div>

      {status === 'offline' && !logging && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          Gateway not running. On your VPS: <code style={{ color: 'var(--text-dim)' }}>npx openai-oauth@latest --detach --port 10531</code>
        </div>
      )}

      {/* Auth URL Modal */}
      {authUrl && (
        <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--bg-700)', borderRadius: 8, border: '1px solid var(--border-light)' }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>✅ Open this URL in your browser to log in:</div>
          <a href={authUrl} target="_blank" rel="noreferrer"
            style={{ color: '#fff', fontSize: 12.5, wordBreak: 'break-all', textDecoration: 'underline' }}>
            {authUrl}
          </a>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            After logging in, come back and click ↻ Refresh to confirm gateway is online.
          </div>
        </div>
      )}

      {loginOutput && !authUrl && (
        <div style={{ marginTop: 10, background: 'var(--bg-700)', borderRadius: 8, padding: '10px 12px', fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'monospace', maxHeight: 100, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
          {loginOutput}
        </div>
      )}
    </div>
  )
}

interface Settings {
  gmailUser: string; gmailAppPass: string; dailyLimit: number;
  pixelBaseUrl: string; aiBaseUrl: string; aiModel: string;
  sendingPaused: boolean; followUpDays: string;
  sendWindowStart: string; sendWindowEnd: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Partial<Settings>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      setSettings(d)
      setLoading(false)
    })
  }, [])

  async function save() {
    setSaving(true)
    const r = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    if (r.ok) showToast('Settings saved!')
    else showToast('Save failed', 'error')
    setSaving(false)
  }

  const set = (key: keyof Settings, value: string | number | boolean) =>
    setSettings(prev => ({ ...prev, [key]: value }))

  if (loading) return <AppShell><div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading...</div></AppShell>

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-subtitle">Configure Gmail, AI, and campaign behaviour</div>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '⏳ Saving...' : '💾 Save All Settings'}
        </button>
      </div>

      <div className="page-body" style={{ maxWidth: 720 }}>

        {/* Gmail SMTP */}
        <div className="card mb-4">
          <div className="card-header"><span className="card-title">📧 Gmail / Google Workspace</span></div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            Use your Google Workspace email with an App Password (not your login password).
            Generate at: <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>myaccount.google.com/apppasswords</a>
          </p>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Gmail Address</label>
              <input className="input" value={settings.gmailUser || ''} onChange={e => set('gmailUser', e.target.value)}
                placeholder="you@yourworkspace.com" />
            </div>
            <div className="form-group">
              <label className="form-label">App Password</label>
              <input className="input" type="password" value={settings.gmailAppPass || ''}
                onChange={e => set('gmailAppPass', e.target.value)}
                placeholder="xxxx-xxxx-xxxx-xxxx" />
            </div>
          </div>
        </div>

        {/* Send Limits */}
        <div className="card mb-4">
          <div className="card-header"><span className="card-title">⚡ Send Limits & Schedule</span></div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Daily Email Limit</label>
              <input className="input" type="number" min={1} max={2000}
                value={settings.dailyLimit || 900}
                onChange={e => set('dailyLimit', parseInt(e.target.value))} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Google Workspace max: 2000/day</span>
            </div>
            <div className="form-group">
              <label className="form-label">Follow-up Days (comma-separated)</label>
              <input className="input" value={settings.followUpDays || '3,7,14,21,30'}
                onChange={e => set('followUpDays', e.target.value)}
                placeholder="3,7,14,21,30" />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Days after initial email for each follow-up</span>
            </div>
            <div className="form-group">
              <label className="form-label">Send Window Start (IST, HH:MM)</label>
              <input className="input" value={settings.sendWindowStart || '10:30'}
                onChange={e => set('sendWindowStart', e.target.value)}
                placeholder="10:30" />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Mon–Fri only. Emails start at this time (IST)</span>
            </div>
            <div className="form-group">
              <label className="form-label">Send Window End (IST, HH:MM)</label>
              <input className="input" value={settings.sendWindowEnd || '11:59'}
                onChange={e => set('sendWindowEnd', e.target.value)}
                placeholder="11:59" />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No emails sent after this time (IST). Currently set to 11:59 AM.</span>
            </div>
          </div>
        </div>

        {/* Pixel Tracking */}
        <div className="card mb-4">
          <div className="card-header"><span className="card-title">👁 Email Open Tracking</span></div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Pixels are served as <code style={{ color: 'var(--primary)', background: 'var(--bg-700)', padding: '1px 6px', borderRadius: 4 }}>/r/&#123;id&#125;</code> — clean URLs that don't trigger spam filters.
            Set your VPS domain/IP below.
          </p>
          <div className="form-group">
            <label className="form-label">VPS Pixel Base URL</label>
            <input className="input" value={settings.pixelBaseUrl || ''}
              onChange={e => set('pixelBaseUrl', e.target.value)}
              placeholder="https://yourdomain.com" />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Buy any cheap domain and point it to your VPS IP</span>
          </div>
          <div style={{ padding: '12px 14px', background: 'var(--bg-700)', borderRadius: 8, fontSize: 12.5, color: 'var(--text-dim)' }}>
            Pixel URL example: <code style={{ color: 'var(--primary)' }}>{settings.pixelBaseUrl || 'https://yourdomain.com'}/r/abc123</code>
          </div>
        </div>

        {/* AI Settings */}
        <div className="card mb-4">
          <div className="card-header"><span className="card-title">🤖 Codex-oth AI Gateway</span></div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Your Codex-oth gateway (ChatGPT Plus proxy). Must be running on the VPS at the specified URL.
          </p>

          {/* Gateway Status */}
          <CodexStatus />

          <div className="grid-2" style={{ marginTop: 16 }}>
            <div className="form-group">
              <label className="form-label">AI Base URL</label>
              <input className="input" value={settings.aiBaseUrl || 'http://localhost:10531/v1'}
                onChange={e => set('aiBaseUrl', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">AI Model</label>
              <select className="select" value={settings.aiModel || 'gpt-5.6-sol'}
                onChange={e => set('aiModel', e.target.value)}>
                <option value="gpt-5.6-sol">gpt-5.6-sol (Most Powerful)</option>
                <option value="gpt-5.6-luna">gpt-5.6-luna (Ultra Fast)</option>
                <option value="gpt-5.6-terra">gpt-5.6-terra (Balanced)</option>
                <option value="gpt-5.5">gpt-5.5 (Advanced Reasoning)</option>
                <option value="gpt-5.4">gpt-5.4 (Fast)</option>
                <option value="gpt-5.4-mini">gpt-5.4-mini (Lightweight)</option>
              </select>
            </div>
          </div>

          <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', fontSize: 12.5 }}>
            <strong style={{ color: 'var(--text)' }}>VPS setup:</strong> Run{' '}
            <code style={{ color: 'var(--text-dim)', background: 'var(--bg-700)', padding: '1px 5px', borderRadius: 3 }}>npx openai-oauth@latest --detach --port 10531</code>{' '}
            on your VPS first, then use the button above to link your account.
          </div>
        </div>


        <button className="btn btn-primary" onClick={save} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
          {saving ? '⏳ Saving...' : '💾 Save All Settings'}
        </button>
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.type === 'success' ? '✅' : '❌'} {toast.msg}</div>}
    </AppShell>
  )
}
