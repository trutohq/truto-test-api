import { BaseService } from '../services/baseService'
import { User } from '../types'
import { PaginatedResponse } from '../types'
import { createPaginatedResponse, decodeCursor } from '../utils'
import { convertDatesToISO } from '../utils/dates'

type CreateUser = {
  email: string
  name: string
  organization_id: number
  role: 'admin' | 'agent'
}

type UpdateUser = Partial<CreateUser>

type ListUsersOptions = {
  cursor?: string
  limit?: number
  email?: string
  name?: string
  status?: string
  organization_id?: number
}

// Selects a user alongside its organization and directory collections (emails,
// phones, groups). Correlated subqueries are used instead of LEFT JOINs so the
// three collections never multiply into a cartesian product. Each subquery
// returns a JSON array (COALESCEd to '[]' when the user has no rows).
const USER_SELECT = `
  SELECT
    u.*,
    json_object(
      'id', o.id,
      'name', o.name,
      'slug', o.slug,
      'created_at', o.created_at,
      'updated_at', o.updated_at
    ) as organization,
    COALESCE((
      SELECT json_group_array(json_object(
        'id', ue.id,
        'user_id', ue.user_id,
        'email', ue.email,
        'type', ue.type,
        'is_primary', ue.is_primary,
        'created_at', ue.created_at,
        'updated_at', ue.updated_at
      ))
      FROM user_emails ue WHERE ue.user_id = u.id
    ), '[]') as emails,
    COALESCE((
      SELECT json_group_array(json_object(
        'id', up.id,
        'user_id', up.user_id,
        'phone', up.phone,
        'type', up.type,
        'is_primary', up.is_primary,
        'created_at', up.created_at,
        'updated_at', up.updated_at
      ))
      FROM user_phones up WHERE up.user_id = u.id
    ), '[]') as phones,
    COALESCE((
      SELECT json_group_array(json_object(
        'id', t.id,
        'name', t.name,
        'organization_id', t.organization_id,
        'created_at', t.created_at,
        'updated_at', t.updated_at
      ))
      FROM team_members tm
      JOIN teams t ON tm.team_id = t.id
      WHERE tm.user_id = u.id
    ), '[]') as groups
  FROM users u
  JOIN organizations o ON u.organization_id = o.id
`

export class UsersService extends BaseService<User> {
  protected tableName = 'users'
  protected idColumn = 'id'

  create(data: CreateUser): Promise<User> {
    return super.create(data)
  }

  update(id: number, data: UpdateUser): Promise<User | undefined> {
    return super.update(id, data)
  }

  // Parses the JSON-encoded columns and normalizes every datetime to ISO,
  // including those nested inside the organization and each collection item.
  private hydrate(row: any): User {
    const user = this.parseJsonFields<User>(row, [
      'organization',
      'emails',
      'phones',
      'groups',
    ])

    const converted = convertDatesToISO(user)
    if (converted.organization) {
      converted.organization = convertDatesToISO(converted.organization)
    }
    if (converted.emails) {
      converted.emails = converted.emails.map((e) => convertDatesToISO(e))
    }
    if (converted.phones) {
      converted.phones = converted.phones.map((p) => convertDatesToISO(p))
    }
    if (converted.groups) {
      converted.groups = converted.groups.map((g) => convertDatesToISO(g))
    }
    if ('is_2fa_enabled' in converted) {
      converted.is_2fa_enabled = Boolean(converted.is_2fa_enabled)
    }
    return converted
  }

  async getById(id: number): Promise<User | undefined> {
    const row = this.query(`${USER_SELECT} WHERE u.${this.idColumn} = ?`).get(
      id,
    )
    if (!row) return undefined
    return this.hydrate(row)
  }

  async getByEmail(email: string): Promise<User | undefined> {
    const row = this.query(`${USER_SELECT} WHERE u.email = ?`).get(email)
    if (!row) return undefined
    return this.hydrate(row)
  }

  async list({
    cursor,
    limit = 10,
    email,
    name,
    status,
    organization_id,
  }: ListUsersOptions = {}): Promise<PaginatedResponse<User>> {
    const cursorData = cursor ? decodeCursor(cursor) : null
    const conditions: string[] = []
    const params: any[] = []

    if (cursorData) {
      conditions.push(`u.${this.idColumn} > ?`)
      params.push(cursorData.id)
    }

    if (email) {
      conditions.push('u.email LIKE ?')
      params.push(`%${email}%`)
    }

    if (name) {
      conditions.push('u.name LIKE ?')
      params.push(`%${name}%`)
    }

    if (status) {
      conditions.push('u.status = ?')
      params.push(status)
    }

    if (organization_id) {
      conditions.push('u.organization_id = ?')
      params.push(organization_id)
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    params.push(limit + 1)

    const rows = this.query(
      `${USER_SELECT} ${whereClause} ORDER BY u.${this.idColumn} LIMIT ?`,
    ).all(...params)

    const items = rows.map((row) => this.hydrate(row))
    return createPaginatedResponse(items, limit, cursor)
  }
}
