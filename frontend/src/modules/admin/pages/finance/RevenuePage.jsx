import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CircleCheck, Download, HandCoins, IndianRupee, Percent, RotateCcw, UsersRound, Wallet } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { Button, Card, Empty, PageHeader, Seg, Stat } from '../../components/ui'
import { BarList, TrendChart } from '../../components/charts'
import { compact, date, exportCsv, inr, num, pct } from '../../utils/format'

const DAY = 86400000
const sum = (list, key) => list.reduce((n, x) => n + (Number(x[key]) || 0), 0)
// Only report a trend when there is a full previous period to compare with.
const trend = (cur, prev, ok) => (ok && prev ? ((cur - prev) / prev) * 100 : null)

const SOURCES = [
  ['video', 'Video calls'],
  ['voice', 'Voice calls'],
  ['chat', 'Chat messages'],
  ['gift', 'Gifts'],
  ['ticket', 'Premium live tickets'],
]

const packLabel = p => `${num(p.coins)}${p.bonus ? ` + ${num(p.bonus)}` : ''} coins · ${inr(p.price)}`

/** Payment-record KPIs for one time window. */
function txKpis(list) {
  const ok = list.filter(t => t.status === 'success')
  const settled = list.filter(t => t.status !== 'pending')
  // A refunded payment was captured first, so it counts as a successful attempt.
  const captured = settled.filter(t => t.status === 'success' || t.status === 'refunded')
  const refunded = list.filter(t => t.status === 'refunded')
  const paying = new Set(ok.map(t => t.userId)).size
  const revenue = sum(ok, 'amount')
  return {
    paying,
    arppu: paying ? revenue / paying : 0,
    successRate: settled.length ? (captured.length / settled.length) * 100 : 0,
    attempts: settled.length,
    refunds: sum(refunded, 'amount'),
    refundCount: refunded.length,
  }
}

function groupSum(list, keyOf, valueOf) {
  const out = {}
  for (const x of list) {
    const k = keyOf(x)
    out[k] = (out[k] || 0) + valueOf(x)
  }
  return out
}

