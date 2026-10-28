import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

// Pinned 11.3.0 UnitGroupParam.Unit[0], selected by Combination.OrderNum 0 /
// SplashArrayOrderNum 0. Values are independent of the runtime's fallback.
const cases = [
  {id:'s3-slosher-launcher', actor:'WeaponSlosherLauncher', rates:[.1,.35], spacing:3.6, first:[.36,.81,1.26], count:4, draw:.2, width:1.559, depth:2.2, frame:1},
  {id:'s3-slosher-bathtub', actor:'WeaponSlosherBathtub', rates:[1,1], spacing:3, first:[3,3,3], count:5, draw:.2, width:1.645, depth:1.84, frame:6},
  {id:'s3-slosher-washtub', actor:'WeaponSlosherWashtub', rates:[.5,.55], spacing:3.1, first:[1.55,1.6275,1.705], count:7, draw:.1, width:1.344, depth:2, frame:2},
];
const near = (actual, expected, message) => assert.ok(Math.abs(actual-expected)<1e-8, `${message}: ${actual} versus ${expected}`);
async function shot(c, seed=.5) {
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmMathRandom:()=>seed,
    extraExports:"export {releaseCatalogBirth} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
  const {G}=f, a=f.make(c.id);
  G.physics.level=null;
  G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  G.physics.raycast=(_a,_b,_d,h)=>{h.hit=false;return h;};
  a.form='kid';a.pos.set(0,20,0);a.character.root.position.copy(a.pos);
  a.aimDir.set(0,0,1);a.aimPoint.set(0,21.05,60);a.vel.set(0,0,0);
  a.intent.fire=true;
  for(let i=0;!G.projectiles.list.length&&i<120;i++)f.tick(a);
  a.intent.fire=false;
  const p=G.projectiles.list.find(p=>p.catalog?.descriptor.unit===0&&p.catalog.index===0);
  assert.ok(p,'real runner emits the source splash owner');
  assert.equal(f.releaseCatalogBirth(G.projectiles,p,G),true);
  return {f,p};
}

