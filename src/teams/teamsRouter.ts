import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { TeamsService } from './teamsService'
import { User } from '../types'
import db from '../config/database'

type Context = {
  Variables: {
    user: User
  }
}

const router = new Hono<Context>()
const teamsService = new TeamsService(db)

// List teams (scoped to organization)
router.get('/', async (c) => {
  const user = c.get('user')
  const cursor = c.req.query('cursor')
  const limit = parseInt(c.req.query('limit') || '10')

  return c.json(
    await teamsService.list({
      cursor,
      limit,
      organization_id: user.organization_id,
    }),
  )
})

// Get single team (scoped to organization)
router.get('/:id', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) {
    throw new HTTPException(400, { message: 'Invalid team ID' })
  }

  const team = await teamsService.getById(id)
  if (!team) {
    throw new HTTPException(404, { message: 'Team not found' })
  }

  if (team.organization_id !== user.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' })
  }

  return c.json(team)
})

// Create team (admin only)
router.post('/', async (c) => {
  const user = c.get('user')

  // Only admins can create teams
  if (user.role !== 'admin') {
    throw new HTTPException(403, { message: 'Only admins can create teams' })
  }

  const data = await c.req.json()

  if (!data.name) {
    throw new HTTPException(400, { message: 'Name is required' })
  }

  // Force organization_id to be the user's organization
  data.organization_id = user.organization_id

  try {
    const team = await teamsService.create(data)
    return c.json(team, 201)
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('UNIQUE constraint failed')
    ) {
      throw new HTTPException(409, {
        message: 'Team with this name already exists in your organization',
      })
    }
    throw error
  }
})

// Update team (admin only)
router.patch('/:id', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) {
    throw new HTTPException(400, { message: 'Invalid team ID' })
  }

  // Only admins can update teams
  if (user.role !== 'admin') {
    throw new HTTPException(403, { message: 'Only admins can update teams' })
  }

  const team = await teamsService.getById(id)
  if (!team) {
    throw new HTTPException(404, { message: 'Team not found' })
  }

  if (team.organization_id !== user.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' })
  }

  const data = await c.req.json()

  try {
    const updatedTeam = await teamsService.update(id, {
      name: data.name,
      organization_id: user.organization_id, // Ensure org_id stays the same
    })
    return c.json(updatedTeam)
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('UNIQUE constraint failed')
    ) {
      throw new HTTPException(409, {
        message: 'Team with this name already exists in your organization',
      })
    }
    throw error
  }
})

// Delete team (admin only)
router.delete('/:id', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) {
    throw new HTTPException(400, { message: 'Invalid team ID' })
  }

  // Only admins can delete teams
  if (user.role !== 'admin') {
    throw new HTTPException(403, { message: 'Only admins can delete teams' })
  }

  const team = await teamsService.getById(id)
  if (!team) {
    throw new HTTPException(404, { message: 'Team not found' })
  }

  if (team.organization_id !== user.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' })
  }

  const deleted = await teamsService.delete(id)
  if (!deleted) {
    throw new HTTPException(404, { message: 'Team not found' })
  }

  return c.json({ success: true })
})

// Add member to team (admin only)
router.post('/:id/members', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) {
    throw new HTTPException(400, { message: 'Invalid team ID' })
  }

  // Only admins can add members
  if (user.role !== 'admin') {
    throw new HTTPException(403, {
      message: 'Only admins can add team members',
    })
  }

  const team = await teamsService.getById(id)
  if (!team) {
    throw new HTTPException(404, { message: 'Team not found' })
  }

  if (team.organization_id !== user.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' })
  }

  const data = await c.req.json()
  if (!data.user_id) {
    throw new HTTPException(400, { message: 'User ID is required' })
  }

  // Ensure the user being added belongs to the same organization
  const userToAdd = team.members.find((member) => member.id === data.user_id)
  if (userToAdd && userToAdd.organization_id !== user.organization_id) {
    throw new HTTPException(403, {
      message: 'Cannot add users from other organizations',
    })
  }

  const added = await teamsService.addMember(id, data.user_id)
  if (!added) {
    throw new HTTPException(400, { message: 'Failed to add member to team' })
  }

  return c.json({ success: true })
})

// Remove member from team (admin only)
router.delete('/:id/members/:userId', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  const userId = parseInt(c.req.param('userId'))
  if (isNaN(id) || isNaN(userId)) {
    throw new HTTPException(400, { message: 'Invalid team ID or user ID' })
  }

  // Only admins can remove members
  if (user.role !== 'admin') {
    throw new HTTPException(403, {
      message: 'Only admins can remove team members',
    })
  }

  const team = await teamsService.getById(id)
  if (!team) {
    throw new HTTPException(404, { message: 'Team not found' })
  }

  if (team.organization_id !== user.organization_id) {
    throw new HTTPException(403, { message: 'Access denied' })
  }

  // Ensure the user being removed belongs to the same organization
  const userToRemove = team.members.find((member) => member.id === userId)
  if (!userToRemove) {
    throw new HTTPException(404, { message: 'User not found in team' })
  }

  if (userToRemove.organization_id !== user.organization_id) {
    throw new HTTPException(403, {
      message: 'Cannot remove users from other organizations',
    })
  }

  const removed = await teamsService.removeMember(id, userId)
  if (!removed) {
    throw new HTTPException(400, {
      message: 'Failed to remove member from team',
    })
  }

  return c.json({ success: true })
})

export default router
