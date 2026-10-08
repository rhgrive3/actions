import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';

// #359 runs the public Actor/WeaponRunner through the active source adapters and
// the complete production S3 installer. Only rendering backends, audio and the
// paint sample are deterministic fixture inputs; the submerge predicate and
// charge transition are produced by the native Actor and installed runner.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
const MAIN_WEAPONS = process.env.INKWAVE_359_MAIN_WEAPONS;
let cached;

async function production() {
  if (cached) return cached;
  const context = vm.createContext({ console, performance, URL, innerHeight: 720 }), modules = new Map();
  const load = requested => {
    let file = requested;
    if (file.startsWith(path.join(SRC, 'patches') + path.sep)) file = path.join(ROOT, path.relative(SRC, file));
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const prior = MAIN_WEAPONS && file === path.join(ROOT, 'patches/splatoon3/runtime/weapons.mjs')
      ? path.resolve(MAIN_WEAPONS) : null;
    const raw = fs.readFileSync(prior && fs.existsSync(prior) ? prior : file, 'utf8');
    const rel = path.relative(SRC, file);
    const source = file.startsWith(SRC + path.sep)
      ? adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, raw))))
      : raw;
    const mod = new vm.SourceTextModule(source, {
      context,
      identifier: file,
      initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; },
    });
    modules.set(file, mod);
    return mod;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { Level } from './src/world/level.js';
    export { NetMatch } from './src/net/netmatch.js';
  `, { context, identifier: path.join(ROOT, 'charger-store-359-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  const api = { ...entry.namespace.install(profile), NetMatch: entry.namespace.NetMatch, Level: entry.namespace.Level };
  const { G, THREE, Level, Physics } = api;
  const level = new Level({
    bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    spawnPads: [[-80, 0, 0], [80, 0, 0]], spawnBarrier: 0,
    single: [{ kind: 'box', min: [-100, -.5, -100], max: [100, 0, 100] }], half: [],
  });
  Object.assign(G, {
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), settings: { quality: 'high' },
    actors: [], time: 0, level, physics: new Physics(level), mode: 'match',
    teamColors: [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')],
    match: { playing: () => true, canRespawn: () => false, time: 180, state: 'playing', boss: null },
  });
  let paintSample = 1;
  G.paint = { sample: () => paintSample, splat: () => 0 };
  G.projectiles = new api.Projectiles(G.scene);
  cached = { ...api, setPaintSample: value => { paintSample = value; } };
  return cached;
}

async function fixture({ paint = 1 } = {}) {
  const f = await production(), { G, THREE, Actor, Character } = f;
  G.time = 0; G.actors.length = 0; G.netm = null; G.match.time = 180; G.match.state = 'playing';
  G.projectiles.clear(); f.setPaintSample(paint);
  const actors = [], nets = [];
  function make({ airborne = false, owner = undefined, nid = undefined, name = 'issue 359 actor' } = {}) {
    const a = new Actor({ team: 0, name, weapon: 'charger', CharacterClass: Character,
      style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    a.character.actor = a; G.actors.push(a); actors.push(a); G.scene.add(a.character.root);
    a.spawnAt(new THREE.Vector3(0, 0, 0), 0); a.invuln = 0;
    a.intent.move.set(0, 0, 0); a.ink = 100;
    if (owner !== undefined) a.owner = owner;
    if (nid !== undefined) a.nid = nid;
    if (airborne) { a.grounded = false; a.ground.hit = false; a.pos.y = 12; a.vel.set(0, 0, 0); }
    else { a.grounded = true; a.ground.hit = true; a.ground.face = 0; }
    return a;
  }
  function step(a, hz = 60, frames = 1) {
    const dt = 1 / hz;
    for (let i = 0; i < frames; i++) { G.time += dt; a.update(dt); }
  }
  function chargeFully(a, hz = 60) {
    a.intent.fire = true;
    for (let i = 0; i < hz * 8 && a.weaponRunner.chargeT < 1; i++) step(a, hz);
    assert.equal(a.weaponRunner.chargeT, 1, `native runner elapsed a full charge at ${hz} Hz`);
    assert.equal(a.weaponRunner.charge, 1, `native runner emitted canonical full charge at ${hz} Hz`);
  }
  function chargeAtExactClock(a, hz = 60) {
    a.intent.fire = true;
    const startupFrames = Math.ceil(hz / 60); // #726's 1/60 s startup spans render frames at 120 Hz
    const frames = startupFrames + Math.ceil(a.weapon.chargeTime * hz);
    for (let i = 0; i < frames; i++) step(a, hz);
    return frames;
  }
  function enterSquid(a, hz = 60) {
    a.intent.squid = true;
    step(a, hz);
    assert.equal(a.form, 'squid', 'native Actor accepted the post-fire swim press');
  }
  function bindNet(net, match) { nets.push(net); net.bind(match); }
  function close() {
    for (const net of nets) net.dispose();
    for (const a of actors) { G.scene.remove(a.character.root); a.character.dispose(); }
    G.projectiles.clear(); G.netm = null; G.actors.length = 0;
  }
  return { ...f, G, make, step, chargeFully, chargeAtExactClock, enterSquid, bindNet, close };
}

test('dry, enemy-ink and airborne squid form cannot create a new stored charge', async () => {
  for (const scenario of [
    { name: 'dry', paint: 0, airborne: false },
    { name: 'enemy ink', paint: 2, airborne: false },
    { name: 'air', paint: 1, airborne: true },
  ]) {
    const f = await fixture({ paint: scenario.paint });
    try {
      const a = f.make({ airborne: scenario.airborne, name: `#359 ${scenario.name}` });
      f.chargeFully(a);
      if (scenario.airborne) { a.grounded = false; a.ground.hit = false; a.pos.y = 12; }
      a.intent.squid = true;
      f.step(a);
      if (scenario.name === 'enemy ink') assert.equal(a.form, 'kid', 'composed #160 rejects enemy-ground squid form');
      assert.equal(a.submerged, false, `${scenario.name} stays outside the native submerged state`);
      assert.equal(a.weaponRunner.s3Stored, null, `${scenario.name} cannot bank a full charge`);
    } finally { f.close(); }
  }
});

