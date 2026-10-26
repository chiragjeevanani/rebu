import { useMemo, useState } from 'react'
import { CalendarDays, Eye, EyeOff, Megaphone, MousePointerClick, Pencil, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { Badge, Button, Card, Confirm, Empty, Field, Input, Modal, PageHeader, Select, Status, Tabs } from '../../components/ui'
import { compact, date, label, num, pct } from '../../utils/format'

const DAY = 86400000
// Read the clock in handlers only; render uses the time captured on mount.
const clock = () => Date.now()
const PLACEMENTS = ['Home', 'Events', 'Coins tab', 'Splash']
const PLACEMENT_TONE = { Home: 'brand', Events: 'violet', 'Coins tab': 'warning', Splash: 'info' }
const SWATCHES = ['#D81B60', '#F5B301', '#1E9E5A', '#2F6FDE', '#5B2A86', '#E89A00', '#1C1C1E']
const STATUSES = ['live', 'scheduled', 'draft', 'ended']

// Drafts stay drafts; everything else follows its date window.
const statusOf = (b, now) => {
  if (b.status === 'draft') return 'draft'
  if (now < b.startsAt) return 'scheduled'
  if (now > b.endsAt) return 'ended'
  return 'live'
}

const toDay = ts => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const fromDay = (s, endOfDay) => {
  const [y, m, d] = s.split('-').map(Number)
  return endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999).getTime() : new Date(y, m - 1, d).getTime()
}

