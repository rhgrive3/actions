import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {nativeFixture,readStage} from './fixture.mjs';
import {TIDEWATER} from '../../../inkwave-public/src/world/maps.js';

const root=process.env.NATIVE_WAHOO_SEARCH_ASSETS;
const sourceReady=!!root&&fs.existsSync(path.join(root,'wahoo','manifest.json'));
function paint(f,L){class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}return new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});}
function actor(f,p){const {G}=f,a=new f.Actor({team:0,slot:0,name:'source search',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.isBot=true;a.spawnAt(p,Math.PI/2);G.actors=[a];a.bot=new f.BotBrain(a,'normal');return a;}

test('ordinary Wahoo source search finds the exact route rejected by 6000 without enabling traversal flags',{skip:!sourceReady},async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE}=f,d=readStage(root,'wahoo');
 const L=G.level=new f.NativeLevel(d);G.physics=new f.NativePhysics(L);G.paint=paint(f,L);G.nav=new f.NavGraph(L,G.physics);G.camera=new THREE.PerspectiveCamera();G.match.mode='turf';G.match.opts={};f.setRandom(()=>.5);
 assert.equal(L.native,true);assert.ok(!L.manifest.sourceNavigation?.wallClimb&&!L.manifest.sourceNavigation?.highDrops&&!L.manifest.sourceNavigation?.wallSurge);
 assert.equal(L.manifest.sourceSha256,'0d9fc1e01e59c34301d65e8d2a8bf2aa90e0f4920f63daf4ac567df0c4ba33db');
 assert.deepEqual(Array.from(L.spawnPads[0].toArray()),[-85,18,0]);
 const digest=()=>crypto.createHash('sha256').update(Buffer.from(d.triangles.buffer)).update(Buffer.from(d.flags.buffer)).update(Buffer.from(d.mask.buffer)).digest('hex'),before=digest();
 const goal=new THREE.Vector3(-0.40070343017578125,13,-5.185100555419922),hit=G.physics.raycast(goal.clone().setY(goal.y+.1),new THREE.Vector3(0,-1,0),.3);assert.ok(hit.hit&&Math.abs(hit.point.y-goal.y)<.001);
 const cases=[];
 for(const hz of [30,60,120]){
  const a=actor(f,L.spawnPads[0]);
  for(let i=0;i<hz;i++){G.time+=1/hz;a.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);}
  assert.ok(a.alive&&a.grounded);assert.deepEqual(Object.keys(a.s3.abilityPoints),[]);
  const start=G.nav.nearest(a.pos,1.2),end=G.nav.nearest(goal,.6),oldAt=performance.now();
  assert.equal(G.nav.path(start,end,a.team,6000),null,'the original finite search budget genuinely rejects this source route');const oldMilliseconds=performance.now()-oldAt;
  const original=G.nav.path,bounds=[];G.nav.path=function(...args){bounds.push(args[3]);return original.apply(this,args);};
  const position=Array.from(a.pos.toArray()),velocity=Array.from(a.vel.toArray()),searchAt=performance.now();
  assert.equal(a.bot._pathTo(goal,.6),true,'unmodified installed BotBrain selects the actual source route');const searchMilliseconds=performance.now()-searchAt;
  assert.equal(a.bot.path.length,118);assert.equal(bounds.at(-1),Math.max(6000,G.nav.nodes.length*4));
  assert.equal(a.bot.path[0],start);assert.equal(a.bot.path.at(-1),end);
  assert.deepEqual(Array.from(a.pos.toArray()),position);assert.deepEqual(Array.from(a.vel.toArray()),velocity);
  assert.equal(a.bot._pathTo(L.spawnPads[1],.6),false,'larger finite budget still rejects the forbidden opposing spawn');assert.equal(a.bot.path,null);
  G.nav.path=original;
  cases.push({hz,sourcePad:position,sourceGoal:Array.from(goal.toArray()),start,end,routeNodes:118,sourceNodes:G.nav.nodes.length,validNodes:G.nav.validIds.length,searchBound:bounds[0],oldBudget:6000,oldMilliseconds,searchMilliseconds,enemySpawnRejected:true,productionActor:true,productionCharacter:true,ordinaryTraversalFlagsOff:true,gearAP:0});
 }
 assert.equal(digest(),before,'original collision, NP roles and polygon masks remain untouched');
 console.log(JSON.stringify({id:'wahoo',cases,sourceBuffersUnchanged:true,scope:'CPU production Actor/Character/BotBrain, naturally grounded original pad, route selection only; no later position/velocity/route/ink injection; optional source-animation bank unavailable in VM, actual browser movement checked separately'}));
});

test('real Tidewater blockout retains its default bounded routes and target selection',async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE}=f,L=G.level=new f.Level(TIDEWATER);G.physics=new f.Physics(L);G.paint=paint(f,L);G.nav=new f.NavGraph(L,G.physics);G.camera=new THREE.PerspectiveCamera();G.match.mode='turf';G.match.opts={};
 const a=actor(f,L.spawnPads[0]),target=G.nav.validIds.map(id=>G.nav.nodes[id]).filter(n=>n.zone<0).sort((a,b)=>a.x*a.x+a.z*a.z-b.x*b.x-b.z*b.z)[0],goal=new THREE.Vector3(target.x,target.y,target.z);
 const start=G.nav.nearest(a.pos,1.2),end=G.nav.nearest(goal,.6),expected=G.nav.path(start,end,0,6000);assert.ok(expected);assert.ok(!L.native);
 const original=G.nav.path,calls=[];G.nav.path=function(...args){calls.push(args[3]);return original.apply(this,args);};
 assert.equal(a.bot._pathTo(goal,.6),true);assert.deepEqual(Array.from(a.bot.path),Array.from(expected));assert.equal(calls.at(-1),undefined,'legacy default parameter remains unchanged');
 const opposingEnd=G.nav.nearest(L.spawnPads[1],.6),opposingDefault=original.call(G.nav,start,opposingEnd,0,6000);
 assert.equal(a.bot._pathTo(L.spawnPads[1],.6),!!opposingDefault);assert.equal(calls.at(-1),undefined);
 if(opposingDefault)assert.deepEqual(Array.from(a.bot.path),Array.from(opposingDefault));else assert.equal(a.bot.path,null);
 G.nav.path=original;
});
