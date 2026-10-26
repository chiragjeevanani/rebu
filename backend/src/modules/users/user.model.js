import mongoose from 'mongoose'

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
    busy: { type: Boolean, default: false },
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', default: null },
    callMinutes: { type: Number, default: 0 },
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
  o.id = String(o._id)
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
    host: h
      ? {
          level: h.levelOverride || h.level,
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
