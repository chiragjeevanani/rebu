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
import { useAdminEvent, useApi } from '../hooks/useApi'
import { canAccess } from '../routes/nav'
import { Badge, Card, Empty, PageHeader, Pending, Seg, Stat, Who } from '../components/ui'
import { BarList, TrendChart } from '../components/charts'
import { ago, compact, inr, label, num, withDayLabels } from '../utils/format'

const LIVE_EVENTS = ['live:started', 'live:ended', 'report:new', 'support:new']

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function DashboardPage() {
  const { me } = useStore()
  const [range, setRange] = useState(7)
  const res = useApi('/admin/dashboard', { days: range })
  const hostsTotal = useApi(canAccess(me.role, 'hosts') ? '/admin/hosts' : null, { limit: 1 })
  const revenue = useApi(canAccess(me.role, 'finance') ? '/admin/finance/revenue' : null, { days: 30 })
  useAdminEvent(LIVE_EVENTS, res.reload)

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
      <Pending res={res}>
        {d => <Body d={d} range={range} hostsTotal={hostsTotal.data?.total} revenue={revenue.data} />}
      </Pending>
    </div>
  )
}

function Body({ d, range, hostsTotal, revenue }) {
  const { me } = useStore()
  const k = d.kpis
  const cur = useMemo(() => withDayLabels(d.series), [d.series])
  const at = d.attention

  const attention = [
    { section: 'applications', to: '/admin/host-applications', icon: BadgeCheck, label: 'Host applications to review', value: at.pendingApplications },
    { section: 'finance', to: '/admin/finance/withdrawals', icon: Wallet, label: 'Withdrawals waiting', value: at.withdrawalsRequested.count, extra: inr(at.withdrawalsRequested.amount) },
    { section: 'reports', to: '/admin/reports', icon: Flag, label: 'Open reports', value: at.openReports.count, extra: `${at.openReports.high} high priority` },
    { section: 'finance', to: '/admin/finance/disputes', icon: Scale, label: 'Earning disputes', value: at.openDisputes },
    { section: 'support', to: '/admin/support', icon: LifeBuoy, label: 'Open support tickets', value: at.openTickets },
  ].filter(a => canAccess(me.role, a.section))

  const byMethod = (revenue?.byMethod || []).map(m => ({ label: label(m.method), value: m.revenue }))

  return (
    <>
      <div className="a-grid c4">
        <Stat label="Revenue" value={inr(k.revenue.value)} trend={k.revenue.change} sub="vs previous period" icon={IndianRupee} />
        <Stat label="Daily active users" value={num(k.dau.value)} trend={k.dau.change} sub="average" icon={UsersRound} />
        <Stat label="Calls" value={num(k.calls.value)} trend={k.calls.change} sub="placed" icon={PhoneCall} />
        <Stat label="Host earnings" value={inr(k.hostEarnings.value)} trend={k.hostEarnings.change} sub="credited to hosts" icon={Wallet} />
      </div>

      <div className="a-grid c4">
        <Stat label="Hosts online now" value={d.live.hostsOnline} sub={hostsTotal != null ? `of ${hostsTotal} hosts` : 'available for calls'} icon={UsersRound} />
        <Stat label="Live streams now" value={d.live.activeLives} sub="lives, parties & audio rooms" icon={Radio} />
        <Stat label="Calls in progress" value={d.live.callsInProgress} sub="video & voice" icon={PhoneCall} />
        <Stat label="New users today" value={num(d.live.newUsersToday)} icon={UserPlus} />
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
        <Card title="Daily active users" subtitle={`Last ${range} days · approximate`}>
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
          subtitle={`By earnings · last ${range} days`}
          padded={false}
          actions={
            canAccess(me.role, 'hosts') ? (
              <Link to="/admin/hosts" className="a-small a-strong" style={{ color: 'var(--brand)' }}>
                All hosts
              </Link>
            ) : null
          }
        >
          {d.topHosts.length ? (
            <div className="a-table-wrap">
              <table className="a-table">
                <thead>
                  <tr>
                    <th>Host</th>
                    <th className="right">Call min</th>
                    <th className="right">Coins</th>
                    <th className="right">Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {d.topHosts.map(h => (
                    <tr key={h.id}>
                      <td>
                        <Who src={h.avatar} name={h.name} to={canAccess(me.role, 'hosts') ? `/admin/hosts/${h.id}` : undefined} />
                      </td>
                      <td className="right">{num(h.minutes)}</td>
                      <td className="right">{num(h.coins)}</td>
                      <td className="right a-strong">{inr(h.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No host earnings yet" text="Hosts appear here once they earn in this period." />
          )}
        </Card>
        <div className="a-stack">
          {revenue ? (
            <Card title="Revenue by payment method" subtitle="Successful payments, last 30 days">
              {byMethod.length ? <BarList items={byMethod} format={inr} /> : <Empty title="No payments yet" />}
            </Card>
          ) : null}
          <Card title="Latest payments" padded={false}>
            {d.latestPayments.length ? (
              d.latestPayments.slice(0, 5).map(t => (
                <div key={t.id} className="a-list-row">
                  <Who src={t.userAvatar} name={t.userName || 'User'} sub={`${num(t.coins + (t.bonus || 0))} coins · ${ago(t.ts)}`} size={32} />
                  <span className="a-spacer" />
                  <b className="a-strong">{inr(t.amount)}</b>
                </div>
              ))
            ) : (
              <Empty title="No payments yet" />
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
