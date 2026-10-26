import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, X } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import {
  Button,
  Card,
  Confirm,
  DataTable,
  Drawer,
  Empty,
  Field,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Status,
  Tabs,
  Textarea,
  Who,
} from '../../components/ui'
import { ago, dateTime, inr, label, num, pct } from '../../utils/format'

// Timestamp for admin actions; called from event handlers only.
const stamp = () => Date.now()

const STATUSES = ['open', 'adjusted', 'rejected']
const SOURCE = {
  video: 'Video call',
  voice: 'Voice call',
  chat: 'Chat message',
  gift: 'Gift',
  ticket: 'Premium live ticket',
  bonus: 'Bonus',
}
const sourceLabel = s => SOURCE[s] || label(s)
const round2 = n => Math.round(n * 100) / 100

function AdjustModal({ d, host, onClose, onSave }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const n = round2(Number(amount) || 0)
  const balance = host?.available ?? 0
  const after = Math.max(0, balance + n)
  return (
    <Modal
      open
      title="Adjust earning"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} disabled={!n || !note.trim()} onClick={() => onSave(n, note.trim())}>
            {n < 0 ? `Debit ${inr(-n)}` : `Credit ${inr(n)}`}
          </Button>
        </>
      }
    >
      <div className="a-stack">
        <Field
          label="Correction (₹)"
          hint={
            host
              ? `Positive credits the host, negative debits. Available balance ${inr(balance)} → ${inr(after)}.`
              : 'Positive credits the host, negative debits.'
          }
        >
          <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 48" affix="₹" autoFocus />
        </Field>
        <Field label="Resolution note (shown to the host)">
          <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder={d.earning.source === 'gift' ? 'e.g. Gift wasn’t credited; added the missing amount.' : 'e.g. Call ran longer than billed; credited the difference.'} />
        </Field>
      </div>
    </Modal>
  )
}

function Line({ title, value, strong, muted }) {
  return (
    <div className="a-row between" style={{ padding: '6px 0' }}>
      <span className={muted ? 'a-muted' : undefined}>{title}</span>
      <span className={strong ? 'a-strong' : muted ? 'a-muted' : undefined}>{value}</span>
    </div>
  )
}

