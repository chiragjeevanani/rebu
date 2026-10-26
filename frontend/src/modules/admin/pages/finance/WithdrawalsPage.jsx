import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Banknote, Check, CircleCheck, Clock, Download, Hourglass, Landmark, Send, Smartphone, TriangleAlert, X } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { serverTable, useApi, usePaging } from '../../hooks/useApi'
import { api, errorText } from '../../api/client'
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
  Loading,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Stat,
  Status,
  Tabs,
  Who,
} from '../../components/ui'
import { ago, dateTime, exportCsv, inr, label, ms, num, pct } from '../../utils/format'

const DAY = 86400000
const STATUSES = ['requested', 'processing', 'paid', 'rejected']

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
  const valid = /^[A-Z0-9]{6,30}$/.test(clean)
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
  const { db, refreshCounts } = useStore()
  const toast = useToast()
  const [now] = useState(() => Date.now())
  const [tab, setTab] = useState('requested')
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('all')
  const [openId, setOpenId] = useState(null)
  const [modal, setModal] = useState(null) // paid | reject | approve
  const [busy, setBusy] = useState(false)
  const { economy } = db.config

  const pg = usePaging({ status: tab, kind, q: q.trim() || undefined }, 20)
  const res = useApi('/admin/finance/withdrawals', pg.query)
  const rows = res.data?.items || []
  const totals = res.data?.totals || {}
  const tot = st => totals[st] || { count: 0, amount: 0, net: 0 }

  // The latest paid payouts, for "paid this week" and time-to-pay.
  const paidRes = useApi('/admin/finance/withdrawals', { status: 'paid', limit: 100 })
  const paidList = paidRes.data?.items || []
  const paid7 = paidList.filter(w => w.paidAt && ms(w.paidAt) >= now - 7 * DAY)
  const timed = paidList.filter(w => w.paidAt)
  const avgPay = timed.length ? timed.reduce((n, w) => n + (ms(w.paidAt) - ms(w.ts)), 0) / timed.length : null

  // Name check: payout account holder vs the host's name on REBU.
  const nameOk = w => !w.method?.holder || !w.hostName || w.method.holder.trim().toLowerCase() === w.hostName.trim().toLowerCase()

  const detail = useApi(openId ? `/admin/finance/withdrawals/${openId}` : null)
  const w = openId ? detail.data?.withdrawal || rows.find(x => x.id === openId) || null : null
  const balance = detail.data?.balance || null
  const hostRes = useApi(w?.hostId ? `/admin/hosts/${w.hostId}` : null)
  const host = hostRes.data?.host || null

  const refresh = () => {
    res.reload()
    paidRes.reload()
    detail.reload()
    refreshCounts()
  }

  const run = async (fn, done) => {
    setBusy(true)
    try {
      const r = await fn()
      toast(done(r))
      refresh()
      return true
    } catch (e) {
      toast(errorText(e), 'error')
      refresh()
      return false
    } finally {
      setBusy(false)
    }
  }

  const approveMany = ids =>
    run(
      () => api.post('/admin/finance/withdrawals/bulk-approve', { ids }),
      r => `${r.approved} withdrawal${r.approved === 1 ? '' : 's'} approved · moved to processing${r.skipped ? ` · ${r.skipped} skipped` : ''}`,
    )

  const approve = () => run(() => api.post(`/admin/finance/withdrawals/${w.id}/approve`), () => 'Withdrawal approved · moved to processing')

  // The API only pays from processing, so a requested one is approved first.
  const markPaid = utr =>
    run(
      async () => {
        if (w.status === 'requested') await api.post(`/admin/finance/withdrawals/${w.id}/approve`)
        return api.post(`/admin/finance/withdrawals/${w.id}/paid`, { utr })
      },
      () => `${inr(w.net)} marked paid to ${w.hostName}`,
    )

  const reject = reason =>
    run(
      () => api.post(`/admin/finance/withdrawals/${w.id}/reject`, { reason }),
      () => `Rejected · ${inr(w.amount)} returned to ${w.hostName}’s balance`,
    )

  const columns = [
    { key: 'id', label: 'ID', render: x => <span className="a-mono">{x.id}</span> },
    {
      key: 'host',
      label: 'Host',
      render: x => <Who src={x.hostAvatar} name={x.hostName} sub={x.hostId} size={32} to={`/admin/hosts/${x.hostId}`} />,
    },
    { key: 'amount', label: 'Amount', align: 'right', serverSort: 'amount', render: x => inr(x.amount) },
    { key: 'fee', label: 'Fee', align: 'right', render: x => <span className="a-muted">{inr(x.fee)}</span> },
    { key: 'net', label: 'Net payable', align: 'right', render: x => <b className="a-strong">{inr(x.net)}</b> },
    { key: 'method', label: 'Method', render: x => <MethodCell m={x.method} /> },
    { key: 'kyc', label: 'KYC name', render: x => <NameCheck ok={nameOk(x)} /> },
    {
      key: 'ts',
      label: 'Requested',
      serverSort: 'ts',
      render: x => (
        <span className="a-nowrap" title={dateTime(x.ts)}>
          {ago(x.ts)}
        </span>
      ),
    },
    { key: 'status', label: 'Status', render: x => <Status value={x.status} /> },
  ]

  const flags = w
    ? [
        !nameOk(w) && `Account holder “${w.method.holder}” doesn’t match the host’s name “${host?.name ?? w.hostName}”.`,
        w.amount < economy.minWithdraw && `Below the ${inr(economy.minWithdraw)} minimum.`,
        w.amount > economy.maxWithdrawPerDay && `Above the ${inr(economy.maxWithdrawPerDay)} daily limit.`,
        host && host.status !== 'active' && `Host account is ${host.status}.`,
        balance && balance.onHold > 0 && `${inr(balance.onHold)} of this host’s earnings is on hold for review.`,
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
        <Stat label="Waiting for approval" value={inr(tot('requested').amount)} sub={`${num(tot('requested').count)} requests`} icon={Hourglass} />
        <Stat label="Processing" value={inr(tot('processing').amount)} sub={`${num(tot('processing').count)} approved, not yet paid`} icon={Send} />
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
          tabs={STATUSES.map(s => ({
            value: s,
            label: (
              <>
                {label(s)} <span className="a-small a-muted">· {inr(tot(s).amount)}</span>
              </>
            ),
            count: tot(s).count,
          }))}
        />
        <Card padded={false}>
          <DataTable
            key={tab}
            rows={rows}
            columns={columns}
            {...serverTable(pg, res)}
            onRowClick={x => setOpenId(x.id)}
            selectable={tab === 'requested'}
            bulk={(ids, clear) => (
              <Button
                size="sm"
                variant="primary"
                icon={Check}
                disabled={busy}
                onClick={async () => {
                  if (await approveMany(ids)) clear()
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
              <Button variant="soft-danger" icon={X} disabled={busy} onClick={() => setModal('reject')}>
                Reject
              </Button>
              {w.status === 'requested' ? (
                <Button icon={Check} disabled={busy} onClick={() => setModal('approve')}>
                  Approve
                </Button>
              ) : null}
              <Button variant="primary" icon={CircleCheck} disabled={busy} onClick={() => setModal('paid')}>
                Mark as paid
              </Button>
            </>
          ) : null
        }
      >
        {openId && !w ? <Loading /> : null}
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

            <Who src={w.hostAvatar} name={w.hostName} sub={balance ? `${w.hostId} · balance ${inr(balance.available)}` : w.hostId} to={`/admin/hosts/${w.hostId}`} />

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
              {w.method.kind === 'upi' ? null : (
                <>
                  <dt>Account</dt>
                  <dd className="a-mono">
                    {w.method.account || '—'}
                    {w.method.ifsc ? ` · ${w.method.ifsc}` : ''}
                  </dd>
                </>
              )}
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
            setModal(null)
            markPaid(utr)
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
          setModal(null)
          approve()
        }}
      />
      <Confirm
        open={modal === 'reject' && !!w}
        title="Reject withdrawal?"
        message={
          w && balance
            ? `${inr(w.amount)} goes back to ${w.hostName}’s available balance (${inr(balance.available)} → ${inr(balance.available + w.amount)}). The host sees the reason in the app.`
            : 'The host sees the reason in the app.'
        }
        confirmLabel="Reject & refund to balance"
        danger
        reason
        reasonLabel="Reason (shown to the host)"
        onClose={() => setModal(null)}
        onConfirm={reason => {
          setModal(null)
          reject(reason)
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
