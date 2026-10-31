import mongoose from 'mongoose'

const { Schema } = mongoose

export const PLACEMENTS = ['Home', 'Events', 'Coins tab', 'Splash']
export const AUDIENCES = [
  'All users',
  'Paying users',
  'VIP members',
  'Inactive 14+ days',
  'New users (7 days)',
  'All hosts',
  'Hosts offline today',
  'Followers of live hosts',
]

// `draft` is stored; live/scheduled/ended is derived from the dates.
const bannerSchema = new Schema(
  {
    title: { type: String, required: true },
    subtitle: String,
    image: String,
    cta: String,
    link: String,
    placement: { type: String, enum: PLACEMENTS, default: 'Home', index: true },
    color: String,
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    draft: { type: Boolean, default: false },
    clicks: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    updatedBy: String,
  },
  { timestamps: true },
)

export const bannerStatus = (b, now = new Date()) =>
  b.draft ? 'draft' : now < b.startsAt ? 'scheduled' : now > b.endsAt ? 'ended' : 'live'

export const Banner = mongoose.models.Banner || mongoose.model('Banner', bannerSchema)

const notificationSchema = new Schema(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    audience: { type: String, enum: AUDIENCES, default: 'All users' },
    audienceCount: Number, // estimated reach when sent
    deeplink: String,
    scheduledAt: Date,
    sentAt: Date,
    status: { type: String, enum: ['sent', 'scheduled', 'draft', 'cancelled'], default: 'draft', index: true },
    delivered: { type: Number, default: 0 },
    opened: { type: Number, default: 0 },
    pushed: { type: Number, default: 0 }, // phone pushes FCM accepted
    createdBy: String,
  },
  { timestamps: true },
)

export const Notification = mongoose.models.PushNotification || mongoose.model('PushNotification', notificationSchema)

const pageSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    published: { type: Boolean, default: true },
    updatedBy: String,
  },
  { timestamps: true },
)

export const Page = mongoose.models.ContentPage || mongoose.model('ContentPage', pageSchema)
