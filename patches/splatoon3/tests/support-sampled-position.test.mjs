import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
const cfg = { id: 'support-teleport', mode: 'turf', map: 'reef' };
function session(myId, wire) {
  return { myId, hostId: 'B', isHost: myId === 'B', _members: new Set(['A', 'B']),
    tr: { broadcast(d) { wire.push(JSON.parse(JSON.stringify(d))); return true; }, sendTo() { return true; } } };
}
function world() {
  const { G, THREE } = f;
  G.projectiles.clear(); G.actors = []; G.netm = null; G.time = 0;
  G.scene ||= new THREE.Scene();
  G.level = new f.Level({ bounds: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 },
    spawnPads: [[-50, 0, 0], [50, 0, 0]], spawnBarrier: 0, half: [], single: [
      { kind: 'box', min: [-60, -.5, -60], max: [60, 0, 60] }] });
  G.physics = new f.Physics(G.level);
  const source = f.make('support'), proxy = f.make('support');
  for (const a of [source, proxy]) Object.assign(a, { nid: 7, owner: 'A', slot: 0 });
  const match = actors => ({ state: 'playing', mode: 'turf', time: 180, actors, playing: () => true });
  const sent = [], sender = new f.NetMatch(session('A', sent), cfg), receiver = new f.NetMatch(session('B', []), cfg);
  sender.bind(match([source])); receiver.bind(match([proxy]));
  return { source, proxy, sender, receiver, sent };
}

for (const hz of [30, 60, 120]) for (const life of [0, 2]) for (const kind of ['sensor', 'cooler']) {
  test(`${kind} replay follows the native sampled teleport before Actor presentation, life ${life}/${hz}Hz`, () => {
    const w = world(), { G } = f;
    try {
      G.match = w.sender.match; G.netm = w.sender; G.actors = [w.source];
      if (life) for (let i = 0; i < life; i++) w.source.spawnAt(new f.THREE.Vector3(40, 0, 0), 0);
      else { w.source.pos.set(40, 0, 0); w.source.netTp = (w.source.netTp || 0) + 1; }
      w.source.aimDir.set(0, -1, 0);
      if (kind === 'sensor') G.projectiles.throwBomb(w.source);
      else {
        w.source.special = w.source.specialCost(); w.source._startSpecial();
        w.source.intent.sub = true; w.source._updateSpecial(1 / hz);
        w.source.intent.sub = false;
        for (let i = 0; i < hz && w.source.specialActive; i++) w.source._updateSpecial(1 / hz);
        for (let i = 0; i < hz && !G.projectiles._s3SupportCoolers?.length; i++) {
          G.time += 1 / hz; G.projectiles.update(1 / hz);
        }
        assert.equal(G.projectiles._s3SupportCoolers.length, 1);
      }
      w.sender._sendTick(); const packet = w.sent.at(-1);
      assert.ok(packet.e.some(e => e[1] === 'ks' && e[2] === (kind === 'sensor' ? 'p' : 'c')),
        'real source action must author the native support event');
      G.match = w.receiver.match; G.netm = w.receiver; G.actors = [w.proxy];
      w.receiver.onMessage('A', packet);
      assert.equal(w.proxy.net.lastLife, life, 'native tick admission records the source life');
      const peer = w.receiver.peers.get('A'); peer.tr = packet.ts + .001; peer.sim = packet.u;
      w.receiver._sample(w.proxy, peer.tr, 1 / hz);
      assert.equal(w.proxy.net.ready, true); assert.equal(w.proxy.net.cur.x, 40);
      assert.equal(w.proxy.pos.x, 0, 'Match.applyRemote has not yet applied this sample');
      // NetMatch.update samples every peer, then plays its events. Match.update
      // applies remote positions afterwards; preserve this native ordering.
      w.receiver._playEvents();
      const records = kind === 'sensor' ? G.projectiles._s3SupportSensors : G.projectiles._s3SupportCoolers;
      assert.equal(records.filter(s => s.owner === w.proxy).length, 1, 'valid event near the sampled owner must survive');
      const tag = kind === 'sensor' ? 'p' : 'c';
      const next = packet.e.find(e => e[1] === 'ks' && e[2] === tag).slice(0, tag === 'p' ? 12 : 10);
      next[4] += 1;
      const sample = w.proxy.net.cur, sampleLife = sample.life, sampleX = sample.x;
      for (const invalid of ['unready', 'other-life', 'nonfinite']) {
        if (invalid === 'unready') w.proxy.net.ready = false;
        if (invalid === 'other-life') sample.life = life + 1;
        if (invalid === 'nonfinite') sample.x = NaN;
        w.receiver._play('A', next);
        assert.equal(records.filter(s => s.owner === w.proxy && s.seq === next[4]).length, 0,
          `${invalid} sample cannot authorize placement forty units from the rendered owner`);
        w.proxy.net.ready = true; sample.life = sampleLife; sample.x = sampleX;
      }
      w.receiver._play('A', next);
      assert.equal(records.filter(s => s.owner === w.proxy && s.seq === next[4]).length, 1,
        'rejected rows never consume the next legitimate support serial');
      w.receiver.applyRemote(w.proxy, 1 / hz); assert.equal(w.proxy.pos.x, 40);
      // The same-life sample does not grant a larger placement radius.
      const before = records.length, row = next.slice();
      row[4] += 1; row[5] += 11;
      w.receiver._play('A', row);
      assert.equal(records.length, before, 'distant forged placement remains outside the original ten-unit bound');
    } finally { w.receiver.dispose(); w.sender.dispose(); G.netm = null; }
  });
}
