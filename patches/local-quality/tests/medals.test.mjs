import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
import { S3_AWARDS, S3_PRIORITY_RANKS, S3_AWARD_ORDER } from '../medal-adapter.mjs';

const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), 'utf8');
const compose = (rel, code = read('inkwave-public/' + rel)) =>
  adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));

function section(code, from, to) {
  const at = code.indexOf(from);
  const end = code.indexOf(to, at);
  assert.ok(at >= 0 && end > at, `expected native source span from ${from}`);
  return code.slice(at, end);
}

function stripExports(code) {
  return code
    .replace(/\bexport\s+(const|function|let|var|class)\b/g, '$1')
    .replace(/\bexport\s*\{[^}]*\};?/g, '');
}

// Minimal DOM mock to run native award markup and results screen rendering in node
function createMockDOM() {
  function createMockElement(tag) {
    const classSet = new Set();
    const children = [];
    const dataset = {};
    const style = {};
    let text = '';
    let htmlContent = '';
    return {
      tagName: tag.toUpperCase(),
      get className() { return [...classSet].join(' '); },
      set className(v) { classSet.clear(); (v || '').split(/\s+/).filter(Boolean).forEach(c => classSet.add(c)); },
      classList: {
        add(...cls) { cls.forEach(c => classSet.add(c)); },
        remove(...cls) { cls.forEach(c => classSet.delete(c)); },
        contains(c) { return classSet.has(c); },
        toggle(c, force) { if (force === undefined) force = !classSet.has(c); if (force) classSet.add(c); else classSet.delete(c); return force; },
      },
      style,
      dataset,
      appendChild(child) { children.push(child); return child; },
      get children() { return children; },
      get firstElementChild() { return children.find(c => c && typeof c === 'object') || null; },
      setAttribute(k, v) { this[k] = v; },
      getAttribute(k) { return this[k]; },
      addEventListener() {},
      removeEventListener() {},
      set innerHTML(v) {
        htmlContent = v;
        // Parse simple child div if it looks like medalMarkup
        const matchAw = v.match(/data-aw="([^"]+)"/);
        const matchCls = v.match(/class="([^"]+)"/);
        if (matchAw || matchCls) {
          const child = createMockElement('div');
          if (matchCls) child.className = matchCls[1];
          if (matchAw) child.dataset.aw = matchAw[1];
          children.push(child);
        }
      },
      get innerHTML() { return htmlContent; },
      set textContent(v) { text = String(v); },
      get textContent() { return text; },
    };
  }

  return {
    createElement(tag) { return createMockElement(tag); },
    createTextNode(text) { return { textContent: String(text) }; },
  };
}

test('public inkwave source tree remains completely byte-identical (#502)', () => {
  const publicArt = read('inkwave-public/src/ui/menu-art.js');
  const publicMenus = read('inkwave-public/src/ui/menus.js');
  // Original files must still have native anchors intact
  assert.ok(publicArt.includes("mvp: { label: 'MVP', metal: 'gold'"));
  assert.ok(publicArt.includes("turf: { label: 'TURF KING', metal: 'gold'"));
  assert.ok(publicMenus.includes('.slice(0, 4);'));
});

test('local-quality medal adapter composes cleanly into menu-art and menus with fail-closed anchors', () => {
  const art = compose('src/ui/menu-art.js');
  assert.ok(!art.includes('TURF KING'));
  assert.ok(!art.includes('PURE PAINTER'));
  const turfAwardsSection = section(art, 'export const AWARDS =', '// boss mode');
  assert.ok(!turfAwardsSection.includes("metal: 'bronze'"));
  assert.ok(art.includes('#1 Overall Splatter'));
  assert.ok(art.includes('#1 Turf Inker'));

  const menus = compose('src/ui/menus.js');
  assert.ok(menus.includes('const myAwards = boss ? (self ? self._aw : []).slice(0, 4) : (self ? self._aw : []).slice(0, 3);'));
  assert.ok(menus.includes("class: 'iw-res__medals' + (boss && medals.length > 3 ? ' is-4' : '')"));
});

