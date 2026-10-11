import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';
import { installDeathBlast } from '../../splatoon3/runtime/death-blast.mjs';

// The victim's owner paints the SplPlayer DieBlastParam death blast (runtime/death-blast.mjs) through
// the real composed Actor.splat, real PaintSystem and real NetMatch row path. Every observer must
// admit every row (#522 ceiling / foreign-team signature) and end with the sender's CPU turf.

function paintLevel(THREE, size, origin) {
  const face = {
    paintable: true, su: size, sv: size, turf: true, wall: false, block: null,
    origin: new THREE.Vector3(origin, 0, origin),
    u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1), n: new THREE.Vector3(0, 1, 0),
  };
  const block = {
    aabbMin: new THREE.Vector3(origin, -0.1, origin), aabbMax: new THREE.Vector3(origin + size, 0.1, origin + size),
    faces: [0, -1, -1, -1, -1, -1],
  };
  face.block = block;
  return { faces: [face], blocks: [block], pointInside: () => false, queryBlocks: () => [0] };
}

function paintRenderer(THREE) {
  let target = null, clear = new THREE.Color(), alpha = 1;
  return {
    capabilities: { getMaxAnisotropy: () => 1 },
    getRenderTarget: () => target, setRenderTarget: value => { target = value; },
    getClearColor: out => out.copy(clear), getClearAlpha: () => alpha,
    setClearColor: (value, opacity) => { if (value?.isColor) clear.copy(value); alpha = opacity; },
    clear() {}, render() {},
  };
}

async function client(id) {
  const f = await fixture();
  installDeathBlast(f, f.profile);
  const session = f.makeSession(id, 'a', [['a', 'A'], ['b', 'B'], ['c', 'C']]);
  const nm = f.makeNetMatch(session, { id: 'death-blast' });
  class Display {
    constructor() { this.root = new f.THREE.Group(); }
    trigger() {} setVisible(value) { this.root.visible = value; } setHurt() {} setWeapon() {}
  }
  const make = (nid, owner, team) => {
    const a = new f.Actor({ team, name: owner, weapon: 'shooter', CharacterClass: Display });
    a.nid = nid; a.owner = owner; a.remote = owner !== id; a.isLocal = false;
    a.pos.set(0, 0, 0); a.alive = true; a.invuln = 0;
    return a;
  };
  // b owns the team-1 victim; c owns the team-0 attacker.
  const victim = make(2, 'b', 1), attacker = make(3, 'c', 0);
  f.G.actors = [victim, attacker];
  f.G.match = f.bind(nm, [victim, attacker]);
  f.G.time = 12;
  f.G.paint = new f.PaintSystem(paintRenderer(f.THREE), paintLevel(f.THREE, 40, -20), { atlasSize: 1024, maxDensity: 30, cell: 0.25 });
  return { f, nm, victim, attacker, paint: f.G.paint };
}

function received(event) {
  const copy = JSON.parse(JSON.stringify(event));
  copy._netTick = event._netTick;
  copy._netSeq = event._netSeq;
  return copy;
}

test('death blast rows from the victim owner are admitted and reproduce the sender CPU turf', async () => {
  const sender = await client('b'), observer = await client('c');
  sender.victim.pos.set(1.5, 0, -2);
  const random = Math.random;
  let draw = 0;
  Math.random = () => (0.137 + draw++ * 0.618034) % 1;
  try { sender.victim.splat(sender.attacker, 'shooter'); } finally { Math.random = random; }
  const rows = sender.nm.out.filter(e => e[1] === 's');
  const spec = sender.f.profile.deathBlast;
  assert.equal(rows.length, 1 + spec.splashAroundCount, 'one row per death-blast paint call');
  assert.deepEqual(Array.from(rows, r => r[5]), [spec.paintRadius, ...Array(spec.splashAroundCount).fill(spec.splashAroundPaintRadius)]);
  assert.ok(rows.every(r => r[6] === sender.attacker.team), 'every row is in the attacker colour');
  assert.ok(sender.paint.grid.some(v => v !== 0), 'the sender actually painted');
  for (const row of rows) {
    observer.nm._peer('b');
    observer.nm._play('b', received(row));
  }
  assert.equal(observer.nm._peer('b')._lastEventSeq, rows.at(-1)._netSeq, 'every row is admitted in sender order');
  assert.deepEqual(Array.from(observer.paint.grid), Array.from(sender.paint.grid), 'CPU coverage matches the sender');
  assert.deepEqual(Array.from(observer.paint.counts), Array.from(sender.paint.counts), 'turf counts match the sender');
});

test('measured CPU footprint: source death blast versus the replaced radius-1.7 burst (logic measurement)', async () => {
  const { f } = await client('b');
  const fresh = () => { f.G.netm = null; return new f.PaintSystem(paintRenderer(f.THREE), paintLevel(f.THREE, 40, -20), { atlasSize: 1024, maxDensity: 30, cell: 0.25 }); };
  const cells = paint => paint.grid.reduce((n, v) => n + (v !== 0), 0);
  const native = fresh();
  native.splat(new f.THREE.Vector3(0, 0.35, 0), 1.7, 0, { seed: 0.31 });
  const blast = fresh();
  for (const p of (await import('../../splatoon3/runtime/death-blast.mjs')).deathBlastPlan({ x: 0, y: 0, z: 0 }, 0.31, f.profile.deathBlast))
    blast.splat(new f.THREE.Vector3(p.x, p.y, p.z), p.radius, 0, { seed: p.seed });
  const before = cells(native), after = cells(blast);
  assert.ok(before > 0 && after > 0);
  // A radius-5 footprint must cover several times the radius-1.7 one on the same flat floor.
  assert.ok(after / before > 4, `death-blast/native CPU cells ${after}/${before}`);
});

test('a radius-5 row is admitted above the ceiling only at a sender-owned actor of another team', async () => {
  const sender = await client('b'), observer = await client('c');
  sender.victim.pos.set(1.5, 0, -2);
  sender.victim.splat(sender.attacker, 'shooter');
  const main = sender.nm.out.find(e => e[1] === 's' && e[5] === sender.f.profile.deathBlast.paintRadius);
  const play = row => { observer.nm._peer('b'); observer.nm._play('b', received(row)); return observer.nm._peer('b')._lastEventSeq === row._netSeq; };
  const far = received(main); far._netSeq = main._netSeq; far._netTick = main._netTick;
  far[2] += 12;                                   // 12+ units from the victim the sender owns
  assert.equal(play(far), false, 'far from any sender-owned victim: rejected');
  const own = received(main); own._netSeq = main._netSeq + 1; own._netTick = main._netTick;
  own[6] = sender.victim.team;                    // the victim's own colour: not a death blast
  assert.equal(play(own), false, 'own-team radius-5 row stays under the ceiling');
  const ok = received(main); ok._netSeq = main._netSeq + 2; ok._netTick = main._netTick;
  assert.equal(play(ok), true, 'the attacker-colour row at the victim is admitted');
});
