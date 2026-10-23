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

// ------------------------------------------------------------------------------------- sessions
export async function insertSession(db, s) {
  await db.batch([
    db.prepare(`INSERT INTO sessions (id, token_hash, user_id, created_at, last_seen_at, expires_at, persistent, user_agent, country)
      VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6, ?7, ?8)`)
      .bind(s.id, s.tokenHash, s.userId, s.now, s.expiresAt, s.persistent ? 1 : 0, s.userAgent, s.country),
    // keep the newest MAX_SESSIONS_PER_USER sign-ins per account
    db.prepare(`DELETE FROM sessions WHERE user_id = ?1 AND id NOT IN
      (SELECT id FROM sessions WHERE user_id = ?1 ORDER BY created_at DESC, id DESC LIMIT ?2)`)
      .bind(s.userId, MAX_SESSIONS_PER_USER),
  ]);
}

export const sessionWithUser = (db, tokenHash, now) => db.prepare(`SELECT s.id AS session_id, s.expires_at, s.last_seen_at, s.persistent, s.created_at AS session_created_at, u.*
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires_at > ?2`).bind(tokenHash, now).first();

export const touchSession = (db, id, now, expiresAt) =>
  db.prepare('UPDATE sessions SET last_seen_at = ?2, expires_at = ?3 WHERE id = ?1').bind(id, now, expiresAt).run();

export const listSessions = async (db, userId, now) => (await db.prepare(`SELECT id, created_at, last_seen_at, expires_at, persistent, user_agent, country
    FROM sessions WHERE user_id = ?1 AND expires_at > ?2 ORDER BY last_seen_at DESC`).bind(userId, now).all()).results || [];

export const deleteSession = (db, id, userId) =>
  db.prepare('DELETE FROM sessions WHERE id = ?1 AND user_id = ?2').bind(id, userId).run();

export const deleteOtherSessions = (db, userId, keepId) =>
  db.prepare('DELETE FROM sessions WHERE user_id = ?1 AND id != ?2').bind(userId, keepId).run();

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
