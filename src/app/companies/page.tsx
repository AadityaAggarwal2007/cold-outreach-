'use client'
import { useEffect, useState, useCallback } from 'react'
import AppShell from '@/components/AppShell'

const STAGES = [
  { key: 'pending', label: 'Pending', color: 'var(--text-muted)', bg: 'rgba(100,116,139,0.15)' },
  { key: 'active', label: 'Active', color: 'var(--blue)', bg: 'rgba(59,130,246,0.15)' },
  { key: 'replied', label: 'Replied', color: 'var(--green)', bg: 'rgba(16,185,129,0.15)' },
  { key: 'interview', label: 'Interview', color: 'var(--purple)', bg: 'rgba(168,85,247,0.15)' },
  { key: 'rejected', label: 'Rejected', color: 'var(--red)', bg: 'rgba(239,68,68,0.15)' },
]

interface Contact {
  id: number; name: string; email: string; status: string;
  followUpCount: number; lastSentAt: string | null;
  emailLogs: Array<{ id: number; type: string; subject: string; sentAt: string; openedAt: string | null; openCount: number; status: string }>
}

interface IncomingEmail {
  id: number; fromEmail: string; fromName: string | null;
  subject: string; receivedAt: string; aiStatus: string; replied: boolean;
}

interface Company {
  id: number; name: string; tier: string | null; stage: string;
  repliedAt: string | null; createdAt: string;
  contacts: Contact[];
  incomingEmails: IncomingEmail[];
  _count: { contacts: number; incomingEmails: number };
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [selected, setSelected] = useState<Company | null>(null)
  const [activeTab, setActiveTab] = useState(0)
  const [loading, setLoading] = useState(true)
  const [openedOnly, setOpenedOnly] = useState(false)
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: '50', search, ...(stageFilter ? { stage: stageFilter } : {}), ...(openedOnly ? { opened: 'true' } : {}) })
    const r = await fetch(`/api/companies?${params}`)
    const data = await r.json()
    setCompanies(data.companies || [])
    setTotal(data.total || 0)
    setLoading(false)
  }, [search, stageFilter, page, openedOnly])

  useEffect(() => { load() }, [load])

  async function updateStage(companyId: number, stage: string) {
    await fetch(`/api/companies/${companyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    })
    load()
    if (selected?.id === companyId) setSelected(prev => prev ? { ...prev, stage } : prev)
  }

  const stageInfo = (s: string) => STAGES.find(st => st.key === s) || STAGES[0]
  const followUpLabel = (n: number) => n === 0 ? 'Not sent' : n === 1 ? 'Initial sent' : `Follow-up ${n - 1} sent`

  return (
    <AppShell>
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Companies</div>
          <div className="page-subtitle">{total} companies across all tiers</div>
        </div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          {STAGES.map(s => (
            <button key={s.key} onClick={() => setStageFilter(stageFilter === s.key ? '' : s.key)}
              className="btn btn-sm btn-ghost"
              style={{ color: s.color, borderColor: stageFilter === s.key ? s.color : undefined, background: stageFilter === s.key ? s.bg : undefined }}>
              {s.label}
            </button>
          ))}
          <button onClick={() => setOpenedOnly(o => !o)}
            className="btn btn-sm btn-ghost"
            style={{ color: '#10b981', borderColor: openedOnly ? '#10b981' : undefined, background: openedOnly ? 'rgba(16,185,129,0.1)' : undefined }}>
            👁 Opened Only
          </button>
        </div>
      </div>

      {/* Split Pane */}
      <div className="split-pane">
        {/* LEFT — Company List */}
        <div className={`split-left${selected ? ' mobile-hide-when-selected' : ''}`}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div className="search-wrap">
              <span className="search-icon">🔍</span>
              <input className="input" placeholder="Search companies..." value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }} />
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
          ) : companies.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🏢</div>
              <div className="empty-title">No companies found</div>
              <p>Import your contacts from the Campaigns tab</p>
            </div>
          ) : (
            <div>
              {companies.map(company => {
                const st = stageInfo(company.stage)
                const hasReply = !!company.repliedAt
                return (
                  <div key={company.id}
                    onClick={() => { setSelected(company); setActiveTab(0) }}
                    style={{
                      padding: '14px 16px', cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      background: selected?.id === company.id ? 'var(--bg-700)' : 'transparent',
                      borderLeft: hasReply ? '3px solid var(--green)' : '3px solid transparent',
                      transition: 'background 0.1s',
                    }}>
                    <div className="flex justify-between items-center">
                      <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)' }}>{company.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, padding: '2px 8px', borderRadius: 10 }}>
                        {st.label}
                      </span>
                    </div>
                    <div className="flex gap-3 mt-4 text-sm text-muted" style={{ marginTop: 6, fontSize: 12 }}>
                      <span>👥 {company._count.contacts} HRs</span>
                      <span>📧 {company.contacts.reduce((a, c) => a + c.emailLogs.length, 0)} sent</span>
                      {(() => {
                        const opens = company.contacts.reduce((a, c) => a + c.emailLogs.filter(l => l.openedAt).length, 0)
                        return opens > 0 ? <span style={{ color: '#10b981', fontWeight: 600 }}>👁 {opens} opened</span> : null
                      })()}
                      {company._count.incomingEmails > 0 && <span style={{ color: 'var(--green)' }}>💬 {company._count.incomingEmails} replies</span>}
                    </div>
                    {company.tier && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{company.tier}</div>}
                  </div>
                )
              })}
              {companies.length < total && (
                <div style={{ padding: 16, textAlign: 'center' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => p + 1)}>Load More</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT — Company Detail */}
        <div className="split-right">
          {!selected ? (
            <div className="empty-state" style={{ marginTop: 80 }}>
              <div className="empty-icon">👈</div>
              <div className="empty-title">Select a company to view details</div>
              <p>Click any company on the left to see all HR contacts and email history</p>
            </div>
          ) : (
            <>
              <button className="mobile-back-btn" onClick={() => setSelected(null)}>← Back to list</button>
              {/* Company Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 800, wordBreak: 'break-word' }}>{selected.name}</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
                    {selected.tier} • {selected._count.contacts} HR contacts
                    {selected.repliedAt && <span style={{ color: 'var(--green)', marginLeft: 8 }}>✓ Replied {new Date(selected.repliedAt).toLocaleDateString()}</span>}
                  </p>
                </div>
                {/* Kanban Stage Selector */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {STAGES.map(s => (
                    <button key={s.key} onClick={() => updateStage(selected.id, s.key)}
                      style={{
                        padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        cursor: 'pointer', border: `2px solid ${selected.stage === s.key ? s.color : 'transparent'}`,
                        background: selected.stage === s.key ? s.bg : 'var(--bg-700)',
                        color: selected.stage === s.key ? s.color : 'var(--text-muted)',
                        transition: 'all 0.15s',
                      }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* HR Sub-tabs */}
              <div className="tabs" style={{ padding: 0, marginBottom: 20, background: 'transparent', borderBottom: '1px solid var(--border)' }}>
                {selected.contacts.map((c, i) => (
                  <button key={c.id} className={`tab ${activeTab === i ? 'active' : ''}`} onClick={() => setActiveTab(i)}>
                    {c.name.split(' ')[0]}
                    {c.status === 'stopped' && ' 🛑'}
                    {c.followUpCount > 1 && <span style={{ fontSize: 10, marginLeft: 4, color: 'var(--text-muted)' }}>F{c.followUpCount - 1}</span>}
                  </button>
                ))}
                {selected.incomingEmails.length > 0 && (
                  <button className={`tab ${activeTab === selected.contacts.length ? 'active' : ''}`}
                    onClick={() => setActiveTab(selected.contacts.length)}
                    style={{ color: 'var(--green)' }}>
                    💬 Replies ({selected.incomingEmails.length})
                  </button>
                )}
              </div>

              {/* HR Contact Detail */}
              {activeTab < selected.contacts.length && (() => {
                const contact = selected.contacts[activeTab]
                return (
                  <div>
                    <div className="card mb-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 16 }}>{contact.name}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{contact.email}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span className={`badge badge-${contact.status}`}>{contact.status}</span>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{followUpLabel(contact.followUpCount)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Email Timeline */}
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 16 }}>Email History</h3>
                    {contact.emailLogs.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No emails sent yet.</div>
                    ) : (
                      <div className="timeline">
                        {contact.emailLogs.map(log => (
                          <div key={log.id} className="timeline-item">
                            <div className={`timeline-dot ${log.openedAt ? 'opened' : ''}`} />
                            <div className="card" style={{ padding: '14px 16px' }}>
                              <div className="flex justify-between items-center">
                                <span style={{ fontWeight: 600, fontSize: 13 }}>{log.type === 'initial' ? '📩 Initial Email' : `🔄 ${log.type.replace('_', ' ').replace('followup', 'Follow-up')}`}</span>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(log.sentAt).toLocaleDateString()}</span>
                              </div>
                              <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 6 }}>{log.subject}</div>
                              <div style={{ marginTop: 8, display: 'flex', gap: 12, fontSize: 12 }}>
                                <span style={{ color: log.openedAt ? 'var(--green)' : 'var(--text-muted)' }}>
                                  {log.openedAt ? `✅ Opened ${log.openCount}×` : '📤 Sent'}
                                </span>
                                {log.openedAt && <span style={{ color: 'var(--text-muted)' }}>{new Date(log.openedAt).toLocaleDateString()}</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Incoming Emails Tab */}
              {activeTab === selected.contacts.length && (
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 16 }}>Incoming Replies</h3>
                  {selected.incomingEmails.map(email => (
                    <div key={email.id} className={`inbox-card ${!email.replied ? 'unread' : ''}`}>
                      <div className="flex justify-between items-center mb-4" style={{ marginBottom: 10 }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{email.fromName || email.fromEmail}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{email.fromEmail}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(email.receivedAt).toLocaleDateString()}</div>
                          {email.replied && <span style={{ color: 'var(--green)', fontSize: 11, fontWeight: 600 }}>Replied ✓</span>}
                        </div>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{email.subject}</div>
                      <a href="/inbox" style={{ color: 'var(--primary)', fontSize: 12.5, textDecoration: 'none' }}>
                        → View in Inbox & Reply
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  )
}