for(const c of cases) {
  test(c.actor+' uses source first-rate endpoints and midpoint without a new random draw',async()=>{
    for(const [i,seed] of [0,.5,1].entries()) {
      const {f,p}=await shot(c,seed),d=p.catalog.descriptor;
      const group=d.packet.SplashAndSplashWallHitSpawnPrm,spawn=group.SplashParam[0].SpawnParam;
      assert.deepEqual(JSON.parse(JSON.stringify(group.Combination)),[{OrderNum:0,SplashArrayOrderNum:0,SplashWallHitArrayOrderNum:c.actor==='WeaponSlosherBathtub'?-1:0,TotalNum:c.count}]);
      assert.equal(spawn.FirstSplashRateForLengthMin,c.rates[0]);
      assert.equal(spawn.FirstSplashRateForLengthMax,c.rates[1]);
      assert.equal(spawn.SpawnBetweenLength,c.spacing);
      assert.equal(Object.hasOwn(spawn,'SpawnNearestLength'),false,'Shooter nearest-distance field is absent');
      near(p.seed,seed,'existing projectile seed');
      near(p.catalog.nextSplash,c.first[i],'initial source distance');
      assert.equal(d.splashCount,c.count);assert.equal(d.splashSpacing,c.spacing);
      assert.equal(d.sloshFall.drawRadius,c.draw);assert.equal(d.splashRadius,c.width);
      assert.equal(d.sloshFall.spec.depthScaleMax,c.depth);
      let randomCalls=0;f.setRandom(()=>{randomCalls++;return .25;});
      f.G.projectiles._step(p,1/60);
      assert.equal(randomCalls,0,'flight scheduling reuses the admitted seed');
    }
  });

  test(c.actor+' first release keeps native age, interpolated distance and positive drawing at 30/60/120 Hz',async()=>{
    let oracle;
    for(const hz of [30,60,120]) {
      const {f,p}=await shot(c),system=f.G.projectiles,trace=[],clock=new f.FixedClock();
      for(let i=0;i<hz/2&&!trace.length;i++)clock.advance(1/hz,()=>{
        if(trace.length)return;
        const before=p.catalog.travel,from=p.pos.clone(),age=p.age;
        assert.equal(system._step(p,1/60),false);
        const drops=system._s3SplashDrops||[];
        if(!drops.length){assert.ok(p.catalog.travel<c.first[1]+1e-8);return;}
        const d=drops[0];
        const stepLength=p.prev.distanceTo(p.pos),prior=p.catalog.travel-stepLength;
        assert.ok(prior<c.first[1]&&p.catalog.travel+1e-8>=c.first[1]);
        const t=(c.first[1]-prior)/stepLength,release=p.prev.clone().lerp(p.pos,t);
        near(d.releaseX,release.x,'release X');near(d.spawnY,release.y,'release Y');near(d.releaseZ,release.z,'release Z');
        near(p.age,c.frame/60,'source flight age at release');
        assert.ok(p.catalog.travel>before&&p.age>age&&p.pos.distanceTo(from)>0);
        assert.equal(d.drawRadius,c.draw);assert.equal(d.sourceActor,c.actor);
        assert.equal(d.radius,c.width);assert.equal(d.spec.depthScaleMax,c.depth);
        system._s3SplashDrops=[];system._draw();const without=system.blobs.count;
        system._s3SplashDrops=drops;system._draw();
        assert.equal(system.blobs.count,without+drops.length,'each positive-radius falling splash retains its airborne instance');
        trace.push([p.age,d.releaseX,d.spawnY,d.releaseZ,d.drawRadius,d.radius,d.spec.depthScaleMax]);
      });
      assert.equal(trace.length,1,'first source slot released');
      if(oracle)assert.deepEqual(trace,oracle);else oracle=trace;
    }
  });

  test(c.actor+' source first distance respects lifetime and head-contact boundaries',async()=>{
    const original=await shot(c),main=original.p;
    while(!(original.f.G.projectiles._s3SplashDrops||[]).length)
      assert.equal(original.f.G.projectiles._step(main,1/60),false);
    const crossingAge=main.age,stepLength=main.prev.distanceTo(main.pos),before=main.catalog.travel-stepLength;
    const fraction=(c.first[1]-before)/stepLength;
    for(const relation of [-1,0,1]) {
      const {f,p}=await shot(c),system=f.G.projectiles;
      // A short lifetime clips only the terminal admitted segment. The real
      // source speed/lift determines its distance; source schedules stay intact.
      while(p.age+1/60<crossingAge-1e-8)assert.equal(system._step(p,1/60),false);
      assert.equal((system._s3SplashDrops||[]).length,0,'no release before source crossing step');
      p.life=p.age+fraction/60+relation*1e-6;
      assert.equal(system._step(p,1/60),true);
      assert.equal((system._s3SplashDrops||[]).length,relation<0?0:1,'lifetime admission at '+relation);
    }
    // A terrain hit exactly at the release point owns the boundary. The
    // source slot is admitted only strictly before that head contact.
    for(const relation of [-1,0,1]) {
      const {f,p}=await shot(c),system=f.G.projectiles,first=c.first[1];
      while(p.age+1/60<crossingAge-1e-8)assert.equal(system._step(p,1/60),false);
      const distance=first-p.catalog.travel+relation*1e-6;
      f.G.physics.segment=(from,to,h)=>{
        const length=from.distanceTo(to);h.hit=length>=distance;
        if(h.hit){h.dist=distance;h.point.copy(from).lerp(to,distance/length);h.normal.set(0,0,-1);h.face=0;}
        return h;
      };
      system._step(p,1/60);
      assert.equal((system._s3SplashDrops||[]).length,relation>0?1:0,'contact admission at '+relation);
    }
  });
}
