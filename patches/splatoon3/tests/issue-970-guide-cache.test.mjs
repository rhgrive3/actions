import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';

let compiled;
async function scene(){
  // Cache admission needs the real production collision-revision producer.
  // The old constrained fixture's Level has no audited mutation contract.
  const f=await (compiled ||= fixture({productionComposition:true,fullRuntime:true})),{G,THREE}=f;
  G.scene=new THREE.Scene();G.actors=[];G.boss=null;G.netm=null;
  G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-80,0,0],[80,0,0]],spawnBarrier:0,
    single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}],half:[]});
  G.physics=new f.Physics(G.level);G.projectiles=new f.Projectiles(G.scene);
  const paint=[];G.paint={sample:()=>1,splat:(...args)=>{paint.push(args);return 1;}};
  const a=f.make('dualies'),ps=G.projectiles;
  a.pos.set(0,0,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,1,20);
  f.G.camera=new f.THREE.PerspectiveCamera(60,16/9,.1,400);f.G.camera.updateMatrixWorld();
  let muzzles=0,los=0;const m=ps._muzzleHand;
  ps._muzzleHand=function(...args){muzzles++;return m.apply(this,args);};f.G.physics.los=()=>{los++;return true;};
  return {...f,a,ps,paint,counts:()=>[muzzles,los]};
}
test('#970 ten-second idle 30/60/120Hz traces replay once with stable projectile/weapon storage',async()=>{
  for(const hz of [30,60,120]){
    const f=await scene(),points=f.ps.s3DualiesGuides(f.a,f.a.weapon),first=f.counts(),shots=f.ps._s3DualiesGuideProjectiles;
    for(let i=0;i<10*hz;i++)assert.equal(f.ps.s3DualiesGuides(f.a,f.a.weapon),points);
    assert.deepEqual(f.counts(),first);assert.equal(first[0],2);assert.equal(shots,f.ps._s3DualiesGuideProjectiles);
    for(const shot of shots)assert.equal(shot.s3Weapon,f.a.weapon);
    assert.equal(f.a.weapon.shotGuideFrame,7);
  }
});
test('#970 aim, pose, form, turret, camera and actual collision revisions invalidate immediately',async()=>{
  const f=await scene(),{a,ps,G}=f;
  ps.s3DualiesGuides(a,a.weapon);
  const changes=[()=>a.aimDir.x+=.01,()=>a.aimPoint.x+=1,()=>a.pos.x+=.1,()=>a.character.root.position.x+=.1,
    ()=>a.form='squid',()=>a.weaponRunner.s3Turret=true,()=>{G.camera.position.x++;G.camera.updateMatrixWorld();},()=>G.level.markCollisionChanged(),
    ()=>a.weapon.projSpeed+=1,()=>{G.level.triangleWorld={sweepSphere(){}};}];
  for(const change of changes){const n=f.counts()[0];change();ps.s3DualiesGuides(a,a.weapon);assert.equal(f.counts()[0],n+2);}
  const points=ps.s3DualiesGuides(a,a.weapon);assert.deepEqual(points[0].toArray(),points[1].toArray());
  ps.clear();const n=f.counts()[0];ps.s3DualiesGuides(a,a.weapon);assert.equal(f.counts()[0],n+2);
});
test('#970 dirty admission leaves prediction unchanged and HUD no longer builds nested arrays',async()=>{
  const f=await scene(),first=f.ps.s3DualiesGuides(f.a,f.a.weapon).map(p=>p.toArray());
  f.ps._dualiesGuideCache=null;
  assert.deepEqual(f.ps.s3DualiesGuides(f.a,f.a.weapon).map(p=>p.toArray()),first);
  const s=fs.readFileSync(new URL('../adapter.mjs',import.meta.url),'utf8');
  assert.ok(!s.includes('const projected = pair?.map'));assert.ok(!s.includes('const offsets = projected.map'));
  assert.equal(f.ps.list.length,0);assert.equal(f.paint.length,0);
});
