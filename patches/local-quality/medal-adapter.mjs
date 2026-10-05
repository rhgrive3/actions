// Build-only Splatoon 3 Turf War medal system parity (Issue #502).
// Upstream inkwave-public/ remains completely byte-identical.
// Evaluates valid Splatoon 3 categories against player's teammates only (isolated from opponents),
// respects gold/silver tiers (no bronze, no MVP), applies authoritative priority ordering,
// caps displayed medals at maximum 3, handles ties and zeros, and preserves Boss battle awards.

export function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE medal patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

// Splatoon 3 Ver. 11.3.0 award taxonomy (primary datamine: https://leanny.github.io/splat3/medals.html)
// Categories are evaluated strictly top-to-bottom in the gold and silver arrays.
export const S3_AWARDS = {
  // Gold Medals
  Battle: { id: 'overall_splatter', s3Id: 'Battle', label: '#1 Overall Splatter', metal: 'gold', icon: 'splat', desc: 'Most splats and assists on your team', available: false },
  Paint: { id: 'turf_inker', s3Id: 'Paint', label: '#1 Turf Inker', metal: 'gold', icon: 'roller', desc: 'Most turf inked on your team', available: true },
  Standout: { id: 'Standout', s3Id: 'Standout', label: '#1 Popular Target', metal: 'gold', icon: 'shield', desc: 'Most time in enemy sights', available: false },
  NawabariPaintMyTeamArea: { id: 'NawabariPaintMyTeamArea', s3Id: 'NawabariPaintMyTeamArea', label: '#1 Home-Base Inker', metal: 'gold', icon: 'roller', desc: 'Most home base turf inked', available: false },
  NawabariPaintOpTeamArea: { id: 'NawabariPaintOpTeamArea', s3Id: 'NawabariPaintOpTeamArea', label: '#1 Enemy-Base Inker', metal: 'gold', icon: 'roller', desc: 'Most enemy base turf inked', available: false },
  SuperJumpTarget: { id: 'SuperJumpTarget', s3Id: 'SuperJumpTarget', label: '#1 Super Jump Spot', metal: 'gold', icon: 'wave', desc: 'Most super jumped to by teammates', available: false },
  Kill: { id: 'enemy_splatter', s3Id: 'Kill', label: '#1 Enemy Splatter', metal: 'gold', icon: 'splat', desc: 'Most splats on your team', available: true },
  KillAssist: { id: 'splat_assister', s3Id: 'KillAssist', label: '#1 Splat Assister', metal: 'gold', icon: 'splat', desc: 'Most assists on your team', available: false },

  // Silver Medals
  NawabariDefenseMyTeamArea: { id: 'NawabariDefenseMyTeamArea', s3Id: 'NawabariDefenseMyTeamArea', label: '#1 Base Defender', metal: 'silver', icon: 'shield', desc: 'Most base defense splats and assists', available: false },
  FirstSplat: { id: 'FirstSplat', s3Id: 'FirstSplat', label: 'First Splat!', metal: 'silver', icon: 'star', desc: 'First splat of the match', available: false },
  Battle2: { id: 'overall_splatter_2', s3Id: 'Battle2', label: '#2 Overall Splatter', metal: 'silver', icon: 'splat', desc: '2nd most splats and assists on your team', available: false },
  Paint2: { id: 'turf_inker_2', s3Id: 'Paint2', label: '#2 Turf Inker', metal: 'silver', icon: 'roller', desc: '2nd most turf inked on your team', available: true },
  Standout2: { id: 'Standout2', s3Id: 'Standout2', label: '#2 Popular Target', metal: 'silver', icon: 'shield', desc: '2nd most time in enemy sights', available: false },
  NawabariPaintMyTeamArea2: { id: 'NawabariPaintMyTeamArea2', s3Id: 'NawabariPaintMyTeamArea2', label: '#2 Home-Base Inker', metal: 'silver', icon: 'roller', desc: '2nd most home base turf inked', available: false },
  NawabariPaintOpTeamArea2: { id: 'NawabariPaintOpTeamArea2', s3Id: 'NawabariPaintOpTeamArea2', label: '#2 Enemy-Base Inker', metal: 'silver', icon: 'roller', desc: '2nd most enemy base turf inked', available: false },
  SuperJumpTarget2: { id: 'SuperJumpTarget2', s3Id: 'SuperJumpTarget2', label: '#2 Super Jump Spot', metal: 'silver', icon: 'wave', desc: '2nd most super jumped to by teammates', available: false },
  Kill2: { id: 'enemy_splatter_2', s3Id: 'Kill2', label: '#2 Enemy Splatter', metal: 'silver', icon: 'splat', desc: '2nd most splats on your team', available: true },
  KillAssist2: { id: 'splat_assister_2', s3Id: 'KillAssist2', label: '#2 Splat Assister', metal: 'silver', icon: 'splat', desc: '2nd most assists on your team', available: false },
};