export default function RevenuePage() {
  const { db } = useStore()
  const [range, setRange] = useState(7)
  const [now] = useState(() => Date.now())
  const { economy, coinPacks } = db.config

  const m = db.metrics
  const cur = m.slice(-range)
  const prev = m.slice(-range * 2, -range)
  const hasPrev = prev.length === cur.length

  const k = useMemo(() => {
    const revenue = sum(cur, 'revenue')
    const payouts = sum(cur, 'hostPayouts')
    const net = revenue - payouts
    const pRevenue = sum(prev, 'revenue')
    const pPayouts = sum(prev, 'hostPayouts')
    const pNet = pRevenue - pPayouts
    return {
      revenue,
      payouts,
      net,
      take: revenue ? (net / revenue) * 100 : 0,
      prevTake: pRevenue ? (pNet / pRevenue) * 100 : 0,
      revenueT: trend(revenue, pRevenue, hasPrev),
      payoutsT: trend(payouts, pPayouts, hasPrev),
      netT: trend(net, pNet, hasPrev),
    }
  }, [cur, prev, hasPrev])

  const since = now - range * DAY
  const txCur = useMemo(() => db.transactions.filter(t => t.ts >= since), [db.transactions, since])
  const txPrev = useMemo(
    () => db.transactions.filter(t => t.ts >= since - range * DAY && t.ts < since),
    [db.transactions, since, range],
  )
  // Payment records only go back ~30 days, so a 30-day window has no comparable previous period.
  const txHasPrev = range < 30 && txPrev.length > 0
  const tk = txKpis(txCur)
  const tp = txKpis(txPrev)

  const paid = txCur.filter(t => t.status === 'success')
  const byPack = useMemo(() => {
    const packs = Object.fromEntries(coinPacks.map(p => [p.id, p]))
    const totals = groupSum(paid, t => t.packId, t => t.amount)
    return Object.entries(totals)
      .map(([id, value]) => {
        const p = packs[id]
        const tx = paid.find(t => t.packId === id)
        const base = p ? packLabel(p) : packLabel({ coins: tx.coins, bonus: tx.bonus, price: tx.amount })
        return { label: p?.firstRecharge ? `${base} (first recharge)` : base, value }
      })
      .sort((a, b) => b.value - a.value)
  }, [paid, coinPacks])

  const byMethod = useMemo(
    () =>
      Object.entries(groupSum(paid, t => t.method, t => t.amount))
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value),
    [paid],
  )

  const hostShare = src => 100 - (economy.commission[src] ?? 0)

  return (
    <div className="a-stack" style={{ gap: 20 }}>
      <PageHeader
        title="Revenue"
        subtitle="Coin sales, what hosts earn from them and what REBU keeps."
        actions={
          <>
            <Seg
              options={[
                { value: 7, label: 'Last 7 days' },
                { value: 30, label: 'Last 30 days' },
              ]}
              value={range}
              onChange={setRange}
            />
            <Button
              icon={Download}
              onClick={() =>
                exportCsv(`rebu-revenue-${range}d.csv`, cur, [
                  { label: 'Date', value: d => date(d.day) },
                  { label: 'Revenue (INR)', value: d => d.revenue },
                  { label: 'Host payouts (INR)', value: d => d.hostPayouts },
                  { label: 'REBU net (INR)', value: d => d.revenue - d.hostPayouts },
                  { label: 'Coins sold', value: d => d.coinsSold },
                ])
              }
            >
              Export CSV
            </Button>
          </>
        }
      />

      <div className="a-grid c4">
        <Stat label="Gross revenue" value={inr(k.revenue)} trend={k.revenueT} sub={k.revenueT == null ? `last ${range} days` : 'vs previous period'} icon={IndianRupee} />
        <Stat label="Est. REBU net" value={inr(k.net)} trend={k.netT} sub="revenue − host payouts" icon={Wallet} />
        <Stat label="Host payouts" value={inr(k.payouts)} trend={k.payoutsT} sub={k.payoutsT == null ? 'credited to hosts' : 'vs previous period'} icon={HandCoins} />
        <Stat
          label="Take rate"
          value={pct(k.take, 1)}
          sub={hasPrev ? `was ${pct(k.prevTake, 1)} the period before` : 'net ÷ gross revenue'}
          icon={Percent}
        />
      </div>

      <div className="a-grid c4">
        <Stat label="Paying users" value={num(tk.paying)} trend={trend(tk.paying, tp.paying, txHasPrev)} sub="with a successful payment" icon={UsersRound} />
        <Stat label="ARPPU" value={inr(Math.round(tk.arppu))} trend={trend(tk.arppu, tp.arppu, txHasPrev)} sub="revenue per paying user" icon={IndianRupee} />
        <Stat
          label="Payment success rate"
          value={pct(tk.successRate, 1)}
          sub={`${num(tk.attempts)} completed attempts${txHasPrev ? ` · was ${pct(tp.successRate, 1)}` : ''}`}
          icon={CircleCheck}
        />
        <Stat label="Refunds" value={inr(tk.refunds)} sub={`${num(tk.refundCount)} payment${tk.refundCount === 1 ? '' : 's'} refunded`} icon={RotateCcw} />
      </div>

      <div className="a-grid c2">
        <Card title="Revenue per day" subtitle={`Coin sales · last ${range} days`}>
          <TrendChart data={cur} series={[{ key: 'revenue', label: 'Revenue' }]} format={v => inr(v)} yFormat={v => `₹${compact(v)}`} />
        </Card>
        <Card title="Revenue vs host payouts" subtitle="The gap is what REBU keeps">
          <TrendChart
            type="line"
            data={cur}
            series={[
              { key: 'revenue', label: 'Revenue' },
              { key: 'hostPayouts', label: 'Host payouts' },
            ]}
            format={v => inr(v)}
            yFormat={v => `₹${compact(v)}`}
          />
        </Card>
      </div>

      <div className="a-grid c3">
        <Card title="Revenue by coin pack" subtitle={`Successful payments · last ${range} days`}>
          {byPack.length ? <BarList items={byPack} format={inr} /> : <Empty title="No payments in this period" />}
        </Card>
        <Card title="Revenue by payment method" subtitle={`Successful payments · last ${range} days`}>
          {byMethod.length ? <BarList items={byMethod} format={inr} /> : <Empty title="No payments in this period" />}
        </Card>
        <Card
          title="Commission settings in effect"
          subtitle={`1 coin = ${inr(economy.coinInr)} of host earnings`}
          footer={
            <Link to="/admin/monetization/economy" className="a-row a-small a-strong" style={{ gap: 6, color: 'var(--brand)' }}>
              Edit economy settings <ArrowRight size={14} />
            </Link>
          }
        >
          <dl className="a-dl">
            {SOURCES.map(([key, name]) => (
              <FragmentRow key={key} term={name}>
                {pct(economy.commission[key] ?? 0)} REBU · <span className="a-muted">{pct(hostShare(key))} host</span>
              </FragmentRow>
            ))}
            <FragmentRow term="Agency cut">{pct(economy.agencyCut)} of the host’s share</FragmentRow>
            <FragmentRow term="Withdrawal fee">{pct(economy.withdrawFee)}</FragmentRow>
          </dl>
        </Card>
      </div>
    </div>
  )
}

function FragmentRow({ term, children }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </>
  )
}
