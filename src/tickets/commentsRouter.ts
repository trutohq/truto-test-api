import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { CommentsService } from './commentsService';
import { User } from '../types';
import db from '../config/database';

type Context = {
  Variables: {
    user: User;
  };
};

const router = new Hono<Context>();
const commentsService = new CommentsService(db);

// List comments (scoped to organization and ticket)
router.get('/', async (c) => {
  const user = c.get('user');
  const cursor = c.req.query('cursor');
  const limitStr = c.req.query('limit');
  const limit = limitStr ? parseInt(limitStr) : 10;
  const ticketIdStr = c.req.query('ticket_id');
  const ticket_id = ticketIdStr ? parseInt(ticketIdStr) : undefined;
  const is_private = c.req.query('is_private') === 'true' ? true : 
                     c.req.query('is_private') === 'false' ? false : 
                     undefined;

  // Validate ticket_id if provided
  if (ticket_id && isNaN(ticket_id)) {
    throw new HTTPException(400, { message: 'Invalid ticket ID' });
  }

  return c.json(await commentsService.list({
    cursor,
    limit,
    ticket_id,
    organization_id: user.organization_id,
    is_private
  }));
});

// Get single comment (scoped to organization)
router.get('/:id', async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    throw new HTTPException(400, { message: 'Invalid comment ID' });
  }

  const comment = await commentsService.getById(id);
  if (!comment) {
    throw new HTTPException(404, { message: 'Comment not found' });
  }

  if (comment.organization_id !== user.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  return c.json(comment);
});

// Create comment (scoped to organization)
router.post('/', async (c) => {
  const user = c.get('user');
  const data = await c.req.json();

  if (!data.body) {
    throw new HTTPException(400, { message: 'Comment body is required' });
  }

  if (!data.ticket_id) {
    throw new HTTPException(400, { message: 'Ticket ID is required' });
  }

  // Set organization_id and author info from authenticated user
  data.organization_id = user.organization_id;
  data.author_type = 'user';
  data.author_id = user.id;

  try {
    const comment = await commentsService.create(data);
    return c.json(comment, 201);
  } catch (error) {
    throw new HTTPException(500, { message: 'Failed to create comment' });
  }
});

// Update comment (scoped to organization and author)
router.patch('/:id', async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    throw new HTTPException(400, { message: 'Invalid comment ID' });
  }

  const comment = await commentsService.getById(id);
  if (!comment) {
    throw new HTTPException(404, { message: 'Comment not found' });
  }

  if (comment.organization_id !== user.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  // Only allow the author to update their own comments
  if (comment.author_type === 'user' && comment.author_id !== user.id) {
    throw new HTTPException(403, { message: 'You can only update your own comments' });
  }

  const data = await c.req.json();

  try {
    const updatedComment = await commentsService.update(id, data);
    if (!updatedComment) {
      throw new HTTPException(404, { message: 'Comment not found' });
    }

    return c.json(updatedComment);
  } catch (error) {
    throw new HTTPException(500, { message: 'Failed to update comment' });
  }
});

// Delete comment (scoped to organization and author)
router.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    throw new HTTPException(400, { message: 'Invalid comment ID' });
  }

  const comment = await commentsService.getById(id);
  if (!comment) {
    throw new HTTPException(404, { message: 'Comment not found' });
  }

  if (comment.organization_id !== user.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  // Only allow the author to delete their own comments
  if (comment.author_type === 'user' && comment.author_id !== user.id) {
    throw new HTTPException(403, { message: 'You can only delete your own comments' });
  }

  const deleted = await commentsService.delete(id);
  if (!deleted) {
    throw new HTTPException(404, { message: 'Comment not found' });
  }

  return c.json({ success: true });
});

export default router; 