import { BaseService } from '../services/baseService'
import { Contact, PaginatedResponse } from '../types'
import { createPaginatedResponse, decodeCursor } from '../utils'
import { convertDatesToISO } from '../utils/dates'

type CreateContact = Partial<Contact>

type UpdateContact = Partial<CreateContact>

type ListContactsOptions = {
  cursor?: string
  limit?: number
  organization_id?: number
  email?: string
  phone?: string
  name?: string
}

export class ContactsService extends BaseService<Contact> {
  protected tableName = 'contacts'
  protected idColumn = 'id'

  async findExistingContact(
    organizationId: number,
    emails: string[] = [],
    phones: string[] = [],
  ): Promise<Contact | undefined> {
    if (emails.length === 0 && phones.length === 0) return undefined

    const conditions: string[] = []
    const params: any[] = [organizationId]

    if (emails.length > 0) {
      conditions.push(`EXISTS (
        SELECT 1 FROM contact_emails ce 
        WHERE ce.contact_id = c.id 
        AND ce.email IN (${emails.map(() => '?').join(',')})
      )`)
      params.push(...emails)
    }

    if (phones.length > 0) {
      conditions.push(`EXISTS (
        SELECT 1 FROM contact_phones cp 
        WHERE cp.contact_id = c.id 
        AND cp.phone IN (${phones.map(() => '?').join(',')})
      )`)
      params.push(...phones)
    }

    const row = this.query(
      `
      SELECT c.*,
        json_group_array(DISTINCT json_object(
          'id', ce.id,
          'contact_id', ce.contact_id,
          'email', ce.email,
          'is_primary', ce.is_primary,
          'created_at', ce.created_at,
          'updated_at', ce.updated_at
        )) as emails,
        json_group_array(DISTINCT json_object(
          'id', cp.id,
          'contact_id', cp.contact_id,
          'phone', cp.phone,
          'is_primary', cp.is_primary,
          'created_at', cp.created_at,
          'updated_at', cp.updated_at
        )) as phones
      FROM contacts c
      LEFT JOIN contact_emails ce ON c.id = ce.contact_id
      LEFT JOIN contact_phones cp ON c.id = cp.contact_id
      WHERE c.organization_id = ? AND (${conditions.join(' OR ')})
      GROUP BY c.id
      LIMIT 1
    `,
    ).get(...params)

    if (!row) return undefined

    const contact = this.parseJsonFields<Contact>(row, ['emails', 'phones'])
    if (contact.emails?.[0]?.id === null) {
      contact.emails = []
    }
    if (contact.phones?.[0]?.id === null) {
      contact.phones = []
    }

    // Convert dates to ISO format
    const convertedContact = convertDatesToISO(contact)
    if (convertedContact.emails) {
      convertedContact.emails = convertedContact.emails.map((email) =>
        convertDatesToISO(email),
      )
    }
    if (convertedContact.phones) {
      convertedContact.phones = convertedContact.phones.map((phone) =>
        convertDatesToISO(phone),
      )
    }
    return convertedContact
  }

  async createWithContactInfo(data: Partial<Contact>): Promise<Contact> {
    // Validate that at least one email or phone is provided
    if (
      (!data.emails || data.emails.length === 0) &&
      (!data.phones || data.phones.length === 0)
    ) {
      throw new Error('At least one email or phone number is required')
    }

    if (!data.organization_id) {
      throw new Error('Organization ID is required')
    }

    if (!data.name) {
      throw new Error('Name is required')
    }

    // Check for existing contact with same email or phone
    const existingContact = await this.findExistingContact(
      data.organization_id,
      data.emails?.map((e) => e.email) || [],
      data.phones?.map((p) => p.phone) || [],
    )

    if (existingContact) {
      // Update existing contact with any new information
      return this.update(existingContact.id, data) as Promise<Contact>
    }

    // Create contact with transaction
    return this.db.transaction(() => {
      // Create contact
      const contact = this.query(
        `
        INSERT INTO contacts (name, organization_id)
        VALUES (?, ?)
        RETURNING *
      `,
      ).get(data.name!, data.organization_id!) as Contact

      // Add emails
      if (data.emails && data.emails.length > 0) {
        for (const emailData of data.emails) {
          this.query(
            `
            INSERT INTO contact_emails (contact_id, email, is_primary)
            VALUES (?, ?, ?)
          `,
          ).run(contact.id, emailData.email, emailData.is_primary || false)
        }
      }

      // Add phones
      if (data.phones && data.phones.length > 0) {
        for (const phoneData of data.phones) {
          this.query(
            `
            INSERT INTO contact_phones (contact_id, phone, is_primary)
            VALUES (?, ?, ?)
          `,
          ).run(contact.id, phoneData.phone, phoneData.is_primary || false)
        }
      }

      const createdContact = this.getById(contact.id)
      if (!createdContact) {
        throw new Error('Failed to create contact')
      }
      return createdContact
    })()
  }

  async create(data: CreateContact): Promise<Contact> {
    return this.createWithContactInfo(data)
  }

