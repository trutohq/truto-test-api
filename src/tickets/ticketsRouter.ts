import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { TicketsService } from './ticketsService';
import { User } from '../types';
import db from '../config/database';

type Context = {
  Variables: {
    user: User;
  };
};

const router = new Hono<Context>();
const ticketsService = new TicketsService(db);

// List tickets (scoped to organization)
router.get('/', async (c) => {
  const user = c.get('user');
  const cursor = c.req.query('cursor');
  const limitStr = c.req.query('limit');
  const limit = limitStr ? parseInt(limitStr) : 10;
  const assigneeIdStr = c.req.query('assignee_id');
  const assignee_id = assigneeIdStr ? parseInt(assigneeIdStr) : undefined;
  const contactIdStr = c.req.query('contact_id');
  const contact_id = contactIdStr ? parseInt(contactIdStr) : undefined;
  const status = c.req.query('status') as 'open' | 'closed' | undefined;
  const priority = c.req.query('priority') as 'low' | 'normal' | 'high' | undefined;

  // Validate status and priority if provided
  if (status && !['open', 'closed'].includes(status)) {
    throw new HTTPException(400, { message: 'Invalid status value' });
  }

  if (priority && !['low', 'normal', 'high'].includes(priority)) {
    throw new HTTPException(400, { message: 'Invalid priority value' });
  }

  // Validate assignee_id and contact_id if provided
  if (assignee_id && isNaN(assignee_id)) {
    throw new HTTPException(400, { message: 'Invalid assignee ID' });
  }

  if (contact_id && isNaN(contact_id)) {
    throw new HTTPException(400, { message: 'Invalid contact ID' });
  }

  // Validate assignee belongs to organization if provided
  if (assignee_id) {
    const assignee = await db.query(`
      SELECT id FROM users 
      WHERE id = ? AND organization_id = ?
    `).get(assignee_id, user.organization_id);

    if (!assignee) {
      throw new HTTPException(400, { message: 'Invalid assignee' });
    }
  }

  // Validate contact belongs to organization if provided
  if (contact_id) {
    const contact = await db.query(`
      SELECT id FROM contacts 
      WHERE id = ? AND organization_id = ?
    `).get(contact_id, user.organization_id);

    if (!contact) {
      throw new HTTPException(400, { message: 'Invalid contact' });
    }
  }

  return c.json(await ticketsService.list({
    cursor,
    limit,
    organization_id: user.organization_id,
    assignee_id,
    contact_id,
    status,
    priority
  }));
});

// Get single ticket (scoped to organization)
router.get('/:id', async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    throw new HTTPException(400, { message: 'Invalid ticket ID' });
  }

  const ticket = await ticketsService.getById(id);
  if (!ticket) {
    throw new HTTPException(404, { message: 'Ticket not found' });
  }

  if (ticket.organization_id !== user.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  return c.json(ticket);
});

// Create ticket (scoped to organization)
router.post('/', async (c) => {
  const user = c.get('user');
  const data = await c.req.json();

  if (!data.subject) {
    throw new HTTPException(400, { message: 'Subject is required' });
  }

  // Validate assignee belongs to organization if provided
  if (data.assignee_id) {
    const assignee = await db.query(`
      SELECT id FROM users 
      WHERE id = ? AND organization_id = ?
    `).get(data.assignee_id, user.organization_id);

    if (!assignee) {
      throw new HTTPException(400, { message: 'Invalid assignee' });
    }
  }

  // Validate contact belongs to organization if provided
  if (data.contact_id) {
    const contact = await db.query(`
      SELECT id FROM contacts 
      WHERE id = ? AND organization_id = ?
    `).get(data.contact_id, user.organization_id);

    if (!contact) {
      throw new HTTPException(400, { message: 'Invalid contact' });
    }
  }

  // Set organization_id from authenticated user
  data.organization_id = user.organization_id;

  try {
    const ticket = await ticketsService.create(data);
    return c.json(ticket, 201);
  } catch (error) {
    throw new HTTPException(500, { message: 'Failed to create ticket' });
  }
});

// Update ticket (scoped to organization)
router.patch('/:id', async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    throw new HTTPException(400, { message: 'Invalid ticket ID' });
  }

  const ticket = await ticketsService.getById(id);
  if (!ticket) {
    throw new HTTPException(404, { message: 'Ticket not found' });
  }

  if (ticket.organization_id !== user.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const data = await c.req.json();

  // Validate assignee belongs to organization if provided
  if (data.assignee_id) {
    const assignee = await db.query(`
      SELECT id FROM users 
      WHERE id = ? AND organization_id = ?
    `).get(data.assignee_id, user.organization_id);

    if (!assignee) {
      throw new HTTPException(400, { message: 'Invalid assignee' });
    }
  }

  // Validate contact belongs to organization if provided
  if (data.contact_id) {
    const contact = await db.query(`
      SELECT id FROM contacts 
      WHERE id = ? AND organization_id = ?
    `).get(data.contact_id, user.organization_id);

    if (!contact) {
      throw new HTTPException(400, { message: 'Invalid contact' });
    }
  }

  try {
    const updatedTicket = await ticketsService.update(id, data);
    if (!updatedTicket) {
      throw new HTTPException(404, { message: 'Ticket not found' });
    }

    return c.json(updatedTicket);
  } catch (error) {
    throw new HTTPException(500, { message: 'Failed to update ticket' });
  }
});

// Delete ticket (scoped to organization)
router.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    throw new HTTPException(400, { message: 'Invalid ticket ID' });
  }

  const ticket = await ticketsService.getById(id);
  if (!ticket) {
    throw new HTTPException(404, { message: 'Ticket not found' });
  }

  if (ticket.organization_id !== user.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const deleted = await ticketsService.delete(id);
  if (!deleted) {
    throw new HTTPException(404, { message: 'Ticket not found' });
  }

  return c.json({ success: true });
});

export default router; 