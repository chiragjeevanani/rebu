import mongoose from 'mongoose'

const { Schema } = mongoose

// One row per thing a user paid a host for (or a bonus). Amounts are ₹ and
// frozen at the commission in effect when it happened.
const earningSchema = new Schema(
  {
    host: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    source: { type: String, enum: ['video', 'voice', 'chat', 'gift', 'ticket', 'bonus'], required: true },
    from: { type: Schema.Types.ObjectId, ref: 'User' }, // paying user (null for bonuses)
    fromName: String,
    coins: { type: Number, required: true },
    gross: { type: Number, required: true },
    commission: { type: Number, required: true },
    commissionPct: Number,
    agency: { type: Number, default: 0 },
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', default: null },
    net: { type: Number, required: true },
    minutes: Number,
    detail: String,
    ref: { kind: String, id: Schema.Types.ObjectId },
    status: { type: String, enum: ['settled', 'review', 'reversed'], default: 'settled' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)
earningSchema.index({ host: 1, createdAt: -1 })

export const Earning = mongoose.model('Earning', earningSchema)

const withdrawalSchema = new Schema(
  {
    host: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true },
    fee: { type: Number, required: true },
    net: { type: Number, required: true },
    method: {
      methodId: { type: Schema.Types.ObjectId, ref: 'PayoutMethod' }, // finance looks up the full account here
      kind: { type: String, enum: ['upi', 'bank'] },
      label: String,
      holder: String,
      upi: String,
      account: String,
      ifsc: String,
    },
    status: { type: String, enum: ['requested', 'processing', 'paid', 'rejected'], default: 'requested', index: true },
    utr: String,
    note: String,
    handledBy: String,
    approvedAt: Date,
    paidAt: Date,
    rejectedAt: Date,
  },
  { timestamps: true },
)
withdrawalSchema.index({ createdAt: -1 })

export const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema)

// Host's "report a problem with this earning".
const disputeSchema = new Schema(
  {
    host: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    earning: { type: Schema.Types.ObjectId, ref: 'Earning', required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ['open', 'adjusted', 'rejected'], default: 'open', index: true },
    resolution: String,
    adjustment: Number, // ₹ credited (+) or debited (−) on resolution
    handledBy: String,
    resolvedAt: Date,
  },
  { timestamps: true },
)

export const Dispute = mongoose.model('Dispute', disputeSchema)
