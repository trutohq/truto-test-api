import { faker } from '@faker-js/faker'
import { DateTime } from 'luxon'
import db from '../config/database'
import { User, Team, Contact, Ticket } from '../types'
import { randomDate } from '../utils/dates'
import { ticketTemplates } from '../ticket-templates'

interface SeedOptions {
  organizationId: number
  startDate: DateTime
  endDate: DateTime
}

function generateUsers(options: SeedOptions, count: number = 10): User[] {
  const users: User[] = []
  const roles = ['admin', 'agent'] as const

  for (let i = 0; i < count; i++) {
    const user = db
      .prepare(
        `INSERT INTO users (email, name, organization_id, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING *`,
      )
      .get(
        faker.internet.email(),
        faker.person.fullName(),
        options.organizationId,
        roles[Math.floor(Math.random() * roles.length)],
        randomDate(options.startDate, options.endDate),
        randomDate(options.startDate, options.endDate),
      ) as User
    users.push(user)

    // Generate API key for each user
    db.prepare(
      `INSERT INTO api_keys (key, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    ).run(
      faker.string.alphanumeric(32),
      user.id,
      randomDate(options.startDate, options.endDate),
      randomDate(options.startDate, options.endDate),
    )
  }
  return users
}

function generateTeams(
  options: SeedOptions,
  users: User[],
  count: number = 5,
): Team[] {
  const teams: Team[] = []

  for (let i = 0; i < count; i++) {
    const team = db
      .prepare(
        `INSERT INTO teams (name, organization_id, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         RETURNING *`,
      )
      .get(
        faker.company.name() + ' Team',
        options.organizationId,
        randomDate(options.startDate, options.endDate),
        randomDate(options.startDate, options.endDate),
      ) as Team
    teams.push(team)

    // Assign random users to team
    const teamSize = Math.floor(Math.random() * users.length) + 1
    const shuffledUsers = [...users]
      .sort(() => Math.random() - 0.5)
      .slice(0, teamSize)

    for (const user of shuffledUsers) {
      db.prepare(
        `INSERT INTO team_members (team_id, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
      ).run(
        team.id,
        user.id,
        randomDate(options.startDate, options.endDate),
        randomDate(options.startDate, options.endDate),
      )
    }
  }
  return teams
}

function generateContacts(options: SeedOptions, count: number = 20): Contact[] {
  const contacts: Contact[] = []

  for (let i = 0; i < count; i++) {
    const contact = db
      .prepare(
        `INSERT INTO contacts (name, organization_id, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         RETURNING *`,
      )
      .get(
        faker.person.fullName(),
        options.organizationId,
        randomDate(options.startDate, options.endDate),
        randomDate(options.startDate, options.endDate),
      ) as Contact
    contacts.push(contact)

    // Add primary email
    db.prepare(
      `INSERT INTO contact_emails (contact_id, email, is_primary, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?)`,
    ).run(
      contact.id,
      faker.internet.email(),
      randomDate(options.startDate, options.endDate),
      randomDate(options.startDate, options.endDate),
    )

    // Add primary phone
    db.prepare(
      `INSERT INTO contact_phones (contact_id, phone, is_primary, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?)`,
    ).run(
      contact.id,
      faker.phone.number(),
      randomDate(options.startDate, options.endDate),
      randomDate(options.startDate, options.endDate),
    )

    // Randomly add secondary contact info
    if (Math.random() > 0.7) {
      db.prepare(
        `INSERT INTO contact_emails (contact_id, email, is_primary, created_at, updated_at)
         VALUES (?, ?, 0, ?, ?)`,
      ).run(
        contact.id,
        faker.internet.email(),
        randomDate(options.startDate, options.endDate),
        randomDate(options.startDate, options.endDate),
      )
    }

    if (Math.random() > 0.7) {
      db.prepare(
        `INSERT INTO contact_phones (contact_id, phone, is_primary, created_at, updated_at)
         VALUES (?, ?, 0, ?, ?)`,
      ).run(
        contact.id,
        faker.phone.number(),
        randomDate(options.startDate, options.endDate),
        randomDate(options.startDate, options.endDate),
      )
    }
  }
  return contacts
}

function generateTickets(
  options: SeedOptions,
  users: User[],
  contacts: Contact[],
  count: number = 50,
) {
  for (let i = 0; i < count; i++) {
    const template =
      ticketTemplates[Math.floor(Math.random() * ticketTemplates.length)]
    const contact = contacts[Math.floor(Math.random() * contacts.length)]
    const assignee = users[Math.floor(Math.random() * users.length)]
    const orderNumber = `#${faker.number.int({ min: 10000, max: 99999 })}`

    // Create initial ticket with customer's message
    const ticketCreatedAt = randomDate(options.startDate, options.endDate)
    const initialMessage = template.initialMessage(orderNumber)
    const ticket = db
      .prepare(
        `INSERT INTO tickets (
           subject, description, status, priority, assignee_id, contact_id,
           organization_id, closed_at, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING *`,
      )
      .get(
        template.subject,
        initialMessage,
        template.resolution?.status || 'open',
        template.priority,
        assignee.id,
        contact.id,
        options.organizationId,
        null, // Will be updated after conversation
        ticketCreatedAt,
        ticketCreatedAt,
      ) as Ticket

    // Create the initial comment from the contact
    let currentDateTime = DateTime.fromFormat(
      ticketCreatedAt,
      'yyyy-MM-dd HH:mm:ss',
    )
    db.prepare(
      `INSERT INTO comments (
         ticket_id, body, body_html, is_private, author_type, author_id,
         organization_id, created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      ticket.id,
      initialMessage,
      initialMessage.replace(/\n/g, '<br>'),
      false,
      'contact',
      contact.id,
      options.organizationId,
      randomDate(currentDateTime, currentDateTime.plus({ minutes: 5 })),
      randomDate(currentDateTime, currentDateTime.plus({ minutes: 5 })),
    )

    // Generate the conversation flow
    for (const message of template.conversationFlow) {
      currentDateTime = currentDateTime.plus({ hours: message.delayHours })
      const messageText = message.message(orderNumber)

      db.prepare(
        `INSERT INTO comments (
           ticket_id, body, body_html, is_private, author_type, author_id,
           organization_id, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        ticket.id,
        messageText,
        messageText.replace(/\n/g, '<br>'),
        message.isPrivate || false,
        message.isAgent ? 'user' : 'contact',
        message.isAgent ? assignee.id : contact.id,
        options.organizationId,
        randomDate(currentDateTime, currentDateTime.plus({ minutes: 5 })),
        randomDate(currentDateTime, currentDateTime.plus({ minutes: 5 })),
      )
    }

    // Add resolution message if exists
    if (template.resolution) {
      currentDateTime = currentDateTime.plus({ hours: 1 })
      const resolutionMessage = template.resolution.message(orderNumber)

      db.prepare(
        `INSERT INTO comments (
           ticket_id, body, body_html, is_private, author_type, author_id,
           organization_id, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        ticket.id,
        resolutionMessage,
        resolutionMessage.replace(/\n/g, '<br>'),
        false,
        'user',
        assignee.id,
        options.organizationId,
        randomDate(currentDateTime, currentDateTime.plus({ minutes: 5 })),
        randomDate(currentDateTime, currentDateTime.plus({ minutes: 5 })),
      )

      // Update ticket status if closed
      if (template.resolution.status === 'closed') {
        const closedAt = randomDate(
          currentDateTime,
          currentDateTime.plus({ minutes: 5 }),
        )
        db.prepare(
          `UPDATE tickets 
           SET status = ?, closed_at = ?, updated_at = ?
           WHERE id = ?`,
        ).run('closed', closedAt, closedAt, ticket.id)
      }
    }
  }
}

function seedData(organizationId: number) {
  const endDate = DateTime.fromISO('2025-03-20T00:00:00')
  const startDate = endDate.minus({ months: 2 })

  const options: SeedOptions = {
    organizationId,
    startDate,
    endDate,
  }

  console.log('Starting seed process...')
  console.log('Generating users...')
  const users = generateUsers(options)

  console.log('Generating teams...')
  generateTeams(options, users)

  console.log('Generating contacts...')
  const contacts = generateContacts(options)

  console.log('Generating tickets and comments...')
  generateTickets(options, users, contacts)

  console.log('Seed completed successfully!')
}

// Get organization ID from command line argument
const organizationId = parseInt(process.argv[2])
if (!organizationId) {
  console.error('Please provide an organization ID as a command line argument')
  process.exit(1)
}

seedData(organizationId)
