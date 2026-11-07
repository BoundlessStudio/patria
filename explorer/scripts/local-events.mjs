import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const migrations = new URL('../drizzle/', import.meta.url);
const defaultPath = fileURLToPath(new URL('../.events/index.sqlite', import.meta.url));

export function openLocalEvents(path = process.env.PATRIA_EVENTS_DB_PATH || defaultPath) {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL');
  const { entries } = JSON.parse(readFileSync(new URL('meta/_journal.json', migrations), 'utf8'));
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const version = sqlite.prepare('PRAGMA user_version').get().user_version;
    for (const entry of entries.filter(item => item.idx >= version)) {
      sqlite.exec(readFileSync(new URL(`${entry.tag}.sql`, migrations), 'utf8'));
      sqlite.exec(`PRAGMA user_version = ${entry.idx + 1}`);
    }
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    sqlite.close();
    throw error;
  }
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            all: () => ({ results: sqlite.prepare(sql).all(...args) }),
            first: () => sqlite.prepare(sql).get(...args) ?? null,
            run: () => ({ meta: sqlite.prepare(sql).run(...args) }),
          };
        },
      };
    },
    batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(statement => statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => sqlite.close(),
  };
}
