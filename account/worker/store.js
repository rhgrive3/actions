// D1 access for users, sessions and sign-in throttling. All times are epoch milliseconds.

export const MAX_SESSIONS_PER_USER = 20;

export const publicUser = (u) => ({
  id: u.id,
  loginId: u.login_id,
  displayName: u.display_name,
  avatarIcon: u.avatar_icon || null,
  avatarColor: u.avatar_color || null,
  createdAt: u.created_at,
  passwordChangedAt: u.password_changed_at,
});

// ------------------------------------------------------------------------------------- users
export const userByLogin = (db, norm) =>
  db.prepare('SELECT * FROM users WHERE login_id_norm = ?1').bind(norm).first();

export const userById = (db, id) => db.prepare('SELECT * FROM users WHERE id = ?1').bind(id).first();

/** Inserts a user; returns false when the login id is already taken (UNIQUE constraint). */
export async function insertUser(db, u) {
  try {
    await db.prepare(`INSERT INTO users (id, login_id, login_id_norm, display_name, password_hash, created_at, updated_at, password_changed_at, last_login_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?6, ?6)`)
      .bind(u.id, u.loginId, u.loginIdNorm, u.displayName, u.passwordHash, u.now).run();
    return true;
  } catch (e) {
    if (/UNIQUE|constraint/i.test(String(e?.message || e))) return false;
    throw e;
  }
}

/** Atomically admit one successful registration in a fixed window. D1 batch
 * rolls both statements back on error. The second statement uses the preceding
 * INSERT's changes(), so duplicate IDs and rejected quota checks spend nothing.
 */
export async function insertRegisteredUser(db, u, key, { windowMs, limit }) {
  const result = await db.batch([
    db.prepare(`INSERT INTO users (id, login_id, login_id_norm, display_name, password_hash, created_at, updated_at, password_changed_at, last_login_at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?6, ?6, ?6
      WHERE NOT EXISTS (SELECT 1 FROM auth_throttle WHERE key = ?7 AND
        (locked_until > ?6 OR (window_start > ?6 - ?8 AND failures >= ?9)))
      ON CONFLICT(login_id_norm) DO NOTHING`)
      .bind(u.id, u.loginId, u.loginIdNorm, u.displayName, u.passwordHash, u.now, key, windowMs, limit),
    db.prepare(`INSERT INTO auth_throttle (key, failures, window_start, locked_until)
      SELECT ?1, 1, ?2, CASE WHEN ?4 <= 1 THEN ?2 + ?3 ELSE 0 END
      WHERE changes() = 1
      ON CONFLICT(key) DO UPDATE SET
        failures = CASE WHEN window_start <= ?2 - ?3 THEN 1 ELSE failures + 1 END,
        locked_until = CASE
          WHEN window_start <= ?2 - ?3 THEN CASE WHEN ?4 <= 1 THEN ?2 + ?3 ELSE 0 END
          WHEN failures + 1 >= ?4 THEN window_start + ?3 ELSE 0 END,
        window_start = CASE WHEN window_start <= ?2 - ?3 THEN ?2 ELSE window_start END`)
      .bind(key, u.now, windowMs, limit),
  ]);
  return result[0].meta.changes === 1;
}

/** Updates the given profile fields; `undefined` keeps the stored value. */
export const setProfile = (db, id, { displayName, avatarIcon, avatarColor }, now) => db.prepare(`UPDATE users SET
    display_name = COALESCE(?2, display_name), avatar_icon = COALESCE(?3, avatar_icon), avatar_color = COALESCE(?4, avatar_color), updated_at = ?5
    WHERE id = ?1`).bind(id, displayName ?? null, avatarIcon ?? null, avatarColor ?? null, now).run();

export const setPasswordHash = (db, id, hash, now, changed = true) => changed
  ? db.prepare('UPDATE users SET password_hash = ?2, updated_at = ?3, password_changed_at = ?3 WHERE id = ?1').bind(id, hash, now).run()
  // a silent re-hash (stronger iteration count) is not a password change
  : db.prepare('UPDATE users SET password_hash = ?2 WHERE id = ?1').bind(id, hash).run();

export const touchLogin = (db, id, now) =>
  db.prepare('UPDATE users SET last_login_at = ?2 WHERE id = ?1').bind(id, now).run();

