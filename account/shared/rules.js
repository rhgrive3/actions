// ZEVANT account rules shared by the browser UI (bundled by Vite) and the Cloudflare Worker.
// Every check returns an error code (string) or null; the UI maps codes to localized text and
// the Worker returns the same codes, so both sides always agree on what is valid.

export const LOGIN_ID_MIN = 3;
export const LOGIN_ID_MAX = 20;
// The game's own name field keeps 16 UTF-16 units (src/main.js setProfileName).
export const DISPLAY_NAME_MAX = 16;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const LOGIN_ID_CHARS = /^[A-Za-z0-9_]+$/;
const RESERVED_IDS = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'staff', 'moderator', 'mod', 'official',
  'zevant', 'inkwave', 'guest', 'player', 'null', 'undefined', 'api', 'account', 'login', 'logout',
]);
// Short list of passwords that are trivially guessed even when they meet the length rule.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890', '11111111', '00000000',
  'qwertyui', 'qwerty123', 'qwertyuiop', 'abcd1234', 'abc12345', 'iloveyou', 'letmein1', 'welcome1',
  'baseball', 'football', 'sunshine', 'princess', 'passw0rd', 'zevant123', 'inkwave1', 'splatoon',
]);

/** Canonical comparison key for a login ID (IDs are case-insensitive, shown as typed). */
export const normalizeLoginId = (v) => String(v ?? '').trim().toLowerCase();

export function checkLoginId(v) {
  const s = String(v ?? '').trim();
  if (!s) return 'login_id_required';
  if (s.length < LOGIN_ID_MIN) return 'login_id_short';
  if (s.length > LOGIN_ID_MAX) return 'login_id_long';
  if (!LOGIN_ID_CHARS.test(s)) return 'login_id_chars';
  if (/^_|_$/.test(s)) return 'login_id_underscore';
  if (RESERVED_IDS.has(s.toLowerCase())) return 'login_id_reserved';
  return null;
}

// Invisible or text-direction characters that could spoof another player's name (ZWJ stays: emoji sequences).
const HIDDEN_CHARS = /[\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/u;
const CONTROL_CHARS = /\p{Cc}/u;

/** Display names: NFC and single spaces (tabs/newlines become spaces). */
export function cleanDisplayName(v) {
  return String(v ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim();
}

export function checkDisplayName(v) {
  const raw = String(v ?? '');
  const s = cleanDisplayName(raw);
  if (!s) return 'display_name_required';
  if (s.length > DISPLAY_NAME_MAX) return 'display_name_long';
  if (CONTROL_CHARS.test(s) || HIDDEN_CHARS.test(s)) return 'display_name_chars';
  return null;
}

export function checkPassword(v, loginId = '') {
  const s = String(v ?? '');
  if (!s) return 'password_required';
  if (s.length < PASSWORD_MIN) return 'password_short';
  if (s.length > PASSWORD_MAX) return 'password_long';
  const lower = s.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || /^(.)\1+$/.test(s)) return 'password_common';
  if (loginId && lower.includes(normalizeLoginId(loginId)) && normalizeLoginId(loginId).length >= LOGIN_ID_MIN) return 'password_contains_id';
  return null;
}

/** 0..4 strength estimate for the meter. Cheap heuristics only; the server enforces checkPassword. */
export function passwordScore(v, loginId = '') {
  const s = String(v ?? '');
  if (!s || checkPassword(s, loginId)) return 0;
  let classes = 0;
  if (/[a-z]/.test(s)) classes++;
  if (/[A-Z]/.test(s)) classes++;
  if (/[0-9]/.test(s)) classes++;
  if (/[^A-Za-z0-9]/.test(s)) classes++;
  const unique = new Set(s).size;
  let score = 1;
  if (s.length >= 10 && classes >= 2) score++;
  if (s.length >= 12 && classes >= 3) score++;
  if (s.length >= 16 && unique >= 10) score++;
  if (unique < 5) score = Math.min(score, 1);
  return Math.max(1, Math.min(4, score));
}

// Player icons and their background inks (account/client/src/art.js draws them).
export const AVATAR_ICONS = ['squid', 'octo', 'jelly', 'fish', 'crab', 'star'];
export const AVATAR_COLORS = ['#ff8a14', '#2f5bff', '#ff3d9a', '#3fd16f', '#12c8e0', '#f5d50b', '#9b5cff', '#ff5a3c'];
export const checkAvatarIcon = (v) => (AVATAR_ICONS.includes(v) ? null : 'avatar_invalid');
export const checkAvatarColor = (v) => (AVATAR_COLORS.includes(v) ? null : 'avatar_invalid');
