import db from '../config/database';
import { generateApiKey } from '../utils';

export interface ApiKey {
  id: number;
  user_id: number;
  key: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

export class ApiKeyService {
  private tableName = 'api_keys';

  async create(userId: number): Promise<ApiKey> {
    const apiKey = generateApiKey();
    const result = db.query(`
      INSERT INTO ${this.tableName} (user_id, key, created_at, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `).get(userId, apiKey) as ApiKey;

    if (!result) {
      throw new Error('Failed to create API key');
    }

    return result;
  }

  async getByKey(key: string): Promise<ApiKey | undefined> {
    return db.query(`
      SELECT * FROM ${this.tableName}
      WHERE key = ?
    `).get(key) as ApiKey | undefined;
  }

  async getByUserId(userId: number): Promise<ApiKey[]> {
    return db.query(`
      SELECT * FROM ${this.tableName}
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId) as ApiKey[];
  }

  async delete(id: number): Promise<boolean> {
    const result = db.query(`
      DELETE FROM ${this.tableName}
      WHERE id = ?
    `).run(id);
    return result.changes > 0;
  }
} 