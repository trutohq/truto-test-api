# Truto Ticketing Sandbox REST API

Built using Bun.sh and Hono.dev. And entirely using Cursor.

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

To seed data into the org

```sh
bun run seed-data
```

## Structure

So this is going to be a very simple REST API for a ticketing system. The main purpose of this API is to be used by the Truto team for testing out their integrations and unified APIs.

### Entities

We can have the following entities in the ticketing system

- organizations, top level entity including everything
- users, are agents or team members part of an org working on tickets
- teams, are groups of agents
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
