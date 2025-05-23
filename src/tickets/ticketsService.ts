import { BaseService } from '../services/baseService'
import {
  CreateTicket,
  PaginatedResponse,
  Ticket,
  TicketPriority,
  TicketStatus,
  UpdateTicket,
} from '../types'
import { createPaginatedResponse, decodeCursor } from '../utils'
import {
  convertDatesToISO,
  getCurrentSQLiteTimestamp,
  toSQLiteDateTime,
} from '../utils/dates'

type ListTicketsOptions = {
  cursor?: string
  limit?: number
  organization_id?: number
  assignee_id?: number
  contact_id?: number
  status?: TicketStatus
  priority?: TicketPriority
  created_at_gt?: string
  created_at_lt?: string
  updated_at_gt?: string
  updated_at_lt?: string
}

export class TicketsService extends BaseService<Ticket> {
  protected tableName = 'tickets'
  protected idColumn = 'id'

  async create(data: CreateTicket): Promise<Ticket> {
    const status = data.status || 'open'
    const now = getCurrentSQLiteTimestamp()

    return super.create({
      ...data,
      status,
      priority: data.priority || 'normal',
      created_at: data.created_at || now,
      closed_at: data.closed_at || (status === 'closed' ? now : null),
    })
  }

  async update(id: number, data: UpdateTicket): Promise<Ticket | undefined> {
    const updates: any = { ...data }

    // If status is being changed to closed, set closed_at
    if (data.status === 'closed') {
      updates.closed_at = getCurrentSQLiteTimestamp()
    } else if (data.status === 'open') {
      updates.closed_at = null
    }

    return super.update(id, updates)
  }

  async getById(id: number): Promise<Ticket | undefined> {
    const row = this.query(
      `
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
    `,
    ).get(id)

    if (!row) return undefined

    // Parse JSON fields and handle empty arrays
    const ticket = this.parseJsonFields<Ticket>(row, [
      'assignee',
      'contact',
      'attachments',
    ])
    if (ticket.attachments?.[0]?.id === null) {
      ticket.attachments = []
    }

    // Convert dates to ISO format
    const convertedTicket = convertDatesToISO(ticket)
    if (convertedTicket.assignee) {
      convertedTicket.assignee = convertDatesToISO(convertedTicket.assignee)
    }
    if (convertedTicket.contact) {
      convertedTicket.contact = convertDatesToISO(convertedTicket.contact)
    }
    if (convertedTicket.attachments) {
      convertedTicket.attachments = convertedTicket.attachments.map(
        (attachment) => convertDatesToISO(attachment),
      )
    }
    return convertedTicket
  }

  async list({
    cursor,
    limit = 10,
    organization_id,
    assignee_id,
    contact_id,
    status,
    priority,
    created_at_gt,
    created_at_lt,
    updated_at_gt,
    updated_at_lt,
  }: ListTicketsOptions = {}): Promise<PaginatedResponse<Ticket>> {
    const cursorData = cursor ? decodeCursor(cursor) : null
    const conditions: string[] = []
    const params: any[] = []

    // Base conditions
    if (organization_id) {
      conditions.push('t.organization_id = ?')
      params.push(organization_id)
    }

    if (assignee_id) {
      conditions.push('t.assignee_id = ?')
      params.push(assignee_id)
    }

    if (contact_id) {
      conditions.push('t.contact_id = ?')
      params.push(contact_id)
    }

    if (status) {
      conditions.push('t.status = ?')
      params.push(status)
    }

    if (priority) {
      conditions.push('t.priority = ?')
      params.push(priority)
    }

    // Date range filters with SQLite datetime conversion
    if (created_at_gt) {
      conditions.push('t.created_at > ?')
      params.push(toSQLiteDateTime(created_at_gt))
    }

    if (created_at_lt) {
      conditions.push('t.created_at < ?')
      params.push(toSQLiteDateTime(created_at_lt))
    }

    if (updated_at_gt) {
      conditions.push('t.updated_at > ?')
      params.push(toSQLiteDateTime(updated_at_gt))
    }

    if (updated_at_lt) {
      conditions.push('t.updated_at < ?')
      params.push(toSQLiteDateTime(updated_at_lt))
    }

    // Cursor-based pagination
    if (cursorData) {
      // If we have date filters, use a compound cursor
      if (created_at_gt || created_at_lt || updated_at_gt || updated_at_lt) {
        conditions.push(`
          (t.created_at > ? OR (t.created_at = ? AND t.id > ?))
        `)
        params.push(
          toSQLiteDateTime(cursorData.created_at),
          toSQLiteDateTime(cursorData.created_at),
          cursorData.id,
        )
      } else {
        // If no date filters, use simple ID-based cursor
        conditions.push('t.id > ?')
        params.push(cursorData.id)
      }
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    params.push(limit + 1)

    const rows = this.query(
      `
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
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT ?
    `,
    ).all(...params)

    const items = rows.map((row) => {
      const ticket = this.parseJsonFields<Ticket>(row, [
        'assignee',
        'contact',
        'attachments',
      ])
      if (ticket.attachments?.[0]?.id === null) {
        ticket.attachments = []
      }

      // Convert dates to ISO format
      const convertedTicket = convertDatesToISO(ticket)
      if (convertedTicket.assignee) {
        convertedTicket.assignee = convertDatesToISO(convertedTicket.assignee)
      }
      if (convertedTicket.contact) {
        convertedTicket.contact = convertDatesToISO(convertedTicket.contact)
      }
      if (convertedTicket.attachments) {
        convertedTicket.attachments = convertedTicket.attachments.map(
          (attachment) => convertDatesToISO(attachment),
        )
      }
      return convertedTicket
    })

    return createPaginatedResponse(items, limit, cursor)
  }
}
