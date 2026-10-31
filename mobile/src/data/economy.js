// How money flows to hosts. Every value here will come from the admin panel;
// these are the defaults the app uses until the backend exists.
//
// User spends coins on a host  →  gross ₹ = coins × coinInr
//   − REBU commission (by source)  − agency cut (if the host joined an agency)
//   = host's net ₹, added to their withdrawable balance.
export const ECONOMY = {
  coinInr: 0.8, // ₹ value of one coin when settling with hosts
  commission: {
    video: 40,
    voice: 40,
    chat: 50,
    gift: 50,
    ticket: 40,
    bonus: 0,
  },
  agencyCut: 10, // % of the host's share paid to their agency
  withdrawFee: 2, // % fee on each withdrawal
  minWithdraw: 500,
  payoutTime: '24–48 hours',
  welcomeBonusCoins: 1000, // credited when a host is approved
};

/**
 * The admin panel owns these numbers. The app starts with the defaults above
 * and replaces them with the server's (GET /config) as soon as it has them, so
 * every ₹ figure on screen (earnings per minute, coin value, withdrawal limits)
 * follows what admins set. Mutates ECONOMY because helpers read it directly.
 */
export function applyEconomy(e) {
  if (!e) return;
  for (const k of [
    'coinInr',
    'agencyCut',
    'withdrawFee',
    'minWithdraw',
    'payoutTime',
    'welcomeBonusCoins',
  ]) {
    if (e[k] !== undefined && e[k] !== null) ECONOMY[k] = e[k];
  }
  if (e.commission) ECONOMY.commission = { ...ECONOMY.commission, ...e.commission };
}

export const SOURCES = {
  video: { label: 'Video calls', unit: 'min' },
  voice: { label: 'Voice calls', unit: 'min' },
  chat: { label: 'Chat messages', unit: 'msg' },
  gift: { label: 'Gifts', unit: '' },
  ticket: { label: 'Premium tickets', unit: '' },
  bonus: { label: 'Bonuses', unit: '' },
};

const round2 = n => Math.round(n * 100) / 100;

/** Gross → commission → agency → net (₹) for one earning record. */
export function split(rec) {
  // Server ledger rows already carry the settled amounts.
  if (typeof rec.net === 'number') {
    const { gross, commission, agencyAmount: agency, net } = rec;
    return { gross, commission, agency, net };
  }
  const gross = round2(rec.coins * ECONOMY.coinInr);
  const commission = round2(
    (gross * (ECONOMY.commission[rec.source] || 0)) / 100,
  );
  const share = gross - commission;
  const agency = rec.agency ? round2((share * ECONOMY.agencyCut) / 100) : 0;
  return { gross, commission, agency, net: round2(share - agency) };
}

/** What a host takes home per minute at a given coin price. */
export const netPerMinute = (coins, source, agency) =>
  split({ coins, source, agency }).net;

/** Balances derived from the ledger. */
export function hostBalance(earnings, withdrawals) {
  let lifetime = 0;
  let onHold = 0;
  for (const e of earnings) {
    const { net } = split(e);
    lifetime += net;
    if (e.status === 'review') onHold += net;
  }
  const withdrawn = withdrawals
    .filter(w => w.status !== 'rejected')
    .reduce((n, w) => n + w.amount, 0);
  return {
    lifetime: round2(lifetime),
    onHold: round2(onHold),
    withdrawn: round2(withdrawn),
    available: Math.max(0, round2(lifetime - onHold - withdrawn)),
  };
}

const DAY = 86400000;
export const daysAgo = ts => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return ts >= start.getTime() ? 0 : Math.ceil((start.getTime() - ts) / DAY);
};

/** ₹ with up to 2 decimals, Indian grouping for whole rupees. */
export function inr(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const whole = Math.trunc(v);
  const s = String(Math.abs(whole));
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const grouped = rest ? `${rest},${last3}` : last3;
  const dec = Math.abs(v - whole);
  return `${v < 0 ? '−' : ''}₹${grouped}${
    dec ? `.${String(Math.round(dec * 100)).padStart(2, '0')}` : ''
  }`;
}

// Hermes' Intl support varies by device, so month names are spelled out here.
const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

export const timeLabel = ts => {
  const d = new Date(ts);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const t = `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
  const ago = daysAgo(ts);
  if (ago === 0) return `Today, ${t}`;
  if (ago === 1) return `Yesterday, ${t}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${t}`;
};
