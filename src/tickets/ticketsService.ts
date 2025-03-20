import { BaseService } from '../services/baseService';
import { PaginatedResponse, Ticket, CreateTicket, UpdateTicket, TicketStatus, TicketPriority } from '../types';
import { createPaginatedResponse, decodeCursor } from '../utils';
import { getCurrentSQLiteTimestamp } from '../utils/dates';

type ListTicketsOptions = {
  cursor?: string;
  limit?: number;
  organization_id?: number;
  assignee_id?: number;
  contact_id?: number;
  status?: TicketStatus;
  priority?: TicketPriority;
};

export class TicketsService extends BaseService<Ticket> {
  protected tableName = 'tickets';
  protected idColumn = 'id';

  async create(data: CreateTicket): Promise<Ticket> {
    const status = data.status || 'open';
    const now = getCurrentSQLiteTimestamp();

    return super.create({
      ...data,
      status,
      priority: data.priority || 'normal',
      created_at: data.created_at || now,
      closed_at: data.closed_at || (status === 'closed' ? now : null)
    });
  }

  async update(id: number, data: UpdateTicket): Promise<Ticket | undefined> {
    const updates: any = { ...data };
    
    // If status is being changed to closed, set closed_at
    if (data.status === 'closed') {
      updates.closed_at = getCurrentSQLiteTimestamp();
    } else if (data.status === 'open') {
      updates.closed_at = null;
    }

    return super.update(id, updates);
  }

  async getById(id: number): Promise<Ticket | undefined> {
    const row = this.query(`
      SELECT 
        t.*,
        json_object(
          'id', u.id,
          'email', u.email,
          'name', u.name,
          'organization_id', u.organization_id,
          'role', u.role,
          'created_at', u.created_at,
          'updated_at', u.updated_at
        ) as assignee,
        json_object(
          'id', c.id,
          'name', c.name,
          'organization_id', c.organization_id,
          'created_at', c.created_at,
          'updated_at', c.updated_at
        ) as contact,
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
      FROM tickets t
      LEFT JOIN users u ON t.assignee_id = u.id
      LEFT JOIN contacts c ON t.contact_id = c.id
      LEFT JOIN ticket_attachments ta ON t.id = ta.ticket_id
      LEFT JOIN attachments a ON ta.attachment_id = a.id
      WHERE t.${this.idColumn} = ?
      GROUP BY t.id
    `).get(id);

    if (!row) return undefined;

    // Parse JSON fields and handle empty arrays
    const ticket = this.parseJsonFields<Ticket>(row, ['assignee', 'contact', 'attachments']);
    if (ticket.attachments?.[0]?.id === null) {
      ticket.attachments = [];
    }
    return ticket;
  }

  async list({ 
    cursor, 
    limit = 10,
    organization_id,
    assignee_id,
    contact_id,
    status,
    priority 
  }: ListTicketsOptions = {}): Promise<PaginatedResponse<Ticket>> {
    const cursorData = cursor ? decodeCursor(cursor) : null;
    const conditions: string[] = [];
    const params: any[] = [];

    if (cursorData) {
      conditions.push(`t.${this.idColumn} > ?`);
      params.push(cursorData.id);
    }

    if (organization_id) {
      conditions.push('t.organization_id = ?');
      params.push(organization_id);
    }

    if (assignee_id) {
      conditions.push('t.assignee_id = ?');
      params.push(assignee_id);
    }

    if (contact_id) {
      conditions.push('t.contact_id = ?');
      params.push(contact_id);
    }

    if (status) {
      conditions.push('t.status = ?');
      params.push(status);
    }

    if (priority) {
      conditions.push('t.priority = ?');
      params.push(priority);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit + 1);

    const rows = this.query(`
      SELECT 
        t.*,
        json_object(
          'id', u.id,
          'email', u.email,
          'name', u.name,
          'organization_id', u.organization_id,
          'role', u.role,
          'created_at', u.created_at,
          'updated_at', u.updated_at
        ) as assignee,
        json_object(
          'id', c.id,
          'name', c.name,
          'organization_id', c.organization_id,
          'created_at', c.created_at,
          'updated_at', c.updated_at
        ) as contact,
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
      FROM tickets t
      LEFT JOIN users u ON t.assignee_id = u.id
      LEFT JOIN contacts c ON t.contact_id = c.id
      LEFT JOIN ticket_attachments ta ON t.id = ta.ticket_id
      LEFT JOIN attachments a ON ta.attachment_id = a.id
      ${whereClause}
      GROUP BY t.id
      ORDER BY t.${this.idColumn}
      LIMIT ?
    `).all(...params);

    const items = rows.map(row => {
      const ticket = this.parseJsonFields<Ticket>(row, ['assignee', 'contact', 'attachments']);
      if (ticket.attachments?.[0]?.id === null) {
        ticket.attachments = [];
      }
      return ticket;
    });

    return createPaginatedResponse(items, limit, cursor);
  }
} 