import type { DatabaseSync } from 'node:sqlite';

/**
 * The column names of a table. Migrations check them before adding a column, and code that
 * migration v3 replays (the language recompute) checks for columns added after v3.
 */
export function columnNames(db: DatabaseSync, table: string): Set<string> {
  return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(column => column.name));
}
