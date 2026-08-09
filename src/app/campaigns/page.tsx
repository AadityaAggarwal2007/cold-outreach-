'use client'
import { useEffect, useState, useRef } from 'react'
import AppShell from '@/components/AppShell'

interface CampaignStats {
  pendingInitial: number
  pendingFollowUps: number
  stoppedContacts: number
  settings: {
    sentToday: number; dailyLimit: number; sendingPaused: boolean;
    followUpDays: string; aiBaseUrl: string; aiModel: string;
  } | null
}

interface Template {
  id: number; name: string; type: string; subject: string; htmlBody: string;
}

const TEMPLATE_TYPES = [
  { type: 'initial', label: '📩 Initial Email', desc: 'First email sent to each HR' },
  { type: 'followup_1', label: '🔄 Follow-up 1', desc: 'Sent after Day 3' },
  { type: 'followup_2', label: '🔄 Follow-up 2', desc: 'Sent after Day 7' },
  { type: 'followup_3', label: '🔄 Follow-up 3', desc: 'Sent after Day 14' },
  { type: 'followup_4', label: '🔄 Follow-up 4', desc: 'Sent after Day 21' },
  { type: 'followup_5', label: '🔄 Follow-up 5', desc: 'Sent after Day 30' },
]

export default function CampaignsPage() {
  const [tab, setTab] = useState<'queue' | 'templates' | 'import'>('queue')
  const [stats, setStats] = useState<CampaignStats | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [editingType, setEditingType] = useState<string | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; companies: number; skipped: number } | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const resumeRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [statsR, tplR] = await Promise.all([
      fetch('/api/campaign').then(r => r.json()),
      fetch('/api/templates').then(r => r.json()),
    ])
    setStats(statsR)
    setTemplates(Array.isArray(tplR) ? tplR : [])
  }

  async function toggle(action: string) {
    await fetch('/api/campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    showToast(action === 'pause' ? '⏸ Campaign paused' : '▶ Campaign resumed')
    loadAll()
  }

  function startEdit(type: string) {
    const tpl = templates.find(t => t.type === type)
    setEditingType(type)
    setEditSubject(tpl?.subject || '')
    setEditBody(tpl?.htmlBody || '')
  }

  async function saveTemplate() {
    if (!editingType) return
    setSaving(true)
    const info = TEMPLATE_TYPES.find(t => t.type === editingType)
    await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: editingType, name: info?.label || editingType, subject: editSubject, htmlBody: editBody }),
    })
    showToast('Template saved!')
    setEditingType(null)
    loadAll()
    setSaving(false)
  }

  async function importContacts() {
    if (!fileRef.current?.files?.[0]) return
    setImporting(true)
    setImportResult(null)
    const fd = new FormData()
    fd.append('file', fileRef.current.files[0])
    const r = await fetch('/api/import', { method: 'POST', body: fd })
    const d = await r.json()
    if (r.ok) {
      setImportResult(d)
      showToast(`✅ Imported ${d.imported} contacts from ${d.companies} companies!`)
    } else {
      showToast('Import failed: ' + d.error, 'error')
    }
    setImporting(false)
  }

  async function uploadResume() {
    if (!resumeRef.current?.files?.[0]) return
    const fd = new FormData()
    fd.append('resume', resumeRef.current.files[0])
    const r = await fetch('/api/resume', { method: 'POST', body: fd })
    if (r.ok) showToast('Resume uploaded!')
    else showToast('Resume upload failed', 'error')
  }

  const paused = stats?.settings?.sendingPaused

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <div className="page-title">Campaigns</div>
          <div className="page-subtitle">Control your outreach engine</div>
        </div>
        <div className="flex gap-2">
          <button className={`btn btn-sm ${paused ? 'btn-success' : 'btn-ghost'}`} onClick={() => toggle(paused ? 'resume' : 'pause')}>
            {paused ? '▶ Resume Campaign' : '⏸ Pause Campaign'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {['queue', 'templates', 'import'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t as typeof tab)}>
            {t === 'queue' ? '📊 Queue' : t === 'templates' ? '📄 Templates' : '📥 Import'}
          </button>
        ))}
      </div>

      <div className="page-body">
        {/* QUEUE TAB */}
        {tab === 'queue' && (
          <>
            <div className="stats-grid" style={{ marginBottom: 28 }}>
              <div className="stat-card blue">
                <div className="stat-label">Pending Initial</div>
                <div className="stat-value">{stats?.pendingInitial?.toLocaleString() || 0}</div>
                <div className="stat-sub">First emails to send</div>
              </div>
              <div className="stat-card yellow">
                <div className="stat-label">Follow-up Queue</div>
                <div className="stat-value">{stats?.pendingFollowUps?.toLocaleString() || 0}</div>
                <div className="stat-sub">Follow-ups pending</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Sent Today</div>
                <div className="stat-value">{stats?.settings?.sentToday || 0}</div>
                <div className="stat-sub">of {stats?.settings?.dailyLimit || 900} limit</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Stopped</div>
                <div className="stat-value">{stats?.stoppedContacts || 0}</div>
                <div className="stat-sub">Replied or max follow-ups</div>
              </div>
            </div>

            <div className="grid-2">
              <div className="card">
                <div className="card-header"><span className="card-title">⚡ Sending Engine</span></div>
                <div style={{ fontSize: 13.5, color: 'var(--text-dim)', lineHeight: 1.8 }}>
                  <div className="flex justify-between"><span>Status</span><span style={{ color: paused ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>{paused ? '⏸ Paused' : '✅ Active'}</span></div>
                  <div className="flex justify-between"><span>Send interval</span><span>Every 60 seconds</span></div>
                  <div className="flex justify-between"><span>Daily limit</span><span>{stats?.settings?.dailyLimit || 900} emails/day</span></div>
                  <div className="flex justify-between"><span>Follow-up days</span><span>{stats?.settings?.followUpDays || '3,7,14,21,30'}</span></div>
                  <div className="flex justify-between"><span>Inbox sync</span><span>Every 5 minutes</span></div>
                </div>
                <div className="flex gap-2 mt-4" style={{ marginTop: 16 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggle('reset-daily')}>Reset Daily Count</button>
                </div>
              </div>

              <div className="card">
                <div className="card-header"><span className="card-title">📎 Resume</span></div>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
                  Upload your resume PDF. It will be attached to every initial email automatically.
                </p>
                <input type="file" ref={resumeRef} accept=".pdf" style={{ display: 'none' }} onChange={uploadResume} />
                <button className="btn btn-ghost" onClick={() => resumeRef.current?.click()}>
                  📤 Upload Resume PDF
                </button>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
                  Current: <code style={{ color: 'var(--primary)' }}>public/resume.pdf</code>
                </div>
              </div>
            </div>
          </>
        )}

        {/* TEMPLATES TAB */}
        {tab === 'templates' && (
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13.5, marginBottom: 20 }}>
              Use <code style={{ color: 'var(--primary)', background: 'var(--bg-700)', padding: '1px 6px', borderRadius: 4 }}>{'{{HR Name}}'}</code> and{' '}
              <code style={{ color: 'var(--primary)', background: 'var(--bg-700)', padding: '1px 6px', borderRadius: 4 }}>{'{{Company Name}}'}</code> in your templates — they'll be replaced automatically.
            </p>

            {editingType ? (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">{TEMPLATE_TYPES.find(t => t.type === editingType)?.label}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingType(null)}>✕ Cancel</button>
                </div>
                <div className="form-group">
                  <label className="form-label">Subject Line</label>
                  <input className="input" value={editSubject} onChange={e => setEditSubject(e.target.value)}
                    placeholder="e.g. Internship Application - {{Company Name}}" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Body (HTML or plain text)</label>
                  <textarea className="textarea" value={editBody} onChange={e => setEditBody(e.target.value)}
                    style={{ minHeight: 320, fontFamily: 'monospace', fontSize: 13 }}
                    placeholder="Dear {{HR Name}},&#10;&#10;I hope this email finds you well..." />
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-primary" onClick={saveTemplate} disabled={saving}>
                    {saving ? 'Saving...' : '💾 Save Template'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {TEMPLATE_TYPES.map(tpl => {
                  const saved = templates.find(t => t.type === tpl.type)
                  return (
                    <div key={tpl.type} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{tpl.label}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>{tpl.desc}</div>
                        {saved && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>Subject: {saved.subject}</div>}
                      </div>
                      <div className="flex gap-2 items-center">
                        {saved
                          ? <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>✅ Set</span>
                          : <span style={{ fontSize: 12, color: 'var(--yellow)', fontWeight: 600 }}>⚠ Missing</span>}
                        <button className="btn btn-ghost btn-sm" onClick={() => startEdit(tpl.type)}>
                          {saved ? '✏ Edit' : '+ Create'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* IMPORT TAB */}
        {tab === 'import' && (
          <div style={{ maxWidth: 560 }}>
            <div className="card">
              <div className="card-header"><span className="card-title">📥 Import Contacts from Excel</span></div>
              <p style={{ color: 'var(--text-muted)', fontSize: 13.5, marginBottom: 20, lineHeight: 1.7 }}>
                Upload your <strong style={{ color: 'var(--text)' }}>Company_Contacts_Tiered.xlsx</strong> file.
                Required columns: <code style={{ color: 'var(--primary)' }}>Company</code>, <code style={{ color: 'var(--primary)' }}>Contact Name</code>, <code style={{ color: 'var(--primary)' }}>Email</code>.
                Duplicates are automatically skipped.
              </p>

              <input type="file" ref={fileRef} accept=".xlsx,.xls,.csv" style={{ display: 'none' }} />
              <button className="btn btn-ghost" onClick={() => fileRef.current?.click()} style={{ marginBottom: 16, width: '100%', justifyContent: 'center' }}>
                📂 Choose Excel File
              </button>
              {fileRef.current?.files?.[0] && (
                <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>
                  Selected: {fileRef.current.files[0].name}
                </div>
              )}
              <button className="btn btn-primary w-full" style={{ justifyContent: 'center' }}
                onClick={importContacts} disabled={importing}>
                {importing ? '⏳ Importing...' : '🚀 Import Contacts'}
              </button>

              {importResult && (
                <div style={{ marginTop: 20, padding: '16px', background: 'rgba(16,185,129,0.1)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.3)' }}>
                  <div style={{ color: 'var(--green)', fontWeight: 700, fontSize: 15, marginBottom: 8 }}>✅ Import Complete!</div>
                  <div style={{ fontSize: 13.5, color: 'var(--text-dim)', lineHeight: 2 }}>
                    <div>Companies imported: <strong style={{ color: 'var(--text)' }}>{importResult.companies}</strong></div>
                    <div>Contacts imported: <strong style={{ color: 'var(--text)' }}>{importResult.imported}</strong></div>
                    <div>Duplicates skipped: <strong style={{ color: 'var(--text)' }}>{importResult.skipped}</strong></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.type === 'success' ? '✅' : '❌'} {toast.msg}</div>}
    </AppShell>
  )
}
