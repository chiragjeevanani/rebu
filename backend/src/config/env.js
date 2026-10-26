// All runtime settings come from environment variables (see .env.example).
const req = (key, fallback) => {
  const v = process.env[key] ?? fallback
  if (v === undefined || v === '') throw new Error(`Missing env var ${key}`)
  return v
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 4000),
  mongoUri: req('MONGO_URI', 'mongodb://127.0.0.1:27017/rebu'),
  jwtSecret: req('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  adminJwtExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '12h',
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  otpProvider: process.env.OTP_PROVIDER || 'mock',
  demoPhone: process.env.DEMO_PHONE || '',
  demoOtp: process.env.DEMO_OTP || '',
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  // SMS for OTP: OTP_PROVIDER=msg91 | twilio (mock logs the code).
  msg91: {
    authKey: process.env.MSG91_AUTH_KEY || '',
    templateId: process.env.MSG91_TEMPLATE_ID || '',
  },
  twilio: {
    sid: process.env.TWILIO_ACCOUNT_SID || '',
    token: process.env.TWILIO_AUTH_TOKEN || '',
    from: process.env.TWILIO_FROM || '',
  },
  // Push: a Firebase service-account JSON (file path or the JSON itself). Blank = no push.
  fcmServiceAccount: process.env.FCM_SERVICE_ACCOUNT || '',
  // Uploads: STORAGE=cloudinary uses CLOUDINARY_URL (cloudinary://key:secret@cloud); default is local disk.
  storage: process.env.STORAGE || 'local',
  cloudinaryUrl: process.env.CLOUDINARY_URL || '',
  agora: {
    appId: process.env.AGORA_APP_ID || '',
    certificate: process.env.AGORA_APP_CERTIFICATE || '',
    tokenTtl: Number(process.env.AGORA_TOKEN_TTL || 3600),
  },
}

if (env.isProd && env.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production')
}