test('S3 taxonomy defines valid medal categories, gold/silver metals only, no bronze and no MVP', () => {
  const metals = new Set(Object.values(S3_AWARDS).map(a => a.metal));
  assert.deepEqual([...metals].sort(), ['gold', 'silver']);
  assert.equal(Object.values(S3_AWARDS).some(a => a.metal === 'bronze'), false);
  assert.equal('mvp' in S3_AWARDS, false);
  assert.equal('turf' in S3_AWARDS, false);
  assert.equal('survivor' in S3_AWARDS, false);

  // Authoritative S3 names verified
  assert.equal(S3_AWARDS.Battle.label, '#1 Overall Splatter');
  assert.equal(S3_AWARDS.Battle.metal, 'gold');
  assert.equal(S3_AWARDS.Paint.label, '#1 Turf Inker');
  assert.equal(S3_AWARDS.Paint.metal, 'gold');
  assert.equal(S3_AWARDS.Battle2.label, '#2 Overall Splatter');
  assert.equal(S3_AWARDS.Battle2.metal, 'silver');
  assert.equal(S3_AWARDS.Paint2.label, '#2 Turf Inker');
  assert.equal(S3_AWARDS.Paint2.metal, 'silver');
  assert.equal(S3_AWARDS.Kill.label, '#1 Enemy Splatter');
  assert.equal(S3_AWARDS.Kill.metal, 'gold');
  assert.equal(S3_AWARDS.Kill2.label, '#2 Enemy Splatter');
  assert.equal(S3_AWARDS.Kill2.metal, 'silver');
});

test('teammate ranking is evaluated strictly within team, independent of opponent statistics (perturbation test)', () => {
  const artCode = compose('src/ui/menu-art.js');
  const mod = vm.runInNewContext(`
    let tr = (s, ctx) => ctx ? s.replace(/\\{(\\w+)\\}/g, (_, k) => ctx[k]) : s;
    let fmtInt = (n) => String(n);
    let MATCH_TAGS = { close: { id: 'close', label: 'CLOSE' }, landslide: { id: 'landslide', label: 'LANDSLIDE' } };
    ${stripExports(section(artCode, 'export const AWARDS =', '\n// boss mode'))}
    ${stripExports(section(artCode, 'export function computeAwards(', '\n/** Big stamped medal'))}
    ; ({ computeAwards, AWARDS })
  `, { console });

  // Baseline match:
  // Team 0: Local A (900 turf, 3 splats), Local B (800 turf, 2 splats), Local C (700 turf, 1 splat), Local D (600 turf, 0 splats)
  // Team 1: Opponent 1 (1200 turf, 5 splats), Opponent 2 (500 turf, 1 splat), Opponent 3 (400 turf, 0 splats), Opponent 4 (300 turf, 0 splats)
  const basePlayers = [
    { name: 'Local A', team: 0, turf: 900, splats: 3, deaths: 0, isSelf: true },
    { name: 'Local B', team: 0, turf: 800, splats: 2, deaths: 1 },
    { name: 'Local C', team: 0, turf: 700, splats: 1, deaths: 2 },
    { name: 'Local D', team: 0, turf: 600, splats: 0, deaths: 3 },
    { name: 'Opponent 1', team: 1, turf: 1200, splats: 5, deaths: 0 },
    { name: 'Opponent 2', team: 1, turf: 500, splats: 1, deaths: 2 },
    { name: 'Opponent 3', team: 1, turf: 400, splats: 0, deaths: 2 },
    { name: 'Opponent 4', team: 1, turf: 300, splats: 0, deaths: 2 },
  ];

  const res1 = mod.computeAwards(basePlayers, { win: true });
  const localA1 = res1.byPlayer[0];
  const localB1 = res1.byPlayer[1];
  const opp1 = res1.byPlayer[4];

  // Local A is #1 Turf Inker and #1 Enemy Splatter on team 0 despite Opponent 1 having 1200 turf and 5 splats
  assert.equal(localA1.length, 2);
  assert.equal(localA1[0].label, '#1 Turf Inker');
  assert.equal(localA1[0].metal, 'gold');
  assert.equal(localA1[1].label, '#1 Enemy Splatter');
  assert.equal(localA1[1].metal, 'gold');

  // Local B is #2 in both categories on team 0
  assert.equal(localB1.length, 2);
  assert.equal(localB1[0].label, '#2 Turf Inker');
  assert.equal(localB1[0].metal, 'silver');
  assert.equal(localB1[1].label, '#2 Enemy Splatter');
  assert.equal(localB1[1].metal, 'silver');

  // Opponent 1 independently has #1 Turf Inker and #1 Enemy Splatter for Team 1
  assert.equal(opp1[0].label, '#1 Turf Inker');
  assert.equal(opp1[1].label, '#1 Enemy Splatter');

  // Opponent perturbation: Change Opponent 1 to 99999 turf and 99 splats
  const perturbedOpponents = basePlayers.map((p, i) => i === 4 ? { ...p, turf: 99999, splats: 99 } : { ...p });
  const res2 = mod.computeAwards(perturbedOpponents, { win: true });
  assert.deepEqual(res2.byPlayer[0], localA1, 'Opponent stats change must not alter local team medals');
  assert.deepEqual(res2.byPlayer[1], localB1, 'Opponent stats change must not alter local team medals');

  // Teammate perturbation: Change Local B's turf to 950 (overtaking Local A)
  const perturbedTeammates = basePlayers.map((p, i) => i === 1 ? { ...p, turf: 950 } : { ...p });
  const res3 = mod.computeAwards(perturbedTeammates, { win: true });
  const localA3 = res3.byPlayer[0];
  const localB3 = res3.byPlayer[1];
  // Local A drops to #2 Turf Inker (silver), retains #1 Enemy Splatter (gold)
  assert.equal(localA3[0].label, '#1 Enemy Splatter');
  assert.equal(localA3[0].metal, 'gold');
  assert.equal(localA3[1].label, '#2 Turf Inker');
  assert.equal(localA3[1].metal, 'silver');
  // Local B promotes to #1 Turf Inker (gold), retains #2 Enemy Splatter (silver)
  assert.equal(localB3[0].label, '#1 Turf Inker');
  assert.equal(localB3[0].metal, 'gold');
  assert.equal(localB3[1].label, '#2 Enemy Splatter');
  assert.equal(localB3[1].metal, 'silver');
});

