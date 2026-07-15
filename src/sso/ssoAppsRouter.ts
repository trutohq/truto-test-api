import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { SsoAppsService } from './ssoAppsService'
import { User } from '../types'
import db from '../config/database'

type Context = {
  Variables: {
    user: User
  }
}

const router = new Hono<Context>()
const ssoAppsService = new SsoAppsService(db)

// List authorized SSO apps (scoped to organization). `user_id` narrows to a
// single directory user's authorized apps (mirrors Google Admin SDK tokens.list
// and backs Unified SSO `apps` list); `client_id` narrows to one app.
router.get('/', async (c) => {
  const user = c.get('user')
  const cursor = c.req.query('cursor')
  const limit = parseInt(c.req.query('limit') || '10')
  const client_id = c.req.query('client_id')

  const userIdStr = c.req.query('user_id')
  const user_id = userIdStr ? parseInt(userIdStr) : undefined
  if (userIdStr !== undefined && Number.isNaN(user_id)) {
    throw new HTTPException(400, { message: 'Invalid user_id' })
  }

  return c.json(
    await ssoAppsService.list({
      cursor,
      limit,
      user_id,
      client_id,
      organization_id: user.organization_id,
    }),
  )
})

// Get a single SSO app authorization grant (scoped to organization).
router.get('/:id', async (c) => {
  const currentUser = c.get('user')
  const id = parseInt(c.req.param('id'))
  if (Number.isNaN(id)) {
    throw new HTTPException(400, { message: 'Invalid SSO app ID' })
  }

  const app = await ssoAppsService.getById(id)
  if (!app) {
    throw new HTTPException(404, { message: 'SSO app not found' })
  }

  if (app.organization_id !== currentUser.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' })
  }

  return c.json(app)
})

export default router