  async update(id: number, data: UpdateContact): Promise<Contact | undefined> {
    const existingContact = await this.getById(id)
    if (!existingContact) return undefined

    return this.db.transaction(() => {
      // Update contact basic info
      if (data.name || data.organization_id) {
        const updates: string[] = []
        const values: any[] = []

        if (data.name !== undefined) {
          updates.push('name = ?')
          values.push(data.name)
        }

        if (data.organization_id !== undefined) {
          updates.push('organization_id = ?')
          values.push(data.organization_id)
        }

        if (updates.length > 0) {
          updates.push('updated_at = CURRENT_TIMESTAMP')
          values.push(id)

          this.query(
            `
            UPDATE contacts 
            SET ${updates.join(', ')}
            WHERE id = ?
          `,
          ).run(...values)
        }
      }

      // Update emails
      if (data.emails) {
        // Remove existing emails
        this.query('DELETE FROM contact_emails WHERE contact_id = ?').run(id)

        // Add new emails
        for (const emailData of data.emails) {
          this.query(
            `
            INSERT INTO contact_emails (contact_id, email, is_primary)
            VALUES (?, ?, ?)
          `,
          ).run(id, emailData.email, emailData.is_primary || false)
        }
      }

      // Update phones
      if (data.phones) {
        // Remove existing phones
        this.query('DELETE FROM contact_phones WHERE contact_id = ?').run(id)

        // Add new phones
        for (const phoneData of data.phones) {
          this.query(
            `
            INSERT INTO contact_phones (contact_id, phone, is_primary)
            VALUES (?, ?, ?)
          `,
          ).run(id, phoneData.phone, phoneData.is_primary || false)
        }
      }

      const updatedContact = this.getById(id)
      if (!updatedContact) {
        throw new Error('Failed to update contact')
      }
      return updatedContact
    })()
  }

  async getById(id: number): Promise<Contact | undefined> {
    const row = this.query(
      `
      SELECT c.*,
        json_group_array(DISTINCT json_object(
          'id', ce.id,
          'contact_id', ce.contact_id,
          'email', ce.email,
          'is_primary', ce.is_primary,
          'created_at', ce.created_at,
          'updated_at', ce.updated_at
        )) as emails,
        json_group_array(DISTINCT json_object(
          'id', cp.id,
          'contact_id', cp.contact_id,
          'phone', cp.phone,
          'is_primary', cp.is_primary,
          'created_at', cp.created_at,
          'updated_at', cp.updated_at
        )) as phones
      FROM contacts c
      LEFT JOIN contact_emails ce ON c.id = ce.contact_id
      LEFT JOIN contact_phones cp ON c.id = cp.contact_id
      WHERE c.${this.idColumn} = ?
      GROUP BY c.id
    `,
    ).get(id)

    if (!row) return undefined

    const contact = this.parseJsonFields<Contact>(row, ['emails', 'phones'])
    if (contact) {
      contact.emails = contact.emails.filter((email: any) => email.id !== null)
      contact.phones = contact.phones.filter((phone: any) => phone.id !== null)
    }

    // Convert dates to ISO format
    const convertedContact = convertDatesToISO(contact)
    if (convertedContact.emails) {
      convertedContact.emails = convertedContact.emails.map((email) =>
        convertDatesToISO(email),
      )
    }
    if (convertedContact.phones) {
      convertedContact.phones = convertedContact.phones.map((phone) =>
        convertDatesToISO(phone),
      )
    }
    return convertedContact
  }

  async list({
    cursor,
    limit = 10,
    organization_id,
    email,
    phone,
    name,
  }: ListContactsOptions = {}): Promise<PaginatedResponse<Contact>> {
    const cursorData = cursor ? decodeCursor(cursor) : null
    const conditions: string[] = []
    const params: any[] = []

    if (cursorData) {
      conditions.push(`c.${this.idColumn} > ?`)
      params.push(cursorData.id)
    }

    if (organization_id) {
      conditions.push('c.organization_id = ?')
      params.push(organization_id)
    }

    if (name) {
      conditions.push('c.name LIKE ?')
      params.push(`%${name}%`)
    }

    if (email) {
      conditions.push(
        'EXISTS (SELECT 1 FROM contact_emails ce WHERE ce.contact_id = c.id AND ce.email LIKE ?)',
      )
      params.push(`%${email}%`)
    }

    if (phone) {
      conditions.push(
        'EXISTS (SELECT 1 FROM contact_phones cp WHERE cp.contact_id = c.id AND cp.phone LIKE ?)',
      )
      params.push(`%${phone}%`)
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    params.push(limit + 1)

    const rows = this.query(
      `
      SELECT c.*,
        json_group_array(DISTINCT json_object(
          'id', ce.id,
          'contact_id', ce.contact_id,
          'email', ce.email,
          'is_primary', ce.is_primary,
          'created_at', ce.created_at,
          'updated_at', ce.updated_at
        )) as emails,
        json_group_array(DISTINCT json_object(
          'id', cp.id,
          'contact_id', cp.contact_id,
          'phone', cp.phone,
          'is_primary', cp.is_primary,
          'created_at', cp.created_at,
          'updated_at', cp.updated_at
        )) as phones
      FROM contacts c
      LEFT JOIN contact_emails ce ON c.id = ce.contact_id
      LEFT JOIN contact_phones cp ON c.id = cp.contact_id
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.${this.idColumn}
      LIMIT ?
    `,
    ).all(...params)

    const items = rows.map((row) => {
      const contact = this.parseJsonFields<Contact>(row, ['emails', 'phones'])
      if (contact) {
        contact.emails = contact.emails.filter(
          (email: any) => email.id !== null,
        )
        contact.phones = contact.phones.filter(
          (phone: any) => phone.id !== null,
        )
      }

      // Convert dates to ISO format
      const convertedContact = convertDatesToISO(contact)
      if (convertedContact.emails) {
        convertedContact.emails = convertedContact.emails.map((email) =>
          convertDatesToISO(email),
        )
      }
      if (convertedContact.phones) {
        convertedContact.phones = convertedContact.phones.map((phone) =>
          convertDatesToISO(phone),
        )
      }
      return convertedContact
    })

    return createPaginatedResponse(items, limit, cursor)
  }
}
