// Account UI text. Follows the game's language setting (inkwave.settings.lang; Japanese by default).

const readLang = () => {
  try {
    const s = JSON.parse(localStorage.getItem('inkwave.settings') || 'null');
    if (s && (s.lang === 'en' || s.lang === 'ja')) return s.lang;
  } catch { /* private mode */ }
  return 'ja';
};
export const LANG = readLang();

// Menu card lines ship with the entry; the dialog adds the rest (strings.js) when it loads.
const JA = {
  'chip.loading': 'アカウントを確認中…',
  'chip.guest': 'ゲストでプレイ中',
  'chip.guestSub': 'ログイン / 新規登録',
  'chip.userSub': '@{id} · ログイン中',
  'chip.offline': 'オフライン',
  'chip.offlineSub': '',
  'chip.signIn': 'ログイン',
  'chip.open': 'アカウント',
  'chip.desc.guest': 'ログイン・新規登録',
  'chip.desc.user': 'アカウントの設定',
};

const EN = {
  'chip.loading': 'Checking account…',
  'chip.guest': 'Playing as guest',
  'chip.guestSub': 'Sign in / Create account',
  'chip.userSub': '@{id} · Signed in',
  'chip.offline': 'Offline',
  'chip.offlineSub': 'Will check again when you reconnect',
  'chip.signIn': 'SIGN IN',
  'chip.open': 'ACCOUNT',
  'chip.desc.guest': 'Sign in to keep your player name with your account',
  'chip.desc.user': 'Manage your player name, password and signed-in devices',
};

const DICT = LANG === 'en' ? EN : JA;

/** Adds dictionaries (Japanese, English); keys missing in English fall back to Japanese. */
export function addStrings(ja, en) {
  Object.assign(JA, ja);
  Object.assign(EN, en);
}

export function t(key, vars) {
  let s = DICT[key] ?? JA[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  return s;
}

export function errorText(code, extra = {}) {
  if (code === 'rate_limited') return t('err.rate_limited', { time: duration(extra.retryAfter || 60) });
  return DICT['err.' + code] ? t('err.' + code) : t('err.unknown');
}

export function duration(sec) {
  const s = Math.max(1, Math.ceil(sec));
  if (s < 60) return t('time.sec', { n: s });
  const m = Math.floor(s / 60), r = s % 60;
  return r ? t('time.minsec', { m, s: r }) : t('time.min', { n: m });
}

const locale = LANG === 'en' ? 'en' : 'ja';
export const formatDate = (ms) => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(ms));

export function relativeTime(ms, now = Date.now()) {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const d = (ms - now) / 1000;
  const abs = Math.abs(d);
  if (abs < 60) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(d / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(d / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(d / 86400), 'day');
  return formatDate(ms);
}
