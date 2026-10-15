import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { adaptRankedUi } from '../ranked-ui-adapter.mjs';
import { installRankedUi } from '../runtime/ranked/ui.mjs';

const menusSource = readFileSync(new URL('../../../inkwave-public/src/ui/menus.js', import.meta.url), 'utf8');
const rankedUiSource = readFileSync(new URL('../runtime/ranked/ui.mjs', import.meta.url), 'utf8');

test('native menus adapter adds all play modes, reachable cards, and a fixed ranked clock', () => {
  const transformed = adaptRankedUi('src/ui/menus.js', menusSource);
  assert.match(transformed, /const RANKED_MODE_IDS = Object\.freeze\(\['zones', 'tower', 'rainmaker', 'clams'\]\)/);
  assert.match(transformed, /const PLAY_MODE_IDS = Object\.freeze\(\['turf', \.\.\.RANKED_MODE_IDS, 'boss'\]\)/);
  for (const id of ['zones', 'tower', 'rainmaker', 'clams']) assert.match(transformed, new RegExp(`id: '${id}'`));
  assert.match(transformed, /modeCols = globalThis\.innerWidth <= 360 \? 1 : globalThis\.innerWidth <= 900 \? 2 : 3/);
  assert.match(transformed, /initial: cards\.find\(\(card\) => card\._mode === cur\)/);
  assert.match(transformed, /ranked \? \[300\]/);
  assert.match(transformed, /else if \(mode === 'turf'\) saved\.matchLength = st\.duration/);
  assert.match(transformed, /const lenSegR = this\._seg\(\[\[300, durLabel\(300\)\]\]/);
  assert.match(transformed, /PLAY_MODE_IDS\[\(PLAY_MODE_IDS\.indexOf\(cur\)/);

  const dir = mkdtempSync(join(tmpdir(), 'ranked-ui-'));
  const file = join(dir, 'menus-ranked.mjs');
  try {
    writeFileSync(file, transformed);
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('native menus adapter fails closed when an expected source anchor changes', () => {
  const changed = menusSource.replace('const BOSS_DURATIONS = [180, 240, 300];', 'const BOSS_DURATIONS = [180, 240, 300, 360];');
  assert.throws(() => adaptRankedUi('src/ui/menus.js', changed), /ranked UI conflict/);
  assert.equal(adaptRankedUi('src/ui/other.js', 'source'), 'source');
});

test('ranked HUD judgment follows the objective winner instead of native turf percentages', async () => {
  class FakeHud {
    constructor() { this.nativeJudges = 0; this.updates = 0; }
    update() { this.updates++; }
    judge() { this.nativeJudges++; return Promise.resolve({ winner: -1 }); }
  }
  const engine = { mode: 'zones', winner: 0, counts: [73, 88], penalties: [0, 2], leader: 0, time: 0, overtime: false, overtimeElapsed: 0, rule: { state: { zones: [] } } };
  const G = { match: { ranked: engine } };
  installRankedUi({ G, HUD: FakeHud });
  const hud = new FakeHud();
  hud.update(1 / 60);
  const result = await hud.judge({ percents: [0, 100] });
  assert.equal(hud.updates, 1);
  assert.equal(hud.nativeJudges, 0);
  assert.deepEqual(result, { winner: 0 });
});

test('ranked minimap draws mode objectives above the normal map composite', () => {
  const calls = { compose: 0, marker: 0, zone: 0 };
  const ctx = Object.fromEntries(['save', 'restore', 'beginPath', 'fill', 'stroke', 'strokeText', 'fillText'].map(name => [name, () => { if (name === 'beginPath') calls.marker++; }]));
  Object.assign(ctx, {
    arc() { calls.marker++; }, fillRect() { calls.zone++; }, strokeRect() { calls.zone++; },
    moveTo() {}, lineTo() {}, setLineDash() {},
  });
  class FakeMinimap {
    constructor() { this.ctx = ctx; this.s = 5; }
    _compose() { calls.compose++; }
    toCanvas(x, z, out) { out.x = x * 5 + 50; out.y = z * 5 + 50; return out; }
  }
  const stage = { id: 'fixture', zones: [{ center: [0, 0, 0], size: [8, 7] }] };
  const engine = { mode: 'zones', stage, frame: { zoneCoverage: [[0.8, 0.2]] }, rule: { state: { zones: [{ team: 0 }] } } };
  installRankedUi({ G: { match: { ranked: engine } }, Minimap: FakeMinimap });
  const minimap = new FakeMinimap();
  minimap._compose(1 / 30);
  assert.equal(calls.compose, 1);
  assert.ok(calls.marker > 0);
  assert.ok(calls.zone > 0);
});

test('ranked minimap shows checkpoint choices and only opens the passed team goal', () => {
  const labels = [], points = [];
  const ctx = Object.fromEntries(['save', 'restore', 'beginPath', 'fill', 'stroke', 'strokeText'].map(name => [name, () => {}]));
  Object.assign(ctx, {
    arc(x, y) { points.push([x, y]); },
    fillText(label, x, y) { labels.push({ label, x, y }); },
  });
  class RainmakerMinimap {
    constructor() { this.ctx = ctx; this.s = 1; }
    _compose() {}
    toCanvas(x, z, out) { out.x = x + 100; out.y = z + 100; return out; }
  }
  const engine = {
    mode: 'rainmaker',
    stage: { id: 'fixture', rainmaker: {
      center: [0, 0, 0], checkpoints: [[[1, 0, 1], [2, 0, 2]], [[3, 0, 3], [4, 0, 4]]],
      goals: [[10, 0, 10], [-10, 0, -10]],
    } },
    rule: { state: {
      pos: [0, 0, 0], carrier: null,
      checkpoint: { passed: [true, false], choice: [1, null], goalOpen: [true, false] },
    } },
  };
  installRankedUi({ G: { match: { ranked: engine } }, Minimap: RainmakerMinimap });
  new RainmakerMinimap()._compose(1 / 30);
  const hasPoint = (x, y) => points.some(point => point[0] === x && point[1] === y);
  assert.ok(hasPoint(102, 102), 'the selected checkpoint remains visible after team 0 passes it');
  assert.ok(!hasPoint(101, 101), 'the unselected checkpoint is hidden after the pass');
  assert.ok(hasPoint(103, 103) && hasPoint(104, 104), 'the unpassed team sees both checkpoint options');
  assert.ok(labels.some(item => item.label === 'G' && item.x === 110 && item.y === 110), 'team 0 goal is open');
  assert.ok(labels.some(item => item.label === '×' && item.x === 90 && item.y === 90), 'team 1 goal stays gated');
});

test('ranked Clams minimap uses live positions and marks every Power Clam carrier', () => {
  const labels = [], points = [];
  const ctx = Object.fromEntries(['save', 'restore', 'beginPath', 'fill', 'stroke', 'strokeText'].map(name => [name, () => {}]));
  Object.assign(ctx, {
    arc(x, y) { points.push([x, y]); },
    fillText(label, x, y) { labels.push({ label, x, y }); },
  });
  class ClamsMinimap {
    constructor() { this.ctx = ctx; this.s = 1; }
    _compose() {}
    toCanvas(x, z, out) { out.x = x + 100; out.y = z + 100; return out; }
  }
  const engine = {
    mode: 'clams',
    stage: { id: 'fixture', clams: { spawns: [[1, 0, 1], [2, 0, 2]], goals: [[10, 0, 10], [-10, 0, -10]] } },
    rule: { state: {
      clams: [
        { id: 'live-small', kind: 'small', pos: [6, 0, 7] },
        { id: 'live-power', kind: 'power', pos: [8, 0, 9] },
      ],
      inventories: { '21': { team: 0, small: 0, power: true }, '22': { team: 1, small: 1, power: true } },
      baskets: [], scoredPoints: [0, 0],
    } },
  };
  const G = { match: { ranked: engine, actors: [
    { nid: 21, team: 0, pos: { x: 11, y: 0, z: 12 } },
    { nid: 22, team: 1, pos: { x: 13, y: 0, z: 14 } },
  ] } };
  installRankedUi({ G, Minimap: ClamsMinimap });
  new ClamsMinimap()._compose(1 / 30);
  const hasPoint = (x, y) => points.some(point => point[0] === x && point[1] === y);
  assert.ok(hasPoint(106, 107), 'the live small clam is drawn at its current position');
  assert.ok(hasPoint(108, 109), 'the live dropped Power Clam is drawn at its current position');
  assert.ok(!hasPoint(101, 101) && !hasPoint(102, 102), 'stage spawn anchors are not drawn as if they were live clams');
  for (const [x, y] of [[111, 112], [113, 114], [108, 109]]) {
    assert.ok(labels.some(item => item.label === 'P' && item.x === x && item.y === y), `Power Clam marker at ${x}, ${y}`);
  }
});

test('ranked HUD exposes the Clams throw controls and wraps within a tiny viewport', () => {
  assert.match(rankedUiSource, /THROW \[C\]/);
  assert.match(rankedUiSource, /THROW \[A\]/);
  assert.match(rankedUiSource, /max-width:min\(calc\(100vw - 12px\),720px\)/);
  assert.match(rankedUiSource, /@media \(max-width:560px\) \{ \.iw-ranked-hud \{ width:calc\(100vw - 12px\)/);
  assert.match(rankedUiSource, /display:flex; flex-wrap:wrap; align-items:center; justify-content:center/);
});
