import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CircleCheck, Download, HandCoins, IndianRupee, Percent, RotateCcw, UsersRound, Wallet } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useApi } from '../../hooks/useApi'
import { Button, Card, Empty, PageHeader, Pending, Seg, Stat } from '../../components/ui'
import { BarList, TrendChart } from '../../components/charts'
import { compact, date, exportCsv, inr, label, num, pct, withDayLabels } from '../../utils/format'

const trend = (cur, prev) => (prev ? ((cur - prev) / prev) * 100 : null)

const SOURCES = [
  ['video', 'Video calls'],
  ['voice', 'Voice calls'],
  ['chat', 'Chat messages'],
  ['gift', 'Gifts'],
  ['ticket', 'Premium live tickets'],
]

const packLabel = p => `${num(p.coins)}${p.bonus ? ` + ${num(p.bonus)}` : ''} coins · ${inr(p.price)}`

export default function RevenuePage() {
  const [range, setRange] = useState(7)
  const res = useApi('/admin/finance/revenue', { days: range })

  return (
    <Pending res={res}>
      {r => <Body r={r} range={range} setRange={setRange} />}
    </Pending>
  )
}

function Body({ r, range, setRange }) {
  const { db } = useStore()
  const { economy, coinPacks } = db.config
  const cur = useMemo(() => withDayLabels(r.byDay), [r.byDay])

  // REBU keeps what users spend minus what hosts are credited.
  const hostNet = r.earnings.hostNet
  const k = {
    revenue: r.revenue,
    revenueT: trend(r.revenue, r.previousRevenue),
    payouts: hostNet,
    net: r.revenue - hostNet,
    take: r.takeRate,
  }


  const byPack = useMemo(() => {
    const packs = Object.fromEntries(coinPacks.map(p => [p.id, p]))
    return r.byPack.map(x => {
      const p = packs[x.packId]
      const base = p ? packLabel(p) : `Pack ${x.packId || '—'}`
      return { label: p?.firstRecharge ? `${base} (first recharge)` : base, value: x.revenue }
    })
  }, [r.byPack, coinPacks])

  const byMethod = r.byMethod.map(m => ({ label: label(m.method), value: m.revenue }))

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
                  { label: 'Payments', value: d => d.payments },
                  { label: 'Withdrawals paid (INR)', value: d => d.payouts },
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
        <Stat label="Est. REBU net" value={inr(k.net)} sub="revenue − host earnings" icon={Wallet} />
        <Stat label="Host earnings" value={inr(k.payouts)} sub={`credited to hosts · ${inr(r.payouts.paid.amount)} paid out`} icon={HandCoins} />
        <Stat label="Take rate" value={pct(k.take, 1)} sub="REBU commission ÷ host gross" icon={Percent} />
      </div>

      <div className="a-grid c4">
        <Stat label="Paying users" value={num(r.payingUsers || 0)} sub="with a successful payment" icon={UsersRound} />
        <Stat label="ARPPU" value={inr(Math.round(r.arppu || 0))} sub="revenue per paying user" icon={IndianRupee} />
        <Stat label="Payment success rate" value={r.successRate == null ? '—' : pct(r.successRate, 1)} sub={r.successRate == null ? 'no completed attempts yet' : 'of completed payment attempts'} icon={CircleCheck} />
        <Stat label="Refunds" value={inr(r.refunds.amount)} sub={`${num(r.refunds.count)} payment${r.refunds.count === 1 ? '' : 's'} refunded`} icon={RotateCcw} />
      </div>

      <div className="a-grid c2">
        <Card title="Revenue per day" subtitle={`Coin sales · last ${range} days`}>
          <TrendChart data={cur} series={[{ key: 'revenue', label: 'Revenue' }]} format={v => inr(v)} yFormat={v => `₹${compact(v)}`} />
        </Card>
        <Card title="Revenue vs host payouts" subtitle="Coin sales vs withdrawals paid to hosts">
          <TrendChart
            type="line"
            data={cur}
            series={[
              { key: 'revenue', label: 'Revenue' },
              { key: 'payouts', label: 'Host payouts' },
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