export default function DisputesPage() {
  const { db, me, update } = useStore()
  const toast = useToast()
  const [tab, setTab] = useState('open')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState(null)
  const [modal, setModal] = useState(null) // adjust | reject
  const { economy } = db.config

  const base = useMemo(() => {
    const s = q.trim().toLowerCase()
    return db.disputes.filter(
      d => !s || [d.id, d.hostId, d.hostName, d.earning.from, d.reason].some(v => String(v).toLowerCase().includes(s)),
    )
  }, [db.disputes, q])
  const rows = base.filter(d => d.status === tab)

  const d = openId ? db.disputes.find(x => x.id === openId) : null
  const host = d ? db.hosts.find(h => h.id === d.hostId) : null
  const agency = host?.agencyId ? db.agencies.find(a => a.id === host.agencyId) : null

  const b = useMemo(() => {
    if (!d) return null
    const commission = economy.commission[d.earning.source] ?? 0
    const gross = round2(d.earning.coins * economy.coinInr)
    const fee = round2((gross * commission) / 100)
    const share = round2(gross - fee)
    return { commission, gross, fee, share, diff: round2(share - d.earning.net) }
  }, [d, economy])

  const adjust = (amount, note) => {
    update('disputes', d.id, { status: 'adjusted', resolution: note, adjustment: amount, handledBy: me?.name, resolvedAt: stamp() }, [
      `Adjusted earning dispute ${amount < 0 ? '−' : '+'}${inr(Math.abs(amount))} · ${note}`,
      d.id,
    ])
    if (host) {
      update('hosts', host.id, h => ({ available: round2(Math.max(0, h.available + amount)) }), [
        `${amount < 0 ? 'Debited' : 'Credited'} ${inr(Math.abs(amount))} for dispute ${d.id}`,
        host.id,
      ])
    }
    toast(`${amount < 0 ? 'Debited' : 'Credited'} ${inr(Math.abs(amount))} ${amount < 0 ? 'from' : 'to'} ${d.hostName}`)
  }

  const reject = reason => {
    update('disputes', d.id, { status: 'rejected', resolution: reason, handledBy: me?.name, resolvedAt: stamp() }, [`Rejected earning dispute · ${reason}`, d.id])
    toast('Dispute rejected')
  }

  const columns = [
    {
      key: 'host',
      label: 'Host',
      sort: x => x.hostName,
      render: x => <Who src={x.hostAvatar} name={x.hostName} sub={x.hostId} size={32} to={`/admin/hosts/${x.hostId}`} />,
    },
    {
      key: 'earning',
      label: 'Earning',
      sort: x => x.earning.net,
      render: x => (
        <div style={{ minWidth: 0 }}>
          <b className="a-strong">{sourceLabel(x.earning.source)}</b> <span className="a-muted">from {x.earning.from}</span>
          <div className="a-small a-muted">
            {num(x.earning.coins)} coins · {inr(x.earning.net)} net
          </div>
        </div>
      ),
    },
    { key: 'reason', label: 'Reason', sort: x => x.reason },
    {
      key: 'ts',
      label: 'Reported',
      sort: x => x.ts,
      render: x => (
        <span className="a-nowrap" title={dateTime(x.ts)}>
          {ago(x.ts)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sort: x => x.status,
      render: x => (
        <span className="a-row" style={{ gap: 6 }}>
          <Status value={x.status} />
          {x.status === 'adjusted' && x.adjustment ? <span className="a-small a-muted">{x.adjustment > 0 ? '+' : ''}{inr(x.adjustment)}</span> : null}
        </span>
      ),
    },
  ]

  const openCount = db.disputes.filter(x => x.status === 'open').length

  return (
    <div className="a-stack" style={{ gap: 20 }}>
      <PageHeader
        title="Earning disputes"
        subtitle={`Hosts’ “Report a problem” on an earning · ${num(openCount)} open`}
      />

      <div>
        <Tabs value={tab} onChange={setTab} tabs={STATUSES.map(s => ({ value: s, label: label(s), count: base.filter(x => x.status === s).length }))} />
        <Card padded={false}>
          <DataTable
            rows={rows}
            columns={columns}
            initialSort={{ key: 'ts', dir: tab === 'open' ? 'asc' : 'desc' }}
            onRowClick={x => setOpenId(x.id)}
            empty={<Empty title={`No ${tab} disputes`} text={q ? 'Nothing matches this search.' : tab === 'open' ? 'All caught up.' : undefined} />}
            toolbar={<SearchInput value={q} onChange={setQ} placeholder="Dispute ID, host, user, reason" />}
          />
        </Card>
      </div>

      <Drawer
        open={!!d}
        title={d ? `Dispute ${d.id}` : ''}
        onClose={() => setOpenId(null)}
        footer={
          d?.status === 'open' ? (
            <>
              <Button variant="soft-danger" icon={X} onClick={() => setModal('reject')}>
                Reject
              </Button>
              <Button variant="primary" icon={Check} onClick={() => setModal('adjust')}>
                Adjust
              </Button>
            </>
          ) : null
        }
      >
        {d && b ? (
          <div className="a-stack" style={{ gap: 18 }}>
            <div className="a-row between">
              <Who src={d.hostAvatar} name={d.hostName} sub={host ? `${d.hostId} · balance ${inr(host.available)}` : d.hostId} to={`/admin/hosts/${d.hostId}`} />
              <Status value={d.status} />
            </div>

            <div>
              <div className="a-label" style={{ marginBottom: 4 }}>Host’s report</div>
              <b className="a-strong">{d.reason}</b>
              <div className="a-small a-muted">Reported {dateTime(d.ts)}</div>
            </div>

            <Card title={`${sourceLabel(d.earning.source)} from ${d.earning.from}`} subtitle={dateTime(d.earning.ts)}>
              <Line title="Coins" value={num(d.earning.coins)} />
              <Line title={`Gross at ${inr(economy.coinInr)} / coin`} value={inr(b.gross)} />
              <Line title={`REBU commission (${pct(b.commission)})`} value={`− ${inr(b.fee)}`} muted />
              <div className="a-divider" />
              <Line title="Host share at current rates" value={inr(b.share)} strong />
              <Line title="Recorded net credited" value={inr(d.earning.net)} strong />
              {Math.abs(b.diff) >= 0.01 ? (
                <p className="a-small a-warning" style={{ marginTop: 8 }}>
                  Differs by {inr(b.diff)} from the current-rate calculation; settings may have changed since this earning.
                </p>
              ) : null}
              {agency ? (
                <p className="a-small a-muted" style={{ marginTop: 8 }}>
                  {d.hostName} is with {agency.name}; the agency takes {pct(agency.cut ?? economy.agencyCut)} of the host’s share.
                </p>
              ) : null}
            </Card>

            {d.status !== 'open' ? (
              <dl className="a-dl">
                <dt>Resolution</dt>
                <dd>{d.resolution || '—'}</dd>
                {d.status === 'adjusted' && d.adjustment ? (
                  <>
                    <dt>Correction</dt>
                    <dd>
                      {d.adjustment > 0 ? '+' : ''}
                      {inr(d.adjustment)}
                    </dd>
                  </>
                ) : null}
                {d.handledBy ? (
                  <>
                    <dt>Handled by</dt>
                    <dd>
                      {d.handledBy}
                      {d.resolvedAt ? ` · ${dateTime(d.resolvedAt)}` : ''}
                    </dd>
                  </>
                ) : null}
              </dl>
            ) : null}

            <Link to={`/admin/hosts/${d.hostId}`} className="a-row a-small a-strong" style={{ gap: 6, color: 'var(--brand)' }}>
              Open host profile <ArrowRight size={14} />
            </Link>
          </div>
        ) : null}
      </Drawer>

      {modal === 'adjust' && d ? (
        <AdjustModal
          d={d}
          host={host}
          onClose={() => setModal(null)}
          onSave={(amount, note) => {
            adjust(amount, note)
            setModal(null)
          }}
        />
      ) : null}
      <Confirm
        open={modal === 'reject' && !!d}
        title="Reject dispute?"
        message="No balance changes. The host sees your reason in the app."
        confirmLabel="Reject"
        danger
        reason
        reasonLabel="Reason (shown to the host)"
        onClose={() => setModal(null)}
        onConfirm={reason => {
          reject(reason)
          setModal(null)
        }}
      />
    </div>
  )
}
