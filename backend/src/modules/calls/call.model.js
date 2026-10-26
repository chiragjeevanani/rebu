import mongoose from 'mongoose'

const { Schema } = mongoose

// One row per 1-on-1 call. `status` only ever moves forward:
//   ringing → connected → ended
//   ringing → missed | declined | cancelled
// Every transition is a conditional update on the current status, so two
// requests (or a request and a timer) can never both win.
export const ACTIVE = ['ringing', 'connected']

const callSchema = new Schema(
  {
    caller: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    host: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['video', 'voice'], required: true },
    random: { type: Boolean, default: false },
    status: { type: String, enum: ['ringing', 'connected', 'ended', 'missed', 'declined', 'cancelled'], default: 'ringing', index: true },
    // Admin actions
    refunded: { type: Boolean, default: false },
    refundReason: String,
    refundCoins: Number,
    flagged: { type: Boolean, default: false },
    flagNote: String,
    rate: { type: Number, required: true }, // coins / minute, frozen at call start
    channel: String,
    connectedAt: Date,
    endedAt: Date,
    endReason: { type: String, enum: ['hangup', 'no_coins', 'timeout', 'declined', 'cancelled', 'disconnect', 'server_restart', 'host_offline', 'admin', 'error'] },
    endedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    duration: { type: Number, default: 0 }, // connected seconds
    minutes: { type: Number, default: 0 }, // minutes charged (per started minute)
    chargedCoins: { type: Number, default: 0 },
    hostNet: { type: Number, default: 0 }, // ₹ the host earned from minutes
    giftCoins: { type: Number, default: 0 }, // gifts sent during the call
    rating: { type: Number, min: 1, max: 5, default: null },
  },
  { timestamps: true },
)
callSchema.index({ caller: 1, createdAt: -1 })
callSchema.index({ host: 1, createdAt: -1 })

export const Call = mongoose.model('Call', callSchema)
