import mongoose from 'mongoose'

const auditSchema = new mongoose.Schema(
  {
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    adminName: String,
    action: { type: String, required: true },
    target: String,
    meta: mongoose.Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)
auditSchema.index({ createdAt: -1 })

export const AuditLog = mongoose.model('AuditLog', auditSchema)

/** Record an admin action. `req.admin` must be set. */
export const audit = (req, action, target, meta) =>
  AuditLog.create({ admin: req.admin?._id, adminName: req.admin?.name || 'System', action, target: target ? String(target) : '', meta })
