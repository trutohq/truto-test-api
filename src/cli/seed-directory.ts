import { faker } from '@faker-js/faker'
import { DateTime } from 'luxon'
import db from '../config/database'
import { runMigrations } from '../config/migrations'
import { UserStatus } from '../types'

/**
 * Seeds a deterministic, documented "User Directory" fixture into an existing
 * organization so customers can develop against the Unified User Directory API
 * without a real Google Workspace / Microsoft 365 tenant.
 *
 * Deterministic: faker is seeded and no Math.random is used, so the same
 * organization always gets the same logical set of users, groups and edge cases
 * (row ids may differ between runs). Idempotent: only rows this seeder owns
 * (users on the @trutotest.dev domain and the known group names) are cleared and
 * re-created — the organization's admin account and any ticketing seed data are
 * left untouched.
 *
 * Usage: bun run seed-directory <organizationId>
 */

const FAKER_SEED = 20240701
const EMAIL_DOMAIN = 'trutotest.dev'
const DIRECTORY_USER_COUNT = 36

const GROUP_NAMES = [
  'Engineering',
  'Product',
  'Sales',
  'Customer Support',
  'People Ops',
  'Leadership',
] as const

const TITLES = [
  'Software Engineer',
  'Senior Software Engineer',
  'Staff Engineer',
  'Engineering Manager',
  'Product Manager',
  'Product Designer',
  'Account Executive',
  'Sales Development Representative',
  'Customer Support Specialist',
  'Customer Support Lead',
  'People Operations Partner',
  'Technical Recruiter',
  'VP of Engineering',
  'Chief Technology Officer',
]

// Explicit edge-case indices so customers reliably hit these shapes.
const NO_GROUP_INDICES = new Set([5, 23]) // users that belong to no group
const NO_PHONE_INDICES = new Set([9, 27]) // users with an empty phones array
const NO_TITLE_INDICES = new Set([7, 15]) // users with no title

const SQLITE_FORMAT = 'yyyy-MM-dd HH:mm:ss'
const WINDOW_FROM = DateTime.fromISO('2023-01-01T00:00:00Z').toJSDate()
const WINDOW_TO = DateTime.fromISO('2024-12-31T00:00:00Z').toJSDate()

function toSqlite(date: Date): string {
  return DateTime.fromJSDate(date, { zone: 'utc' }).toFormat(SQLITE_FORMAT)
}

// Deterministic timestamp (faker is seeded).
function seededTimestamp(): string {
  return toSqlite(faker.date.between({ from: WINDOW_FROM, to: WINDOW_TO }))
}

function statusForIndex(i: number): UserStatus {
  // 28 active, 4 inactive, 2 invited, 2 deleted (for DIRECTORY_USER_COUNT = 36).
  if (i >= 34) return 'deleted'
  if (i >= 32) return 'invited'
  if (i >= 28) return 'inactive'
  return 'active'
}

function is2faEnabledForIndex(): boolean {
  // Seeded faker → reproducible ~50/50 mix across runs, not a fixed even/odd pattern.
  return faker.datatype.boolean()
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '')
}

function organizationExists(organizationId: number): boolean {
  const row = db
    .query('SELECT id FROM organizations WHERE id = ?')
    .get(organizationId)
  return !!row
}

interface SeededGroup {
  id: number
  name: string
}