test('own-ink submerge stores a full charge and later dry/surface transitions preserve that valid store', async () => {
  const f = await fixture({ paint: 1 });
  try {
    const a = f.make(); f.chargeFully(a); f.enterSquid(a);
    assert.equal(a.groundTeam, 1);
    assert.equal(a.submerged, true);
    assert.equal(a.weaponRunner.s3Stored?.charge, 1);
    const remaining = a.weaponRunner.s3Stored.remaining;
    f.setPaintSample(0); f.step(a);
    assert.equal(a.submerged, false, 'paint edge made the squid dry');
    assert.ok(a.weaponRunner.s3Stored, 'a later dry state does not erase an already valid keep');
    assert.ok(a.weaponRunner.s3Stored.remaining < remaining, 'the existing keep timer continues');
    a.intent.squid = false; f.step(a);
    assert.equal(a.form, 'kid');
    assert.ok(a.weaponRunner.s3Stored || a.weaponRunner.charging && a.weaponRunner.charge >= .999,
      'surfacing preserves or restores the valid full charge');
  } finally { f.close(); }
});

test('partial charge is rejected; release, death, reset and weapon replacement clear a legitimate store', async () => {
  const f = await fixture({ paint: 1 });
  try {
    const partial = f.make(); partial.intent.fire = true;
    for (let i = 0; i < 60 && partial.weaponRunner.charge < .35; i++) f.step(partial);
    assert.ok(partial.weaponRunner.charge > 0 && partial.weaponRunner.charge < .999);
    f.enterSquid(partial);
    assert.equal(partial.weaponRunner.s3Stored, null);

    for (const teardown of ['release', 'death', 'reset', 'swap']) {
      const a = f.make({ name: `#359 ${teardown}` }); f.chargeFully(a); f.enterSquid(a);
      assert.ok(a.weaponRunner.s3Stored, `precondition for ${teardown}`);
      if (teardown === 'release') { a.intent.fire = false; f.step(a); }
      else if (teardown === 'death') { a.damage(200, null, 'shooter'); f.step(a); }
      else if (teardown === 'reset') a.reset();
      else a.setWeapon('shooter');
      assert.equal(a.weaponRunner.s3Stored, null, `${teardown} clears the stored state`);
      assert.equal(a.weaponRunner.charge, 0, `${teardown} does not leave a full-charge presentation`);
    }
  } finally { f.close(); }
});

test('store eligibility and same-tick ZR cancellation hold at 30, 60 and 120 Hz', async () => {
  for (const hz of [30, 60, 120]) {
    const dry = await fixture({ paint: 0 });
    try {
      const a = dry.make({ name: `#359 dry ${hz} Hz` }); dry.chargeFully(a, hz); dry.enterSquid(a, hz);
      assert.equal(a.submerged, false); assert.equal(a.weaponRunner.s3Stored, null, `dry at ${hz} Hz`);
    } finally { dry.close(); }

    const ownInk = await fixture({ paint: 1 });
    try {
      const a = ownInk.make({ name: `#359 own ink ${hz} Hz` }); ownInk.chargeFully(a, hz); ownInk.enterSquid(a, hz);
      assert.equal(a.submerged, true); assert.ok(a.weaponRunner.s3Stored, `valid store at ${hz} Hz`);
      a.intent.fire = false; ownInk.step(a, hz);
      assert.equal(a.weaponRunner.s3Stored, null, `release cancels on the next ${hz} Hz tick`);
    } finally { ownInk.close(); }
  }
});

