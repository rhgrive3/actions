import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { WEAPON_AUDIO } from '../runtime/audio/weapon-recipes.mjs';
import { VARIANT_BASE_WEAPON } from '../runtime/alternate-weapon-kits-data.mjs';
import { usesChargerRise } from '../runtime/audio/charger-charge-rise.mjs';

const chargerBases = Object.values(WEAPON_AUDIO).filter(r => r.family === 'charger').map(r => r.id);
const chargerIds = [...chargerBases, ...Object.keys(VARIANT_BASE_WEAPON).filter(id => chargerBases.includes(VARIANT_BASE_WEAPON[id]))];

async function scene() {
  let milliseconds = 1000;
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
    vmPerformance: { now: () => milliseconds },
    extraExports: "export {installWeaponAudioRuntime} from './patches/splatoon3/runtime/audio/runtime.mjs';" });
  const calls = [], rises = [], loops = [], prewarms = [];
  f.G.physics.segment = (_a, _b, h) => { h.hit = false; return h; };
  f.G.audio = {
    ctx: {}, prepareWeapon() {}, prewarmChargerChargeRise(id, chargeTime) { prewarms.push({id, chargeTime}); }, duck() {}, play() {},
    playWeapon(id, event, options) { calls.push({ id, event, options }); },
    playChargerChargeRise(options) {
      const handle = { options, playing: true, stops: 0, stop() { this.playing = false; this.stops++; } };
      rises.push(handle); return handle;
    },
    loopWeapon(id, event, options) {
      const handle = { id, event, options, playing: true, set() {}, stop() { this.playing = false; } };
      loops.push(handle); return handle;
    },
  };
  f.installWeaponAudioRuntime(f.installedRuntime);
  let serial = 0;
  function pair(id) {
    calls.length = rises.length = loops.length = prewarms.length = 0;
    const owner = f.make(id), remote = f.make(id), nid = ++serial;
    owner.owner = remote.owner = 'sender';
    owner.nid = remote.nid = nid;
    owner.isLocal = true; remote.isLocal = false;
    owner.form = remote.form = 'kid';
    owner.pos.set(4, 0, -3); remote.pos.copy(owner.pos);
    let near = true, packet = null, removed = 0;
    remote._nearCamera = () => near;
    const tx = new f.NetMatch({ myId: 'sender', isHost: false, hostId: 'host',
      tr: { broadcast(value) { packet = value; } } }, {});
    const rx = new f.NetMatch({ myId: 'receiver', isHost: false, hostId: 'host' }, {});
    tx.byNid.set(nid, owner); rx.byNid.set(nid, remote);
    tx._setupActor(owner); rx._setupActor(remote);
    rx.match = { removeActor(actor) { assert.equal(actor, remote); removed++; } };
    function publish(charging, charge = 0, form = 'kid') {
      owner.weaponRunner.charging = charging;
      owner.weaponRunner.charge = charge;
      owner.form = form;
      milliseconds += 50; f.G.time = milliseconds / 1000;
      tx._sendTick();
      assert.ok(packet?.a?.length === 1, id + ' actual owner snapshot');
      const before = remote.net.buf.at(-1)?.t;
      rx._tick('sender', packet);
      assert.notEqual(remote.net.buf.at(-1)?.t, before, id + ' actual snapshot accepted');
      rx._peer('sender').tr = packet.ts;
      rx._sample(remote, packet.ts, 1 / 60);
      rx.applyRemote(remote, 1 / 60);
      assert.equal(remote.weaponRunner.charging, charging, id + ' decoded charge state');
      assert.equal(remote.form, form, id + ' decoded form');
      return packet;
    }
    function voices(hz, frames = hz) { for (let i = 0; i < frames; i++) rx._voices(1 / hz); }
    function onsets() { return rises.length + calls.filter(c => c.event === 'charge').length; }
    function clear() { tx.dispose(); rx.dispose(); f.G.actors.length = 0; f.G.projectiles.clear(); }
    return { owner, remote, tx, rx, publish, voices, onsets, clear,
      setNear(value) { near = value; }, removed: () => removed };
  }
  return { ...f, pair, calls, rises, loops, prewarms };
}

