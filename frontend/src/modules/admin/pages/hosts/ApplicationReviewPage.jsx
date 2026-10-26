import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Check, CheckCircle2, ChevronLeft, ChevronRight, FileX, ShieldCheck, X, XCircle } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { useApi } from '../../hooks/useApi'
import { api, errorText } from '../../api/client'
import { Avatar, Badge, Button, Card, Empty, Field, Modal, PageHeader, Pending, Progress, Status, Textarea } from '../../components/ui'
import { ago, date, dateTime, inr, num } from '../../utils/format'

const REJECT_REASONS = [
  'Selfie doesn’t match profile photos',
  'ID photo is blurry or cut off',
  'Name on ID doesn’t match',
  'Under 18',
  'Profile photos contain other people or are not you',
  'Contact details in profile',
]

const CHECKLIST = [
  ['photos', 'Photos are clear and show only the applicant'],
  ['selfie', 'Selfie matches the profile photos'],
  ['id', 'ID is readable and the name matches'],
  ['age', 'Applicant is 18 or older'],
  ['bio', 'No contact details in the bio'],
]

const matchTone = v => (v >= 80 ? 'success' : v >= 70 ? 'warning' : 'danger')

/** Highest tier within the level cap (falls back to the lowest tier). */
const clampRate = (tiers, value, cap) => {
  if (value <= cap) return value
  const ok = tiers.filter(t => t <= cap)
  return ok.length ? ok[ok.length - 1] : tiers[0]
}

function Photo({ src, label, ratio = '3 / 4' }) {
  if (!src) {
    return (
      <figure style={{ margin: 0 }}>
        <div className="a-thumb a-muted a-small" style={{ width: '100%', aspectRatio: ratio, display: 'grid', placeItems: 'center' }}>
          Not provided
        </div>
        {label ? (
          <figcaption className="a-small a-muted" style={{ marginTop: 6, fontWeight: 600 }}>
            {label}
          </figcaption>
        ) : null}
      </figure>
    )
  }
  return (
    <figure style={{ margin: 0 }}>
      <a href={src} target="_blank" rel="noreferrer" title="Open full size">
        <img src={src} alt={label || ''} className="a-thumb" loading="lazy" style={{ width: '100%', aspectRatio: ratio, display: 'block' }} />
      </a>
      {label ? (
        <figcaption className="a-small a-muted" style={{ marginTop: 6, fontWeight: 600 }}>
          {label}
        </figcaption>
      ) : null}
    </figure>
  )
}

function RejectModal({ open, app, onClose, onSave }) {
  const [picked, setPicked] = useState([])
  const [custom, setCustom] = useState('')
  const reasons = [...picked, ...(custom.trim() ? [custom.trim()] : [])]
  const toggle = r => setPicked(p => (p.includes(r) ? p.filter(x => x !== r) : [...p, r]))
  return (
    <Modal
      open={open}
      title={`Reject ${app.name}?`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={!reasons.length} onClick={() => onSave(reasons)}>
            Reject application
          </Button>
        </>
      }
    >
      <div className="a-stack">
        <p className="a-muted">
          The applicant sees these reasons in the app with a <b className="a-strong">Fix &amp; resubmit</b> button. Pick everything that applies.
        </p>
        <div className="a-stack" style={{ gap: 10 }}>
          {REJECT_REASONS.map(r => (
            <label key={r} className="a-row" style={{ cursor: 'pointer', fontWeight: 600 }}>
              <input type="checkbox" className="a-check" checked={picked.includes(r)} onChange={() => toggle(r)} />
              {r}
            </label>
          ))}
        </div>
        <Field label="Other reason (optional)" hint="Written to the applicant, so keep it short and polite.">
          <Textarea value={custom} onChange={e => setCustom(e.target.value)} placeholder="e.g. Please upload the back side of your Aadhaar too" />
        </Field>
      </div>
    </Modal>
  )
}

