import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ContactsService } from './contactsService'
import { User } from '../types'
import db from '../config/database'

type Context = {
  Variables: {
    user: User
  }
}

const router = new Hono<Context>()
const contactsService = new ContactsService(db)

// List contacts (scoped to organization)
router.get('/', async (c) => {
  const user = c.get('user')
  const cursor = c.req.query('cursor')
  const limit = parseInt(c.req.query('limit') || '10')
  const email = c.req.query('email')
  const phone = c.req.query('phone')
  const name = c.req.query('name')

  return c.json(
    await contactsService.list({
      cursor,
      limit,
      organization_id: user.organization_id,
      email,
      phone,
      name,
    }),
  )
})

// Get single contact (scoped to organization)
router.get('/:id', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) {
    throw new HTTPException(400, { message: 'Invalid contact ID' })
  }

  const contact = await contactsService.getById(id)
  if (!contact) {
    throw new HTTPException(404, { message: 'Contact not found' })
  }

  if (contact.organization_id !== user.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' })
  }

  return c.json(contact)
})

// Create contact (with smart merge)
router.post('/', async (c) => {
  const user = c.get('user')
  const data = await c.req.json()

  if (!data.name) {
    throw new HTTPException(400, { message: 'Name is required' })
  }

  if (
    (!data.emails || data.emails.length === 0) &&
    (!data.phones || data.phones.length === 0)
  ) {
    throw new HTTPException(400, {
      message: 'At least one email or phone number is required',
    })
  }

  // Validate email format if provided
  if (data.emails) {
    for (const emailData of data.emails) {
      if (
        !emailData.email ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailData.email)
      ) {
        throw new HTTPException(400, { message: 'Invalid email format' })
      }
    }
  }

  // Validate phone format if provided (basic validation)
  if (data.phones) {
    for (const phoneData of data.phones) {
      if (!phoneData.phone || phoneData.phone.length < 5) {
        throw new HTTPException(400, { message: 'Invalid phone number format' })
      }
    }
  }

  // Force organization_id to be the user's organization
  data.organization_id = user.organization_id

  try {
    const contact = await contactsService.createWithContactInfo(data)
    return c.json(contact, 201)
  } catch (error) {
    if (error instanceof Error) {
      throw new HTTPException(400, { message: error.message })
    }
    throw error
  }
})

// Update contact
router.patch('/:id', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) {
    throw new HTTPException(400, { message: 'Invalid contact ID' })
  }

  const contact = await contactsService.getById(id)
  if (!contact) {
    throw new HTTPException(404, { message: 'Contact not found' })
  }

  if (contact.organization_id !== user.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' })
  }

  const data = await c.req.json()

  // Validate that contact will still have at least one email or phone
  const willHaveEmail = data.emails
    ? data.emails.length > 0
    : contact.emails.length > 0
  const willHavePhone = data.phones
    ? data.phones.length > 0
    : contact.phones.length > 0

  if (!willHaveEmail && !willHavePhone) {
    throw new HTTPException(400, {
      message: 'Contact must have at least one email or phone number',
    })
  }

  // Validate email format if provided
  if (data.emails) {
    for (const emailData of data.emails) {
      if (
        !emailData.email ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailData.email)
      ) {
        throw new HTTPException(400, { message: 'Invalid email format' })
      }
    }
  }

  // Validate phone format if provided
  if (data.phones) {
    for (const phoneData of data.phones) {
      if (!phoneData.phone || phoneData.phone.length < 5) {
        throw new HTTPException(400, { message: 'Invalid phone number format' })
      }
    }
  }

  try {
    const updatedContact = await contactsService.update(id, {
      ...data,
      organization_id: user.organization_id, // Ensure org_id stays the same
    })
    return c.json(updatedContact)
  } catch (error) {
    if (error instanceof Error) {
      throw new HTTPException(400, { message: error.message })
    }
    throw error
  }
})

// Delete contact
router.delete('/:id', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) {
    throw new HTTPException(400, { message: 'Invalid contact ID' })
  }

  const contact = await contactsService.getById(id)
  if (!contact) {
    throw new HTTPException(404, { message: 'Contact not found' })
  }

  if (contact.organization_id !== user.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' })
  }

  const deleted = await contactsService.delete(id)
  if (!deleted) {
    throw new HTTPException(404, { message: 'Contact not found' })
  }

  return c.json({ success: true })
})

export default router
