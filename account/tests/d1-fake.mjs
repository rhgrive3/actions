// Minimal Cloudflare D1 stand-in on node:sqlite for the account Worker tests (prepare/bind/first/all/run/batch).
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const require = createRequire(import.meta.url);
let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  const WORKER_CODE = `
    const { workerData } = require('node:worker_threads');
    const { spawn } = require('node:child_process');
    const { ctrl, data } = workerData;
    const ctrlArr = new Int32Array(ctrl);
    const dataArr = new Uint8Array(data);
    const pyScript = [
      'import sys, json, sqlite3',
      'conn = sqlite3.connect(":memory:")',
      'conn.isolation_level = None',
      'for line in sys.stdin:',
      '    req = json.loads(line)',
      '    op = req["op"]',
      '    sql = req["sql"]',
      '    args = req.get("args", [])',
      '    try:',
      '        if op == "exec":',
      '            cleaned = chr(10).join(ln.split("--")[0] for ln in sql.splitlines())',
      '            for stmt in [s.strip() for s in cleaned.split(";") if s.strip()]:',
      '                conn.execute(stmt)',
      '            res = {"ok": True}',
      '        else:',
      '            if len(args) == 1 and isinstance(args[0], dict):',
      '                bindings = args[0]',
      '                max_idx = 0',
      '                for k in bindings:',
      '                    if k.startswith("?"):',
      '                        idx = int(k[1:])',
      '                        if idx > max_idx: max_idx = idx',
      '                params = [bindings.get(f"?{i}", None) for i in range(1, max_idx + 1)]',
      '            else:',
      '                params = args',
      '            cur = conn.cursor()',
      '            cur.execute(sql, params)',
      '            cols = [d[0] for d in cur.description] if cur.description else []',
      '            if op == "get":',
      '                r = cur.fetchone()',
      '                row = dict(zip(cols, r)) if r is not None else None',
      '                res = {"ok": True, "row": row}',
      '            elif op == "all":',
      '                rows = [dict(zip(cols, r)) for r in cur.fetchall()]',
      '                res = {"ok": True, "rows": rows}',
      '            elif op == "run":',
      '                res = {"ok": True, "changes": cur.rowcount if cur.rowcount >= 0 else 0, "lastInsertRowid": cur.lastrowid or 0}',
      '    except Exception as e:',
      '        res = {"ok": False, "error": str(e)}',
      '    sys.stdout.write(json.dumps(res) + chr(10))',
      '    sys.stdout.flush()',
    ].join('\\n');
    const py = spawn('python3', ['-u', '-c', pyScript], { stdio: ['pipe', 'pipe', 'inherit'] });

    let buf = '';
    py.stdout.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const nl = buf.indexOf('\\n');
      if (nl !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        const encoded = Buffer.from(line, 'utf8');
        encoded.copy(dataArr, 0);
        Atomics.store(ctrlArr, 1, encoded.length);
        Atomics.store(ctrlArr, 0, 2);
        Atomics.notify(ctrlArr, 0, 1);
      }
    });

    Atomics.store(ctrlArr, 0, 99);
    Atomics.notify(ctrlArr, 0, 1);

    function loop() {
      Atomics.wait(ctrlArr, 0, 0);
      const state = Atomics.load(ctrlArr, 0);
      if (state === 1) {
        const len = Atomics.load(ctrlArr, 1);
        const reqStr = Buffer.from(dataArr.buffer, 0, len).toString('utf8');
        Atomics.store(ctrlArr, 0, 3);
        py.stdin.write(reqStr + '\\n');
      } else if (state === -1) {
        py.kill();
        process.exit(0);
      }
      setImmediate(loop);
    }
    loop();
  `;

  class WorkerDatabaseSync {
    constructor() {
      this._ctrl = new SharedArrayBuffer(16);
      this._data = new SharedArrayBuffer(4 * 1024 * 1024);
      this._ctrlArr = new Int32Array(this._ctrl);
      this._dataArr = new Uint8Array(this._data);
      this._worker = new Worker(WORKER_CODE, {
        eval: true,
        workerData: { ctrl: this._ctrl, data: this._data },
      });
      this._worker.unref();
      Atomics.wait(this._ctrlArr, 0, 0, 5000);
      Atomics.store(this._ctrlArr, 0, 0);
    }
    _rpc(payload) {
      const encoded = Buffer.from(JSON.stringify(payload), 'utf8');
      encoded.copy(this._dataArr, 0);
      Atomics.store(this._ctrlArr, 1, encoded.length);
      Atomics.store(this._ctrlArr, 0, 1);
      Atomics.notify(this._ctrlArr, 0, 1);
      const deadline = Date.now() + 5000;
      while (true) {
        const cur = Atomics.load(this._ctrlArr, 0);
        if (cur === 2) break;
        if (Date.now() > deadline) {
          throw new Error('SQLite worker RPC timed out');
        }
        Atomics.wait(this._ctrlArr, 0, cur, 50);
      }
      const outLen = Atomics.load(this._ctrlArr, 1);
      const outStr = Buffer.from(this._data, 0, outLen).toString('utf8');
      Atomics.store(this._ctrlArr, 0, 0);
      Atomics.notify(this._ctrlArr, 0, 1);
      const res = JSON.parse(outStr);
      if (!res.ok) throw new Error(res.error);
      return res;
    }
    exec(sql) {
      this._rpc({ op: 'exec', sql });
    }
    close() {
      Atomics.store(this._ctrlArr, 0, -1);
      Atomics.notify(this._ctrlArr, 0, 1);
    }
    prepare(sql) {
      const db = this;
      return {
        get(...args) {
          return db._rpc({ op: 'get', sql, args }).row ?? undefined;
        },
        all(...args) {
          return db._rpc({ op: 'all', sql, args }).rows;
        },
        run(...args) {
          const r = db._rpc({ op: 'run', sql, args });
          return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
        },
      };
    }
  }
  DatabaseSync = WorkerDatabaseSync;
}

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
