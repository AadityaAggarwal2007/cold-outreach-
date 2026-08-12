'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import AppShell from '@/components/AppShell'

// ─── Types ────────────────────────────────────────────────────────────────────
interface EmailLog {
  id: number; type: string; subject: string
  sentAt: string; openedAt: string | null; openCount: number; status: string
}
interface Contact {
  id: number; name: string; email: string; status: string
  followUpCount: number; lastSentAt: string | null; emailLogs: EmailLog[]
}
interface Company {
  id: number; name: string; tier: string | null; stage: string
  repliedAt: string | null; createdAt: string
  contacts: Contact[]
  _count: { contacts: number }
}
interface Stats {
  totalCompanies: number; totalContacts: number; pendingInitial: number
  sentContacts: number; stoppedContacts: number; bouncedContacts: number
  openedContacts: number; repliedCompanies: number; pendingFollowUps: number
  settings: { sentToday: number; dailyLimit: number; sendingPaused: boolean; sendWindowStart: string; sendWindowEnd: string } | null
}
interface Template { id: number; name: string; type: string; subject: string; htmlBody: string }

const EMAIL_ROUNDS = ['initial', 'followup_1', 'followup_2', 'followup_3', 'followup_4', 'followup_5']
const ROUND_LABELS = ['I', 'F1', 'F2', 'F3', 'F4', 'F5']
const TEMPLATE_TYPES = [
  { type: 'initial',    label: '📩 Initial',    desc: 'First email to each HR' },
  { type: 'followup_1', label: '🔄 Follow-up 1', desc: 'Sent after FU round 1' },
  { type: 'followup_2', label: '🔄 Follow-up 2', desc: 'Sent after FU round 2' },
  { type: 'followup_3', label: '🔄 Follow-up 3', desc: 'Sent after FU round 3' },
  { type: 'followup_4', label: '🔄 Follow-up 4', desc: 'Sent after FU round 4' },
  { type: 'followup_5', label: '🔄 Follow-up 5', desc: 'Sent after FU round 5' },
]

// ─── Status pill for each email round ─────────────────────────────────────────
function RoundPill({ log, replied, round }: { log?: EmailLog; replied: boolean; round: number }) {
  const label = ROUND_LABELS[round]
  if (replied && log) {
    return <span title={`Replied — ${log.type}`} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:32, height:24, borderRadius:6, fontSize:10, fontWeight:700, background:'rgba(16,185,129,0.2)', color:'#10b981', border:'1px solid rgba(16,185,129,0.4)' }}>↩{label}</span>
  }
  if (!log) {
    return <span title="Not sent yet" style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:32, height:24, borderRadius:6, fontSize:10, fontWeight:700, background:'rgba(100,116,139,0.15)', color:'var(--text-muted)', border:'1px solid rgba(100,116,139,0.2)' }}>{label}</span>
  }
  if (log.openedAt) {
    return <span title={`Opened ${log.openCount}× · ${new Date(log.openedAt).toLocaleDateString()}`} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:32, height:24, borderRadius:6, fontSize:10, fontWeight:700, background:'rgba(16,185,129,0.15)', color:'#10b981', border:'1px solid rgba(16,185,129,0.35)' }}>👁{label}</span>
  }
  return <span title={`Sent · ${new Date(log.sentAt).toLocaleDateString()}`} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:32, height:24, borderRadius:6, fontSize:10, fontWeight:700, background:'rgba(59,130,246,0.15)', color:'#3b82f6', border:'1px solid rgba(59,130,246,0.3)' }}>✓{label}</span>
}

