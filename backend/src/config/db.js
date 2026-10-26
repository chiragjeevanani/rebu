import mongoose from 'mongoose'
import { env } from './env.js'

export async function connectDb() {
  mongoose.set('strictQuery', true)
  await mongoose.connect(env.mongoUri)
  console.log(`[db] connected ${mongoose.connection.host}/${mongoose.connection.name}`)
}

export async function disconnectDb() {
  await mongoose.disconnect()
}
