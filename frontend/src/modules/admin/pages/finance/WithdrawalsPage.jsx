import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Banknote, Check, CircleCheck, Clock, Download, Hourglass, Landmark, Send, Smartphone, TriangleAlert, X } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import {
  Badge,
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
  Select,
  Stat,
  Status,
  Tabs,
  Who,
} from '../../components/ui'
import { ago, dateTime, exportCsv, inr, label, num, pct } from '../../utils/format'

// Timestamp for admin actions; called from event handlers only.
const stamp = () => Date.now()

const DAY = 86400000
const STATUSES = ['requested', 'processing', 'paid', 'rejected']
const sumAmount = list => list.reduce((n, w) => n + w.amount, 0)

function hours(ms) {
  const h = ms / 3600000
  return h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} days`
}

function NameCheck({ ok }) {
  return ok ? <Badge tone="success">Name matches</Badge> : <Badge tone="danger">Check name</Badge>
}

function MethodCell({ m }) {
  const Icon = m.kind === 'upi' ? Smartphone : Landmark
  return (
    <span className="a-row" style={{ gap: 8, alignItems: 'flex-start' }}>
      <Icon size={16} className="a-muted" style={{ marginTop: 2, flexShrink: 0 }} />
      <span style={{ minWidth: 0 }}>
        <span className="a-strong a-nowrap" style={{ display: 'block' }}>
          {m.label}
        </span>
        <span className="a-small a-muted">{m.holder}</span>
      </span>
    </span>
  )
}

function TimelineItem({ on, title, sub }) {
  return (
    <div className="a-tl-item">
      <span className={`a-tl-dot ${on ? 'on' : ''}`} />
      <div>
        <b className={on ? 'a-strong' : 'a-faint'}>{title}</b>
        {sub ? <div className="a-small a-muted">{sub}</div> : null}
      </div>
    </div>
  )
}

function PaidModal({ w, onClose, onSave }) {
  const [utr, setUtr] = useState('')
  const clean = utr.trim().toUpperCase()
  const valid = /^[A-Z0-9-]{6,30}$/.test(clean)
  return (
    <Modal
      open
      title="Mark as paid"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} disabled={!valid} onClick={() => onSave(clean)}>
            Mark paid
          </Button>
        </>
      }
    >
      <div className="a-stack">
        <p className="a-muted">
          Send <b className="a-strong">{inr(w.net)}</b> to {w.method.label} ({w.method.holder}), then record the bank reference here.
        </p>
        <Field label="UTR / reference number" hint="6–30 letters or digits, as shown in the bank or UPI confirmation" error={clean && !valid ? 'Doesn’t look like a valid reference' : null}>
          <Input value={utr} onChange={e => setUtr(e.target.value)} placeholder="e.g. UTR412345678" autoFocus className="a-mono" />
        </Field>
      </div>
    </Modal>
  )
}

export default function WithdrawalsPage() {
  const { db, me, update } = useStore()
  const toast = useToast()
  const [now] = useState(() => Date.now())
  const [tab, setTab] = useState('requested')
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('all')
  const [openId, setOpenId] = useState(null)
  const [modal, setModal] = useState(null) // paid | reject | approve
  const { economy } = db.config

  const hosts = useMemo(() => Object.fromEntries(db.hosts.map(h => [h.id, h])), [db.hosts])
  const nameOk = w => w.method.holder === (hosts[w.hostId]?.name ?? w.hostName)

  const base = useMemo(() => {
    const s = q.trim().toLowerCase()
    return db.withdrawals.filter(
      w =>
        (kind === 'all' || w.method.kind === kind) &&
        (!s || [w.id, w.hostId, w.hostName, w.method.label, w.method.holder, w.utr].some(v => String(v || '').toLowerCase().includes(s))),
    )
  }, [db.withdrawals, q, kind])
  const rows = base.filter(w => w.status === tab)

  const all = db.withdrawals
  const of = st => all.filter(w => w.status === st)
  const paidAtOf = w => w.paidAt ?? w.ts
  const paid7 = of('paid').filter(w => paidAtOf(w) >= now - 7 * DAY)
  const timed = of('paid').filter(w => w.paidAt)
  const avgPay = timed.length ? timed.reduce((n, w) => n + (w.paidAt - w.ts), 0) / timed.length : null

  const w = openId ? db.withdrawals.find(x => x.id === openId) : null
  const host = w ? hosts[w.hostId] : null

  const approve = ids => {
    const list = db.withdrawals.filter(x => ids.includes(x.id) && x.status === 'requested')
    list.forEach(x =>
      update('withdrawals', x.id, { status: 'processing', approvedAt: stamp(), handledBy: me?.name }, [`Approved withdrawal ${inr(x.amount)}`, x.id]),
    )
    return list.length
  }

  const markPaid = utr => {
    update('withdrawals', w.id, { status: 'paid', utr, handledBy: me?.name, paidAt: stamp() }, [`Marked withdrawal paid · UTR ${utr}`, w.id])
    toast(`${inr(w.net)} marked paid to ${w.hostName}`)
  }

  const reject = reason => {
    update('withdrawals', w.id, { status: 'rejected', note: reason, handledBy: me?.name, rejectedAt: stamp() }, [`Rejected withdrawal · ${reason}`, w.id])
    if (host) {
      update('hosts', host.id, h => ({ available: h.available + w.amount }), [`Returned ${inr(w.amount)} to balance for rejected withdrawal ${w.id}`, host.id])
    }
    toast(host ? `Rejected · ${inr(w.amount)} returned to ${w.hostName}’s balance` : 'Withdrawal rejected')
  }

  const columns = [
    { key: 'id', label: 'ID', sort: x => x.id, render: x => <span className="a-mono">{x.id}</span> },
    {
      key: 'host',
      label: 'Host',
      sort: x => x.hostName,
      render: x => <Who src={x.hostAvatar} name={x.hostName} sub={x.hostId} size={32} to={`/admin/hosts/${x.hostId}`} />,
    },
    { key: 'amount', label: 'Amount', align: 'right', sort: x => x.amount, render: x => inr(x.amount) },
    { key: 'fee', label: 'Fee', align: 'right', sort: x => x.fee, render: x => <span className="a-muted">{inr(x.fee)}</span> },
    { key: 'net', label: 'Net payable', align: 'right', sort: x => x.net, render: x => <b className="a-strong">{inr(x.net)}</b> },
    { key: 'method', label: 'Method', render: x => <MethodCell m={x.method} /> },
    { key: 'kyc', label: 'KYC name', sort: x => (nameOk(x) ? 1 : 0), render: x => <NameCheck ok={nameOk(x)} /> },
    {
      key: 'ts',
      label: 'Requested',
      sort: x => x.ts,
      render: x => (
        <span className="a-nowrap" title={dateTime(x.ts)}>
          {ago(x.ts)}
        </span>
      ),
    },
    { key: 'status', label: 'Status', sort: x => x.status, render: x => <Status value={x.status} /> },
  ]

  const flags = w
    ? [
        !nameOk(w) && `Account holder “${w.method.holder}” doesn’t match the host’s verified name “${host?.name ?? w.hostName}”.`,
        w.amount < economy.minWithdraw && `Below the ${inr(economy.minWithdraw)} minimum.`,
        w.amount > economy.maxWithdrawPerDay && `Above the ${inr(economy.maxWithdrawPerDay)} daily limit.`,
        host && host.status !== 'active' && `Host account is ${host.status}.`,
      ].filter(Boolean)
    : []

  const open = w && (w.status === 'requested' || w.status === 'processing')

  return (
    <div className="a-stack" style={{ gap: 20 }}>
      <PageHeader
        title="Withdrawals"
        subtitle="Host payout queue. Approve, pay out and record the UTR, or reject and return the money to the host."
        actions={
          <Button
            icon={Download}
            disabled={!rows.length}
            onClick={() =>
              exportCsv(`rebu-withdrawals-${tab}.csv`, rows, [
                { label: 'ID', value: x => x.id },
                { label: 'Host ID', value: x => x.hostId },
                { label: 'Host', value: x => x.hostName },
                { label: 'Amount (INR)', value: x => x.amount },
                { label: 'Fee (INR)', value: x => x.fee },
                { label: 'Net payable (INR)', value: x => x.net },
                { label: 'Method', value: x => x.method.kind.toUpperCase() },
                { label: 'Account', value: x => x.method.label },
                { label: 'Holder', value: x => x.method.holder },
                { label: 'Name matches', value: x => (nameOk(x) ? 'yes' : 'no') },
                { label: 'Requested', value: x => new Date(x.ts).toISOString() },
                { label: 'Status', value: x => x.status },
                { label: 'UTR', value: x => x.utr },
                { label: 'Note', value: x => x.note },
                { label: 'Handled by', value: x => x.handledBy },
              ])
            }
          >
            Export CSV
          </Button>
        }
      />

      <div className="a-grid c4">
        <Stat label="Waiting for approval" value={inr(sumAmount(of('requested')))} sub={`${num(of('requested').length)} requests`} icon={Hourglass} />
        <Stat label="Processing" value={inr(sumAmount(of('processing')))} sub={`${num(of('processing').length)} approved, not yet paid`} icon={Send} />
        <Stat label="Paid · last 7 days" value={inr(paid7.reduce((n, x) => n + x.net, 0))} sub={`${num(paid7.length)} payouts (net)`} icon={Banknote} />
        <Stat
          label="Avg. time to pay"
          value={avgPay == null ? '—' : hours(avgPay)}
          sub={avgPay == null ? 'Measured on payouts marked paid here' : `across ${num(timed.length)} payouts · target ${economy.payoutTime}`}
          icon={Clock}
        />
      </div>

      <Card
        title="Payout rules"
        subtitle="What hosts see in the app when they withdraw"
        actions={
          <Link to="/admin/monetization/economy" className="a-row a-small a-strong" style={{ gap: 6, color: 'var(--brand)' }}>
            Edit <ArrowRight size={14} />
          </Link>
        }
      >
        <div className="a-grid c4">
          <RuleItem title="Minimum withdrawal" value={inr(economy.minWithdraw)} />
          <RuleItem title="Withdrawal fee" value={pct(economy.withdrawFee)} />
          <RuleItem title="Payout time" value={economy.payoutTime} />
          <RuleItem title="Max per day" value={inr(economy.maxWithdrawPerDay)} />
        </div>
      </Card>

      <div>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={STATUSES.map(s => {
            const list = base.filter(x => x.status === s)
            return {
              value: s,
              label: (
                <>
                  {label(s)} <span className="a-small a-muted">· {inr(sumAmount(list))}</span>
                </>
              ),
              count: list.length,
            }
          })}
        />
        <Card padded={false}>
          <DataTable
            key={tab}
            rows={rows}
            columns={columns}
            initialSort={{ key: 'ts', dir: tab === 'requested' ? 'asc' : 'desc' }}
            onRowClick={x => setOpenId(x.id)}
            selectable={tab === 'requested'}
            bulk={(ids, clear) => (
              <Button
                size="sm"
                variant="primary"
                icon={Check}
                onClick={() => {
                  const n = approve(ids)
                  toast(`${n} withdrawal${n === 1 ? '' : 's'} approved · moved to processing`)
                  clear()
                }}
              >
                Approve
              </Button>
            )}
            empty={<Empty title={`No ${tab} withdrawals`} text={q || kind !== 'all' ? 'Nothing matches these filters.' : 'The queue is clear.'} />}
            toolbar={
              <>
                <SearchInput value={q} onChange={setQ} placeholder="ID, host, account, UTR" />
                <Select
                  value={kind}
                  onChange={e => setKind(e.target.value)}
                  options={[
                    { value: 'all', label: 'UPI & bank' },
                    { value: 'upi', label: 'UPI only' },
                    { value: 'bank', label: 'Bank only' },
                  ]}
                />
              </>
            }
          />
        </Card>
      </div>

      <Drawer
        open={!!w}
        title={w ? `Withdrawal ${w.id}` : ''}
        onClose={() => setOpenId(null)}
        footer={
          open ? (
            <>
              <Button variant="soft-danger" icon={X} onClick={() => setModal('reject')}>
                Reject
              </Button>
              {w.status === 'requested' ? (
                <Button icon={Check} onClick={() => setModal('approve')}>
                  Approve
                </Button>
              ) : null}
              <Button variant="primary" icon={CircleCheck} onClick={() => setModal('paid')}>
                Mark as paid
              </Button>
            </>
          ) : null
        }
      >
        {w ? (
          <div className="a-stack" style={{ gap: 18 }}>
            <div className="a-row between">
              <div>
                <div className="a-stat-value">{inr(w.net)}</div>
                <div className="a-muted a-small">
                  net payable · {inr(w.amount)} − {inr(w.fee)} fee
                </div>
              </div>
              <Status value={w.status} />
            </div>

            <Who src={w.hostAvatar} name={w.hostName} sub={host ? `${w.hostId} · balance ${inr(host.available)}` : w.hostId} to={`/admin/hosts/${w.hostId}`} />

            {flags.length ? (
              <div className="a-card" style={{ padding: 12, background: 'var(--danger-soft)', borderColor: 'transparent', boxShadow: 'none' }}>
                {flags.map(f => (
                  <div key={f} className="a-row a-small" style={{ gap: 6, alignItems: 'flex-start' }}>
                    <TriangleAlert size={14} className="a-danger" style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="a-timeline">
              <TimelineItem on title="Requested" sub={dateTime(w.ts)} />
              {w.status === 'rejected' ? (
                <TimelineItem on title="Rejected" sub={[w.rejectedAt && dateTime(w.rejectedAt), w.handledBy, w.note].filter(Boolean).join(' · ')} />
              ) : (
                <>
                  <TimelineItem
                    on={w.status !== 'requested'}
                    title="Approved"
                    sub={w.status === 'requested' ? 'Waiting for finance' : w.approvedAt ? dateTime(w.approvedAt) : w.handledBy}
                  />
                  <TimelineItem
                    on={w.status === 'paid'}
                    title="Paid"
                    sub={w.status === 'paid' ? [w.paidAt && dateTime(w.paidAt), w.utr].filter(Boolean).join(' · ') : `Expected within ${economy.payoutTime}`}
                  />
                </>
              )}
            </div>

            <dl className="a-dl">
              <dt>Amount</dt>
              <dd>{inr(w.amount)}</dd>
              <dt>Fee</dt>
              <dd>
                {inr(w.fee)} <span className="a-muted">({pct(w.amount ? (w.fee / w.amount) * 100 : 0, 1)})</span>
              </dd>
              <dt>Net payable</dt>
              <dd>{inr(w.net)}</dd>
              <dt>Method</dt>
              <dd>
                {w.method.kind === 'upi' ? 'UPI' : 'Bank transfer'} · {w.method.label}
              </dd>
              <dt>Account holder</dt>
              <dd className="a-row" style={{ gap: 8 }}>
                {w.method.holder} <NameCheck ok={nameOk(w)} />
              </dd>
              {host ? (
                <>
                  <dt>Verified ID</dt>
                  <dd>
                    {host.idType} ••{host.idLast4}
                  </dd>
                </>
              ) : null}
              {w.utr ? (
                <>
                  <dt>UTR</dt>
                  <dd className="a-mono">{w.utr}</dd>
                </>
              ) : null}
              {w.note ? (
                <>
                  <dt>Note</dt>
                  <dd>{w.note}</dd>
                </>
              ) : null}
              {w.handledBy ? (
                <>
                  <dt>Handled by</dt>
                  <dd>{w.handledBy}</dd>
                </>
              ) : null}
            </dl>
          </div>
        ) : null}
      </Drawer>

      {modal === 'paid' && w ? (
        <PaidModal
          w={w}
          onClose={() => setModal(null)}
          onSave={utr => {
            markPaid(utr)
            setModal(null)
          }}
        />
      ) : null}
      <Confirm
        open={modal === 'approve' && !!w}
        title="Approve withdrawal?"
        message={w ? `${inr(w.net)} to ${w.hostName} moves to processing. Mark it paid once the transfer is done.` : ''}
        confirmLabel="Approve"
        onClose={() => setModal(null)}
        onConfirm={() => {
          approve([w.id])
          toast('Withdrawal approved · moved to processing')
          setModal(null)
        }}
      />
      <Confirm
        open={modal === 'reject' && !!w}
        title="Reject withdrawal?"
        message={
          w && host
            ? `${inr(w.amount)} goes back to ${w.hostName}’s available balance (${inr(host.available)} → ${inr(host.available + w.amount)}). The host sees the reason in the app.`
            : 'The host sees the reason in the app.'
        }
        confirmLabel="Reject & refund to balance"
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

function RuleItem({ title, value }) {
  return (
    <div>
      <div className="a-small a-muted">{title}</div>
      <div className="a-strong">{value}</div>
    </div>
  )
}
