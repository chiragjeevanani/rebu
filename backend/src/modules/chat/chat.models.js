import mongoose from 'mongoose'

const { Schema } = mongoose

// One conversation per pair of users. `key` is the two ids sorted and joined,
// so the pair is unique. Each side keeps its own list state (unread, pinned…).
const sideSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    unread: { type: Number, default: 0 },
    pinned: { type: Boolean, default: false },
    muted: { type: Boolean, default: false },
    hidden: { type: Boolean, default: false }, // "delete chat" for this side
    clearedAt: { type: Date, default: null }, // messages before this are gone for this side
    lastReadAt: { type: Date, default: null },
  },
  { _id: false },
)

const conversationSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    state: [sideSchema],
    lastMessage: {
      id: Schema.Types.ObjectId,
      from: Schema.Types.ObjectId,
      type: { type: String },
      text: String,
      at: Date,
    },
    lastAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
)
conversationSchema.index({ 'state.user': 1, lastAt: -1 })

export const conversationKey = (a, b) => [String(a), String(b)].sort().join('_')

export const Conversation = mongoose.model('Conversation', conversationSchema)

const messageSchema = new Schema(
  {
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    from: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['text', 'image', 'gift'], required: true },
    text: { type: String, default: '' },
    imageUrl: String,
    gift: { key: String, name: String, emoji: String, coins: Number },
    cost: { type: Number, default: 0 }, // coins the sender paid
    greeting: { type: Boolean, default: undefined }, // a free "Say hi" opener
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)
messageSchema.index({ conversation: 1, _id: -1 })

export const Message = mongoose.model('Message', messageSchema)