// Aliases for dual lookup (by ROM ID or snake_case ID)
S3_AWARDS.overall_splatter = S3_AWARDS.Battle;
S3_AWARDS.overall_splatter_2 = S3_AWARDS.Battle2;
S3_AWARDS.turf_inker = S3_AWARDS.Paint;
S3_AWARDS.turf_inker_2 = S3_AWARDS.Paint2;
S3_AWARDS.enemy_splatter = S3_AWARDS.Kill;
S3_AWARDS.enemy_splatter_2 = S3_AWARDS.Kill2;
S3_AWARDS.splat_assister = S3_AWARDS.KillAssist;
S3_AWARDS.splat_assister_2 = S3_AWARDS.KillAssist2;

// Authoritative Splatoon 3 evaluation priority hierarchy (Gold always precedes Silver)
// Sourced from primary authored datamine list order: https://leanny.github.io/splat3/medals.html
export const S3_PRIORITY_RANKS = {
  // Gold (top-to-bottom array order)
  Battle: 1, overall_splatter: 1,
  Paint: 10, turf_inker: 10,
  Standout: 11,
  NawabariPaintMyTeamArea: 12,
  NawabariPaintOpTeamArea: 13,
  SuperJumpTarget: 14,
  Kill: 15, enemy_splatter: 15,
  KillAssist: 16, splat_assister: 16,

  // Silver (top-to-bottom array order)
  NawabariDefenseMyTeamArea: 108,
  FirstSplat: 112,
  Battle2: 132, overall_splatter_2: 132,
  Paint2: 139, turf_inker_2: 139,
  Standout2: 140,
  NawabariPaintMyTeamArea2: 141,
  NawabariPaintOpTeamArea2: 142,
  SuperJumpTarget2: 143,
  Kill2: 144, enemy_splatter_2: 144,
  KillAssist2: 145, splat_assister_2: 145,
};

export const S3_AWARD_ORDER = [
  'Battle', 'overall_splatter',
  'Paint', 'turf_inker',
  'Standout',
  'NawabariPaintMyTeamArea',
  'NawabariPaintOpTeamArea',
  'SuperJumpTarget',
  'Kill', 'enemy_splatter',
  'KillAssist', 'splat_assister',
  'NawabariDefenseMyTeamArea',
  'FirstSplat',
  'Battle2', 'overall_splatter_2',
  'Paint2', 'turf_inker_2',
  'Standout2',
  'NawabariPaintMyTeamArea2',
  'NawabariPaintOpTeamArea2',
  'SuperJumpTarget2',
  'Kill2', 'enemy_splatter_2',
  'KillAssist2', 'splat_assister_2',
];

const MENU_ART_AWARDS_BEFORE = `export const AWARDS = {
  mvp: { label: 'MVP', metal: 'gold', icon: 'star', desc: 'Best all-round score on the winning team' },
  turf: { label: 'TURF KING', metal: 'gold', icon: 'crown', desc: 'Most turf inked in the match' },
  splats: { label: 'TOP SPLATTER', metal: 'silver', icon: 'splat', desc: 'Most splats in the match' },
  inker: { label: 'TOP INKER', metal: 'silver', icon: 'roller', desc: 'Most turf inked on their team' },
  untouchable: { label: 'UNTOUCHABLE', metal: 'bronze', icon: 'shield', desc: 'Never got splatted' },
  survivor: { label: 'SURVIVOR', metal: 'bronze', icon: 'buoy', desc: 'Splatted the fewest times' },
  pure: { label: 'PURE PAINTER', metal: 'bronze', icon: 'brush', desc: 'Top-3 turf without splatting anyone' },
};
const AWARD_ORDER = ['mvp', 'turf', 'splats', 'inker', 'untouchable', 'survivor', 'pure'];`;

