import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const compose = (rel, code) => adaptRange(rel, adaptNetworkSource(rel,
  adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))))));

const exports = `
  export { installIssueFiveHotfixA } from './patches/splatoon3/runtime/issue-five-hotfix-a.mjs';
  export { installIssueFiveHotfixB } from './patches/splatoon3/runtime/issue-five-hotfix-b.mjs';
  export { installIssueFiveHotfixC } from './patches/splatoon3/runtime/issue-five-hotfix-c.mjs';
  export { installDisconnectFidelity } from './patches/splatoon3/runtime/disconnect-fidelity.mjs';
  export { installSlosherIntermediatePaint } from './patches/splatoon3/runtime/slosher-intermediate-paint.mjs';
  export { installQuality } from './patches/local-quality/install.mjs';
  export { installWeaponsFidelity } from './patches/splatoon3/runtime/weapons-fidelity.mjs';
  export { installIssueEightFollowup } from './patches/splatoon3/runtime/issue-eight-followup.mjs';
  export { hudFrameSnapshot } from './patches/local-quality/hud-snapshots.mjs';
`;

async function bootstrap({ negative = null } = {}) {
  const adapt = (rel, code) => {
    const out = compose(rel, code);
    if (negative === 'slam' && rel === 'src/game/actor.js') {
      assert.ok(out.includes(' && !this.s3TidalSlamGaugeFinish'));
      return out.replaceAll(' && !this.s3TidalSlamGaugeFinish', '');
    }
    if (negative === 'storm' && rel === 'patches/local-quality/hud-snapshots.mjs') {
      const projection = '  const stormGauge = stormGaugeFraction(a);\n  frame.special = stormGauge ?? a.specialFrac(); frame.specialReady = a.specialReady(); frame.specialActive = stormGauge !== null || !!a.specialActive;';
      assert.ok(out.includes(projection));
      return out.replace(projection, '  frame.special = a.specialFrac(); frame.specialReady = a.specialReady(); frame.specialActive = !!a.specialActive;');
    }
    return out;
  };
  // Apply build transforms to runtime modules as well as upstream modules.
  const f = await fixture({ fullRuntime: true, adapt, adaptRuntime: adapt, realProjectiles: true, extraExports: exports });
  // The production entry calls these after install(profile). Verify its order
  // before mirroring it here; no silent actor-only "fullRuntime" assumption.
  const source = fs.readFileSync(new URL('../bootstrap.mjs', import.meta.url), 'utf8');
  const names = ['installIssueFiveHotfixA', 'installIssueFiveHotfixB', 'installIssueFiveHotfixC',
    'installDisconnectFidelity', 'installSlosherIntermediatePaint', 'installQuality',
    'installWeaponsFidelity', 'installIssueEightFollowup'];
  let previous = source.indexOf('const context = install(profile);');
  assert.ok(previous >= 0);
  for (const name of names) {
    const index = source.indexOf(`  ${name}(`, previous);
    assert.ok(index > previous, `production bootstrap still installs ${name} in this order`);
    previous = index;
    if (name === 'installQuality') f[name](f.profile);
    else f[name](f.installedRuntime, f.profile);
  }
  f.G.physics.groundProbe = (_x, y, _z, up, down, _r, out) => {
    out.hit = y + up >= -1e-6 && y - down <= 1e-6;
    out.y = 0; out.normal.set(0, 1, 0); out.face = -1; out.block = -1;
    out.u = out.v = 0; out.center = true; out.grate = false; return out;
  };
  f.G.physics.collideBody = (_p, _r, _l, _h, contacts) => {
    contacts.ground = contacts.wall = contacts.ceiling = false; return contacts;
  };
  f.G.level.spawnPads = [new f.THREE.Vector3(), new f.THREE.Vector3()];
  f.G.match.state = 'playing';
  return f;
}

function view(f, actor) {
  const game = { settings: {}, minimap: { canvas: {} }, _lowInkFlash: 0 };
  return f.hudFrameSnapshot(game, { time: 180, teamSummary: () => [] }, actor,
    actor.weapon, 0, [], [], null, false, f.PLAYER, f.SUB);
}

