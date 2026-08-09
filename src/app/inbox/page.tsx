'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import AppShell from '@/components/AppShell'

interface IncomingEmail {
  id: number
  fromEmail: string
  fromName: string | null
  subject: string
  body: string
  receivedAt: string
  aiStatus: string
  aiDraftReply: string | null
  replied: boolean
  repliedAt: string | null
  messageId: string | null
  company: { id: number; name: string } | null
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new:         { label: 'Processing…', color: 'var(--yellow)' },
  classifying: { label: 'AI Analysing…', color: 'var(--yellow)' },
  classified:  { label: 'Classified', color: 'var(--text-muted)' },
  draft_ready: { label: '✨ Draft Ready', color: 'var(--green)' },
  replied:     { label: 'Replied ✓', color: 'var(--text-muted)' },
  irrelevant:  { label: 'Other', color: 'var(--text-muted)' },
  bounced:     { label: '⚠️ Bounced', color: 'var(--red)' },
}

// Detect if string looks like HTML
function isHtml(str: string) {
  return /<[a-z][\s\S]*>/i.test(str)
}

export default function InboxPage() {
  const [emails, setEmails]             = useState<IncomingEmail[]>([])
  const [selected, setSelected]         = useState<IncomingEmail | null>(null)
  const [replyText, setReplyText]       = useState('')
  const [sending, setSending]           = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [syncing, setSyncing]           = useState(false)
  const [toast, setToast]               = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [loading, setLoading]           = useState(true)
  const [activeTab, setActiveTab]       = useState<'inbox' | 'replied' | 'other' | 'bounced'>('inbox')
  const [previewMode, setPreviewMode]   = useState<'rendered' | 'text'>('rendered')
  const iframeRef                       = useRef<HTMLIFrameElement>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/inbox')
      const data = await r.json()
      setEmails(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-refresh every 2 minutes to pick up new emails
  useEffect(() => {
    const interval = setInterval(load, 2 * 60_000)
    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    if (selected) setReplyText(selected.aiDraftReply || '')
  }, [selected])

  async function syncInbox() {
    setSyncing(true)
    const r = await fetch('/api/inbox/sync', { method: 'POST' })
    const d = await r.json()
    showToast(`Synced! ${d.newEmails} new email(s) found.`)
    load()
    setSyncing(false)
  }

  async function regenerateDraft() {
    if (!selected) return
    setRegenerating(true)
    const r = await fetch('/api/inbox/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailId: selected.id }),
    })
    const d = await r.json()
    if (d.draft) {
      setReplyText(d.draft)
      setSelected(prev => prev ? { ...prev, aiDraftReply: d.draft, aiStatus: 'draft_ready' } : prev)
      showToast('New draft generated!')
    }
    setRegenerating(false)
  }

  async function sendReply() {
    if (!selected || !replyText.trim()) return
    setSending(true)
    const r = await fetch('/api/inbox/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailId: selected.id, replyHtml: replyText }),
    })
    if (r.ok) {
      showToast('Reply sent! 🎉')
      setSelected(prev => prev ? { ...prev, replied: true, aiStatus: 'replied' } : prev)
      load()
    } else {
      showToast('Failed to send reply', 'error')
    }
    setSending(false)
  }

  // Categorise emails
  const inbox   = emails.filter(e => !e.replied && e.aiStatus !== 'irrelevant' && e.aiStatus !== 'bounced')
  const replied = emails.filter(e => e.replied)
  const other   = emails.filter(e => e.aiStatus === 'irrelevant')
  const bounced = emails.filter(e => e.aiStatus === 'bounced')

  const tabList = [
    { key: 'inbox',   label: `Inbox (${inbox.length})` },
    { key: 'replied', label: `Replied (${replied.length})` },
    { key: 'other',   label: `Other (${other.length})` },
    { key: 'bounced', label: `⚠️ Bounced (${bounced.length})` },
  ] as const

  const visibleList =
    activeTab === 'inbox'   ? inbox   :
    activeTab === 'replied' ? replied :
    activeTab === 'other'   ? other   : bounced

  // Build iframe HTML for rendering email
  const emailIframeSrc = selected ? `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>
        body { font-family: -apple-system, Arial, sans-serif; font-size: 14px; line-height: 1.7;
               color: #1e293b; margin: 0; padding: 16px; background: #fff; word-break: break-word; }
        a { color: #2563eb; }
        img { max-width: 100%; }
        table { max-width: 100%; }
        blockquote { border-left: 3px solid #cbd5e1; margin: 0; padding-left: 12px; color: #64748b; }
      </style>
    </head>
    <body>${isHtml(selected.body) ? selected.body : selected.body.replace(/\n/g, '<br>')}</body>
    </html>
  ` : ''

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <div className="page-title">Inbox</div>
          <div className="page-subtitle">
            {inbox.filter(e => e.aiStatus === 'draft_ready').length} drafts ready · auto-syncs every 2 min
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={syncInbox} disabled={syncing}>
          {syncing ? '⏳ Syncing…' : '🔄 Sync Now'}
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs mb-4">
        {tabList.map(t => (
          <button key={t.key}
            className={`tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => { setActiveTab(t.key); setSelected(null) }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="split-pane">
        {/* LEFT — Email list */}
        <div className="split-left">
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
          ) : visibleList.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">{activeTab === 'bounced' ? '✅' : '📭'}</div>
              <div className="empty-title">
                {activeTab === 'bounced' ? 'No bounced emails' : 'Nothing here'}
              </div>
              {activeTab === 'inbox' && (
                <button className="btn btn-primary btn-sm" onClick={syncInbox} style={{ marginTop: 16 }}>
                  🔄 Sync Inbox
                </button>
              )}
            </div>
          ) : (
            visibleList.map(email => {
              const st = STATUS_LABELS[email.aiStatus] || { label: email.aiStatus, color: 'var(--text-muted)' }
              const isBounced = email.aiStatus === 'bounced'
              return (
                <div key={email.id}
                  onClick={() => setSelected(email)}
                  style={{
                    padding: '14px 16px', cursor: 'pointer',
                    borderBottom: '1px solid var(--border)',
                    borderLeft: `3px solid ${
                      isBounced ? 'var(--red)' :
                      email.aiStatus === 'draft_ready' ? 'var(--green)' : 'var(--blue)'}`,
                    background: selected?.id === email.id ? 'var(--bg-700)' : 'transparent',
                  }}>
                  <div className="flex justify-between items-center">
                    <span style={{ fontWeight: 600, fontSize: 13, color: isBounced ? 'var(--red)' : 'var(--text)' }}>
                      {email.fromName || email.fromEmail.split('@')[0]}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: st.color }}>{st.label}</span>
                  </div>
                  {email.company && <div style={{ fontSize: 11.5, color: '#fff', marginTop: 3 }}>🏢 {email.company.name}</div>}
                  <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 4 }}>{email.subject}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                    {new Date(email.receivedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* RIGHT — Email detail */}
        <div className="split-right">
          {!selected ? (
            <div className="empty-state" style={{ marginTop: 80 }}>
              <div className="empty-icon">📬</div>
              <div className="empty-title">Select an email</div>
              <p>AI drafts replies automatically — just approve and send</p>
            </div>
          ) : (
            <>
              {/* Email Header */}
              <div className="card mb-4">
                <div className="flex justify-between items-center" style={{ marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.fromName || selected.fromEmail}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>{selected.fromEmail}</div>
                    {selected.company && (
                      <div style={{ color: '#fff', fontSize: 12.5, marginTop: 2 }}>🏢 {selected.company.name}</div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>
                    {new Date(selected.receivedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {selected.replied && <div style={{ color: 'var(--green)', fontWeight: 600, marginTop: 4 }}>✓ Replied</div>}
                    {selected.aiStatus === 'bounced' && <div style={{ color: 'var(--red)', fontWeight: 600, marginTop: 4 }}>⚠️ Invalid Email</div>}
                  </div>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>{selected.subject}</div>

                {/* Toggle: Rendered / Plain text */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  {(['rendered', 'text'] as const).map(mode => (
                    <button key={mode}
                      onClick={() => setPreviewMode(mode)}
                      style={{
                        fontSize: 11, padding: '3px 10px', borderRadius: 20, border: '1px solid var(--border-light)',
                        background: previewMode === mode ? '#fff' : 'transparent',
                        color: previewMode === mode ? '#0a0f1e' : 'var(--text-muted)', cursor: 'pointer',
                      }}>
                      {mode === 'rendered' ? '🌐 Rendered' : '📝 Plain text'}
                    </button>
                  ))}
                </div>

                {/* Email body */}
                {previewMode === 'rendered' ? (
                  <iframe
                    ref={iframeRef}
                    srcDoc={emailIframeSrc}
                    sandbox="allow-same-origin"
                    style={{
                      width: '100%', border: 'none', borderRadius: 8,
                      background: '#fff', minHeight: 200, maxHeight: 400,
                    }}
                    onLoad={e => {
                      // Auto-resize iframe to content height
                      const iframe = e.currentTarget
                      try {
                        const h = iframe.contentDocument?.body?.scrollHeight || 200
                        iframe.style.height = Math.min(h + 32, 400) + 'px'
                      } catch {}
                    }}
                  />
                ) : (
                  <div style={{
                    fontSize: 13.5, lineHeight: 1.7, color: 'var(--text-dim)',
                    background: 'var(--bg-700)', borderRadius: 8, padding: '14px 16px',
                    maxHeight: 300, overflowY: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace',
                  }}>
                    {selected.body}
                  </div>
                )}
              </div>

              {/* Bounced notice */}
              {selected.aiStatus === 'bounced' && (
                <div style={{ padding: '14px 16px', background: 'rgba(239,68,68,0.08)', borderRadius: 10,
                  border: '1px solid rgba(239,68,68,0.2)', marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, color: 'var(--red)', marginBottom: 6 }}>⚠️ Invalid / Bounced Email Address</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    This email address could not receive your message. It has been marked as invalid
                    and all future follow-ups to this contact have been stopped automatically.
                  </div>
                </div>
              )}

              {/* AI Draft Reply */}
              {!selected.replied && selected.aiStatus !== 'bounced' && selected.aiStatus !== 'irrelevant' && (
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">✨ AI Draft Reply</span>
                    <div className="flex gap-2">
                      <button className="btn btn-ghost btn-sm" onClick={regenerateDraft} disabled={regenerating}>
                        {regenerating ? '⏳' : '🔄'} Regenerate
                      </button>
                    </div>
                  </div>
                  {selected.aiStatus === 'classifying' || selected.aiStatus === 'new' ? (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                      ⏳ AI is analysing this email… will auto-update in ~30 seconds
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                        Edit the draft below. Sent as a reply from your Gmail.
                      </div>
                      <textarea
                        className="textarea"
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        style={{ minHeight: 200, fontSize: 13.5, lineHeight: 1.7 }}
                        placeholder="AI draft will appear here once classified…"
                      />
                      <div className="flex gap-2 mt-4" style={{ marginTop: 14 }}>
                        <button
                          className="btn btn-success"
                          onClick={sendReply}
                          disabled={sending || !replyText.trim()}
                          style={{ flex: 1, justifyContent: 'center' }}>
                          {sending ? '⏳ Sending…' : '✉️ Approve & Send Reply'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.type === 'success' ? '✅' : '❌'} {toast.msg}</div>}
    </AppShell>
  )
}