test('tie handling awards valid medals consistently with S3 rules', () => {
  const artCode = compose('src/ui/menu-art.js');
  const mod = vm.runInNewContext(`
    let tr = (s, ctx) => ctx ? s.replace(/\\{(\\w+)\\}/g, (_, k) => ctx[k]) : s;
    let fmtInt = (n) => String(n);
    let MATCH_TAGS = {};
    ${stripExports(section(artCode, 'export const AWARDS =', '\n// boss mode'))}
    ${stripExports(section(artCode, 'export function computeAwards(', '\n/** Big stamped medal'))}
    ; ({ computeAwards })
  `, { console });

  // 1. Two players tie for #1: both earn Gold #1, third place gets no #2
  const tieForFirst = [
    { name: 'A', team: 0, turf: 900, splats: 0, isSelf: true },
    { name: 'B', team: 0, turf: 900, splats: 0 },
    { name: 'C', team: 0, turf: 700, splats: 0 },
    { name: 'D', team: 0, turf: 600, splats: 0 },
  ];
  const r1 = mod.computeAwards(tieForFirst).byPlayer;
  assert.equal(r1[0].length, 1);
  assert.equal(r1[0][0].label, '#1 Turf Inker');
  assert.equal(r1[0][0].metal, 'gold');
  assert.equal(r1[1].length, 1);
  assert.equal(r1[1][0].label, '#1 Turf Inker');
  assert.equal(r1[1][0].metal, 'gold');
  assert.equal(r1[2].length, 0, 'Player with rank 3 when two tie for 1st does not receive #2 medal');

  // 2. Solo #1, two players tie for #2: both earn Silver #2
  const tieForSecond = [
    { name: 'A', team: 0, turf: 1000, splats: 0, isSelf: true },
    { name: 'B', team: 0, turf: 800, splats: 0 },
    { name: 'C', team: 0, turf: 800, splats: 0 },
    { name: 'D', team: 0, turf: 600, splats: 0 },
  ];
  const r2 = mod.computeAwards(tieForSecond).byPlayer;
  assert.equal(r2[0][0].label, '#1 Turf Inker');
  assert.equal(r2[0][0].metal, 'gold');
  assert.equal(r2[1][0].label, '#2 Turf Inker');
  assert.equal(r2[1][0].metal, 'silver');
  assert.equal(r2[2][0].label, '#2 Turf Inker');
  assert.equal(r2[2][0].metal, 'silver');
  assert.equal(r2[3].length, 0);

  // 3. All four tie for #1: all four earn Gold #1
  const tieAll = [
    { name: 'A', team: 0, turf: 850, splats: 0, isSelf: true },
    { name: 'B', team: 0, turf: 850, splats: 0 },
    { name: 'C', team: 0, turf: 850, splats: 0 },
    { name: 'D', team: 0, turf: 850, splats: 0 },
  ];
  const r3 = mod.computeAwards(tieAll).byPlayer;
  for (let i = 0; i < 4; i++) {
    assert.equal(r3[i].length, 1);
    assert.equal(r3[i][0].label, '#1 Turf Inker');
    assert.equal(r3[i][0].metal, 'gold');
  }
});

