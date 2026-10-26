import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Coins, IndianRupee, Pencil, Plus, ShoppingBag, Sparkles, Trash2 } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { useApi } from '../../hooks/useApi'
import { errorText } from '../../api/client'
import { Badge, Button, Card, Confirm, DataTable, Empty, Field, Input, Modal, PageHeader, Setting, Stat, Switch } from '../../components/ui'
import { inr, num } from '../../utils/format'

const TAGS = ['Popular', 'Best value', 'First recharge', 'Limited']

const total = p => p.coins + p.bonus
const perCoin = p => p.price / Math.max(1, total(p))
const packName = p => `${num(p.coins)}${p.bonus ? ` + ${num(p.bonus)}` : ''} coins`

function PackModal({ pack, packs, onClose, onSave }) {
  const [f, setF] = useState(() =>
    pack
      ? { coins: String(pack.coins), bonus: String(pack.bonus), price: String(pack.price), tag: pack.tag, firstRecharge: pack.firstRecharge, active: pack.active }
      : { coins: '', bonus: '0', price: '', tag: '', firstRecharge: false, active: true },
  )
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const coins = Number(f.coins)
  const bonus = Number(f.bonus)
  const price = Number(f.price)

  const err = {}
  if (!f.coins.trim() || !Number.isInteger(coins) || coins <= 0) err.coins = 'Whole number of coins, more than 0'
  if (f.bonus.trim() === '' || !Number.isInteger(bonus) || bonus < 0) err.bonus = 'Whole number, 0 or more'
  if (!f.price.trim() || !Number.isFinite(price) || price <= 0) err.price = 'Price must be more than ₹0'
  else if (!Number.isInteger(price)) err.price = 'Use whole rupees'
  if (f.tag.length > 20) err.tag = 'Keep tags under 20 characters'
  const otherFirst = packs.find(p => p.id !== pack?.id && p.firstRecharge && p.active)
  if (f.firstRecharge && f.active && otherFirst) {
    err.firstRecharge = `${packName(otherFirst)} is already the active first-recharge pack. Turn it off first.`
  }
  const dupe = packs.find(p => p.id !== pack?.id && p.coins === coins && p.bonus === bonus && p.price === price)
  if (!err.coins && !err.price && dupe) err.coins = 'An identical pack already exists'
  const ok = Object.keys(err).length === 0
  const preview = ok ? { coins, bonus, price } : null

  return (
    <Modal
      open
      title={pack ? `Edit ${packName(pack)}` : 'New coin pack'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ok} onClick={() => onSave({ coins, bonus, price, tag: f.tag.trim(), firstRecharge: f.firstRecharge, active: f.active })}>
            {pack ? 'Save pack' : 'Create pack'}
          </Button>
        </>
      }
    >
      <div className="a-stack">
        <div className="a-grid c3">
          <Field label="Coins" error={err.coins}>
            <Input type="number" min="1" value={f.coins} onChange={e => set('coins', e.target.value)} autoFocus />
          </Field>
          <Field label="Bonus coins" error={err.bonus}>
            <Input type="number" min="0" value={f.bonus} onChange={e => set('bonus', e.target.value)} />
          </Field>
          <Field label="Price" error={err.price}>
            <Input type="number" min="1" affix="₹" value={f.price} onChange={e => set('price', e.target.value)} />
          </Field>
        </div>
        {preview ? (
          <div className="a-small a-muted">
            User gets <b className="a-strong">{num(total(preview))} coins</b> for {inr(price)} · {inr(perCoin(preview))} per coin
            {bonus ? ` · ${Math.round((bonus / coins) * 100)}% extra` : ''}
          </div>
        ) : null}
        <Field label="Tag" hint="Optional ribbon on the pack, e.g. Popular" error={err.tag}>
          <Input value={f.tag} list="coin-pack-tags" onChange={e => set('tag', e.target.value)} placeholder="No tag" />
        </Field>
        <datalist id="coin-pack-tags">
          {TAGS.map(t => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <div>
          <Setting title="First-recharge offer" description="Only shown to users who have never paid. One active first-recharge pack at a time.">
            <Switch checked={f.firstRecharge} onChange={v => set('firstRecharge', v)} />
          </Setting>
          {err.firstRecharge ? <div className="a-error">{err.firstRecharge}</div> : null}
          <Setting title="Active" description="Inactive packs are hidden from the Coins tab.">
            <Switch checked={f.active} onChange={v => set('active', v)} />
          </Setting>
        </div>
      </div>
    </Modal>
  )
}

const diff = (a, b) => {
  const out = []
  if (a.coins !== b.coins) out.push(`coins ${num(a.coins)} → ${num(b.coins)}`)
  if (a.bonus !== b.bonus) out.push(`bonus ${num(a.bonus)} → ${num(b.bonus)}`)
  if (a.price !== b.price) out.push(`price ${inr(a.price)} → ${inr(b.price)}`)
  if (a.tag !== b.tag) out.push(`tag “${a.tag || 'none'}” → “${b.tag || 'none'}”`)
  if (a.firstRecharge !== b.firstRecharge) out.push(b.firstRecharge ? 'made first-recharge offer' : 'no longer first-recharge')
  if (a.active !== b.active) out.push(b.active ? 'activated' : 'deactivated')
  return out
}

export default function CoinPacksPage() {
  const { db, setConfig } = useStore()
  const toast = useToast()
  const [editing, setEditing] = useState(null) // pack | 'new'
  const [deleting, setDeleting] = useState(null)
  const packs = db.config.coinPacks

  // Successful payments per pack, last 30 days.
  const revenue = useApi('/admin/finance/revenue', { days: 30 })
  const sales = useMemo(
    () => Object.fromEntries((revenue.data?.byPack || []).map(x => [x.packId, { count: x.count, amount: x.revenue }])),
    [revenue.data],
  )

  const persist = async (list, msg) => {
    try {
      await setConfig('coinPacks', list)
      if (msg) toast(msg)
      return true
    } catch (e) {
      toast(errorText(e), 'error')
      return false
    }
  }

  const totals = useMemo(() => {
    const all = Object.values(sales)
    const active = packs.filter(p => p.active && !p.firstRecharge)
    return {
      count: all.reduce((n, s) => n + s.count, 0),
      amount: all.reduce((n, s) => n + s.amount, 0),
      active: packs.filter(p => p.active).length,
      best: active.length ? active.reduce((a, b) => (perCoin(a) <= perCoin(b) ? a : b)) : null,
    }
  }, [sales, packs])

  const move = (index, dir) => {
    const to = index + dir
    if (to < 0 || to >= packs.length) return
    const next = [...packs]
    ;[next[index], next[to]] = [next[to], next[index]]
    persist(next)
  }

  const toggle = p =>
    persist(
      packs.map(x => (x.id === p.id ? { ...x, active: !x.active } : x)),
      `${packName(p)} ${p.active ? 'hidden from' : 'shown in'} the app`,
    )

  const save = async data => {
    let ok = true
    if (editing === 'new') {
      const pack = { id: `p${Date.now().toString(36)}`, ...data }
      ok = await persist([...packs, pack], 'Coin pack created')
    } else if (diff(editing, data).length) {
      ok = await persist(packs.map(x => (x.id === editing.id ? { ...x, ...data } : x)), 'Coin pack saved')
    }
    if (ok) setEditing(null)
  }

  const remove = async () => {
    const p = deleting
    setDeleting(null)
    await persist(packs.filter(x => x.id !== p.id), 'Coin pack deleted')
  }

  const columns = [
    {
      key: 'order',
      label: 'Order',
      width: 84,
      render: p => {
        const i = packs.indexOf(p)
        return (
          <span className="a-row" style={{ gap: 2 }}>
            <Button size="sm" variant="ghost" iconOnly icon={ArrowUp} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" />
            <Button size="sm" variant="ghost" iconOnly icon={ArrowDown} disabled={i === packs.length - 1} onClick={() => move(i, 1)} aria-label="Move down" />
          </span>
        )
      },
    },
    {
      key: 'pack',
      label: 'Pack',
      render: p => (
        <div>
          <b className="a-strong">{num(p.coins)} coins</b>
          <div className="a-small a-muted">{p.bonus ? `+ ${num(p.bonus)} bonus` : 'No bonus'}</div>
        </div>
      ),
    },
    { key: 'total', label: 'Total', align: 'right', render: p => <span className="a-nowrap">{num(total(p))}</span> },
    { key: 'price', label: 'Price', align: 'right', render: p => <b className="a-strong">{inr(p.price)}</b> },
    {
      key: 'per',
      label: '₹ / coin',
      align: 'right',
      render: p => (
        <span className={totals.best?.id === p.id ? 'a-success' : ''} style={{ fontWeight: 600 }}>
          {inr(perCoin(p))}
        </span>
      ),
    },
    {
      key: 'tag',
      label: 'Tag',
      render: p => (
        <span className="a-row" style={{ gap: 6 }}>
          {p.tag ? <Badge tone="brand">{p.tag}</Badge> : null}
          {p.firstRecharge ? <Badge tone="violet">First recharge</Badge> : null}
          {!p.tag && !p.firstRecharge ? <span className="a-faint">—</span> : null}
        </span>
      ),
    },
    {
      key: 'sales',
      label: 'Sales · 30d',
      align: 'right',
      render: p => {
        const s = sales[p.id]
        return s ? (
          <div>
            <b className="a-strong">{inr(s.amount)}</b>
            <div className="a-small a-muted">{num(s.count)} sold</div>
          </div>
        ) : (
          <span className="a-faint">No sales</span>
        )
      },
    },
    { key: 'active', label: 'Active', render: p => <Switch checked={p.active} onChange={() => toggle(p)} /> },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: p => (
        <span className="a-row" style={{ gap: 4, justifyContent: 'flex-end' }}>
          <Button size="sm" variant="ghost" iconOnly icon={Pencil} onClick={() => setEditing(p)} aria-label="Edit pack" />
          <Button size="sm" variant="ghost" iconOnly icon={Trash2} onClick={() => setDeleting(p)} aria-label="Delete pack" />
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Coin packs"
        subtitle="Packs shown in the app’s Coins tab, in this order."
        crumbs={[{ label: 'Monetization' }, { label: 'Coin packs' }]}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
            New pack
          </Button>
        }
      />

      <div className="a-grid c4" style={{ marginBottom: 16 }}>
        <Stat label="Pack sales · 30 days" value={inr(totals.amount)} icon={IndianRupee} />
        <Stat label="Packs sold · 30 days" value={num(totals.count)} icon={ShoppingBag} />
        <Stat label="Active packs" value={`${totals.active} of ${packs.length}`} icon={Coins} />
        <Stat
          label="Best ₹ per coin"
          value={totals.best ? inr(perCoin(totals.best)) : '—'}
          sub={totals.best ? packName(totals.best) : null}
          icon={Sparkles}
        />
      </div>

      <Card
        padded={false}
        title="All packs"
        subtitle="The first-recharge pack only appears for users who have never made a successful payment. Sales count successful payments only."
      >
        <DataTable
          rows={packs}
          columns={columns}
          pageSize={100}
          empty={<Empty icon={Coins} title="No coin packs" text="Users can’t buy coins until you add a pack." />}
        />
      </Card>

      {editing ? <PackModal pack={editing === 'new' ? null : editing} packs={packs} onClose={() => setEditing(null)} onSave={save} /> : null}

      <Confirm
        open={!!deleting}
        title={`Delete ${deleting ? packName(deleting) : ''}?`}
        message="The pack disappears from the app right away. Past purchases stay in Transactions. To pause it instead, switch it off."
        confirmLabel="Delete pack"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={remove}
      />
    </>
  )
}
