import { useMemo, useState } from 'react'
import { AlertTriangle, Calculator, Coins, Percent, Save, Undo2, Users, Wallet } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { errorText } from '../../api/client'
import { Badge, Button, Card, Field, Input, PageHeader, Select, Setting, Switch } from '../../components/ui'
import { inr, num, pct } from '../../utils/format'

const SOURCES = [
  { value: 'video', label: 'Video calls', unit: 'per minute' },
  { value: 'voice', label: 'Voice calls', unit: 'per minute' },
  { value: 'chat', label: 'Chat messages', unit: 'per message' },
  { value: 'gift', label: 'Gifts', unit: 'per gift' },
  { value: 'ticket', label: 'Premium live tickets', unit: 'per ticket' },
  { value: 'bonus', label: 'Bonuses', unit: 'usually 0%' },
]

// kind: pct (0–90) | inr (> 0) | rate (> 0, decimals) | coins (integer ≥ 0) | text
const FIELDS = [
  { path: 'coinInr', label: 'Coin value', kind: 'rate' },
  ...SOURCES.map(s => ({ path: `commission.${s.value}`, label: `${s.label} commission`, kind: 'pct' })),
  { path: 'agencyCut', label: 'Agency cut', kind: 'pct' },
  { path: 'withdrawFee', label: 'Withdrawal fee', kind: 'pct' },
  { path: 'minWithdraw', label: 'Minimum withdrawal', kind: 'inr' },
  { path: 'maxWithdrawPerDay', label: 'Max withdrawal per day', kind: 'inr' },
  { path: 'payoutTime', label: 'Payout time', kind: 'text' },
  { path: 'welcomeBonusCoins', label: 'New host bonus', kind: 'coins' },
  { path: 'newUserCoins', label: 'Signup gift', kind: 'coins' },
  { path: 'messageCost', label: 'Message cost', kind: 'coins', min: 1 },
]

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj)

function setPath(obj, path, value) {
  const [k, ...rest] = path.split('.')
  return { ...obj, [k]: rest.length ? setPath(obj[k] || {}, rest.join('.'), value) : value }
}

const toForm = e => Object.fromEntries(FIELDS.map(f => [f.path, String(get(e, f.path) ?? '')]))

const parse = (f, raw) => (f.kind === 'text' ? raw.trim() : raw.trim() === '' ? NaN : Number(raw))

const show = (f, v) =>
  f.kind === 'pct' ? pct(v, Number.isInteger(v) ? 0 : 1)
  : f.kind === 'inr' ? inr(v)
  : f.kind === 'rate' ? `₹${v}`
  : f.kind === 'coins' ? `${num(v)} coins`
  : `“${v}”`

function validate(f, v, values) {
  if (f.kind === 'text') return v ? null : 'Required'
  if (!Number.isFinite(v)) return 'Enter a number'
  if (f.kind === 'pct') return v < 0 || v > 90 ? 'Must be between 0 and 90%' : null
  if (f.kind === 'coins') {
    if (!Number.isInteger(v)) return 'Whole coins only'
    return v < (f.min ?? 0) ? `Must be at least ${f.min ?? 0}` : null
  }
  if (v <= 0) return 'Must be more than 0'
  if (f.path === 'maxWithdrawPerDay' && Number.isFinite(values.minWithdraw) && v < values.minWithdraw) {
    return 'Can’t be less than the minimum withdrawal'
  }
  return null
}

/** Sticky "unsaved changes" bar shared by draft-style settings pages. */
function SaveBar({ count, invalid, saving, onDiscard, onSave }) {
  return (
    <div
      className="a-row wrap"
      style={{
        position: 'sticky',
        bottom: 16,
        zIndex: 15,
        marginTop: 20,
        padding: '12px 16px',
        background: 'var(--surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <span className="a-row" style={{ gap: 8, fontWeight: 700 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--warning)' }} />
        You have unsaved changes
        <span className="a-muted" style={{ fontWeight: 600 }}>
          · {count} field{count === 1 ? '' : 's'}
        </span>
      </span>
      {invalid ? <span className="a-danger a-small">Fix {invalid} error{invalid === 1 ? '' : 's'} to save</span> : null}
      <span className="a-spacer" />
      <Button icon={Undo2} onClick={onDiscard}>
        Discard
      </Button>
      <Button variant="primary" icon={Save} disabled={!!invalid || saving} onClick={onSave}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  )
}

