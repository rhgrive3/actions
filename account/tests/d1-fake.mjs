// Minimal Cloudflare D1 stand-in on node:sqlite for the account Worker tests (prepare/bind/first/all/run/batch).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

class Statement {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.db, this.sql, args); }
  // D1 numbers ?1..?N; node:sqlite takes positional arrays for them as well
  _stmt() { return this.db.prepare(this.sql); }
  _exec(kind) {
    const st = this._stmt();
    if (kind === 'first') return st.get(...this.args) ?? null;
    if (kind === 'all') return { results: st.all(...this.args), success: true };
    const r = st.run(...this.args);
    return { success: true, meta: { changes: Number(r.changes) } };
  }
  async first() { return this._exec('first'); }
  async all() { return this._exec('all'); }
  async run() { return this._exec('run'); }
}

export function createD1(migrationFile) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(fs.readFileSync(migrationFile, 'utf8'));
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
