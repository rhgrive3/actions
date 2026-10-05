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

// Splatoon 3 Ver. 11.3.0 award taxonomy (CommonMsg/VS/VSAwardName)
export const S3_AWARDS = {
  // Gold Medals (priority order within gold: Battle=1, Paint=10, Standout=11, HomeBase=12, EnemyBase=13, SuperJump=14, Kill=15, Assist=16)
  Battle: { id: 'overall_splatter', s3Id: 'Battle', label: '#1 Overall Splatter', metal: 'gold', icon: 'splat', desc: 'Most splats and assists on your team' },
  Paint: { id: 'turf_inker', s3Id: 'Paint', label: '#1 Turf Inker', metal: 'gold', icon: 'roller', desc: 'Most turf inked on your team' },
  Standout: { id: 'popular_target', s3Id: 'Standout', label: '#1 Popular Target', metal: 'gold', icon: 'shield', desc: 'Most time in enemy sights' },
  NawabariPaintMyTeamArea: { id: 'home_base_inker', s3Id: 'NawabariPaintMyTeamArea', label: '#1 Home-Base Inker', metal: 'gold', icon: 'roller', desc: 'Most home base turf inked' },
  NawabariPaintOpTeamArea: { id: 'enemy_base_inker', s3Id: 'NawabariPaintOpTeamArea', label: '#1 Enemy-Base Inker', metal: 'gold', icon: 'roller', desc: 'Most enemy base turf inked' },
  SuperJumpTarget: { id: 'super_jump_spot', s3Id: 'SuperJumpTarget', label: '#1 Super Jump Spot', metal: 'gold', icon: 'wave', desc: 'Most super jumped to by teammates' },
  Kill: { id: 'enemy_splatter', s3Id: 'Kill', label: '#1 Enemy Splatter', metal: 'gold', icon: 'splat', desc: 'Most splats on your team' },
  KillAssist: { id: 'splat_assister', s3Id: 'KillAssist', label: '#1 Splat Assister', metal: 'gold', icon: 'splat', desc: 'Most assists on your team' },

  // Silver Medals (priority order within silver: BaseDefense=108, FirstSplat=112, Battle2=132, Paint2=139, Standout2=140, HomeBase2=141, EnemyBase2=142, SuperJump2=143, Kill2=144, Assist2=145)
  NawabariDefenseMyTeamArea: { id: 'base_defender', s3Id: 'NawabariDefenseMyTeamArea', label: '#1 Base Defender', metal: 'silver', icon: 'shield', desc: 'Most base defense splats and assists' },
  FirstSplat: { id: 'first_splat', s3Id: 'FirstSplat', label: 'First Splat!', metal: 'silver', icon: 'star', desc: 'First splat of the match' },
  Battle2: { id: 'overall_splatter_2', s3Id: 'Battle2', label: '#2 Overall Splatter', metal: 'silver', icon: 'splat', desc: '2nd most splats and assists on your team' },
  Paint2: { id: 'turf_inker_2', s3Id: 'Paint2', label: '#2 Turf Inker', metal: 'silver', icon: 'roller', desc: '2nd most turf inked on your team' },
  Standout2: { id: 'popular_target_2', s3Id: 'Standout2', label: '#2 Popular Target', metal: 'silver', icon: 'shield', desc: '2nd most time in enemy sights' },
  NawabariPaintMyTeamArea2: { id: 'home_base_inker_2', s3Id: 'NawabariPaintMyTeamArea2', label: '#2 Home-Base Inker', metal: 'silver', icon: 'roller', desc: '2nd most home base turf inked' },
  NawabariPaintOpTeamArea2: { id: 'enemy_base_inker_2', s3Id: 'NawabariPaintOpTeamArea2', label: '#2 Enemy-Base Inker', metal: 'silver', icon: 'roller', desc: '2nd most enemy base turf inked' },
  SuperJumpTarget2: { id: 'super_jump_spot_2', s3Id: 'SuperJumpTarget2', label: '#2 Super Jump Spot', metal: 'silver', icon: 'wave', desc: '2nd most super jumped to by teammates' },
  Kill2: { id: 'enemy_splatter_2', s3Id: 'Kill2', label: '#2 Enemy Splatter', metal: 'silver', icon: 'splat', desc: '2nd most splats on your team' },
  KillAssist2: { id: 'splat_assister_2', s3Id: 'KillAssist2', label: '#2 Splat Assister', metal: 'silver', icon: 'splat', desc: '2nd most assists on your team' },
};

