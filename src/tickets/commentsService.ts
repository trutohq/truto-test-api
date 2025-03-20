import { BaseService } from '../services/baseService';
import { PaginatedResponse, Comment, CreateComment, UpdateComment } from '../types';
import { createPaginatedResponse, decodeCursor } from '../utils';

function convertToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}

type ListCommentsOptions = {
  cursor?: string;
  limit?: number;
  ticket_id?: number;
  organization_id?: number;
  is_private?: boolean;
};

export class CommentsService extends BaseService<Comment> {
  protected tableName = 'comments';
  protected idColumn = 'id';

  async create(data: CreateComment): Promise<Comment> {
    // Convert text to HTML with basic escaping
    const body_html = convertToHtml(data.body);

    return super.create({
      ...data,
      body_html,
      is_private: data.is_private || false
    });
  }

  async update(id: number, data: UpdateComment): Promise<Comment | undefined> {
    const updates: any = { ...data };
    
    // If body is being updated, regenerate HTML
    if (data.body) {
      updates.body_html = convertToHtml(data.body);
    }

    return super.update(id, updates);
  }

  async getById(id: number): Promise<Comment | undefined> {
    const row = this.query(`
      SELECT 
        c.*,
        CASE c.author_type
          WHEN 'user' THEN json_object(
            'id', u.id,
            'email', u.email,
            'name', u.name,
            'organization_id', u.organization_id,
            'role', u.role,
            'created_at', u.created_at,
            'updated_at', u.updated_at
          )
          WHEN 'contact' THEN json_object(
            'id', ct.id,
            'name', ct.name,
            'organization_id', ct.organization_id,
            'created_at', ct.created_at,
            'updated_at', ct.updated_at
          )
        END as author,
        json_group_array(
          json_object(
            'id', a.id,
            'file_name', a.file_name,
            'content_type', a.content_type,
            'size', a.size,
            'file_path', a.file_path,
            'organization_id', a.organization_id,
            'created_at', a.created_at,
            'updated_at', a.updated_at
          )
        ) as attachments
      FROM comments c
      LEFT JOIN users u ON c.author_type = 'user' AND c.author_id = u.id
      LEFT JOIN contacts ct ON c.author_type = 'contact' AND c.author_id = ct.id
      LEFT JOIN comment_attachments ca ON c.id = ca.comment_id
      LEFT JOIN attachments a ON ca.attachment_id = a.id
      WHERE c.${this.idColumn} = ?
      GROUP BY c.id
    `).get(id);

    if (!row) return undefined;

    // Parse JSON fields and handle empty arrays
    const comment = this.parseJsonFields<Comment>(row, ['author', 'attachments']);
    if (comment.attachments?.[0]?.id === null) {
      comment.attachments = [];
    }
    return comment;
  }

  async list({ 
    cursor, 
    limit = 10,
    ticket_id,
    organization_id,
    is_private 
  }: ListCommentsOptions = {}): Promise<PaginatedResponse<Comment>> {
    const cursorData = cursor ? decodeCursor(cursor) : null;
    const conditions: string[] = [];
    const params: any[] = [];

    if (cursorData) {
      conditions.push(`c.${this.idColumn} > ?`);
      params.push(cursorData.id);
    }

    if (ticket_id) {
      conditions.push('c.ticket_id = ?');
      params.push(ticket_id);
    }

    if (organization_id) {
      conditions.push('c.organization_id = ?');
      params.push(organization_id);
    }

    if (typeof is_private === 'boolean') {
      conditions.push('c.is_private = ?');
      params.push(is_private ? 1 : 0);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit + 1);

    const rows = this.query(`
      SELECT 
        c.*,
        CASE c.author_type
          WHEN 'user' THEN json_object(
            'id', u.id,
            'email', u.email,
            'name', u.name,
            'organization_id', u.organization_id,
            'role', u.role,
            'created_at', u.created_at,
            'updated_at', u.updated_at
          )
          WHEN 'contact' THEN json_object(
            'id', ct.id,
            'name', ct.name,
            'organization_id', ct.organization_id,
            'created_at', ct.created_at,
            'updated_at', ct.updated_at
          )
        END as author,
        json_group_array(
          json_object(
            'id', a.id,
            'file_name', a.file_name,
            'content_type', a.content_type,
            'size', a.size,
            'file_path', a.file_path,
            'organization_id', a.organization_id,
            'created_at', a.created_at,
            'updated_at', a.updated_at
          )
        ) as attachments
      FROM comments c
      LEFT JOIN users u ON c.author_type = 'user' AND c.author_id = u.id
      LEFT JOIN contacts ct ON c.author_type = 'contact' AND c.author_id = ct.id
      LEFT JOIN comment_attachments ca ON c.id = ca.comment_id
      LEFT JOIN attachments a ON ca.attachment_id = a.id
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.${this.idColumn}
      LIMIT ?
    `).all(...params);

    const items = rows.map(row => {
      const comment = this.parseJsonFields<Comment>(row, ['author', 'attachments']);
      if (comment.attachments?.[0]?.id === null) {
        comment.attachments = [];
      }
      return comment;
    });

    return createPaginatedResponse(items, limit, cursor);
  }
} 