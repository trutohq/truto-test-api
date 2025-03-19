import { PaginatedResponse, BaseEntity } from '../types';

export function encodeCursor(data: any): string {
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

export function decodeCursor(cursor: string): any {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString());
  } catch (error) {
    return null;
  }
}

export function createPaginatedResponse<T extends BaseEntity>(
  data: T[],
  limit: number,
  cursor?: string
): PaginatedResponse<T> {
  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data;
  
  const nextCursor = hasMore ? encodeCursor({ id: items[items.length - 1].id }) : '';
  const prevCursor = cursor ? encodeCursor({ id: items[0].id }) : '';

  return {
    data: items,
    next_cursor: nextCursor,
    prev_cursor: prevCursor,
  };
}

export function generateApiKey(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
} 