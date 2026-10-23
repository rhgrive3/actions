import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';

const DT=1/60;
async function scene(id,key,side,{blocked=true,ghost=false}={}){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  const {level,paint,V}=makePaintWorld(f);f.G.settings={};f.setRandom(()=>.37);
  const a=f.make(id);a.form='kid';a.pos.set(0,5,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,6,100);
  const r=a.weapon.catalogRecord,full=r.parameters.spl__WeaponSaberParam.ChargeParam.ChargeFrameFullCharge;
  for(let i=0;i<(key==='saber-vertical'?full:1);i++)a.weaponRunner.update(DT,{fire:true});
  for(let i=0;i<50&&!f.G.projectiles.list.length;i++)a.weaponRunner.update(DT,{fire:false});
  const p=f.G.projectiles.list.find(p=>p.catalog);assert.ok(p);
  const c=p.catalog.descriptor.c,core=c.CoreIndex,outer=side<0?0:c.ParamArray.length-1,inner=outer-side;
  const offset=c.OffsetArray[inner],out=c.OffsetArray[outer],axis=Math.abs(out.X)>0?'x':'y';
  const coordinate=v=>axis==='x'?v.X:v.Y;
  const centre=p.pos.clone().add(V(offset.X,offset.Y,offset.Z));centre.z+=.55;
  // A narrow post catches only an inner lobe; the outer path itself is clear.
  // Real Physics sphere sweeps and Actor capsules handle all contacts.
  if(blocked){
    const half=V(.04,.04,.08);half[axis]=.02;
    level.blocks.push({id:1,solid:true,grate:false,center:centre,half,axes:level.blocks[0].axes,
      faces:[-1,-1,-1,-1,-1,-1],aabbMin:centre.clone().sub(half),aabbMax:centre.clone().add(half)});
  }
  const b=f.make('shooter');b.team=1;b.hp=1000;b.pos.copy(p.pos).add(V(out.X,out.Y,out.Z+2));
  // For vertical waves, put the top/bottom of the receiving capsule on the
  // outermost lobe, keeping its body away from the surviving centre.
  b.pos.y-=axis==='y'?(coordinate(out)>0?0:f.PLAYER.height):.8;
  p.ghost=ghost;
  return {f,a,b,p,core,inner,outer,paint};
}
for(const id of ['s3-saber-normal','s3-saber-heavy'])for(const key of ['saber-horizontal','saber-vertical'])for(const side of [-1,1]){
  test(`${id} ${key} side ${side}: an inner terrain hit removes outward lobes before their later Actor contact`,async()=>{
    const x=await scene(id,key,side),control=await scene(id,key,side,{blocked:false});
    for(let i=0;i<3;i++){x.f.G.projectiles.update(DT);control.f.G.projectiles.update(DT);}
    assert.ok(control.b.hp<1000,'unblocked outer lobe really reaches this target');
    assert.equal(x.b.hp,1000,'the removed outer lobe cannot hit beside the post');
    assert.equal(x.p.catalog.lobeGone?.[x.inner],true,'contacted inner lobe retires');
    assert.equal(x.p.catalog.lobeGone?.[x.outer],true,'same-side outer lobe retires with it');
    assert.notEqual(x.p.catalog.lobeGone?.[x.core],true,'the centre keeps flying');
  });
}
for(const side of [-1,1])test(`charged Wiper side ${side}: vertical lobe cascade is shared by local and ghost geometry`,async()=>{
  for(const ghost of [false,true]){
    const x=await scene('s3-saber-lite','saber-vertical',side,{ghost});
    for(let i=0;i<3;i++)x.f.G.projectiles.update(DT);
    assert.equal(x.p.catalog.lobeGone?.[x.outer],true);assert.equal(x.b.hp,1000);
    if(ghost){assert.equal(x.paint.counts[0],0);assert.equal(x.a.stats.turf,0);}
  }
});

for(const hz of [30,60,120])test(`cascade at ${hz}Hz cannot invent an outer wall stamp and leaves the opposite wing active`,async()=>{
  const x=await scene('s3-saber-heavy','saber-horizontal',1),stamps=[];
  x.f.G.paint.splat=(at,radius)=>{stamps.push({at:at.clone(),radius});return 0;};
  const c=x.p.catalog.descriptor.c,opposite=c.OffsetArray[0];
  x.b.pos.copy(x.p.pos).add(new x.f.THREE.Vector3(opposite.X,-.8,opposite.Z+3.5));
  for(let i=0;i<hz/15;i++)x.f.G.projectiles.update(1/hz);
  assert.ok(x.b.hp<1000,'the opposite wing can still hit an actual Actor');
  assert.equal(stamps.length,1,'only the inner physical contact paints, never its clear outward path');
  assert.equal(x.p.catalog.lobeGone[x.inner],true);assert.equal(x.p.catalog.lobeGone[x.outer],true);
  assert.notEqual(x.p.catalog.lobeGone[0],true);
});

test('an outer Actor contact before the inner terrain cutoff still wins the continuous ordering',async()=>{
  const x=await scene('s3-saber-normal','saber-horizontal',1);
  // Contact begins immediately, before the post .55 units ahead. An inner
  // contact later in the same step must not erase an earlier valid hit.
  x.b.pos.z=x.p.pos.z+.1;
  x.f.G.projectiles.update(DT);
  assert.equal(x.b.hp,965);assert.equal(x.f.G.projectiles.list.includes(x.p),false);
  assert.notEqual(x.p.catalog.lobeGone?.[x.inner],true,'later terrain never commits after the earlier Actor');
});