const MENU_ART_AWARDS_AFTER = `export const AWARDS = {
  // Gold Medals (Splatoon 3 primary datamine: https://leanny.github.io/splat3/medals.html)
  Battle: { id: 'overall_splatter', s3Id: 'Battle', label: '#1 Overall Splatter', metal: 'gold', icon: 'splat', desc: 'Most splats and assists on your team', available: false },
  Paint: { id: 'turf_inker', s3Id: 'Paint', label: '#1 Turf Inker', metal: 'gold', icon: 'roller', desc: 'Most turf inked on your team', available: true },
  Standout: { id: 'Standout', s3Id: 'Standout', label: '#1 Popular Target', metal: 'gold', icon: 'shield', desc: 'Most time in enemy sights', available: false },
  NawabariPaintMyTeamArea: { id: 'NawabariPaintMyTeamArea', s3Id: 'NawabariPaintMyTeamArea', label: '#1 Home-Base Inker', metal: 'gold', icon: 'roller', desc: 'Most home base turf inked', available: false },
  NawabariPaintOpTeamArea: { id: 'NawabariPaintOpTeamArea', s3Id: 'NawabariPaintOpTeamArea', label: '#1 Enemy-Base Inker', metal: 'gold', icon: 'roller', desc: 'Most enemy base turf inked', available: false },
  SuperJumpTarget: { id: 'SuperJumpTarget', s3Id: 'SuperJumpTarget', label: '#1 Super Jump Spot', metal: 'gold', icon: 'wave', desc: 'Most super jumped to by teammates', available: false },
  Kill: { id: 'enemy_splatter', s3Id: 'Kill', label: '#1 Enemy Splatter', metal: 'gold', icon: 'splat', desc: 'Most splats on your team', available: true },
  KillAssist: { id: 'splat_assister', s3Id: 'KillAssist', label: '#1 Splat Assister', metal: 'gold', icon: 'splat', desc: 'Most assists on your team', available: false },

  // Silver Medals (Splatoon 3 primary datamine: https://leanny.github.io/splat3/medals.html)
  NawabariDefenseMyTeamArea: { id: 'NawabariDefenseMyTeamArea', s3Id: 'NawabariDefenseMyTeamArea', label: '#1 Base Defender', metal: 'silver', icon: 'shield', desc: 'Most base defense splats and assists', available: false },
  FirstSplat: { id: 'FirstSplat', s3Id: 'FirstSplat', label: 'First Splat!', metal: 'silver', icon: 'star', desc: 'First splat of the match', available: false },
  Battle2: { id: 'overall_splatter_2', s3Id: 'Battle2', label: '#2 Overall Splatter', metal: 'silver', icon: 'splat', desc: '2nd most splats and assists on your team', available: false },
  Paint2: { id: 'turf_inker_2', s3Id: 'Paint2', label: '#2 Turf Inker', metal: 'silver', icon: 'roller', desc: '2nd most turf inked on your team', available: true },
  Standout2: { id: 'Standout2', s3Id: 'Standout2', label: '#2 Popular Target', metal: 'silver', icon: 'shield', desc: '2nd most time in enemy sights', available: false },
  NawabariPaintMyTeamArea2: { id: 'NawabariPaintMyTeamArea2', s3Id: 'NawabariPaintMyTeamArea2', label: '#2 Home-Base Inker', metal: 'silver', icon: 'roller', desc: '2nd most home base turf inked', available: false },
  NawabariPaintOpTeamArea2: { id: 'NawabariPaintOpTeamArea2', s3Id: 'NawabariPaintOpTeamArea2', label: '#2 Enemy-Base Inker', metal: 'silver', icon: 'roller', desc: '2nd most enemy base turf inked', available: false },
  SuperJumpTarget2: { id: 'SuperJumpTarget2', s3Id: 'SuperJumpTarget2', label: '#2 Super Jump Spot', metal: 'silver', icon: 'wave', desc: '2nd most super jumped to by teammates', available: false },
  Kill2: { id: 'enemy_splatter_2', s3Id: 'Kill2', label: '#2 Enemy Splatter', metal: 'silver', icon: 'splat', desc: '2nd most splats on your team', available: true },
  KillAssist2: { id: 'splat_assister_2', s3Id: 'KillAssist2', label: '#2 Splat Assister', metal: 'silver', icon: 'splat', desc: '2nd most assists on your team', available: false },
};
// Aliases for lookup flexibility
AWARDS.overall_splatter = AWARDS.Battle;
AWARDS.overall_splatter_2 = AWARDS.Battle2;
AWARDS.turf_inker = AWARDS.Paint;
AWARDS.turf_inker_2 = AWARDS.Paint2;
AWARDS.enemy_splatter = AWARDS.Kill;
AWARDS.enemy_splatter_2 = AWARDS.Kill2;
AWARDS.splat_assister = AWARDS.KillAssist;
AWARDS.splat_assister_2 = AWARDS.KillAssist2;

export const S3_PRIORITY_RANKS = {
  Battle: 1, overall_splatter: 1,
  Paint: 10, turf_inker: 10,
  Standout: 11,
  NawabariPaintMyTeamArea: 12,
  NawabariPaintOpTeamArea: 13,
  SuperJumpTarget: 14,
  Kill: 15, enemy_splatter: 15,
  KillAssist: 16, splat_assister: 16,
  NawabariDefenseMyTeamArea: 108,
  FirstSplat: 112,
  Battle2: 132, overall_splatter_2: 132,
  Paint2: 139, turf_inker_2: 139,
  Standout2: 140,
  NawabariPaintMyTeamArea2: 141,
  NawabariPaintOpTeamArea2: 142,
  SuperJumpTarget2: 143,
  Kill2: 144, enemy_splatter_2: 144,
  KillAssist2: 145, splat_assister_2: 145,
};

const AWARD_ORDER = [
  'Battle', 'overall_splatter',
  'Paint', 'turf_inker',
  'Standout',
  'NawabariPaintMyTeamArea',
  'NawabariPaintOpTeamArea',
  'SuperJumpTarget',
  'Kill', 'enemy_splatter',
  'KillAssist', 'splat_assister',
  'NawabariDefenseMyTeamArea',
  'FirstSplat',
  'Battle2', 'overall_splatter_2',
  'Paint2', 'turf_inker_2',
  'Standout2',
  'NawabariPaintMyTeamArea2',
  'NawabariPaintOpTeamArea2',
  'SuperJumpTarget2',
  'Kill2', 'enemy_splatter_2',
  'KillAssist2', 'splat_assister_2',
];`;