// ─── Company row (expandable) ─────────────────────────────────────────────────
function CompanyRow({ company }: { company: Company }) {
  const [open, setOpen] = useState(false)
  const [activeHR, setActiveHR] = useState(0)

  const totalSent   = company.contacts.reduce((a, c) => a + c.emailLogs.length, 0)
  const totalOpened = company.contacts.reduce((a, c) => a + c.emailLogs.filter(l => l.openedAt).length, 0)
  const replied     = !!company.repliedAt

  return (
    <div style={{ borderRadius: 10, border: `1px solid ${replied ? 'rgba(16,185,129,0.4)' : 'var(--border)'}`, marginBottom: 8, overflow: 'hidden', background: 'var(--bg-800)' }}>
      {/* Company header row */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', cursor:'pointer', userSelect:'none' }}
      >
        <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
          <span style={{ fontSize: 16, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display:'inline-block', color:'var(--text-muted)' }}>▶</span>
          <div>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{company.name}</span>
            {company.tier && <span style={{ fontSize: 11, color:'var(--text-muted)', marginLeft: 8 }}>{company.tier}</span>}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap: 16, fontSize: 12 }}>
          {replied && <span style={{ color:'#10b981', fontWeight: 700 }}>↩ Replied</span>}
          {totalOpened > 0 && <span style={{ color:'#10b981' }}>👁 {totalOpened} open</span>}
          <span style={{ color:'var(--text-muted)' }}>📧 {totalSent} sent</span>
          <span style={{ color:'var(--text-muted)' }}>👥 {company._count.contacts} HRs</span>
          <span style={{ padding:'2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: replied ? 'rgba(16,185,129,0.15)' : totalSent > 0 ? 'rgba(59,130,246,0.15)' : 'rgba(100,116,139,0.15)', color: replied ? '#10b981' : totalSent > 0 ? '#3b82f6' : 'var(--text-muted)' }}>
            {replied ? 'Replied' : totalSent > 0 ? 'Active' : 'Pending'}
          </span>
        </div>
      </div>

      {/* Expanded HR detail */}
      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 16, background: 'var(--bg-900)' }}>
          {/* HR tabs */}
          {company.contacts.length > 1 && (
            <div style={{ display:'flex', gap: 6, marginBottom: 14, flexWrap:'wrap' }}>
              {company.contacts.map((c, i) => (
                <button key={c.id} onClick={() => setActiveHR(i)}
                  style={{ padding:'4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor:'pointer', border:'none', background: activeHR === i ? 'var(--primary)' : 'var(--bg-700)', color: activeHR === i ? '#000' : 'var(--text-dim)', transition:'all 0.1s' }}>
                  {c.name.split(' ')[0]}
                </button>
              ))}
            </div>
          )}

          {/* Active HR detail */}
          {company.contacts[activeHR] && (() => {
            const c = company.contacts[activeHR]
            const logsByType = Object.fromEntries(c.emailLogs.map(l => [l.type, l]))
            return (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                    <div style={{ fontSize: 12.5, color:'var(--text-muted)', marginTop: 2 }}>{c.email}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, padding:'3px 10px', borderRadius: 8, background: c.status === 'stopped' ? 'rgba(16,185,129,0.15)' : c.status === 'sent' ? 'rgba(59,130,246,0.15)' : c.status === 'bounced' ? 'rgba(239,68,68,0.15)' : 'rgba(100,116,139,0.15)', color: c.status === 'stopped' ? '#10b981' : c.status === 'sent' ? '#3b82f6' : c.status === 'bounced' ? '#ef4444' : 'var(--text-muted)' }}>
                      {c.status}
                    </span>
                    {c.lastSentAt && <div style={{ fontSize: 11, color:'var(--text-muted)', marginTop: 4 }}>Last: {new Date(c.lastSentAt).toLocaleDateString()}</div>}
                  </div>
                </div>

                {/* Email round pills */}
                <div>
                  <div style={{ fontSize: 11, color:'var(--text-muted)', marginBottom: 8, fontWeight: 600, letterSpacing: 0.5 }}>EMAIL ROUNDS (hover for details)</div>
                  <div style={{ display:'flex', gap: 6, flexWrap:'wrap' }}>
                    {EMAIL_ROUNDS.map((type, i) => (
                      <div key={type} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: 4 }}>
                        <RoundPill key={type} log={logsByType[type]} replied={replied} round={i} />
                        {logsByType[type]?.openedAt && (
                          <div style={{ fontSize: 9, color:'#10b981', textAlign:'center', lineHeight: 1.2 }}>{logsByType[type].openCount}×</div>
                        )}
                      </div>
                    ))}
                  </div>
                  {replied && (
                    <div style={{ marginTop: 10, fontSize: 12.5, color:'#10b981', fontWeight: 600 }}>
                      ✅ This company replied on {new Date(company.repliedAt!).toLocaleDateString()} — follow-ups stopped
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const [tab, setTab] = useState<'tracker' | 'templates' | 'import'>('tracker')
  const [stats, setStats]         = useState<Stats | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [compTotal, setCompTotal] = useState(0)
  const [compPage, setCompPage]   = useState(1)
  const [search, setSearch]       = useState('')
  const [templates, setTemplates] = useState<Template[]>([])
  const [editingType, setEditingType] = useState<string | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody]       = useState('')
  const [saving, setSaving]         = useState(false)
  const [importing, setImporting]   = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; companies: number; skipped: number } | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const fileRef   = useRef<HTMLInputElement>(null)
  const resumeRef = useRef<HTMLInputElement>(null)
  const [resumeName, setResumeName] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [clearing, setClearing]   = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }

  const loadStats = useCallback(async () => {
    const r = await fetch('/api/campaign')
    setStats(await r.json())
  }, [])

  const loadCompanies = useCallback(async () => {
    const p = new URLSearchParams({ page: String(compPage), limit: '30', search })
    const r = await fetch(`/api/companies?${p}`)
    const d = await r.json()
    setCompanies(d.companies || [])
    setCompTotal(d.total || 0)
  }, [compPage, search])

  const loadTemplates = useCallback(async () => {
    const r = await fetch('/api/templates')
    const d = await r.json()
    setTemplates(Array.isArray(d) ? d : [])
  }, [])

  useEffect(() => { loadStats(); loadTemplates() }, [loadStats, loadTemplates])
  useEffect(() => { if (tab === 'tracker') loadCompanies() }, [tab, loadCompanies])

  async function toggle(action: string) {
    await fetch('/api/campaign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
    showToast(action === 'pause' ? '⏸ Paused' : action === 'resume' ? '▶ Resumed' : '🔄 Reset')
    loadStats()
  }

  async function saveTemplate() {
    if (!editingType) return
    setSaving(true)
    const info = TEMPLATE_TYPES.find(t => t.type === editingType)
    await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: editingType, name: info?.label || editingType, subject: editSubject, htmlBody: editBody }) })
    showToast('Template saved!'); setEditingType(null); loadTemplates(); setSaving(false)
  }

  async function importContacts() {
    if (!fileRef.current?.files?.[0]) return
    setImporting(true); setImportResult(null)
    const fd = new FormData(); fd.append('file', fileRef.current.files[0])
    const r = await fetch('/api/import', { method: 'POST', body: fd })
    const d = await r.json()
    if (r.ok) { setImportResult(d); showToast(`✅ Imported ${d.imported} contacts from ${d.companies} companies!`); loadStats() }
    else showToast('Import failed: ' + d.error, 'error')
    setImporting(false)
  }

  async function clearAllContacts() {
    setClearing(true)
    const r = await fetch('/api/import', { method: 'DELETE' })
    const d = await r.json()
    if (r.ok) {
      showToast(`🗑 Cleared ${d.deleted.contacts} contacts from ${d.deleted.companies} companies`)
      setCompanies([]); setCompTotal(0); setImportResult(null); setSelectedFile(null)
      loadStats()
    } else {
      showToast('Clear failed: ' + d.error, 'error')
    }
    setClearing(false); setConfirmClear(false)
  }

  async function uploadResume() {
    if (!resumeRef.current?.files?.[0]) return
    const fd = new FormData(); fd.append('resume', resumeRef.current.files[0])
    const r = await fetch('/api/resume', { method: 'POST', body: fd })
    if (r.ok) { showToast('Resume uploaded!'); setResumeName(resumeRef.current.files[0].name) }
    else showToast('Resume upload failed', 'error')
  }

  const paused    = stats?.settings?.sendingPaused
  const total     = stats?.totalContacts || 0
  const sentCount = (stats?.sentContacts || 0) + (stats?.stoppedContacts || 0)
  const progress  = total > 0 ? Math.round((sentCount / total) * 100) : 0

  return (
    <AppShell>
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Campaigns</div>
          <div className="page-subtitle">{stats?.totalCompanies?.toLocaleString() || 0} companies · {stats?.totalContacts?.toLocaleString() || 0} HR contacts</div>
        </div>
        <div className="flex gap-2">
          <button className={`btn btn-sm ${paused ? 'btn-success' : 'btn-ghost'}`} onClick={() => toggle(paused ? 'resume' : 'pause')}>
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => toggle('reset-daily')}>Reset Daily</button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(110px,1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { label:'Total HRs',   value: stats?.totalContacts?.toLocaleString() || '0', color:'var(--primary)' },
          { label:'Pending',      value: stats?.pendingInitial?.toLocaleString() || '0', color:'var(--text-muted)' },
          { label:'In Progress',  value: stats?.sentContacts?.toLocaleString() || '0',  color:'#3b82f6' },
          { label:'Opens',        value: stats?.openedContacts?.toLocaleString() || '0', color:'#10b981' },
          { label:'Replied',      value: stats?.repliedCompanies?.toLocaleString() || '0', color:'#10b981' },
          { label:'Stopped',      value: stats?.stoppedContacts?.toLocaleString() || '0', color:'var(--text-dim)' },
          { label:'Sent Today',   value: `${stats?.settings?.sentToday || 0}/${stats?.settings?.dailyLimit || 499}`, color:'var(--yellow)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding:'12px 14px', textAlign:'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color:'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize: 12, color:'var(--text-muted)', marginBottom: 6 }}>
            <span>Campaign Progress</span>
            <span>{sentCount.toLocaleString()} / {total.toLocaleString()} contacts reached ({progress}%)</span>
          </div>
          <div style={{ height: 8, background:'var(--bg-700)', borderRadius: 8, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${progress}%`, background:'linear-gradient(90deg, #3b82f6, #8b5cf6)', borderRadius: 8, transition:'width 0.5s' }} />
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize: 11, color:'var(--text-muted)', marginTop: 5 }}>
            <span style={{ color:'#3b82f6' }}>■ In Progress: {stats?.sentContacts || 0}</span>
            <span style={{ color:'#10b981' }}>■ Opened: {stats?.openedContacts || 0}</span>
            <span style={{ color:'#10b981' }}>■ Replied: {stats?.repliedCompanies || 0} companies</span>
          </div>
        </div>
      )}

      {/* Send window info */}
      {stats?.settings && (
        <div style={{ marginBottom: 16, padding:'8px 14px', borderRadius: 8, background: paused ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)', border:`1px solid ${paused ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`, fontSize: 12.5, color:'var(--text-dim)' }}>
          {paused
            ? '⏸ Campaign is paused — emails will NOT go out until you resume'
            : `✅ Active — sends between ${stats.settings.sendWindowStart} and ${stats.settings.sendWindowEnd} IST on weekdays`
          }
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        {[
          { key:'tracker',   label:'📋 Campaign Tracker' },
          { key:'import',    label:'📥 Import' },
          { key:'templates', label:'📄 Templates' },
        ].map(t => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key as typeof tab)}>{t.label}</button>
        ))}
      </div>

      <div className="page-body">

        {/* ─── TRACKER TAB ─────────────────────────────────────────────────── */}
        {tab === 'tracker' && (
          <div>
            {/* Search */}
            <div style={{ display:'flex', gap: 10, marginBottom: 16 }}>
              <div className="search-wrap" style={{ flex: 1 }}>
                <span className="search-icon">🔍</span>
                <input className="input" placeholder="Search companies..." value={search}
                  onChange={e => { setSearch(e.target.value); setCompPage(1) }} />
              </div>
              <button className="btn btn-ghost btn-sm" onClick={loadCompanies}>↻ Refresh</button>
            </div>

            {/* Legend */}
            <div style={{ display:'flex', gap: 14, marginBottom: 14, fontSize: 11.5, color:'var(--text-muted)', flexWrap:'wrap' }}>
              <span><span style={{ background:'rgba(100,116,139,0.2)', padding:'1px 5px', borderRadius: 4, color:'var(--text-muted)' }}>F1</span> Not sent</span>
              <span><span style={{ background:'rgba(59,130,246,0.15)', padding:'1px 5px', borderRadius: 4, color:'#3b82f6' }}>✓F1</span> Sent</span>
              <span><span style={{ background:'rgba(16,185,129,0.15)', padding:'1px 5px', borderRadius: 4, color:'#10b981' }}>👁F1</span> Opened</span>
              <span><span style={{ background:'rgba(16,185,129,0.2)', padding:'1px 5px', borderRadius: 4, color:'#10b981' }}>↩F1</span> Replied</span>
            </div>

            {companies.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <div className="empty-title">No contacts yet</div>
                <p>Import your CSV from the Import tab to get started</p>
                <button className="btn btn-primary" onClick={() => setTab('import')}>📥 Go to Import</button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color:'var(--text-muted)', marginBottom: 10 }}>
                  Showing {companies.length} of {compTotal.toLocaleString()} companies — click any row to expand
                </div>
                {companies.map(c => <CompanyRow key={c.id} company={c} />)}
                {companies.length < compTotal && (
                  <div style={{ textAlign:'center', marginTop: 16 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setCompPage(p => p + 1)}>Load More Companies</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ─── IMPORT TAB ──────────────────────────────────────────────────── */}
        {tab === 'import' && (
          <div className="grid-2" style={{ maxWidth: 900 }}>
            {/* CSV Import */}
            <div className="card">
              <div className="card-header"><span className="card-title">📥 Import Contacts</span></div>
              <p style={{ color:'var(--text-muted)', fontSize: 13, marginBottom: 16, lineHeight: 1.7 }}>
                Upload <strong style={{ color:'var(--text)' }}>Company_Contacts_Tiered.xlsx</strong><br/>
                Required columns: <code style={{ color:'var(--primary)' }}>Company</code>, <code style={{ color:'var(--primary)' }}>Contact Name</code>, <code style={{ color:'var(--primary)' }}>Email</code>.<br/>
                Duplicates are automatically skipped.
              </p>
              <input type="file" ref={fileRef} accept=".xlsx,.xls,.csv" style={{ display:'none' }}
                onChange={e => setSelectedFile(e.target.files?.[0]?.name || null)} />
              <button className="btn btn-ghost" style={{ width:'100%', justifyContent:'center', marginBottom: 10 }} onClick={() => fileRef.current?.click()}>
                📂 Choose File
              </button>
              {selectedFile && <div style={{ fontSize: 12, color:'var(--primary)', marginBottom: 10 }}>Selected: {selectedFile}</div>}
              <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }} onClick={importContacts} disabled={importing || !selectedFile}>
                {importing ? '⏳ Importing...' : '🚀 Import Contacts'}
              </button>
              {importResult && (
                <div style={{ marginTop: 16, padding: 14, background:'rgba(16,185,129,0.1)', borderRadius: 8, border:'1px solid rgba(16,185,129,0.3)' }}>
                  <div style={{ color:'var(--green)', fontWeight: 700, marginBottom: 8 }}>✅ Import Complete!</div>
                  <div style={{ fontSize: 13, color:'var(--text-dim)', lineHeight: 2 }}>
                    <div>Companies: <strong style={{ color:'var(--text)' }}>{importResult.companies}</strong></div>
                    <div>Contacts:  <strong style={{ color:'var(--text)' }}>{importResult.imported}</strong></div>
                    <div>Skipped:   <strong style={{ color:'var(--text)' }}>{importResult.skipped}</strong> duplicates</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setTab('tracker')}>
                    📋 View Campaign Tracker →
                  </button>
                </div>
              )}
            </div>

            {/* Resume Upload */}
            <div className="card">
              <div className="card-header"><span className="card-title">📎 Resume PDF</span></div>
              <p style={{ color:'var(--text-muted)', fontSize: 13, marginBottom: 16, lineHeight: 1.7 }}>
                Upload your resume PDF. It will be automatically attached to <strong>all 6 emails</strong> sent to each HR.
              </p>
              <input type="file" ref={resumeRef} accept=".pdf" style={{ display:'none' }} onChange={uploadResume} />
              <button className="btn btn-ghost" style={{ width:'100%', justifyContent:'center', marginBottom: 10 }} onClick={() => resumeRef.current?.click()}>
                📤 Upload Resume PDF
              </button>
              <div style={{ fontSize: 12, color:'var(--text-muted)' }}>
                {resumeName ? <span style={{ color:'var(--green)' }}>✅ Uploaded: {resumeName}</span> : <>Current: <code style={{ color:'var(--primary)' }}>public/resume.pdf</code></>}
              </div>
            </div>

            {/* ─── Danger Zone ─── */}
            <div className="card" style={{ gridColumn:'1/-1', border:'1px solid rgba(239,68,68,0.35)', background:'rgba(239,68,68,0.04)' }}>
              <div className="card-header"><span className="card-title" style={{ color:'#ef4444' }}>⚠️ Danger Zone</span></div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Clear All Contacts &amp; Companies</div>
                  <div style={{ fontSize: 13, color:'var(--text-muted)', marginTop: 4 }}>
                    Permanently deletes all {stats?.totalContacts?.toLocaleString() || 0} contacts, {stats?.totalCompanies?.toLocaleString() || 0} companies, and all email logs from the database.
                    This cannot be undone. Use this to start fresh with a new CSV.
                  </div>
                </div>
                {!confirmClear ? (
                  <button className="btn" style={{ background:'rgba(239,68,68,0.15)', color:'#ef4444', border:'1px solid rgba(239,68,68,0.4)', whiteSpace:'nowrap' }}
                    onClick={() => setConfirmClear(true)}>
                    🗑 Clear All Data
                  </button>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap: 8, alignItems:'flex-end' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color:'#ef4444' }}>Are you sure? This deletes everything from the DB.</div>
                    <div style={{ display:'flex', gap: 8 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmClear(false)}>Cancel</button>
                      <button className="btn btn-sm" style={{ background:'#ef4444', color:'#fff', fontWeight: 700 }}
                        onClick={clearAllContacts} disabled={clearing}>
                        {clearing ? '⏳ Deleting...' : '🗑 Yes, Delete Everything'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── TEMPLATES TAB ───────────────────────────────────────────────── */}
        {tab === 'templates' && (
          <div>
            <p style={{ color:'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
              Use <code style={{ color:'var(--primary)', background:'var(--bg-700)', padding:'1px 6px', borderRadius: 4 }}>{'{{HR Name}}'}</code>{' '}
              <code style={{ color:'var(--primary)', background:'var(--bg-700)', padding:'1px 6px', borderRadius: 4 }}>{'{{Company Name}}'}</code>{' '}
              <code style={{ color:'var(--primary)', background:'var(--bg-700)', padding:'1px 6px', borderRadius: 4 }}>{'{{LinkedIn}}'}</code>{' '}
              in templates — auto-replaced on send. <strong>**text**</strong> → <strong>bold</strong>.
            </p>

            {editingType ? (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">{TEMPLATE_TYPES.find(t => t.type === editingType)?.label}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingType(null)}>✕ Cancel</button>
                </div>
                <div className="form-group">
                  <label className="form-label">Subject Line</label>
                  <input className="input" value={editSubject} onChange={e => setEditSubject(e.target.value)} placeholder="e.g. B.Com Student Seeking Internship | {{Company Name}}" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Body (supports **bold** and {'{{placeholders}}'})</label>
                  <textarea className="textarea" value={editBody} onChange={e => setEditBody(e.target.value)}
                    style={{ minHeight: 360, fontFamily:'monospace', fontSize: 13 }} />
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-primary" onClick={saveTemplate} disabled={saving}>{saving ? 'Saving...' : '💾 Save Template'}</button>
                </div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap: 10 }}>
                {TEMPLATE_TYPES.map(tpl => {
                  const saved = templates.find(t => t.type === tpl.type)
                  return (
                    <div key={tpl.type} className="card" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{tpl.label}</div>
                        <div style={{ fontSize: 12, color:'var(--text-muted)', marginTop: 2 }}>{tpl.desc}</div>
                        {saved && <div style={{ fontSize: 12, color:'var(--text-dim)', marginTop: 3 }}>Subject: {saved.subject}</div>}
                      </div>
                      <div className="flex gap-2 items-center">
                        {saved ? <span style={{ fontSize: 12, color:'var(--green)', fontWeight: 600 }}>✅ Set</span>
                                : <span style={{ fontSize: 12, color:'var(--yellow)', fontWeight: 600 }}>⚠ Missing</span>}
                        <button className="btn btn-ghost btn-sm" onClick={() => { setEditingType(tpl.type); const t = templates.find(x => x.type === tpl.type); setEditSubject(t?.subject || ''); setEditBody(t?.htmlBody || '') }}>
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
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.type === 'success' ? '✅' : '❌'} {toast.msg}</div>}
    </AppShell>
  )
}
