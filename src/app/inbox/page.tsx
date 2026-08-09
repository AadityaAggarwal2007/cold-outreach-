'use client'
import { useEffect, useState, useCallback } from 'react'
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
  new: { label: 'New', color: 'var(--blue)' },
  classifying: { label: 'Analysing...', color: 'var(--yellow)' },
  classified: { label: 'Classified', color: 'var(--text-muted)' },
  draft_ready: { label: 'Draft Ready', color: 'var(--green)' },
  replied: { label: 'Replied ✓', color: 'var(--text-muted)' },
  irrelevant: { label: 'Irrelevant', color: 'var(--text-muted)' },
}

export default function InboxPage() {
  const [emails, setEmails] = useState<IncomingEmail[]>([])
  const [selected, setSelected] = useState<IncomingEmail | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [loading, setLoading] = useState(true)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    const r = await fetch('/api/inbox')
    const data = await r.json()
    setEmails(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (selected) {
      setReplyText(selected.aiDraftReply || '')
    }
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
      setSelected(prev => prev ? { ...prev, aiDraftReply: d.draft } : prev)
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
      showToast('Reply sent successfully! 🎉')
      setSelected(prev => prev ? { ...prev, replied: true, aiStatus: 'replied' } : prev)
      load()
    } else {
      showToast('Failed to send reply', 'error')
    }
    setSending(false)
  }

  const unreplied = emails.filter(e => !e.replied && e.aiStatus !== 'irrelevant')
  const replied = emails.filter(e => e.replied)

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <div className="page-title">Inbox</div>
          <div className="page-subtitle">{unreplied.length} awaiting your reply • AI drafts ready</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={syncInbox} disabled={syncing}>
          {syncing ? '⏳ Syncing...' : '🔄 Sync Now'}
        </button>
      </div>

      <div className="split-pane">
        {/* LEFT — Email List */}
        <div className="split-left">
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
          ) : emails.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <div className="empty-title">Inbox is empty</div>
              <p>Click "Sync Now" to check for new emails</p>
              <button className="btn btn-primary btn-sm" onClick={syncInbox} style={{ marginTop: 16 }}>
                🔄 Sync Inbox
              </button>
            </div>
          ) : (
            <>
              {unreplied.length > 0 && (
                <div style={{ padding: '10px 16px 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  Action Required ({unreplied.length})
                </div>
              )}
              {unreplied.map(email => {
                const st = STATUS_LABELS[email.aiStatus] || { label: email.aiStatus, color: 'var(--text-muted)' }
                return (
                  <div key={email.id}
                    onClick={() => setSelected(email)}
                    style={{
                      padding: '14px 16px', cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      borderLeft: `3px solid ${email.aiStatus === 'draft_ready' ? 'var(--primary)' : 'var(--blue)'}`,
                      background: selected?.id === email.id ? 'var(--bg-700)' : 'transparent',
                    }}>
                    <div className="flex justify-between items-center">
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                        {email.fromName || email.fromEmail.split('@')[0]}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: st.color }}>{st.label}</span>
                    </div>
                    {email.company && <div style={{ fontSize: 11.5, color: 'var(--primary)', marginTop: 3 }}>🏢 {email.company.name}</div>}
                    <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 4 }}>{email.subject}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                      {new Date(email.receivedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                )
              })}
              {replied.length > 0 && (
                <>
                  <div style={{ padding: '12px 16px 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                    Replied ({replied.length})
                  </div>
                  {replied.map(email => (
                    <div key={email.id}
                      onClick={() => setSelected(email)}
                      style={{
                        padding: '12px 16px', cursor: 'pointer',
                        borderBottom: '1px solid var(--border)',
                        opacity: 0.6,
                        background: selected?.id === email.id ? 'var(--bg-700)' : 'transparent',
                      }}>
                      <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-dim)' }}>
                        {email.fromName || email.fromEmail.split('@')[0]}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>{email.subject}</div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* RIGHT — Email Detail + Reply */}
        <div className="split-right">
          {!selected ? (
            <div className="empty-state" style={{ marginTop: 80 }}>
              <div className="empty-icon">📬</div>
              <div className="empty-title">Select an email to reply</div>
              <p>AI has drafted replies for you — just review and approve</p>
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
                      <div style={{ color: 'var(--primary)', fontSize: 12.5, marginTop: 2 }}>🏢 {selected.company.name}</div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>
                    {new Date(selected.receivedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                    {selected.replied && <div style={{ color: 'var(--green)', fontWeight: 600, marginTop: 4 }}>✓ You replied</div>}
                  </div>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>{selected.subject}</div>
                <div style={{
                  fontSize: 13.5, lineHeight: 1.7, color: 'var(--text-dim)',
                  background: 'var(--bg-700)', borderRadius: 8, padding: '14px 16px',
                  maxHeight: 240, overflowY: 'auto', whiteSpace: 'pre-wrap',
                }}>
                  {selected.body}
                </div>
              </div>

              {/* AI Draft Reply */}
              {!selected.replied && (
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">✨ AI Draft Reply</span>
                    <div className="flex gap-2">
                      <button className="btn btn-ghost btn-sm" onClick={regenerateDraft} disabled={regenerating}>
                        {regenerating ? '⏳' : '🔄'} Regenerate
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                    Edit the draft below before sending. It will be sent from your Gmail as a reply.
                  </div>
                  <textarea
                    className="textarea"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    style={{ minHeight: 200, fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.7 }}
                    placeholder="AI draft will appear here once the email is classified..."
                  />
                  <div className="flex gap-2 mt-4" style={{ marginTop: 14 }}>
                    <button
                      className="btn btn-success"
                      onClick={sendReply}
                      disabled={sending || !replyText.trim()}
                      style={{ flex: 1, justifyContent: 'center' }}>
                      {sending ? '⏳ Sending...' : '✉️ Approve & Send Reply'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && <div className={`toast ${toast.type}`}>{toast.type === 'success' ? '✅' : '❌'} {toast.msg}</div>}
    </AppShell>
  )
}
