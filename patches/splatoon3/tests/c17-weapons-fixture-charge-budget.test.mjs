// C17 CI repair regression (#732/#745 -> scripts/measure-weapons-fidelity.mjs).
// This file builds the emitted fixture once because canonical patch tests run
// before CI's published-site build. The output lives in persistent task cache.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fixture } from '../../../scripts/weapons-fixture.mjs';
import { CASES, reset, round, runChargeCase } from '../../../scripts/measure-weapons-fidelity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const isWithin = (base, file) => file === base || file.startsWith(base.endsWith(path.sep) ? base : base + path.sep);
const forbiddenRoots = ['/tmp', '/var/tmp', '/dev/shm'];
let sitePromise;

function checkedLocation(location, allowedRoot) {
  const absolute = path.resolve(location);
  const forbidden = candidate => forbiddenRoots.some(base => candidate === base || candidate.startsWith(base + path.sep));
  assert.equal(forbidden(absolute), false, `fixture build path must not use transient storage: ${absolute}`);
  assert.ok(isWithin(allowedRoot, absolute), `fixture build path must stay under persistent storage: ${absolute}`);
  let ancestor = absolute;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const realAncestor = fs.realpathSync(ancestor);
  assert.equal(forbidden(realAncestor), false, `fixture cache ancestor must not use transient storage: ${realAncestor}`);
  assert.ok(isWithin(allowedRoot, realAncestor), `fixture cache ancestor must stay under persistent storage: ${realAncestor}`);
  return absolute;
}

function persistentCacheRoot() {
  if (process.env.GITHUB_WORKSPACE) {
    const workspace = fs.realpathSync(process.env.GITHUB_WORKSPACE);
    const cache = checkedLocation(path.join(workspace, '.ci-scratch', 'cache', 'inkwave-c26-fixture'), workspace);
    fs.mkdirSync(cache, { recursive: true });
    const resolved = fs.realpathSync(cache);
    assert.ok(isWithin(workspace, resolved), 'Actions fixture cache resolves under its workspace');
    return { cache: resolved, allowedRoot: workspace };
  }
  const workspace = fs.realpathSync('/mnt/workspace');
  const cache = checkedLocation('/mnt/workspace/.dev-state/agent-work/cache/inkwave-c26-fixture', workspace);
  fs.mkdirSync(cache, { recursive: true });
  const resolved = fs.realpathSync(cache);
  assert.ok(isWithin(workspace, resolved), 'fixture cache resolves under persistent workspace storage');
  return { cache: resolved, allowedRoot: workspace };
}

async function emittedSite() {
  if (!sitePromise) sitePromise = (async () => {
    const { cache, allowedRoot } = persistentCacheRoot();
    const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    assert.match(sourceSha, /^[0-9a-f]{40}$/, 'fixture build is keyed to the checked-out source commit');
    const buildKey = crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(root, 'scripts/build-inkwave.mjs')))
      .update(fs.readFileSync(path.join(root, 'patches/splatoon3/adapter.mjs')))
      .update(fs.readFileSync(path.join(root, 'patches/splatoon3/profile.json')))
      .digest('hex').slice(0, 12);
    const site = checkedLocation(path.join(cache, `site-${sourceSha}-${buildKey}`), allowedRoot);
    const identity = path.join(site, 'inkwave-build.json');
    if (!fs.existsSync(path.join(site, 'index.html')) || !fs.existsSync(identity)) {
      execFileSync(process.execPath, [path.join(root, 'scripts/build-inkwave.mjs'), path.join(root, 'inkwave-public'), site], {
        cwd: root,
        stdio: 'inherit',
      });
    }
    const resolvedSite = fs.realpathSync(site);
    assert.ok(isWithin(allowedRoot, resolvedSite), 'emitted fixture site resolves under persistent workspace storage');
    assert.equal(forbiddenRoots.some(base => resolvedSite === base || resolvedSite.startsWith(base + path.sep)), false,
      'emitted fixture site must not resolve into transient storage');
    const built = JSON.parse(fs.readFileSync(identity, 'utf8'));
    assert.ok(built.contentHash && built.inputHash, 'fixture uses a complete emitted build identity');
    return site;
  })();
  return sitePromise;
}

const close = (a, b, tolerance = 1e-7, message = '') =>
  assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} != ${b} ±${tolerance}`);

test('the Heavy Splatling humanoid startup is budgeted by the production charge loop', async () => {
  const site = await emittedSite();
  const f = await fixture({ site, fidelity: true, floor: false, network: false });
  const full = CASES.find(x => x.key === 'splatling-full');

  // Negative control for the former raw-tick fixture: one startup tick was
  // counted as charge, so the nominal full-charge budget released early.
  const raw = reset(f, full);
  const rawTickBudget = Math.round(full.charge * raw.weapon.chargeTime * 60);
  for (let frame = 0; frame < rawTickBudget; frame++) f.tick(raw, { fire: true });
  assert.ok(raw.weaponRunner.charge < full.charge - 1e-9, 'the old raw-tick budget still reproduces the under-charge');

  for (const key of ['splatling-partial', 'splatling-first', 'splatling-full']) {
    const c = CASES.find(x => x.key === key);
    const got = runChargeCase(f, c);
    close(got.chargeAtRelease, c.charge, 1e-8, `${key} reaches its named charge`);
    assert.ok(got.chargeAtRelease >= c.charge - 1e-9, `${key} must reach its named charge fraction`);
  }
});

test('the pinned splatling-full 40-shot and 22.5 ink goldens hold on the emitted site', async () => {
  const site = await emittedSite();
  const f = await fixture({ site, fidelity: true, floor: false, network: false });
  const c = CASES.find(x => x.key === 'splatling-full');
  const { a, chargeAtRelease } = runChargeCase(f, c);
  close(chargeAtRelease, 1, 1e-9, 'splatling-full reaches full charge');
  for (let frame = 0; frame < 240; frame++) f.tick(a, { fire: false });
  assert.equal(f.fires.length, 40, 'splatling-full must still land the pinned 40 shots');
  close(round(100 - a.ink), 22.5, 1e-7, 'the pinned ink golden is unchanged');
});

test('charger startup telemetry and 18 ink golden stay in the shared production loop', async () => {
  const site = await emittedSite();
  const f = await fixture({ site, fidelity: true, floor: false, network: false });
  const c = CASES.find(x => x.key === 'charger-1');
  const got = runChargeCase(f, c);
  assert.equal(got.chargeFrames, 1 + Math.round(c.charge * got.a.weapon.chargeTime * 60),
    'Charger retains its 1F humanoid startup in chargeFrames telemetry');
  assert.ok(got.r.charge >= 1 - 1e-9, 'charger-1 reaches full charge');
  close(got.chargeAtRelease, 1, 1e-9, 'charger-1 charge at release');
  for (let frame = 0; frame < 240; frame++) f.tick(got.a, { fire: false });
  close(round(100 - got.a.ink), 18, 1e-7, 'the charger-1 ink golden is unchanged');
});
