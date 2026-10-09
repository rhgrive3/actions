import test from 'node:test';
import assert from 'node:assert/strict';
import { batchFixture } from './batch03-fixture.mjs';

const close = (a,b,e=1e-9) => assert.ok(Math.abs(a-b) <= e, `${a} != ${b}`);

test('#978 release emits one source-driven paint-only NearestParam stamp independent of projectile trail/impact', async () => {
  const f = await batchFixture();
  const a = f.make('slosher');
  a.grounded = true; a.alive = true; a.remote = false;
  a.pos.set(3,0,4); a.aimDir.set(1,.4,2).normalize();
  const before = f.G.projectiles.list.length;
  f.G.projectiles.fireSlosh(a,a.weapon);
  assert.equal(f.G.projectiles.list.length-before,9,'4+5 projectile volley stays intact');
  assert.equal(f.paint.length,1,'release produces exactly one independent foot-paint stamp');
  const [stamp]=f.paint;
  close(stamp.radius,1.56);
  close(stamp.opts.stretchAmt,.2);
  assert.equal(stamp.opts.kind,'drop');
  close(stamp.point.x,3); close(stamp.point.z,4);
  assert.equal(a.hp,100,'nearest paint cannot damage the shooter');
});

test('#978 does not paint for airborne, remote, dead, or ungrounded release', async () => {
  for (const patch of [{grounded:false},{remote:true},{alive:false}]) {
    const f=await batchFixture(),a=f.make('slosher');
    Object.assign(a,{grounded:true,remote:false,alive:true},patch);
    f.G.projectiles.fireSlosh(a,a.weapon);
    assert.equal(f.paint.length,0,JSON.stringify(patch));
  }
});