test('#469 removed projection still reproduces the HUD defect under complete bootstrap', async () => {
  const f = await bootstrap({ negative: 'storm' }), a = f.make('splatling'); a.isLocal = true;
  a.special = a.specialCost(); a._startSpecial();
  a.intent.sub = true; f.tick(a); a.intent.sub = false; f.tick(a); f.tick(a, 240);
  close(a.stormGaugeLock, 4); assert.equal(view(f, a).special, 0);
  assert.equal(view(f, a).specialActive, false);
});

test('#647 removed admission guard still permits native reactivation under complete bootstrap', async () => {
  const f = await bootstrap({ negative: 'slam' }), a = f.make('dualies'); a.isLocal = true;
  a.special = a.specialCost(); a._startSpecial();
  let ticks = 0; while (a.specialActive && ticks++ < 180) f.tick(a);
  assert.ok(ticks < 180); assert.ok(a.s3TidalSlamGaugeFinish);
  const uses = a.stats.specials;
  a.addTurf(a.specialCost()); assert.equal(a.specialReady(), true);
  a.intent.special = true; f.tick(a);
  assert.equal(a.specialActive?.id, 'slam'); assert.equal(a.stats.specials, uses + 1);
});

test('#469 personal Storm used gauge remains connected with every production bootstrap wrapper', async () => {
  const f = await bootstrap(), a = f.make('splatling'); a.isLocal = true;
  assert.equal(a.weapon.special, 'storm', 'current original Splatling kit still uses Storm');
  a.special = a.specialCost(); a._startSpecial();
  assert.equal(view(f, a).special, 1); assert.equal(a.special, 0);
  a.intent.sub = true; f.tick(a); a.intent.sub = false; f.tick(a);
  assert.equal(f.G.projectiles.bombs.length, 1);
  f.tick(a, 240);
  close(a.stormGaugeLock, 4); close(view(f, a).special, .5);
  assert.equal(a.specialActive, null); assert.equal(view(f, a).specialActive, true);
  a.addTurf(10); assert.equal(a.special, 0);
  f.tick(a, 240); assert.equal(view(f, a).specialActive, false);
  a.addTurf(10); assert.equal(a.special, 10);
});

test('#647 local pending-landing admission remains effective after every bootstrap wrapper', async () => {
  const f = await bootstrap(), a = f.make('dualies'); a.isLocal = true;
  assert.equal(a.weapon.special, 'slam', 'current original Dualies kit still uses Slam');
  a.special = a.specialCost(); a._startSpecial();
  let ticks = 0; while (a.specialActive && ticks++ < 180) f.tick(a);
  assert.ok(ticks < 180); assert.ok(a.s3TidalSlamGaugeFinish);
  const held = a.special, uses = a.stats.specials, turf = a.stats.turf;
  a.addTurf(a.specialCost()); close(a.special, held);
  close(a.stats.turf, turf + a.specialCost()); assert.equal(a.specialReady(), false);
  a.intent.special = true; f.tick(a);
  assert.equal(a.specialActive, null); assert.equal(a.stats.specials, uses);
  ticks = 0; while (a.s3TidalSlamGaugeFinish && ticks++ < 60) f.tick(a);
  assert.ok(ticks < 60); assert.equal(a.special, 0);
  a.addTurf(a.specialCost()); assert.equal(a.specialReady(), true);
});

test('#469/#647 installed production leave retires a human and never invokes native adoption', async () => {
  const f = await bootstrap(), a = f.make('shooter');
  a.nid = 7; a.owner = 'p2'; a.remote = true; a.isLocal = false;
  const session = { myId: 'host', hostId: 'host', isHost: true,
    _members: new Map([['host', 'Host'], ['p2', 'Owner']]),
    tr: { broadcast() {}, sendTo() {} } };
  const nm = new f.NetMatch(session, { id: 'scope-proof', map: 'map', difficulty: 'normal' });
  const match = { actors: [a], state: 'playing', duration: 180, time: 100,
    removeActor(actor) { this.actors = this.actors.filter(x => x !== actor); } };
  nm.match = match; nm.byNid.set(a.nid, a); nm._setupActor(a);
  let adopted = 0; nm._adopt = () => { adopted++; };
  nm.onLeave('p2', false);
  assert.equal(adopted, 0); assert.equal(a.s3.disconnected, true);
  assert.equal(a.alive, false); assert.equal(a.remote, true); assert.equal(a.isBot, false);
  assert.equal(a.owner, null); assert.equal(a.respawnTimer, Infinity);
});
