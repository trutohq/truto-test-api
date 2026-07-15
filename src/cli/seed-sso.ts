import { faker } from '@faker-js/faker'
import { DateTime } from 'luxon'
import db from '../config/database'
import { runMigrations } from '../config/migrations'

/**
 * Seeds a deterministic, documented "SSO App Authorizations" fixture on top of
 * the directory users created by `seed-directory`, so customers can develop
 * against the Unified Single Sign-On API (apps / app_users) without a real
 * Google Workspace tenant.
 *
 * Models Google Admin SDK's tokens.list: each row is one third-party OAuth app a
 * directory user has authorized — its client id, display name, granted scopes,
 * native / anonymous flags and the owning user.
 *
 * Deterministic: which apps a user has, and how many, are derived purely from
 * that user's ordinal position among the directory users (faker is seeded and
 * only used for timestamps; no Math.random), so a given organization always gets
 * the same logical grants. Idempotent: only grants owned by this org's directory
 * users (@trutotest.dev) are cleared and re-created — the org admin, ticketing
 * data and any unrelated rows are never touched.
 *
 * Prerequisite: run `seed-directory <organizationId>` first.
 * Usage: bun run seed-sso <organizationId>
 */

const FAKER_SEED = 20240701
const EMAIL_DOMAIN = 'trutotest.dev'

const SQLITE_FORMAT = 'yyyy-MM-dd HH:mm:ss'
// Authorizations happen after users are created (see seed-directory's window).
const WINDOW_FROM = DateTime.fromISO('2023-06-01T00:00:00Z').toJSDate()
const WINDOW_TO = DateTime.fromISO('2024-12-31T00:00:00Z').toJSDate()

function toSqlite(date: Date): string {
  return DateTime.fromJSDate(date, { zone: 'utc' }).toFormat(SQLITE_FORMAT)
}

// Deterministic timestamp (faker is seeded).
function seededTimestamp(): string {
  return toSqlite(faker.date.between({ from: WINDOW_FROM, to: WINDOW_TO }))
}

interface CatalogApp {
  client_id: string
  display_name: string
  scopes: string[]
  is_native: boolean
  is_anonymous: boolean
}

// A small, fixed catalog of synthetic third-party apps. Stable client ids,
// display names and scopes so the fixture (and its docs) never drift between
// runs. Includes native and anonymous edge cases (Legacy VPN Agent is both).
const APP_CATALOG: CatalogApp[] = [
  {
    client_id: 'calendar-sync.apps.trutotest.dev',
    display_name: 'Calendar Sync',
    scopes: ['calendar.readonly', 'calendar.events'],
    is_native: false,
    is_anonymous: false,
  },
  {
    client_id: 'drive-auditor.apps.trutotest.dev',
    display_name: 'Drive Auditor',
    scopes: ['drive.readonly', 'drive.metadata.readonly'],
    is_native: false,
    is_anonymous: false,
  },
  {
    client_id: 'ai-meeting-notes.apps.trutotest.dev',
    display_name: 'AI Meeting Notes',
    scopes: ['calendar.readonly', 'meetings.record', 'userinfo.email'],
    is_native: false,
    is_anonymous: false,
  },
  {
    client_id: 'mobile-mail-client.apps.trutotest.dev',
    display_name: 'Mobile Mail Client',
    scopes: ['mail.readonly', 'mail.send', 'contacts.readonly'],
    is_native: true,
    is_anonymous: false,
  },
  {
    client_id: 'expense-exporter.apps.trutotest.dev',
    display_name: 'Expense Exporter',
    scopes: ['spreadsheets', 'drive.file'],
    is_native: false,
    is_anonymous: false,
  },
  {
    client_id: 'slack-for-workspace.apps.trutotest.dev',
    display_name: 'Slack for Workspace',
    scopes: ['userinfo.email', 'userinfo.profile'],
    is_native: false,
    is_anonymous: false,
  },
  {
    client_id: 'zoom-scheduler.apps.trutotest.dev',
    display_name: 'Zoom Scheduler',
    scopes: ['calendar.events', 'userinfo.email'],
    is_native: false,
    is_anonymous: false,
  },
  {
    client_id: 'legacy-vpn-agent.apps.trutotest.dev',
    display_name: 'Legacy VPN Agent',
    scopes: ['userinfo.email'],
    is_native: true,
    is_anonymous: true,
  },
]

const N = APP_CATALOG.length

// Users (by ordinal position among the org's directory users) that have
// authorized no apps at all — an explicit empty-collection edge case.
const NO_APP_INDICES = new Set([5, 23])

