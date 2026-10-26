// One-time: turn the local mongod (started with --replSet rs0) into a
// single-node replica set so multi-document transactions work.
import mongoose from 'mongoose'

const conn = await mongoose.createConnection('mongodb://127.0.0.1:27027/?directConnection=true').asPromise()
const admin = conn.db.admin()
try {
  const s = await admin.command({ replSetGetStatus: 1 })
  console.log('replica set already running:', s.set)
} catch {
  await admin.command({ replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27027' }] } })
  console.log('replica set rs0 initiated')
}
await conn.close()
