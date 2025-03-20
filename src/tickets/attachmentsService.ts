import { BaseService } from '../services/baseService';
import { PaginatedResponse, Attachment, CreateAttachment } from '../types';
import { createPaginatedResponse, decodeCursor } from '../utils';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import { getCurrentSQLiteTimestamp } from '../utils/dates';

type ListAttachmentsOptions = {
  cursor?: string;
  limit?: number;
  organization_id?: number;
};

export class AttachmentsService extends BaseService<Attachment> {
  protected tableName = 'attachments';
  protected idColumn = 'id';
  private uploadsDir: string;

  constructor(db: any) {
    super(db);
    this.uploadsDir = join(process.cwd(), 'uploads');
    this.ensureUploadsDir();
  }

  private async ensureUploadsDir() {
    try {
      await mkdir(this.uploadsDir, { recursive: true });
    } catch (error) {
      if ((error as any).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  private getFilePath(organizationId: number, fileName: string): string {
    // Create a unique file name to avoid collisions using current timestamp
    const timestamp = getCurrentSQLiteTimestamp().replace(/[- :]/g, '');
    const uniqueFileName = `${timestamp}-${fileName}`;
    return join(this.uploadsDir, organizationId.toString(), uniqueFileName);
  }

  async create(data: CreateAttachment): Promise<Attachment> {
    // Create organization directory if it doesn't exist
    const orgDir = join(this.uploadsDir, data.organization_id.toString());
    await mkdir(orgDir, { recursive: true });

    return super.create(data);
  }

  async saveFile(file: File, organizationId: number): Promise<Attachment> {
    const filePath = this.getFilePath(organizationId, file.name);
    
    // Save the file to disk
    await Bun.write(filePath, file);

    // Create attachment record
    return this.create({
      file_name: file.name,
      content_type: file.type,
      size: file.size,
      file_path: filePath,
      organization_id: organizationId
    });
  }

  async getFile(id: number): Promise<{ attachment: Attachment; file: Blob } | undefined> {
    const attachment = await this.getById(id);
    if (!attachment) return undefined;

    try {
      const file = Bun.file(attachment.file_path);
      return { attachment, file };
    } catch (error) {
      console.error(`Failed to read file: ${attachment.file_path}`, error);
      return undefined;
    }
  }

  async getById(id: number): Promise<Attachment | undefined> {
    return super.getById(id);
  }

  async list({ 
    cursor, 
    limit = 10,
    organization_id 
  }: ListAttachmentsOptions = {}): Promise<PaginatedResponse<Attachment>> {
    const cursorData = cursor ? decodeCursor(cursor) : null;
    const conditions: string[] = [];
    const params: any[] = [];

    if (cursorData) {
      conditions.push(`${this.idColumn} > ?`);
      params.push(cursorData.id);
    }

    if (organization_id) {
      conditions.push('organization_id = ?');
      params.push(organization_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit + 1);

    const rows = this.query(`
      SELECT *
      FROM ${this.tableName}
      ${whereClause}
      ORDER BY ${this.idColumn}
      LIMIT ?
    `).all(...params) as Attachment[];

    return createPaginatedResponse(rows, limit, cursor);
  }

  async addToTicket(ticketId: number, attachmentId: number): Promise<void> {
    this.query(`
      INSERT INTO ticket_attachments (ticket_id, attachment_id)
      VALUES (?, ?)
    `).run(ticketId, attachmentId);
  }

  async addToComment(commentId: number, attachmentId: number): Promise<void> {
    this.query(`
      INSERT INTO comment_attachments (comment_id, attachment_id)
      VALUES (?, ?)
    `).run(commentId, attachmentId);
  }

  async removeFromTicket(ticketId: number, attachmentId: number): Promise<void> {
    this.query(`
      DELETE FROM ticket_attachments
      WHERE ticket_id = ? AND attachment_id = ?
    `).run(ticketId, attachmentId);
  }

  async removeFromComment(commentId: number, attachmentId: number): Promise<void> {
    this.query(`
      DELETE FROM comment_attachments
      WHERE comment_id = ? AND attachment_id = ?
    `).run(commentId, attachmentId);
  }

  async delete(id: number): Promise<boolean> {
    const attachment = await this.getById(id);
    if (!attachment) return false;

    try {
      // Delete the file from disk
      await Bun.write(attachment.file_path, ''); // This effectively deletes the file
      
      // Delete the record from database
      return super.delete(id);
    } catch (error) {
      console.error(`Failed to delete file: ${attachment.file_path}`, error);
      return false;
    }
  }
} 