// Deterministic per-user app selection: a stable count (1–4) and a contiguous
// window into the catalog, both derived from the user's ordinal position. The
// window start also cycles through every catalog index, so every app — including
// the native-only and anonymous entries — is authorized by at least one user.
// No Math.random, so re-running the seeder reproduces exactly the same grants.
function appsForIndex(i: number): CatalogApp[] {
  if (NO_APP_INDICES.has(i)) return []
  const count = 1 + (i % 4)
  const start = i % N
  const apps: CatalogApp[] = []
  for (let k = 0; k < count; k++) {
    apps.push(APP_CATALOG[(start + k) % N])
  }
  return apps
}

interface DirectoryUser {
  id: number
  email: string
  username: string | null
}

function organizationExists(organizationId: number): boolean {
  const row = db
    .query('SELECT id FROM organizations WHERE id = ?')
    .get(organizationId)
  return !!row
}

function seedSso(organizationId: number) {
  runMigrations()

  if (!organizationExists(organizationId)) {
    console.error(
      `Organization ${organizationId} does not exist. Create one first, e.g.\n` +
        `  bun run create-org "Truto Test Org" truto-test admin@truto.test "Admin User" admin`,
    )
    process.exit(1)
  }

  // The SSO fixture is tied to the directory users, so it depends on the
  // directory seed having run. Ordering by id gives a stable ordinal position.
  const users = db
    .query(
      `SELECT id, email, username FROM users
       WHERE organization_id = ? AND email LIKE ?
       ORDER BY id`,
    )
    .all(organizationId, `%@${EMAIL_DOMAIN}`) as DirectoryUser[]

  if (users.length === 0) {
    console.error(
      `No directory users found for organization ${organizationId}. Seed the directory first:\n` +
        `  bun run seed-directory ${organizationId}`,
    )
    process.exit(1)
  }

  faker.seed(FAKER_SEED)

  const summary = {
    grants: 0,
    usersWithApps: 0,
    usersWithoutApps: 0,
    nativeGrants: 0,
    anonymousGrants: 0,
  }
  const perAppUserCounts = new Map<string, number>()

  db.transaction(() => {
    // --- Idempotency: remove only grants owned by this org's directory users ---
    // sso_apps is a table of its own, so this never touches ticketing data.
    const userIds = users.map((u) => u.id)
    const placeholders = userIds.map(() => '?').join(', ')
    db.query(`DELETE FROM sso_apps WHERE user_id IN (${placeholders})`).run(
      ...userIds,
    )

    // --- Grants ---------------------------------------------------------------
    users.forEach((user, i) => {
      const apps = appsForIndex(i)
      if (apps.length === 0) {
        summary.usersWithoutApps++
        return
      }
      summary.usersWithApps++
      for (const app of apps) {
        const createdAt = seededTimestamp()
        db.prepare(
          `INSERT INTO sso_apps
             (organization_id, user_id, client_id, display_name, scopes,
              is_native, is_anonymous, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          organizationId,
          user.id,
          app.client_id,
          app.display_name,
          JSON.stringify(app.scopes),
          app.is_native ? 1 : 0,
          app.is_anonymous ? 1 : 0,
          createdAt,
          createdAt,
        )
        summary.grants++
        if (app.is_native) summary.nativeGrants++
        if (app.is_anonymous) summary.anonymousGrants++
        perAppUserCounts.set(
          app.display_name,
          (perAppUserCounts.get(app.display_name) || 0) + 1,
        )
      }
    })
  })()

  console.log('SSO app authorizations fixture seeded successfully.\n')
  console.log(`  Organization     : ${organizationId}`)
  console.log(`  Directory users  : ${users.length}`)
  console.log(`  Users with apps  : ${summary.usersWithApps}`)
  console.log(`  Users w/o apps   : ${summary.usersWithoutApps} (edge case)`)
  console.log(`  Total grants     : ${summary.grants}`)
  console.log(`  Native grants    : ${summary.nativeGrants}`)
  console.log(`  Anonymous grants : ${summary.anonymousGrants}`)
  console.log(`  Distinct apps    : ${APP_CATALOG.length}`)
  console.log('\n  Grants per app:')
  for (const app of APP_CATALOG) {
    console.log(
      `    ${app.display_name.padEnd(20)} ${
        perAppUserCounts.get(app.display_name) || 0
      } user(s)`,
    )
  }
  console.log(
    `\nList them with the org's API key:\n` +
      `  GET /sso-apps                     (all synthetic authorized apps)\n` +
      `  GET /sso-apps?user_id=<userId>    (one user's authorized apps)\n`,
  )
}

const organizationId = parseInt(process.argv[2])
if (!organizationId) {
  console.error('Please provide an organization ID as a command line argument')
  console.error('Usage: bun run seed-sso <organizationId>')
  process.exit(1)
}

seedSso(organizationId)