export const deleteUser = (db, id) => db.batch([
  db.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(id),
  db.prepare('DELETE FROM users WHERE id = ?1').bind(id),
]);

/** A login may finish password hashing after another request changed it.
 * Compare at the write, not with a second racy read before the write.
 */
export const upgradePasswordHash = async (db, id, previous, next) =>
  (await db.prepare('UPDATE users SET password_hash = ?3 WHERE id = ?1 AND password_hash = ?2')
    .bind(id, previous, next).run()).meta.changes === 1;

export const setAuthorizedProfile = (db, row, { displayName, avatarIcon, avatarColor }, now) =>
  db.prepare(`UPDATE users SET display_name = COALESCE(?2, display_name),
    avatar_icon = COALESCE(?3, avatar_icon), avatar_color = COALESCE(?4, avatar_color), updated_at = ?5
    WHERE id = ?1 AND password_hash = ?6 AND EXISTS
      (SELECT 1 FROM sessions WHERE id = ?7 AND user_id = ?1 AND expires_at > ?5)
    RETURNING *`)
    .bind(row.id, displayName ?? null, avatarIcon ?? null, avatarColor ?? null, now, row.password_hash, row.session_id).first();

/** All three writes succeed or roll back together. The unique salted new hash
 * is a transaction generation: a competing old authorization cannot delete
 * the winner's sessions or publish a token authenticated by an old password.
 */
export async function rotatePassword(db, row, nextHash, session) {
  const s = session;
  const result = await db.batch([
    db.prepare(`UPDATE users SET password_hash = ?3, updated_at = ?4, password_changed_at = ?4
      WHERE id = ?1 AND password_hash = ?2 AND EXISTS
        (SELECT 1 FROM sessions WHERE id = ?5 AND user_id = ?1 AND expires_at > ?4)`)
      .bind(row.id, row.password_hash, nextHash, s.now, row.session_id),
    db.prepare(`DELETE FROM sessions WHERE user_id = ?1 AND EXISTS
      (SELECT 1 FROM users WHERE id = ?1 AND password_hash = ?2)`)
      .bind(row.id, nextHash),
    db.prepare(`INSERT INTO sessions (id, token_hash, user_id, created_at, last_seen_at, expires_at, persistent, user_agent, country)
      SELECT ?1, ?2, ?3, ?4, ?4, ?5, ?6, ?7, ?8 FROM users WHERE id = ?3 AND password_hash = ?9`)
      .bind(s.id, s.tokenHash, s.userId, s.now, s.expiresAt, s.persistent ? 1 : 0, s.userAgent, s.country, nextHash),
  ]);
  return result[0].meta.changes === 1 && result[2].meta.changes === 1;
}

export async function deleteAuthorizedUser(db, row, now) {
  const result = await db.batch([
    db.prepare(`DELETE FROM users WHERE id = ?1 AND password_hash = ?2 AND EXISTS
      (SELECT 1 FROM sessions WHERE id = ?3 AND user_id = ?1 AND expires_at > ?4)`)
      .bind(row.id, row.password_hash, row.session_id, now),
    // D1 enforces the cascading FK. Also keep adapters with FK enforcement off
    // free of orphans, without deleting sessions when authorization lost.
    db.prepare('DELETE FROM sessions WHERE user_id = ?1 AND NOT EXISTS (SELECT 1 FROM users WHERE id = ?1)').bind(row.id),
  ]);
  return result[0].meta.changes === 1;
}

