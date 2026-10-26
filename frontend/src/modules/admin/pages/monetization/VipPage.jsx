import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Crown, Pencil, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { api, errorText } from '../../api/client'
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Switch, Tabs } from '../../components/ui'
import { BarList } from '../../components/charts'
import { inr, num } from '../../utils/format'

// kind: vip (config.vipTiers, keyed by level) | royal (config.royalClub, keyed by key)
const KINDS = {
  vip: { config: 'vipTiers', id: t => t.level, noun: 'VIP tier', target: 'VIP tiers' },
  royal: { config: 'royalClub', id: t => t.key, noun: 'Royal Club crown', target: 'Royal Club' },
}

function TierModal({ kind, tier, list, onClose, onSave }) {
  const index = list.indexOf(tier)
  const prev = list[index - 1]
  const next = list[index + 1]
  const [f, setF] = useState({
    name: tier.name,
    emoji: tier.emoji || '',
    price: String(tier.price),
    days: String(tier.days ?? ''),
    coinsBack: String(tier.coinsBack ?? ''),
    perks: [...tier.perks],
    active: tier.active,
  })
  const [perk, setPerk] = useState('')
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const setPerks = fn => setF(x => ({ ...x, perks: fn(x.perks) }))

  const price = Number(f.price)
  const days = Number(f.days)
  const coinsBack = f.coinsBack.trim() === '' ? 0 : Number(f.coinsBack)
  const err = {}
  if (!f.name.trim()) err.name = 'Required'
  else if (list.some(t => t !== tier && t.name.toLowerCase() === f.name.trim().toLowerCase())) err.name = 'Another tier has this name'
  if (kind === 'royal' && !f.emoji.trim()) err.emoji = 'Required'
  if (!f.price.trim() || !Number.isInteger(price) || price <= 0) err.price = 'Whole rupees, more than 0'
  else if (prev && price <= prev.price) err.price = `Must be more than ${prev.name} (${inr(prev.price)})`
  else if (next && price >= next.price) err.price = `Must be less than ${next.name} (${inr(next.price)})`
  if (kind === 'royal' && (!Number.isInteger(coinsBack) || coinsBack < 0)) err.coinsBack = 'Whole coins, 0 or more'
  if (kind === 'vip' && (!Number.isInteger(days) || days <= 0 || days > 366)) err.days = '1–366 days'
  const perks = f.perks.map(p => p.trim())
  if (!perks.length) err.perks = 'Add at least one perk'
  else if (perks.some(p => !p)) err.perks = 'Perks can’t be empty'
  else if (new Set(perks.map(p => p.toLowerCase())).size !== perks.length) err.perks = 'Perks must be unique'
  const ok = Object.keys(err).length === 0

  const addPerk = () => {
    if (!perk.trim()) return
    setPerks(p => [...p, perk.trim()])
    setPerk('')
  }
  const movePerk = (i, d) =>
    setPerks(p => {
      const n = [...p]
      ;[n[i], n[i + d]] = [n[i + d], n[i]]
      return n
    })

  return (
    <Modal
      open
      wide
      title={`Edit ${tier.name}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ok}
            onClick={() =>
              onSave({
                name: f.name.trim(),
                price,
                perks,
                active: f.active,
                ...(kind === 'vip' ? { days } : { emoji: f.emoji.trim(), coinsBack }),
              })
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="a-stack">
        <div className="a-row" style={{ alignItems: 'flex-start' }}>
          {kind === 'royal' ? (
            <Field label="Emoji" error={err.emoji} style={{ width: 92 }}>
              <Input value={f.emoji} onChange={e => set('emoji', e.target.value)} style={{ fontSize: 20, textAlign: 'center' }} />
            </Field>
          ) : null}
          <Field label="Name" error={err.name} style={{ flex: 1 }}>
            <Input value={f.name} onChange={e => set('name', e.target.value)} autoFocus />
          </Field>
          <Field label="Price" error={err.price} style={{ flex: 1 }}>
            <Input type="number" min="1" affix="₹" value={f.price} onChange={e => set('price', e.target.value)} />
          </Field>
          {kind === 'royal' ? (
            <Field label="Coins back" error={err.coinsBack} hint="Credited on purchase" style={{ width: 150 }}>
              <Input type="number" min="0" affix="coins" value={f.coinsBack} onChange={e => set('coinsBack', e.target.value)} />
            </Field>
          ) : null}
          {kind === 'vip' ? (
            <Field label="Duration" error={err.days} style={{ width: 140 }}>
              <Input type="number" min="1" affix="days" value={f.days} onChange={e => set('days', e.target.value)} />
            </Field>
          ) : null}
        </div>

        <div>
          <div className="a-label" style={{ marginBottom: 8 }}>
            Perks <span className="a-muted" style={{ fontWeight: 600 }}>· shown in this order</span>
          </div>
          <div className="a-stack" style={{ gap: 6 }}>
            {f.perks.map((p, i) => (
              <div key={i} className="a-row" style={{ gap: 4 }}>
                <Input value={p} onChange={e => setPerks(list => list.map((x, j) => (j === i ? e.target.value : x)))} />
                <Button size="sm" variant="ghost" iconOnly icon={ArrowUp} disabled={i === 0} onClick={() => movePerk(i, -1)} aria-label="Move perk up" />
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  icon={ArrowDown}
                  disabled={i === f.perks.length - 1}
                  onClick={() => movePerk(i, 1)}
                  aria-label="Move perk down"
                />
                <Button size="sm" variant="ghost" iconOnly icon={Trash2} onClick={() => setPerks(list => list.filter((_, j) => j !== i))} aria-label="Remove perk" />
              </div>
            ))}
          </div>
          <form
            className="a-row"
            style={{ marginTop: 8 }}
            onSubmit={e => {
              e.preventDefault()
              addPerk()
            }}
          >
            <Input value={perk} onChange={e => setPerk(e.target.value)} placeholder="Add a perk, e.g. 10% off calls" />
            <Button type="submit" icon={Plus} disabled={!perk.trim()}>
              Add
            </Button>
          </form>
          {err.perks ? <div className="a-error" style={{ marginTop: 6 }}>{err.perks}</div> : null}
        </div>

        <div className="a-row between">
          <div>
            <b className="a-strong">Active</b>
            <div className="a-small a-muted">Inactive tiers can’t be bought; current members keep them until they expire.</div>
          </div>
          <Switch checked={f.active} onChange={v => set('active', v)} />
        </div>
      </div>
    </Modal>
  )
}

function diff(a, b) {
  const out = []
  if (a.name !== b.name) out.push(`name “${a.name}” → “${b.name}”`)
  if (b.emoji !== undefined && a.emoji !== b.emoji) out.push(`emoji ${a.emoji} → ${b.emoji}`)
  if (a.price !== b.price) out.push(`price ${inr(a.price)} → ${inr(b.price)}`)
  if (b.coinsBack !== undefined && (a.coinsBack || 0) !== b.coinsBack) out.push(`coins back ${a.coinsBack || 0} → ${b.coinsBack}`)
  if (b.days !== undefined && a.days !== b.days) out.push(`duration ${a.days} → ${b.days} days`)
  const added = b.perks.filter(p => !a.perks.includes(p))
  const removed = a.perks.filter(p => !b.perks.includes(p))
  if (added.length) out.push(`added perks: ${added.join('; ')}`)
  if (removed.length) out.push(`removed perks: ${removed.join('; ')}`)
  if (!added.length && !removed.length && a.perks.join('|') !== b.perks.join('|')) out.push('reordered perks')
  if (a.active !== b.active) out.push(b.active ? 'activated' : 'deactivated')
  return out
}

/** Users per VIP level from the users list totals: { all, byLevel: { [level]: n } } or null while loading. */
function useVipCounts(levels) {
  const key = levels.join(',')
  const [state, setState] = useState({ key: null, value: null })
  useEffect(() => {
    let live = true
    const ls = key ? key.split(',').map(Number) : []
    const count = query => api.get('/admin/users', { ...query, limit: 1 }).then(r => r.total)
    Promise.all([count({}), ...ls.map(l => count({ vip: l }))]).then(
      ([all, ...per]) => live && setState({ key, value: { all, byLevel: Object.fromEntries(ls.map((l, i) => [l, per[i]])) } }),
      () => live && setState({ key, value: null }),
    )
    return () => {
      live = false
    }
  }, [key])
  return state.key === key ? state.value : null
}

export default function VipPage() {
  const { db, setConfig } = useStore()
  const toast = useToast()
  const [tab, setTab] = useState('vip')
  const [editing, setEditing] = useState(null)
  const k = KINDS[tab]
  const list = db.config[k.config]

  const vipLevels = useMemo(() => db.config.vipTiers.map(t => t.level), [db.config.vipTiers])
  const vc = useVipCounts(vipLevels)
  const members = useMemo(() => {
    const per = db.config.vipTiers.map(t => ({ label: t.name, value: vc?.byLevel[t.level] || 0 }))
    const vip = per.reduce((n, m) => n + m.value, 0)
    return [{ label: 'No VIP', value: Math.max(0, (vc?.all || 0) - vip) }, ...per]
  }, [vc, db.config.vipTiers])
  const vipCount = members.slice(1).reduce((n, m) => n + m.value, 0)

  const persist = async (next, msg) => {
    try {
      await setConfig(k.config, next)
      toast(msg)
      return true
    } catch (e) {
      toast(errorText(e), 'error')
      return false
    }
  }

  const toggle = t =>
    persist(
      list.map(x => (k.id(x) === k.id(t) ? { ...x, active: !x.active } : x)),
      `${t.name} ${t.active ? 'hidden from' : 'available in'} the app`,
    )

  const save = async data => {
    const t = editing
    let ok = true
    if (diff(t, data).length) ok = await persist(list.map(x => (k.id(x) === k.id(t) ? { ...x, ...data } : x)), `${data.name} saved`)
    if (ok) setEditing(null)
  }

  return (
    <>
      <PageHeader
        title="VIP & Royal Club"
        subtitle="Memberships users can buy. Prices must increase with each level."
        crumbs={[{ label: 'Monetization' }, { label: 'VIP' }]}
      />
      <Tabs
        tabs={[
          { value: 'vip', label: 'VIP tiers', count: db.config.vipTiers.length },
          { value: 'royal', label: 'Royal Club', count: db.config.royalClub.length },
        ]}
        value={tab}
        onChange={t => {
          setTab(t)
          setEditing(null)
        }}
      />

      <div className="a-grid side" style={{ alignItems: 'start' }}>
        <div className="a-grid c2">
          {list.map((t, i) => (
            <Card
              key={k.id(t)}
              style={{ opacity: t.active ? 1 : 0.65 }}
              title={
                <span className="a-row" style={{ gap: 8 }}>
                  {tab === 'royal' ? <span style={{ fontSize: 22 }}>{t.emoji}</span> : <Crown size={18} color="var(--coin)" />}
                  {t.name}
                  {!t.active ? <Badge>Inactive</Badge> : null}
                </span>
              }
              subtitle={tab === 'vip' ? `Level ${t.level}` : `Crown ${i + 1}`}
              actions={<Switch checked={t.active} onChange={() => toggle(t)} />}
              footer={
                <Button size="sm" icon={Pencil} onClick={() => setEditing(t)}>
                  Edit tier
                </Button>
              }
            >
              <div className="a-row" style={{ alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
                <span className="a-stat-value" style={{ marginTop: 0 }}>
                  {inr(t.price)}
                </span>
                {tab === 'vip' ? (
                  <span className="a-muted">/ {t.days} days</span>
                ) : (
                  <span className="a-muted">one-time{t.coinsBack ? ` · ${num(t.coinsBack)} coins back` : ''}</span>
                )}
              </div>
              <ul className="a-stack" style={{ gap: 6, listStyle: 'none', padding: 0, margin: 0 }}>
                {t.perks.map(p => (
                  <li key={p} className="a-row" style={{ gap: 8, alignItems: 'flex-start' }}>
                    <Check size={15} color="var(--success)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <div className="a-stack">
          <Card title="Users per VIP level" subtitle={vc ? `${num(vipCount)} of ${num(vc.all)} users have VIP` : 'Loading…'}>
            <BarList items={members} format={num} />
          </Card>
          {tab === 'royal' ? (
            <Card title="About Royal Club">
              <p className="a-muted a-small">
                Crowns are one-time purchases that show on the user’s profile and in rooms. Coins-back perks are credited by the app when the crown is
                bought.
              </p>
            </Card>
          ) : null}
        </div>
      </div>

      {editing ? <TierModal key={`${tab}-${k.id(editing)}`} kind={tab} tier={editing} list={list} onClose={() => setEditing(null)} onSave={save} /> : null}
    </>
  )
}
