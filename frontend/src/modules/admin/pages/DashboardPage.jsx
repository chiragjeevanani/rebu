import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  Flag,
  IndianRupee,
  LifeBuoy,
  PhoneCall,
  Radio,
  Scale,
  UserPlus,
  UsersRound,
  Wallet,
} from 'lucide-react'
import { useStore } from '../hooks/useStore'
import { canAccess } from '../routes/nav'
import { Badge, Card, PageHeader, Seg, Stat, Status, Who } from '../components/ui'
import { BarList, TrendChart } from '../components/charts'
import { ago, compact, inr, num } from '../utils/format'

const sum = (list, key) => list.reduce((n, x) => n + x[key], 0)
const trend = (cur, prev) => (prev ? ((cur - prev) / prev) * 100 : 0)

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function DashboardPage() {
  const { db, me } = useStore()
  const [range, setRange] = useState(7)

  const m = db.metrics
  const cur = m.slice(-range)
  const prev = m.slice(-range * 2, -range)
  const prevOrHalf = prev.length === range ? prev : m.slice(0, m.length - range)

  const k = useMemo(
    () => ({
      revenue: sum(cur, 'revenue'),
      revenueT: trend(sum(cur, 'revenue'), sum(prevOrHalf, 'revenue')),
      dau: Math.round(sum(cur, 'dau') / cur.length),
      dauT: trend(sum(cur, 'dau') / cur.length, sum(prevOrHalf, 'dau') / Math.max(1, prevOrHalf.length)),
      calls: sum(cur, 'calls'),
      callsT: trend(sum(cur, 'calls'), sum(prevOrHalf, 'calls')),
      payouts: sum(cur, 'hostPayouts'),
      payoutsT: trend(sum(cur, 'hostPayouts'), sum(prevOrHalf, 'hostPayouts')),
    }),
    [cur, prevOrHalf],
  )

  const live = {
    hostsOnline: db.hosts.filter(h => h.online && h.status === 'active').length,
    lives: db.lives.filter(l => l.status === 'live').length,
    calls: db.calls.filter(c => c.status === 'ongoing').length,
    newUsers: m[m.length - 1].newUsers,
  }

  const pendingApps = db.applications.filter(a => a.status === 'pending')
  const requested = db.withdrawals.filter(w => w.status === 'requested')
  const openReports = db.reports.filter(r => r.status === 'open')
  const openDisputes = db.disputes.filter(d => d.status === 'open')
  const openTickets = db.tickets.filter(t => t.status === 'open')

  const attention = [
    { section: 'applications', to: '/admin/host-applications', icon: BadgeCheck, label: 'Host applications to review', value: pendingApps.length },
    { section: 'finance', to: '/admin/finance/withdrawals', icon: Wallet, label: 'Withdrawals waiting', value: requested.length, extra: inr(sum(requested, 'amount')) },
    { section: 'reports', to: '/admin/reports', icon: Flag, label: 'Open reports', value: openReports.length, extra: `${openReports.filter(r => r.priority === 'high').length} high priority` },
    { section: 'finance', to: '/admin/finance/disputes', icon: Scale, label: 'Earning disputes', value: openDisputes.length },
    { section: 'support', to: '/admin/support', icon: LifeBuoy, label: 'Open support tickets', value: openTickets.length },
  ].filter(a => canAccess(me.role, a.section))

  const topHosts = [...db.hosts].sort((a, b) => b.lifetime - a.lifetime).slice(0, 6)
  const paid = db.transactions.filter(t => t.status === 'success')
  const byMethod = Object.entries(
    paid.reduce((o, t) => ({ ...o, [t.method]: (o[t.method] || 0) + t.amount }), {}),
  )
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)

  return (
    <div className="a-stack" style={{ gap: 20 }}>
      <PageHeader
        title={`${greeting()}, ${me.name.split(' ')[0]}`}
        subtitle="Here’s how REBU is doing."
        actions={
          <Seg
            options={[
              { value: 7, label: 'Last 7 days' },
              { value: 30, label: 'Last 30 days' },
            ]}
            value={range}
            onChange={setRange}
          />
        }
      />

      <div className="a-grid c4">
        <Stat label="Revenue" value={inr(k.revenue)} trend={k.revenueT} sub="vs previous period" icon={IndianRupee} />
        <Stat label="Daily active users" value={num(k.dau)} trend={k.dauT} sub="average" icon={UsersRound} />
        <Stat label="Calls" value={num(k.calls)} trend={k.callsT} sub="connected" icon={PhoneCall} />
        <Stat label="Host earnings" value={inr(k.payouts)} trend={k.payoutsT} sub="credited to hosts" icon={Wallet} />
      </div>

      <div className="a-grid c4">
        <Stat label="Hosts online now" value={live.hostsOnline} sub={`of ${db.hosts.length} hosts`} icon={UsersRound} />
        <Stat label="Live streams now" value={live.lives} sub="lives, parties & audio rooms" icon={Radio} />
        <Stat label="Calls in progress" value={live.calls} sub="video & voice" icon={PhoneCall} />
        <Stat label="New users today" value={num(live.newUsers)} icon={UserPlus} />
      </div>

      <div className="a-grid side">
        <Card title="Revenue" subtitle={`Coin sales per day · last ${range} days`}>
          <TrendChart data={cur} series={[{ key: 'revenue', label: 'Revenue' }]} format={v => inr(v)} yFormat={v => `₹${compact(v)}`} />
        </Card>
        <Card title="Needs attention" padded={false}>
          {attention.map(a => (
            <Link key={a.to + a.label} to={a.to} className="a-list-row">
              <span className="a-stat-icon">
                <a.icon size={17} />
              </span>
              <span style={{ flex: 1 }}>
                <span className="a-strong" style={{ display: 'block' }}>
                  {a.label}
                </span>
                {a.extra ? <span className="a-small a-muted">{a.extra}</span> : null}
              </span>
              {a.value ? <Badge tone="brand">{a.value}</Badge> : <Badge tone="success">Clear</Badge>}
              <ArrowRight size={16} className="a-faint" />
            </Link>
          ))}
        </Card>
      </div>

      <div className="a-grid c2">
        <Card title="Daily active users" subtitle={`Last ${range} days`}>
          <TrendChart type="line" data={cur} series={[{ key: 'dau', label: 'Active users' }]} format={v => num(v)} yFormat={compact} height={220} />
        </Card>
        <Card title="Calls & new users" subtitle={`Last ${range} days`}>
          <TrendChart
            type="bar"
            data={cur}
            series={[
              { key: 'calls', label: 'Calls' },
              { key: 'newUsers', label: 'New users' },
            ]}
            format={v => num(v)}
            yFormat={compact}
            height={220}
          />
        </Card>
      </div>

      <div className="a-grid side">
        <Card
          title="Top hosts"
          subtitle="By lifetime earnings"
          padded={false}
          actions={
            canAccess(me.role, 'hosts') ? (
              <Link to="/admin/hosts" className="a-small a-strong" style={{ color: 'var(--brand)' }}>
                All hosts
              </Link>
            ) : null
          }
        >
          <div className="a-table-wrap">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Host</th>
                  <th>Level</th>
                  <th className="right">Call min</th>
                  <th className="right">Earned</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {topHosts.map(h => (
                  <tr key={h.id}>
                    <td>
                      <Who src={h.avatar} name={h.name} sub={h.city} to={`/admin/hosts/${h.id}`} />
                    </td>
                    <td>
                      <Badge tone="ink">Lv {h.level}</Badge>
                    </td>
                    <td className="right">{num(h.callMinutes)}</td>
                    <td className="right a-strong">{inr(h.lifetime)}</td>
                    <td>{h.online ? <Status value="online" /> : <Status value="offline" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="a-stack">
          <Card title="Revenue by payment method" subtitle="Successful payments, last 30 days">
            <BarList items={byMethod} format={inr} />
          </Card>
          <Card title="Latest payments" padded={false}>
            {paid.slice(0, 5).map(t => (
              <div key={t.id} className="a-list-row">
                <Who src={t.userAvatar} name={t.userName} sub={`${num(t.coins + t.bonus)} coins · ${ago(t.ts)}`} size={32} />
                <span className="a-spacer" />
                <b className="a-strong">{inr(t.amount)}</b>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}
