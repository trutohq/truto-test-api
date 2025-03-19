import { BaseService } from '../services/baseService';
import { User, PaginatedResponse } from '../types';
import { createPaginatedResponse, decodeCursor } from '../utils';

type CreateUser = {
  email: string;
  name: string;
  organization_id: number;
  role: 'admin' | 'agent';
};

type UpdateUser = Partial<CreateUser>;

type ListUsersOptions = {
  cursor?: string;
  limit?: number;
  email?: string;
  name?: string;
  organization_id?: number;
};

export class UsersService extends BaseService<User> {
  protected tableName = 'users';
  protected idColumn = 'id';

  create(data: CreateUser): Promise<User> {
    return super.create(data);
  }

  update(id: number, data: UpdateUser): Promise<User | undefined> {
    return super.update(id, data);
  }

  async getById(id: number): Promise<User | undefined> {
    const row = this.query(`
      SELECT 
        u.*,
        json_object(
          'id', o.id,
          'name', o.name,
          'slug', o.slug,
          'created_at', o.created_at,
          'updated_at', o.updated_at
        ) as organization
      FROM users u
      JOIN organizations o ON u.organization_id = o.id
      WHERE u.${this.idColumn} = ?
    `).get(id);
    
    return this.parseJsonFields<User>(row, ['organization']);
  }

  async getByEmail(email: string): Promise<User | undefined> {
    const row = this.query(`
      SELECT u.*, 
        json_object(
          'id', o.id,
          'name', o.name,
          'slug', o.slug,
          'created_at', o.created_at,
          'updated_at', o.updated_at
        ) as organization
      FROM users u
      JOIN organizations o ON u.organization_id = o.id
      WHERE u.email = ?
    `).get(email);
    
    return this.parseJsonFields<User>(row, ['organization']);
  }

  async list({ cursor, limit = 10, email, name, organization_id }: ListUsersOptions = {}): Promise<PaginatedResponse<User>> {
    const cursorData = cursor ? decodeCursor(cursor) : null;
    const conditions: string[] = [];
    const params: any[] = [];

    if (cursorData) {
      conditions.push(`u.${this.idColumn} > ?`);
      params.push(cursorData.id);
    }

    if (email) {
      conditions.push('u.email LIKE ?');
      params.push(`%${email}%`);
    }

    if (name) {
      conditions.push('u.name LIKE ?');
      params.push(`%${name}%`);
    }

    if (organization_id) {
      conditions.push('u.organization_id = ?');
      params.push(organization_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit + 1);
    
    const rows = this.query(`
      SELECT 
        u.*,
        json_object(
          'id', o.id,
          'name', o.name,
          'slug', o.slug,
          'created_at', o.created_at,
          'updated_at', o.updated_at
        ) as organization
      FROM users u
      JOIN organizations o ON u.organization_id = o.id
      ${whereClause}
      ORDER BY u.${this.idColumn}
      LIMIT ?
    `).all(...params);
    
    const items = rows.map(row => this.parseJsonFields<User>(row, ['organization']));
    return createPaginatedResponse(items, limit, cursor);
  }
} 