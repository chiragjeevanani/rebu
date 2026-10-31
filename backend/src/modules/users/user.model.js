import mongoose from 'mongoose'
import { getConfig } from '../config/config.service.js'

/** Category of a host level, e.g. { key: 'iron', name: 'Iron', color }. */
export function hostCategoryOf(level) {
  const { hostLevels, hostCategories } = getConfig()
  const key = hostLevels.find(l => l.level === level)?.category || hostCategories[0]?.key
  const c = hostCategories.find(x => x.key === key) || hostCategories[0]
  return c ? { key: c.key, name: c.name, color: c.color } : null
}

/** Sender frame tier for lifetime coins bought (null below the first paid tier). */
export function senderTierOf(coinsBought = 0) {
  const t = [...getConfig().senderTiers].reverse().find(x => coinsBought >= x.minCoins)
  return t && t.minCoins > 0 ? { key: t.key, name: t.name, color: t.color } : null
}

const { Schema } = mongoose

// One account per phone number. Hosts are users with an approved `host` block.
const hostSchema = new Schema(
  {
    approved: { type: Boolean, default: false },
    approvedAt: Date,
    status: { type: String, enum: ['active', 'suspended', 'banned'], default: 'active' },
    level: { type: Number, default: 1 },
    levelOverride: { type: Number, default: null },
    rates: { video: { type: Number, default: 40 }, voice: { type: Number, default: 20 } },
    online: { type: Boolean, default: false },
    busy: { type: Boolean, default: false }, // true when all call slots are taken
    calls: { type: Number, default: 0 }, // ringing + connected calls right now
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', default: null },
    callMinutes: { type: Number, default: 0 },
    giftCoins: { type: Number, default: 0 }, // lifetime gift coins received → level
    rating: { type: Number, default: 5 },
    ratingCount: { type: Number, default: 0 },
    displayName: String,
    photos: [String],
    languages: [String],
    bio: String,
  },
  { _id: false },
)

const userSchema = new Schema(
  {
    phone: { type: String, required: true, unique: true, index: true },
    fixedOtp: { type: Boolean, default: false },
    email: { type: String, lowercase: true, trim: true },
    name: { type: String, trim: true, default: '' },
    gender: { type: String, enum: ['Female', 'Male', 'Other', null], default: null },
    dob: Date,
    city: String,
    bio: String,
    job: String,
    interests: [String],
    photos: [String],
    profileDone: { type: Boolean, default: false },
    coins: { type: Number, default: 0, min: 0 },
    spent: { type: Number, default: 0 }, // ₹ lifetime purchases
    coinsBought: { type: Number, default: 0 }, // lifetime coins bought (incl. pack bonus) → sender frame
    vip: { level: { type: Number, default: 0 }, until: Date },
    royal: { key: String, until: Date }, // royal club (crowns)
    // Store items in use (item ids from config.storeItems); ownership is in UserItem.
    equipped: { frame: String, entry: String, bubble: String },
    diamonds: { type: Number, default: 0, min: 0 }, // gifts a non-host received in rooms
    familyId: { type: Schema.Types.ObjectId, ref: 'Family', default: null, index: true },
    familyRewarded: { type: Boolean, default: false }, // join reward is once per account
    verified: { type: Boolean, default: false },
    // Blue-tick request: a selfie the safety team compares with the profile photos.
    verification: { status: { type: String, enum: ['none', 'pending', 'rejected'], default: 'none' }, selfie: String, at: Date },
    status: { type: String, enum: ['active', 'suspended', 'banned'], default: 'active', index: true },
    statusReason: String,
    suspendedUntil: Date,
    following: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    followersCount: { type: Number, default: 0 },
    blocked: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    device: { platform: String, pushToken: String, appVersion: String },
    lastActive: Date,
    notes: String, // admin-only
    host: { type: hostSchema, default: () => ({}) },
  },
  { timestamps: true },
)

userSchema.index({ 'host.approved': 1, 'host.online': 1 })

/** What the app may see about itself. */
userSchema.methods.toSelf = function () {
  const o = this.toObject()
  delete o.notes
  delete o.blocked
  delete o.fixedOtp
  o.id = String(o._id)
  o.senderTier = senderTierOf(this.coinsBought)
  return o
}

/** What other users may see. */
userSchema.methods.toPublic = function () {
  const h = this.host?.approved ? this.host : null
  return {
    id: String(this._id),
    name: h?.displayName || this.name,
    photo: (h?.photos?.[0]) || this.photos?.[0] || null,
    photos: h?.photos?.length ? h.photos : this.photos,
    gender: this.gender,
    age: this.dob ? Math.floor((Date.now() - this.dob.getTime()) / (365.25 * 864e5)) : null,
    city: this.city,
    followers: this.followersCount || 0,
    bio: h?.bio || this.bio,
    job: this.job || null,
    interests: this.interests || [],
    verified: this.verified,
    vip: this.vip?.until > new Date() ? this.vip.level || 0 : 0,
    royal: this.royal?.until > new Date() ? this.royal.key : null,
    frame: this.equipped?.frame || null,
    familyId: this.familyId ? String(this.familyId) : null,
    isHost: !!h,
    senderTier: senderTierOf(this.coinsBought),
    host: h
      ? {
          level: h.levelOverride || h.level,
          category: hostCategoryOf(h.levelOverride || h.level),
          rates: h.rates,
          online: h.online && !h.busy,
          busy: h.busy,
          rating: h.rating,
          languages: h.languages,
        }
      : null,
  }
}

export const User = mongoose.model('User', userSchema)
