// Demo data for the admin panel until the backend exists. Deterministic (seeded
// RNG) so numbers don't jump between reloads. Config values mirror the mobile
// app (mobile/src/data/economy.js, mock.js, social.js).
//
// ── Shapes ────────────────────────────────────────────────────────────────
// users:        { id, name, phone, email, gender, age, city, avatar, joined, lastActive,
//                 coins, spent (₹ lifetime), vip (0-4), status: active|suspended|banned,
//                 verified, device, calls, reports, notes }
// hosts:        { id, name, phone, avatar, photos[], gender, age, city, languages[], bio,
//                 level (1-4), rates {video, voice}, status: active|suspended|banned,
//                 online, rating, followers, agencyId|null, joined, callMinutes,
//                 lifetime (₹ net), available (₹), answerRate, idType, idLast4, verified }
// applications: { id, name, phone, avatar, photos[], selfie, idPhoto, gender, dob, age,
//                 languages[], bio, idType, idLast4, agencyCode|null, rates {video, voice},
//                 submittedAt, status: pending|approved|rejected, faceMatch (0-100),
//                 flags[], reviewedBy, reviewedAt, reasons[] }
// agencies:     { id, name, code, owner, phone, email, city, cut (%), status: active|suspended,
//                 created, monthEarnings (₹ agency share this month) }
// calls:        { id, userId, userName, userAvatar, hostId, hostName, hostAvatar,
//                 type: video|voice, ts, duration (s), rate (coins/min), coins, hostNet (₹),
//                 status: completed|missed|declined|failed|ongoing, rating (0-5), flagged }
// lives:        { id, hostId, hostName, hostAvatar, cover, title, mode: live|premium|party|audio,
//                 viewers, peak, diamonds, ticket, startedAt, endedAt|null,
//                 status: live|ended|removed, guests }
// moments:      { id, authorId, authorName, authorAvatar, isHost, image|null, text, likes,
//                 comments, ts, status: published|flagged|removed, reports }
// reports:      { id, reporter {id, name, avatar}, target {type: user|host|moment|live|room,
//                 id, name, avatar}, reason, details, ts, priority: low|medium|high,
//                 status: open|resolved|dismissed, action, handledBy }
// transactions: { id, userId, userName, userAvatar, packId, coins, bonus, amount (₹),
//                 method, gateway, gatewayRef, ts, status: success|failed|pending|refunded }
// withdrawals:  { id, hostId, hostName, hostAvatar, amount, fee, net, method {kind, label, holder},
//                 ts, status: requested|processing|paid|rejected, utr, note, handledBy }
// disputes:     { id, hostId, hostName, hostAvatar, earning {source, from, coins, net, ts},
//                 reason, ts, status: open|adjusted|rejected, resolution }
// tickets:      { id, from {type: user|host, id, name, avatar}, subject, category,
//                 priority, status: open|pending|closed, ts, updated, assignee,
//                 messages [{ by: 'user'|'admin', name, text, ts }] }
// banners:      { id, title, subtitle, image, cta, link, placement, color, startsAt, endsAt,
//                 status: live|scheduled|ended|draft, clicks, impressions }
// notifications:{ id, title, body, audience, deeplink, scheduledAt, sentAt, status: sent|scheduled|draft,
//                 delivered, opened }
// pages:        { id, slug, title, body, updated, updatedBy }
// admins:       { id, name, email, password, role, status: active|disabled, lastLogin, avatar }
// audit:        { id, ts, admin, action, target }
// metrics:      30 × { day (ts), label, revenue, coinsSold, dau, newUsers, calls, callMinutes,
//                 hostPayouts, newHosts }
// config:       economy, coinPacks, gifts, hostLevels, rateTiers, messageCost, vipTiers,
//               royalClub, settings (feature flags etc.)

