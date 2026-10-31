import { Router } from 'express'
import { requireAdmin } from '../../core/auth.js'
import { Admin } from '../admins/admin.model.js'
import { dashboardAdmin } from './dashboard.routes.js'
import { usersAdmin } from './users.routes.js'
import { hostsAdmin } from './hosts.routes.js'
import { applicationsAdmin } from './applications.routes.js'
import { agenciesAdmin } from './agencies.routes.js'
import { callsAdmin, livesAdmin } from './activity.routes.js'
import { reportsAdmin, supportAdmin } from './safety.routes.js'
import { financeAdmin } from './finance.routes.js'
import { configAdmin } from './config.routes.js'
import { contentAdmin } from './content.routes.js'
import { adminsAdmin, auditAdmin } from './admins.routes.js'
import { momentsAdmin } from '../moments/moments.js'
import { targetsAdmin } from '../hosts/targets.js'
import { imageUpload, lottieUpload } from '../uploads/uploads.routes.js'

export { publicContentRoutes } from './content.routes.js'

// Mounted at /api/admin. Each sub-router checks its own panel section.
export const adminRoutes = Router()

adminRoutes.get('/me', requireAdmin(Admin), (req, res) => res.json({ admin: req.admin }))

adminRoutes.use('/dashboard', dashboardAdmin)
adminRoutes.use('/users', usersAdmin)
adminRoutes.use('/hosts', hostsAdmin)
adminRoutes.use('/applications', applicationsAdmin)
adminRoutes.use('/agencies', agenciesAdmin)
adminRoutes.use('/calls', callsAdmin)
adminRoutes.use('/lives', livesAdmin)
adminRoutes.use('/moments', momentsAdmin)
adminRoutes.use('/targets', targetsAdmin)
adminRoutes.use('/reports', reportsAdmin)
adminRoutes.use('/support', supportAdmin)
adminRoutes.use('/finance', financeAdmin)
adminRoutes.use('/config', configAdmin)
adminRoutes.use('/content', contentAdmin)
// Banner images etc.: raw image body → { url }
adminRoutes.post('/uploads', requireAdmin(Admin, 'content'), ...imageUpload(() => 'admin'))
adminRoutes.post('/uploads/animation', requireAdmin(Admin, 'monetization'), lottieUpload)
adminRoutes.use('/admins', adminsAdmin)
adminRoutes.use('/audit', auditAdmin)
