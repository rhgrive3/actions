import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoadedActorFixture } from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';

test('local/remote swim and wall bodies hide immediately for source and fallback; jumps and returns draw again', async () => {
  const f = await sourceLoadedActorFixture({ random: () => .4 });
  try {
    const a = await f.make(), c = a.character;
    for (const sourced of [true, false]) {
      c.sourceMotion.setEnabled(sourced);
      for (const hz of [30, 60, 120]) for (const lod of ['hero', 'game', 'far']) for (const local of [true, false]) {
        c.setLod(lod); c.isLocal = local;
        const step = (form, grounded) => {
          a.form = form === 'kid' ? 'kid' : 'squid';
          a.climbing = form === 'climb'; a.submerged = form === 'swim'; a.grounded = grounded;
          a.anim.wallNormal = new f.THREE.Vector3(0, 0, 1);
          f.G.time += 1 / hz; a._finishFrame(1 / hz);
        };
        for (let i = 0; i < hz; i++) step('squid', true);
        assert(c.squid.body.visible, 'dry squid drawn');
        for (const form of ['swim', 'climb']) {
          step(form, form === 'swim');
          assert.equal(c.squid.body.visible, false, 'hidden on first submerged tick: ' + form);
          assert.equal(c.squid.ghost.visible, false);
          for (let i = 0; i < hz / 4; i++) step(form, form === 'swim');
          assert.equal(c.squid.body.visible, false);
        }
        step('squid', false);
        assert(c.squid.body.visible, 'wall exit/airborne squid reappears immediately');
        step('swim', true); step('swim', false);
        assert(c.squid.body.visible, 'dolphin jump reappears');
        for (let i = 0; i < hz; i++) step('kid', true);
        assert(c.kid.visible, 'human return drawn');
      }
    }
  } finally { f.reset(); }
});

test('wake cadence retains elapsed time at 30/60/120 Hz and respects stealth, air and restart', async () => {
  const f = await sourceLoadedActorFixture({ random: () => .4 });
  try {
    const a = await f.make(); let count = 0;
    f.G.fx = { wake() { count++; } };
    a.form = 'squid'; a.submerged = true; a.grounded = true; a.vel.set(0, 0, 8);
    for (const hz of [30, 60, 120]) {
      count = 0; a._wakeT = 0;
      for (let i = 0; i < hz * 2; i++) { f.G.time += 1 / hz; a._finishFrame(1 / hz); }
      assert.equal(count, 120, '60 film activation samples/sec at ' + hz + ' Hz');
    }
    const quiet = () => { const n = count; a._finishFrame(.1); assert.equal(count, n); assert.equal(a._wakeT, 0); };
    a.vel.set(0, 0, 1); quiet(); // Slow swim.
    a.vel.set(0, 0, 8); a.s3.modifiers.ninjaSquid = true;
    a.s3.swimStealth.since = f.G.time - 2; quiet();
    a.s3.modifiers.ninjaSquid = false; a.grounded = false; quiet();
    a.grounded = true; const n = count; a._finishFrame(1 / 120);
    assert.equal(count, n); a._finishFrame(1 / 120); assert.equal(count, n + 1);
  } finally { f.reset(); }
});

test('ordinary swim uses connected animated film, emits no beads, and respects lifecycle and stealth', async () => {
  const f = await sourceLoadedActorFixture({ random: () => .4, extraExports: "export { FX } from './src/fx/fx.js';" });
  const fx = new f.FX(f.G.scene, { quality: 'high' });
  try {
    const a=await f.make();f.G.fx=fx;a.form='squid';a.submerged=true;a.grounded=true;a.vel.set(0,0,11.8);
    const dir=new f.THREE.Vector3(0,0,1),cam=new f.THREE.PerspectiveCamera();cam.updateMatrixWorld();
    for(let n=0;n<20;n++){a._finishFrame(1/60);fx.update(1/60,cam);}
    assert.equal(fx.dN,0,'no continuous swimming droplet pool');assert.equal(fx.glows.n,0,'no swimming bubble glows');
    const slot=fx.swimSurface.slots.find(s=>s.actor===a),mesh=slot.mesh;
    assert(mesh.visible);assert(mesh.geometry.index.count>3000,'continuous indexed surface, not billboards');
    const coords=mesh.geometry.attributes.position.array,before=coords.slice();
    assert(Math.max(...coords.filter((_v,i)=>i%3===1))>.1,'actual lifted liquid crests');
    assert(Math.min(...coords.filter((_v,i)=>i%3===1))<.01,'film roots stay in the ink');
    a._finishFrame(1/60);fx.update(1/60,cam);
    assert.notDeepEqual(Array.from(coords),Array.from(before),'membrane changes shape, not just a moving decal');
    assert([...coords,...mesh.geometry.attributes.normal.array].every(Number.isFinite));
    a.s3.modifiers.ninjaSquid=true;a.s3.swimStealth.since=f.G.time-2;
    fx.update(1/60,cam);assert.equal(mesh.visible,false,'stealth hides lifted film immediately');
    a.s3.modifiers.ninjaSquid=false;a._finishFrame(1/60);fx.update(1/60,cam);assert(mesh.visible);
    a.grounded=false;fx.update(1/60,cam);assert.equal(mesh.visible,false,'no floating surface on jump');
    a.grounded=true;a._finishFrame(1/60);fx.update(1/60,cam);
    a.groundN.set(0,1,1).normalize();a._finishFrame(1/60);fx.update(1/60,cam);
    const up=new f.THREE.Vector3(0,1,0).applyQuaternion(mesh.quaternion);
    assert(up.distanceTo(a.groundN)<1e-6,'film lies on the supporting slope');a.groundN.set(0,1,0);
    const remotes=Array.from({length:8},(_v,i)=>({pos:new f.THREE.Vector3(i*.5,0,0),vel:a.vel.clone(),groundN:a.groundN.clone(),form:'squid',submerged:true,grounded:true,climbing:false,alive:true,color:a.color,s3:a.s3,isLocal:false}));
    f.G.actors=[a,...remotes];for(const r of remotes)fx.wake(r.pos,dir,r.color,11.8,r.groundN,r);
    fx.update(1/60,cam);assert.equal(fx.swimSurface.slots.length,4,'bounded shared pool');
    f.G.actors=[a];fx.update(1/60,cam);assert(fx.swimSurface.slots.every(s=>!s.actor||s.actor===a),'removed actors released');
    fx.clear();assert.equal(mesh.visible,false);assert(fx.swimSurface.slots.every(s=>!s.actor));
    // Legacy warmup/carve calls must not bring the particle implementation back.
    fx.wake(a.pos,dir,a.color,11.8);fx.swimCarve(a.pos,dir,dir,a.color,1);assert.equal(fx.dN,0);
    fx._spawnDrop(0,1,0,0,0,0,a.color,.02,1,1,1,0);fx._updateDrops(1/60);
    assert.equal(fx.dGeo.attributes.aColA.array[3],1,'attack droplets retain native shading');
    let disposed=0;mesh.geometry.addEventListener('dispose',()=>disposed++);
    fx.dispose();assert.equal(disposed,1);assert.equal(fx.swimSurface,null);
  } finally { if(fx.swimSurface)fx.dispose();f.reset(); }
});
