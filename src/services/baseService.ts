import { Database } from 'bun:sqlite'
import { BaseEntity, PaginatedResponse } from '../types'
import { createPaginatedResponse, decodeCursor } from '../utils'
import { convertDatesToISO, convertDatesToSQLite } from '../utils/dates'

export type BaseListOptions = {
  cursor?: string
  limit?: number
}

export abstract class BaseService<T extends BaseEntity> {
  protected abstract tableName: string
  protected idColumn = 'id'
  protected db: Database

  constructor(db: Database) {
    this.db = db
  }

  protected query(sql: string) {
    return this.db.query(sql)
  }

  protected parseJsonFields<T>(row: any, fields: string[]): T {
    if (!row) return row as T
    const result = { ...row }
    fields.forEach((field) => {
      if (result[field]) {
        result[field] = JSON.parse(result[field])
      }
    })
    return result as T
  }

  async list({ cursor, limit = 10 }: BaseListOptions = {}): Promise<
    PaginatedResponse<T>
  > {
    const cursorData = cursor ? decodeCursor(cursor) : null
    const whereClause = cursorData ? `WHERE ${this.idColumn} > ?` : ''
    const params = cursorData ? [cursorData.id, limit + 1] : [limit + 1]

    const items = this.query(
      `
      SELECT * FROM ${this.tableName} 
      ${whereClause}
      ORDER BY ${this.idColumn}
      LIMIT ?
    `,
    ).all(...params) as unknown[]

    // Convert dates to ISO format
    const convertedItems = items.map((item) => convertDatesToISO(item as T))
    return createPaginatedResponse(convertedItems as T[], limit, cursor)
  }

  async getById(id: number): Promise<T | undefined> {
    const item = this.db
      .query(`SELECT * FROM ${this.tableName} WHERE ${this.idColumn} = ?`)
      .get(id) as T | undefined
    return item ? convertDatesToISO(item) : undefined
  }

  async create(data: Partial<T>): Promise<T> {
    // Convert dates to SQLite format before creating
    const sqliteData = convertDatesToSQLite(data)
    const id = await this.createRecord(sqliteData)
    const item = await this.getById(id)
    if (!item) {
      throw new Error(`Failed to create ${this.tableName}`)
    }
    return item
  }

  async update(id: number, data: Partial<T>): Promise<T | undefined> {
    // Convert dates to SQLite format before updating
    const sqliteData = convertDatesToSQLite(data)
    const updatedId = await this.updateRecord(id, sqliteData)
    if (!updatedId) {
      return undefined
    }
    return this.getById(updatedId)
  }

  protected async createRecord(data: Partial<T>): Promise<number> {
    const columns = Object.keys(data)
    const values = Object.values(data)
    const placeholders = values.map(() => '?').join(', ')

    const result = this.db
      .query(
        `
      INSERT INTO ${this.tableName} (${columns.join(', ')})
      VALUES (${placeholders})
      RETURNING id
    `,
      )
      .get(...values) as { id: number }

    if (!result) {
      throw new Error(`Failed to create ${this.tableName}`)
    }
    return result.id
  }

  protected async updateRecord(
    id: number,
    data: Partial<T>,
  ): Promise<number | undefined> {
    const updates: string[] = []
    const values: any[] = []

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        updates.push(`${key} = ?`)
        values.push(value)
      }
    })

    if (updates.length === 0) {
      return id
    }

    values.push(id)

    const result = this.db
      .query(
        `
      UPDATE ${this.tableName} 
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE ${this.idColumn} = ?
      RETURNING id
    `,
      )
      .get(...values) as { id: number } | undefined

    return result?.id
  }

  async delete(id: number): Promise<boolean> {
    const result = this.db
      .query(`DELETE FROM ${this.tableName} WHERE ${this.idColumn} = ?`)
      .run(id)
    return result.changes > 0
  }
}
