import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Check, CheckCircle2, ChevronLeft, ChevronRight, FileX, ShieldCheck, X, XCircle } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { Avatar, Badge, Button, Card, Empty, Field, Modal, PageHeader, Progress, Status, Textarea } from '../../components/ui'
import { ago, dateTime, inr, num } from '../../utils/format'

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

function Review({ app }) {
  const { db, me, update, create } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [checks, setChecks] = useState({})
  const [rejecting, setRejecting] = useState(false)

  const { economy, hostLevels, rateTiers, settings } = db.config
  const minAge = settings.hostApply?.minAge || 18
  const pending = useMemo(
    () => db.applications.filter(a => a.status === 'pending').sort((a, b) => a.submittedAt - b.submittedAt),
    [db.applications],
  )
  const idx = pending.findIndex(a => a.id === app.id)
  const prev = idx > 0 ? pending[idx - 1] : null
  const next = idx >= 0 ? pending[idx + 1] || null : pending[0] || null

  const code = (app.agencyCode || '').trim().toUpperCase()
  const agency = code ? db.agencies.find(a => a.code.toUpperCase() === code) : null
  const agencyOk = agency && agency.status === 'active'

  const level1 = hostLevels.find(l => l.level === 1) || hostLevels[0]
  const cap = level1?.maxRate ?? Infinity
  const rates = {
    video: clampRate(rateTiers.video, app.rates.video, cap),
    voice: clampRate(rateTiers.voice, app.rates.voice, cap),
  }
  const clamped = rates.video !== app.rates.video || rates.voice !== app.rates.voice

  // Checks the reviewer would otherwise do by eye.
  const keywords = settings.moderation?.autoFlagKeywords || []
  const bio = String(app.bio || '')
  const bioContact = /\d{7,}|\d{3,}[\s-]\d{3,}|@|https?:|\.com/i.test(bio) || keywords.some(k => bio.toLowerCase().includes(k))
  const autoFlags = [
    ...(app.age < minAge ? [{ text: `Under ${minAge} (age ${app.age})`, tone: 'danger' }] : []),
    ...(app.faceMatch < 70 ? [{ text: `Face match only ${app.faceMatch}%`, tone: 'danger' }] : []),
    ...(code && !agency ? [{ text: `Agency code ${code} doesn’t match any agency`, tone: 'warning' }] : []),
    ...(agency && !agencyOk ? [{ text: `Agency ${agency.name} is suspended`, tone: 'warning' }] : []),
    ...(bioContact ? [{ text: 'Bio may contain contact details', tone: 'warning' }] : []),
  ]
  const flags = [...app.flags.map(f => ({ text: f, tone: 'warning' })), ...autoFlags.filter(f => !app.flags.includes(f.text))]

  const decided = app.status !== 'pending'
  const allChecked = CHECKLIST.every(([k]) => checks[k])
  const welcome = Math.round(economy.welcomeBonusCoins * economy.coinInr * 100) / 100

  // Seed approvals predate hostId, so fall back to matching on phone.
  const host = decided && app.status === 'approved'
    ? db.hosts.find(h => h.id === app.hostId) || db.hosts.find(h => h.phone === app.phone)
    : null

  const approve = () => {
    const nums = db.hosts.map(h => Number(String(h.id).replace(/^H/, ''))).filter(Number.isFinite)
    const hostId = `H${Math.max(2000, ...nums) + 1}`
    const ts = Date.now()
    create('hosts', {
      id: hostId,
      name: app.name,
      phone: app.phone,
      avatar: app.avatar,
      photos: app.photos,
      gender: app.gender,
      age: app.age,
      city: app.city || '',
      languages: app.languages,
      bio: app.bio,
      level: 1,
      rates,
      status: 'active',
      online: false,
      rating: 5,
      followers: 0,
      agencyId: agencyOk ? agency.id : null,
      joined: ts,
      callMinutes: 0,
      lifetime: 0,
      available: welcome,
      answerRate: 100,
      idType: app.idType,
      idLast4: app.idLast4,
      verified: true,
      applicationId: app.id,
    })
    // Target names both IDs so the entry shows on the host's admin history too.
    update('applications', app.id, { status: 'approved', reviewedBy: me?.name || 'Admin', reviewedAt: ts, reasons: [], hostId }, [
      'Approved host application',
      `${app.id} → ${hostId}`,
    ])
    toast(`${app.name} approved as host ${hostId}`)
  }

  const reject = reasons => {
    update('applications', app.id, { status: 'rejected', reviewedBy: me?.name || 'Admin', reviewedAt: Date.now(), reasons }, [
      `Rejected host application — ${reasons.join('; ')}`,
      app.id,
    ])
    setRejecting(false)
    toast(`${app.name} rejected`)
  }

  const decisionButtons = (
    <>
      <Button variant="soft-danger" icon={X} onClick={() => setRejecting(true)}>
        Reject
      </Button>
      <Button variant="success" icon={Check} disabled={!allChecked} onClick={approve} title={allChecked ? undefined : 'Complete the checklist first'}>
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
            {idx >= 0 ? (
              <span className="a-small a-muted a-nowrap">
                {idx + 1} of {pending.length} pending
              </span>
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
                  View host {host.id} <ArrowRight size={16} />
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
            actions={<Badge tone={matchTone(app.faceMatch)}>{app.faceMatch}% match</Badge>}
          >
            <div className="a-grid c2">
              <Photo src={app.selfie} label="Live selfie" />
              <Photo src={app.photos[0]} label="Main profile photo" />
            </div>
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
          </Card>
          <Card title="Profile photos" subtitle={`${app.photos.length} photos · shown on the host’s profile`}>
            <div className="a-grid c3">
              {app.photos.map((p, i) => (
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
              <dd>{app.phone}</dd>
              <dt>Gender</dt>
              <dd>{app.gender}</dd>
              <dt>Date of birth</dt>
              <dd>
                {app.dob} · <span className={app.age < minAge ? 'a-danger' : app.age < 19 ? 'a-warning' : ''}>{app.age} yrs</span>
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
                Video {app.rates.video} · Voice {app.rates.voice} coins/min
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
  const { db } = useStore()
  const app = db.applications.find(a => a.id === id)

  if (!app) {
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
  return <Review key={app.id} app={app} />
}
