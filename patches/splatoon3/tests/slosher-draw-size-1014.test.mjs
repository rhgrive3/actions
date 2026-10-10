import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
const DT=1/60;
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
function matrices(f,ps) {
  ps._draw();const out=[];
  for(let i=0;i<ps.blobs.count;i++){
    const m=new f.THREE.Matrix4();ps.blobs.getMatrixAt(i,m);
    const pos=new f.THREE.Vector3(),scale=new f.THREE.Vector3(),q=new f.THREE.Quaternion();m.decompose(pos,q,scale);
    out.push({pos,scale,tail:ps.blobShape.array[i*4]});
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
test('#1014 actual fixed side-on native draw matrices cover all nine unit-mapped heads and source tail extents',async()=>{
  const {f,ps}=await volley();
  for(let frame=0;frame<16;frame++){f.G.time+=DT;ps.update(DT);}
  assert.equal(ps.list.length,9);assert.ok(ps.list.every(p=>p.delay===0));
  const before=JSON.stringify(ps.list.map(gameplay)),rendered=matrices(f,ps);
  const camera=new f.THREE.OrthographicCamera(-20,20,12,-12,.1,100);camera.position.set(30,6,10);camera.lookAt(0,3,10);camera.updateMatrixWorld();
  for(const p of ps.list){
    const head=rendered.find(r=>r.pos.distanceTo(p.pos)<1e-5);assert.ok(head,'real native renderer emitted head at authoritative position');
    const radius=f.fidelitySlosherDrawRadius(p);close(head.scale.x,radius);close(head.scale.y,radius);close(head.scale.z,radius);
    const pixel=p.pos.clone().project(camera);assert.ok(Number.isFinite(pixel.x)&&Number.isFinite(pixel.y));
    const end=head.tail>1?(head.tail-1)*radius:0;
    const expected=Math.max(.5,Math.min(4,p.vel.length()*Math.min(p.age,5/60)));close(end,expected,2e-6);
  }
  assert.equal(JSON.stringify(ps.list.map(gameplay)),before,'rendering cannot advance/change gameplay');
});
test('#1014 nonzero ChangeFrame controls real head matrices and TailSolidFrame controls the bounded solid window',async()=>{
  const {f,ps}=await volley(units=>Object.assign(units[0].DrawSizeParam,{InitRadius:.4,EndRadius:.8,AfterOffsetInitRadius:0,AfterOffsetEndRadius:0,ChangeFrame:6,TailSolidFrame:2}));
  const p=ps.list[0];ps.list=[p];p.delay=0;p.sats=0;p.vel.set(60,0,0);
  for(const [age,radius] of [[0,.4],[.025,.5],[.05,.6],[.1,.8],[.2,.8]]){
    p.age=age;const [head]=matrices(f,ps);close(head.scale.x,radius);
    const length=(head.tail-1)*radius;close(length,Math.max(.5,Math.min(4,60*Math.min(age,2/60))),2e-6);
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
test('#1014 recycled non-Slosher projectiles keep their own presentation and clear the Slosher record',async()=>{
  const {f,a,ps}=await volley();ps.clear();a.weapon=f.WEAPONS.shooter;a.weaponId='shooter';ps.fireShooter(a,a.weapon);
  assert.ok(ps.list.length>0);assert.ok(ps.list.every(p=>p.fidelitySloshDraw===null));
  const p=ps.list[0];ps.list=[p];p.delay=0;p.sats=0;p.age=.025;
  const [head]=matrices(f,ps),g=.5;close(head.scale.x,(p.vis||p.size)*g*(1+.3*Math.sin(g*Math.PI)));
});