test('zeros condition awards no medals when stats are zero', () => {
  const artCode = compose('src/ui/menu-art.js');
  const mod = vm.runInNewContext(`
    let tr = (s, ctx) => ctx ? s.replace(/\\{(\\w+)\\}/g, (_, k) => ctx[k]) : s;
    let fmtInt = (n) => String(n);
    let MATCH_TAGS = {};
    ${stripExports(section(artCode, 'export const AWARDS =', '\n// boss mode'))}
    ${stripExports(section(artCode, 'export function computeAwards(', '\n/** Big stamped medal'))}
    ; ({ computeAwards })
  `, { console });

  const zeroPlayers = [
    { name: 'A', team: 0, turf: 0, splats: 0, deaths: 0, isSelf: true },
    { name: 'B', team: 0, turf: 0, splats: 0, deaths: 1 },
    { name: 'C', team: 0, turf: 0, splats: 0, deaths: 2 },
    { name: 'D', team: 0, turf: 0, splats: 0, deaths: 3 },
  ];
  const r = mod.computeAwards(zeroPlayers).byPlayer;
  for (let i = 0; i < 4; i++) {
    assert.equal(r[i].length, 0, 'Zero stats must award no medals');
  }
});

test('priority hierarchy sorts medals and caps displayed medals at maximum three (>3 criteria cap)', () => {
  const artCode = compose('src/ui/menu-art.js');
  const mod = vm.runInNewContext(`
    let tr = (s, ctx) => ctx ? s.replace(/\\{(\\w+)\\}/g, (_, k) => ctx[k]) : s;
    let fmtInt = (n) => String(n);
    let MATCH_TAGS = {};
    ${stripExports(section(artCode, 'export const AWARDS =', '\n// boss mode'))}
    ${stripExports(section(artCode, 'export function computeAwards(', '\n/** Big stamped medal'))}
    ; ({ computeAwards, S3_PRIORITY_RANKS })
  `, { console });

  // Player qualifying for 4 distinct criteria via complete authoritative assists:
  // 1. Overall Splatter (Battle, gold, priority 1) -> 6 splats + 4 assists = 10
  // 2. Turf Inker (Paint, gold, priority 10) -> 1000 turf
  // 3. Enemy Splatter (Kill, gold, priority 15) -> 6 splats
  // 4. Splat Assister (KillAssist, gold, priority 16) -> 4 assists
  const playersWithExtra = [
    { name: 'AllStar', team: 0, turf: 1000, splats: 6, assists: 4, deaths: 0, isSelf: true },
    { name: 'B', team: 0, turf: 500, splats: 2, assists: 2 },
    { name: 'C', team: 0, turf: 400, splats: 1, assists: 1 },
    { name: 'D', team: 0, turf: 300, splats: 0, assists: 0 },
  ];

  const res = mod.computeAwards(playersWithExtra).byPlayer;
  const allStarAwards = res[0];

  // Must be strictly capped at 3 medals
  assert.equal(allStarAwards.length, 3, 'Must cap at maximum 3 medals when >3 criteria are satisfied');

  // Must match authoritative Splatoon 3 priority order:
  // Battle (1) > Paint (10) > Kill (15) (KillAssist at priority 16 is capped out)
  assert.equal(allStarAwards[0].label, '#1 Overall Splatter');
  assert.equal(allStarAwards[1].label, '#1 Turf Inker');
  assert.equal(allStarAwards[2].label, '#1 Enemy Splatter');

  // Gold medals strictly precede silver medals:
  // Suppose a player has Gold #1 Turf Inker (priority 10) and Silver #2 Enemy Splatter (priority 144)
  const mixedTier = [
    { name: 'Painter', team: 0, turf: 1100, splats: 2, isSelf: true },
    { name: 'Slayer', team: 0, turf: 700, splats: 5 },
  ];
  const rMixed = mod.computeAwards(mixedTier).byPlayer[0];
  assert.equal(rMixed.length, 2);
  assert.equal(rMixed[0].label, '#1 Turf Inker', 'Gold medal must take precedence over silver');
  assert.equal(rMixed[0].metal, 'gold');
  assert.equal(rMixed[1].label, '#2 Enemy Splatter', 'Silver medal follows gold');
  assert.equal(rMixed[1].metal, 'silver');
});

