// Host level categories and sender frames, shared by the monetization, host and user pages.

/** Category a level belongs to: the last one whose fromLevel is at or below it. */
export function categoryOf(categories, level) {
  const sorted = [...(categories || [])].sort((a, b) => a.fromLevel - b.fromLevel)
  return sorted.reduce((found, c) => (level >= c.fromLevel ? c : found), sorted[0] || null)
}

/** Highest sender-frame tier reached with `coins` bought (null if none, or the tier has no colour). */
export function frameOf(tiers, coins) {
  const sorted = [...(tiers || [])].sort((a, b) => a.minCoins - b.minCoins)
  return sorted.reduce((found, t) => ((coins || 0) >= t.minCoins ? t : found), null)
}

export const isHex = s => /^#[0-9a-fA-F]{6}$/.test(s)

export const slugKey = s =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24)
