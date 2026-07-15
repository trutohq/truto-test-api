# Truto Sandbox REST API

A synthetic third-party API used by the Truto team (and Truto customers) to test
integrations and unified APIs without a real provider. It serves two purposes:

- **Ticketing sandbox** — organizations, agents, teams, contacts, tickets,
  comments, attachments.
- **User Directory fixture** — realistic, GWS/M365-style directory users
  (statuses, multiple emails/phones, group membership) so customers can build
  and test **Unified User Directory** user-pull flows without a Google Workspace
  or Microsoft 365 tenant. See [User Directory Testing](#user-directory-testing-via-trutos-unified-api).
- **SSO app authorization fixture** — deterministic third-party OAuth app grants
  (client id, display name, scopes, native / anonymous flags) tied to directory
  users, so customers can build and test the **Unified Single Sign-On** API
  (`apps` / `app_users`) without a Google Workspace tenant. See
  [SSO App Authorization Testing](#sso-app-authorization-testing-via-trutos-unified-single-sign-on-api).

Built using Bun.sh and Hono.dev.

To install dependencies:

```sh
bun install
```

To run:

```sh
bun run dev
```

open http://localhost:3000

To run migration:

```sh
bun run migrate
```

To create the first org

```sh
bun run create-org
```

To seed ticketing data into the org

```sh
bun run seed-data <organizationId>
```

To seed a deterministic **User Directory** fixture into the org (see
[User Directory Testing](#user-directory-testing-via-trutos-unified-api))

```sh
bun run seed-directory <organizationId>
```

To seed a deterministic **SSO App Authorizations** fixture (run _after_
`seed-directory`; see
[SSO App Authorization Testing](#sso-app-authorization-testing-via-trutos-unified-single-sign-on-api))

```sh
bun run seed-sso <organizationId>
```

## Structure

So this is going to be a very simple REST API for a ticketing system. The main purpose of this API is to be used by the Truto team for testing out their integrations and unified APIs.

### Entities

We can have the following entities in the ticketing system

- organizations, top level entity including everything
- users, are members of an org. They double as ticketing agents (`role`:
  `admin` | `agent`) and as **directory users** (with `first_name`, `last_name`,
  `status`, `title`, `username`, multiple `emails`/`phones` and group membership)
- teams, are groups of users. They are also surfaced as directory **groups**
- contacts, are end users raising tickets
- tickets, are tasks or issues raised by contacts.
- comments, can be outgoing and internal both on tickets.
- attachments, can be added to tickets and comments.

We can use bun.sh SQLite module documented here - https://bun.sh/docs/api/sqlite for persistent storage.

Give a CLI command to create an org and its first user.

### Authentication

API Key based authentication

Give a CLI command to create an API key for a user.

### Authorization

Bearer token based authorization. Pass the x-api-key header.

### Rate limit

Rate limit the API calls to 5 per second. Use x-ratelimit-limit, x-ratelimit-remaining, and x-ratelimit-reset (number of seconds) and add retry-after header.

The rate limit is enforced on an API key level.

### Pagination

The pagination will be cursor based and the response format will be

{
"data": [
{
"id": 1
},
...
],
next_cursor: "" // base64encoded
prev_cursor: "" // base64encoded
}

### Response format

For list, the response is shown above with pagination. For other CRUD methods, its just a JSON object

### Methods

Every entity will have CRUD endpoints,

GET /entity - List
GET /entity/:id - Single record
POST /entity - Create
PATCH /entity/:id - Update record
DELETE /entity/:id - Delete record

POST /entity/:custom-method-name - Custom methods if required.

## User Directory Testing (via Truto's Unified API)

This connector doubles as a **User Directory test fixture**. Connect it through
Truto as the `trutotest` integration and pull synthetic directory users via the
**Unified User Directory API** — no Google Workspace or Microsoft 365 tenant
required.

### 1. Connect `trutotest` in your Truto environment

`trutotest` is a shared integration (self-serve install). In Truto:

1. Install the **Truto Test** (`trutotest`) integration in your environment.
2. Create an integrated account using an **API key** from this mock API (see
   below for how to get one).

### 2. Get an API key

Against the hosted API (`https://truto-test-api.truto.one`) or a local instance:

```sh
# Create an org + its first admin user; this prints an API key
bun run create-org "Acme Directory" acme-directory admin@acme.test "Admin User" admin

# (optional) mint another key for an existing user
bun run create-api-key admin@acme.test
```

Authenticate every request with the `x-api-key` header.

### 3. Seed the directory fixture

```sh
bun run seed-directory <organizationId>
```

This is **deterministic** and **idempotent** — it seeds the same logical dataset
every time and only touches rows it owns (users on the `@trutotest.dev` domain
and the known group names), so it never disturbs your admin account or any
ticketing data. Re-running it refreshes the fixture in place.

### 4. Pull users via the Unified User Directory API

```
GET /unified/user-directory/users?integrated_account_id=<account_id>
GET /unified/user-directory/users/<id>?integrated_account_id=<account_id>
GET /unified/user-directory/groups?integrated_account_id=<account_id>
GET /unified/user-directory/organizations?integrated_account_id=<account_id>
```

Page through the full list with `next_cursor` until it is empty.

### What data to expect

`seed-directory` creates **36 directory users** (plus the org admin) in one
organization:

| Aspect          | Detail                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Statuses        | 28 `active`, 4 `inactive`, 2 `invited`, 2 `deleted` (all four unified enum values)                                         |
| Groups          | 6 groups: Engineering, Product, Sales, Customer Support, People Ops, Leadership                                            |
| Membership      | most users in 1–2 groups; admins also in Leadership; **2 users in no group**                                               |
| Emails          | every user has a primary work email (`{org-slug}.{username}@trutotest.dev`); ~8 users also have a secondary personal email |
| Phones          | most users have a work phone (some also a mobile); **2 users have no phone**                                               |
| Optional fields | **2 users have no title** (empty-optional edge case)                                                                       |
| 2FA             | ~50/50 `is_2fa_enabled` true/false via seeded faker (reproducible across runs, not a fixed even/odd pattern)               |
| Pagination      | 36 directory users + any pre-existing org members (e.g. the org admin)                                                     |

The mapped unified `users` object includes `id`, `first_name`, `last_name`,
`name`, `username`, `title`, `status`, `is_2fa_enabled`, `emails[]` (`{ email, type, is_primary }`),
`phones[]` (`{ number, type }`), `roles[]`, `organizations[]`, `groups[]`
(`{ id, name, organization }`), `created_at` and `updated_at`.

### Native endpoints behind the mapping

| Unified resource               | Native endpoint                                |
| ------------------------------ | ---------------------------------------------- |
| `user-directory/users` (list)  | `GET /users`                                   |
| `user-directory/users` (get)   | `GET /users/:id`                               |
| `user-directory/groups`        | `GET /teams`, `GET /teams/:id`                 |
| `user-directory/organizations` | `GET /organizations`, `GET /organizations/:id` |
| `me`                           | `GET /users/me`                                |

`GET /users` also supports a `status` filter, e.g. `GET /users?status=inactive`.

### Limitations vs real GWS / M365

- **Auth is API-key only** — no OAuth, SSO, SCIM or admin-consent flows.
- Not simulated: licenses, workspaces, activities/audit logs, email verification,
  avatars, org hierarchy, custom schemas/attributes,
  delta/incremental sync tokens.
- `role` is ticketing-shaped (`admin`/`agent`) and mapped straight into the
  unified `roles[]` — it is not a rich directory role model.
- Data is synthetic and stable; it does not change unless you re-seed.
- Single organization per fixture (no multi-tenant / cross-org directories).

## SSO App Authorization Testing (via Truto's Unified Single Sign-On API)

On top of the directory users, this connector seeds a deterministic **SSO app
authorization** fixture — the synthetic equivalent of Google Workspace's Admin
SDK **tokens** API (the third-party OAuth apps each user has authorized against
their account). Truto maps it into the **Unified Single Sign-On API** so
customers can build and test `apps` / `app_users` pulls without a real Google
Workspace tenant.

### 1. Seed the fixture

The SSO fixture is tied to the directory users, so seed the directory first:

```sh
bun run seed-directory <organizationId>
bun run seed-sso <organizationId>
```

`seed-sso` is **deterministic** and **idempotent** — which apps a user has (and
how many) are derived purely from that user's ordinal position among the
directory users, so it seeds the same logical grants every time. It only clears
and re-creates grants owned by this org's directory users (`@trutotest.dev`), so
it never disturbs the org admin or any ticketing / directory data. Re-running it
refreshes the fixture in place.

### 2. What data to expect

`seed-sso` authorizes apps from a fixed catalog of **8 synthetic third-party
apps** across the org's **36 directory users** (84 grants in the reference
fixture):

| App                 | Scopes                                             | Native  | Anonymous |
| ------------------- | -------------------------------------------------- | ------- | --------- |
| Calendar Sync       | calendar.readonly, calendar.events                 | no      | no        |
| Drive Auditor       | drive.readonly, drive.metadata.readonly            | no      | no        |
| AI Meeting Notes    | calendar.readonly, meetings.record, userinfo.email | no      | no        |
| Mobile Mail Client  | mail.readonly, mail.send, contacts.readonly        | **yes** | no        |
| Expense Exporter    | spreadsheets, drive.file                           | no      | no        |
| Slack for Workspace | userinfo.email, userinfo.profile                   | no      | no        |
| Zoom Scheduler      | calendar.events, userinfo.email                    | no      | no        |
| Legacy VPN Agent    | userinfo.email                                     | **yes** | **yes**   |

| Aspect     | Detail                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------- |
| Grants     | 84 total across 34 users (~2.5 apps/user)                                                           |
| No apps    | **2 users have authorized no apps** (empty-collection edge case)                                    |
| Native     | 17 native grants (Mobile Mail Client + Legacy VPN Agent)                                            |
| Anonymous  | 7 anonymous grants (Legacy VPN Agent — the one app that is native _and_ anonymous)                  |
| Assignment | user _n_ (0-indexed by id) gets `1 + (n % 4)` apps: a contiguous catalog window starting at `n % 8` |
| Uniqueness | a user authorizes a given app at most once (`UNIQUE(user_id, client_id)`)                           |

Each grant carries `client_id`, `display_name`, `scopes[]`, `is_native`,
`is_anonymous`, the owning `user_id`, and timestamps — enough to answer _which
apps a user has authorized, each app's client id / display name, what scopes were
granted, whether it is native, whether it is anonymous, and who the grant belongs
to._ For example, the user at ordinal position 0 authorizes **Calendar Sync**;
the user at position 3 authorizes **Mobile Mail Client, Expense Exporter, Slack
for Workspace, Zoom Scheduler**.

### 3. Pull SSO apps via the Unified Single Sign-On API

```
# apps a specific user has authorized (user_id is required, like Google's userKey)
GET /unified/sso/apps?integrated_account_id=<account_id>&user_id=<userId>

# the users an app can be assigned to (backed by the directory users)
GET /unified/sso/app_users?integrated_account_id=<account_id>
GET /unified/sso/app_users/<id>?integrated_account_id=<account_id>
```

### Native endpoints behind the mapping

| Unified resource       | Native endpoint              | Notes                                             |
| ---------------------- | ---------------------------- | ------------------------------------------------- |
| `sso/apps` (list)      | `GET /sso-apps?user_id=<id>` | `user_id` → native `user_id` (≈ Google `userKey`) |
| `sso/app_users` (list) | `GET /users`                 | reuses the directory users endpoint               |
| `sso/app_users` (get)  | `GET /users/:id`             | reuses the directory user endpoint                |

`GET /sso-apps` also lists **all** grants (no filter), supports a `client_id`
filter, and exposes a single-grant `GET /sso-apps/:id`, for direct proxy testing.

### How it maps to Unified SSO (vs real Google)

- Google maps its Admin SDK `tokens.list` (a user's authorized apps) into Unified
  SSO `apps`, and backs `app_users` with the directory `users` list. This
  connector mirrors that exactly: `apps` ← `/sso-apps`, `app_users` ← `/users`.
- The Unified `apps` object exposes `id` (the app's client id), `name` /
  `display_name` and `status`; the granted `scopes`, `is_native`, `is_anonymous`
  and owning `user_id` are preserved on the raw record (`remote_data`), just as
  Google surfaces `scopes` / `nativeApp` / `anonymous` there.
- `apps` is scoped to a single user via `user_id` (Google requires `userKey`);
  `app_users` pages through the directory exactly like Unified User Directory
  `users`.

### Limitations vs real GWS / M365

- The fixture models **app authorizations** (OAuth grants), not SSO **sign-in**
  configuration — there are no SAML/OIDC connections, IdP metadata or sign-on
  modes.
- `apps` are per-user grants (as in Google's tokens API), not a global registry
  of SAML/OIDC apps; the same app appears once per authorizing user.
- Native / anonymous flags and scopes are synthetic and stable; they do not
  change unless you re-seed.
