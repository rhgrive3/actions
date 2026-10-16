import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {FixedClock} from '../runtime/clock.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';

async function shot({wall=false,grate=false,height=4,enemyX=.9,ghost=false,native=false,hz=60}={}){
  const f=await fixture({fullRuntime:true,realProjectiles:true,productionComposition:true,adaptRuntime:adaptBuildSource,
    extraExports:`export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';
      export {NativeLevel,NativePhysics} from './patches/native-stages/runtime/engine.mjs';`});
  f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
  const a=f.make('s3-slosher-launcher');a.form='kid';a.intent.fire=true;f.tick(a,50);a.intent.fire=false;
  const p=f.G.projectiles.list.find(p=>p.catalog?.descriptor.unit===1&&p.catalog.index===0);assert.ok(p);
  p.pos.set(0,8,0);p.prev.copy(p.pos);p.start.copy(p.pos);p.vel.set(0,0,60);p.age=5/60;p.life=2;p.ghost=ghost;
  Object.assign(p.catalog,{travel:0,carry:0,range:100,phase:0});p.catalog.descriptor.m={};
  const enemy=f.make('shooter');enemy.team=1;enemy.pos.set(enemyX,7.5,.5);f.G.actors=[a,enemy];
  const V=(x,y,z)=>new f.THREE.Vector3(x,y,z);
  const level={blocks:[],faces:[],queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;if(wall)out.push(0);return out;}};
  if(native){
    const flags=grate?5:1;
    const data={manifest:{id:'synthetic-spiral-cover',bounds:{minX:-10,minZ:-10,maxX:10,maxZ:10},spawnPads:[[-5,0,0],[5,0,0]],spawnBarrier:0,
      faces:[],objects:[{collidable:true,grate,bounds:[[.4,6,-3],[.4,6+height,3]]}]},
      triangles:new Float32Array([.4,6,-3,.4,6+height,-3,.4,6,3,.4,6+height,-3,.4,6+height,3,.4,6,3]),
      normals:new Float32Array([1,0,0,1,0,0]),flags:new Uint32Array([flags,flags]),
      objectIds:new Uint32Array([0,0]),nodes:new Float32Array([.4,6,-3,.4,6+height,3,-1,2]),order:new Uint32Array([0,1]),
      triangleFace:new Int32Array([-1,-1]),mask:new Uint8Array(0)};
    f.G.level=new f.NativeLevel(data);f.G.physics=new f.NativePhysics(f.G.level);
  }else{
    if(wall)level.blocks.push({id:0,solid:true,grate,center:V(.4,6+height/2,0),half:V(.01,height/2,3),
      axes:[V(1,0,0),V(0,1,0),V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1],aabbMin:V(.39,6,-3),aabbMax:V(.41,6+height,3)});
    f.G.level=level;f.G.physics=new f.Physics(level);
  }
  const hits=[];f.G.projectiles.applyHit=(_a,target,damage)=>hits.push({target,damage});
  const clock=new FixedClock();let dead=false;
  for(let i=0;i<Math.ceil(hz/10);i++)clock.advance(1/hz,dt=>{if(!dead)dead=f.G.projectiles._step(p,dt);});
  return {hits,enemy,p,dead};
}

for(const hz of [30,60,120])test('opaque lateral cover blocks Machine spiral damage at '+hz+'Hz',async()=>{
  const r=await shot({wall:true,hz});assert.equal(r.hits.length,0);assert.equal(r.dead,false,'blocked outer contact does not consume the travelling spiral');
});
test('clear spiral contact still deals 38 damage',async()=>{const r=await shot();assert.equal(r.hits.length,1);assert.equal(r.hits[0].damage,38);});
test('a grate does not block the spiral attack',async()=>{const r=await shot({wall:true,grate:true});assert.equal(r.hits.length,1);assert.equal(r.hits[0].damage,38);});
test('low cover below the actual contact height does not block damage',async()=>{const r=await shot({wall:true,height:1});assert.equal(r.hits.length,1);});
test('ghost spiral cannot deal damage',async()=>{assert.equal((await shot({wall:true,ghost:true})).hits.length,0);});
test('native NoPaint triangles block lateral spiral damage without proxy-box collision',async()=>{
  const r=await shot({wall:true,native:true});assert.equal(r.hits.length,0);assert.equal(r.dead,false);
});
test('native grate triangles admit the spiral attack',async()=>{const r=await shot({wall:true,native:true,grate:true});assert.equal(r.hits.length,1);});
