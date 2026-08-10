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
            {status === 'online' ? 'Gateway Online' : status === 'offline' ? 'Gateway Offline' : 'Checking...'}
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
          Gateway not running. On your VPS: <code style={{ color: 'var(--text-dim)' }}>pm2 start "npx openai-oauth@latest --port 10531" --name "codex-gateway"</code>
        </div>
      )}

      {authUrl && (
        <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--bg-700)', borderRadius: 8, border: '1px solid var(--border-light)' }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>✅ Open this URL in your browser to log in:</div>
          <a href={authUrl} target="_blank" rel="noreferrer"
            style={{ color: '#fff', fontSize: 12.5, wordBreak: 'break-all', textDecoration: 'underline' }}>
            {authUrl}
          </a>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            After logging in, click ↻ Refresh to confirm gateway is online.
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
  pixelBaseUrl: string; linkedinUrl: string; aiBaseUrl: string; aiModel: string;
  systemPrompt: string; sendingPaused: boolean;
  sendWindowStart: string; sendWindowEnd: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Partial<Settings>>({})
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [toast, setToast]       = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Test email state
  const [testEmail,    setTestEmail]    = useState('')
  const [testName,     setTestName]     = useState('Test Recipient')
  const [testCompany,  setTestCompany]  = useState('Test Company')
  const [testTemplate, setTestTemplate] = useState('all')
  const [testSending,  setTestSending]  = useState(false)
  const [testResult,   setTestResult]   = useState<string | null>(null)

  // Resume status state
  const [resumeStatus, setResumeStatus] = useState<{ exists: boolean; sizeKb?: number; modifiedAt?: string } | null>(null)
  const [deletingResume, setDeletingResume] = useState(false)

  // Send Now state
  const [sendingNow, setSendingNow] = useState(false)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      setSettings(d)
      setLoading(false)
    })
    fetch('/api/resume').then(r => r.json()).then(d => setResumeStatus(d)).catch(() => {})
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

        {/* Gmail */}
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
          <div className="form-group" style={{ marginTop: 8 }}>
            <label className="form-label">Your LinkedIn URL</label>
            <input className="input" value={settings.linkedinUrl || ''}
              onChange={e => set('linkedinUrl', e.target.value)}
              placeholder="https://linkedin.com/in/your-profile" />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Injected as {'{{'+'LinkedIn{}'+'}'} in every email template automatically</span>
          </div>
        </div>

        {/* Send Limits */}
        <div className="card mb-4">
          <div className="card-header"><span className="card-title">⚡ Send Limits & Schedule</span></div>

          {/* How it works */}
          <div style={{ padding: '12px 14px', background: 'rgba(99,102,241,0.08)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.2)', marginBottom: 20, fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>📋 How sending works</div>
            <div style={{ color: 'var(--text-muted)', lineHeight: 1.8 }}>
              <strong style={{ color: 'var(--text-dim)' }}>Round 1 (Initials):</strong> Every contact gets their first email, 499/day, Mon–Fri only.<br/>
              <strong style={{ color: 'var(--text-dim)' }}>Round 2–6 (Follow-ups):</strong> Once ALL initials are sent, follow-up 1 starts immediately — same day if slots remain. Each round starts only after the previous is 100% complete.<br/>
              <strong style={{ color: 'var(--text-dim)' }}>Bounced:</strong> Marked automatically, excluded from all future rounds.<br/>
              <strong style={{ color: 'var(--text-dim)' }}>Replied:</strong> Company's contacts stopped automatically when they reply.
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Daily Email Limit</label>
              <input className="input" type="number" min={1} max={2000}
                value={settings.dailyLimit ?? 499}
                onChange={e => set('dailyLimit', parseInt(e.target.value))} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Max 499 recommended for college Workspace</span>
            </div>
            <div className="form-group">
              <label className="form-label">Total Follow-up Rounds</label>
              <input className="input" value="5 rounds (FU1 → FU2 → FU3 → FU4 → FU5)" readOnly
                style={{ opacity: 0.5, cursor: 'not-allowed' }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Fixed: completion-based, no day gaps</span>
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
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No emails sent after this time (IST)</span>
            </div>
          </div>
        </div>

        {/* Pixel Tracking */}
        <div className="card mb-4">
          <div className="card-header"><span className="card-title">👁 Email Open Tracking</span></div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Pixels are served as <code style={{ color: 'var(--primary)', background: 'var(--bg-700)', padding: '1px 6px', borderRadius: 4 }}>/r/&#123;id&#125;</code> — clean URLs that don't trigger spam filters.
          </p>
          <div className="form-group">
            <label className="form-label">VPS Pixel Base URL</label>
            <input className="input" value={settings.pixelBaseUrl || ''}
              onChange={e => set('pixelBaseUrl', e.target.value)}
              placeholder="https://cdnassets.store" />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Your VPS domain pointed to {settings.pixelBaseUrl || 'your VPS IP'}</span>
          </div>
          <div style={{ padding: '12px 14px', background: 'var(--bg-700)', borderRadius: 8, fontSize: 12.5, color: 'var(--text-dim)' }}>
            Pixel URL example: <code style={{ color: 'var(--primary)' }}>{settings.pixelBaseUrl || 'https://cdnassets.store'}/r/abc123</code>
          </div>
        </div>

        {/* AI Settings */}
        <div className="card mb-4">
          <div className="card-header"><span className="card-title">🤖 AI Gateway & Persona</span></div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            ChatGPT gateway running on your VPS. Used to classify incoming emails and draft personalised replies.
          </p>

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

          {/* System Prompt */}
          <div className="form-group" style={{ marginTop: 4 }}>
            <label className="form-label">AI System Prompt (Aaditya's Persona)</label>
            <textarea
              className="textarea"
              rows={8}
              value={settings.systemPrompt || ''}
              onChange={e => set('systemPrompt', e.target.value)}
              placeholder={`Leave blank to use the smart default (recommended).

Only fill this if you want to override. Example:

You are helping Aaditya Aggarwal, a B.Com student at SGGSCC, University of Delhi.
He wants: data analytics, operations, product management internships.
He does NOT want: IBM SkillsBuild, NGO fellowships, MLM, volunteer roles.
Reply style: professional but warm, under 120 words, sign as Aaditya Aggarwal.`}
            />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              This tells the AI what to classify as internship-related and how to write replies as you. Leave blank to use the smart default.
            </span>
          </div>
        </div>

        {/* ─── Resume Status ──────────────────────────────────────────── */}
        <div className="card mb-4">
          <div className="card-header"><span className="card-title">📎 Resume on Server</span></div>
          {resumeStatus === null ? (
            <div style={{ color:'var(--text-muted)', fontSize: 13 }}>Checking...</div>
          ) : resumeStatus.exists ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap: 12 }}>
              <div>
                <div style={{ color:'#10b981', fontWeight: 700, fontSize: 14 }}>✅ resume.pdf is uploaded</div>
                <div style={{ fontSize: 12, color:'var(--text-muted)', marginTop: 4 }}>
                  {resumeStatus.sizeKb} KB &nbsp;&middot;&nbsp;
                  {resumeStatus.modifiedAt ? `Uploaded ${new Date(resumeStatus.modifiedAt).toLocaleString()}` : ''}
                </div>
              </div>
              <button
                className="btn btn-sm"
                style={{ background:'rgba(239,68,68,0.15)', color:'#ef4444', border:'1px solid rgba(239,68,68,0.3)' }}
                disabled={deletingResume}
                onClick={async () => {
                  if (!confirm('Delete resume.pdf from server? Emails will send without attachment until you re-upload.')) return
                  setDeletingResume(true)
                  await fetch('/api/resume', { method: 'DELETE' })
                  setResumeStatus({ exists: false })
                  setDeletingResume(false)
                }}>
                {deletingResume ? '⏳...' : '🗑 Delete Resume'}
              </button>
            </div>
          ) : (
            <div style={{ color:'#ef4444', fontWeight: 600, fontSize: 13 }}>
              ⚠️ resume.pdf not found on server! Go to Campaigns → Import → Upload Resume PDF.
            </div>
          )}
        </div>

        {/* ─── Manual Send Now ────────────────────────────────────────── */}
        <div className="card mb-4" style={{ border:'1px solid rgba(59,130,246,0.3)', background:'rgba(59,130,246,0.04)' }}>
          <div className="card-header"><span className="card-title">⚡ Send Now (Manual Trigger)</span></div>
          <p style={{ fontSize: 13, color:'var(--text-muted)', marginBottom: 14 }}>
            Manually trigger one send cycle right now — bypasses the time window. Useful if the cron didn’t fire automatically.
            Respects daily limit and pause status.
          </p>
          <button
            className="btn"
            style={{ background:'rgba(59,130,246,0.2)', color:'#3b82f6', border:'1px solid rgba(59,130,246,0.4)', fontWeight: 700 }}
            disabled={sendingNow}
            onClick={async () => {
              setSendingNow(true)
              try {
                const r = await fetch('/api/cron/send', {
                  method: 'POST',
                  headers: { 'x-cron-secret': 'internreach-cron-2024' },
                })
                const d = await r.json()
                showToast(d.success ? '⚡ Send cycle triggered!' : '❌ ' + d.error, d.success ? 'success' : 'error')
              } catch { showToast('❌ Network error', 'error') }
              setSendingNow(false)
            }}>
            {sendingNow ? '⏳ Triggering...' : '⚡ Trigger Send Cycle Now'}
          </button>
        </div>

        {/* ─── Test Email ────────────────────────────────────────────── */}
        <div className="card mb-4" style={{ border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.04)' }}>
          <div className="card-header"><span className="card-title">🧪 Send Test Email</span></div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Send any single template (or all 6) to yourself instantly. Bypasses time window, daily limit, and database.
            No <code>[TEST]</code> prefix — email arrives exactly as an HR would see it.
          </p>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Your Email (recipient)</label>
              <input className="input" type="email" value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                placeholder="aadityaaggarwal3526@gmail.com" />
            </div>
            <div className="form-group">
              <label className="form-label">Which Email to Send</label>
              <select className="input" value={testTemplate} onChange={e => setTestTemplate(e.target.value)}
                style={{ cursor:'pointer' }}>
                <option value="all">📨 All 6 (Initial + FU1–FU5)</option>
                <option value="initial">📩 Initial Email</option>
                <option value="followup_1">🔄 Follow-up 1</option>
                <option value="followup_2">🔄 Follow-up 2</option>
                <option value="followup_3">🔄 Follow-up 3</option>
                <option value="followup_4">🔄 Follow-up 4</option>
                <option value="followup_5">🔄 Follow-up 5</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Fake Recipient Name</label>
              <input className="input" value={testName}
                onChange={e => setTestName(e.target.value)}
                placeholder="Rajnesh Khosla" />
            </div>
            <div className="form-group">
              <label className="form-label">Fake Company Name</label>
              <input className="input" value={testCompany}
                onChange={e => setTestCompany(e.target.value)}
                placeholder="FICCI" />
            </div>
          </div>

          <button
            className="btn"
            disabled={testSending || !testEmail}
            style={{ background: '#f59e0b', color: '#000', fontWeight: 700, marginTop: 4 }}
            onClick={async () => {
              setTestSending(true)
              setTestResult('⏳ Sending...')
              try {
                const r = await fetch('/api/test-email', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ toEmail: testEmail, toName: testName, companyName: testCompany, templateType: testTemplate }),
                })
                const d = await r.json()
                if (d.success) {
                  setTestResult(`✅ ${d.message}\n\n` +
                    d.results.map((x: {type:string;ok:boolean}) => `${x.ok ? '✅' : '❌'} ${x.type}`).join('\n'))
                } else {
                  setTestResult(`❌ Error: ${d.error}`)
                }
              } catch (e) {
                setTestResult(`❌ Network error: ${e}`)
              }
              setTestSending(false)
            }}>
            {testSending ? '⏳ Sending...' : `🚀 Send ${testTemplate === 'all' ? 'All 6' : testTemplate.replace('_', ' ').toUpperCase()} Now`}
          </button>

          {testResult && (
            <div style={{
              marginTop: 14, padding: '12px 14px',
              background: 'var(--bg-700)', borderRadius: 8,
              fontSize: 13, fontFamily: 'monospace',
              whiteSpace: 'pre-wrap', color: 'var(--text-dim)'
            }}>
              {testResult}
            </div>
          )}
        </div>

        <button className="btn btn-primary" onClick={save} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
          {saving ? '⏳ Saving...' : '💾 Save All Settings'}
        </button>
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.type === 'success' ? '✅' : '❌'} {toast.msg}</div>}
    </AppShell>
  )
}
