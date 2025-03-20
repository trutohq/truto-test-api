import { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import db from '../config/database'
import { RateLimit } from '../types'
import { UsersService } from '../users/usersService'
import { ApiKeyService } from '../apiKeys/apiKeyService'

// Rate limiting configuration
const RATE_LIMIT = 5 // requests per second
const usersService = new UsersService(db)
const apiKeyService = new ApiKeyService(db)

export async function rateLimit(c: Context, next: Next) {
  if (c.req.path === '/') {
    await next()
    return
  }
  const apiKey = c.req.header('x-api-key')
  if (!apiKey) {
    throw new HTTPException(401, { message: 'API key is required' })
  }

  const now = Date.now()

  // Get or create rate limit record
  let rateLimit = db
    .query('SELECT * FROM rate_limits WHERE api_key = ?')
    .get(apiKey) as RateLimit | undefined

  if (!rateLimit) {
    // Create new rate limit record
    db.query(
      `
      INSERT INTO rate_limits (api_key, count, reset_time)
      VALUES (?, 1, ?)
    `,
    ).run(apiKey, now + 1000)

    rateLimit = {
      api_key: apiKey,
      count: 1,
      reset_time: now + 1000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  } else if (now > rateLimit.reset_time) {
    // Reset if time has passed
    db.query(
      `
      UPDATE rate_limits 
      SET count = 1, reset_time = ?, updated_at = CURRENT_TIMESTAMP
      WHERE api_key = ?
    `,
    ).run(now + 1000, apiKey)

    rateLimit.count = 1
    rateLimit.reset_time = now + 1000
  } else if (rateLimit.count >= RATE_LIMIT) {
    throw new HTTPException(429, { message: 'Rate limit exceeded' })
  } else {
    // Increment count
    db.query(
      `
      UPDATE rate_limits 
      SET count = count + 1, updated_at = CURRENT_TIMESTAMP
      WHERE api_key = ?
    `,
    ).run(apiKey)

    rateLimit.count++
  }

  // Set rate limit headers
  c.header('x-ratelimit-limit', RATE_LIMIT.toString())
  c.header('x-ratelimit-remaining', (RATE_LIMIT - rateLimit.count).toString())
  c.header('x-ratelimit-reset', rateLimit.reset_time.toString())

  await next()
}

export async function authenticate(c: Context, next: Next) {
  if (c.req.path === '/') {
    await next()
    return
  }
  const apiKey = c.req.header('x-api-key')
  if (!apiKey) {
    throw new HTTPException(401, { message: 'API key is required' })
  }

  // Find user by API key
  const userId = await apiKeyService.getUserIdByKey(apiKey)
  if (!userId) {
    throw new HTTPException(401, { message: 'Invalid API key' })
  }

  // Get user details
  const user = await usersService.getById(userId)
  if (!user) {
    throw new HTTPException(401, { message: 'User not found' })
  }

  // Set user in context
  c.set('user', user)

  await next()
}

export async function errorHandler(err: Error, c: Context) {
  if (err instanceof HTTPException) {
    return c.json(
      {
        code: 'HTTP_ERROR',
        message: err.message,
      },
      err.status,
    )
  }

  console.error(err)

  return c.json(
    {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
    500,
  )
}