test('all native and catalogue Charger kits emit one remote onset per decoded charge edge at 30/60/120Hz', async () => {
  const f = await scene();
  assert.equal(chargerIds.length, 18);
  for (const id of chargerIds) for (const hz of [30, 60, 120]) {
    const p = f.pair(id); assert.equal(usesChargerRise(id),true);
    p.publish(false); p.voices(hz);
    assert.equal(p.onsets(), 0, id + ' idle is silent');
    for (let cycle = 1; cycle <= 3; cycle++) {
      p.publish(true, .2); p.voices(hz);
      assert.equal(p.onsets(), cycle, id + ' exactly one onset on cycle ' + cycle);
      p.publish(true, 1); p.voices(hz);
      assert.equal(p.onsets(), cycle, id + ' full hold does not restart onset');
      assert.equal(f.calls.filter(c => c.event === 'ready').length, 0, 'full-ready remains owner-only');
      assert.equal(f.loops.filter(c => c.event === 'charge').length, 0, 'onset is never a loop');
      const onset=f.rises.at(-1);
      assert.equal(onset.options.weaponId,id);
      assert.equal(onset.options.chargeTime,p.remote.weapon.chargeTime);
      assert.equal(onset.options.pos,p.remote.pos);
      assert.equal(f.calls.filter(c=>c.event==='charge').length,0,'remote uses no individual HoldNoise');
      p.publish(false); p.voices(hz);
      assert.ok(f.rises.every(h => !h.playing), id + ' release stops phrase');
      assert.equal(p.remote.net._chargerOnsetActive, false, id + ' release re-arms edge');
      assert.equal(p.remote.weapon.id, id, 'network gameplay/kit identity is unchanged');
    }
    p.clear();
  }
});

test('remote Charger cancellation, inaudibility, removal and disposal clear presentation without phantom starts', async () => {
  const f = await scene();
  for (const id of chargerIds) {
    const p = f.pair(id);
    p.publish(true, .3); p.voices(60, 2);
    assert.equal(p.onsets(), 1, id + ' initial onset');
    p.publish(false, 0, 'squid'); p.voices(60, 6);
    assert.equal(p.onsets(), 1, id + ' decoded cancellation adds no onset');
    assert.equal(p.remote.net._chargerOnsetActive, false);
    assert.ok(f.rises.every(h => !h.playing), id + ' cancellation stops phrase');
    p.publish(false); p.voices(60, 6);
    assert.equal(p.onsets(), 1, id + ' idle emergence stays silent');
    p.setNear(false); p.publish(true, .4); p.voices(60, 6);
    assert.equal(p.onsets(), 1, id + ' initially inaudible hold is silent');
    p.setNear(true); p.voices(60, 6);
    assert.equal(p.onsets(), 1, id + ' entering range is not a new charge edge');
    p.publish(false); p.voices(60, 2);

    p.publish(true, .4); p.voices(60, 2);
    assert.equal(p.onsets(), 2, id + ' new hold after cancellation');
    p.setNear(false); p.voices(60, 2);
    assert.ok(f.rises.every(h => !h.playing), id + ' out-of-range stops phrase');
    p.setNear(true); p.voices(60, 6);
    assert.equal(p.onsets(), 2, 'returning in range cannot replay the same onset');
    p.publish(false); p.voices(60, 2);
    p.publish(true, .4); p.voices(60, 2);
    assert.equal(p.onsets(), 3);
    p.remote.alive = false; p.voices(60, 2);
    assert.ok(f.rises.every(h => !h.playing), id + ' death stops phrase');
    p.remote.alive = true;
    p.publish(false); p.voices(60, 2);
    p.publish(true, .4); p.voices(60, 2);
    assert.equal(p.onsets(), 4);
    p.rx._remove(p.remote); p.voices(60, 6);
    assert.equal(p.removed(), 1);
    assert.equal(p.rx.byNid.has(p.remote.nid), false);
    assert.equal(p.remote.net._chargerOnsetActive, false);
    assert.ok(f.rises.every(h => !h.playing), id + ' real removal stops phrase');
    assert.equal(p.onsets(), 4, id + ' removed actor cannot restart');

    p.rx.byNid.set(p.remote.nid, p.remote);
    p.publish(false); p.voices(60, 2);
    p.publish(true, .4); p.voices(60, 2);
    assert.equal(p.onsets(), 5, id + ' reset/removal state can begin a new hold');
    p.rx.dispose();
    assert.equal(p.remote.net._chargerOnsetActive, false);
    assert.ok(f.rises.every(h => !h.playing), id + ' real dispose stops phrase');
    p.tx.dispose(); f.G.actors.length = 0; f.G.projectiles.clear();
  }
});

