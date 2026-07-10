# Truto Sandbox REST API

A synthetic third-party API used by the Truto team (and Truto customers) to test
integrations and unified APIs without a real provider. It serves two purposes:

- **Ticketing sandbox** — organizations, agents, teams, contacts, tickets,
  comments, attachments.
- **User Directory fixture** — realistic, GWS/M365-style directory users
  (statuses, multiple emails/phones, group membership) so customers can build
  and test **Unified User Directory** user-pull flows without a Google Workspace
  or Microsoft 365 tenant. See [User Directory Testing](#user-directory-testing-via-trutos-unified-api).

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
