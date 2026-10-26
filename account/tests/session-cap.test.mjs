import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1 } from './d1-fake.mjs';
import { fileURLToPath } from 'node:url';
import { insertSession, insertUser, MAX_SESSIONS_PER_USER } from '../worker/store.js';

test('session cap always retains the just-issued token when creation timestamps tie', async () => {
  const DB = createD1(fileURLToPath(new URL('../migrations', import.meta.url)));
  const now = 1000000;
  await insertUser(DB, { id: 'user', loginId: 'player', loginIdNorm: 'player', displayName: 'Player', passwordHash: 'hash', now });
  const session = id => ({ id, userId: 'user', tokenHash: 'token-' + id, now, expiresAt: now + 10000, persistent: true, userAgent: null, country: null });
  for (let i = 0; i < MAX_SESSIONS_PER_USER; i++) await insertSession(DB, session('z-' + String(i).padStart(2, '0')));
  await insertSession(DB, session('a-newest'));
  const rows = DB.raw.prepare('SELECT id FROM sessions').all();
  assert.equal(rows.length, MAX_SESSIONS_PER_USER);
  assert.ok(rows.some(row => row.id === 'a-newest'), 'a newly returned cookie must reference a retained session');
  DB.raw.close();
});