test('native adapted award+render path produces medals and menus without is-4 class or bronze tiers', () => {
  const artCode = compose('src/ui/menu-art.js');
  const dom = createMockDOM();

  // Test medalMarkup output
  const modArt = vm.runInNewContext(`
    let tr = (s, ctx) => ctx ? s.replace(/\\{(\\w+)\\}/g, (_, k) => ctx[k]) : s;
    let fmtInt = (n) => String(n);
    let splatSVG = () => '<svg></svg>';
    let awardIcon = (id) => '<svg class="ico-' + id + '"></svg>';
    let MATCH_TAGS = {};
    ${stripExports(section(artCode, 'export const AWARDS =', '\n// boss mode'))}
    ${stripExports(section(artCode, 'export function computeAwards(', '\n/** Big stamped medal'))}
    ${stripExports(section(artCode, 'export function medalMarkup(', '\nexport function awardBadge('))}
    ; ({ computeAwards, medalMarkup, AWARDS })
  `, { console });

  const goldAw = { id: 'turf_inker', label: '#1 Turf Inker', metal: 'gold', desc: 'Most turf inked on your team', value: '950p inked', icon: 'roller' };
  const silverAw = { id: 'enemy_splatter_2', label: '#2 Enemy Splatter', metal: 'silver', desc: '2nd most splats on your team', value: '2 splats', icon: 'splat' };

  const markupGold = modArt.medalMarkup(goldAw, 0);
  assert.ok(markupGold.includes('class="iw-medal is-gold"'));
  assert.ok(markupGold.includes('#1 Turf Inker'));
  assert.ok(markupGold.includes('950p inked'));
  assert.ok(!markupGold.includes('is-bronze'));

  const markupSilver = modArt.medalMarkup(silverAw, 1);
  assert.ok(markupSilver.includes('class="iw-medal is-silver"'));
  assert.ok(markupSilver.includes('#2 Enemy Splatter'));
  assert.ok(markupSilver.includes('2 splats'));
  assert.ok(!markupSilver.includes('is-bronze'));

  // Test Menus results slice and medalRow markup
  const menusCode = compose('src/ui/menus.js');
  const modMenus = vm.runInNewContext(`
    let h = (tag, props, ...kids) => {
      const el = document.createElement(tag);
      if (props?.class) el.className = props.class;
      if (props?.html) el.innerHTML = props.html;
      kids.forEach(k => el.appendChild(k));
      return el;
    };
    function renderMedalRow(self, boss = false) {
      const myAwards = boss ? (self ? self._aw : []).slice(0, 4) : (self ? self._aw : []).slice(0, 3);
      const medals = myAwards.map((aw, i) => ({ classList: { add() {} }, dataset: { aw: aw.id } }));
      const medalRow = medals.length
        ? h('div', { class: 'iw-res__medals' + (boss && medals.length > 3 ? ' is-4' : '') },
            h('div', { class: 'iw-res__medalcap' }),
            h('div', { class: 'iw-res__medallist' }))
        : null;
      return { myAwards, medals, medalRow };
    }
    ; ({ renderMedalRow })
  `, { document: dom, console });

  const localPlayerWith4Aw = {
    _aw: [goldAw, silverAw, { ...goldAw, label: '#1 Overall Splatter' }, { ...goldAw, label: '#1 Splat Assister' }]
  };

  // Turf War mode (boss = false)
  const turfResult = modMenus.renderMedalRow(localPlayerWith4Aw, false);
  assert.equal(turfResult.myAwards.length, 3, 'Turf war local awards sliced to maximum 3');
  assert.equal(turfResult.medals.length, 3);
  assert.equal(turfResult.medalRow.className, 'iw-res__medals', 'Turf war must not have is-4 class');

  // Boss mode (boss = true) preserves up to 4 medals and is-4 class
  const bossResult = modMenus.renderMedalRow(localPlayerWith4Aw, true);
  assert.equal(bossResult.myAwards.length, 4, 'Boss mode preserves up to 4 awards');
  assert.equal(bossResult.medals.length, 4);
  assert.equal(bossResult.medalRow.className, 'iw-res__medals is-4', 'Boss mode preserves is-4 class');
});

