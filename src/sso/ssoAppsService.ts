import { BaseService } from '../services/baseService'
import { SsoApp, PaginatedResponse } from '../types'
import { createPaginatedResponse, decodeCursor } from '../utils'
import { convertDatesToISO } from '../utils/dates'

type ListSsoAppsOptions = {
  cursor?: string
  limit?: number
  organization_id?: number
  user_id?: number
  client_id?: string
}

/**
 * Reads the synthetic SSO app authorization fixture (see `seed-sso`). Each row is
 * one third-party OAuth app a directory user has authorized, mirroring a Google
 * Admin SDK token. Backs the native `/sso-apps` endpoints which Truto maps into
 * the Unified Single Sign-On `apps` resource.
 */
export class SsoAppsService extends BaseService<SsoApp> {
  protected tableName = 'sso_apps'
  protected idColumn = 'id'

  // SQLite stores `scopes` as a JSON string and the two flags as 0/1 — normalize
  // both, then convert timestamps to ISO (mirrors UsersService.hydrate).
  private hydrate(row: any): SsoApp {
    const app = { ...row }
    app.scopes =
      typeof app.scopes === 'string'
        ? JSON.parse(app.scopes || '[]')
        : (app.scopes ?? [])
    app.is_native = Boolean(app.is_native)
    app.is_anonymous = Boolean(app.is_anonymous)
    return convertDatesToISO(app)
  }

  async getById(id: number): Promise<SsoApp | undefined> {
    const row = this.query(
      `SELECT * FROM ${this.tableName} WHERE ${this.idColumn} = ?`,
    ).get(id)
    if (!row) return undefined
    return this.hydrate(row)
  }

  async list({
    cursor,
    limit = 10,
    organization_id,
    user_id,
    client_id,
  }: ListSsoAppsOptions = {}): Promise<PaginatedResponse<SsoApp>> {
    const cursorData = cursor ? decodeCursor(cursor) : null
    const conditions: string[] = []
    const params: any[] = []

    if (cursorData) {
      conditions.push(`${this.idColumn} > ?`)
      params.push(cursorData.id)
    }

    if (organization_id) {
      conditions.push('organization_id = ?')
      params.push(organization_id)
    }

    // Filter to a single user's authorized apps — the equivalent of Google's
    // per-user tokens.list, and how Unified SSO `apps` routes `user_id`.
    if (user_id) {
      conditions.push('user_id = ?')
      params.push(user_id)
    }

    if (client_id) {
      conditions.push('client_id = ?')
      params.push(client_id)
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    params.push(limit + 1)

    const rows = this.query(
      `SELECT * FROM ${this.tableName} ${whereClause} ORDER BY ${this.idColumn} LIMIT ?`,
    ).all(...params)

    const items = rows.map((row) => this.hydrate(row))
    return createPaginatedResponse(items, limit, cursor)
  }
}