function rng(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const HOUR = 3600000
const DAY = 24 * HOUR

export function makeSeed(now = Date.now()) {
  const r = rng(20261026)
  const int = (a, b) => a + Math.floor(r() * (b - a + 1))
  const pick = list => list[Math.floor(r() * list.length)]
  const chance = p => r() < p
  const id = (p, n) => `${p}${n}`

  const avatar = n => `https://i.pravatar.cc/200?img=${((n - 1) % 70) + 1}`
  // Demo profile photos: portrait faces (same pool as avatars, larger size).
  const photo = n => `https://i.pravatar.cc/600?img=${((n - 1) % 70) + 1}`

  const MALE = ['Rahul', 'Vikram', 'Karan', 'Aditya', 'Sahil', 'Dev', 'Arjun', 'Rohan', 'Aman', 'Kunal', 'Nikhil', 'Varun', 'Siddharth', 'Manish', 'Harsh', 'Yash', 'Akash', 'Pranav', 'Ritesh', 'Gaurav']
  const FEMALE = ['Aanya', 'Riya', 'Meera', 'Nisha', 'Zoya', 'Ishita', 'Kavya', 'Simran', 'Pooja', 'Ananya', 'Tanya', 'Sneha', 'Diya', 'Kritika', 'Neha', 'Priya', 'Sana', 'Aisha', 'Mahi', 'Tara']
  const LAST = ['Sharma', 'Verma', 'Gupta', 'Singh', 'Mehta', 'Kapoor', 'Iyer', 'Nair', 'Reddy', 'Das', 'Bose', 'Khan', 'Joshi', 'Patel', 'Rao', 'Malhotra']
  const CITIES = ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Pune', 'Chennai', 'Kolkata', 'Jaipur', 'Ahmedabad', 'Lucknow', 'Indore', 'Chandigarh', 'Kochi', 'Surat']
  const LANGS = ['Hindi', 'English', 'Tamil', 'Telugu', 'Bengali', 'Marathi', 'Kannada', 'Malayalam', 'Punjabi', 'Gujarati']
  const phone = () => `+91 ${int(70000, 99999)} ${int(10000, 99999)}`

  // ── Config (mirrors the mobile app) ─────────────────────────────────────
  const economy = {
    coinInr: 0.8,
    commission: { video: 40, voice: 40, chat: 50, gift: 50, ticket: 40, bonus: 0 },
    agencyCut: 10,
    withdrawFee: 2,
    minWithdraw: 500,
    maxWithdrawPerDay: 50000,
    payoutTime: '24–48 hours',
    welcomeBonusCoins: 1000,
    messageCost: 10,
    newUserCoins: 50,
  }
  const coinPacks = [
    { id: 'p1', coins: 100, bonus: 0, price: 99, tag: '', active: true, firstRecharge: false },
    { id: 'p2', coins: 500, bonus: 50, price: 449, tag: 'Popular', active: true, firstRecharge: false },
    { id: 'p3', coins: 1200, bonus: 200, price: 999, tag: '', active: true, firstRecharge: false },
    { id: 'p4', coins: 2500, bonus: 500, price: 1999, tag: 'Best value', active: true, firstRecharge: false },
    { id: 'p5', coins: 6000, bonus: 1500, price: 4499, tag: '', active: true, firstRecharge: false },
    { id: 'p6', coins: 15000, bonus: 5000, price: 9999, tag: '', active: true, firstRecharge: false },
    { id: 'p7', coins: 300, bonus: 300, price: 99, tag: 'First recharge', active: true, firstRecharge: true },
  ]
  const gifts = [
    ['rose', 'Rose', '🌹', 10], ['heart', 'Heart', '💖', 20], ['kiss', 'Kiss', '💋', 30],
    ['chocolate', 'Chocolate', '🍫', 49], ['teddy', 'Teddy', '🧸', 99], ['cake', 'Cake', '🎂', 149],
    ['ring', 'Ring', '💍', 299], ['crown', 'Crown', '👑', 499], ['car', 'Sports Car', '🏎️', 999],
    ['yacht', 'Yacht', '🛥️', 1999], ['castle', 'Castle', '🏰', 4999], ['rocket', 'Rocket', '🚀', 9999],
  ].map(([key, name, emoji, coins], i) => ({
    id: key,
    key,
    name,
    emoji,
    coins,
    fullScreen: coins >= 999,
    category: coins >= 999 ? 'Luxury' : coins >= 99 ? 'Popular' : 'Basic',
    active: true,
    order: i + 1,
    sent30d: int(40, 4000) * (coins < 100 ? 6 : 1),
  }))
  const hostLevels = [
    { level: 1, minutes: 0, maxRate: 60, commissionDiscount: 0 },
    { level: 2, minutes: 300, maxRate: 100, commissionDiscount: 0 },
    { level: 3, minutes: 1000, maxRate: 200, commissionDiscount: 2 },
    { level: 4, minutes: 3000, maxRate: 300, commissionDiscount: 5 },
  ]
  const rateTiers = {
    video: [30, 40, 60, 80, 100, 150, 200, 300],
    voice: [15, 20, 30, 40, 60, 80, 100, 150],
  }
  const vipTiers = [
    { level: 1, name: 'VIP 1', price: 199, days: 30, active: true, perks: ['VIP badge', '5% off calls', '20 bonus coins / day'] },
    { level: 2, name: 'VIP 2', price: 499, days: 30, active: true, perks: ['VIP badge', '10% off calls', '50 bonus coins / day', 'Exclusive chat bubble'] },
    { level: 3, name: 'VIP 3', price: 999, days: 30, active: true, perks: ['Everything in VIP 2', '15% off calls', 'Entry effect in rooms', 'Priority in Spark'] },
    { level: 4, name: 'VIP Elite', price: 2499, days: 30, active: true, perks: ['Everything in VIP 3', '20% off calls', '200 bonus coins / day', 'Hidden visitor mode', 'Dedicated support'] },
  ]
  const royalClub = [
    { key: 'silver', name: 'Silver Crown', emoji: '🥈', price: 4999, active: true, perks: ['Crown badge on profile', 'Room entry banner', '300 coins back'] },
    { key: 'gold', name: 'Gold Crown', emoji: '🥇', price: 9999, active: true, perks: ['Everything in Silver', 'Exclusive avatar frame', 'Mic priority in rooms', '800 coins back'] },
    { key: 'platinum', name: 'Platinum Crown', emoji: '🏰', price: 24999, active: true, perks: ['Everything in Gold', 'Animated entry effect', 'Anti-kick in rooms', '2,500 coins back'] },
    { key: 'diamond', name: 'Diamond Crown', emoji: '👑', price: 49999, active: true, perks: ['Everything in Platinum', 'Global entrance announcement', 'Custom room theme', '6,000 coins back'] },
  ]
  const settings = {
    maintenance: false,
    maintenanceMessage: 'REBU is getting an upgrade. We’ll be back shortly.',
    minVersion: { android: '1.2.0', ios: '1.2.0' },
    latestVersion: { android: '1.3.0', ios: '1.3.0' },
    forceUpdate: false,
    login: { phone: true, google: true, apple: true, facebook: false, email: true },
    otp: { provider: 'MSG91', length: 6, expirySecs: 300, resendSecs: 30, testNumber: '9999999999', testOtp: '123456' },
    features: {
      randomCall: true,
      goLive: true,
      premiumLive: true,
      rooms: true,
      moments: true,
      gifts: true,
      chat: true,
      screenshotBlock: true,
      hostApplications: true,
      agencies: true,
    },
    hostApply: { minAge: 18, autoApprove: false, requireSelfie: true, requireId: true, idTypes: ['Aadhaar', 'PAN', 'Passport', 'Driving licence'] },
    moderation: {
      autoFlagKeywords: ['whatsapp', 'paytm me', 'nude', 'number do', 'telegram'],
      blockContactSharing: true,
      maxReportsBeforeAutoSuspend: 10,
      liveRecordingForReview: true,
    },
    limits: { maxGuestsInLive: 2, maxRoomSeats: 8, ringTimeoutSecs: 30, freeMessagesPerDay: 0 },
    support: { email: 'support@rebu.app', whatsapp: '', hours: '10 AM – 10 PM IST' },
  }

  // ── Agencies ─────────────────────────────────────────────────────────────
  const agencies = [
    ['Star Talent', 'STAR1048', 'Mumbai'], ['Glow Studios', 'GLOW2201', 'Delhi'],
    ['Nova Hosts', 'NOVA3310', 'Bengaluru'], ['Moonlight Media', 'MOON4402', 'Hyderabad'],
    ['Aura Creators', 'AURA5108', 'Pune'], ['Velvet Voice', 'VELV6620', 'Kolkata'],
  ].map(([name, code, city], i) => ({
    id: id('AG', i + 1),
    name,
    code,
    owner: `${pick(MALE.concat(FEMALE))} ${pick(LAST)}`,
    phone: phone(),
    email: `${code.toLowerCase().slice(0, 4)}@agency.in`,
    city,
    cut: i === 2 ? 12 : 10,
    status: i === 5 ? 'suspended' : 'active',
    created: now - int(60, 400) * DAY,
    monthEarnings: 0,
  }))

  // ── Users ────────────────────────────────────────────────────────────────
  const users = Array.from({ length: 240 }, (_, i) => {
    const female = chance(0.18)
    const first = pick(female ? FEMALE : MALE)
    const joined = now - int(1, 420) * DAY - int(0, 23) * HOUR
    const spent = chance(0.45) ? int(99, 60000) : 0
    const status = chance(0.04) ? 'banned' : chance(0.05) ? 'suspended' : 'active'
    return {
      id: id('U', 10001 + i),
      name: `${first} ${pick(LAST)}`,
      phone: phone(),
      email: chance(0.4) ? `${first.toLowerCase()}${int(1, 999)}@gmail.com` : '',
      gender: female ? 'Female' : 'Male',
      age: int(18, 45),
      city: pick(CITIES),
      avatar: avatar(int(1, 70)),
      joined,
      lastActive: Math.min(now, joined + int(0, 400) * DAY) - int(0, 48) * HOUR,
      coins: int(0, 6000),
      spent,
      vip: spent > 20000 ? int(2, 4) : spent > 3000 ? int(0, 2) : 0,
      status,
      verified: chance(0.55),
      device: chance(0.82) ? 'Android' : 'iOS',
      calls: spent ? int(1, 180) : 0,
      reports: status === 'active' ? (chance(0.08) ? int(1, 3) : 0) : int(2, 12),
      notes: '',
    }
  })
  users[0] = { ...users[0], id: 'U10001', name: 'Arjun Mehta', phone: '+91 99999 99999', email: 'arjun@rebu.app', status: 'active', vip: 2, spent: 18450, coins: 1450, verified: true, joined: now - 52 * DAY, lastActive: now - 2 * HOUR }

  // ── Hosts ────────────────────────────────────────────────────────────────
  const hosts = Array.from({ length: 64 }, (_, i) => {
    const level = pick([1, 1, 1, 2, 2, 2, 3, 3, 4])
    const cap = hostLevels[level - 1].maxRate
    const video = pick(rateTiers.video.filter(v => v <= cap))
    const voice = pick(rateTiers.voice.filter(v => v <= cap))
    const minutes = hostLevels[level - 1].minutes + int(0, 1800)
    const lifetime = Math.round(minutes * video * 0.8 * 0.6 + int(0, 30000))
    const first = pick(chance(0.85) ? FEMALE : MALE)
    const n = int(1, 70)
    return {
      id: id('H', 2001 + i),
      name: `${first} ${pick(LAST)}`,
      phone: phone(),
      avatar: avatar(n),
      photos: [photo(n), photo(n + 23), photo(n + 41)],
      gender: FEMALE.includes(first) ? 'Female' : 'Male',
      age: int(19, 34),
      city: pick(CITIES),
      languages: Array.from(new Set([pick(LANGS), 'Hindi', chance(0.6) ? 'English' : pick(LANGS)])),
      bio: pick(['Love music & long talks ☕', 'Your evening chai partner 🌙', 'Let’s talk about anything!', 'Singer · traveller · foodie', 'Here to make your day better ✨']),
      level,
      rates: { video, voice },
      status: chance(0.06) ? 'suspended' : 'active',
      online: chance(0.32),
      rating: Math.round((4 + r()) * 10) / 10,
      followers: int(80, 25000),
      agencyId: chance(0.55) ? pick(agencies).id : null,
      joined: now - int(5, 380) * DAY,
      callMinutes: minutes,
      lifetime,
      available: Math.round(lifetime * (0.05 + r() * 0.2)),
      answerRate: int(62, 99),
      idType: pick(['Aadhaar', 'PAN', 'Passport', 'Driving licence']),
      idLast4: String(int(1000, 9999)),
      verified: true,
    }
  })
  for (const a of agencies) {
    a.monthEarnings = Math.round(
      hosts.filter(h => h.agencyId === a.id).reduce((n, h) => n + h.lifetime * 0.012, 0),
    )
  }

  // ── Host applications ────────────────────────────────────────────────────
  const applications = Array.from({ length: 18 }, (_, i) => {
    const first = pick(FEMALE.concat(MALE.slice(0, 4)))
    const n = int(1, 70)
    const age = int(18, 31)
    const status = i < 9 ? 'pending' : i < 15 ? 'approved' : 'rejected'
    const submittedAt = now - (i < 9 ? int(1, 40) * HOUR : int(2, 30) * DAY)
    const faceMatch = status === 'rejected' ? int(42, 70) : int(78, 99)
    const flags = []
    if (faceMatch < 75) flags.push('Low face match')
    if (chance(0.15)) flags.push('Same device as banned account')
    if (age < 19 && chance(0.5)) flags.push('Age close to limit — check ID')
    return {
      id: id('A', 301 + i),
      name: `${first} ${pick(LAST)}`,
      phone: phone(),
      avatar: avatar(n),
      photos: [photo(n), photo(n + 17), photo(n + 33)],
      selfie: avatar(n),
      idPhoto: `https://picsum.photos/seed/rebuid${i}/800/500`,
      gender: FEMALE.includes(first) ? 'Female' : 'Male',
      dob: `${int(1, 28)}/${int(1, 12)}/${new Date(now).getFullYear() - age}`,
      age,
      languages: Array.from(new Set(['Hindi', pick(LANGS)])),
      bio: pick(['Friendly and chatty 😊', 'Music lover', 'Let’s be friends!', '']),
      idType: pick(['Aadhaar', 'PAN', 'Passport', 'Driving licence']),
      idLast4: String(int(1000, 9999)),
      agencyCode: chance(0.4) ? pick(agencies).code : null,
      rates: { video: pick([30, 40, 60]), voice: pick([15, 20, 30]) },
      submittedAt,
      status,
      faceMatch,
      flags,
      reviewedBy: status === 'pending' ? null : 'Priya (Moderator)',
      reviewedAt: status === 'pending' ? null : submittedAt + int(2, 20) * HOUR,
      reasons:
        status === 'rejected'
          ? [pick(['Selfie doesn’t match profile photos', 'ID photo is blurry', 'Name on ID doesn’t match', 'Profile photos contain other people'])]
          : [],
    }
  })

  // ── Calls ────────────────────────────────────────────────────────────────
  const calls = Array.from({ length: 420 }, (_, i) => {
    const u = pick(users)
    const h = pick(hosts)
    const type = chance(0.72) ? 'video' : 'voice'
    const status = i < 4 ? 'ongoing' : pick(['completed', 'completed', 'completed', 'completed', 'missed', 'declined', 'failed'])
    const duration = status === 'completed' ? int(30, 2400) : status === 'ongoing' ? int(30, 900) : 0
    const rate = h.rates[type]
    const coins = Math.ceil(duration / 60) * rate
    return {
      id: id('C', 900001 + i),
      userId: u.id,
      userName: u.name,
      userAvatar: u.avatar,
      hostId: h.id,
      hostName: h.name,
      hostAvatar: h.avatar,
      type,
      ts: status === 'ongoing' ? now - duration * 1000 : now - int(0, 29 * 24) * HOUR - int(0, 59) * 60000,
      duration,
      rate,
      coins,
      hostNet: Math.round(coins * economy.coinInr * (1 - economy.commission[type] / 100) * 100) / 100,
      status,
      rating: status === 'completed' && chance(0.6) ? int(3, 5) : 0,
      flagged: chance(0.03),
    }
  }).sort((a, b) => b.ts - a.ts)

  // ── Lives & rooms ────────────────────────────────────────────────────────
  const TITLES = ['Late night chat 🌙', 'Singing your requests 🎤', 'Chai pe charcha ☕', 'Bollywood quiz night', 'Ask me anything ✨', 'Sunday vibes', 'Dance practice 💃', 'Music & masti']
  const lives = Array.from({ length: 40 }, (_, i) => {
    const h = pick(hosts)
    const mode = pick(['live', 'live', 'live', 'premium', 'party', 'audio'])
    const live = i < 12
    const startedAt = live ? now - int(3, 120) * 60000 : now - int(1, 20) * DAY
    const viewers = live ? int(4, 380) : 0
    return {
      id: id('L', 7001 + i),
      hostId: h.id,
      hostName: h.name,
      hostAvatar: h.avatar,
      cover: h.photos[0],
      title: pick(TITLES),
      mode,
      viewers,
      peak: viewers + int(0, 200),
      diamonds: int(0, 40000),
      ticket: mode === 'premium' ? pick([50, 100, 200]) : 0,
      startedAt,
      endedAt: live ? null : startedAt + int(10, 180) * 60000,
      status: live ? 'live' : 'ended',
      guests: mode === 'party' ? int(1, 7) : mode === 'live' ? int(0, 2) : 0,
    }
  })

  // ── Moments ──────────────────────────────────────────────────────────────
  const MOMENT_TEXT = ['Good morning everyone ☀️', 'New look, who likes it? 💕', 'Weekend plans? 😄', 'Coffee first ☕', 'Feeling grateful 🙏', 'Rainy day mood 🌧️', 'Message me on WhatsApp 98xxxx', 'Join my live tonight at 9!']
  const moments = Array.from({ length: 48 }, (_, i) => {
    const isHost = chance(0.7)
    const a = isHost ? pick(hosts) : pick(users)
    const text = pick(MOMENT_TEXT)
    const flagged = /whatsapp/i.test(text) || chance(0.08)
    return {
      id: id('M', 5001 + i),
      authorId: a.id,
      authorName: a.name,
      authorAvatar: a.avatar,
      isHost,
      image: chance(0.75) ? `https://picsum.photos/seed/moment${i}/600/600` : null,
      text,
      likes: int(0, 2400),
      comments: int(0, 180),
      ts: now - int(1, 14 * 24) * HOUR,
      status: flagged ? 'flagged' : chance(0.04) ? 'removed' : 'published',
      reports: flagged ? int(1, 9) : 0,
    }
  }).sort((a, b) => b.ts - a.ts)

  // ── Reports ──────────────────────────────────────────────────────────────
  const REASONS = ['Nudity or sexual content', 'Asking for contact details / payments outside app', 'Harassment or abuse', 'Fake profile', 'Underage', 'Spam', 'Rude behaviour on call', 'Hate speech']
  const reports = Array.from({ length: 36 }, (_, i) => {
    const reporter = pick(users)
    const kind = pick(['host', 'host', 'user', 'moment', 'live', 'room'])
    const t =
      kind === 'host' ? pick(hosts)
      : kind === 'user' ? pick(users)
      : kind === 'moment' ? (m => ({ id: m.id, name: `Moment by ${m.authorName}`, avatar: m.authorAvatar }))(pick(moments))
      : (l => ({ id: l.id, name: `${l.hostName} · ${l.title}`, avatar: l.hostAvatar }))(pick(lives))
    const reason = pick(REASONS)
    const status = i < 14 ? 'open' : pick(['resolved', 'resolved', 'dismissed'])
    return {
      id: id('R', 4001 + i),
      reporter: { id: reporter.id, name: reporter.name, avatar: reporter.avatar },
      target: { type: kind, id: t.id, name: t.name, avatar: t.avatar },
      reason,
      details: pick(['', 'Happened during a video call around 10 PM.', 'Shared screenshots in the chat.', 'Kept asking to move to WhatsApp.', 'Profile photos look stolen from Instagram.']),
      ts: now - int(1, 20 * 24) * HOUR,
      priority: /Underage|Nudity|Hate/.test(reason) ? 'high' : /contact|Harassment/.test(reason) ? 'medium' : 'low',
      status,
      action: status === 'resolved' ? pick(['Warned', 'Suspended 7 days', 'Content removed', 'Banned']) : status === 'dismissed' ? 'No violation' : null,
      handledBy: status === 'open' ? null : pick(['Priya (Moderator)', 'Rohit (Support)']),
    }
  }).sort((a, b) => b.ts - a.ts)

  // ── Transactions (coin purchases) ────────────────────────────────────────
  const METHODS = ['UPI', 'UPI', 'UPI', 'Card', 'Net banking', 'Wallet']
  const transactions = Array.from({ length: 360 }, (_, i) => {
    const u = pick(users)
    const p = pick(coinPacks.filter(x => !x.firstRecharge).concat(coinPacks[6]))
    const status = chance(0.86) ? 'success' : chance(0.6) ? 'failed' : chance(0.6) ? 'pending' : 'refunded'
    return {
      id: id('T', 600001 + i),
      userId: u.id,
      userName: u.name,
      userAvatar: u.avatar,
      packId: p.id,
      coins: p.coins,
      bonus: p.bonus,
      amount: p.price,
      method: pick(METHODS),
      gateway: 'Razorpay',
      gatewayRef: `pay_${Math.floor(r() * 1e14).toString(36)}`,
      ts: now - int(0, 29 * 24) * HOUR - int(0, 59) * 60000,
      status,
    }
  }).sort((a, b) => b.ts - a.ts)

  // ── Withdrawals ──────────────────────────────────────────────────────────
  const withdrawals = Array.from({ length: 42 }, (_, i) => {
    const h = pick(hosts)
    const amount = pick([500, 1000, 2000, 2500, 5000, 7500, 10000, 15000, 25000])
    const fee = Math.round((amount * economy.withdrawFee) / 100)
    const status = i < 10 ? 'requested' : i < 15 ? 'processing' : chance(0.88) ? 'paid' : 'rejected'
    const upi = chance(0.55)
    return {
      id: id('W', 8001 + i),
      hostId: h.id,
      hostName: h.name,
      hostAvatar: h.avatar,
      amount,
      fee,
      net: amount - fee,
      method: upi
        ? { kind: 'upi', label: `UPI · ${h.name.split(' ')[0].toLowerCase()}@okaxis`, holder: h.name }
        : { kind: 'bank', label: `${pick(['HDFC', 'SBI', 'ICICI', 'Axis', 'Kotak'])} ••${int(1000, 9999)}`, holder: h.name },
      ts: now - (i < 15 ? int(1, 60) * HOUR : int(3, 60) * DAY),
      status,
      utr: status === 'paid' ? `UTR${int(100000000, 999999999)}` : '',
      paidAt: null,
      note: status === 'rejected' ? 'Bank account name doesn’t match verified ID' : '',
      handledBy: i < 10 ? null : 'Neha (Finance)',
    }
  }).map(w => (w.status === 'paid' ? { ...w, paidAt: w.ts + int(6, 40) * HOUR } : w)).sort((a, b) => b.ts - a.ts)

  // ── Earning disputes (hosts' "Report a problem") ─────────────────────────
  const disputes = Array.from({ length: 12 }, (_, i) => {
    const h = pick(hosts)
    const source = pick(['video', 'voice', 'gift', 'chat'])
    const coins = source === 'gift' ? pick([99, 299, 999]) : source === 'chat' ? 10 : int(2, 30) * h.rates[source === 'voice' ? 'voice' : 'video']
    return {
      id: id('D', 9101 + i),
      hostId: h.id,
      hostName: h.name,
      hostAvatar: h.avatar,
      earning: {
        source,
        from: pick(users).name,
        coins,
        net: Math.round(coins * economy.coinInr * (1 - economy.commission[source] / 100) * 100) / 100,
        ts: now - int(1, 10) * DAY,
      },
      reason: pick(['Call time is wrong', 'Amount looks wrong', 'Gift is missing', 'Something else']),
      ts: now - int(2, 200) * HOUR,
      status: i < 6 ? 'open' : pick(['adjusted', 'rejected']),
      resolution: i < 6 ? '' : 'Checked call logs; duration was correct.',
    }
  }).sort((a, b) => b.ts - a.ts)

  // ── Support tickets ──────────────────────────────────────────────────────
  const SUBJECTS = [
    ['Payments', 'Coins not added after payment'], ['Payments', 'Charged twice for 500 coins'],
    ['Calls', 'Call disconnected but coins deducted'], ['Account', 'Can’t log in — OTP not coming'],
    ['Withdrawals', 'Withdrawal pending for 3 days'], ['Account', 'Want to change my phone number'],
    ['Safety', 'Someone is harassing me'], ['Hosts', 'How do I increase my call price?'],
    ['Calls', 'Video freezing during calls'], ['Payments', 'Refund request'],
  ]
  const tickets = Array.from({ length: 26 }, (_, i) => {
    const host = chance(0.35)
    const p = host ? pick(hosts) : pick(users)
    const [category, subject] = pick(SUBJECTS)
    const ts = now - int(1, 15 * 24) * HOUR
    const status = i < 9 ? 'open' : i < 14 ? 'pending' : 'closed'
    const messages = [{ by: 'user', name: p.name, text: `${subject}. Please help.`, ts }]
    if (status !== 'open') messages.push({ by: 'admin', name: 'Rohit (Support)', text: 'Thanks for reaching out — we’re checking this with our payments team.', ts: ts + 3 * HOUR })
    return {
      id: id('S', 3001 + i),
      from: { type: host ? 'host' : 'user', id: p.id, name: p.name, avatar: p.avatar },
      subject,
      category,
      priority: /twice|harass|deducted/i.test(subject) ? 'high' : pick(['low', 'medium']),
      status,
      ts,
      updated: messages[messages.length - 1].ts,
      assignee: status === 'open' ? null : 'Rohit (Support)',
      messages,
    }
  }).sort((a, b) => b.updated - a.updated)

  // ── Banners / events ─────────────────────────────────────────────────────
  const banners = [
    { title: 'Diwali Gift Festival', subtitle: 'Send festival gifts, win up to 50,000 coins', color: '#D81B60', status: 'live', placement: 'Events' },
    { title: 'Weekend Recharge Bonus', subtitle: '20% extra coins on every recharge', color: '#F5B301', status: 'live', placement: 'Coins tab' },
    { title: 'Room Star of the Week', subtitle: 'Top room host wins a Royal Frame', color: '#1C1C1E', status: 'live', placement: 'Events' },
    { title: 'Invite friends, earn coins', subtitle: '100 coins for each friend who recharges', color: '#1E9E5A', status: 'live', placement: 'Home' },
    { title: 'New Year Mega Live', subtitle: 'Top 10 hosts win ₹1,00,000', color: '#5B2A86', status: 'scheduled', placement: 'Home' },
    { title: 'Holi Colours Gift Pack', subtitle: 'Limited-time gifts', color: '#E89A00', status: 'ended', placement: 'Events' },
  ].map((b, i) => ({
    id: id('B', 101 + i),
    ...b,
    image: `https://picsum.photos/seed/banner${i}/1200/500`,
    cta: 'Join now',
    link: 'rebu://events',
    startsAt: now + (b.status === 'scheduled' ? 20 : -int(2, 20)) * DAY,
    endsAt: now + (b.status === 'ended' ? -2 : int(3, 40)) * DAY,
    clicks: b.status === 'scheduled' ? 0 : int(800, 30000),
    impressions: b.status === 'scheduled' ? 0 : int(30000, 600000),
  }))

  // ── Push notifications ───────────────────────────────────────────────────
  const notifications = [
    ['Your favourite host is live 🔴', 'Aanya just went live — join now!', 'Followers of live hosts', 'sent'],
    ['Weekend bonus is here 🎉', 'Get 20% extra coins on every recharge till Sunday.', 'All users', 'sent'],
    ['We miss you 💕', 'Come back and get 50 free coins today.', 'Inactive 14+ days', 'sent'],
    ['New gifts just dropped 🚀', 'Send the Rocket and watch it fly!', 'Paying users', 'scheduled'],
    ['Host tip of the week', 'Hosts who go live daily earn 3× more.', 'All hosts', 'draft'],
  ].map(([title, body, audience, status], i) => ({
    id: id('N', 201 + i),
    title,
    body,
    audience,
    deeplink: 'rebu://home',
    scheduledAt: status === 'scheduled' ? now + 2 * DAY : null,
    sentAt: status === 'sent' ? now - int(1, 20) * DAY : null,
    status,
    delivered: status === 'sent' ? int(20000, 180000) : 0,
    opened: status === 'sent' ? int(1500, 22000) : 0,
  }))

  // ── Static pages ─────────────────────────────────────────────────────────
  const pages = [
    ['terms', 'Terms of Service', 'By using REBU you agree to these terms.\n\n1. You must be 18 or older.\n2. Coins are non-refundable except where required by law.\n3. Don’t share contact details or ask for payments outside the app.\n4. We may suspend accounts that break these rules.'],
    ['privacy', 'Privacy Policy', 'We collect only what we need to run REBU: your phone number, profile and usage data.\n\nCalls are not recorded except live streams kept for 7 days for safety review.'],
    ['host-rules', 'Host Rules', '• No nudity or sexual content.\n• Never share phone numbers, social handles or payment details.\n• Be respectful — no abuse or hate speech.\n• Keep your camera on during video calls.\n• Breaking rules can lead to suspension and loss of pending earnings.'],
    ['help', 'Help & FAQ', 'How do I buy coins?\nGo to the Coins tab and pick a pack.\n\nHow are calls charged?\nPer connected minute at the host’s price.'],
    ['refunds', 'Refund Policy', 'Failed payments are refunded automatically within 5–7 working days.'],
  ].map(([slug, title, body], i) => ({
    id: id('P', 11 + i),
    slug,
    title,
    body,
    updated: now - int(3, 90) * DAY,
    updatedBy: 'Om (Super admin)',
  }))

  // ── Admin team ───────────────────────────────────────────────────────────
  const admins = [
    { name: 'Om Parteki', email: 'admin@rebu.app', password: 'admin123', role: 'super_admin' },
    { name: 'Priya Nair', email: 'priya@rebu.app', password: 'mod123', role: 'moderator' },
    { name: 'Neha Gupta', email: 'neha@rebu.app', password: 'finance123', role: 'finance' },
    { name: 'Rohit Das', email: 'rohit@rebu.app', password: 'support123', role: 'support' },
  ].map((a, i) => ({
    id: id('AD', i + 1),
    ...a,
    status: 'active',
    lastLogin: now - int(1, 72) * HOUR,
    avatar: avatar([12, 47, 45, 15][i]),
  }))

  const audit = [
    ['Priya Nair', 'Approved host application', 'A312'],
    ['Neha Gupta', 'Marked withdrawal as paid', 'W8016'],
    ['Om Parteki', 'Changed video call commission 35% → 40%', 'Economy'],
    ['Priya Nair', 'Suspended user for 7 days', 'U10044'],
    ['Rohit Das', 'Closed support ticket', 'S3020'],
    ['Om Parteki', 'Published banner', 'B101'],
  ].map(([admin, action, target], i) => ({
    id: id('LG', 1001 + i),
    ts: now - (i + 1) * int(2, 9) * HOUR,
    admin,
    action,
    target,
  }))

  // ── Daily metrics (last 30 days) ─────────────────────────────────────────
  const metrics = Array.from({ length: 30 }, (_, i) => {
    const day = new Date(now - (29 - i) * DAY)
    day.setHours(0, 0, 0, 0)
    const weekend = day.getDay() === 0 || day.getDay() === 6
    const growth = 1 + i * 0.012
    const dau = Math.round((5200 + int(-400, 400) + (weekend ? 900 : 0)) * growth)
    const revenue = Math.round((182000 + int(-25000, 30000) + (weekend ? 40000 : 0)) * growth)
    return {
      day: day.getTime(),
      label: `${day.getDate()}/${day.getMonth() + 1}`,
      revenue,
      coinsSold: Math.round(revenue * 1.12),
      dau,
      newUsers: Math.round(dau * (0.06 + r() * 0.03)),
      calls: Math.round(dau * (0.42 + r() * 0.08)),
      callMinutes: Math.round(dau * (3.1 + r() * 0.8)),
      hostPayouts: Math.round(revenue * (0.38 + r() * 0.06)),
      newHosts: int(3, 18),
    }
  })

  return {
    users,
    hosts,
    applications,
    agencies,
    calls,
    lives,
    moments,
    reports,
    transactions,
    withdrawals,
    disputes,
    tickets,
    banners,
    notifications,
    pages,
    admins,
    audit,
    metrics,
    config: {
      economy,
      coinPacks,
      gifts,
      hostLevels,
      rateTiers,
      vipTiers,
      royalClub,
      settings,
    },
  }
}