// Aliases for dual lookup (by ROM ID or snake_case ID)
S3_AWARDS.overall_splatter = S3_AWARDS.Battle;
S3_AWARDS.overall_splatter_2 = S3_AWARDS.Battle2;
S3_AWARDS.turf_inker = S3_AWARDS.Paint;
S3_AWARDS.turf_inker_2 = S3_AWARDS.Paint2;
S3_AWARDS.popular_target = S3_AWARDS.Standout;
S3_AWARDS.popular_target_2 = S3_AWARDS.Standout2;
S3_AWARDS.home_base_inker = S3_AWARDS.NawabariPaintMyTeamArea;
S3_AWARDS.home_base_inker_2 = S3_AWARDS.NawabariPaintMyTeamArea2;
S3_AWARDS.enemy_base_inker = S3_AWARDS.NawabariPaintOpTeamArea;
S3_AWARDS.enemy_base_inker_2 = S3_AWARDS.NawabariPaintOpTeamArea2;
S3_AWARDS.super_jump_spot = S3_AWARDS.SuperJumpTarget;
S3_AWARDS.super_jump_spot_2 = S3_AWARDS.SuperJumpTarget2;
S3_AWARDS.enemy_splatter = S3_AWARDS.Kill;
S3_AWARDS.enemy_splatter_2 = S3_AWARDS.Kill2;
S3_AWARDS.splat_assister = S3_AWARDS.KillAssist;
S3_AWARDS.splat_assister_2 = S3_AWARDS.KillAssist2;
S3_AWARDS.base_defender = S3_AWARDS.NawabariDefenseMyTeamArea;
S3_AWARDS.first_splat = S3_AWARDS.FirstSplat;

// Authoritative Splatoon 3 evaluation priority hierarchy (Gold always precedes Silver)
export const S3_PRIORITY_RANKS = {
  // Gold (1 - 16)
  Battle: 1, overall_splatter: 1,
  Paint: 10, turf_inker: 10,
  Standout: 11, popular_target: 11,
  NawabariPaintMyTeamArea: 12, home_base_inker: 12,
  NawabariPaintOpTeamArea: 13, enemy_base_inker: 13,
  SuperJumpTarget: 14, super_jump_spot: 14,
  Kill: 15, enemy_splatter: 15,
  KillAssist: 16, splat_assister: 16,

  // Silver (108 - 145)
  NawabariDefenseMyTeamArea: 108, base_defender: 108,
  FirstSplat: 112, first_splat: 112,
  Battle2: 132, overall_splatter_2: 132,
  Paint2: 139, turf_inker_2: 139,
  Standout2: 140, popular_target_2: 140,
  NawabariPaintMyTeamArea2: 141, home_base_inker_2: 141,
  NawabariPaintOpTeamArea2: 142, enemy_base_inker_2: 142,
  SuperJumpTarget2: 143, super_jump_spot_2: 143,
  Kill2: 144, enemy_splatter_2: 144,
  KillAssist2: 145, splat_assister_2: 145,
};