export default function EconomyPage() {
  const { db, setConfig } = useStore()
  const toast = useToast()
  const economy = db.config.economy
  const [form, setForm] = useState(() => toForm(economy))
  const [calc, setCalc] = useState({ source: 'video', coins: '40', agency: false })
  const [saving, setSaving] = useState(false)

  const fieldByPath = useMemo(() => Object.fromEntries(FIELDS.map(f => [f.path, f])), [])
  const values = useMemo(
    () => Object.fromEntries(FIELDS.map(f => [f.path, parse(f, form[f.path])])),
    [form],
  )
  const errors = useMemo(() => {
    const out = {}
    for (const f of FIELDS) {
      const e = validate(f, values[f.path], values)
      if (e) out[f.path] = e
    }
    return out
  }, [values])
  const changed = FIELDS.filter(f => values[f.path] !== get(economy, f.path))
  const dirty = changed.length > 0
  const invalid = Object.keys(errors).length

  // Live values for previews: draft when valid, saved value otherwise.
  const live = path => (errors[path] ? get(economy, path) : values[path])

  const packs = db.config.coinPacks.filter(p => p.active && !p.firstRecharge)
  const perCoin = p => p.price / (p.coins + p.bonus)
  const cheapest = packs.length ? packs.reduce((a, b) => (a.price <= b.price ? a : b)) : null
  const bestValue = packs.length ? packs.reduce((a, b) => (perCoin(a) <= perCoin(b) ? a : b)) : null

  const set = (path, v) => setForm(f => ({ ...f, [path]: v }))

  const save = async () => {
    let next = economy
    for (const f of FIELDS) next = setPath(next, f.path, values[f.path])
    setSaving(true)
    try {
      const saved = await setConfig('economy', next)
      setForm(toForm(saved))
      toast(`Economy saved · ${changed.length} change${changed.length === 1 ? '' : 's'}`)
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const discard = () => setForm(toForm(economy))

  const field = (path, props = {}) => {
    const f = fieldByPath[path]
    const isChanged = values[path] !== get(economy, path)
    return (
      <Field
        label={
          <span className="a-row" style={{ gap: 6 }}>
            {props.label || f.label}
            {isChanged ? <Badge tone="warning">Edited</Badge> : null}
          </span>
        }
        hint={isChanged && !errors[path] ? `Saved: ${show(f, get(economy, path))}${props.hint ? ` · ${props.hint}` : ''}` : props.hint}
        error={errors[path]}
      >
        <Input
          type={f.kind === 'text' ? 'text' : 'number'}
          inputMode={f.kind === 'text' ? undefined : 'decimal'}
          step={f.kind === 'rate' ? '0.01' : f.kind === 'pct' ? '0.5' : '1'}
          min={f.kind === 'text' ? undefined : 0}
          affix={props.affix}
          value={form[path]}
          onChange={e => set(path, e.target.value)}
        />
      </Field>
    )
  }

  // ---- Calculator (uses draft values so admins can preview before saving)
  const coins = Math.max(0, Number(calc.coins) || 0)
  const coinInr = live('coinInr')
  const rate = live(`commission.${calc.source}`)
  const agencyCut = live('agencyCut')
  const gross = coins * coinInr
  const commission = (gross * rate) / 100
  const share = gross - commission
  const agencyShare = calc.agency ? (share * agencyCut) / 100 : 0
  const net = share - agencyShare
  const paid = cheapest ? coins * perCoin(cheapest) : gross
  const margin = paid - net - agencyShare
  const marginPct = paid ? (margin / paid) * 100 : 0

  return (
    <>
      <PageHeader
        title="Economy"
        subtitle="Coin value, commissions, withdrawals and starter bonuses. The app fetches these values on launch."
        crumbs={[{ label: 'Monetization' }, { label: 'Economy' }]}
      />

      <div className="a-grid side" style={{ alignItems: 'start' }}>
        <div className="a-stack">
          <Card title="Coin value" subtitle="What one coin is worth when REBU settles earnings with hosts">
            <div className="a-stack">
              {field('coinInr', { label: 'Coin value (₹ per coin)', affix: '₹' })}
              {cheapest ? (
                <div className="a-small a-muted">
                  Users pay {inr(perCoin(cheapest))} per coin on the cheapest pack ({num(cheapest.coins + cheapest.bonus)} coins for {inr(cheapest.price)}), so
                  each coin settled at {inr(coinInr)} leaves{' '}
                  <b className={perCoin(cheapest) >= coinInr ? 'a-success' : 'a-danger'}>{inr(perCoin(cheapest) - coinInr)}</b> per coin before
                  commission.
                </div>
              ) : null}
              {bestValue && perCoin(bestValue) < coinInr ? (
                <div className="a-row a-small a-warning" style={{ alignItems: 'flex-start', gap: 6 }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    The best-value pack sells coins at {inr(perCoin(bestValue))}, below the coin value. Coins bought there only stay profitable
                    because of commission.
                  </span>
                </div>
              ) : null}
            </div>
          </Card>

          <Card title="Commission" subtitle="Percent of the gross REBU keeps, by earning source">
            <div className="a-grid c3">
              {SOURCES.map(s =>
                <div key={s.value}>{field(`commission.${s.value}`, { label: s.label, affix: '%', hint: s.unit })}</div>,
              )}
            </div>
          </Card>

          <Card title="Agency" subtitle="Hosts who joined through an agency share part of their earnings">
            <div className="a-grid c2">
              {field('agencyCut', { label: 'Agency cut', affix: '%', hint: 'Percent of the host’s share, after REBU commission' })}
            </div>
          </Card>

          <Card title="Withdrawals" subtitle="Rules for host payouts">
            <div className="a-grid c2">
              {field('withdrawFee', { affix: '%', hint: 'Deducted from every withdrawal' })}
              {field('minWithdraw', { affix: '₹' })}
              {field('maxWithdrawPerDay', { affix: '₹' })}
              {field('payoutTime', { hint: 'Shown to hosts, e.g. “24–48 hours”' })}
            </div>
          </Card>

          <Card title="Users & hosts" subtitle="Starter coins and chat pricing">
            <div className="a-grid c3">
              {field('welcomeBonusCoins', { affix: 'coins', hint: 'Credited when a host is approved' })}
              {field('newUserCoins', { affix: 'coins', hint: 'Free coins on signup' })}
              {field('messageCost', { affix: 'coins', hint: 'Charged per chat message' })}
            </div>
          </Card>

          <DiamondsCard />
        </div>

        <div className="a-stack" style={{ position: 'sticky', top: 'calc(var(--topbar) + 16px)' }}>
          <Card
            title={
              <span className="a-row" style={{ gap: 8 }}>
                <Calculator size={17} /> Earnings calculator
              </span>
            }
            subtitle={dirty ? 'Using your unsaved values' : 'Using saved values'}
          >
            <div className="a-stack">
              <div className="a-grid c2">
                <Field label="Source">
                  <Select
                    value={calc.source}
                    onChange={e => setCalc(c => ({ ...c, source: e.target.value }))}
                    options={SOURCES.map(s => ({ value: s.value, label: s.label }))}
                  />
                </Field>
                <Field label="Coins spent">
                  <Input type="number" min="0" affix="coins" value={calc.coins} onChange={e => setCalc(c => ({ ...c, coins: e.target.value }))} />
                </Field>
              </div>
              <Setting title="Host is in an agency" description={`Agency takes ${pct(agencyCut)} of the host’s share`}>
                <Switch checked={calc.agency} onChange={v => setCalc(c => ({ ...c, agency: v }))} />
              </Setting>
              <div className="a-stack" style={{ gap: 10 }}>
                <Line label={`Gross (${num(coins)} × ${inr(coinInr)})`} value={inr(gross)} />
                <Line label={`REBU commission (${pct(rate)})`} value={`− ${inr(commission)}`} />
                <Line label={`Agency share (${calc.agency ? pct(agencyCut) : 'none'})`} value={`− ${inr(agencyShare)}`} muted={!calc.agency} />
                <div className="a-divider" style={{ margin: '2px 0' }} />
                <Line label="Host net" value={inr(net)} strong />
              </div>
              <div style={{ padding: 12, borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)' }}>
                <div className="a-row between">
                  <span className="a-muted a-small">User paid{cheapest ? ` (at ${inr(perCoin(cheapest))}/coin)` : ''}</span>
                  <b>{inr(paid)}</b>
                </div>
                <div className="a-row between" style={{ marginTop: 6 }}>
                  <span className="a-muted a-small">Platform margin</span>
                  <b className={margin >= 0 ? 'a-success' : 'a-danger'}>
                    {inr(margin)} · {pct(marginPct, 1)}
                  </b>
                </div>
              </div>
            </div>
          </Card>

          <Card title="At a glance">
            <div className="a-stack" style={{ gap: 10 }}>
              <Glance icon={Coins} label="1 coin settles at" value={inr(coinInr)} />
              <Glance icon={Percent} label="Video call commission" value={pct(live('commission.video'))} />
              <Glance icon={Wallet} label="Withdrawal" value={`${pct(live('withdrawFee'))} fee · min ${inr(live('minWithdraw'))}`} />
              <Glance icon={Users} label="Signup gift" value={`${num(live('newUserCoins'))} coins`} />
            </div>
          </Card>
        </div>
      </div>

      {dirty ? <SaveBar count={changed.length} invalid={invalid} saving={saving} onDiscard={discard} onSave={save} /> : null}
    </>
  )
}

/** config.diamondsPerCoin: its own config key, so it saves on its own. */
function DiamondsCard() {
  const { db, setConfig } = useStore()
  const toast = useToast()
  const current = db.config.diamondsPerCoin
  const [value, setValue] = useState(() => String(current ?? ''))
  const [saving, setSaving] = useState(false)
  const n = Number(value)
  const error = !Number.isInteger(n) || n < 1 || n > 100 ? 'Whole number, 1–100' : null
  const dirty = n !== current

  const save = async () => {
    setSaving(true)
    try {
      const saved = await setConfig('diamondsPerCoin', n)
      setValue(String(saved))
      toast('Diamond rate saved')
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (current === undefined) return null
  return (
    <Card
      title="Diamonds"
      subtitle="How gifted coins convert to diamonds"
      actions={
        <Button size="sm" variant="primary" icon={Save} disabled={!dirty || !!error || saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      }
    >
      <Field label="Diamonds per coin" error={value.trim() ? error : 'Required'} hint="Diamonds per coin gifted" style={{ maxWidth: 240 }}>
        <Input type="number" min="1" max="100" affix="💎" value={value} onChange={e => setValue(e.target.value)} />
      </Field>
    </Card>
  )
}

function Line({ label, value, strong, muted }) {
  return (
    <div className="a-row between">
      <span className={muted ? 'a-faint' : strong ? 'a-strong' : 'a-muted'}>{label}</span>
      <b className={strong ? 'a-strong' : muted ? 'a-faint' : ''} style={strong ? { fontSize: 18 } : undefined}>
        {value}
      </b>
    </div>
  )
}

function Glance({ icon: Icon, label, value }) {
  return (
    <div className="a-row">
      <span className="a-stat-icon" style={{ width: 30, height: 30 }}>
        <Icon size={15} />
      </span>
      <span className="a-muted" style={{ flex: 1 }}>
        {label}
      </span>
      <b className="a-strong">{value}</b>
    </div>
  )
}
