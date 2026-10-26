// Local dev data: admin team (same logins as the admin panel demo), the
// demo user, and a handful of approved hosts. Safe to re-run.
import { connectDb, disconnectDb } from '../src/config/db.js'
import { loadConfig } from '../src/modules/config/config.service.js'
import { Admin } from '../src/modules/admins/admin.model.js'
import { User } from '../src/modules/users/user.model.js'

await connectDb()
await loadConfig()

const ADMINS = [
  ['Om Parteki', 'admin@rebu.app', 'admin123', 'super_admin'],
  ['Priya Nair', 'priya@rebu.app', 'mod123', 'moderator'],
  ['Neha Gupta', 'neha@rebu.app', 'finance123', 'finance'],
  ['Rohit Das', 'rohit@rebu.app', 'support123', 'support'],
]
for (const [name, email, pw, role] of ADMINS) {
  const exists = await Admin.findOne({ email })
  if (!exists) await Admin.create({ name, email, role, passwordHash: await Admin.hash(pw) })
}

const demo = await User.findOneAndUpdate(
  { phone: process.env.DEMO_PHONE || '9999999999' },
  {
    $setOnInsert: {
      name: 'Arjun Mehta',
      gender: 'Male',
      dob: new Date('1999-05-12'),
      city: 'Delhi',
      photos: ['https://i.pravatar.cc/800?img=12'],
      profileDone: true,
      coins: 1450,
      verified: true,
    },
  },
  { upsert: true, returnDocument: 'after' },
)

const HOSTS = [
  ['Aanya', 'Mumbai', 47, 40, 20, 2],
  ['Riya', 'Delhi', 44, 60, 30, 3],
  ['Meera', 'Pune', 45, 30, 15, 1],
  ['Nisha', 'Jaipur', 9, 40, 20, 2],
  ['Zoya', 'Hyderabad', 5, 80, 40, 3],
  ['Ishita', 'Bengaluru', 32, 40, 20, 1],
]
let i = 0
for (const [name, city, img, video, voice, level] of HOSTS) {
  i += 1
  const phone = `90000000${String(i).padStart(2, '0')}`
  await User.findOneAndUpdate(
    { phone },
    {
      $setOnInsert: {
        name,
        gender: 'Female',
        dob: new Date(1998, i, 10),
        city,
        photos: [`https://i.pravatar.cc/800?img=${img}`],
        profileDone: true,
        verified: true,
        host: {
          approved: true,
          approvedAt: new Date(),
          status: 'active',
          level,
          rates: { video, voice },
          online: i % 2 === 1,
          displayName: name,
          photos: [`https://i.pravatar.cc/800?img=${img}`],
          languages: ['Hindi', 'English'],
          bio: 'Let’s talk about anything ✨',
          callMinutes: [0, 300, 1000][level - 1] + 40,
        },
      },
    },
    { upsert: true },
  )
}

console.log(`[seed] admins ${ADMINS.length}, demo user ${demo.phone}, hosts ${HOSTS.length} (phones 9000000001–${9000000000 + HOSTS.length})`)
await disconnectDb()
