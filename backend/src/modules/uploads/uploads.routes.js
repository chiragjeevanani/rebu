// Image uploads (profile photos, moments, host application selfie and ID,
// admin banners). STORAGE=cloudinary sends them to Cloudinary (production);
// the default keeps them on local disk under /uploads (dev only — a server's
// disk isn't durable). Callers only ever see the returned URL.
import express, { Router } from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { env } from '../../config/env.js'
import { ApiError, badRequest } from '../../core/errors.js'
import { ah } from '../../core/http.js'

export const UPLOAD_DIR = path.resolve('uploads')
/** Where uploaded files are served from: PUBLIC_URL, else the request's own address. */
const publicBase = req => env.publicUrl || `${req.protocol}://${req.get('host')}`

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** cloudinary://key:secret@cloud_name */
function cloudinary() {
  const m = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(env.cloudinaryUrl.trim())
  if (!m) throw new Error('CLOUDINARY_URL must look like cloudinary://key:secret@cloud_name')
  return { key: m[1], secret: m[2], cloud: m[3] }
}

async function toCloudinary(buf, type, publicId, kind = 'image') {
  const c = cloudinary()
  const params = { folder: 'rebu', public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)) }
  const toSign = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&')
  const form = new FormData()
  form.append('file', new Blob([buf], { type }))
  for (const [k, v] of Object.entries(params)) form.append(k, v)
  form.append('api_key', c.key)
  form.append('signature', crypto.createHash('sha1').update(toSign + c.secret).digest('hex'))
  const r = await fetch(`https://api.cloudinary.com/v1_1/${c.cloud}/${kind}/upload`, { method: 'POST', body: form })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    console.error('[uploads] cloudinary failed', r.status, j.error?.message)
    throw new ApiError(502, 'upload_failed', 'Upload failed. Please try again.')
  }
  return j.secure_url
}

/**
 * Express handler for a raw image body (content-type image/jpeg|png|webp).
 * `owner(req)` names the file prefix (user id, or "admin").
 */
export function imageUpload(owner) {
  return [
    express.raw({ type: Object.keys(TYPES), limit: '8mb' }),
    ah(async (req, res) => {
      const type = req.get('content-type')?.split(';')[0]
      const ext = TYPES[type]
      if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) {
        throw badRequest('Send a JPEG, PNG or WebP image.')
      }
      const id = `${owner(req)}_${crypto.randomBytes(8).toString('hex')}`
      if (env.storage === 'cloudinary') {
        return res.status(201).json({ url: await toCloudinary(req.body, type, id) })
      }
      await fs.mkdir(UPLOAD_DIR, { recursive: true })
      const name = `${id}.${ext}`
      await fs.writeFile(path.join(UPLOAD_DIR, name), req.body)
      const base = publicBase(req)
      res.status(201).json({ url: `${base}/uploads/${name}` })
    }),
  ]
}

/**
 * Lottie animation upload (admin gift animations). The body is the Lottie JSON
 * itself, already parsed by express.json (so 1 MB max — plenty for a gift).
 */
export const lottieUpload = ah(async (req, res) => {
  const j = req.body
  const ok = j && typeof j === 'object' && Array.isArray(j.layers) && j.layers.length && j.v && j.fr > 0 && j.w > 0 && j.h > 0
  if (!ok) throw badRequest('That isn’t a Lottie animation. Export it from LottieFiles as Lottie JSON.')
  const buf = Buffer.from(JSON.stringify(j))
  const id = `admin_anim_${crypto.randomBytes(8).toString('hex')}`
  if (env.storage === 'cloudinary') {
    return res.status(201).json({ url: await toCloudinary(buf, 'application/json', `${id}.json`, 'raw') })
  }
  await fs.mkdir(UPLOAD_DIR, { recursive: true })
  await fs.writeFile(path.join(UPLOAD_DIR, `${id}.json`), buf)
  res.status(201).json({ url: `${publicBase(req)}/uploads/${id}.json` })
})

export const uploadsRoutes = Router()
uploadsRoutes.post('/', ...imageUpload(req => req.user._id))
