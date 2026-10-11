import test from 'node:test';
import assert from 'node:assert/strict';
import { batchFixture } from './batch03-fixture.mjs';
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-9,`${message}: ${a} != ${b}`);

test('#1011 native impact preserves the configured Slosher unit scale and #1140 drop multiplier',async()=>{
  const f=await batchFixture(),a=f.make('slosher'),V=f.THREE.Vector3,ps=f.G.projectiles;
  f.G.camera={position:new V()};
  ps.fireSlosh(a,a.weapon);
  const rounds=ps.list.filter(p=>p.type==='slosh');
  assert.equal(rounds.length,9);
  for(const p of rounds){
    const src=p.fidelitySloshIndex>0?p.fidelitySloshUnit.AfterPaintParam:p.fidelitySloshUnit.PaintParam;
    const scale=f.profile.weaponsFidelityCompletion.worldUnitsPerSourceUnit;
    p.head=false;
    p.start.set(0,50,0);
    for(const far of [false,true]) for(const drop of [0,src.ScaleEndFallDistance]){
      const point=new V((far?src.DistanceXZFar:src.DistanceXZNear)*scale,50-drop,0);
      const hit={point,normal:new V(0,1,0)};
      const before=JSON.stringify({radius:p.radius,size:p.size,vel:p.vel.toArray(),damage:p.damage});
      f.paint.length=0; ps._impact(p,hit);
      assert.equal(f.paint.length,1,'one authoritative landing stamp');
      const shrink=drop===0?1:src.WidthDepthScaleFall;
      close(f.paint[0].radius,(far?src.WidthHalfFar:src.WidthHalfNear)*scale*shrink,'source radius');
      close(f.paint[0].opts.stretchAmt,(far?src.DepthScaleFar:src.DepthScaleNear)*shrink,'source depth');
      assert.equal(JSON.stringify({radius:p.radius,size:p.size,vel:p.vel.toArray(),damage:p.damage}),before);
    }
  }
});

test('#1011 paint ownership stays local during callbacks, exceptions and ghost replay',async()=>{
  const f=await batchFixture(),a=f.make('slosher'),V=f.THREE.Vector3,ps=f.G.projectiles;
  f.G.camera={position:new V()};
  ps.fireSlosh(a,a.weapon);
  const p=ps.list.find(p=>p.type==='slosh');p.head=false;
  const hit={point:p.start.clone().add(new V(5,0,0)),normal:new V(0,1,0)};
  const original=f.G.paint.splat;
  let calls=0;
  const capture=function(...args){
    assert.equal(f.G.paint.splat,capture,'impact never replaces the global paint method');
    calls++;
    return original.apply(this,args);
  };
  f.G.paint.splat=capture;
  ps._impact(p,hit);assert.equal(calls,1);assert.equal(f.G.paint.splat,capture);
  p.ghost=true;ps._impact(p,hit);assert.equal(calls,1,'visual replay cannot paint');p.ghost=false;
  const fail=()=>{throw new Error('paint-failure');};
  f.G.paint.splat=fail;
  assert.throws(()=>ps._impact(p,hit),/paint-failure/);
  assert.equal(f.G.paint.splat,fail);
});

// The full runtime runs the source-spaced births, not pre-constructed projectiles.
// Render cadence changes only the number of fixed simulation ticks per update.
import { fixture as nativeFixture } from './source-fixture.mjs';
import { FixedClock, STEP } from '../runtime/clock.mjs';
async function composedVolley(hz){
  const f=await nativeFixture({productionComposition:true,realProjectiles:true,fullRuntime:true});
  f.setRandom(()=>.5);
  const a=f.make('slosher'),ps=f.G.projectiles,V=f.THREE.Vector3;
  f.G.camera={position:new V()};
  a.nid=42;a.owner='local';a.pos.set(0,1,0);a.aimPoint.set(0,1,10);a.aimDir.set(0,.1,1).normalize();
  f.G.level.queryBlocks=(_a,_b,_c,_d,out)=>{out.length=0;return out;};
  f.G.physics=new f.Physics(f.G.level);
  const paint=[];f.G.paint.splat=(point,radius,team,opts={})=>{paint.push({radius,depth:opts.stretchAmt});return 1;};
  ps.fireSlosh(a,a.weapon);
  const clock=new FixedClock();let ticks=0;
  while(ticks<16)clock.advance(1/hz,()=>{if(ticks<16){ticks++;f.G.time+=STEP;ps.update(STEP);}});
  assert.equal(ps.list.length,9);
  assert.ok(ps.list.every(p=>p.delay===0&&!p._s3SloshBirthPending));
  const rows=[];
  for(const p of ps.list){
    const src=p.fidelitySloshIndex>0?p.fidelitySloshUnit.AfterPaintParam:p.fidelitySloshUnit.PaintParam;
    p.head=false;paint.length=0;
    const hit={point:p.start.clone().add(new V(src.DistanceXZNear,-src.ScaleEndFallDistance,0)),normal:new V(0,1,0)};
    ps._impact(p,hit);assert.equal(paint.length,1);
    close(paint[0].radius,src.WidthHalfNear*src.WidthDepthScaleFall,'composed source radius');
    close(paint[0].depth,src.DepthScaleNear*src.WidthDepthScaleFall,'composed source depth');
    rows.push({index:p.fidelitySloshPacketIndex,age:p.age,seed:p.seed,pos:p.pos.toArray(),vel:p.vel.toArray(),paint:paint[0]});
  }
  return JSON.parse(JSON.stringify(rows));
}
test('#1011 full adapter/runtime births and impacts agree across 30/60/120 Hz rendering',async()=>{
  const expected=await composedVolley(60);
  for(const hz of [30,120])assert.deepEqual(await composedVolley(hz),expected);
});
