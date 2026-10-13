import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {buildSourceBVH} from '../runtime/source-convert.mjs';

const oldWorld=fs.readFileSync(new URL('./fixtures/triangle-world-e57.mjs.txt',import.meta.url),'utf8');
const oldLevel=fs.readFileSync(new URL('./fixtures/native-level-e57.mjs.txt',import.meta.url),'utf8');
const f=await fixture({productionComposition:true,adaptRuntime:adaptBuildSource,extraExports:`
 export {BotBrain} from './inkwave-public/src/game/bots.js';
 export {NativeLevel,NativePhysics} from './patches/native-stages/runtime/engine.mjs';
`});
const unmodule=s=>s.replace(/^import .*;$/gm,'').replace(/^export /gm,'');
const OldWorld=new Function('THREE',unmodule(oldWorld)+'\nreturn TriangleWorld;')(f.THREE);
const OldLevel=new Function('THREE','Level','nativeInkGeometry','TriangleWorld',unmodule(oldLevel)+'\nreturn NativeLevel;')(f.THREE,f.Level,null,OldWorld);
const V=(x=0,y=0,z=0)=>new f.THREE.Vector3(x,y,z);
const flat=h=>h?{...h,point:h.point.toArray(),normal:h.normal.toArray()}:null;
function random(seed=0x517ca){return()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);}
function data(){
 const r=random(),v=[];
 for(let i=0;i<240;i++){const x=(r()-.5)*30,y=(r()-.5)*20,z=(r()-.5)*30;v.push(x,y,z,x+r()*6,y+r()*3,z,x,y-r()*3,z+r()*6);}
 // Both windings, coincident surfaces, gratings, zero-area triangles and a thin gap.
 v.push(-8,0,-8,8,0,8,8,0,-8, -8,0,-8,8,0,8,8,0,-8,
 -8,2,-8,8,2,-8,8,2,8, -8,2.00001,-8,8,2.00001,8,8,2.00001,-8,
 0,0,0,0,0,0,0,0,0, -8,-3,0,8,-3,0,8,6,0);
 const triangles=new Float32Array(v),n=v.length/9,normals=new Float32Array(n*3),flags=new Uint32Array(n),objectIds=new Uint32Array(n);
 for(let i=0;i<n;i++){normals[i*3+1]=i%3===0?-1:1;flags[i]=i%5===0?5:3;}
 return {triangles,normals,flags,objectIds,...buildSourceBVH(triangles),triangleFace:new Int32Array(n).fill(-1),mask:new Uint8Array(),manifest:{id:'ground-adversarial',bounds:{minX:-24,maxX:24,minZ:-24,maxZ:24},spawnPads:[[0,0,-20],[0,0,20]],spawnBarrier:0,objects:[{collidable:false}],faces:[]}};
}
function pair(d=data()){
 return {a:new OldLevel(d),b:new f.NativeLevel(d)};
}
// The optimized build bundles this class inside engine.mjs. Read its actual
// constructor through the shipped NativeLevel; never re-minify a test copy.
const CurrentWorld=new f.NativeLevel(data()).triangleWorld.constructor;
test('frozen nearest-ray and native-level oracles retain their SHA-256',()=>{
 assert.equal(createHash('sha256').update(oldWorld).digest('hex'),'76206bdf0a42a5122759ca0914435e3a3f89da590740253e8c4f18d6127af92f');
 assert.equal(createHash('sha256').update(oldLevel).digest('hex'),'eb9dc9bea68bf981d15a4e532470d1a1c83f267c615e73840da0f304a3fc35c4');
});
test('ordinary nearest ray remains bit-exact, including hit ties, counters and invalid inputs',()=>{
 const d=data(),a=new OldWorld(d),b=new CurrentWorld(d),r=random(0x122);
 const compare=(o,dir,far,opts)=>{assert.deepEqual(flat(b.ray(o,dir,far,opts)),flat(a.ray(o,dir,far,opts)));assert.equal(b.queryCount,a.queryCount);assert.equal(b.triangleTests,a.triangleTests);};
 for(let i=0;i<12000;i++)compare(V((r()-.5)*35,(r()-.5)*25,(r()-.5)*35),i%3?V(r()-.5,r()-.5,r()-.5).normalize():V(i%2?-0:0,-1,0),r()*40,{ignoreGrates:i%2===0,minNormalY:[-2,.62,.68,1.1][i%4]});
 for(const x of [-8-1e-12,-8,-8+1e-12,-0,0,8-1e-12,8,8+1e-12,NaN,Infinity,-Infinity])for(const y of [0,.00000999999,.00001,.00001000001,2,2.00001,10])for(const far of [-1,-0,0,.00001,2,20,Infinity,NaN])compare(V(x,y,0),V(-0,-1,0),far,{});
});
test('Boolean ground support matches the frozen nearest height for 30,000 mixed-height queries',()=>{
 const {a,b}=pair(),r=random(0x841a);let supported=0;
 for(let i=0;i<30000;i++){
  const x=(r()-.5)*35,z=(r()-.5)*35,yMax=(r()-.5)*30,minimumY=(r()-.5)*24;
  const y=a.groundHeight(x,z,yMax),expected=y!==-Infinity&&!(y<minimumY);
  assert.equal(b.hasGroundAbove(x,z,yMax,minimumY),expected,JSON.stringify({x,z,yMax,minimumY,y}));if(expected)supported++;
 }
 assert.ok(supported>1000);assert.ok(b.triangleWorld.triangleTests<a.triangleWorld.triangleTests);
 console.log(JSON.stringify({queries:30000,supported,baselineTriangleTests:a.triangleWorld.triangleTests,candidateTriangleTests:b.triangleWorld.triangleTests}));
});
function planes(rows){
 const d=data(),v=[];for(const [y] of rows)v.push(-4,y,-4,4,y,4,4,y,-4,-4,y,-4,-4,y,4,4,y,4);
 d.triangles=new Float32Array(v);d.normals=new Float32Array(rows.flatMap(([,normal=1])=>[0,normal,0,0,normal,0]));d.flags=new Uint32Array(rows.flatMap(([,normal,grate])=>[grate?5:3,grate?5:3]));d.objectIds=new Uint32Array(rows.length*2);d.triangleFace=new Int32Array(rows.length*2).fill(-1);Object.assign(d,buildSourceBVH(d.triangles));return d;
}
test('stacked floors, pits, ceilings, slopes, grates and exact fall-height boundaries retain water decisions',()=>{
 const cases=[
  {rows:[[-20],[-9]],limit:-8,supported:false},
  {rows:[[-20],[-8]],limit:-8,supported:true},
  {rows:[[-20],[-8.000001]],limit:-8,supported:false},
  {rows:[[-20],[-7.999999]],limit:-8,supported:true},
  {rows:[[-10],[2,-1],[5,.679999]],limit:-8,supported:false},
  {rows:[[-10],[-8,.68],[5,-1]],limit:-8,supported:true},
  {rows:[[-10],[0,1,true],[2,-1]],limit:-8,supported:true},
  {rows:[[-20],[-9],[0],[3]],limit:2,supported:true},
 ];
 for(const c of cases){const {a,b}=pair(planes(c.rows));assert.equal(b.hasGroundAbove(0,0,10,c.limit),c.supported,JSON.stringify(c));
  for(const yMax of [-25,-10,-8.001,-8,-7.99999,0,1,3,10])for(const min of [-Infinity,-20,-8,0,2,3,Infinity,NaN])for(const x of [-4-1e-10,-4,-4+1e-10,-0,0,4-1e-10,4,4+1e-10]){
   const y=a.groundHeight(x,0,yMax);assert.equal(b.hasGroundAbove(x,0,yMax,min),y!==-Infinity&&!(y<min),JSON.stringify({c,yMax,min,x,y}));
  }
 }
});
test('custom ground overrides, invalid coordinates, and fresh-world reconstruction preserve the fallback',()=>{
 const {a,b}=pair();for(const invalid of [NaN,Infinity,-Infinity])for(const input of [[invalid,0,10],[0,invalid,10],[0,0,invalid]]){const y=a.groundHeight(...input);assert.equal(b.hasGroundAbove(...input,-8),y!==-Infinity&&!(y< -8));}
 for(const y of [-Infinity,-10,-8,0,NaN]){b.groundHeight=()=>y;assert.equal(b.hasGroundAbove(0,0,10,-8),y!==-Infinity&&!(y< -8));}
 const fresh=pair();assert.equal(fresh.b.hasGroundAbove(0,0,10,-8),fresh.a.groundHeight(0,0,10)>=-8);
 const original=f.NativeLevel.prototype.groundHeight;
 try{f.NativeLevel.prototype.groundHeight=()=>-20;assert.equal(fresh.b.hasGroundAbove(0,0,10,-8),false,'later global prototype overrides must retain their decision');}
 finally{f.NativeLevel.prototype.groundHeight=original;}
 class CustomGround extends f.NativeLevel{groundHeight(){return -20;}}
 assert.equal(new CustomGround(data()).hasGroundAbove(0,0,10,-8),false,'subclass override must retain its decision');
});
test('actual source or emitted BotBrain uses Boolean ground only on native levels',()=>{
 const brain=new f.BotBrain(f.make('shooter')),calls=[];
 f.G.level={native:false,groundHeight(...args){calls.push(args);return 0;},hasGroundAbove(){throw Error('Block stages must keep their groundHeight path');}};
 assert.equal(brain._wet(1,2,3),false);assert.deepEqual(calls,[[1,2,3.6]]);
 f.G.level={native:true,groundHeight(){throw Error('Native support must not search for the nearest height');},hasGroundAbove(...args){calls.push(args);return false;}};
 assert.equal(brain._wet(1,2,3),true);assert.deepEqual(calls[1],[1,2,3.6,f.PLAYER.fallDeathY]);
 f.G.level={native:true,groundHeight(){return -Infinity;}};
 assert.equal(brain._wet(1,2,3),true,'older/custom native levels keep the original fallback');
});

