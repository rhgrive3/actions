import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { INK_LOOK } from '../runtime/weapons-fidelity.mjs';
const DT=1/60;
// 2026-10-11: the drawn sheet half-width is DrawSizeParam x the footage width
// calibration; the tail beyond the drawn head keeps the sourced TailLength.
const SLOSH_WIDTH=INK_LOOK.slosh[4];
const close=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e, `${a} != ${b}`);
async function volley(tune, drawControl=false) {
  const f=await fixture({productionComposition:true,realProjectiles:true,fullRuntime:true,
    adaptRuntime:(rel,source)=>drawControl&&rel==='patches/splatoon3/runtime/weapons-fidelity.mjs'
      ? source.replace('setSlosherDraw(p,u,p.fidelitySloshIndex);','/* Visual-only counterfactual: keep all gameplay owners. */') : source,
    extraExports:"export * from './patches/splatoon3/runtime/weapons-fidelity.mjs';"});
  let draws=0;f.setRandom(()=>((draws++/97)%1));
  if(tune)tune(f.profile.weaponsFidelityCompletion.weapons.slosher.UnitGroupParam.Unit.filter(u=>u.BulletNum>0));
  const a=f.make('slosher');a.nid=42;a.owner='local';a.pos.set(0,1,0);a.aimPoint.set(0,1,10);a.aimDir.set(0,0.1,1).normalize();
  f.G.level.queryBlocks=(_a,_b,_c,_d,out)=>{out.length=0;return out;};
  f.G.physics=new f.Physics(f.G.level);
  const ps=f.G.projectiles;ps.fireSlosh(a,a.weapon);
  return {f,a,ps,draws:()=>draws};
}
function gameplay(p) {
  return {pos:p.pos.toArray(),vel:p.vel.toArray(),delay:p.delay,size:p.size,seed:p.seed,damage:p.damage,radius:p.radius,
    trailRadius:p.trailRadius,trailEvery:p.trailEvery,grav:p.grav,drag:p.drag,straight:p.straight,life:p.life,head:p.head,sats:p.sats,
    collision:JSON.parse(JSON.stringify(p.fidelityPlayerCollision)),field:JSON.parse(JSON.stringify(p.fidelityFieldCollision)),
    move:JSON.parse(JSON.stringify(p.fidelityMove)),index:p.fidelitySloshIndex};
}
// PR #1220 moves shooter/Slosher bodies out of the legacy blob instances.
// Inspect the *emitted* native visual mesh instead of accepting an empty
// legacy renderer or fabricating old blob matrices from gameplay metadata.
function visualHeads(f,ps) {
  ps._draw();
  assert.equal(typeof ps.syncVisuals,'function','render-edge visual sync is installed');
  ps.syncVisuals(1);
  const v=ps.projectileVisuals;
  assert.ok(v?.mesh.visible && v.stats.drawCalls===1,'one live shared visual draw');
  const out=[], attr=v.geometry.attributes.position, SIDES=12, RINGS=13;
  const emitted=ps.list.filter(p=>p.delay<=0&&v.handles(p));
  assert.ok(emitted.length>0,'at least one source-aware head is drawn');
  assert.ok(v.stats.vertexCount>=emitted.length*SIDES*RINGS,'all active heads have actual vertex storage');
  assert.ok(v.geometry.drawRange.count>=emitted.length*(RINGS-1)*SIDES*6,'actual draw indexes are submitted');
  for(let i=0;i<emitted.length;i++){
    const p=emitted[i], endVertex=i*RINGS*SIDES+(RINGS-1)*SIDES;
    const tip=new f.THREE.Vector3(attr.getX(endVertex),attr.getY(endVertex),attr.getZ(endVertex));
    const radius=p.fidelitySloshDraw
      ? f.fidelitySlosherDrawRadius(p)*INK_LOOK.slosh[4]
      : (p.vis||p.size)*INK_LOOK.shot[4];
    assert.ok(tip.toArray().every(Number.isFinite),'finite actual native head');
    const ring=i*RINGS*SIDES+6*SIDES;
    let spread=0;
    for(let k=0;k<SIDES;k++)spread=Math.max(spread,tip.distanceTo(new f.THREE.Vector3(attr.getX(ring+k),attr.getY(ring+k),attr.getZ(ring+k))));
    assert.ok(spread>radius*.05,'native surface has nonzero cross-section');
    out.push({p,tip,radius,age:p._iwVisualRenderAge,start:p._iwVisualRenderStart});
  }
  return out;
}
test('#1014 native nine-glob unit/order draw records replace the legacy global ramp without changing gameplay or RNG',async()=>{
  const {f,a,ps,draws}=await volley();assert.equal(ps.list.length,9);
  const expectedInit=[.5625,.5125,.4625,.4125,.6,.5,.4,.3,.2],expectedEnd=[1,.97,.94,.91,.6,.5,.4,.3,.2];
  const units=f.profile.weaponsFidelityCompletion.weapons.slosher.UnitGroupParam.Unit.filter(u=>u.BulletNum>0);
  for(let i=0;i<9;i++){
    const p=ps.list[i],d=p.fidelitySloshDraw;assert.ok(d,'installed runtime reads DrawSizeParam');
    assert.equal(p.fidelitySloshUnit,units[i<4?0:1]);assert.equal(p.fidelitySloshIndex,i<4?i:i-4);
    close(d.initRadius,expectedInit[i]);close(d.endRadius,expectedEnd[i]);assert.equal(d.worldUnitsPerSourceUnit,1);
    close(p.vis,expectedEnd[i]);assert.equal(d.changeTime,0);assert.equal(d.tailMin,.5);assert.equal(d.tailMax,4);close(d.tailSolidTime,5/60);
  }
  const current={draws:draws(),ink:a.ink,rows:ps.list.map(gameplay)};
  const control=await volley(null,true);
  assert.ok(control.ps.list.every(p=>p.fidelitySloshDraw==null),'counterfactual removes only the draw records');
  const expected={draws:control.draws(),ink:control.a.ink,rows:control.ps.list.map(gameplay)};
  assert.deepEqual(JSON.parse(JSON.stringify(current)),JSON.parse(JSON.stringify(expected)),'the full integrated gameplay and RNG fingerprint is invariant when only visual draw records are disabled');
});
test('#1014 real native Slosher mesh retains all nine sourced heads and capped flight histories',async()=>{
  const {f,ps}=await volley();
  for(let frame=0;frame<16;frame++){f.G.time+=DT;ps.update(DT);}
  assert.equal(ps.list.length,9);assert.ok(ps.list.every(p=>p.delay===0));
  const before=JSON.stringify(ps.list.map(gameplay)),rendered=visualHeads(f,ps);
  assert.equal(rendered.length,9,'all nine Slosher bodies are actually submitted');
  const camera=new f.THREE.OrthographicCamera(-20,20,12,-12,.1,100);
  camera.position.set(30,6,10);camera.lookAt(0,3,10);camera.updateMatrixWorld();
  for(const p of ps.list){
    const head=rendered.find(r=>r.p===p);assert.ok(head,'live source head');
    const tip=p.pos.clone().addScaledVector(p.vel.clone().normalize(),head.radius);
    assert.ok(head.tip.distanceTo(tip)<.003,'native rounded cap follows authoritative head and source radius');
    const pixel=p.pos.clone().project(camera);
    assert.ok(Number.isFinite(pixel.x)&&Number.isFinite(pixel.y));
    assert.ok(head.age>=head.start&&head.age-head.start<=5/60+1e-7,'source TailSolidFrame bounds actual history');
    const h=p._iwVisualHistory,a=new Float64Array(6),b=new Float64Array(6);
    assert.ok(h.sample(head.age,a)&&h.sample(head.start,b),'actual physics history sampled');
    const distance=Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
    assert.ok(distance<=4+1e-4,'sourced MaxTailLength constrains drawn flight history');
  }
  assert.equal(JSON.stringify(ps.list.map(gameplay)),before,'rendering cannot advance/change gameplay');
});
test('#1014 ChangeFrame controls sourced Slosher radius and TailSolidFrame limits native visual history',async()=>{
  const {f,ps}=await volley(units=>Object.assign(units[0].DrawSizeParam,{InitRadius:.4,EndRadius:.8,AfterOffsetInitRadius:0,AfterOffsetEndRadius:0,ChangeFrame:6,TailSolidFrame:2}));
  const p=ps.list[0];ps.list=[p];p.sats=0;
  const v=ps.projectileVisuals;
  assert.equal(p._s3SloshBirthPending,true,'queued Slosher has not refreshed its native muzzle');
  assert.equal(v.ensureBirth(p),false,'presentation cannot initialize a pending native birth');
  assert.ok(!p._iwVisualHistory,'no history is fabricated from the enqueue position');
  // Let the real fixed-step owner refresh the muzzle and initialize history.
  // Only after that transition, reset the visual sample ring for this existing
  // controlled-age radius/tail probe; never bypass the gameplay birth guard.
  f.G.time+=DT;ps.update(DT);
  assert.ok(ps.list.includes(p),'the original round survives its actual birth step');
  assert.equal(p._s3SloshBirthPending,false,'native physics completed birth');
  assert.ok(p._iwVisualHistory?.count>0,'native physics recorded the first sample');
  assert.equal(v.ensureBirth(p),true,'an admitted native round has visual history');
  p._iwVisualHistory.reset();p.vel.set(60,0,0);
  for(const [age,radius] of [[0,.4],[.025,.5],[.05,.6],[.1,.8],[.2,.8]]){
    p.age=age;p.pos.set(age*60,1,0);
    v.ensureBirth(p);
    assert.ok(p._iwVisualHistory.record(age,p.pos.x,p.pos.y,p.pos.z,p.vel.x,p.vel.y,p.vel.z),'actual-age source sample recorded');
    const [head]=visualHeads(f,ps);
    close(f.fidelitySlosherDrawRadius(p),radius);
    close(head.radius,radius*INK_LOOK.slosh[4]);
    assert.ok(head.age-head.start<=2/60+1e-7,'2F TailSolidFrame controls native history length');
  }
});
test('#1014 actual birth packets reconstruct all nine ghost unit/index sizes at matching age without additional protocol fields',async t=>{
  const {f,a,ps}=await volley();
  const nm=f.G.netm=new f.NetMatch({myId:'local'},{});t.after(()=>nm.dispose());
  for(let frame=0;frame<16;frame++){f.G.time+=DT;ps.update(DT);}
  const owner=ps.list.slice();const events=nm.out.filter(e=>e[1]==='p');assert.equal(events.length,9,'one existing birth packet per glob');
  f.G.netm=null;const remote=f.make('slosher');remote.remote=true;remote.nid=a.nid;remote.owner='remote';
  for(const event of events){
    const before=ps.list.length;ps.ghostProjectile(remote,event);assert.equal(ps.list.length,before+1);
    const ghost=ps.list.at(-1);assert.ok(ghost.ghost);assert.equal(ghost.delay,0);
    const local=owner.find(p=>p._netId===ghost._netId);assert.ok(local,'unchanged birth identity');
    assert.equal(ghost.fidelitySloshUnit,local.fidelitySloshUnit);assert.equal(ghost.fidelitySloshIndex,local.fidelitySloshIndex);
    for(const age of [0,.025,.1,.25]){local.age=ghost.age=age;close(f.fidelitySlosherDrawRadius(ghost),f.fidelitySlosherDrawRadius(local));}
    ghost.vel.copy(local.vel);close(f.fidelitySlosherDrawTail(ghost,ghost.vel.length()),f.fidelitySlosherDrawTail(local,local.vel.length()));
  }
});
test('#1014 recycled non-Slosher rounds have their own native material and no stale Slosher history',async()=>{
  const {f,a,ps}=await volley();ps.clear();a.weapon=f.WEAPONS.shooter;a.weaponId='shooter';ps.fireShooter(a,a.weapon);
  assert.ok(ps.list.length>0);assert.ok(ps.list.every(p=>p.fidelitySloshDraw===null));
  const p=ps.list[0];ps.list=[p];p.delay=0;p.sats=0;p.age=.025;
  // The catalogue installer now enables the native S3 shot-shape owner.
  // For a recycled Shooter round, that owner wins over the shared fallback
  // instead of drawing a second body or reusing old Slosher history.
  ps._draw();ps.syncVisuals(1);
  assert.equal(p.s3Shape,'shot','recycled round is reclassified every draw');
  assert.equal(ps.s3ShapeCounts?.body,1,'one native shooter rod is submitted');
  assert.ok(ps._s3Shapes?.body?.visible && ps._s3Shapes.body.count===1,
    'native shooter mesh has one visible instance');
  assert.equal(ps.projectileVisuals.handles(p),false,'old shared bucket body cannot double-render');
  assert.equal(p._iwVisualHistory ?? null,null,'no stale Slosher trail remains on the recycled round');
  assert.ok(p.vis>0&&Number.isFinite(p.vis),'shooter retains its finite source visual radius');
});
