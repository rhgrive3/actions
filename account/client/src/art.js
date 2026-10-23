// Small inline SVG art for the account UI: icons, ink splats and player avatars.
import { AVATAR_COLORS as INKS } from '../../shared/rules.js';

export const svg = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;
export const stroke = (d) => svg(`<path d="${d}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`);

/** Icons the menu card needs; the dialog's full set is in icons.js. */
export const CORE_ICONS = {
  user: stroke('M12 12a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4ZM4 20.5c1.4-3.6 4.4-5.4 8-5.4s6.6 1.8 8 5.4'),
  chevron: stroke('M9.5 5.5 16 12l-6.5 6.5'),
  cloudOff: stroke('M3.5 3.5l17 17M9.3 6.5a6 6 0 0 1 8.8 4.05 4 4 0 0 1 2.4 6.6M16.5 18.5H7a4.75 4.75 0 0 1-.9-9.4'),
};

// Deterministic PRNG so the same player always gets the same splat.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** An ink splat path in a 100×100 box: a round body with `arms` rounded lobes (six spline points per lobe). */
export function splatPath(seed, { r = 34, arms = 8, reach = 12 } = {}) {
  const rand = rng(seed), pts = [], n = arms * 6;
  const phase = rand() * Math.PI * 2;
  const PROFILE = [1, .78, .3, -.12, .3, .78];   // lobe tip, shoulders, valley between lobes
  let lobe = 1;
  for (let i = 0; i < n; i++) {
    if (i % 6 === 0) lobe = 0.45 + rand() * 0.75;
    const a = phase + (i / n) * Math.PI * 2;
    const k = PROFILE[i % 6];
    const rad = r + (k > 0 ? reach * k * lobe : reach * k) + (rand() - 0.5) * 1.6;
    pts.push([50 + Math.cos(a) * rad, 50 + Math.sin(a) * rad]);
  }
  // closed Catmull-Rom spline through the points
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}


export const inkFor = (key) => INKS[hashString(String(key || '').toLowerCase()) % INKS.length];

// Player icons in a 64 box: outlined ink-coloured body + the game's mascot eyes. The squid is the game's own
// mascot (src/ui/ui-icons.js SQUID); the others are drawn to match it.
const K = '#15121c';
const eyes = (y, gap = 6, r = 1) => `<ellipse cx="${32 - gap}" cy="${y}" rx="${4.6 * r}" ry="${5.6 * r}" fill="#fff" stroke="${K}" stroke-width="2.4"/>`
  + `<ellipse cx="${32 + gap}" cy="${y}" rx="${4.6 * r}" ry="${5.6 * r}" fill="#fff" stroke="${K}" stroke-width="2.4"/>`
  + `<ellipse cx="${33 - gap}" cy="${y + 1}" rx="${2.2 * r}" ry="${3 * r}" fill="${K}"/><ellipse cx="${31 + gap}" cy="${y + 1}" rx="${2.2 * r}" ry="${3 * r}" fill="${K}"/>`;
const shine = (d) => `<path d="${d}" stroke="#fff" stroke-opacity=".55" stroke-width="3" fill="none" stroke-linecap="round"/>`;
const starPath = (() => {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 13 : 28;
    d += `${i ? 'L' : 'M'}${(32 + Math.cos(a) * r).toFixed(1)} ${(34 + Math.sin(a) * r).toFixed(1)}`;
  }
  return d + 'Z';
})();