// ------------------------------------------------------------------------------------- sessions
export async function insertSession(db, s, expectedHash = null) {
  const result = await db.batch([
    db.prepare(`INSERT INTO sessions (id, token_hash, user_id, created_at, last_seen_at, expires_at, persistent, user_agent, country)
      SELECT ?1, ?2, ?3, ?4, ?4, ?5, ?6, ?7, ?8 FROM users
      WHERE id = ?3 AND (?9 IS NULL OR password_hash = ?9)`)
      .bind(s.id, s.tokenHash, s.userId, s.now, s.expiresAt, s.persistent ? 1 : 0, s.userAgent, s.country, expectedHash),
    // Keep the issued token even when several logins share a millisecond.
    // UUID lexical order does not identify the newest session in a tie.
    db.prepare(`DELETE FROM sessions WHERE user_id = ?1 AND EXISTS (SELECT 1 FROM sessions WHERE id = ?3 AND user_id = ?1) AND id NOT IN
      (SELECT id FROM sessions WHERE user_id = ?1 ORDER BY (id = ?3) DESC, created_at DESC, id DESC LIMIT ?2)`)
      .bind(s.userId, MAX_SESSIONS_PER_USER, s.id),
    db.prepare(`UPDATE users SET last_login_at = ?2 WHERE id = ?1 AND EXISTS
      (SELECT 1 FROM sessions WHERE id = ?3 AND user_id = ?1)`)
      .bind(s.userId, s.now, s.id),
  ]);
  return result[0].meta.changes === 1;
}

export const sessionWithUser = (db, tokenHash, now) => db.prepare(`SELECT s.id AS session_id, s.expires_at, s.last_seen_at, s.persistent, s.created_at AS session_created_at, u.*
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires_at > ?2`).bind(tokenHash, now).first();

export const touchSession = (db, id, now, expiresAt) =>
  db.prepare('UPDATE sessions SET last_seen_at = ?2, expires_at = ?3 WHERE id = ?1').bind(id, now, expiresAt).run();

export const listSessions = async (db, userId, now) => (await db.prepare(`SELECT id, created_at, last_seen_at, expires_at, persistent, user_agent, country
    FROM sessions WHERE user_id = ?1 AND expires_at > ?2 ORDER BY last_seen_at DESC`).bind(userId, now).all()).results || [];

export const deleteSession = (db, id, userId, actorId = null, now = 0) =>
  db.prepare(`DELETE FROM sessions WHERE id = ?1 AND user_id = ?2 AND (?3 IS NULL OR EXISTS
    (SELECT 1 FROM sessions AS actor WHERE actor.id = ?3 AND actor.user_id = ?2 AND actor.expires_at > ?4))`)
    .bind(id, userId, actorId, now).run();

export const deleteOtherSessions = (db, userId, keepId, actorId = null, now = 0) =>
  db.prepare(`DELETE FROM sessions WHERE user_id = ?1 AND id != ?2 AND (?3 IS NULL OR EXISTS
    (SELECT 1 FROM sessions AS actor WHERE actor.id = ?3 AND actor.user_id = ?1 AND actor.expires_at > ?4))`)
    .bind(userId, keepId, actorId, now).run();

export const deleteSessionByToken = (db, tokenHash) =>
  db.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(tokenHash).run();

// ------------------------------------------------------------------------------------- throttling
export const throttleState = (db, key) =>
  db.prepare('SELECT failures, window_start, locked_until FROM auth_throttle WHERE key = ?1').bind(key).first();

/** Counts one failure in a fixed window; reaching `limit` locks the key for `lockMs`. */
export const throttleHit = (db, key, now, { windowMs, limit, lockMs }) => db.prepare(`INSERT INTO auth_throttle (key, failures, window_start, locked_until)
    VALUES (?1, 1, ?2, CASE WHEN ?4 <= 1 THEN ?2 + ?5 ELSE 0 END)
    ON CONFLICT(key) DO UPDATE SET
      failures = CASE WHEN window_start <= ?2 - ?3 THEN 1 ELSE failures + 1 END,
      locked_until = CASE WHEN (CASE WHEN window_start <= ?2 - ?3 THEN 1 ELSE failures + 1 END) >= ?4 THEN ?2 + ?5 ELSE locked_until END,
      window_start = CASE WHEN window_start <= ?2 - ?3 THEN ?2 ELSE window_start END
    RETURNING failures, locked_until`).bind(key, now, windowMs, limit, lockMs).first();

export const throttleClear = (db, key) => db.prepare('DELETE FROM auth_throttle WHERE key = ?1').bind(key).run();

/** Daily cleanup (cron): expired sessions and idle throttle rows. */
export const purgeExpired = (db, now, idleMs) => db.batch([
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?1').bind(now),
  db.prepare('DELETE FROM auth_throttle WHERE locked_until <= ?1 AND window_start <= ?2').bind(now, now - idleMs),
]);
