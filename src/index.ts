import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { rateLimit, authenticate, errorHandler } from './middleware'
import organizationsRouter from './organizations/organizationsRouter'
import usersRouter from './users/usersRouter'
import teamsRouter from './teams/teamsRouter'
import contactsRouter from './contacts/contactsRouter'
import ticketsRouter from './tickets/ticketsRouter'
import commentsRouter from './tickets/commentsRouter'
import attachmentsRouter from './tickets/attachmentsRouter'
import * as path from 'node:path'

// Initialize the app
const app = new Hono()

// Health check route
app.get('/', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.VERSION || '1.0.0',
  })
})

// OpenAPI schema route (public access)
app.use(
  '/schema/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'HEAD', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    exposeHeaders: ['Content-Type'],
    maxAge: 86400,
  }),
)
app.get('/schema/openapi.yml', async (c) => {
  try {
    const schemaPath = path.join(process.cwd(), 'openapi.yml')
    const file = Bun.file(schemaPath)
    const exists = await file.exists()

    if (!exists) {
      return c.json({ message: 'Schema file not found' }, 404)
    }

    return new Response(file, {
      headers: {
        'Content-Type': 'application/yaml',
      },
    })
  } catch (error) {
    return c.json({ message: 'Error reading schema file' }, 500)
  }
})

// Global middleware
app.use('*', logger())
app.use('*', prettyJSON())
app.use('*', cors())
app.use('*', authenticate)
app.use('*', rateLimit)

// Error handling
app.onError(errorHandler)

// Mount organization routes
app.route('/organizations', organizationsRouter)

// Mount user routes
app.route('/users', usersRouter)

// Mount teams routes
app.route('/teams', teamsRouter)

// Mount contacts routes
app.route('/contacts', contactsRouter)

// Mount ticket-related routes
app.route('/tickets', ticketsRouter)
app.route('/comments', commentsRouter)
app.route('/attachments', attachmentsRouter)

// Start the server
const port = process.env.PORT || 3000
console.log(`Server is running on port ${port}`)

export default {
  port,
  fetch: app.fetch,
}