/** Image with a solid colour fallback when the URL is empty or fails to load. */
function BannerArt({ image, color, title, subtitle, cta, height = 150 }) {
  const [failed, setFailed] = useState(null)
  const showImage = image && failed !== image
  return (
    <div
      style={{
        position: 'relative',
        height,
        borderRadius: 10,
        overflow: 'hidden',
        background: color || 'var(--surface-3)',
      }}
    >
      {showImage ? (
        <img src={image} alt="" onError={() => setFailed(image)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : null}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          color: '#fff',
          background: showImage ? 'linear-gradient(transparent 35%, rgba(0,0,0,.6))' : 'transparent',
        }}
      >
        <b style={{ fontSize: 16, lineHeight: 1.2 }}>{title || 'Banner title'}</b>
        {subtitle ? <span style={{ fontSize: 12.5, opacity: 0.9, marginTop: 2 }}>{subtitle}</span> : null}
        {cta ? (
          <span style={{ alignSelf: 'flex-start', marginTop: 8, padding: '4px 10px', borderRadius: 999, background: '#fff', color: '#111', fontSize: 11.5, fontWeight: 800 }}>
            {cta}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function BannerForm({ open, banner, onClose, onSave }) {
  const [now] = useState(clock)
  const [f, setF] = useState(() =>
    banner
      ? { ...banner, start: toDay(banner.startsAt), end: toDay(banner.endsAt) }
      : {
          title: '',
          subtitle: '',
          image: '',
          cta: 'Join now',
          link: 'rebu://events',
          placement: 'Home',
          color: SWATCHES[0],
          start: toDay(now),
          end: toDay(now + 7 * DAY),
        },
  )
  const set = patch => setF(x => ({ ...x, ...patch }))

  const errors = {
    title: !f.title.trim() ? 'Title is required' : null,
    link: f.link && !/^rebu:\/\/\S+$/.test(f.link.trim()) ? 'Deeplinks start with rebu://' : null,
    image: f.image && !/^https?:\/\/\S+$/.test(f.image.trim()) ? 'Use a full http(s) URL' : null,
    end: f.start && f.end && fromDay(f.end, true) < fromDay(f.start) ? 'End date is before the start date' : null,
  }
  const valid = f.start && f.end && !Object.values(errors).some(Boolean)

  const payload = draft => ({
    title: f.title.trim(),
    subtitle: f.subtitle.trim(),
    image: f.image.trim(),
    cta: f.cta.trim(),
    link: f.link.trim(),
    placement: f.placement,
    color: f.color,
    startsAt: fromDay(f.start),
    endsAt: fromDay(f.end, true),
    draft,
  })

  const willBe = valid ? statusOf({ status: 'x', startsAt: fromDay(f.start), endsAt: fromDay(f.end, true) }, now) : null

  return (
    <Modal
      open={open}
      wide
      title={banner ? 'Edit banner' : 'New banner'}
      onClose={onClose}
      footer={
        <>
          <span className="a-small a-muted" style={{ marginRight: 'auto', alignSelf: 'center' }}>
            {willBe ? `Publishing makes it ${willBe === 'live' ? 'live now' : willBe}.` : null}
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button disabled={!valid} onClick={() => onSave(payload(true))}>
            Save as draft
          </Button>
          <Button variant="primary" disabled={!valid} onClick={() => onSave(payload(false))}>
            {banner && banner.status !== 'draft' ? 'Save changes' : 'Publish'}
          </Button>
        </>
      }
    >
      <div className="a-stack">
        <BannerArt image={f.image.trim()} color={f.color} title={f.title} subtitle={f.subtitle} cta={f.cta} height={170} />
        <div className="a-grid c2">
          <Field label="Title" error={errors.title && f.title !== '' ? errors.title : null}>
            <Input value={f.title} maxLength={60} onChange={e => set({ title: e.target.value })} placeholder="Diwali Gift Festival" autoFocus />
          </Field>
          <Field label="Subtitle">
            <Input value={f.subtitle} maxLength={90} onChange={e => set({ subtitle: e.target.value })} placeholder="Send festival gifts, win coins" />
          </Field>
        </div>
        <Field label="Image URL" hint="1200 × 500 recommended. Leave empty to use the solid colour." error={errors.image}>
          <Input value={f.image} onChange={e => set({ image: e.target.value })} placeholder="https://…" />
        </Field>
        <div className="a-grid c2">
          <Field label="Button text">
            <Input value={f.cta} maxLength={20} onChange={e => set({ cta: e.target.value })} placeholder="Join now" />
          </Field>
          <Field label="Deeplink" error={errors.link} hint="Where the banner opens in the app">
            <Input className="a-mono" value={f.link} onChange={e => set({ link: e.target.value })} placeholder="rebu://events" />
          </Field>
        </div>
        <div className="a-grid c2">
          <Field label="Placement">
            <Select value={f.placement} onChange={e => set({ placement: e.target.value })} options={PLACEMENTS} />
          </Field>
          <Field label="Colour">
            <div className="a-row wrap" style={{ gap: 6 }}>
              {SWATCHES.map(c => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  onClick={() => set({ color: c })}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: c,
                    cursor: 'pointer',
                    border: f.color.toLowerCase() === c.toLowerCase() ? '3px solid var(--surface)' : '0',
                    boxShadow: f.color.toLowerCase() === c.toLowerCase() ? '0 0 0 2px var(--ink)' : 'none',
                  }}
                />
              ))}
              <input
                type="color"
                value={f.color}
                onChange={e => set({ color: e.target.value })}
                aria-label="Custom colour"
                style={{ width: 34, height: 28, padding: 0, border: 0, background: 'none', cursor: 'pointer' }}
              />
            </div>
          </Field>
        </div>
        <div className="a-grid c2">
          <Field label="Starts">
            <Input type="date" value={f.start} onChange={e => set({ start: e.target.value })} />
          </Field>
          <Field label="Ends (inclusive)" error={errors.end}>
            <Input type="date" value={f.end} min={f.start} onChange={e => set({ end: e.target.value })} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

function BannerCard({ b, status, onEdit, onToggle, onDelete }) {
  const ctr = b.impressions ? (b.clicks / b.impressions) * 100 : 0
  return (
    <Card padded={false}>
      <div style={{ padding: 12, paddingBottom: 0 }}>
        <BannerArt image={b.image} color={b.color} title={b.title} subtitle={b.subtitle} cta={b.cta} />
      </div>
      <div className="a-card-body a-stack" style={{ gap: 12 }}>
        <div className="a-row wrap" style={{ gap: 6 }}>
          <Status value={status} />
          <Badge tone={PLACEMENT_TONE[b.placement] || 'neutral'}>{b.placement}</Badge>
          <span className="a-spacer" />
          <span className="a-mono a-faint">{b.id}</span>
        </div>
        <div className="a-row a-small a-muted" style={{ gap: 6 }}>
          <CalendarDays size={14} />
          {date(b.startsAt)} – {date(b.endsAt)}
        </div>
        <div className="a-grid c3" style={{ gap: 8 }}>
          <div>
            <div className="a-small a-muted a-row" style={{ gap: 4 }}><Eye size={13} /> Views</div>
            <b className="a-strong" title={num(b.impressions)}>{compact(b.impressions)}</b>
          </div>
          <div>
            <div className="a-small a-muted a-row" style={{ gap: 4 }}><MousePointerClick size={13} /> Clicks</div>
            <b className="a-strong" title={num(b.clicks)}>{compact(b.clicks)}</b>
          </div>
          <div>
            <div className="a-small a-muted">CTR</div>
            <b className="a-strong">{b.impressions ? pct(ctr, 1) : '—'}</b>
          </div>
        </div>
      </div>
      <div className="a-card-foot a-row" style={{ gap: 6 }}>
        <Button size="sm" icon={Pencil} onClick={onEdit}>
          Edit
        </Button>
        <Button size="sm" icon={status === 'draft' ? Eye : EyeOff} variant={status === 'draft' ? 'primary' : 'secondary'} onClick={onToggle}>
          {status === 'draft' ? 'Publish' : 'Unpublish'}
        </Button>
        <span className="a-spacer" />
        <Button size="sm" variant="ghost" iconOnly icon={Trash2} onClick={onDelete} aria-label="Delete banner" />
      </div>
    </Card>
  )
}

export default function BannersPage() {
  const { db, update, create, remove, log } = useStore()
  const toast = useToast()
  const [now] = useState(clock)
  const [tab, setTab] = useState('live')
  const [editing, setEditing] = useState(null) // banner | 'new' | null
  const [deleting, setDeleting] = useState(null)

  const withStatus = useMemo(() => db.banners.map(b => ({ b, status: statusOf(b, now) })), [db.banners, now])
  const counts = useMemo(
    () => Object.fromEntries(STATUSES.map(s => [s, withStatus.filter(x => x.status === s).length])),
    [withStatus],
  )
  const view = withStatus.filter(x => x.status === tab).sort((x, y) => y.b.startsAt - x.b.startsAt)

  const save = ({ draft, ...data }) => {
    const status = draft ? 'draft' : statusOf({ ...data, status: 'x' }, clock())
    if (editing && editing !== 'new') {
      update('banners', editing.id, { ...data, status }, [`Updated banner “${data.title}”${draft ? ' (draft)' : ''}`, editing.id])
      toast('Banner saved')
    } else {
      const b = create('banners', { ...data, status, clicks: 0, impressions: 0 })
      log(`${draft ? 'Created draft banner' : 'Published banner'} “${data.title}”`, b.id)
      toast(draft ? 'Draft saved' : `Banner ${status === 'live' ? 'is live' : 'scheduled'}`)
    }
    setTab(status)
    setEditing(null)
  }

  const toggle = (b, status) => {
    if (status === 'draft') {
      const next = statusOf({ ...b, status: 'x' }, clock())
      update('banners', b.id, { status: next }, ['Published banner', b.id])
      toast(next === 'ended' ? 'Published, but its end date has passed. Edit the dates to show it.' : `Banner ${next === 'live' ? 'is live' : 'scheduled'}`)
    } else {
      update('banners', b.id, { status: 'draft' }, ['Unpublished banner', b.id])
      toast('Banner moved to drafts')
    }
  }

  return (
    <>
      <PageHeader
        title="Banners & events"
        subtitle="Carousel banners and event cards shown in the app. Status follows the date range unless a banner is saved as a draft."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
            New banner
          </Button>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={STATUSES.map(s => ({ value: s, label: label(s), count: counts[s] }))}
      />

      {view.length === 0 ? (
        <Card>
          <Empty
            icon={Megaphone}
            title={`No ${tab} banners`}
            text={tab === 'draft' ? 'Save a banner as a draft to prepare it before it goes out.' : 'Create a banner to promote an event, offer or feature.'}
          />
        </Card>
      ) : (
        <div className="a-grid c3">
          {view.map(({ b, status }) => (
            <BannerCard
              key={b.id}
              b={b}
              status={status}
              onEdit={() => setEditing(b)}
              onToggle={() => toggle(b, status)}
              onDelete={() => setDeleting(b)}
            />
          ))}
        </div>
      )}

      {editing ? (
        <BannerForm
          key={editing === 'new' ? 'new' : editing.id}
          open
          banner={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}

      <Confirm
        open={!!deleting}
        title={`Delete “${deleting?.title}”?`}
        message="The banner is removed from the app immediately and its stats are lost. Unpublish it instead if you might reuse it."
        confirmLabel="Delete banner"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          remove('banners', deleting.id, [`Deleted banner “${deleting.title}”`, deleting.id])
          toast('Banner deleted')
          setDeleting(null)
        }}
      />
    </>
  )
}
