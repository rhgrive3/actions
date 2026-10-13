import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {nativeFixture,readStage} from './fixture.mjs';

const root=process.env.NATIVE_JUMP_FIXTURE_ASSETS,ready=!!root&&fs.existsSync(path.join(root,'wahoo','manifest.json'));
async function world(){
 const f=await nativeFixture({includeCharacter:true}),{G,THREE}=f,d=readStage(root,'wahoo');G.level=new f.NativeLevel(d);G.physics=new f.NativePhysics(G.level);G.camera=new THREE.PerspectiveCamera();G.match.mode='turf';G.match.opts={};f.setRandom(()=>.5);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
 const reset=()=>{G.paint=new Cpu(null,G.level,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();};
 const actor=(point,bot=false)=>{reset();const a=new f.Actor({team:1,slot:1,name:'original source jump',weapon:'shooter',isBot:bot,CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});G.actors=[a];a.spawnAt(new THREE.Vector3(...point),0);a.invuln=0;return a;};
 const tick=(a,dt)=>{G.time+=dt;a.bot?.update(dt);a.update(dt);G.projectiles.update(dt);G.paint.advanceSimulation(dt);};
 return {...f,d,actor,tick};
}
const from=[12.599296569824219,10.872639257757971,-24.185100555419922],to=[12.599296569824219,12.025199890136719,-23.185100555419922];

test('existing production small-hop release fails the original raised edge while held input lands, at three rates',{skip:!ready},async()=>{
 const f=await world(),{G,THREE}=f;
 for(const hz of [30,60,120])for(const held of [false,true]){
  const a=f.actor(from);for(let i=0;i<hz*.6;i++)f.tick(a,1/hz);assert(a.grounded);let arrived=false;
  for(let i=0;i<hz*2;i++){const dx=to[0]-a.pos.x,dz=to[2]-a.pos.z,d=Math.hypot(dx,dz);a.intent.move.set(dx/d*.35,0,dz/d*.35);a.intent.jump=held?i<hz*.2:i===0;f.tick(a,1/hz);if(a.grounded&&Math.hypot(a.pos.x-to[0],a.pos.z-to[2])<.18&&Math.abs(a.pos.y-to[1])<.16){arrived=true;break;}}
  assert.equal(arrived,held,'same source/gear/ordinary move; input hold is the only difference');assert(a.alive);assert.deepEqual(Object.keys(a.s3.abilityPoints),[]);
 }
 const h=G.physics.raycast(new THREE.Vector3(...to).add(new THREE.Vector3(0,.1,0)),new THREE.Vector3(0,-1,0),.3);assert(h.hit&&h.triangle>=0);
});

test('unmodified production BotBrain holds its admitted source jump and lands on the original next support',{skip:!ready},async()=>{
 const f=await world(),{G,THREE,d}=f;G.nav=new f.NavGraph(G.level,G.physics);
 const digest=()=>crypto.createHash('sha256').update(Buffer.from(d.triangles.buffer)).update(Buffer.from(d.flags.buffer)).update(Buffer.from(d.mask.buffer)).digest('hex'),before=digest();
 assert(!G.level.manifest.sourceNavigation);assert.equal(G.nav.edgeType(2230,2403),'jump');
 for(const hz of [30,60,120]){
  const a=f.actor(from,true);for(let i=0;i<hz*.6;i++)f.tick(a,1/hz);a.bot=new f.BotBrain(a,'normal');assert(a.bot._pathTo(new THREE.Vector3(...to),.6));assert.deepEqual(Array.from(a.bot.path),[2230,2403]);a.bot.goalTimer=a.bot.repath=a.bot.bombCd=1000;
  let arrived=false,heldFrames=0;for(let i=0;i<hz*4;i++){f.tick(a,1/hz);heldFrames+=a.intent.jump;if(a.grounded&&Math.hypot(a.pos.x-to[0],a.pos.z-to[2])<.18&&Math.abs(a.pos.y-to[1])<.16){arrived=true;break;}}
  assert(arrived,'normal input reaches real source support without recovery waiver');assert(heldFrames/hz>5/60);assert.equal(a.s3JumpSerial,1,'input hold does not create repeated jumps');assert(a.alive);assert.equal(a.bot.goal,2403);
 }
 assert.equal(digest(),before,'jump input cannot rewrite exact source geometry, NP flags or masks');
});

test('held ordinary input remains blocked by the original tall NoPaint glass wall at three rates',{skip:!ready},async()=>{
 const f=await world(),{G,THREE}=f,p=[40.05590057373047,10.919033898371708,-18.746300506591798],wallZ=-19.446300506591797;
 const h=G.physics.raycast(new THREE.Vector3(...p).add(new THREE.Vector3(0,1,0)),new THREE.Vector3(0,0,-1),2);assert(h.hit&&h.triangle>=0);assert.equal(G.level.triangleWorld.flags[h.triangle]&2,0,'actual obstructing source is NoPaint');
 for(const hz of [30,60,120]){
  const a=f.actor(p);for(let i=0;i<hz*.5;i++)f.tick(a,1/hz);let contacts=0,minSide=Infinity;const original=G.physics.collideBody;
  G.physics.collideBody=function(pos,radius,lift,height,c,...rest){const r=original.call(this,pos,radius,lift,height,c,...rest);if(pos===a.pos&&c.wall&&!G.level.blocks[c.wallBlock]?.paint)contacts++;return r;};
  for(let i=0;i<hz*2;i++){a.intent.move.set(0,0,-1);a.intent.jump=i<hz*.2;f.tick(a,1/hz);minSide=Math.min(minSide,a.pos.z-wallZ);}G.physics.collideBody=original;
  assert(contacts>0,'production capsule contacts the exact solid NP object');assert(minSide>.3,'no jump phase crosses the NoPaint wall');assert(a.alive&&a.grounded&&!a.climbing);
 }
});
