import { useMemo, useRef, useState } from 'react'
import { Gift, Pencil, Plus, RotateCcw, Trash2, Upload } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { api, errorText } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import { Badge, Button, Card, Confirm, Empty, Field, Input, Modal, PageHeader, Seg, Select, Setting, Switch } from '../../components/ui'
import { BarList } from '../../components/charts'
import LottiePreview from '../../components/LottiePreview'
import { compact, inr, num } from '../../utils/format'

const CATEGORIES = ['Basic', 'Popular', 'Luxury']
const FULL_SCREEN_AT = 999
// Gifts that ship with a bundled animation at /static/gifts/<key>.json.
const BUNDLED = ['rose', 'heart', 'kiss', 'chocolate', 'teddy', 'cake', 'ring', 'crown', 'car', 'yacht', 'castle', 'rocket']
const bundledFor = key => (BUNDLED.includes(key) ? `/static/gifts/${key}.json` : '')
const MAX_ANIMATION_BYTES = 1000 * 1000
const SORTS = [
  { value: 'order', label: 'App order' },
  { value: 'asc', label: 'Price: low to high' },
  { value: 'desc', label: 'Price: high to low' },
  { value: 'sent', label: 'Most sent' },
]

const slug = s =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const suggestCategory = coins => (coins >= FULL_SCREEN_AT ? 'Luxury' : coins >= 99 ? 'Popular' : 'Basic')

