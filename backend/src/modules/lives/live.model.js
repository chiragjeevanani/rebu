import mongoose from 'mongoose'

const { Schema } = mongoose

// A live broadcast (live / premium) or a seated room (party / audio).
// Guests are viewers the owner put on camera/mic; in rooms they hold a seat.
const guestSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    seat: { type: Number, default: null }, // seat index in party/audio rooms
    muted: { type: Boolean, default: false },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
)

const requestSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    seat: { type: Number, default: null }, // preferred seat (rooms)
    at: { type: Date, default: Date.now },
  },
  { _id: false },
)

// Recent chat kept for late joiners (capped with $slice on push).
const messageSchema = new Schema(
  {
    id: String,
    kind: { type: String, enum: ['text', 'gift'], default: 'text' },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    name: String,
    photo: String,
    vip: Number,
    text: String,
    gift: Schema.Types.Mixed,
    at: { type: Date, default: Date.now },
  },
  { _id: false },
)

const gifterSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    name: String,
    photo: String,
    coins: { type: Number, default: 0 },
  },
  { _id: false },
)

const liveSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    mode: { type: String, enum: ['live', 'premium', 'party', 'audio'], required: true },
    title: { type: String, required: true, trim: true },
    cover: String,
    welcome: String, // rooms
    category: String, // rooms
    ticket: { type: Number, default: 0 }, // premium only, coins
    allowGuests: { type: Boolean, default: true },
    commentsFrom: { type: String, enum: ['everyone', 'followers', 'nobody'], default: 'everyone' },
    channel: String,
    seats: { type: Number, default: 0 }, // max guests / seats, frozen at start
    status: { type: String, enum: ['live', 'ended', 'removed'], default: 'live', index: true },
    startedAt: { type: Date, default: Date.now },
    endedAt: Date,
    endReason: String,
    endedBy: String,
    ownerSeenAt: { type: Date, default: Date.now }, // heartbeat for cleanup
    viewers: { type: Number, default: 0 }, // current, = viewerIds.length
    viewerIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    uniqueViewers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    peak: { type: Number, default: 0 },
    ticketHolders: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    requests: [requestSchema],
    guests: [guestSchema],
    warnings: [{ message: String, by: String, at: Date }],
    chat: [messageSchema],
    diamonds: { type: Number, default: 0 },
    gifters: [gifterSchema],
    followersAtStart: { type: Number, default: 0 },
  },
  { timestamps: true },
)

liveSchema.index({ status: 1, mode: 1, viewers: -1 })
// One active live per owner, enforced by the database too.
liveSchema.index({ owner: 1 }, { unique: true, partialFilterExpression: { status: 'live' }, name: 'one_active_live' })

export const Live = mongoose.model('Live', liveSchema)
