import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

// Mirrors frontend/src/modules/admin/routes/nav.js ROLES.
export const ROLES = {
  super_admin: '*',
  moderator: ['dashboard', 'users', 'hosts', 'applications', 'agencies', 'calls', 'lives', 'moments', 'reports', 'support', 'content'],
  finance: ['dashboard', 'users', 'hosts', 'agencies', 'finance', 'monetization'],
  support: ['dashboard', 'users', 'hosts', 'calls', 'reports', 'support'],
}

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: Object.keys(ROLES), required: true },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    avatar: String,
    lastLogin: Date,
  },
  { timestamps: true },
)

adminSchema.methods.can = function (section) {
  const s = ROLES[this.role]
  return s === '*' || s.includes(section)
}
adminSchema.methods.checkPassword = function (pw) {
  return bcrypt.compare(pw, this.passwordHash)
}
adminSchema.statics.hash = pw => bcrypt.hash(pw, 10)
adminSchema.methods.toJSON = function () {
  const o = this.toObject()
  delete o.passwordHash
  o.id = String(o._id)
  return o
}

export const Admin = mongoose.model('Admin', adminSchema)
