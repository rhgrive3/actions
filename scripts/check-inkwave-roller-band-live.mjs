#!/usr/bin/env node
// #1165: real browser integration of native Level/Physics/PaintSystem,
// Actor ink consumers, BotBrain navigation and the Match Turf judge.
// A constructed deterministic stage isolates ownership; no Switch/iPad claim.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { rollerBandCounterfactual } from './lib/inkwave-roller-band-control.mjs';

const option = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const site = path.resolve(option('--site', '.built-site/issue-resolution-final'));
const out = path.resolve(option('--evidence-dir', '.browser-evidence/issue-1165-live'));
const engine = option('--engine', 'chromium');
const negativeControl = option('--negative-control', null);
assert.ok(engine === 'chromium' || engine === 'webkit', 'unsupported engine');
assert.ok(negativeControl === null || negativeControl === 'original-core' || negativeControl === 'old-scan', 'unsupported counterfactual');
fs.mkdirSync(out, { recursive: true });
for (const result of ['result.json', 'failure.json']) fs.rmSync(path.join(out, result), { force: true });
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifestBytes = fs.readFileSync(path.join(site, 'inkwave-build.json'));
const manifest = JSON.parse(manifestBytes);
assert.equal(hash(JSON.stringify(manifest.artifacts)), manifest.contentHash);
const served = new Map(), errors = [];
let counterfactual = null;
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((request, response) => {
  try {
    const rel = decodeURIComponent(new URL(request.url, 'http://local').pathname).slice(1);
    if (!rel) {
      response.setHeader('content-type', 'text/html');
      response.end('<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>');
      return;
    }
    const file = path.resolve(site, rel);
    assert.ok(file.startsWith(site + path.sep));
    let bytes = fs.readFileSync(file);
    const digest = hash(bytes);
    assert.equal(digest, manifest.artifacts[rel], 'undeclared or changed build artifact: ' + rel);
    if (negativeControl && rel === 'src/world/paint.js') {
      bytes = Buffer.from(rollerBandCounterfactual(bytes.toString(), negativeControl));
      counterfactual = { control: negativeControl, path: rel, originalSha256: digest, servedSha256: hash(bytes),
        scope: 'Only this declared compiled CPU method is mutated; all other served build artifacts remain exact.' };
    }
    served.set(rel, hash(bytes));
    response.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
    response.end(bytes);
  } catch (error) { response.writeHead(404); response.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const pw = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
let browser;
const started = Date.now();
try {
  browser = await pw[engine].launch({ headless: true, ...(engine === 'chromium' ? {
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  } : {}) });
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port + '/');
  const proof = await page.evaluate(async () => {
    const T = await import('three');
    const { G } = await import('/src/core/ctx.js');
    const { DEFAULT_SETTINGS, PLAYER } = await import('/src/config.js');
    const { PaintSystem } = await import('/src/world/paint.js');
    const { Level } = await import('/src/world/level.js');
    const { Physics } = await import('/src/game/physics.js');
    const { Actor } = await import('/src/game/actor.js');
    const { Character } = await import('/src/game/character.js');
    const { Projectiles } = await import('/src/game/weapons.js');
    const { BotBrain } = await import('/src/game/bots.js');
    const { NavGraph } = await import('/src/game/nav.js');
    const { Match } = await import('/src/game/match.js');
    const { FixedClock, STEP } = await import('/patches/splatoon3/runtime/clock.mjs');
    const { install } = await import('/patches/splatoon3/runtime/install.mjs');
    install(await (await fetch('/patches/splatoon3/profile.json')).json());
    const check = (condition, label, detail) => { if (!condition) throw Error(label + ': ' + JSON.stringify(detail)); };
    const v = (x, y, z) => new T.Vector3(x, y, z);
    G.netm = null; G.net = null; G.settings = { ...DEFAULT_SETTINGS, quality: 'low' };
    G.teamColors = [new T.Color('#ff8a14'), new T.Color('#2f5bff')]; G.teamHex = ['#ff8a14', '#2f5bff'];
    G.scene = new T.Scene(); G.camera = new T.PerspectiveCamera();
    G.camera.position.set(4, 6, 4); G.time = 0; G.actors = []; G.audio = null; G.fx = null;
    const layout = { id: 'issue-1165-controlled-turf', bounds: { minX: 0, maxX: 8, minZ: 0, maxZ: 8 },
      spawnPads: [[1, 0, 1], [7, 0, 7]], spawnBarrier: 0, half: [], single: [
        { kind: 'box', min: [0, -1, 0], max: [8, 0, 8], noPaint: [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]] },
      ] };
    const level = G.level = new Level(layout);
    G.physics = new Physics(level); G.nav = new NavGraph(level, G.physics);
    G.projectiles = new Projectiles(G.scene);
    const renderer = new T.WebGLRenderer();
    const paint = G.paint = new PaintSystem(renderer, level, { atlasSize: 1024, maxDensity: 120, cell: .25 });
    const face = level.faces.find(f => f.turf && f.atlas);
    const world = (u, w) => face.origin.clone().addScaledVector(face.u, u).addScaledVector(face.v, w);
    const stretch = angle => face.u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(face.v, Math.sin(angle));
    const a = new Actor({ team: 0, weapon: 'roller', CharacterClass: Character, name: 'band-own' });
    const b = new Actor({ team: 1, weapon: 'shooter', CharacterClass: Character, name: 'band-opponent' });
    G.scene.add(a.character.root, b.character.root); G.actors = [a, b];
    const match = G.match = new Match({ duration: 180, difficulty: 'normal' });
    match.actors = [a, b]; match.state = 'playing';
    const pixels = new Uint8Array(paint.size * paint.size * 4);
    const tooth = x => 1 - 4 * Math.abs(x - Math.floor(x) - .5);
    const distance = (u, w, op) => {
      const px = u - op.u, py = w - op.w, dx = Math.cos(op.angle), dy = Math.sin(op.angle);
      const along = px * dx + py * dy, across = -px * dy + py * dx;
      const wobble = op.r * (.08 * tooth(along / op.r * 2.1 + op.seed * 4.7 + .25)
        + .04 * tooth(along / op.r * 5.3 + op.seed * 2.3 + .25));
      const x = Math.abs(along) - op.r * .55, y = Math.abs(across) - op.r * .62 - wobble;
      return Math.hypot(Math.max(x, 0), Math.max(y, 0)) + Math.min(Math.max(x, y), 0) - op.r * .1;
    };
    // Bound fragment derivatives and grid-center-to-texel-center displacement.
    // Later fully opaque ink resets any uncertainty inherited from old AA.
    const aa = (1.5 * Math.SQRT2 + Math.SQRT1_2) * (1 + .08 * 4 * 2.1 + .04 * 4 * 5.3) / face.atlas.ppm;
    let operations = [];
    const stamp = op => {
      operations.push(op);
      paint.splat(world(op.u, op.w), op.r, op.team, { kind: 'roll', seed: op.seed,
        stretch: stretch(op.angle), instant: !!op.instant });
    };
    const stats = { rateRuns: [], gpuComparisons: 0, aaUncertain: 0, cpuOracleComparisons: 0,
      sampleWorldChecks: 0, regionChecks: 0, maxGrowing: 0, actorChecks: [], botChecks: [], judgements: [] };
    const inspect = (label, strictAll = false) => {
      renderer.readRenderTargetPixels(paint.rt, 0, 0, paint.size, paint.size, pixels);
      const counts = [0, 0], gpuCounts = [0, 0];
      for (let j = 0; j < face.nv; j++) for (let i = 0; i < face.nu; i++) {
        const u = (i + .5) * face.cu, w = (j + .5) * face.cv;
        let expected = 0, uncertain = false;
        for (const op of operations) {
          const sd = distance(u, w, op);
          if (sd <= 0) expected = op.team + 1;
          if (sd < -aa) uncertain = false;
          else if (Math.abs(sd) <= aa) uncertain = true;
        }
        const cpu = paint.sample(face.id, u, w);
        check(cpu === expected, 'CPU disagrees with chronological Roller core oracle', { label, i, j, cpu, expected });
        stats.cpuOracleComparisons++;
        check(paint.sampleWorld(face.id, world(u, w)) === expected, 'sampleWorld mismatch', { label, i, j });
        stats.sampleWorldChecks++;
        if (cpu) counts[cpu - 1]++;
        const x = Math.floor(face.atlas.x + face.atlas.pad + u * face.atlas.ppm);
        const y = Math.floor(face.atlas.y + face.atlas.pad + w * face.atlas.ppm);
        const k = (y * paint.size + x) * 4;
        const gpu = pixels[k + 3] < 128 ? 0 : pixels[k] >= 128 ? 2 : 1;
        if (gpu) gpuCounts[gpu - 1]++;
        if (uncertain && !strictAll) stats.aaUncertain++;
        else { check(gpu === cpu, 'GPU band body differs from authoritative cell', { label, i, j, gpu, cpu, uncertain, pixel: Array.from(pixels.subarray(k, k + 4)) }); stats.gpuComparisons++; }
        const p = world(u, w), region = paint.regionStats(p.x, p.y, p.z, .02, 0);
        check(region.n === 1 && region.own === Number(expected === 1) && region.enemy === Number(expected === 2), 'regionStats cell ownership mismatch', { label, i, j, expected, region });
        stats.regionChecks++;
      }
      check(counts.every((n, team) => paint.counts[team] === n), 'incremental count mismatch', { label, counts, actual: Array.from(paint.counts) });
      check(paint.coverage().every((n, team) => n === counts[team] / paint.turfTotal), 'Turf coverage mismatch', { label, counts });
      return { counts, gpuCounts, grid: Array.from(paint.grid), growing: paint.growing.length };
    };
    try {
      const seeds = [0, Math.PI / 60, .1, .4125, .5, .99];
      for (const op of [
        { u: 3.125, w: 3.125 - .73 * .62, r: .62, seed: Math.PI / 60, angle: 0, team: 0, label: 'published pi/60 witness' },
        // Radius 5 makes the historical broadphase omission exceed half of
        // this stage's .25m cell; the local (.623r,.788r) rounded corner falls
        // on cell (0,12). This specifically exercises the lower scan bound.
        { u: .125 + 5 * Math.hypot(.623, .788), w: 3.125, r: 5, seed: .4125, angle: Math.PI - Math.atan2(.788, .623), team: 0, label: 'rotated rounded corner witness' },
      ]) {
        paint.clear(); operations = [];
        stamp({ u: 4, w: 4, r: 100, seed: 0, angle: 0, team: 1, instant: true });
        stamp(op); paint.flush(0); inspect(op.label);
      }
      const plan = Array.from({ length: 30 }, (_, i) => ({ tick: 2 + i * 3,
        u: 1.4 + (i % 5) * 1.25, w: 1.3 + (Math.floor(i / 5) % 4) * 1.5,
        r: [.3, .62, 1][i % 3], seed: seeds[i % seeds.length], angle: [0, .3, 1.3, 2.8][i % 4], team: i % 2 }));
      let referenceGrid;
      for (const hz of [30, 60, 120, 144]) {
        paint.clear(); paint.useFixedPaintClock(); operations = [];
        stamp({ u: 4, w: 4, r: 100, seed: 0, angle: 0, team: 1, instant: true }); paint.flush(0);
        const clock = new FixedClock(); let ticks = 0, next = 0, frames = 0;
        const snapshots = [];
        for (let frame = 0; frame < hz * 2; frame++) {
          clock.advance(1 / hz, dt => {
            ticks++; G.time += dt;
            while (next < plan.length && plan[next].tick === ticks) stamp(plan[next++]);
            paint.advanceSimulation(dt);
          });
          paint.flush(1 / hz); frames++;
          stats.maxGrowing = Math.max(stats.maxGrowing, paint.growing.length);
          if (frame === Math.floor(hz / 4) || frame === hz || frame === hz * 2 - 1) snapshots.push(inspect(hz + 'Hz frame ' + frame));
        }
        check(ticks === 120 && next === plan.length, 'fixed simulation lost input', { hz, ticks, next });
        const final = snapshots.at(-1);
        check(paint.growing.length === 0, 'growth failed to settle', { hz, growing: paint.growing.length });
        if (referenceGrid) check(final.grid.every((n, i) => n === referenceGrid[i]), 'render cadence changed authoritative Turf', { hz });
        else referenceGrid = final.grid;
        stats.rateRuns.push({ hz, frames, ticks, strokes: plan.length, counts: final.counts, snapshots: snapshots.length });
      }

      // A real native Actor consumes the same body-edge cell through Physics,
      // movement, squid refill and enemy-ink damage, with no method stubs.
      paint.clear(); operations = [];
      stamp({ u: 4, w: 4, r: 100, seed: 0, angle: 0, team: 1, instant: true });
      const r = .62, u = 3.125, w = 3.125 - .73 * r;
      stamp({ u, w, r, seed: Math.PI / 60, angle: 0, team: 0 });
      paint.flush(0);
      for (const [surface, cu, cw] of [['own', 3.125, 3.125], ['enemy', 6.125, 6.125]]) {
        a.spawnAt(world(cu, cw), 0); a.invuln = 0; a.ink = PLAYER.inkMax / 2;
        a.intent.squid = surface === 'own'; a.intent.fire = false; a.intent.move.set(0, 0, 0);
        const initial = a.ink;
        for (let tick = 0; tick < 12; tick++) { G.time += STEP; a.update(STEP); paint.advanceSimulation(STEP); }
        check(a.groundTeam === (surface === 'own' ? 1 : 2), 'native Actor surface consumer', { surface, actual: a.groundTeam });
        if (surface === 'own') check(a.submerged && a.ink > initial && a.hp === PLAYER.hp, 'own ink refill failed at historical witness', { ink: a.ink, initial, submerged: a.submerged, hp: a.hp });
        else check(a.onEnemy && a.hp < PLAYER.hp, 'enemy ink damage path failed', { hp: a.hp, max: PLAYER.hp, onEnemy: a.onEnemy });
        stats.actorChecks.push({ surface, groundTeam: a.groundTeam, inkBefore: initial, inkAfter: a.ink, hp: a.hp, submerged: a.submerged, onEnemy: a.onEnemy });
      }
      const brain = new BotBrain(a, 'normal');
      for (const team of [0, 1]) {
        paint.clear(); operations = [];
        stamp({ u: 4, w: 4, r: 100, seed: 0, angle: 0, team, instant: true });
        a.spawnAt(world(4, 4), 0); a.invuln = 0; a.ink = 5; brain.reset();
        let state = 0x1165;
        const random = Math.random; Math.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
        try { brain._pickRefill(); } finally { Math.random = random; }
        check(team === 0 ? !!brain.path?.length : brain.path === null, 'BotBrain refill navigation disagrees with authoritative surface', { team, path: brain.path });
        stats.botChecks.push({ backgroundTeam: team, refillPathFound: !!brain.path?.length, navNodes: G.nav.nodes.length });
      }
      // Exercise the real paint decision and actual weapon owner rather than
      // only calling regionStats/refill in isolation. One-actor Turf removes
      // combat target selection; a controlled midpoint RNG suppresses the
      // optional 2% repaint of already fully owned ground.
      const paintDecisions = [];
      for (const team of [0, 1]) {
        G.projectiles.clear(); paint.clear(); operations = [];
        stamp({ u: 4, w: 4, r: 100, seed: 0, angle: 0, team, instant: true });
        a.spawnAt(world(4, 4), 0); a.invuln = 0; a.ink = PLAYER.inkMax;
        match.actors = G.actors = [a]; match.state = 'playing';
        let fireTicks = 0;
        const random = Math.random; Math.random = () => .5;
        try {
          brain.reset();
          for (let tick = 0; tick < 90; tick++) {
            G.time += STEP; brain.update(STEP); if (a.intent.fire) fireTicks++;
            a.update(STEP); G.projectiles.update(STEP); paint.advanceSimulation(STEP);
          }
        } finally { Math.random = random; }
        check(team === 0 ? fireTicks === 0 : fireTicks > 0 && a.stats.turf > 0 && paint.counts[0] > 0,
          'native BotBrain paint/weapon admission ignored own versus opposing ink', { team, fireTicks, turf: a.stats.turf, counts: Array.from(paint.counts) });
        paintDecisions.push({ backgroundTeam: team, fireTicks, claimedTurf: a.stats.turf, team0Cells: paint.counts[0] });
      }
      stats.botPaintDecisions = paintDecisions;
      match.actors = G.actors = [a, b]; G.projectiles.clear();

      // Deterministic near-tie Turf: opaque halves, many ordinary Roller
      // strokes, then one grid-centered Roller body transfers one cell.
      // Large setup stamps create the initial surface; measured strokes use
      // .3/.62/1 radii. The final .12 stamp isolates exactly one standard cell.
      for (const hz of [30, 60, 120, 144]) {
        paint.clear(); paint.useFixedPaintClock(); operations = [];
        stamp({ u: 4, w: 4, r: 100, seed: 0, angle: 0, team: 1, instant: true });
        stamp({ u: -1.2, w: 4, r: 8, seed: 0, angle: 0, team: 0, instant: true });
        check(paint.counts[0] === 512 && paint.counts[1] === 512, 'near-tie setup is not symmetric', { counts: Array.from(paint.counts) });
        for (let i = 0; i < 48; i++) stamp({ u: i % 2 ? 6 : 2, w: 1 + (i % 5) * 1.5,
          r: [.3, .62, 1][i % 3], seed: seeds[i % seeds.length], angle: [0, .3, 1.3, 2.8][i % 4], team: i % 2 });
        stamp({ u: 6.125, w: 4.125, r: .12, seed: 0, angle: 0, team: 0 });
        check(paint.counts[0] === 513 && paint.counts[1] === 511, 'one-cell winner witness failed', { counts: Array.from(paint.counts) });
        a.spawnAt(world(1, 1), 0); b.spawnAt(world(7, 7), Math.PI);
        for (const actor of [a, b]) { actor.intent.squid = false; actor.intent.fire = false; actor.intent.move.set(0, 0, 0); }
        match.state = 'playing'; match.stateT = 0; match.time = STEP; match.result = null;
        const clock = new FixedClock(); let frames = 0;
        while (!match.result && frames < hz * 5) {
          clock.advance(1 / hz, dt => { G.time += dt; match.update(dt); G.projectiles.update(dt); paint.advanceSimulation(dt); });
          paint.flush(1 / hz); frames++;
        }
        check(match.result && match.state === 'judge' && match.result.winner === 0, 'actual Match judge failed', { hz, state: match.state, result: match.result });
        check(match.result.coverage[0] === 513 / 1024 && match.result.coverage[1] === 511 / 1024, 'Judd did not retain exact small-margin coverage', { hz, result: match.result });
        const final = inspect('actual Match Judd at ' + hz + 'Hz', true);
        check(final.gpuCounts[0] === 513 && final.gpuCounts[1] === 511, 'GPU cell-center winner differs from Judd', { hz, final });
        stats.judgements.push({ hz, frames, ticks: clock.ticks, winner: match.result.winner, coverage: match.result.coverage, gpuCounts: final.gpuCounts, cpuCounts: final.counts });
      }
      const gl = renderer.getContext(); check(gl.getError() === gl.NO_ERROR, 'WebGL error');
      return { ...stats, aaToleranceWorld: aa, atlasPpm: face.atlas.ppm, turfCells: paint.turfTotal,
        scope: 'Constructed Turf stage with real native Level/Physics/PaintSystem/Actor/BotBrain/Match; final build artifacts; no menu/full renderer, Switch, iPad or hardware-performance claim.' };
    } finally { match.dispose(); G.projectiles.clear(); paint.dispose(); renderer.dispose(); }
  });
  assert.deepEqual(errors, []);
  const result = { status: 'passed', engine, browser: browser.version(), elapsedMs: Date.now() - started,
    contentHash: manifest.contentHash, inputHash: manifest.inputHash, counterfactual, ...proof, pageErrors: errors, served: Object.fromEntries(served) };
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ status: result.status, engine, browser: result.browser, elapsedMs: result.elapsedMs, contentHash: result.contentHash, gpuComparisons: result.gpuComparisons, cpuOracleComparisons: result.cpuOracleComparisons, rateRuns: result.rateRuns, actorChecks: result.actorChecks, botPaintDecisions: result.botPaintDecisions, judgements: result.judgements }));
} catch (error) {
  fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ status: 'failed', engine, contentHash: manifest.contentHash,
    elapsedMs: Date.now() - started, error: String(error.stack || error), counterfactual, pageErrors: errors, served: Object.fromEntries(served) }, null, 2) + '\n');
  throw error;
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
  assert.equal(hash(fs.readFileSync(path.join(site, 'inkwave-build.json'))), hash(manifestBytes), 'build changed during capture');
}
