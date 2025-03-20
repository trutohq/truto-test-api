import { DateTime } from 'luxon';

export const SQLITE_DATETIME_COLUMNS = [
  'created_at',
  'updated_at',
  'closed_at',
  'last_used_at'
] as const;

type DateColumns = typeof SQLITE_DATETIME_COLUMNS[number];

const SQLITE_FORMAT = 'yyyy-MM-dd HH:mm:ss';

/**
 * Converts an ISO 8601 date string to SQLite datetime format
 * @param isoDate ISO 8601 date string
 * @returns SQLite datetime string or null if input is null/undefined
 */
export function toSQLiteDateTime(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const dt = DateTime.fromISO(isoDate);
  if (!dt.isValid) return null;
  return dt.toFormat(SQLITE_FORMAT);
}

/**
 * Converts a SQLite datetime string to ISO 8601 format
 * @param sqliteDate SQLite datetime string
 * @returns ISO 8601 date string or null if input is null/undefined
 */
export function toISODateTime(sqliteDate: string | null | undefined): string | null {
  if (!sqliteDate) return null;
  const dt = DateTime.fromFormat(sqliteDate, SQLITE_FORMAT);
  if (!dt.isValid) return null;
  return dt.toISO();
}

/**
 * Gets current timestamp in SQLite format
 */
export function getCurrentSQLiteTimestamp(): string {
  return DateTime.now().toFormat(SQLITE_FORMAT);
}

/**
 * Converts an object's date fields from ISO to SQLite format
 */
export function convertDatesToSQLite<T extends Partial<Record<DateColumns, unknown>>>(obj: T): T {
  const result = { ...obj };
  for (const key of SQLITE_DATETIME_COLUMNS) {
    if (key in result) {
      result[key] = toSQLiteDateTime(result[key] as string);
    }
  }
  return result;
}

/**
 * Converts an object's date fields from SQLite to ISO format
 */
export function convertDatesToISO<T extends Partial<Record<DateColumns, unknown>>>(obj: T): T {
  const result = { ...obj };
  for (const key of SQLITE_DATETIME_COLUMNS) {
    if (key in result) {
      result[key] = toISODateTime(result[key] as string);
    }
  }
  return result;
} 