import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
export function database() { const sql = new DatabaseSync(':memory:'); for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(f => f.endsWith('.sql')).sort())
    sql.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8')); function prepare(query, args = []) { return { bind(...values) { return prepare(query, values); }, async first() { return sql.prepare(query).get(...args) || null; }, async all() { return { results: sql.prepare(query).all(...args) }; }, runSync() { const r = sql.prepare(query).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }, async run() { return this.runSync(); } }; } return { sql, prepare, async batch(statements) { sql.exec('BEGIN'); try {
        const r = statements.map(s => s.runSync());
        sql.exec('COMMIT');
        return r;
    }
    catch (e) {
        sql.exec('ROLLBACK');
        throw e;
    } }, close() { sql.close(); } }; }