// Damage is exercised separately from the invulnerable eight-bot density
// replay. Use real Actor admission, WeaponRunner, projectile collision and
// damage routing on native triangles; only display/movement and paint storage
// are fixture stubs. Paint command parity is checked here, full atlas/grid
// parity is checked by measure-inkwave-native-ground.mjs.
const combat=await fixture({productionComposition:true,adaptRuntime:adaptBuildSource,fullRuntime:true,realProjectiles:true,extraExports:`
 export {BotBrain} from './inkwave-public/src/game/bots.js';
 export {NativeLevel,NativePhysics} from './patches/native-stages/runtime/engine.mjs';
`});
const CombatOldWorld=new Function('THREE',unmodule(oldWorld)+'\nreturn TriangleWorld;')(combat.THREE);
const CombatOldLevel=new Function('THREE','Level','nativeInkGeometry','TriangleWorld',unmodule(oldLevel)+'\nreturn NativeLevel;')(combat.THREE,combat.Level,null,CombatOldWorld);
function damageReplay(LevelClass,hz,blocked=false){
 const {G,THREE}=combat;combat.setRandom(()=>.37);G.time=0;G.actors=[];
 const geometry=planes([[0]]);
 if(blocked){
  geometry.triangles=new Float32Array([...geometry.triangles,-4,0,1.5,4,3,1.5,4,0,1.5,-4,0,1.5,-4,3,1.5,4,3,1.5]);
  geometry.normals=new Float32Array([...geometry.normals,0,0,-1,0,0,-1]);
  geometry.flags=new Uint32Array([...geometry.flags,3,3]);geometry.objectIds=new Uint32Array([0,0,1,1]);
  geometry.manifest.objects.push({collidable:true,bounds:[[-4,0,1.5],[4,3,1.55]]});
  geometry.triangleFace=new Int32Array(4).fill(-1);Object.assign(geometry,buildSourceBVH(geometry.triangles));
 }
 G.level=new LevelClass(geometry);G.physics=new combat.NativePhysics(G.level);
 G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera();G.mode='match';
 G.match={mode:'turf',opts:{},playing:()=>true,canRespawn:()=>false};
 const paint=[],hits=[],frames=[];
 G.paint={sample:()=>0,splat(at,r,team,opts={}){paint.push([at.x,at.y,at.z,r,team,opts.seed]);return 0;}};
 G.projectiles=new combat.Projectiles(G.scene);
 const hit=G.projectiles.applyHit;G.projectiles.applyHit=function(a,b,n,id){hits.push([a.nid,b.nid,n,id]);return hit.apply(this,arguments);};
 const a=combat.make('shooter'),b=combat.make('shooter');a.nid='shooter';b.nid='target';b.team=1;
 a.pos.set(0,0,0);b.pos.set(0,0,3);a.character.root.position.copy(a.pos);b.character.root.position.copy(b.pos);
 a.aimPoint.set(0,1.05,3);const brain=new combat.BotBrain(a);
 for(let i=0;i<hz*2;i++){
  G.time+=1/hz;a.intent.fire=b.alive;
  const wet=brain._wet(0,1,0);a.update(1/hz);b.update(1/hz);G.projectiles.update(1/hz);
  frames.push([wet,a.hp,b.hp,a.ink,b.alive,G.projectiles.list.length,a.stats.splats,b.stats.deaths]);
 }
 return {hits,paint,frames};
}
for(const hz of [30,60,120])test(`real weapon-admission damage and paint commands retain the frozen native result at ${hz} Hz`,()=>{
 const before=damageReplay(CombatOldLevel,hz),after=damageReplay(combat.NativeLevel,hz);
 assert.ok(before.hits.length>=3,'the ordinary weapon must actually hit');
 assert.ok(before.frames.some(row=>row[4]===false),'the target must actually be splatted');
 assert.ok(before.paint.length>0,'real projectiles must actually issue paint commands');
 assert.deepEqual(after,before);
 const wallBefore=damageReplay(CombatOldLevel,hz,true),wallAfter=damageReplay(combat.NativeLevel,hz,true);
 assert.equal(wallBefore.hits.length,0,'native wall must block ordinary damage');
 assert.ok(wallBefore.frames.every(row=>row[4]),'the protected target must survive');
 assert.deepEqual(wallAfter,wallBefore);
});