export const S3_AWARD_ORDER = [
  'Battle', 'overall_splatter',
  'Paint', 'turf_inker',
  'Standout', 'popular_target',
  'NawabariPaintMyTeamArea', 'home_base_inker',
  'NawabariPaintOpTeamArea', 'enemy_base_inker',
  'SuperJumpTarget', 'super_jump_spot',
  'Kill', 'enemy_splatter',
  'KillAssist', 'splat_assister',
  'NawabariDefenseMyTeamArea', 'base_defender',
  'FirstSplat', 'first_splat',
  'Battle2', 'overall_splatter_2',
  'Paint2', 'turf_inker_2',
  'Standout2', 'popular_target_2',
  'NawabariPaintMyTeamArea2', 'home_base_inker_2',
  'NawabariPaintOpTeamArea2', 'enemy_base_inker_2',
  'SuperJumpTarget2', 'super_jump_spot_2',
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
  // Gold Medals (Splatoon 3 Ver. 11.3.0)
  Battle: { id: 'overall_splatter', s3Id: 'Battle', label: '#1 Overall Splatter', metal: 'gold', icon: 'splat', desc: 'Most splats and assists on your team' },
  Paint: { id: 'turf_inker', s3Id: 'Paint', label: '#1 Turf Inker', metal: 'gold', icon: 'roller', desc: 'Most turf inked on your team' },
  Standout: { id: 'popular_target', s3Id: 'Standout', label: '#1 Popular Target', metal: 'gold', icon: 'shield', desc: 'Most time in enemy sights' },
  NawabariPaintMyTeamArea: { id: 'home_base_inker', s3Id: 'NawabariPaintMyTeamArea', label: '#1 Home-Base Inker', metal: 'gold', icon: 'roller', desc: 'Most home base turf inked' },
  NawabariPaintOpTeamArea: { id: 'enemy_base_inker', s3Id: 'NawabariPaintOpTeamArea', label: '#1 Enemy-Base Inker', metal: 'gold', icon: 'roller', desc: 'Most enemy base turf inked' },
  SuperJumpTarget: { id: 'super_jump_spot', s3Id: 'SuperJumpTarget', label: '#1 Super Jump Spot', metal: 'gold', icon: 'wave', desc: 'Most super jumped to by teammates' },
  Kill: { id: 'enemy_splatter', s3Id: 'Kill', label: '#1 Enemy Splatter', metal: 'gold', icon: 'splat', desc: 'Most splats on your team' },
  KillAssist: { id: 'splat_assister', s3Id: 'KillAssist', label: '#1 Splat Assister', metal: 'gold', icon: 'splat', desc: 'Most assists on your team' },

  // Silver Medals (Splatoon 3 Ver. 11.3.0)
  NawabariDefenseMyTeamArea: { id: 'base_defender', s3Id: 'NawabariDefenseMyTeamArea', label: '#1 Base Defender', metal: 'silver', icon: 'shield', desc: 'Most base defense splats and assists' },
  FirstSplat: { id: 'first_splat', s3Id: 'FirstSplat', label: 'First Splat!', metal: 'silver', icon: 'star', desc: 'First splat of the match' },
  Battle2: { id: 'overall_splatter_2', s3Id: 'Battle2', label: '#2 Overall Splatter', metal: 'silver', icon: 'splat', desc: '2nd most splats and assists on your team' },
  Paint2: { id: 'turf_inker_2', s3Id: 'Paint2', label: '#2 Turf Inker', metal: 'silver', icon: 'roller', desc: '2nd most turf inked on your team' },
  Standout2: { id: 'popular_target_2', s3Id: 'Standout2', label: '#2 Popular Target', metal: 'silver', icon: 'shield', desc: '2nd most time in enemy sights' },
  NawabariPaintMyTeamArea2: { id: 'home_base_inker_2', s3Id: 'NawabariPaintMyTeamArea2', label: '#2 Home-Base Inker', metal: 'silver', icon: 'roller', desc: '2nd most home base turf inked' },
  NawabariPaintOpTeamArea2: { id: 'enemy_base_inker_2', s3Id: 'NawabariPaintOpTeamArea2', label: '#2 Enemy-Base Inker', metal: 'silver', icon: 'roller', desc: '2nd most enemy base turf inked' },
  SuperJumpTarget2: { id: 'super_jump_spot_2', s3Id: 'SuperJumpTarget2', label: '#2 Super Jump Spot', metal: 'silver', icon: 'wave', desc: '2nd most super jumped to by teammates' },
  Kill2: { id: 'enemy_splatter_2', s3Id: 'Kill2', label: '#2 Enemy Splatter', metal: 'silver', icon: 'splat', desc: '2nd most splats on your team' },
  KillAssist2: { id: 'splat_assister_2', s3Id: 'KillAssist2', label: '#2 Splat Assister', metal: 'silver', icon: 'splat', desc: '2nd most assists on your team' },
};
// Aliases for lookup flexibility
AWARDS.overall_splatter = AWARDS.Battle;
AWARDS.overall_splatter_2 = AWARDS.Battle2;
AWARDS.turf_inker = AWARDS.Paint;
AWARDS.turf_inker_2 = AWARDS.Paint2;
AWARDS.popular_target = AWARDS.Standout;
AWARDS.popular_target_2 = AWARDS.Standout2;
AWARDS.home_base_inker = AWARDS.NawabariPaintMyTeamArea;
AWARDS.home_base_inker_2 = AWARDS.NawabariPaintMyTeamArea2;
AWARDS.enemy_base_inker = AWARDS.NawabariPaintOpTeamArea;
AWARDS.enemy_base_inker_2 = AWARDS.NawabariPaintOpTeamArea2;
AWARDS.super_jump_spot = AWARDS.SuperJumpTarget;
AWARDS.super_jump_spot_2 = AWARDS.SuperJumpTarget2;
AWARDS.enemy_splatter = AWARDS.Kill;
AWARDS.enemy_splatter_2 = AWARDS.Kill2;
AWARDS.splat_assister = AWARDS.KillAssist;
AWARDS.splat_assister_2 = AWARDS.KillAssist2;
AWARDS.base_defender = AWARDS.NawabariDefenseMyTeamArea;
AWARDS.first_splat = AWARDS.FirstSplat;