function GiftModal({ gift, gifts, coinInr, onClose, onSave }) {
  const [f, setF] = useState(() =>
    gift
      ? {
          emoji: gift.emoji,
          name: gift.name,
          key: gift.key,
          coins: String(gift.coins),
          category: gift.category,
          fullScreen: gift.fullScreen,
          active: gift.active,
          animation: gift.animation || '',
        }
      : { emoji: '', name: '', key: '', coins: '', category: 'Basic', fullScreen: false, active: true, animation: '' },
  )
  // Until the admin touches these, they follow the name / price.
  const [touched, setTouched] = useState({ key: !!gift, fullScreen: !!gift, category: !!gift, animation: !!gift })
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const fileRef = useRef(null)
  const toast = useToast()
  const coins = Number(f.coins)
  const bundled = bundledFor(f.key)

  const set = (k, v) => {
    setTouched(t => ({ ...t, [k]: true }))
    setF(x => ({ ...x, [k]: v }))
  }
  // New gifts take their key from the name, and the bundled animation if one matches.
  const setName = v =>
    setF(x => {
      const key = touched.key ? x.key : slug(v)
      return { ...x, name: v, key, animation: touched.animation ? x.animation : bundledFor(key) }
    })

  const setKey = key => {
    setTouched(t => ({ ...t, key: true }))
    setF(x => ({ ...x, key, animation: touched.animation ? x.animation : bundledFor(key) }))
  }

  // Upload the Lottie JSON itself; the server checks it and returns its URL.
  const upload = async file => {
    setUploadError(null)
    if (!file) return
    if (file.size > MAX_ANIMATION_BYTES) return setUploadError('That file is over 1 MB. Export a smaller animation.')
    let json
    try {
      json = JSON.parse(await file.text())
    } catch {
      return setUploadError('That file isn’t valid JSON. Pick the Lottie .json file.')
    }
    setUploading(true)
    try {
      const { url } = await api.post('/admin/uploads/animation', json)
      set('animation', url)
      toast('Animation uploaded · save the gift to use it')
    } catch (e) {
      setUploadError(errorText(e))
    } finally {
      setUploading(false)
    }
  }
  const setCoins = v => {
    const n = Number(v)
    setF(x => ({
      ...x,
      coins: v,
      fullScreen: touched.fullScreen || !Number.isFinite(n) ? x.fullScreen : n >= FULL_SCREEN_AT,
      category: touched.category || !Number.isFinite(n) || !v ? x.category : suggestCategory(n),
    }))
  }

  const err = {}
  if (!f.emoji.trim()) err.emoji = 'Required'
  else if ([...f.emoji.trim()].length > 4) err.emoji = 'One emoji'
  if (!f.name.trim()) err.name = 'Required'
  else if (f.name.trim().length > 24) err.name = 'Keep names under 24 characters'
  if (!f.key) err.key = 'Required'
  else if (!/^[a-z0-9_]+$/.test(f.key)) err.key = 'Lowercase letters, numbers and _ only'
  else if (gifts.some(g => g.id !== gift?.id && g.key === f.key)) err.key = 'Another gift already uses this key'
  if (!f.coins.trim() || !Number.isInteger(coins) || coins <= 0) err.coins = 'Whole number of coins, more than 0'
  const ok = Object.keys(err).length === 0

  return (
    <Modal
      open
      title={gift ? `Edit ${gift.name}` : 'New gift'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ok || uploading}
            onClick={() =>
              onSave({
                emoji: f.emoji.trim(),
                name: f.name.trim(),
                key: f.key,
                coins,
                category: f.category,
                fullScreen: f.fullScreen,
                active: f.active,
                animation: f.animation,
              })
            }
          >
            {gift ? 'Save gift' : 'Create gift'}
          </Button>
        </>
      }
    >
      <div className="a-stack">
        <div className="a-row" style={{ alignItems: 'flex-start' }}>
          <Field label="Emoji" error={err.emoji} style={{ width: 92 }}>
            <Input value={f.emoji} onChange={e => set('emoji', e.target.value)} style={{ fontSize: 20, textAlign: 'center' }} autoFocus />
          </Field>
          <Field label="Name" error={err.name} style={{ flex: 1 }}>
            <Input value={f.name} onChange={e => setName(e.target.value)} placeholder="e.g. Sports Car" />
          </Field>
        </div>
        <Field label="Key" hint="Stable ID the app uses for the gift and its animation. Lowercase, unique." error={err.key}>
          <Input className="a-mono" value={f.key} onChange={e => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, '_'))} placeholder="sports_car" />
        </Field>
        <div className="a-grid c2">
          <Field label="Price" error={err.coins} hint={!err.coins && f.coins ? `≈ ${inr(coins * coinInr)} gross per send` : null}>
            <Input type="number" min="1" affix="coins" value={f.coins} onChange={e => setCoins(e.target.value)} />
          </Field>
          <Field label="Category">
            <Select value={f.category} onChange={e => set('category', e.target.value)} options={CATEGORIES} />
          </Field>
        </div>
        <div className="a-field">
          <span className="a-label">Animation</span>
          <div className="a-row" style={{ alignItems: 'flex-start', gap: 14 }}>
            <span
              style={{
                width: 112,
                height: 112,
                flexShrink: 0,
                display: 'grid',
                placeItems: 'center',
                borderRadius: 'var(--radius)',
                background: 'var(--surface-2)',
              }}
            >
              <LottiePreview src={f.animation} size={100} fallback={<span style={{ fontSize: 48 }}>{f.emoji || '🎁'}</span>} />
            </span>
            <div className="a-stack" style={{ gap: 8, minWidth: 0, flex: 1 }}>
              <span className="a-small a-muted a-mono" style={{ wordBreak: 'break-all' }}>
                {f.animation || 'No animation: the app pops up the emoji instead.'}
              </span>
              <span className="a-row wrap" style={{ gap: 6 }}>
                <Button size="sm" icon={Upload} disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? 'Uploading…' : 'Upload Lottie JSON'}
                </Button>
                {bundled && f.animation !== bundled ? (
                  <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => set('animation', bundled)}>
                    Use default
                  </Button>
                ) : null}
                {f.animation ? (
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => set('animation', '')}>
                    Remove
                  </Button>
                ) : null}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={e => {
                  upload(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              {uploadError ? (
                <span className="a-error">{uploadError}</span>
              ) : (
                <span className="a-hint">A Lottie .json file (as exported from LottieFiles or After Effects), up to 1 MB.</span>
              )}
            </div>
          </div>
        </div>
        <div>
          <Setting
            title="Large animation"
            description={`Every gift plays its animation when sent. Large ones play bigger, across the screen. On by default for gifts of ${num(FULL_SCREEN_AT)}+ coins.`}
          >
            <Switch checked={f.fullScreen} onChange={v => set('fullScreen', v)} />
          </Setting>
          <Setting title="Active" description="Inactive gifts are hidden from the gift panel.">
            <Switch checked={f.active} onChange={v => set('active', v)} />
          </Setting>
        </div>
      </div>
    </Modal>
  )
}

const diff = (a, b) => {
  const out = []
  if (a.emoji !== b.emoji) out.push(`emoji ${a.emoji} → ${b.emoji}`)
  if (a.name !== b.name) out.push(`name “${a.name}” → “${b.name}”`)
  if (a.key !== b.key) out.push(`key ${a.key} → ${b.key}`)
  if (a.coins !== b.coins) out.push(`price ${num(a.coins)} → ${num(b.coins)} coins`)
  if (a.category !== b.category) out.push(`category ${a.category} → ${b.category}`)
  if (a.fullScreen !== b.fullScreen) out.push(b.fullScreen ? 'large animation on' : 'large animation off')
  if ((a.animation || '') !== (b.animation || '')) out.push('animation changed')
  if (a.active !== b.active) out.push(b.active ? 'activated' : 'deactivated')
  return out
}

// Client-only fields never go to the API (the gifts schema is key-based).
const GIFT_FIELDS = ['key', 'name', 'emoji', 'image', 'animation', 'coins', 'fullScreen', 'category', 'active', 'order']
const toApi = list => list.map(g => Object.fromEntries(GIFT_FIELDS.filter(k => g[k] !== undefined).map(k => [k, g[k]])))

export default function GiftsPage() {
  const { db, setConfig } = useStore()
  const toast = useToast()
  const [cat, setCat] = useState('all')
  const [sort, setSort] = useState('order')
  const [editing, setEditing] = useState(null) // gift | 'new'
  const [deleting, setDeleting] = useState(null)
  // Server gifts are keyed by `key`; the page uses `id`. 30-day sends and ₹ gross
  // come from GET /admin/finance/gifts (sent30d/gross30d are display-only, stripped on save).
  const statsRes = useApi('/admin/finance/gifts', { days: 30 })
  const gifts = useMemo(() => {
    const stats = new Map((statsRes.data?.items || []).map(x => [x.key, x]))
    return db.config.gifts.map(g => ({ ...g, id: g.key, sent30d: stats.get(g.key)?.sent || 0, gross30d: stats.get(g.key)?.gross || 0 }))
  }, [db.config.gifts, statsRes.data])
  const coinInr = db.config.economy.coinInr
  const giftCut = db.config.economy.commission.gift

  const persist = async (list, msg) => {
    try {
      await setConfig('gifts', toApi(list))
      if (msg) toast(msg)
      return true
    } catch (e) {
      toast(errorText(e), 'error')
      return false
    }
  }

  const rows = useMemo(() => {
    const list = gifts.filter(g => cat === 'all' || g.category === cat)
    const by = {
      order: (a, b) => (a.order ?? 0) - (b.order ?? 0),
      asc: (a, b) => a.coins - b.coins,
      desc: (a, b) => b.coins - a.coins,
      sent: (a, b) => (b.sent30d || 0) - (a.sent30d || 0),
    }[sort]
    return [...list].sort(by)
  }, [gifts, cat, sort])

  const summary = useMemo(() => {
    const gross = gifts.reduce((n, g) => n + g.gross30d, 0)
    const top = [...gifts]
      .sort((a, b) => (b.sent30d || 0) - (a.sent30d || 0))
      .slice(0, 6)
      .map(g => ({ label: `${g.emoji} ${g.name}`, value: g.sent30d || 0 }))
    return { gross, rebu: (gross * giftCut) / 100, sent: gifts.reduce((n, g) => n + (g.sent30d || 0), 0), top }
  }, [gifts, giftCut])

  const counts = Object.fromEntries(CATEGORIES.map(c => [c, gifts.filter(g => g.category === c).length]))

  const toggle = g => persist(gifts.map(x => (x.id === g.id ? { ...x, active: !x.active } : x)))

  const save = async data => {
    let ok = true
    if (editing === 'new') {
      const gift = { ...data, order: Math.max(0, ...gifts.map(g => g.order || 0)) + 1 }
      ok = await persist([...gifts, gift], `${gift.name} added`)
    } else if (diff(editing, data).length) {
      ok = await persist(gifts.map(x => (x.id === editing.id ? { ...x, ...data } : x)), `${data.name} saved`)
    }
    if (ok) setEditing(null)
  }

  const remove = async () => {
    const g = deleting
    setDeleting(null)
    await persist(gifts.filter(x => x.id !== g.id), `${g.name} deleted`)
  }

  return (
    <>
      <PageHeader
        title="Gifts"
        subtitle={`${gifts.length} gifts · ${gifts.filter(g => g.active).length} active · ${gifts.filter(g => g.fullScreen).length} with large animation · ${gifts.filter(g => !g.animation).length} without animation`}
        crumbs={[{ label: 'Monetization' }, { label: 'Gifts' }]}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
            New gift
          </Button>
        }
      />

      <div className="a-grid side" style={{ alignItems: 'start' }}>
        <Card padded={false}>
          <div className="a-toolbar">
            <Seg
              options={[{ value: 'all', label: `All ${gifts.length}` }, ...CATEGORIES.map(c => ({ value: c, label: `${c} ${counts[c]}` }))]}
              value={cat}
              onChange={setCat}
            />
            <span className="a-spacer" />
            <Select value={sort} onChange={e => setSort(e.target.value)} options={SORTS} />
          </div>
          {rows.length ? (
            <div style={{ display: 'grid', gap: 12, padding: 18, gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
              {rows.map(g => (
                <GiftCard key={g.id} gift={g} onToggle={() => toggle(g)} onEdit={() => setEditing(g)} onDelete={() => setDeleting(g)} />
              ))}
            </div>
          ) : (
            <Empty icon={Gift} title="No gifts in this category" text="Pick another category or add a gift." />
          )}
        </Card>

        <div className="a-stack">
          <Card title="Gift revenue · 30 days" subtitle={`Gross of gifts sent, settled at ${inr(coinInr)} per coin`}>
            <div className="a-stat-value" style={{ marginTop: 0 }}>
              {inr(Math.round(summary.gross))}
            </div>
            <div className="a-small a-muted" style={{ marginTop: 4 }}>
              Gross from {num(summary.sent)} gifts sent · REBU keeps {giftCut}% ≈ <b className="a-strong">{inr(Math.round(summary.rebu))}</b>
            </div>
          </Card>
          <Card title="Most-sent gifts" subtitle="Last 30 days">
            {summary.top.length ? <BarList items={summary.top} format={v => compact(v)} /> : <Empty title="No gifts yet" />}
          </Card>
        </div>
      </div>

      {editing ? <GiftModal gift={editing === 'new' ? null : editing} gifts={gifts} coinInr={coinInr} onClose={() => setEditing(null)} onSave={save} /> : null}

      <Confirm
        open={!!deleting}
        title={`Delete ${deleting?.name}?`}
        message="The gift disappears from the gift panel right away. Gifts already sent stay in host earnings. To pause it instead, switch it off."
        confirmLabel="Delete gift"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={remove}
      />
    </>
  )
}

function GiftCard({ gift: g, onToggle, onEdit, onDelete }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        opacity: g.active ? 1 : 0.6,
        background: 'var(--surface)',
      }}
    >
      <div className="a-row between" style={{ alignItems: 'flex-start' }}>
        <LottiePreview
          src={g.animation}
          size={64}
          fallback={
            <span style={{ fontSize: 44, lineHeight: 1 }} aria-hidden>
              {g.emoji}
            </span>
          }
        />
        <Switch checked={g.active} onChange={onToggle} />
      </div>
      <div>
        <b className="a-strong" style={{ fontSize: 15 }}>
          {g.name}
        </b>
        <div className="a-small a-muted a-mono">{g.key}</div>
      </div>
      <div className="a-row" style={{ gap: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--coin)' }} />
        <b className="a-strong">{num(g.coins)}</b>
        <span className="a-muted a-small">coins</span>
      </div>
      <div className="a-row wrap" style={{ gap: 6 }}>
        <Badge tone={g.category === 'Luxury' ? 'violet' : g.category === 'Popular' ? 'info' : 'neutral'}>{g.category}</Badge>
        {g.fullScreen ? <Badge tone="brand">Large animation</Badge> : null}
        {!g.animation ? <Badge tone="warning">No animation</Badge> : g.animation !== bundledFor(g.key) ? <Badge tone="info">Custom animation</Badge> : null}
      </div>
      <div className="a-row between" style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 'auto' }}>
        <span className="a-small a-muted">
          Sent <b className="a-strong">{num(g.sent30d || 0)}</b> · 30d
        </span>
        <span className="a-row" style={{ gap: 2 }}>
          <Button size="sm" variant="ghost" iconOnly icon={Pencil} onClick={onEdit} aria-label={`Edit ${g.name}`} />
          <Button size="sm" variant="ghost" iconOnly icon={Trash2} onClick={onDelete} aria-label={`Delete ${g.name}`} />
        </span>
      </div>
    </div>
  )
}