test('Boss Battle custom awards and results remain completely unchanged (negative control)', () => {
  const artCode = compose('src/ui/menu-art.js');
  const modArt = vm.runInNewContext(`
    let tr = (s, ctx) => s;
    let fmtInt = (n) => String(n);
    ${stripExports(section(artCode, 'export const BOSS_AWARDS =', '\nexport const MATCH_TAGS ='))}
    ; ({ BOSS_AWARDS, computeBossAwards })
  `, { console });

  // Boss awards retain their original custom taxonomy and bronze tiers
  assert.ok('mvp' in modArt.BOSS_AWARDS);
  assert.ok('heavy' in modArt.BOSS_AWARDS);
  assert.ok('unsinkable' in modArt.BOSS_AWARDS);
  assert.equal(modArt.BOSS_AWARDS.unsinkable.metal, 'bronze');
  assert.equal(modArt.BOSS_AWARDS.survivor.metal, 'bronze');
  assert.equal(modArt.BOSS_AWARDS.cleaner.metal, 'bronze');

  // computeBossAwards executes original boss-specific calculations
  const bossSquad = [
    { damage: 1500, weakHits: 5, splats: 4, deaths: 0, turf: 200 },
    { damage: 800, weakHits: 2, splats: 1, deaths: 1, turf: 100 },
  ];
  const bossRes = modArt.computeBossAwards(bossSquad);
  assert.equal(bossRes.byPlayer.length, 2);
  const p0Awards = bossRes.byPlayer[0].map(a => a.id);
  assert.ok(p0Awards.includes('heavy'), 'Top boss damage receives HEAVY HITTER');
  assert.ok(p0Awards.includes('crit'), 'Top weak hits receives SHELL CRACKER');
  assert.ok(p0Awards.includes('unsinkable'), '0 deaths in boss receives UNSINKABLE (bronze)');
  assert.ok(p0Awards.includes('mvp'), 'Top all-round in boss receives MVP');
});

test('adapted-native result fixture: positive native splats awards Enemy Splatter, missing assists yields no Overall Splatter', () => {
  const artCode = compose('src/ui/menu-art.js');
  const mod = vm.runInNewContext(`
    let tr = (s, ctx) => ctx ? s.replace(/\\{(\\w+)\\}/g, (_, k) => ctx[k]) : s;
    let fmtInt = (n) => String(n);
    let MATCH_TAGS = {};
    ${stripExports(section(artCode, 'export const AWARDS =', '\n// boss mode'))}
    ${stripExports(section(artCode, 'export function computeAwards(', '\n/** Big stamped medal'))}
    ; ({ computeAwards, AWARDS })
  `, { console });

  // Native player objects passed from main.js / menus.js: only turf, splats, deaths, isSelf, etc. No assists field.
  const nativePlayers = [
    { name: 'Self', team: 0, turf: 1100, splats: 4, deaths: 1, isSelf: true },
    { name: 'Ally1', team: 0, turf: 850, splats: 2, deaths: 2 },
    { name: 'Ally2', team: 0, turf: 600, splats: 1, deaths: 3 },
    { name: 'Ally3', team: 0, turf: 400, splats: 0, deaths: 1 },
    { name: 'Opp1', team: 1, turf: 1300, splats: 6, deaths: 0 },
    { name: 'Opp2', team: 1, turf: 700, splats: 2, deaths: 2 },
    { name: 'Opp3', team: 1, turf: 500, splats: 1, deaths: 2 },
    { name: 'Opp4', team: 1, turf: 300, splats: 0, deaths: 3 },
  ];

  const results = mod.computeAwards(nativePlayers, { win: true }).byPlayer;

  // Self has #1 Turf Inker (1100p) and #1 Enemy Splatter (4 splats) on team 0
  const selfAwards = results[0];
  assert.equal(selfAwards.length, 2);
  assert.equal(selfAwards[0].label, '#1 Turf Inker');
  assert.equal(selfAwards[0].metal, 'gold');
  assert.equal(selfAwards[0].id, 'turf_inker');
  assert.equal(selfAwards[1].label, '#1 Enemy Splatter');
  assert.equal(selfAwards[1].metal, 'gold');
  assert.equal(selfAwards[1].id, 'enemy_splatter');

  // Verify that Overall Splatter is NEVER awarded when assists are missing
  const allAwardLabels = results.flat().map(a => a.label);
  assert.ok(!allAwardLabels.includes('#1 Overall Splatter'), 'Missing assists must not synthesize Overall Splatter');
  assert.ok(!allAwardLabels.includes('#2 Overall Splatter'), 'Missing assists must not synthesize Overall Splatter');

  // Ally1 has #2 Turf Inker (850p) and #2 Enemy Splatter (2 splats) on team 0
  const ally1Awards = results[1];
  assert.equal(ally1Awards.length, 2);
  assert.equal(ally1Awards[0].label, '#2 Turf Inker');
  assert.equal(ally1Awards[0].metal, 'silver');
  assert.equal(ally1Awards[1].label, '#2 Enemy Splatter');
  assert.equal(ally1Awards[1].metal, 'silver');
});

