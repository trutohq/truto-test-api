import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { AttachmentsService } from './attachmentsService'
import { User } from '../types'
import db from '../config/database'

type Context = {
  Variables: {
    user: User
  }
}

const router = new Hono<Context>()
const attachmentsService = new AttachmentsService(db)

// List attachments (scoped to organization)
router.get('/', async (c) => {
  const user = c.get('user')
  const cursor = c.req.query('cursor')
  const limitStr = c.req.query('limit')
  const limit = limitStr ? parseInt(limitStr) : 10

  return c.json(
    await attachmentsService.list({
      cursor,
      limit,
      organization_id: user.organization_id,
    }),
  )
})

// Get single attachment (scoped to organization)
router.get('/:id', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) {
    throw new HTTPException(400, { message: 'Invalid attachment ID' })
  }

  const result = await attachmentsService.getFile(id)
  if (!result) {
    throw new HTTPException(404, { message: 'Attachment not found' })
  }

  const { attachment, file } = result
  if (attachment.organization_id !== user.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' })
  }

  // Set appropriate headers for file download
  c.header('Content-Type', attachment.content_type)
  c.header(
    'Content-Disposition',
    `attachment; filename="${attachment.file_name}"`,
  )
  c.header('Content-Length', attachment.size.toString())

  return new Response(file)
})

// Upload attachment (scoped to organization)
router.post('/', async (c) => {
  const user = c.get('user')
  const formData = await c.req.parseBody()
  const file = formData['file'] as File

  if (!file) {
    throw new HTTPException(400, { message: 'No file provided' })
  }

  try {
    const attachment = await attachmentsService.saveFile(
      file,
      user.organization_id,
    )
    return c.json(attachment, 201)
  } catch (error) {
    throw new HTTPException(500, { message: 'Failed to upload file' })
  }
})

// Add attachment to ticket
router.post('/:id/ticket/:ticketId', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  const ticketId = parseInt(c.req.param('ticketId'))

  if (isNaN(id) || isNaN(ticketId)) {
    throw new HTTPException(400, { message: 'Invalid ID' })
  }

  const attachment = await attachmentsService.getById(id)
  if (!attachment) {
    throw new HTTPException(404, { message: 'Attachment not found' })
  }

  if (attachment.organization_id !== user.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' })
  }

  try {
    await attachmentsService.addToTicket(ticketId, id)
    return c.json({ success: true })
  } catch (error) {
    throw new HTTPException(500, {
      message: 'Failed to add attachment to ticket',
    })
  }
})

// Add attachment to comment
router.post('/:id/comment/:commentId', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  const commentId = parseInt(c.req.param('commentId'))

  if (isNaN(id) || isNaN(commentId)) {
    throw new HTTPException(400, { message: 'Invalid ID' })
  }

  const attachment = await attachmentsService.getById(id)
  if (!attachment) {
    throw new HTTPException(404, { message: 'Attachment not found' })
  }

  if (attachment.organization_id !== user.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' })
  }

  try {
    await attachmentsService.addToComment(commentId, id)
    return c.json({ success: true })
  } catch (error) {
    throw new HTTPException(500, {
      message: 'Failed to add attachment to comment',
    })
  }
})

// Remove attachment from ticket
router.delete('/:id/ticket/:ticketId', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  const ticketId = parseInt(c.req.param('ticketId'))

  if (isNaN(id) || isNaN(ticketId)) {
    throw new HTTPException(400, { message: 'Invalid ID' })
  }

  const attachment = await attachmentsService.getById(id)
  if (!attachment) {
    throw new HTTPException(404, { message: 'Attachment not found' })
  }

  if (attachment.organization_id !== user.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' })
  }

  try {
    await attachmentsService.removeFromTicket(ticketId, id)
    return c.json({ success: true })
  } catch (error) {
    throw new HTTPException(500, {
      message: 'Failed to remove attachment from ticket',
    })
  }
})

// Remove attachment from comment
router.delete('/:id/comment/:commentId', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  const commentId = parseInt(c.req.param('commentId'))

  if (isNaN(id) || isNaN(commentId)) {
    throw new HTTPException(400, { message: 'Invalid ID' })
  }

  const attachment = await attachmentsService.getById(id)
  if (!attachment) {
    throw new HTTPException(404, { message: 'Attachment not found' })
  }

  if (attachment.organization_id !== user.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' })
  }

  try {
    await attachmentsService.removeFromComment(commentId, id)
    return c.json({ success: true })
  } catch (error) {
    throw new HTTPException(500, {
      message: 'Failed to remove attachment from comment',
    })
  }
})

// Delete attachment (scoped to organization)
router.delete('/:id', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) {
    throw new HTTPException(400, { message: 'Invalid attachment ID' })
  }

  const attachment = await attachmentsService.getById(id)
  if (!attachment) {
    throw new HTTPException(404, { message: 'Attachment not found' })
  }

  if (attachment.organization_id !== user.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' })
  }

  const deleted = await attachmentsService.delete(id)
  if (!deleted) {
    throw new HTTPException(404, { message: 'Attachment not found' })
  }

  return c.json({ success: true })
})

export default router
