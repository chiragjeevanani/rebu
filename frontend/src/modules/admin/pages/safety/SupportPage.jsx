import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, Clock, Inbox, LifeBuoy, RotateCcw, Send, UserCheck } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { Avatar, Badge, Button, Card, Empty, PageHeader, SearchInput, Select, Status, Tabs, Textarea, Who } from '../../components/ui'
import { ago, dateTime, label, num } from '../../utils/format'

const CANNED = [
  { key: 'coins', label: 'Coins credited', text: 'We’ve checked your payment and the coins are now credited to your REBU wallet. Please restart the app if you don’t see them yet.' },
  { key: 'refund', label: 'Refund initiated', text: 'We’ve initiated a refund to your original payment method. It usually reaches your account in 5–7 working days.' },
  { key: 'payid', label: 'Please share your payment ID', text: 'To help us trace this, please share the payment ID (it starts with “pay_”) or the UPI transaction ID from your bank app, along with a screenshot.' },
  { key: 'call', label: 'Call coins returned', text: 'Sorry about the dropped call. We’ve returned the coins for the affected minutes to your wallet.' },
  { key: 'withdraw', label: 'Withdrawal in progress', text: 'Your withdrawal is being processed by our finance team. Payouts usually complete within 24–48 hours.' },
  { key: 'safety', label: 'Safety team reviewing', text: 'Thank you for telling us. Our safety team is reviewing this now and will take action against the account if needed. You can also block them from their profile.' },
]

// Page-local layout: two panes on wide screens, one pane at a time on narrow ones.
const CSS = `
.sp-wrap { display: grid; grid-template-columns: minmax(300px, 380px) minmax(0, 1fr); gap: 16px; align-items: start; }
.sp-list { overflow: hidden; }
.sp-scroll { max-height: calc(100vh - 290px); min-height: 320px; overflow-y: auto; }
.sp-item { display: flex; gap: 10px; width: 100%; text-align: left; padding: 12px 16px; border: 0; border-bottom: 1px solid var(--border); background: none; color: inherit; cursor: pointer; font: inherit; }
.sp-item:hover { background: var(--surface-2); }
.sp-item.on { background: var(--brand-soft); }
.sp-item:last-child { border-bottom: 0; }
.sp-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--brand); flex-shrink: 0; margin-top: 6px; }
.sp-thread { display: flex; flex-direction: column; gap: 14px; padding: 18px; max-height: 460px; overflow-y: auto; background: var(--bg); }
.sp-msg { display: flex; gap: 8px; max-width: 82%; }
.sp-msg.admin { align-self: flex-end; flex-direction: row-reverse; }
.sp-bubble { padding: 10px 13px; border-radius: 14px; background: var(--surface); border: 1px solid var(--border); white-space: pre-wrap; overflow-wrap: anywhere; }
.sp-msg.admin .sp-bubble { background: var(--brand-soft); border-color: transparent; }
.sp-meta { font-size: 11.5px; color: var(--muted); margin-bottom: 4px; }
.sp-msg.admin .sp-meta { text-align: right; }
.sp-back { display: none; }
@media (max-width: 960px) {
  .sp-wrap { grid-template-columns: 1fr; }
  .sp-wrap.has-sel .sp-list { display: none; }
  .sp-wrap:not(.has-sel) .sp-detail { display: none; }
  .sp-back { display: inline-flex; }
  .sp-scroll { max-height: none; }
  .sp-msg { max-width: 92%; }
}
`

const fromLink = f => (f.type === 'host' ? `/admin/hosts/${f.id}` : `/admin/users/${f.id}`)