function Review({ d, reload }) {
  const { db, counts, refreshCounts } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [checks, setChecks] = useState({})
  const [rejecting, setRejecting] = useState(false)
  const [busy, setBusy] = useState(false)

  const app = d.application
  const { economy, hostLevels, rateTiers, settings } = db.config
  const minAge = settings.hostApply?.minAge || 18
  const prev = d.prevId ? { id: d.prevId } : null
  const next = d.nextId ? { id: d.nextId } : null
  const photos = app.photos || []
  const appRates = app.rates || { video: 0, voice: 0 }

  const code = (app.agencyCode || '').trim().toUpperCase()
  const agency = d.matchingAgency
  const agencyOk = agency && agency.status === 'active'

  const level1 = hostLevels.find(l => l.level === 1) || hostLevels[0]
  const cap = level1?.maxRate ?? Infinity
  const rates = {
    video: clampRate(rateTiers.video, appRates.video, cap),
    voice: clampRate(rateTiers.voice, appRates.voice, cap),
  }
  const clamped = rates.video !== appRates.video || rates.voice !== appRates.voice

  // Stored + automatic flags, computed by the server.
  const flags = d.flags || []

  const decided = app.status !== 'pending'
  const allChecked = CHECKLIST.every(([k]) => checks[k])
  const welcome = Math.round(economy.welcomeBonusCoins * economy.coinInr * 100) / 100

  // An approved application's host is the applicant's own user account.
  const host = decided && app.status === 'approved' ? { id: app.user } : null

  const act = async (fn, ok) => {
    setBusy(true)
    try {
      await fn()
      toast(ok)
      setRejecting(false)
      refreshCounts()
      reload()
    } catch (e) {
      toast(errorText(e), 'error')
    }
    setBusy(false)
  }

  const approve = () => act(() => api.post(`/admin/applications/${app.id}/approve`), `${app.name} approved as a host`)

  const reject = reasons => act(() => api.post(`/admin/applications/${app.id}/reject`, { reasons }), `${app.name} rejected`)

  const decisionButtons = (
    <>
      <Button variant="soft-danger" icon={X} disabled={busy} onClick={() => setRejecting(true)}>
        Reject
      </Button>
      <Button variant="success" icon={Check} disabled={!allChecked || busy} onClick={approve} title={allChecked ? undefined : 'Complete the checklist first'}>
        Approve
      </Button>
    </>
  )

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Host applications', to: '/admin/host-applications' }, { label: app.name }]}
        title={
          <span className="a-row" style={{ gap: 14 }}>
            <Avatar src={app.avatar} name={app.name} size={52} />
            <span>
              {app.name}
              <span className="a-row wrap" style={{ gap: 8, marginTop: 4, fontSize: 13, fontWeight: 600 }}>
                <span className="a-mono a-muted">{app.id}</span>
                <Status value={app.status} />
                <span className="a-muted" title={dateTime(app.submittedAt)}>
                  Submitted {ago(app.submittedAt)}
                </span>
              </span>
            </span>
          </span>
        }
        actions={
          <>
            {counts.pendingApplications ? (
              <span className="a-small a-muted a-nowrap">{counts.pendingApplications} pending</span>
            ) : null}
            <Button iconOnly icon={ChevronLeft} disabled={!prev} onClick={() => navigate(`/admin/host-applications/${prev.id}`)} aria-label="Previous pending" title="Previous pending" />
            <Button iconOnly icon={ChevronRight} disabled={!next} onClick={() => navigate(`/admin/host-applications/${next.id}`)} aria-label="Next pending" title="Next pending" />
            {decided ? null : decisionButtons}
          </>
        }
      />

      {decided ? (
        <div
          className="a-card"
          style={{
            padding: 16,
            marginBottom: 16,
            boxShadow: 'none',
            borderColor: 'transparent',
            background: app.status === 'approved' ? 'var(--success-soft)' : 'var(--danger-soft)',
          }}
        >
          <div className="a-row wrap" style={{ alignItems: 'flex-start' }}>
            {app.status === 'approved' ? <CheckCircle2 size={22} className="a-success" /> : <XCircle size={22} className="a-danger" />}
            <div style={{ flex: 1, minWidth: 220 }}>
              <b className={app.status === 'approved' ? 'a-success' : 'a-danger'}>{app.status === 'approved' ? 'Approved' : 'Rejected'}</b>
              <span className="a-muted">
                {' '}
                by {app.reviewedBy || 'Unknown'}
                {app.reviewedAt ? ` · ${dateTime(app.reviewedAt)} (${ago(app.reviewedAt)})` : ''}
              </span>
              {app.status === 'rejected' && app.reasons?.length ? (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  {app.reasons.map(r => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : null}
              {app.status === 'rejected' ? (
                <div className="a-small a-muted" style={{ marginTop: 6 }}>
                  The applicant can fix these and resubmit from the app.
                </div>
              ) : null}
            </div>
            <div className="a-row wrap">
              {host ? (
                <Link to={`/admin/hosts/${host.id}`} className="a-btn secondary">
                  View host <ArrowRight size={16} />
                </Link>
              ) : null}
              {next ? (
                <Button variant="primary" icon={ChevronRight} onClick={() => navigate(`/admin/host-applications/${next.id}`)}>
                  Next pending
                </Button>
              ) : (
                <Link to="/admin/host-applications" className="a-btn secondary">
                  Back to queue
                </Link>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="a-grid side">
        <div className="a-stack">
          <Card
            title="Face match"
            subtitle="Live selfie taken in the app vs. the main profile photo"
            actions={typeof app.faceMatch === 'number' ? <Badge tone={matchTone(app.faceMatch)}>{app.faceMatch}% match</Badge> : <Badge>Not scored</Badge>}
          >
            <div className="a-grid c2">
              <Photo src={app.selfie} label="Live selfie" />
              <Photo src={photos[0]} label="Main profile photo" />
            </div>
            {typeof app.faceMatch === 'number' ? (
            <div style={{ marginTop: 14 }}>
              <div className="a-row between a-small" style={{ marginBottom: 6 }}>
                <span className="a-muted">Similarity score</span>
                <b className={`a-${matchTone(app.faceMatch)}`}>{app.faceMatch} / 100</b>
              </div>
              <Progress value={app.faceMatch / 100} />
              <div className="a-small a-muted" style={{ marginTop: 6 }}>
                80+ is a confident match · 70–79 check carefully · below 70 usually a different person
              </div>
            </div>
            ) : null}
          </Card>
          <Card title="Profile photos" subtitle={`${photos.length} photos · shown on the host’s profile`}>
            <div className="a-grid c3">
              {photos.map((p, i) => (
                <Photo key={p} src={p} label={i === 0 ? 'Main' : `Photo ${i + 1}`} />
              ))}
            </div>
          </Card>
          <Card title="ID document" subtitle={`${app.idType} ending ••${app.idLast4}`}>
            <Photo src={app.idPhoto} ratio="8 / 5" />
          </Card>
        </div>

        <div className="a-stack">
          <Card title="Details">
            <dl className="a-dl" style={{ gridTemplateColumns: '120px 1fr' }}>
              <dt>Name</dt>
              <dd>{app.name}</dd>
              <dt>Phone</dt>
              <dd>{app.phone || '—'}</dd>
              <dt>Gender</dt>
              <dd>{app.gender}</dd>
              <dt>Date of birth</dt>
              <dd>
                {app.dob ? date(app.dob) : '—'} · <span className={app.age < minAge ? 'a-danger' : app.age < 19 ? 'a-warning' : ''}>{app.age ?? '—'} yrs</span>
              </dd>
              <dt>Languages</dt>
              <dd>{(app.languages || []).join(', ') || '—'}</dd>
              <dt>Bio</dt>
              <dd>{app.bio || <span className="a-faint">No bio</span>}</dd>
              <dt>ID</dt>
              <dd>
                {app.idType} <span className="a-mono">••{app.idLast4}</span>
              </dd>
              <dt>Agency code</dt>
              <dd>
                {code ? (
                  <span className="a-stack" style={{ gap: 4 }}>
                    <span className="a-mono">{code}</span>
                    {agencyOk ? (
                      <Badge tone="success">Matches {agency.name}</Badge>
                    ) : agency ? (
                      <Badge tone="warning">{agency.name} (suspended)</Badge>
                    ) : (
                      <Badge tone="danger">No matching agency</Badge>
                    )}
                  </span>
                ) : (
                  <span className="a-muted">None · independent</span>
                )}
              </dd>
              <dt>Requested rates</dt>
              <dd>
                Video {appRates.video} · Voice {appRates.voice} coins/min
                {clamped ? (
                  <span className="a-small a-warning" style={{ display: 'block' }}>
                    Level 1 cap is {cap}: will start at {rates.video} / {rates.voice}
                  </span>
                ) : null}
              </dd>
            </dl>
          </Card>

          <Card title="Flags" subtitle={flags.length ? `${flags.length} to look at` : undefined} padded={false}>
            {flags.length ? (
              flags.map(f => (
                <div key={f.text} className="a-list-row">
                  <AlertTriangle size={17} className={`a-${f.tone}`} />
                  <span className="a-strong" style={{ fontWeight: 600 }}>
                    {f.text}
                  </span>
                </div>
              ))
            ) : (
              <div className="a-list-row a-muted">
                <ShieldCheck size={17} className="a-success" />
                No automatic flags
              </div>
            )}
          </Card>

          {d.previousApplications?.length ? (
            <Card title="Earlier applications" padded={false}>
              {d.previousApplications.map(p => (
                <Link key={p.id} to={`/admin/host-applications/${p.id}`} className="a-list-row">
                  <Status value={p.status} />
                  <span style={{ flex: 1 }} className="a-small a-muted">
                    {p.reasons?.length ? p.reasons.join('; ') : ''}
                  </span>
                  <span className="a-small a-muted a-nowrap">{date(p.createdAt)}</span>
                </Link>
              ))}
            </Card>
          ) : null}

          {decided ? null : (
            <Card
              title="Reviewer checklist"
              subtitle="Confirm each item before approving"
              footer={<div className="a-row" style={{ justifyContent: 'flex-end' }}>{decisionButtons}</div>}
            >
              <div className="a-stack" style={{ gap: 12 }}>
                {CHECKLIST.map(([k, text]) => (
                  <label key={k} className="a-row" style={{ cursor: 'pointer', fontWeight: 600, alignItems: 'flex-start' }}>
                    <input
                      type="checkbox"
                      className="a-check"
                      style={{ marginTop: 2 }}
                      checked={!!checks[k]}
                      onChange={() => setChecks(c => ({ ...c, [k]: !c[k] }))}
                    />
                    {text}
                  </label>
                ))}
                <div className="a-small a-muted">
                  Approving creates a level 1 host{agencyOk ? ` in ${agency.name}` : ''} with a {inr(welcome)} welcome bonus ({num(economy.welcomeBonusCoins)} coins).
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      <RejectModal key={rejecting ? 'open' : 'closed'} open={rejecting} app={app} onClose={() => setRejecting(false)} onSave={reject} />
    </>
  )
}

export default function ApplicationReviewPage() {
  const { id } = useParams()
  const res = useApi(`/admin/applications/${id}`)

  if (res.error?.status === 404 || res.error?.status === 400) {
    return (
      <>
        <PageHeader crumbs={[{ label: 'Host applications', to: '/admin/host-applications' }, { label: 'Not found' }]} title="Application not found" />
        <Card>
          <Empty icon={FileX} title="Application not found" text={`No host application with ID ${id}.`} />
          <div className="a-row" style={{ justifyContent: 'center' }}>
            <Link to="/admin/host-applications" className="a-btn secondary">
              Back to queue
            </Link>
          </div>
        </Card>
      </>
    )
  }

  // Keyed so the checklist and reject form start fresh for each application.
  return <Pending res={res}>{d => <Review key={d.application.id} d={d} reload={res.reload} />}</Pending>
}