const ICON_ART = {
  squid: {
    body: '<path d="M22 44 Q19 53 13 58 Q20 61 26 50 Z"/><path d="M29 46 Q28.5 55 25 61 Q32.5 61 33 48 Z"/>'
      + '<path d="M35 46 Q35.5 55 39 61 Q31.5 61 31 48 Z"/><path d="M42 44 Q45 53 51 58 Q44 61 38 50 Z"/>'
      + '<path d="M32 3 C36.5 3 50.5 17.5 55.5 24.5 C57.5 27.8 55.5 31 51.5 30.2 L46 29.4 L46 39.5 C46 46.5 41.5 49 32 49 C22.5 49 18 46.5 18 39.5 L18 29.4 L12.5 30.2 C8.5 31 6.5 27.8 8.5 24.5 C13.5 17.5 27.5 3 32 3 Z"/>',
    extra: shine('M25 13 Q29 8.5 32 8') + eyes(36),
  },
  octo: {
    body: '<path d="M32 5 C46 5 53 15 53 27 C53 34 50 39 47 42 Q52 50 58 51 Q53 58 43 50 Q43 56 46 60 Q37 61 37 50 Q35 56 32 60 Q29 56 27 50 Q27 61 18 60 Q21 56 21 50 Q11 58 6 51 Q12 50 17 42 C14 39 11 34 11 27 C11 15 18 5 32 5 Z"/>',
    extra: shine('M21 15 Q25 10 30 9.5') + eyes(30, 7),
  },
  jelly: {
    body: '<path d="M21 40 Q16 48 21 53 Q25 58 20 62 M32 41 Q28 49 33 54 Q37 58 32 62 M43 40 Q39 48 44 53 Q48 58 43 62" fill="none" stroke-width="3.4" stroke-linecap="round"/>'
      + '<path d="M8 38 C8 19 19 8 32 8 C45 8 56 19 56 38 Q52 43 47 38 Q43 43 39.5 38 Q36 43 32 38 Q28 43 24.5 38 Q21 43 17 38 Q12 43 8 38 Z"/>',
    extra: shine('M17 21 Q22 14 29 12.5') + eyes(27, 7),
  },
  fish: {
    body: '<path d="M6 33 C13 18 33 15 44 26 L57 15 C59 21 57 28 54 33 C57 38 59 45 57 51 L44 40 C33 51 13 48 6 33 Z"/>'
      + '<path d="M26 17 Q31 9 39 11 L37 21 Z"/>',
    extra: '<ellipse cx="20" cy="30" rx="4.6" ry="5.6" fill="#fff" stroke="#15121c" stroke-width="2.4"/><ellipse cx="21" cy="31" rx="2.2" ry="3" fill="#15121c"/>'
      + '<path d="M11 37 Q15 39 19 37.5" stroke="#15121c" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
  },
  crab: {
    body: '<path d="M14 40 L5 46 M15 45 L8 53 M50 40 L59 46 M49 45 L56 53" fill="none" stroke-width="3.4" stroke-linecap="round"/>'
      + '<path d="M17 30 L12 19 M47 30 L52 19" fill="none" stroke-width="3.4"/>'
      + '<path d="M12 4 C4 6 3 17 10 21 C15 23 19 19 18 14 L13 15 L16 9 Z"/><path d="M52 4 C60 6 61 17 54 21 C49 23 45 19 46 14 L51 15 L48 9 Z"/>'
      + '<path d="M10 40 C10 29 20 24 32 24 C44 24 54 29 54 40 C54 50 44 55 32 55 C20 55 10 50 10 40 Z"/>',
    extra: shine('M17 33 Q21 28 27 27') + '<path d="M27 25 L26 17 M37 25 L38 17" stroke="#15121c" stroke-width="3"/>'
      + eyes(15, 6, .8) + '<path d="M27 45 Q32 49 37 45" stroke="#15121c" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  },
  star: {
    body: `<path d="${starPath}"/>`,
    extra: shine('M27 15 L30 9') + eyes(34, 5, .85),
  },
};

function iconMarkup(name, fill) {
  const art = ICON_ART[name] || ICON_ART.squid;
  return `<g transform="translate(23 21) scale(.84)"><g fill="${fill}" stroke="${K}" stroke-width="3.4" stroke-linejoin="round">${art.body}</g>${art.extra}</g>`;
}

/** Player avatar: the chosen icon in white on a splat of the chosen ink (defaults: squid, ink from the login id).
 *  `user` may be a preview { loginId, avatarIcon, avatarColor }. Guests get a grey squid. */
export function avatarSVG(user) {
  if (!user) return `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="${splatPath(7)}" fill="rgba(255,255,255,.14)"/>${iconMarkup('squid', '#8d86a6')}</svg>`;
  const ink = user.avatarColor || inkFor(user.loginId);
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="${splatPath(hashString(user.loginId))}" fill="${ink}"/>${iconMarkup(user.avatarIcon, '#fff')}</svg>`;
}