function TicketDetail({ t, me, onBack, update, toast }) {
  const [text, setText] = useState('')
  const [canned, setCanned] = useState('')
  const threadRef = useRef(null)
  const myName = me?.name || 'Admin'

  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [t.messages.length])

  const setStatus = (status, action) => {
    update('tickets', t.id, { status, updated: Date.now() }, [action, t.id])
    toast(`Ticket ${status === 'open' ? 'reopened' : `marked ${status}`}`)
  }

  const send = () => {
    const body = text.trim()
    if (!body) return
    const ts = Date.now()
    update(
      'tickets',
      t.id,
      x => ({
        messages: [...x.messages, { by: 'admin', name: myName, text: body, ts }],
        status: 'pending',
        updated: ts,
        assignee: x.assignee || myName,
      }),
      ['Replied to support ticket', t.id],
    )
    setText('')
    setCanned('')
    toast('Reply sent')
  }

  return (
    <Card padded={false} className="sp-detail">
      <div className="a-card-head" style={{ alignItems: 'flex-start' }}>
        <Button className="sp-back" variant="ghost" size="sm" iconOnly icon={ArrowLeft} onClick={onBack} aria-label="Back to tickets" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ overflowWrap: 'anywhere' }}>{t.subject}</h3>
          <p className="a-row wrap" style={{ gap: 8, marginTop: 6 }}>
            <span className="a-mono">{t.id}</span>
            <Status value={t.status} />
            <Badge>{t.category}</Badge>
            <span>Opened {dateTime(t.ts)}</span>
          </p>
        </div>
        <div className="a-row wrap" style={{ gap: 6, justifyContent: 'flex-end' }}>
          {t.status === 'open' ? (
            <Button size="sm" icon={Clock} onClick={() => setStatus('pending', 'Marked ticket pending')}>
              Mark pending
            </Button>
          ) : null}
          {t.status !== 'closed' ? (
            <Button size="sm" icon={CheckCircle2} onClick={() => setStatus('closed', 'Closed support ticket')}>
              Close
            </Button>
          ) : (
            <Button size="sm" icon={RotateCcw} onClick={() => setStatus('open', 'Reopened support ticket')}>
              Reopen
            </Button>
          )}
        </div>
      </div>

      <div className="a-card-body" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="a-grid c3" style={{ alignItems: 'center' }}>
          <div>
            <div className="a-small a-muted" style={{ marginBottom: 6 }}>From</div>
            <Who src={t.from.avatar} name={t.from.name} sub={`${label(t.from.type)} · ${t.from.id}`} size={32} to={fromLink(t.from)} />
          </div>
          <div>
            <div className="a-small a-muted" style={{ marginBottom: 6 }}>Priority</div>
            <Select
              value={t.priority}
              onChange={e => update('tickets', t.id, { priority: e.target.value }, [`Set ticket priority to ${e.target.value}`, t.id])}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
              ]}
            />
          </div>
          <div>
            <div className="a-small a-muted" style={{ marginBottom: 6 }}>Assignee</div>
            <div className="a-row wrap" style={{ gap: 8 }}>
              <b className={t.assignee ? 'a-strong' : 'a-faint'}>{t.assignee || 'Unassigned'}</b>
              {t.assignee !== myName ? (
                <Button size="sm" variant="ghost" icon={UserCheck} onClick={() => update('tickets', t.id, { assignee: myName }, ['Assigned ticket to self', t.id])}>
                  Assign to me
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="sp-thread" ref={threadRef}>
        {t.messages.map((m, i) => (
          <div key={`${m.ts}-${i}`} className={`sp-msg ${m.by === 'admin' ? 'admin' : ''}`}>
            <Avatar src={m.by === 'admin' ? null : t.from.avatar} name={m.name} size={28} />
            <div style={{ minWidth: 0 }}>
              <div className="sp-meta">
                <b>{m.name}</b>
                {m.by === 'admin' ? ' · Support' : ''} · {dateTime(m.ts)}
              </div>
              <div className="sp-bubble">{m.text}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="a-card-body a-stack" style={{ gap: 10, borderTop: '1px solid var(--border)' }}>
        <div className="a-row wrap" style={{ gap: 8 }}>
          <Select
            value={canned}
            onChange={e => {
              const c = CANNED.find(x => x.key === e.target.value)
              setCanned(e.target.value)
              if (c) setText(prev => (prev.trim() ? `${prev.trim()}\n\n${c.text}` : c.text))
            }}
            options={[{ value: '', label: 'Insert a canned reply…' }, ...CANNED.map(c => ({ value: c.key, label: c.label }))]}
            style={{ width: 'auto', minWidth: 220 }}
          />
          {t.status === 'closed' ? <span className="a-small a-muted">Replying reopens this ticket as pending.</span> : null}
        </div>
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={`Reply to ${t.from.name}… (Ctrl + Enter to send)`}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send()
          }}
          style={{ minHeight: 96 }}
        />
        <div className="a-row between">
          <span className="a-small a-muted">Sent as {myName}. The ticket moves to Pending.</span>
          <Button variant="primary" icon={Send} disabled={!text.trim()} onClick={send}>
            Send reply
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default function SupportPage() {
  const { db, me, update } = useStore()
  const toast = useToast()
  const [tab, setTab] = useState('open')
  const [category, setCategory] = useState('all')
  const [priority, setPriority] = useState('all')
  const [q, setQ] = useState('')
  const [selId, setSelId] = useState(null)

  const categories = useMemo(() => Array.from(new Set(db.tickets.map(t => t.category))).sort(), [db.tickets])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return db.tickets.filter(
      t =>
        (category === 'all' || t.category === category) &&
        (priority === 'all' || t.priority === priority) &&
        (!s || [t.id, t.subject, t.from.name, t.from.id, ...t.messages.map(m => m.text)].some(v => String(v).toLowerCase().includes(s))),
    )
  }, [db.tickets, category, priority, q])

  const counts = {
    open: filtered.filter(t => t.status === 'open').length,
    pending: filtered.filter(t => t.status === 'pending').length,
    closed: filtered.filter(t => t.status === 'closed').length,
  }
  const list = useMemo(() => filtered.filter(t => t.status === tab).sort((a, b) => b.updated - a.updated), [filtered, tab])
  const selected = selId ? db.tickets.find(t => t.id === selId) : null

  return (
    <>
      <style>{CSS}</style>
      <PageHeader
        title="Support"
        subtitle={`${num(db.tickets.filter(t => t.status === 'open').length)} open · ${num(db.tickets.filter(t => t.status === 'open' && !t.assignee).length)} unassigned · ${num(db.tickets.filter(t => t.status === 'pending').length)} waiting on the customer`}
      />

      <div className={`sp-wrap ${selected ? 'has-sel' : ''}`}>
        <Card padded={false} className="sp-list">
          <div style={{ padding: '6px 16px 0' }}>
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'open', label: 'Open', count: counts.open },
                { value: 'pending', label: 'Pending', count: counts.pending },
                { value: 'closed', label: 'Closed', count: counts.closed },
              ]}
            />
          </div>
          <div className="a-stack" style={{ gap: 8, padding: '0 16px 14px', borderBottom: '1px solid var(--border)' }}>
            <SearchInput value={q} onChange={setQ} placeholder="Subject, name, ticket ID" />
            <div className="a-row" style={{ gap: 8 }}>
              <Select value={category} onChange={e => setCategory(e.target.value)} options={[{ value: 'all', label: 'All categories' }, ...categories]} />
              <Select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                options={[
                  { value: 'all', label: 'Any priority' },
                  { value: 'high', label: 'High' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'low', label: 'Low' },
                ]}
              />
            </div>
          </div>
          <div className="sp-scroll">
            {list.length ? (
              list.map(t => {
                const unread = t.status === 'open'
                const last = t.messages[t.messages.length - 1]
                return (
                  <button key={t.id} type="button" className={`sp-item ${t.id === selId ? 'on' : ''}`} onClick={() => setSelId(t.id)}>
                    {unread ? <span className="sp-dot" aria-label="Needs reply" /> : <span style={{ width: 8, flexShrink: 0 }} />}
                    <Avatar src={t.from.avatar} name={t.from.name} size={36} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="a-row between" style={{ gap: 8 }}>
                        <span style={{ fontWeight: unread ? 800 : 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.from.name}</span>
                        <span className="a-small a-muted a-nowrap">{ago(t.updated)}</span>
                      </span>
                      <span style={{ display: 'block', fontWeight: unread ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.subject}</span>
                      <span className="a-small a-muted" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {last.by === 'admin' ? 'You: ' : ''}
                        {last.text}
                      </span>
                      <span className="a-row" style={{ gap: 6, marginTop: 6 }}>
                        {t.priority === 'high' ? <Status value="high">High</Status> : null}
                        <Badge>{t.category}</Badge>
                        <Badge tone={t.from.type === 'host' ? 'brand' : 'neutral'}>{label(t.from.type)}</Badge>
                      </span>
                    </span>
                  </button>
                )
              })
            ) : (
              <Empty icon={Inbox} title="No tickets" text={tab === 'open' ? 'Inbox zero. Nice.' : 'Nothing matches these filters.'} />
            )}
          </div>
        </Card>

        {selected ? (
          <TicketDetail key={selected.id} t={selected} me={me} update={update} toast={toast} onBack={() => setSelId(null)} />
        ) : (
          <Card className="sp-detail">
            <Empty icon={LifeBuoy} title="Select a ticket" text="Pick a conversation on the left to read and reply." />
          </Card>
        )}
      </div>
    </>
  )
}
