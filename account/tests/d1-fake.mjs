// Minimal Cloudflare D1 stand-in on node:sqlite for the account Worker tests (prepare/bind/first/all/run/batch).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

class Statement {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.db, this.sql, args); }
  // D1 uses numbered parameters. Bind their exact names: positional binding
  // for ?1..?N differs between supported node:sqlite versions.
  _stmt() { return this.db.prepare(this.sql); }
  _exec(kind) {
    const st = this._stmt();
    const bindings = Object.fromEntries(this.args.map((value, index) => ['?' + (index + 1), value]));
    if (kind === 'first') return st.get(bindings) ?? null;
    if (kind === 'all') return { results: st.all(bindings), success: true };
    const r = st.run(bindings);
    return { success: true, meta: { changes: Number(r.changes) } };
  }
  async first() { return this._exec('first'); }
  async all() { return this._exec('all'); }
  async run() { return this._exec('run'); }
}

/** `migrations`: a .sql file or a directory whose .sql files run in name order (like wrangler). */
export function createD1(migrations) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const files = fs.statSync(migrations).isDirectory()
    ? fs.readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort().map((f) => path.join(migrations, f))
    : [migrations];
  for (const f of files) db.exec(fs.readFileSync(f, 'utf8'));
  return {
    raw: db,
    prepare: (sql) => new Statement(db, sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = stmts.map((s) => s._exec('run'));
        db.exec('COMMIT');
        return out;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
