import test from 'node:test';
import assert from 'node:assert/strict';
import { specialEvidenceFixture } from './special-evidence-fixture.mjs';
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function makeCloud(f, actor, { team = actor.team, t = 1, dur = 8 } = {}) {
  const group = new f.THREE.Group(); group.position.set(0, 5, 0);
  const c = { owner: actor, team, group, t, dur, dir: new f.THREE.Vector3(), rainT: 1 };
  f.G.projectiles.clouds.push(c); return c;
}
function damaged(f) {
  const actor = f.make('shooter'); actor.hp = 10; actor.lastDamage = 0;
  actor._resolve = () => { actor.grounded = true; }; return actor;
}
async function scenario({ cloud = false, squid = false } = {}) {
  const f = await specialEvidenceFixture(), a = damaged(f);
  if (squid) { f.G.paint.sample = () => 1; a.intent.squid = true; }
  if (cloud) makeCloud(f, a);
  return { f, a };
}
test('#927 complete bootstrap: friendly rain preserves the verified 60F recovery delay', async () => {
  const { f, a } = await scenario({ cloud: true });
  for (let tick = 1; tick < 60; tick++) { f.tick(a); close(a.hp, 10); }
  f.tick(a); assert.ok(a.hp > 10, 'recovery begins at 60F, never before');
});
test('#927 complete bootstrap: friendly rain humanoid recovery equals ordinary submerged recovery', async () => {
  const humanRain = await scenario({ cloud: true }), swim = await scenario({ squid: true }), swimRain = await scenario({ cloud: true, squid: true }), human = await scenario();
  for (const { f, a } of [humanRain, swim, swimRain, human]) { a.lastDamage = 2; f.tick(a, 30); }
  assert.equal(swim.a.submerged, true); assert.equal(humanRain.a.submerged, false);
  close(humanRain.a.hp, swim.a.hp); close(swimRain.a.hp, swim.a.hp);
  assert.ok(humanRain.a.hp > human.a.hp, 'unsubmerged recovery is accelerated');
});
test('#927 complete bootstrap: allied overlap is not additive; exit, enemy rain and renewed damage stop acceleration', async () => {
  const { f, a } = await scenario({ cloud: true }); a.lastDamage = 2;
  makeCloud(f, a); const hp = a.hp; f.tick(a); const oneTick = a.hp - hp;
  f.G.projectiles.clouds.pop(); const before = a.hp; f.tick(a); close(a.hp - before, oneTick);
  a.pos.x = 20; const out = a.hp; f.tick(a); assert.ok(a.hp - out < oneTick);
  a.pos.x = 0; f.G.projectiles.clouds[0].team = 1; const enemy = a.hp; f.tick(a); close(a.hp, enemy);
  f.G.projectiles.clouds[0].team = 0; a.damage(1, null, 'shooter'); const hurt = a.hp;
  f.tick(a, 59); close(a.hp, hurt); f.tick(a); assert.ok(a.hp > hurt);
  const cloud = f.G.projectiles.clouds[0]; cloud.t = cloud.dur;
  const expired = a.hp; f.tick(a); assert.ok(a.hp - expired < oneTick);
});
for (const hz of [30, 60, 120]) test(`#927 ${hz}Hz fixed-step source law trace remains equal`, async () => {
  const { f, a } = await scenario({ cloud: true });
  let acc = 0, ticks = 0;
  for (let frame = 0; frame < hz * 1.5; frame++) {
    acc += 1 / hz; while (acc + 1e-10 >= 1 / 60) { acc -= 1 / 60; f.tick(a); ticks++; }
  }
  assert.equal(ticks, 90); close(a.hp, 10 + 31 * f.profile.resources.regenRateSwim / 60);
});
