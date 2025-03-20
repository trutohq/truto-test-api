import { BaseService } from '../services/baseService'
import { generateApiKey } from '../utils'

export interface ApiKey {
  id: number
  user_id: number
  key: string
  created_at: string
  updated_at: string
  last_used_at: string | null
}

export class ApiKeyService extends BaseService<ApiKey> {
  protected tableName = 'api_keys'
  protected idColumn = 'id'

  async createForUser(userId: number): Promise<ApiKey> {
    const apiKey = generateApiKey()
    const result = this.query(
      `
      INSERT INTO ${this.tableName} (user_id, key, created_at, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `,
    ).get(userId, apiKey) as ApiKey

    if (!result) {
      throw new Error('Failed to create API key')
    }

    return result
  }

  async getByKey(key: string): Promise<ApiKey | undefined> {
    return this.query(
      `
      SELECT * FROM ${this.tableName}
      WHERE key = ?
    `,
    ).get(key) as ApiKey | undefined
  }

  async getUserIdByKey(key: string): Promise<number | undefined> {
    const result = this.query(
      `
      SELECT user_id 
      FROM ${this.tableName} 
      WHERE key = ?
    `,
    ).get(key) as { user_id: number } | undefined

    if (result) {
      // Update last used timestamp
      this.query(
        `
        UPDATE ${this.tableName} 
        SET last_used_at = CURRENT_TIMESTAMP 
        WHERE key = ?
      `,
      ).run(key)
    }

    return result?.user_id
  }

  async getByUserId(userId: number): Promise<ApiKey[]> {
    return this.query(
      `
      SELECT * FROM ${this.tableName}
      WHERE user_id = ?
      ORDER BY created_at DESC
    `,
    ).all(userId) as ApiKey[]
  }

  async delete(id: number): Promise<boolean> {
    const result = this.query(
      `
      DELETE FROM ${this.tableName}
      WHERE id = ?
    `,
    ).run(id)
    return result.changes > 0
  }
}
