import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleCheck, CircleX, Download, IndianRupee, ReceiptText, RotateCcw, TriangleAlert } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { serverTable, useApi, usePaging } from '../../hooks/useApi'
import { api, errorText } from '../../api/client'
import { Button, Card, Confirm, DataTable, Drawer, Empty, Loading, PageHeader, SearchInput, Seg, Select, Stat, Status, Tabs, Who } from '../../components/ui'
import { ago, dateTime, exportCsv, inr, num, pct } from '../../utils/format'

const DAY = 86400000
const STATUSES = ['success', 'pending', 'failed', 'refunded']
const RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: 'all', label: 'All' },
]

const total = t => t.coins + (t.bonus || 0)

function Coins({ t }) {
  return (
    <span className="a-nowrap">
      {num(t.coins)}
      {t.bonus ? <span className="a-success a-small"> +{num(t.bonus)}</span> : null}
    </span>
  )
}

/** Range → the API's `days` (fractional for "today": since local midnight). */
function daysFor(range, now) {
  if (range === 'all') return undefined
  if (range === 'today') {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return Math.max(0.001, (now - d.getTime()) / DAY).toFixed(4)
  }
  return range
}

export default function TransactionsPage() {
  const { db } = useStore()
  const toast = useToast()
  const [now] = useState(() => Date.now())
  const [tab, setTab] = useState('all')
  const [method, setMethod] = useState('all')
  const [range, setRange] = useState('30')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState(null)
  const [confirm, setConfirm] = useState(null) // refund | success | failed
  const [busy, setBusy] = useState(false)

  const filters = { status: tab === 'all' ? undefined : tab, method, days: daysFor(range, now), q: q.trim() || undefined }
  const pg = usePaging(filters, 20)
  const res = useApi('/admin/finance/transactions', pg.query)
  const rows = res.data?.items || []
  const totals = res.data?.totals || {}
  const methods = res.data?.methods || []

  // Totals are per status over the same filters (minus the status tab).
  const t = st => totals[st] || { count: 0, amount: 0 }
  const allCount = STATUSES.reduce((n, st) => n + t(st).count, 0)
  const success = t('success')
  const failed = t('failed')
  const refunded = t('refunded')
  const pending = t('pending')

  const detail = useApi(openId ? `/admin/finance/transactions/${openId}` : null)
  const tx = openId ? detail.data?.transaction || rows.find(x => x.id === openId) || null : null
  const userRes = useApi(tx?.userId ? `/admin/users/${tx.userId}` : null)
  const user = userRes.data?.user || null
  const userMissing = userRes.error?.status === 404
  const pack = tx ? db.config.coinPacks.find(p => p.id === tx.packId) : null

  const run = async (fn, done) => {
    setBusy(true)
    try {
      const r = await fn()
      toast(done(r))
      res.reload()
      detail.reload()
      userRes.reload()
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const refund = reason =>
    run(
      () => api.post(`/admin/finance/transactions/${tx.id}/refund`, { reason }),
      r => `Refunded ${inr(tx.amount)} to ${tx.userName} · ${num(r.deductedCoins)} coins removed`,
    )

  const markSuccess = () =>
    run(
      () => api.post(`/admin/finance/transactions/${tx.id}/success`),
      r => `Payment marked successful · ${num(r.coins)} coins credited`,
    )

  const markFailed = () => run(() => api.post(`/admin/finance/transactions/${tx.id}/failed`), () => 'Payment marked failed')

  const columns = [
    { key: 'id', label: 'ID', render: t => <span className="a-mono">{t.id}</span> },
    {
      key: 'user',
      label: 'User',
      render: t => <Who src={t.userAvatar} name={t.userName} sub={t.userId} size={32} to={`/admin/users/${t.userId}`} />,
    },
    { key: 'coins', label: 'Coins', align: 'right', serverSort: 'coins', render: t => <Coins t={t} /> },
    { key: 'amount', label: 'Amount', align: 'right', serverSort: 'amount', render: t => <b className="a-strong">{inr(t.amount)}</b> },
    { key: 'method', label: 'Method', render: t => t.method || '—' },
    { key: 'gatewayRef', label: 'Gateway ref', render: t => <span className="a-mono a-muted">{t.gatewayRef}</span> },
    {
      key: 'ts',
      label: 'When',
      serverSort: 'ts',
      render: t => (
        <span className="a-nowrap" title={dateTime(t.ts)}>
          {ago(t.ts)}
        </span>
      ),
    },
    { key: 'status', label: 'Status', render: t => <Status value={t.status} /> },
  ]

  const afterRefund = tx && user ? Math.max(0, user.coins - total(tx)) : 0
  const short = tx && user ? total(tx) - user.coins : 0

  return (
    <div className="a-stack" style={{ gap: 20 }}>
      <PageHeader
        title="Transactions"
        subtitle="Coin purchases through Razorpay. Refund, or settle payments stuck in pending."
        actions={
          <Button
            icon={Download}
            disabled={!rows.length}
            onClick={() =>
              exportCsv('rebu-transactions.csv', rows, [
                { label: 'ID', value: t => t.id },
                { label: 'User ID', value: t => t.userId },
                { label: 'User', value: t => t.userName },
                { label: 'Pack', value: t => t.packId },
                { label: 'Coins', value: t => t.coins },
                { label: 'Bonus', value: t => t.bonus },
                { label: 'Amount (INR)', value: t => t.amount },
                { label: 'Method', value: t => t.method },
                { label: 'Gateway', value: t => t.gateway },
                { label: 'Gateway ref', value: t => t.gatewayRef },
                { label: 'Time', value: t => new Date(t.ts).toISOString() },
                { label: 'Status', value: t => t.status },
              ])
            }
          >
            Export CSV
          </Button>
        }
      />

      <div className="a-grid c4">
        <Stat label="Successful amount" value={inr(success.amount)} sub={`${num(success.count)} payments`} icon={IndianRupee} />
        <Stat label="Transactions" value={num(allCount)} sub={pending.count ? `${num(pending.count)} pending` : 'none pending'} icon={ReceiptText} />
        <Stat label="Failed" value={pct(allCount ? (failed.count / allCount) * 100 : 0, 1)} sub={`${num(failed.count)} of ${num(allCount)}`} icon={CircleX} />
        <Stat label="Refunded" value={inr(refunded.amount)} sub={`${num(refunded.count)} payments`} icon={RotateCcw} />
      </div>

      <div>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'all', label: 'All', count: allCount },
            ...STATUSES.map(s => ({ value: s, label: s[0].toUpperCase() + s.slice(1), count: t(s).count })),
          ]}
        />
        <Card padded={false}>
          <DataTable
            rows={rows}
            columns={columns}
            {...serverTable(pg, res)}
            onRowClick={t => setOpenId(t.id)}
            empty={<Empty title="No transactions" text="Nothing matches these filters." />}
            toolbar={
              <>
                <SearchInput value={q} onChange={setQ} placeholder="Transaction ID, user, gateway ref" />
                <Select
                  value={method}
                  onChange={e => setMethod(e.target.value)}
                  options={[{ value: 'all', label: 'All methods' }, ...methods.map(m => ({ value: m, label: m }))]}
                />
                <Seg options={RANGES} value={range} onChange={setRange} />
              </>
            }
          />
        </Card>
      </div>

      <Drawer
        open={!!tx}
        title={tx ? `Payment ${tx.id}` : ''}
        onClose={() => setOpenId(null)}
        footer={
          tx?.status === 'success' ? (
            <Button variant="soft-danger" icon={RotateCcw} disabled={busy} onClick={() => setConfirm('refund')}>
              Refund
            </Button>
          ) : tx?.status === 'pending' ? (
            <>
              <Button variant="soft-danger" icon={CircleX} disabled={busy} onClick={() => setConfirm('failed')}>
                Mark failed
              </Button>
              <Button variant="primary" icon={CircleCheck} disabled={busy} onClick={() => setConfirm('success')}>
                Mark as successful
              </Button>
            </>
          ) : null
        }
      >
        {openId && !tx ? <Loading /> : null}
        {tx ? (
          <div className="a-stack" style={{ gap: 18 }}>
            <div className="a-row between">
              <div>
                <div className="a-stat-value">{inr(tx.amount)}</div>
                <div className="a-muted a-small">{dateTime(tx.ts)}</div>
              </div>
              <Status value={tx.status} />
            </div>
            <Who src={tx.userAvatar} name={tx.userName} sub={user ? `${tx.userId} · balance ${num(user.coins)} coins` : tx.userId} to={`/admin/users/${tx.userId}`} />
            <dl className="a-dl">
              <dt>Coin pack</dt>
              <dd>{pack ? `${pack.id}${pack.tag ? ` · ${pack.tag}` : ''}` : tx.packId}</dd>
              <dt>Coins</dt>
              <dd>
                {num(tx.coins)}
                {tx.bonus ? ` + ${num(tx.bonus)} bonus = ${num(total(tx))}` : ''}
              </dd>
              <dt>Amount</dt>
              <dd>{inr(tx.amount)}</dd>
              <dt>Method</dt>
              <dd>{tx.method || '—'}</dd>
              <dt>Gateway</dt>
              <dd>{tx.gateway}</dd>
              <dt>Gateway ref</dt>
              <dd className="a-mono">{tx.gatewayRef || '—'}</dd>
              <dt>Created</dt>
              <dd>{dateTime(tx.ts)}</dd>
              {tx.refundReason ? (
                <>
                  <dt>Refund reason</dt>
                  <dd>{tx.refundReason}</dd>
                </>
              ) : null}
              {tx.refundedAt ? (
                <>
                  <dt>Refunded</dt>
                  <dd>{dateTime(tx.refundedAt)}</dd>
                </>
              ) : null}
              {tx.handledBy ? (
                <>
                  <dt>Handled by</dt>
                  <dd>{tx.handledBy}</dd>
                </>
              ) : null}
            </dl>
            {tx.status === 'pending' ? (
              <p className="a-small a-muted">
                Check this payment in the Razorpay dashboard before settling it. Marking it successful credits {num(total(tx))} coins to the user.
              </p>
            ) : null}
            {userMissing ? (
              <p className="a-small a-warning a-row" style={{ gap: 6 }}>
                <TriangleAlert size={14} /> This user no longer exists, so no coin balance will change.
              </p>
            ) : (
              <Link to={`/admin/users/${tx.userId}`} className="a-small a-strong" style={{ color: 'var(--brand)' }}>
                Open user profile
              </Link>
            )}
          </div>
        ) : null}
      </Drawer>

      <Confirm
        open={confirm === 'refund' && !!tx}
        title={`Refund ${tx ? inr(tx.amount) : ''}?`}
        message={
          tx && user
            ? `The payment is marked refunded and ${num(total(tx))} coins are removed from ${tx.userName}’s balance (${num(user.coins)} → ${num(afterRefund)}).${
                short > 0 ? ` They’ve already spent ${num(short)} of these coins; the balance stops at 0.` : ''
              } Issue the money refund in Razorpay.`
            : 'The payment is marked refunded. Issue the money refund in Razorpay.'
        }
        confirmLabel="Refund"
        danger
        reason
        reasonLabel="Reason (kept in the audit log)"
        onClose={() => setConfirm(null)}
        onConfirm={reason => {
          refund(reason)
          setConfirm(null)
        }}
      />
      <Confirm
        open={confirm === 'success' && !!tx}
        title="Mark payment as successful?"
        message={tx ? `${num(total(tx))} coins will be credited to ${tx.userName}. Only do this after confirming the money was captured in Razorpay.` : ''}
        confirmLabel="Mark successful"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          markSuccess()
          setConfirm(null)
        }}
      />
      <Confirm
        open={confirm === 'failed' && !!tx}
        title="Mark payment as failed?"
        message="No coins are credited. Use this when Razorpay shows the payment failed or expired."
        confirmLabel="Mark failed"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          markFailed()
          setConfirm(null)
        }}
      />
    </div>
  )
}