test('known zero assists permits combined splat ranking while missing assists remains unknown', () => {
  const artCode = compose('src/ui/menu-art.js');
  const mod = vm.runInNewContext(`
    let tr = (s, ctx) => ctx ? s.replace(/\\{(\\w+)\\}/g, (_, k) => ctx[k]) : s;
    let fmtInt = (n) => String(n);
    let MATCH_TAGS = {};
    ${stripExports(section(artCode, 'export const AWARDS =', '\n// boss mode'))}
    ${stripExports(section(artCode, 'export function computeAwards(', '\n/** Big stamped medal'))}
    ; ({ computeAwards })
  `, { console });

  // Players have explicit zero assists across the team
  const zeroAssistsSquad = [
    { name: 'A', team: 0, turf: 1000, splats: 5, assists: 0, isSelf: true },
    { name: 'B', team: 0, turf: 800, splats: 3, assists: 0 },
    { name: 'C', team: 0, turf: 600, splats: 1, assists: 0 },
    { name: 'D', team: 0, turf: 400, splats: 0, assists: 0 },
  ];

  const results = mod.computeAwards(zeroAssistsSquad).byPlayer;
  const awardLabels = results.flat().map(a => a.label);

  assert.ok(awardLabels.includes('#1 Overall Splatter'), 'Known zero assists permits a known positive combined total');
  assert.ok(awardLabels.includes('#2 Overall Splatter'));
  assert.ok(!awardLabels.includes('#1 Splat Assister'));
  assert.ok(!awardLabels.includes('#2 Splat Assister'));
  assert.deepEqual(Array.from(results[0], a => a.label), ['#1 Overall Splatter', '#1 Turf Inker', '#1 Enemy Splatter']);
  assert.deepEqual(Array.from(results[1], a => a.label), ['#2 Overall Splatter', '#2 Turf Inker', '#2 Enemy Splatter']);
});