test('remote non-Chargers never enter the Charger onset path and native continuous loops are preserved', async () => {
  const f = await scene();
  for (const r of Object.values(WEAPON_AUDIO).filter(r => r.family !== 'charger')) {
    const p = f.pair(r.id);
    p.publish(true, .5); p.voices(60, 12);
    assert.equal(p.onsets(), 0, r.id + ' charging flag alone cannot identify a Charger');
    assert.equal(f.calls.filter(c => c.event === 'ready').length, 0);
    if (p.remote.weapon.kind === 'splatling')
      assert.equal(f.loops.filter(c => c.event === 'charge').length, 1, 'native Spinner uses recorded Motor while charging');
    p.publish(false); p.voices(60, 2);
    p.remote.weaponRunner.rolling = true; p.remote.grounded = true;
    p.voices(60, 2);
    assert.equal(f.loops.filter(c => c.event === 'roll').length, 1, 'existing rolling predicate preserved');
    p.remote.weaponRunner.rolling = false; p.voices(60, 2);
    assert.ok(f.loops.every(h => !h.playing));
    p.clear();
  }
});



test('remote roster warms Charger audio before its first observed charge edge', async () => {
  const f = await scene();
  for (const id of ['charger','s3-charger-long','s3-charger-pencil']) {
    const p=f.pair(id);
    assert.deepEqual(f.prewarms.map(x=>x.id), [id], id + ' remote setup starts loading');
    assert.equal(f.prewarms[0].chargeTime,p.remote.weapon.chargeTime);
    assert.equal(f.rises.length,0,'setup is silent');
    p.publish(true,.1);p.voices(60,2);
    assert.equal(f.rises.length,1,'first charge edge plays');
    p.clear();
  }
  const p=f.pair('shooter');
  assert.equal(f.prewarms.length,0,'non-Charger roster does not load the phrase');
  p.clear();
});

test('replicated special event stops the remote phrase without replaying a stale charge edge', async () => {
  const f=await scene();
  for(const id of ['charger','s3-charger-long']) for(const hz of [30,60,120]) {
    const p=f.pair(id);p.publish(true,.3);p.voices(hz,1);
    const rise=f.rises.at(-1);assert.ok(rise?.playing);
    p.rx._playEvent('special:use',{actor:{n:p.remote.nid},id:p.remote.weapon.special});
    assert.equal(rise.playing,false,id+' replicated activation stops phrase');
    assert.equal(rise.stops,1);
    p.voices(hz,3);
    assert.equal(f.rises.length,1,id+' old charging snapshot cannot replay phrase');
    p.publish(false);p.voices(hz,1);p.publish(true,.2);p.voices(hz,1);
    assert.equal(f.rises.length,2,id+' later real charge edge re-arms');
    p.clear();
  }
});