test('#840 the completed native charge clock emits exact full charge before storing at 30, 60 and 120 Hz', async () => {
  for (const hz of [30, 60, 120]) {
    const f = await fixture({ paint: 1 });
    try {
      const a = f.make({ name: `#840 exact full clock ${hz} Hz` });
      const frames = f.chargeAtExactClock(a, hz);
      assert.equal(frames, Math.ceil(hz / 60) + Math.ceil(a.weapon.chargeTime * hz), 'the existing 1/60 s startup precedes the full charge clock');
      assert.equal(a.weaponRunner.chargeT, 1, `authoritative charge clock completes at ${hz} Hz`);
      assert.equal(a.weaponRunner.charge, 1, `only completed clock emits q=1 at ${hz} Hz`);
      f.enterSquid(a, hz);
      assert.equal(a.submerged, true, `own-ink squid state at ${hz} Hz`);
      assert.equal(a.weaponRunner.s3Stored?.charge, 1, `completed full charge stores at ${hz} Hz`);
    } finally { f.close(); }
  }
});

test('owned wirepack carries only remote swim visuals; the owner fires the restored charge once', async () => {
  const f = await fixture({ paint: 1 }), fires = [], ownerPackets = [], remoteFires = [];
  const offFire = f.on('weapon:fire', event => fires.push(event));
  try {
    const owner = f.make({ owner: 'owner', nid: 7, name: 'owned Charger' });
    const ownerSession = { myId: 'owner', isHost: false, hostId: 'host', _members: new Set(['owner', 'observer']),
      tr: { broadcast: packet => ownerPackets.push(packet) } };
    const ownerNet = new f.NetMatch(ownerSession, { map: 'Scorch Gorge' });
    f.bindNet(ownerNet, { actors: [owner], state: 'playing', time: 0, boss: null });
    f.chargeFully(owner); f.enterSquid(owner);
    assert.ok(owner.weaponRunner.s3Stored);
    ownerNet._sendTick();
    const packet = ownerPackets.at(-1), packed = packet?.a?.[0];
    assert.equal(packet?.k, 't'); assert.equal(packed?.[0], 7);
    assert.ok(packed[10] & 2, 'owner packet represents squid form');
    assert.ok(packed[10] & 4, 'owner packet represents actual submergence');
    assert.equal(packed[10] & 128, 0, 'stored charge is not an active charging pose');
    assert.equal(packed[14], 0, 'the remote packet does not receive an extra stored charge');
    assert.equal(JSON.stringify(packet).includes('s3Stored'), false, 'private stored state is not serialized');

    f.setPaintSample(0);
    const remote = f.make({ owner: 'owner', nid: 7, name: 'remote Charger visual' });
    remote.owner = 'owner'; remote.nid = 7;
    const observerSession = { myId: 'observer', isHost: false, hostId: 'host', _members: new Set(['owner', 'observer']),
      tr: { broadcast() {} } };
    const observerNet = new f.NetMatch(observerSession, { map: 'Scorch Gorge' });
    f.bindNet(observerNet, { actors: [remote], state: 'playing', time: 0, boss: null });
    observerNet.onMessage('owner', packet);
    const peer = observerNet._peer('owner');
    observerNet._advance(peer, 1 / 60);
    observerNet._sample(remote, performance.now() / 1000, 1 / 60);
    observerNet.applyRemote(remote, 1 / 60);
    assert.equal(remote.remote, true);
    assert.equal(remote.form, 'squid'); assert.equal(remote.submerged, true);
    assert.equal(remote.weaponRunner.s3Stored, null);
    assert.equal(remote.weaponRunner.charge, 0);
    assert.equal(fires.length, 0); assert.equal(remoteFires.length, 0, 'remote visual application fires nothing');

    f.G.netm = ownerNet;
    owner.intent.squid = false;
    const restoreGuard = Math.ceil((owner.weapon.storedFireDelay || 0) * 60) + 4;
    for (let i = 0; i < restoreGuard && !owner.weaponRunner.charging; i++) f.step(owner);
    assert.equal(owner.form, 'kid'); assert.ok(owner.weaponRunner.charging);
    assert.ok(owner.weaponRunner.charge >= .999);
    owner.intent.fire = false; f.step(owner);
    assert.equal(fires.length, 0, 'the composed release owner preserves its one fixed release frame');
    f.step(owner);
    assert.equal(fires.length, 1, 'the owner produces one real Charger fire event');
    ownerNet._sendTick();
    const sentFireEvents = (ownerPackets.at(-1)?.e || []).filter(event => event[1] === 'ev' && event[2] === 'weapon:fire');
    assert.equal(sentFireEvents.length, 1, 'the owner emits one wire event for that shot');
    assert.equal(remote.weaponRunner.s3Stored, null, 'the remote proxy never applies the keep a second time');
  } finally { offFire(); f.close(); }
});
