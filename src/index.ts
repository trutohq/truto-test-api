import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { rateLimit, authenticate, errorHandler } from './middleware'
import organizationsRouter from './organizations/organizationsRouter'
import usersRouter from './users/usersRouter'
import teamsRouter from './teams/teamsRouter'
import contactsRouter from './contacts/contactsRouter'

// Initialize the app
const app = new Hono()

// Global middleware
app.use('*', logger())
app.use('*', prettyJSON())
app.use('*', cors())
app.use('*', authenticate)
app.use('*', rateLimit)

// Error handling
app.onError(errorHandler)

// Health check route
app.get('/', (c) => c.json({ status: 'ok' }))

// Mount organization routes
app.route('/organizations', organizationsRouter)

// Mount user routes
app.route('/users', usersRouter)

// Mount teams routes
app.route('/teams', teamsRouter)

// Mount contacts routes
app.route('/contacts', contactsRouter)

// Start the server
const port = process.env.PORT || 3000
console.log(`Server is running on port ${port}`)

export default {
  port,
  fetch: app.fetch,
}
