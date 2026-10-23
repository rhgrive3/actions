// Small inline SVG art for the account UI: icons, ink splats and player avatars.

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

const INKS = ['#ff8a14', '#2f5bff', '#ff3d9a', '#3fd16f', '#12c8e0', '#f5d50b', '#9b5cff', '#ff5a3c'];

export const inkFor = (key) => INKS[hashString(String(key || '').toLowerCase()) % INKS.length];

// The game's squid mascot (src/ui/ui-icons.js SQUID), drawn in a 64 box.
const SQUID_BODY = '<path d="M22 44 Q19 53 13 58 Q20 61 26 50 Z"/><path d="M29 46 Q28.5 55 25 61 Q32.5 61 33 48 Z"/>'
  + '<path d="M35 46 Q35.5 55 39 61 Q31.5 61 31 48 Z"/><path d="M42 44 Q45 53 51 58 Q44 61 38 50 Z"/>'
  + '<path d="M32 3 C36.5 3 50.5 17.5 55.5 24.5 C57.5 27.8 55.5 31 51.5 30.2 L46 29.4 L46 39.5 C46 46.5 41.5 49 32 49 C22.5 49 18 46.5 18 39.5 L18 29.4 L12.5 30.2 C8.5 31 6.5 27.8 8.5 24.5 C13.5 17.5 27.5 3 32 3 Z"/>';
const SQUID_EYES = '<ellipse cx="26" cy="36" rx="4.6" ry="5.6" fill="#fff" stroke="#15121c" stroke-width="2.4"/><ellipse cx="38" cy="36" rx="4.6" ry="5.6" fill="#fff" stroke="#15121c" stroke-width="2.4"/>'
  + '<ellipse cx="27" cy="37" rx="2.2" ry="3" fill="#15121c"/><ellipse cx="37" cy="37" rx="2.2" ry="3" fill="#15121c"/>';

function squid(fill) {
  return `<g transform="translate(23 21) scale(.84)"><g fill="${fill}" stroke="#15121c" stroke-width="3.4" stroke-linejoin="round">${SQUID_BODY}</g>`
    + `<path d="M25 13 Q29 8.5 32 8" stroke="#fff" stroke-opacity=".55" stroke-width="3" fill="none" stroke-linecap="round"/>${SQUID_EYES}</g>`;
}

/** Player avatar: a splat in the player's ink with the game's squid on it (guests: a grey squid). */
export function avatarSVG(user) {
  if (!user) return `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="${splatPath(7)}" fill="rgba(255,255,255,.14)"/>${squid('#8d86a6')}</svg>`;
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="${splatPath(hashString(user.loginId))}" fill="${inkFor(user.loginId)}"/>${squid('#fff')}</svg>`;
}
