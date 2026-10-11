import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { productionComposition as compose } from './weapon-edgecases-fixture.mjs';

const detach = '    p._s3SloshBirthOwner = p.fidelityImpactActor = p.s3DamageGroup = p.vol = null;';
const actorReferences = ['owner', '_s3SloshBirthOwner', 'fidelityImpactActor', 's3DamageGroup', 'vol'];
async function world(old = false) {
  const source = fs.readFileSync(new URL('../bootstrap.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/^import \{ (\w+) \} from '(.*?)';/gm)].filter(m => m[1] !== 'install');
  const extraExports = imports.map(m => `export { ${m[1]} } from './patches/splatoon3/${m[2]}';`).join('\n');
  const adapt = (rel, raw) => {
    const code = compose(rel, raw);
    if (old && rel === 'src/game/weapons.js') {
      assert.equal(code.split(detach).length, 2, 'counterfactual removes exactly this recycle cleanup');
      return code.replace(detach, '');
    }
    return code;
  };
  const f = await fixture({ fullRuntime: true, adapt, adaptRuntime: adapt, realProjectiles: true, extraExports });
  // installS3 alone is not the production bootstrap. Apply every additional
  // installer in the actual entry's order, including disconnect and quality.
  const calls = [...source.matchAll(/^  (install\w+)\(/gm)];
  assert.equal(calls.length, imports.length);
  for (const [, name] of calls) {
    assert.equal(typeof f[name], 'function', `${name} is exported from the real bootstrap import`);
    if (name === 'installQuality') f[name](f.profile);
    else f[name](f.installedRuntime, f.profile);
  }
  const level = new f.Level({ bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    spawnPads: [[-10, 0, 0], [10, 0, 0]], spawnBarrier: 0, half: [],
    single: [{ kind: 'box', min: [-50, -1, -50], max: [50, 0, 50] }] });
  f.G.level = level; f.G.physics = new f.Physics(level);
  f.G.camera = { position: new f.THREE.Vector3(0, 20, 0) };
  f.G.match.state = 'playing'; f.setRandom(() => .5);
  return f;
}
function slosh(f) {
  const shooter = f.make('slosher'), ps = f.G.projectiles;
  shooter.aimDir.set(0, 0, 1); ps.fireSlosh(shooter, shooter.weapon);
  assert.equal(ps.list.length, 9);
  return { shooter, ps, rounds: [...ps.list] };
}
function enemy(f) {
  const a = f.make('shooter'); a.team = 1; a.pos.set(0, 0, 1); a.character.root.position.copy(a.pos);
  return a;
}
function assertDetached(rounds) {
  for (const p of rounds) for (const name of actorReferences)
    assert.equal(p[name], null, `${name} no longer retains the previous shot's Actor graph`);
}
function finish(f, hz = 60) {
  const clock = new f.FixedClock(), trace = [];
  for (let render = 0; render < 3 * hz; render++) clock.advance(1 / hz, dt => {
    f.G.time += dt; f.G.projectiles.update(dt);
    trace.push([f.G.projectiles.list.length, f.G.projectiles.pool.length, ...f.G.actors.map(a => a.hp)]);
  });
  assert.equal(f.G.projectiles.list.length, 0);
  return trace;
}

test('#622 counterfactual pool retains birth owner, impact victim and shared damage ledger after complete bootstrap', async () => {
  const f = await world(true), { shooter, ps, rounds } = slosh(f), victim = enemy(f);
  finish(f); assert.equal(victim.hp, 30);
  assert(rounds.every(p => p.owner === null), 'existing #622 owner fix already runs');
  assert(rounds.every(p => p._s3SloshBirthOwner === shooter));
  assert(rounds.every(p => p.fidelityImpactActor === victim));
  assert(rounds.every(p => p.s3DamageGroup.has(victim)));
  ps.clear();
  assert(rounds.every(p => p._s3SloshBirthOwner === shooter && p.fidelityImpactActor === victim && p.s3DamageGroup.has(victim)),
    'later clear() does not revisit records already in the persistent pool');
});

test('#622 clear detaches pending Slosher birth owners before records wait or are reused', async () => {
  const f = await world(), { shooter, ps, rounds } = slosh(f);
  const vectors = rounds.map(p => [p.pos, p.prev, p.vel, p.start]);
  assert(rounds.every(p => p.owner === shooter && p._s3SloshBirthOwner === shooter));
  ps.clear(); assert.equal(ps.list.length, 0); assert.equal(ps.pool.length, rounds.length); assertDetached(rounds);
  const reused = ps._new(); assert.equal(reused, rounds.at(-1)); assert.equal(ps.pool.length, rounds.length - 1);
  for (const [i, p] of rounds.entries()) for (const [j, v] of [p.pos, p.prev, p.vel, p.start].entries())
    assert.equal(v, vectors[i][j], 'recycling retains the same reusable vector storage');
  assertDetached([reused]);
});

test('#622 normal completion detaches references without clearing active siblings\' shared ledgers', async () => {
  const f = await world(), { ps, rounds } = slosh(f), victim = enemy(f);
  const group = rounds[0].s3DamageGroup, vol = rounds[0].vol;
  ps.update(1 / 60);
  assert(ps.pool.length > 0 && ps.list.length > 0, 'first hit finishes while delayed siblings remain active');
  assert.equal(group.get(victim), 70); assert(vol.hits.includes(victim));
  assert(ps.list.every(p => p.s3DamageGroup === group && p.vol === vol));
  assertDetached(ps.pool);
  finish(f); assert.equal(victim.hp, 30, 'later siblings cannot spend the same volley maximum twice');
  assertDetached(rounds); ps.clear(); assertDetached(ps.pool);
});

test('#622 full native damage and completion traces remain identical at 30/60/120 Hz', async () => {
  let reference;
  for (const hz of [30, 60, 120]) {
    const before = await world(true); slosh(before); enemy(before);
    const after = await world(); const { rounds } = slosh(after); enemy(after);
    const oldTrace = finish(before, hz), nextTrace = finish(after, hz);
    assert.deepEqual(nextTrace, oldTrace); assertDetached(rounds);
    if (reference) assert.deepEqual(nextTrace, reference); else reference = nextTrace;
  }
});

test('#622 canceled delayed birth releases its owner on ordinary completion', async () => {
  const f = await world(), { shooter, ps, rounds } = slosh(f);
  shooter.alive = false; shooter.hp = 0;
  finish(f); assert.equal(ps.pool.length, 9); assertDetached(rounds);
});

test('#622 owner-timeline ghost completion uses the same detach boundary without damaging the target', async () => {
  const f = await world(), remote = f.make('slosher'), victim = enemy(f), ps = f.G.projectiles;
  remote.remote = true;
  ps.ghostProjectile(remote, [0, 0, 0, 'slosh', 'slosher', 0, 1.05, .3, 0, 0, 30,
    0, 2.4, 0, 1, .2, 0, 0, 0, 1, .2, .7, 1.5, .12, 15, .1, 0]);
  const p = ps.list[0];
  Object.assign(p, { _netPeer: { tr: 1, lastTs: 1, sim: 60 }, _netBorn: 0, _netBornTick: 0,
    _netSteps: 0, _netMaxSteps: 150 });
  ps.update(1 / 60);
  assert.equal(ps.list.length, 0); assert(ps.pool.includes(p)); assert.equal(victim.hp, 100);
  assertDetached([p]);
});