test('complete authoritative assists enables Overall Splatter and Splat Assister, incomplete assists excludes teamwide', () => {
  const artCode = compose('src/ui/menu-art.js');
  const mod = vm.runInNewContext(`
    let tr = (s, ctx) => ctx ? s.replace(/\\{(\\w+)\\}/g, (_, k) => ctx[k]) : s;
    let fmtInt = (n) => String(n);
    let MATCH_TAGS = {};
    ${stripExports(section(artCode, 'export const AWARDS =', '\n// boss mode'))}
    ${stripExports(section(artCode, 'export function computeAwards(', '\n/** Big stamped medal'))}
    ; ({ computeAwards })
  `, { console });

  // 1. Incomplete assists: 3 teammates have assists, 1 teammate is missing assists
  const incompleteTeam = [
    { name: 'A', team: 0, turf: 900, splats: 3, assists: 4 },
    { name: 'B', team: 0, turf: 800, splats: 2, assists: 2 },
    { name: 'C', team: 0, turf: 700, splats: 1, assists: 1 },
    { name: 'D', team: 0, turf: 600, splats: 0 /* assists missing */ },
  ];
  const incRes = mod.computeAwards(incompleteTeam).byPlayer;
  const incLabels = incRes.flat().map(a => a.label);
  assert.ok(!incLabels.includes('#1 Overall Splatter'), 'Incomplete assists must omit Overall Splatter teamwide');
  assert.ok(!incLabels.includes('#2 Overall Splatter'), 'Incomplete assists must omit Overall Splatter teamwide');
  assert.ok(!incLabels.includes('#1 Splat Assister'), 'Incomplete assists must omit Splat Assister teamwide');

  // 2. Complete assists: all 4 teammates have finite assists and positive assists exist
  const completeTeam = [
    { name: 'A', team: 0, turf: 900, splats: 2, assists: 5, isSelf: true }, // splats+assists = 7, assists = 5, splats = 2, turf = 900
    { name: 'B', team: 0, turf: 800, splats: 5, assists: 1 },              // splats+assists = 6, assists = 1, splats = 5, turf = 800
    { name: 'C', team: 0, turf: 700, splats: 1, assists: 2 },              // splats+assists = 3, assists = 2, splats = 1, turf = 700
    { name: 'D', team: 0, turf: 600, splats: 0, assists: 0 },
  ];
  const compRes = mod.computeAwards(completeTeam).byPlayer;

  // Player A:
  // - Overall Splatter: 7 (rank 1 -> #1 Overall Splatter, Gold, priority 1)
  // - Turf Inker: 900 (rank 1 -> #1 Turf Inker, Gold, priority 10)
  // - Splat Assister: 5 (rank 1 -> #1 Splat Assister, Gold, priority 16)
  // - Enemy Splatter: 2 (rank 2 -> #2 Enemy Splatter, Silver, priority 144 -> dropped by 3-medal cap)
  assert.equal(compRes[0].length, 3);
  assert.equal(compRes[0][0].label, '#1 Overall Splatter');
  assert.equal(compRes[0][0].metal, 'gold');
  assert.equal(compRes[0][1].label, '#1 Turf Inker');
  assert.equal(compRes[0][1].metal, 'gold');
  assert.equal(compRes[0][2].label, '#1 Splat Assister');
  assert.equal(compRes[0][2].metal, 'gold');

  // Player B:
  // - Enemy Splatter: 5 (rank 1 -> #1 Enemy Splatter, Gold, priority 15)
  // - Overall Splatter: 6 (rank 2 -> #2 Overall Splatter, Silver, priority 132)
  // - Turf Inker: 800 (rank 2 -> #2 Turf Inker, Silver, priority 139)
  // - Splat Assister: 1 (rank 3 -> no medal)
  assert.equal(compRes[1].length, 3);
  assert.equal(compRes[1][0].label, '#1 Enemy Splatter');
  assert.equal(compRes[1][0].metal, 'gold');
  assert.equal(compRes[1][1].label, '#2 Overall Splatter');
  assert.equal(compRes[1][1].metal, 'silver');
  assert.equal(compRes[1][2].label, '#2 Turf Inker');
  assert.equal(compRes[1][2].metal, 'silver');
});

test('finite validation: non-finite or negative assists do not qualify as authoritative assists', () => {
  const artCode = compose('src/ui/menu-art.js');
  const mod = vm.runInNewContext(`
    let tr = (s, ctx) => ctx ? s.replace(/\\{(\\w+)\\}/g, (_, k) => ctx[k]) : s;
    let fmtInt = (n) => String(n);
    let MATCH_TAGS = {};
    ${stripExports(section(artCode, 'export const AWARDS =', '\n// boss mode'))}
    ${stripExports(section(artCode, 'export function computeAwards(', '\n/** Big stamped medal'))}
    ; ({ computeAwards })
  `, { console });

  // Test cases with non-finite values (NaN, Infinity, negative, string)
  const invalidSquads = [
    [{ team: 0, turf: 1000, splats: 3, assists: 3 }, { team: 0, turf: 800, splats: 2, assists: NaN }],
    [{ team: 0, turf: 1000, splats: 3, assists: 3 }, { team: 0, turf: 800, splats: 2, assists: Infinity }],
    [{ team: 0, turf: 1000, splats: 3, assists: 3 }, { team: 0, turf: 800, splats: 2, assists: -1 }],
    [{ team: 0, turf: 1000, splats: 3, assists: 3 }, { team: 0, turf: 800, splats: 2, assists: '2' }],
  ];

  for (const squad of invalidSquads) {
    const res = mod.computeAwards(squad).byPlayer;
    const labels = res.flat().map(a => a.label);
    assert.ok(!labels.includes('#1 Overall Splatter'), 'Non-finite/invalid assists must omit Overall Splatter');
    assert.ok(!labels.includes('#1 Splat Assister'), 'Non-finite/invalid assists must omit Splat Assister');
  }
});