export const S3_PRIORITY_RANKS = {
  Battle: 1, overall_splatter: 1,
  Paint: 10, turf_inker: 10,
  Standout: 11, popular_target: 11,
  NawabariPaintMyTeamArea: 12, home_base_inker: 12,
  NawabariPaintOpTeamArea: 13, enemy_base_inker: 13,
  SuperJumpTarget: 14, super_jump_spot: 14,
  Kill: 15, enemy_splatter: 15,
  KillAssist: 16, splat_assister: 16,
  NawabariDefenseMyTeamArea: 108, base_defender: 108,
  FirstSplat: 112, first_splat: 112,
  Battle2: 132, overall_splatter_2: 132,
  Paint2: 139, turf_inker_2: 139,
  Standout2: 140, popular_target_2: 140,
  NawabariPaintMyTeamArea2: 141, home_base_inker_2: 141,
  NawabariPaintOpTeamArea2: 142, enemy_base_inker_2: 142,
  SuperJumpTarget2: 143, super_jump_spot_2: 143,
  Kill2: 144, enemy_splatter_2: 144,
  KillAssist2: 145, splat_assister_2: 145,
};

const AWARD_ORDER = [
  'Battle', 'overall_splatter',
  'Paint', 'turf_inker',
  'Standout', 'popular_target',
  'NawabariPaintMyTeamArea', 'home_base_inker',
  'NawabariPaintOpTeamArea', 'enemy_base_inker',
  'SuperJumpTarget', 'super_jump_spot',
  'Kill', 'enemy_splatter',
  'KillAssist', 'splat_assister',
  'NawabariDefenseMyTeamArea', 'base_defender',
  'FirstSplat', 'first_splat',
  'Battle2', 'overall_splatter_2',
  'Paint2', 'turf_inker_2',
  'Standout2', 'popular_target_2',
  'NawabariPaintMyTeamArea2', 'home_base_inker_2',
  'NawabariPaintOpTeamArea2', 'enemy_base_inker_2',
  'SuperJumpTarget2', 'super_jump_spot_2',
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

    // 1. Turf Inker (#1 Paint / #2 Paint2) - authoritative metric
    evalMetric((p) => p.turf, 'Paint', 'Paint2', (v) => tr('{n}p inked', { n: fmtInt(v) }));

    // 2. Overall Splatter (#1 Battle / #2 Battle2) - authoritative metric (splats + assists if available)
    evalMetric((p) => (p.assists !== undefined ? (p.splats || 0) + (p.assists || 0) : p.splats), 'Battle', 'Battle2', (v) => tr(v === 1 ? '{n} splat' : '{n} splats', { n: v }));

    // Optional event/spatial metrics: evaluated ONLY if authoritative data is present on player objects, never synthesized
    if (team.some((p) => p.kills !== undefined || p.enemySplats !== undefined)) {
      evalMetric((p) => p.kills ?? p.enemySplats, 'Kill', 'Kill2', (v) => tr(v === 1 ? '{n} splat' : '{n} splats', { n: v }));
    }
    if (team.some((p) => p.assists !== undefined)) {
      evalMetric((p) => p.assists, 'KillAssist', 'KillAssist2', (v) => tr(v === 1 ? '{n} assist' : '{n} assists', { n: v }));
    }
    if (team.some((p) => p.standout !== undefined || p.popularTarget !== undefined)) {
      evalMetric((p) => p.standout ?? p.popularTarget, 'Standout', 'Standout2', (v) => tr('{n}s', { n: v }));
    }
    if (team.some((p) => p.homeTurf !== undefined || p.homeBase !== undefined || p.homeBaseInked !== undefined)) {
      evalMetric((p) => p.homeTurf ?? p.homeBase ?? p.homeBaseInked, 'NawabariPaintMyTeamArea', 'NawabariPaintMyTeamArea2', (v) => tr('{n}p inked', { n: fmtInt(v) }));
    }
    if (team.some((p) => p.enemyTurf !== undefined || p.enemyBase !== undefined || p.enemyBaseInked !== undefined)) {
      evalMetric((p) => p.enemyTurf ?? p.enemyBase ?? p.enemyBaseInked, 'NawabariPaintOpTeamArea', 'NawabariPaintOpTeamArea2', (v) => tr('{n}p inked', { n: fmtInt(v) }));
    }
    if (team.some((p) => p.superJumpTarget !== undefined || p.superJumps !== undefined)) {
      evalMetric((p) => p.superJumpTarget ?? p.superJumps, 'SuperJumpTarget', 'SuperJumpTarget2', (v) => tr(v === 1 ? '{n} jump' : '{n} jumps', { n: v }));
    }
    if (team.some((p) => p.baseDefender !== undefined || p.homeDefense !== undefined)) {
      evalMetric((p) => p.baseDefender ?? p.homeDefense, 'NawabariDefenseMyTeamArea', null, (v) => String(v));
    }
    if (team.some((p) => p.firstSplat)) {
      for (const p of team) {
        if (p.firstSplat) give(p, 'FirstSplat', '');
      }
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