const MENU_ART_COMPUTE_BEFORE = `export function computeAwards(players = [], { win = true, percents = [50, 50] } = {}) {
  const P = players.map((p, i) => ({ i, team: p.team | 0, turf: Math.max(0, +p.turf || 0), splats: Math.max(0, +p.splats || 0), deaths: Math.max(0, +p.deaths || 0), isSelf: !!p.isSelf }));
  const by = P.map(() => []);
  const give = (p, id, value) => { if (!by[p.i].some((a) => a.id === id)) by[p.i].push({ id, ...AWARDS[id], label: tr(AWARDS[id].label), desc: tr(AWARDS[id].desc), value }); };
  const maxOf = (k, arr = P) => (arr.length ? Math.max(...arr.map((p) => p[k])) : 0);
  if (P.length) {
    // Turf King — most turf in the lobby (ties share the crown)
    const mt = maxOf('turf');
    const kings = mt > 0 ? P.filter((p) => p.turf === mt) : [];
    kings.forEach((p) => give(p, 'turf', tr('{n}p inked', { n: fmtInt(p.turf) })));
    // Top Inker — best painter on each team that doesn't already hold the crown
    for (const t of [0, 1]) {
      const team = P.filter((p) => p.team === t);
      if (!team.length || team.some((p) => kings.includes(p))) continue;
      const m = maxOf('turf', team);
      if (m > 0) team.filter((p) => p.turf === m).forEach((p) => give(p, 'inker', tr('{n}p inked', { n: fmtInt(p.turf) })));
    }
    // Top Splatter
    const ms = maxOf('splats');
    if (ms > 0) P.filter((p) => p.splats === ms).forEach((p) => give(p, 'splats', tr(ms === 1 ? '{n} splat' : '{n} splats', { n: ms })));
    // Untouchable (never splatted — only special when few managed it) / Survivor (unique fewest)
    const active = P.filter((p) => p.turf >= 30 || p.splats > 0);
    const zero = active.filter((p) => p.deaths === 0);
    if (zero.length && zero.length <= 3) zero.forEach((p) => give(p, 'untouchable', tr('Never splatted')));
    else if (!zero.length && active.length) {
      const md = Math.min(...active.map((p) => p.deaths));
      const s = active.filter((p) => p.deaths === md);
      if (s.length === 1) give(s[0], 'survivor', tr('Splatted {n}×', { n: md }));
    }
    // Pure Painter — top-3 turf with zero splats
    [...P].sort((a, b) => b.turf - a.turf).slice(0, 3).filter((p) => p.splats === 0 && p.turf > 0).forEach((p) => give(p, 'pure', tr('{n}p · 0 splats', { n: fmtInt(p.turf) })));
    // MVP — best normalised all-round score on the winning team
    const self = P.find((p) => p.isSelf);
    const selfTeam = self ? self.team : 0;
    const wt = win ? selfTeam : 1 - selfTeam;
    const mT = Math.max(1, mt), mS = Math.max(1, ms), mD = Math.max(1, maxOf('deaths'));
    const score = (p) => p.turf / mT + 0.55 * (p.splats / mS) - 0.3 * (p.deaths / mD);
    const winners = P.filter((p) => p.team === wt && (p.turf > 0 || p.splats > 0));
    if (winners.length) {
      const best = winners.reduce((b, p) => (score(p) > score(b) + 1e-9 || (Math.abs(score(p) - score(b)) < 1e-9 && p.turf > b.turf) ? p : b));
      give(best, 'mvp', tr('Top all-round score'));
    }
    for (const list of by) list.sort((x, y) => AWARD_ORDER.indexOf(x.id) - AWARD_ORDER.indexOf(y.id));
  }
  // match tags from the final coverage margin (percentage points)
  let [pa, pb] = (percents || [50, 50]).map((v) => +v || 0);
  if (pa <= 1.0001 && pb <= 1.0001) { pa *= 100; pb *= 100; }
  const margin = Math.abs(pa - pb);
  const match = [];
  for (const k in MATCH_TAGS) MATCH_TAGS[k].label = tr(MATCH_TAGS[k].label);
  if (margin < 3) match.push({ ...MATCH_TAGS.close, value: tr('{n}% margin', { n: margin.toFixed(1) }) });
  else if (margin >= 20) match.push({ ...MATCH_TAGS.landslide, value: \`+\${margin.toFixed(1)}%\` });
  return { byPlayer: by, match };
}`;

