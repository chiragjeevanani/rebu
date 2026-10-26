import mongoose from 'mongoose'

const { Schema } = mongoose

// Every coin movement for a user, append-only. `coins` is signed (+credit/−debit)
// and `balance` is the user's balance right after it.
const coinTxnSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: ['purchase', 'signup_bonus', 'call', 'chat', 'gift', 'ticket', 'vip', 'royal', 'store', 'family', 'exchange', 'refund', 'admin_adjust', 'task_reward'],
      required: true,
    },
    coins: { type: Number, required: true },
    balance: { type: Number, required: true },
    title: String,
    ref: { kind: String, id: Schema.Types.ObjectId }, // e.g. { kind: 'Call', id }
    meta: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)
coinTxnSchema.index({ user: 1, createdAt: -1 })

export const CoinTxn = mongoose.model('CoinTxn', coinTxnSchema)

// A coin-pack purchase. `status` follows the payment gateway.
const paymentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    packId: { type: String, required: true },
    coins: { type: Number, required: true },
    bonus: { type: Number, default: 0 },
    amount: { type: Number, required: true }, // ₹
    currency: { type: String, default: 'INR' },
    gateway: { type: String, default: 'mock' },
    gatewayOrderId: String,
    gatewayPaymentId: String,
    method: String,
    status: { type: String, enum: ['created', 'success', 'failed', 'refunded'], default: 'created', index: true },
    failureReason: String,
    refundReason: String,
    refundedAt: Date,
    refundedCoins: Number, // coins actually taken back (never below the user's balance)
    handledBy: String,
  },
  { timestamps: true },
)
paymentSchema.index({ createdAt: -1 })

export const Payment = mongoose.model('Payment', paymentSchema)
