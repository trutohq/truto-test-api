import db from '../config/database';
import { BaseEntity, PaginatedResponse } from '../types';
import { createPaginatedResponse, decodeCursor } from '../utils';

export type BaseListOptions = {
  cursor?: string;
  limit?: number;
};

export abstract class BaseService<T extends BaseEntity> {
  protected abstract tableName: string;
  protected idColumn = 'id';

  protected query(sql: string) {
    return db.query(sql);
  }

  protected parseJsonFields<T>(row: any, fields: string[]): T {
    if (!row) return row as T;
    const result = { ...row };
    fields.forEach(field => {
      if (result[field]) {
        result[field] = JSON.parse(result[field]);
      }
    });
    return result as T;
  }

  async list({ cursor, limit = 10 }: BaseListOptions = {}): Promise<PaginatedResponse<T>> {
    const cursorData = cursor ? decodeCursor(cursor) : null;
    const whereClause = cursorData ? `WHERE ${this.idColumn} > ?` : '';
    const params = cursorData ? [cursorData.id, limit + 1] : [limit + 1];
    
    const items = this.query(`
      SELECT * FROM ${this.tableName} 
      ${whereClause}
      ORDER BY ${this.idColumn}
      LIMIT ?
    `).all(...params) as unknown[];

    return createPaginatedResponse(items as T[], limit, cursor);
  }

  async getById(id: number): Promise<T | undefined> {
    return db.query(`SELECT * FROM ${this.tableName} WHERE ${this.idColumn} = ?`).get(id) as T | undefined;
  }

  async create(data: Partial<T>): Promise<T> {
    const id = await this.createRecord(data);
    const item = await this.getById(id);
    if (!item) {
      throw new Error(`Failed to create ${this.tableName}`);
    }
    return item;
  }

  async update(id: number, data: Partial<T>): Promise<T | undefined> {
    const updatedId = await this.updateRecord(id, data);
    if (!updatedId) {
      return undefined;
    }
    return this.getById(updatedId);
  }

  protected async createRecord(data: Partial<T>): Promise<number> {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map(() => '?').join(', ');

    const result = db.query(`
      INSERT INTO ${this.tableName} (${columns.join(', ')})
      VALUES (${placeholders})
      RETURNING id
    `).get(...values) as { id: number };

    if (!result) {
      throw new Error(`Failed to create ${this.tableName}`);
    }
    return result.id;
  }

  protected async updateRecord(id: number, data: Partial<T>): Promise<number | undefined> {
    const updates: string[] = [];
    const values: any[] = [];

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    });

    if (updates.length === 0) {
      return id;
    }

    values.push(id);
    
    const result = db.query(`
      UPDATE ${this.tableName} 
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE ${this.idColumn} = ?
      RETURNING id
    `).get(...values) as { id: number } | undefined;

    return result?.id;
  }

  async delete(id: number): Promise<boolean> {
    const result = db.query(`DELETE FROM ${this.tableName} WHERE ${this.idColumn} = ?`).run(id);
    return result.changes > 0;
  }
} 