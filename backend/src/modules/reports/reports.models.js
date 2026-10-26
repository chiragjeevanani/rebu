import mongoose from 'mongoose'

const { Schema } = mongoose

export const REPORT_TARGETS = ['user', 'host', 'moment', 'live', 'room', 'message']
export const PRIORITY_RANK = { high: 0, medium: 1, low: 2 }

// A user flagging someone or something. `targetId` is a string because
// targets live in different collections (users, lives, moments, messages).
const reportSchema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reporterName: String,
    targetType: { type: String, enum: REPORT_TARGETS, required: true },
    targetId: { type: String, required: true },
    targetName: String,
    targetOwner: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // owner of a live/moment/message
    reason: { type: String, required: true },
    details: String,
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    rank: { type: Number, default: 2 }, // sort key: high 0 → low 2
    status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open', index: true },
    action: String,
    note: String,
    handledBy: String,
    handledAt: Date,
  },
  { timestamps: true },
)
reportSchema.index({ targetType: 1, targetId: 1, status: 1 })
reportSchema.index({ status: 1, rank: 1, createdAt: 1 })

export const Report = mongoose.models.Report || mongoose.model('Report', reportSchema)

const messageSchema = new Schema(
  {
    by: { type: String, enum: ['user', 'admin'], required: true },
    name: String,
    text: { type: String, required: true },
    ts: { type: Date, default: Date.now },
  },
  { _id: false },
)

const ticketSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fromType: { type: String, enum: ['user', 'host'], default: 'user' },
    fromName: String,
    subject: { type: String, required: true },
    category: { type: String, required: true },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    status: { type: String, enum: ['open', 'pending', 'closed'], default: 'open', index: true },
    assignee: { type: String, default: null },
    messages: [messageSchema],
    closedAt: Date,
  },
  { timestamps: true },
)
ticketSchema.index({ updatedAt: -1 })

export const SupportTicket = mongoose.models.SupportTicket || mongoose.model('SupportTicket', ticketSchema)
