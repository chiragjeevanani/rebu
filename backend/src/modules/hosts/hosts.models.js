import mongoose from 'mongoose'

const { Schema } = mongoose

const agencySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    owner: String,
    phone: String,
    email: String,
    city: String,
    cut: { type: Number, default: 10, min: 0, max: 30 }, // % of host share (informational; economy.agencyCut is applied)
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  },
  { timestamps: true },
)

export const Agency = mongoose.model('Agency', agencySchema)

const applicationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    gender: { type: String, enum: ['Female', 'Male', 'Other'], required: true },
    dob: { type: Date, required: true },
    languages: [String],
    bio: String,
    photos: { type: [String], validate: v => v.length >= 1 },
    selfie: String,
    faceMatch: Number, // 0-100 from the face-match provider (null until checked)
    id: { type: { type: String }, last4: String, photo: String },
    agencyCode: String,
    rates: { video: Number, voice: Number },
    flags: [String],
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    reasons: [String],
    reviewedBy: String,
    reviewedAt: Date,
  },
  // `id` is the ID-document path above, so Mongoose's `id` virtual must be off.
  { timestamps: true, id: false },
)

export const HostApplication = mongoose.model('HostApplication', applicationSchema)

// A host's saved bank/UPI accounts (must match the verified name).
const payoutMethodSchema = new Schema(
  {
    host: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['upi', 'bank'], required: true },
    holder: { type: String, required: true },
    upi: String,
    account: String, // full number stored; only last 4 ever returned to the app
    ifsc: String,
    label: String,
  },
  { timestamps: true },
)

export const PayoutMethod = mongoose.model('PayoutMethod', payoutMethodSchema)