function seedDirectory(organizationId: number) {
  runMigrations()

  if (!organizationExists(organizationId)) {
    console.error(
      `Organization ${organizationId} does not exist. Create one first, e.g.\n` +
        `  bun run create-org "Truto Test Org" truto-test admin@truto.test "Admin User" admin`,
    )
    process.exit(1)
  }

  faker.seed(FAKER_SEED)

  const summary = {
    users: 0,
    byStatus: { active: 0, inactive: 0, invited: 0, deleted: 0 } as Record<
      UserStatus,
      number
    >,
    withMultipleEmails: 0,
    withoutPhone: 0,
    withoutGroup: 0,
    admins: 0,
    with2fa: 0,
  }

  db.transaction(() => {
    // --- Idempotency: remove only the rows this seeder owns ------------------
    // Deleting the users cascades to user_emails, user_phones, team_members and
    // api_keys. The org admin (a different email domain) is never touched.
    db.query(
      'DELETE FROM users WHERE organization_id = ? AND email LIKE ?',
    ).run(organizationId, `%@${EMAIL_DOMAIN}`)
    const groupPlaceholders = GROUP_NAMES.map(() => '?').join(', ')
    db.query(
      `DELETE FROM teams WHERE organization_id = ? AND name IN (${groupPlaceholders})`,
    ).run(organizationId, ...GROUP_NAMES)

    // --- Groups (surfaced as directory groups via /teams) --------------------
    const groups: Record<string, SeededGroup> = {}
    for (const name of GROUP_NAMES) {
      const createdAt = seededTimestamp()
      const row = db
        .prepare(
          `INSERT INTO teams (name, organization_id, created_at, updated_at)
           VALUES (?, ?, ?, ?)
           RETURNING id, name`,
        )
        .get(name, organizationId, createdAt, createdAt) as SeededGroup
      groups[name] = row
    }

    // --- Users ---------------------------------------------------------------
    const usedEmails = new Set<string>()

    for (let i = 0; i < DIRECTORY_USER_COUNT; i++) {
      const firstName = faker.person.firstName()
      const lastName = faker.person.lastName()
      const name = `${firstName} ${lastName}`
      const username = `${slugify(firstName)}.${slugify(lastName)}`

      // Globally-unique primary email (users.email is UNIQUE across the table).
      let localPart = username
      let attempt = 1
      while (usedEmails.has(`${localPart}@${EMAIL_DOMAIN}`)) {
        localPart = `${username}${attempt++}`
      }
      const primaryEmail = `${localPart}@${EMAIL_DOMAIN}`
      usedEmails.add(primaryEmail)

      const status = statusForIndex(i)
      const isAdmin = i % 12 === 0
      const role: 'admin' | 'agent' = isAdmin ? 'admin' : 'agent'
      const title = NO_TITLE_INDICES.has(i) ? null : TITLES[i % TITLES.length]
      const is2faEnabled = is2faEnabledForIndex()
      const createdAt = seededTimestamp()

      const user = db
        .prepare(
          `INSERT INTO users
             (email, name, first_name, last_name, username, title, status,
              is_2fa_enabled, organization_id, role, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING id`,
        )
        .get(
          primaryEmail,
          name,
          firstName,
          lastName,
          username,
          title,
          status,
          is2faEnabled ? 1 : 0,
          organizationId,
          role,
          createdAt,
          createdAt,
        ) as { id: number }

      // Emails: primary always, plus a personal alias for every 5th user.
      db.prepare(
        `INSERT INTO user_emails (user_id, email, type, is_primary, created_at, updated_at)
         VALUES (?, ?, 'work', 1, ?, ?)`,
      ).run(user.id, primaryEmail, createdAt, createdAt)

      let emailCount = 1
      if (i % 5 === 0) {
        const alias = `${localPart}@personal.example`
        db.prepare(
          `INSERT INTO user_emails (user_id, email, type, is_primary, created_at, updated_at)
           VALUES (?, ?, 'home', 0, ?, ?)`,
        ).run(user.id, alias, createdAt, createdAt)
        emailCount++
      }

      // Phones: a work phone for most, plus a mobile for every 4th user; a few
      // users have no phone at all.
      let hasPhone = false
      if (!NO_PHONE_INDICES.has(i)) {
        db.prepare(
          `INSERT INTO user_phones (user_id, phone, type, is_primary, created_at, updated_at)
           VALUES (?, ?, 'work', 1, ?, ?)`,
        ).run(user.id, faker.phone.number(), createdAt, createdAt)
        hasPhone = true
        if (i % 4 === 0) {
          db.prepare(
            `INSERT INTO user_phones (user_id, phone, type, is_primary, created_at, updated_at)
             VALUES (?, ?, 'mobile', 0, ?, ?)`,
          ).run(user.id, faker.phone.number(), createdAt, createdAt)
        }
      }

      // Group membership: a primary group for everyone, a second group for
      // every 3rd user, and Leadership for admins; a couple of users belong to
      // no group at all.
      const memberOf = new Set<string>()
      if (!NO_GROUP_INDICES.has(i)) {
        memberOf.add(GROUP_NAMES[i % GROUP_NAMES.length])
        if (i % 3 === 0) {
          memberOf.add(GROUP_NAMES[(i + 2) % GROUP_NAMES.length])
        }
        if (isAdmin) memberOf.add('Leadership')
      }
      for (const groupName of memberOf) {
        db.prepare(
          `INSERT INTO team_members (team_id, user_id, created_at, updated_at)
           VALUES (?, ?, ?, ?)`,
        ).run(groups[groupName].id, user.id, createdAt, createdAt)
      }

      summary.users++
      summary.byStatus[status]++
      if (emailCount > 1) summary.withMultipleEmails++
      if (!hasPhone) summary.withoutPhone++
      if (memberOf.size === 0) summary.withoutGroup++
      if (isAdmin) summary.admins++
      if (is2faEnabled) summary.with2fa++
    }
  })()

  console.log('Directory fixture seeded successfully.\n')
  console.log(`  Organization : ${organizationId}`)
  console.log(`  Users        : ${summary.users}`)
  console.log(
    `  By status    : ${summary.byStatus.active} active, ` +
      `${summary.byStatus.inactive} inactive, ` +
      `${summary.byStatus.invited} invited, ` +
      `${summary.byStatus.deleted} deleted`,
  )
  console.log(`  Admins       : ${summary.admins}`)
  console.log(
    `  Groups       : ${GROUP_NAMES.length} (${GROUP_NAMES.join(', ')})`,
  )
  console.log(
    `  2FA enabled  : ${summary.with2fa} users (${summary.users - summary.with2fa} without)`,
  )
  console.log(`  Multi-email  : ${summary.withMultipleEmails} users`)
  console.log(`  No phone     : ${summary.withoutPhone} users (edge case)`)
  console.log(`  No group     : ${summary.withoutGroup} users (edge case)`)
  console.log(
    `\nList them with the org's API key:\n` +
      `  GET /users            (paginated: ${DIRECTORY_USER_COUNT} directory users + the org admin)\n` +
      `  GET /users?status=inactive\n`,
  )
}

const organizationId = parseInt(process.argv[2])
if (!organizationId) {
  console.error('Please provide an organization ID as a command line argument')
  console.error('Usage: bun run seed-directory <organizationId>')
  process.exit(1)
}

seedDirectory(organizationId)
