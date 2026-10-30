// QA-only routing acceptance. Uses the real composed/emitted fixture, not extracted methods.
// Physics/paint/render sinks are fixture doubles; this is not browser/visual acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.BLAST_SOURCE_ROOT;
assert.ok(root&&path.isAbsolute(root),'BLAST_SOURCE_ROOT must identify the clean source checkout');
assert.ok(['baseline','candidate'].includes(process.env.BLAST_VARIANT));
const expectedAlpha=process.env.BLAST_VARIANT==='candidate'?.92:1;
const {fixture}=await import(pathToFileURL(path.join(root,'patches/splatoon3/tests/source-fixture.mjs')));
const {MAIN_WEAPON_CATALOG}=await import(pathToFileURL(path.join(root,'patches/splatoon3/runtime/main-weapon-catalog-data.mjs')));
const rows=MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='blaster');
assert.deepEqual(rows.map(r=>r.id).sort(),['blaster','s3-blaster-short','s3-blaster-long','s3-blaster-lightshort','s3-blaster-light','s3-blaster-lightlong','s3-blaster-precision'].sort());
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
const DT=1/60;
function reset(){
 f.G.projectiles.clear();f.G.actors.length=0;f.G.netm=null;f.G.boss=null;f.G.local=null;
 f.G.camera={position:new f.THREE.Vector3(0,20,0)};
 f.G.physics={los:()=>true,segment:(_a,_b,h)=>{h.hit=false;return h;},raycast:(_a,_b,_d,h)=>{h.hit=false;return h;}};
 const bursts=[],paint=[];
 f.G.fx=new Proxy({q:1,explosion:(...args)=>bursts.push(args)}, {get:(target,key)=>key in target?target[key]:()=>{}});
 f.G.paint.splat=(...args)=>{paint.push(args);return 0;};
 return {bursts,paint};
}
function shoot(row,{remoteReplay=false}={}){
 const observed=reset(),a=f.make(row.id);a.nid=7;a.form='kid';a.grounded=true;
 a.pos.set(0,20,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,21.05,200);
 const nm=new f.NetMatch({myId:'owner'},{});f.G.netm=nm;
 for(let frame=0;frame<120&&!f.G.projectiles.list.length;frame++)
  a.weaponRunner.update(DT,{fire:true,firePressed:frame===0});
 let p=f.G.projectiles.list[0];assert.ok(p,row.id+' real runner emits');
 assert.equal(p.wid,row.id);
 if(row.legacy)assert.equal(p.s3Weapon.kind,'blaster');
 else {assert.equal(p.catalog.r.id,row.id);assert.equal(p.catalog.r.family,'blaster');}
 if(remoteReplay){
  const packet=JSON.parse(JSON.stringify(nm.out.find(e=>e[1]==='p')));assert.ok(packet,row.id+' real NetMatch birth packet');
  const remote=f.make(row.id);remote.nid=7;remote.remote=true;
  const before=f.G.projectiles.list.length,outBefore=nm.out.length;
  f.G.projectiles.ghostProjectile(remote,packet);
  assert.equal(f.G.projectiles.list.length,before+1,'actual ghost receiver admits one round');
  p=f.G.projectiles.list.at(-1);assert.equal(p.ghost,true);assert.equal(p.damage,0);
  assert.equal(nm.out.length,outBefore,'ghost receiver never emits a new packet');
  if(!row.legacy)assert.equal(p.catalog.r.id,row.id,'catalog descriptor restored from actual packet');
 }
 f.G.netm=null;
 observed.bursts.length=0;observed.paint.length=0;
 return {...observed,a,p};
}
for(const row of rows)test(row.id+' actual runner -> timed native/catalog explosion routes shell alpha',()=>{
 const {p,bursts}=shoot(row);
 if(p.catalog)p.catalog.dropCount=p.catalog.descriptor.splashCount;
 p.life=p.age+DT;
 assert.equal(f.G.projectiles._step(p,DT),true);
 assert.equal(bursts.length,1,row.id+' exactly one burst');
 assert.equal(bursts[0][3]??1,expectedAlpha);
 assert.ok(Number.isFinite(bursts[0][2])&&bursts[0][2]>0);
});
for(const row of rows)test(row.id+' actual replicated birth retains existing ghost authority/visual route',()=>{
 const {p,bursts,paint}=shoot(row,{remoteReplay:true});
 if(p.catalog)p.catalog.dropCount=p.catalog.descriptor.splashCount;
 p.life=p.age+DT;
 assert.equal(f.G.projectiles._step(p,DT),true);
 if(row.legacy){assert.equal(bursts.length,1);assert.equal(bursts[0][3]??1,expectedAlpha);}
 else assert.equal(bursts.length,0,'catalog ghost Blasters retain pre-existing no-burst-FX policy');
 assert.equal(paint.length,0,'ghosts cannot author owner paint');
});
test('real native/ghost special blast route stays alpha 1 despite Blaster owner',()=>{
 for(const ghost of [false,true]){
  const {a,p,bursts}=shoot(rows.find(r=>r.legacy));
  const descriptor={id:'inkVac',kind:'special',splashRadius:11,burstRadius:11,impactRadius:11,
   splashBands:[[0,220],[11,220]],splashDamageMax:220,splashDamageMin:220};
  p.s3SpecialWeapon=descriptor;p.s3Weapon=descriptor;p.wid='inkVac';p.ghost=ghost;
  f.G.projectiles._blastBurst(p,p.pos.clone(),null);
  assert.equal(a.weapon.kind,'blaster');assert.equal(bursts.length,1);
  assert.equal(bursts[0][3]??1,1,'special identity wins over owner main weapon');
 }
});
test('native bomb explosion keeps default alpha and is independent of Blaster owner',()=>{
 const {bursts}=reset(),a=f.make('blaster');
 f.G.projectiles._explodeBomb({kind:'bomb',owner:a,team:0,pos:new f.THREE.Vector3(0,20,0),ghost:false});
 assert.equal(bursts.length,1);assert.equal(bursts[0][3]??1,1);
});