const MENU_ART_COMPUTE_AFTER = `export function computeAwards(players = [], { win = true, percents = [50, 50] } = {}) {
  const P = players.map((p, i) => ({
    ...p,
    i,
    team: p.team | 0,
    turf: Math.max(0, +p.turf || 0),
    splats: Math.max(0, +p.splats || 0),
    deaths: Math.max(0, +p.deaths || 0),
    isSelf: !!p.isSelf,
  }));
  const by = P.map(() => []);
  const give = (p, id, value) => {
    const def = AWARDS[id];
    if (!def) return;
    const medalId = def.id || id;
    if (!by[p.i].some((a) => a.id === medalId || a.id === id || (def.s3Id && a.s3Id === def.s3Id))) {
      by[p.i].push({ id: medalId, s3Id: def.s3Id || id, label: tr(def.label), metal: def.metal, icon: def.icon, desc: tr(def.desc), value });
    }
  };

  // Evaluate awards strictly within teammates (independent of opponents)
  const teams = [...new Set(P.map((p) => p.team))];
  for (const teamId of teams) {
    const team = P.filter((p) => p.team === teamId);
    if (!team.length) continue;

    const evalMetric = (getter, goldId, silverId, fmt) => {
      const hasPositive = team.some((p) => {
        const v = getter(p);
        return typeof v === 'number' && Number.isFinite(v) && v > 0;
      });
      if (!hasPositive) return;

      for (const p of team) {
        const val = getter(p);
        if (typeof val !== 'number' || !Number.isFinite(val) || val <= 0) continue;
        const strictlyHigher = team.filter((other) => {
          const ov = getter(other);
          return typeof ov === 'number' && Number.isFinite(ov) && ov > val;
        }).length;

        if (strictlyHigher === 0) {
          give(p, goldId, fmt(val));
        } else if (strictlyHigher === 1 && silverId) {
          give(p, silverId, fmt(val));
        }
      }
    };

    // 1. Turf Inker (#1 Paint / #2 Paint2) - authoritative native metric (p.turf)
    evalMetric((p) => p.turf, 'Paint', 'Paint2', (v) => tr('{n}p inked', { n: fmtInt(v) }));

    // 2. Enemy Splatter (#1 Kill / #2 Kill2) - authoritative native metric (p.splats)
    evalMetric((p) => p.splats, 'Kill', 'Kill2', (v) => tr(v === 1 ? '{n} splat' : '{n} splats', { n: v }));

    // 3. Overall Splatter (#1 Battle / #2 Battle2) and Splat Assister (#1 KillAssist / #2 KillAssist2)
    // Eligible ONLY if authoritative finite non-negative assists are known for the ENTIRE compared team,
    // AND positive assists are present. Missing is unknown (not 0); zero/missing assists awards no Overall.
    const hasTeamwideFiniteAssists = team.every((p) => (
      typeof p.assists === 'number' && Number.isFinite(p.assists) && p.assists >= 0
    ));
    const hasAnyPositiveAssists = team.some((p) => (
      typeof p.assists === 'number' && Number.isFinite(p.assists) && p.assists > 0
    ));

    if (hasTeamwideFiniteAssists && hasAnyPositiveAssists) {
      evalMetric((p) => p.splats + p.assists, 'Battle', 'Battle2', (v) => tr(v === 1 ? '{n} splat' : '{n} splats', { n: v }));
      evalMetric((p) => p.assists, 'KillAssist', 'KillAssist2', (v) => tr(v === 1 ? '{n} assist' : '{n} assists', { n: v }));
    }
  }

  // Sort each player's medals by S3 priority order and cap at maximum 3 medals
  for (let i = 0; i < by.length; i++) {
    by[i].sort((a, b) => {
      const ra = S3_PRIORITY_RANKS[a.s3Id] ?? S3_PRIORITY_RANKS[a.id] ?? 999;
      const rb = S3_PRIORITY_RANKS[b.s3Id] ?? S3_PRIORITY_RANKS[b.id] ?? 999;
      return ra - rb;
    });
    by[i] = by[i].slice(0, 3);
  }

  // match tags from the final coverage margin (percentage points)
  let [pa, pb] = (percents || [50, 50]).map((v) => +v || 0);
  if (pa <= 1.0001 && pb <= 1.0001) { pa *= 100; pb *= 100; }
  const margin = Math.abs(pa - pb);
  const match = [];
  for (const k in MATCH_TAGS) MATCH_TAGS[k].label = tr(MATCH_TAGS[k].label);
  if (margin < 3) match.push({ ...MATCH_TAGS.close, value: tr('{n}% margin', { n: margin.toFixed(1) }) });
  else if (margin >= 20) match.push({ ...MATCH_TAGS.landslide, value: \`+\${margin.toFixed(1)}%\` });
  return { byPlayer: by, match };
}`;

export function adaptMedalSource(rel, code) {
  if (rel === 'src/ui/menu-art.js') {
    code = replaceOnce(code, MENU_ART_AWARDS_BEFORE, MENU_ART_AWARDS_AFTER, 's3 awards taxonomy');
    code = replaceOnce(code, MENU_ART_COMPUTE_BEFORE, MENU_ART_COMPUTE_AFTER, 's3 compute awards');
    return code;
  }
  if (rel === 'src/ui/menus.js') {
    code = replaceOnce(code,
      'const myAwards = (self ? self._aw : []).slice(0, 4);',
      'const myAwards = boss ? (self ? self._aw : []).slice(0, 4) : (self ? self._aw : []).slice(0, 3);',
      'cap turf war medals at 3');
    code = replaceOnce(code,
      "class: 'iw-res__medals' + (medals.length > 3 ? ' is-4' : '')",
      "class: 'iw-res__medals' + (boss && medals.length > 3 ? ' is-4' : '')",
      'preserve boss 4-medal class and remove turf is-4');
    return code;
  }
  return code;
}
