import { Hono } from 'hono'
import { ContentfulStatusCode } from 'hono/utils/http-status'

const router = new Hono()

router.get('/:statusCode', (c) => {
  const statusCode = parseInt(c.req.param('statusCode'))

  // Validate status code is between 100-599
  if (isNaN(statusCode) || statusCode < 100 || statusCode > 599) {
    return c.json(
      {
        message: 'Invalid status code. Must be between 100 and 599',
        timestamp: new Date().toISOString(),
      },
      400,
    )
  }

  // For 429 status code, add random retry-after header
  if (statusCode === 429) {
    const retryAfter = Math.floor(Math.random() * 26) + 5 // Random number between 5 and 30
    c.header('Retry-After', retryAfter.toString())
  }

  return c.json(
    {
      message: `Test response with status code ${statusCode}`,
      timestamp: new Date().toISOString(),
    },
    statusCode as ContentfulStatusCode,
  )
})

export default router
