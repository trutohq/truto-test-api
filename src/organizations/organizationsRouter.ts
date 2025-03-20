import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { OrganizationsService } from './organizationsService';
import { User } from '../types';
import db from '../config/database';

type Context = {
  Variables: {
    user: User;
  };
};

const router = new Hono<Context>();
const organizationsService = new OrganizationsService(db);

// List organizations (returns user's organization)
router.get('/', async (c) => {
  const user = c.get('user');
  const organization = await organizationsService.getById(user.organization_id);
  
  if (!organization) {
    throw new HTTPException(404, { message: 'Organization not found' });
  }

  return c.json({
    data: [organization],
    next_cursor: null,
    prev_cursor: null
  });
});

// Get single organization
router.get('/:id', async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    throw new HTTPException(400, { message: 'Invalid organization ID' });
  }

  if (user.organization_id !== id) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const organization = await organizationsService.getById(id);
  if (!organization) {
    throw new HTTPException(404, { message: 'Organization not found' });
  }

  return c.json(organization);
});

// Update organization
router.patch('/:id', async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    throw new HTTPException(400, { message: 'Invalid organization ID' });
  }

  if (user.organization_id !== id) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const data = await c.req.json();
  
  try {
    const organization = await organizationsService.update(id, data);
    if (!organization) {
      throw new HTTPException(404, { message: 'Organization not found' });
    }
    return c.json(organization);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      throw new HTTPException(409, { message: 'Organization with this slug already exists' });
    }
    throw error;
  }
});

export default router; 