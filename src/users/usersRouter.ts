import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { UsersService } from './usersService';
import { User } from '../types';

type Context = {
  Variables: {
    user: User;
  };
};

const router = new Hono<Context>();
const usersService = new UsersService();

// Get current user
router.get('/me', async (c) => {
  const user = c.get('user');
  return c.json(user);
});

// List users (scoped to organization)
router.get('/', async (c) => {
  const user = c.get('user');
  const cursor = c.req.query('cursor');
  const limit = parseInt(c.req.query('limit') || '10');
  const email = c.req.query('email');
  const name = c.req.query('name');
  
  return c.json(await usersService.list({ 
    cursor, 
    limit, 
    email, 
    name,
    organization_id: user.organization_id 
  }));
});

// Get single user (scoped to organization)
router.get('/:id', async (c) => {
  const currentUser = c.get('user');
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    throw new HTTPException(400, { message: 'Invalid user ID' });
  }

  const user = await usersService.getById(id);
  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  if (user.organization_id !== currentUser.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  return c.json(user);
});

// Create user (scoped to organization)
router.post('/', async (c) => {
  const currentUser = c.get('user');
  const data = await c.req.json();
  
  if (!data.email || !data.name || !data.role) {
    throw new HTTPException(400, { message: 'Email, name, and role are required' });
  }

  if (!['admin', 'agent'].includes(data.role)) {
    throw new HTTPException(400, { message: 'Role must be either "admin" or "agent"' });
  }

  // Only allow creating users in the same organization
  data.organization_id = currentUser.organization_id;

  try {
    const user = await usersService.create(data);
    return c.json(user, 201);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      throw new HTTPException(409, { message: 'User with this email already exists' });
    }
    throw error;
  }
});

// Update user (scoped to organization with role-based permissions)
router.patch('/:id', async (c) => {
  const currentUser = c.get('user');
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    throw new HTTPException(400, { message: 'Invalid user ID' });
  }

  // Get the user to be updated
  const userToUpdate = await usersService.getById(id);
  if (!userToUpdate) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  // Ensure user belongs to the same organization
  if (userToUpdate.organization_id !== currentUser.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const data = await c.req.json();
  
  if (data.role) {
    if (!['admin', 'agent'].includes(data.role)) {
      throw new HTTPException(400, { message: 'Role must be either "admin" or "agent"' });
    }
    
    // Prevent users from updating their own role
    if (id === currentUser.id) {
      throw new HTTPException(403, { message: 'Cannot update your own role' });
    }
    
    // Only admins can update roles
    if (currentUser.role !== 'admin') {
      throw new HTTPException(403, { message: 'Only admins can update user roles' });
    }
  }

  try {
    const user = await usersService.update(id, data);
    if (!user) {
      throw new HTTPException(404, { message: 'User not found' });
    }

    return c.json(user);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      throw new HTTPException(409, { message: 'User with this email already exists' });
    }
    throw error;
  }
});

// Delete user (scoped to organization, only non-admins)
router.delete('/:id', async (c) => {
  const currentUser = c.get('user');
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    throw new HTTPException(400, { message: 'Invalid user ID' });
  }

  // Prevent self-deletion
  if (id === currentUser.id) {
    throw new HTTPException(403, { message: 'Cannot delete your own account' });
  }

  // Get the user to be deleted
  const userToDelete = await usersService.getById(id);
  if (!userToDelete) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  // Ensure user belongs to the same organization
  if (userToDelete.organization_id !== currentUser.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  // Only allow deleting non-admin users
  if (userToDelete.role === 'admin') {
    throw new HTTPException(403, { message: 'Cannot delete admin users' });
  }

  const deleted = await usersService.delete(id);
  if (!deleted) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  return c.json({ success: true });
});

export default router; 