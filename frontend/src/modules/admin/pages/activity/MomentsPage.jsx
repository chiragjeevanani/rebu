import { Fragment, useEffect, useState } from 'react'
import { Check, CheckCheck, ChevronLeft, ChevronRight, Flag, Heart, Image as ImageIcon, MessageCircle, Trash2 } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { useApi, usePaging } from '../../hooks/useApi'
import { api, errorText } from '../../api/client'
import { Badge, Button, Card, Confirm, Empty, ErrorState, Loading, PageHeader, SearchInput, Select, Status, Tabs, Who } from '../../components/ui'
import { ago, compact, num } from '../../utils/format'

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Wraps every auto-flag keyword in a highlight. */
function Highlighted({ text, keywords }) {
  const words = keywords.map(k => k.trim()).filter(Boolean)
  if (!words.length) return text
  const re = new RegExp(`(${words.map(escapeRe).join('|')})`, 'gi')
  return text.split(re).map((part, i) =>
    i % 2 ? (
      <mark key={i} style={{ background: 'var(--warning-soft)', color: 'var(--warning)', fontWeight: 700, padding: '0 2px', borderRadius: 4 }}>
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

function MomentCard({ m, keywords, onApprove, onRemove }) {
  const to = m.isHost ? `/admin/hosts/${m.authorId}` : `/admin/users/${m.authorId}`
  return (
    <div className="a-card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', opacity: m.status === 'removed' ? 0.75 : 1 }}>
      {m.image ? (
        <img src={m.image} alt="" loading="lazy" className="a-thumb" style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 0, display: 'block' }} />
      ) : null}
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <div className="a-row between" style={{ alignItems: 'flex-start' }}>
          <Who src={m.authorAvatar} name={m.authorName} sub={`${ago(m.ts)} · ${String(m.id).slice(-8)}`} size={32} to={to} />
          <Badge tone={m.isHost ? 'brand' : 'neutral'}>{m.isHost ? 'Host' : 'User'}</Badge>
        </div>
        <p style={{ margin: 0, fontSize: m.image ? 14 : 16, fontWeight: m.image ? 500 : 600, overflowWrap: 'anywhere' }}>
          <Highlighted text={m.text} keywords={keywords} />
        </p>
        <div className="a-row wrap a-small a-muted" style={{ gap: 14 }}>
          <span className="a-row" style={{ gap: 4 }}>
            <Heart size={14} /> {compact(m.likes)}
          </span>
          <span className="a-row" style={{ gap: 4 }}>
            <MessageCircle size={14} /> {compact(m.comments)}
          </span>
          <span className={`a-row ${m.reports ? 'a-danger' : ''}`} style={{ gap: 4, fontWeight: m.reports ? 700 : 400 }}>
            <Flag size={14} /> {num(m.reports)} report{m.reports === 1 ? '' : 's'}
          </span>
          <span style={{ marginLeft: 'auto' }}>
            <Status value={m.status} />
          </span>
        </div>
        {m.removedReason ? <div className="a-small a-danger">Removed: {m.removedReason}</div> : null}
        <div className="a-row" style={{ gap: 6, marginTop: 'auto' }}>
          {m.status !== 'published' ? (
            <Button size="sm" variant="success" icon={Check} onClick={onApprove}>
              {m.status === 'removed' ? 'Restore' : 'Approve'}
            </Button>
          ) : null}
          {m.status !== 'removed' ? (
            <Button size="sm" variant="soft-danger" icon={Trash2} onClick={onRemove}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

const PAGE = 48

export default function MomentsPage() {
  const { db } = useStore()
  const toast = useToast()
  const [tab, setTab] = useState('flagged')
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [author, setAuthor] = useState('any')
  const [removeId, setRemoveId] = useState(null)
  const [bulk, setBulk] = useState(false)
  const [busy, setBusy] = useState(false)
  const keywords = db.config.settings.moderation?.autoFlagKeywords || []

  // Debounce the search box so typing doesn't fire a request per key.
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const pg = usePaging({ status: tab, author: author === 'any' ? undefined : author, q: term || undefined }, PAGE)
  const res = useApi('/admin/moments', pg.query)
  const rows = res.data?.items || []
  const c = res.data?.counts || {}
  const total = res.data?.total || 0
  const pages = Math.max(1, Math.ceil(total / PAGE))

  const approve = async m => {
    try {
      await api.post(`/admin/moments/${m.id}/approve`)
      toast(m.status === 'removed' ? 'Moment restored' : 'Moment approved')
      res.reload()
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  const target = removeId ? rows.find(m => m.id === removeId) : null

  return (
    <>
      <PageHeader
        title="Moments"
        subtitle={`Photo and text posts from hosts and users. Keywords that auto-flag a post: ${keywords.join(', ') || 'none'}.`}
        actions={
          tab === 'flagged' && rows.length ? (
            <Button variant="primary" icon={CheckCheck} onClick={() => setBulk(true)}>
              Approve all visible ({rows.length})
            </Button>
          ) : null
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'flagged', label: 'Flagged', count: c.flagged },
          { value: 'all', label: 'All', count: (c.flagged || 0) + (c.published || 0) + (c.removed || 0) },
          { value: 'removed', label: 'Removed', count: c.removed },
        ]}
      />

      <div className="a-toolbar a-card" style={{ marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        <SearchInput value={q} onChange={setQ} placeholder="Text, author, moment ID" />
        <Select
          value={author}
          onChange={e => setAuthor(e.target.value)}
          options={[
            { value: 'any', label: 'Hosts & users' },
            { value: 'host', label: 'Hosts only' },
            { value: 'user', label: 'Users only' },
          ]}
        />
      </div>

      {rows.length ? (
        <>
          <div
            style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', alignItems: 'start', opacity: res.loading ? 0.55 : 1 }}
            aria-busy={res.loading || undefined}
          >
            {rows.map(m => (
              <MomentCard key={m.id} m={m} keywords={keywords} onApprove={() => approve(m)} onRemove={() => setRemoveId(m.id)} />
            ))}
          </div>
          {total > PAGE ? (
            <div className="a-pager">
              <span>
                {(pg.page - 1) * PAGE + 1}–{Math.min(total, pg.page * PAGE)} of {total}
              </span>
              <span className="a-spacer" />
              <Button size="sm" iconOnly icon={ChevronLeft} disabled={pg.page <= 1} onClick={() => pg.setPage(pg.page - 1)} aria-label="Previous page" />
              <span>
                Page {pg.page} of {pages}
              </span>
              <Button size="sm" iconOnly icon={ChevronRight} disabled={pg.page >= pages} onClick={() => pg.setPage(pg.page + 1)} aria-label="Next page" />
            </div>
          ) : null}
        </>
      ) : (
        <Card>
          {res.error ? (
            <ErrorState error={res.error} onRetry={res.reload} />
          ) : res.loading ? (
            <Loading />
          ) : (
            <Empty
              icon={tab === 'flagged' ? CheckCheck : ImageIcon}
              title={tab === 'flagged' ? 'Queue is clear' : 'No moments'}
              text={tab === 'flagged' ? 'No flagged moments need review.' : 'Nothing matches this filter.'}
            />
          )}
        </Card>
      )}

      <Confirm
        open={!!target}
        title="Remove this moment?"
        message={`It’s hidden from every feed. ${target?.authorName} is told it broke the community rules.`}
        confirmLabel="Remove"
        danger
        reason
        onClose={() => setRemoveId(null)}
        onConfirm={async reason => {
          try {
            await api.post(`/admin/moments/${target.id}/remove`, { reason })
            toast('Moment removed')
            setRemoveId(null)
            res.reload()
          } catch (e) {
            toast(errorText(e), 'error')
          }
        }}
      />
      <Confirm
        open={bulk}
        title={`Approve ${rows.length} moment${rows.length === 1 ? '' : 's'}?`}
        message="Every flagged moment in this view is published again and its reports are cleared."
        confirmLabel={busy ? 'Approving…' : 'Approve all'}
        onClose={() => setBulk(false)}
        onConfirm={async () => {
          if (busy) return
          setBusy(true)
          try {
            const r = await api.post('/admin/moments/bulk-approve', { ids: rows.map(m => m.id) })
            toast(`${r.approved} moments approved`)
            setBulk(false)
            res.reload()
          } catch (e) {
            toast(errorText(e), 'error')
          } finally {
            setBusy(false)
          }
        }}
      />
    </>
  )
}
