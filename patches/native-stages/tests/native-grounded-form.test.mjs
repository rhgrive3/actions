import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {nativeFixture,readStage} from './fixture.mjs';
import {TIDEWATER} from '../../../inkwave-public/src/world/maps.js';

test('legacy swimming input and physical state stay with the existing controller',async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G}=f;
 G.level=new f.Level(TIDEWATER);G.physics=new f.Physics(G.level);G.nav=new f.NavGraph(G.level,G.physics);
 const a=new f.Actor({team:0,name:'legacy form guard',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
 a.spawnAt(G.level.spawnPads[0],0);const b=a.bot=new f.BotBrain(a,'normal');
 a.intent.squid=true;a.intent.move.set(.8,0,.2);
 const before={position:Array.from(a.pos.toArray()),velocity:Array.from(a.vel.toArray()),move:Array.from(a.intent.move.toArray()),ink:a.ink};
 assert.equal(f.nativeSourceGroundedForm(b,G),false);
 assert.equal(a.intent.squid,true);assert.deepEqual(Array.from(a.intent.move.toArray()),before.move);
 assert.deepEqual(Array.from(a.pos.toArray()),before.position);assert.deepEqual(Array.from(a.vel.toArray()),before.velocity);assert.equal(a.ink,before.ink);
});

const root=process.env.NATIVE_GROUNDED_FORM_ASSETS,ready=root&&fs.existsSync(path.join(root,'bluefin','manifest.json'));
test('original slope frame rejects wide swim motion and admits ordinary human input without changing source', {skip:!ready},async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE,PLAYER}=f,d=readStage(root,'bluefin'),L=G.level=new f.NativeLevel(d),P=G.physics=new f.NativePhysics(L),N=G.nav=new f.NavGraph(L,P);
 const digest=()=>crypto.createHash('sha256').update(Buffer.from(d.triangles.buffer)).update(Buffer.from(d.flags.buffer)).update(Buffer.from(d.mask.buffer)).digest('hex'),beforeDigest=digest();
 const from=new THREE.Vector3(-19.238425606074273,3.242939895330204,-9.822992963660472),goal=N.nodes[4817],clearance=f.nativeDropClearance(L);
 assert(N.nodes[4878].nb.some(e=>e.to===goal.id&&e.type==='walk'));
 const a=new f.Actor({team:1,name:'actual source form guard',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
 a.spawnAt(from,0);G.actors=[a];
 // This is the retained actual grounded contact, installed through the real
 // source foot probe rather than a fabricated collision surface.
 P.groundProbe(a.pos.x,a.pos.y,a.pos.z,PLAYER.stepUp,PLAYER.stepDown,PLAYER.footRadius,a.ground,false);
 assert(a.ground.hit&&a.ground.block<L.staticBlockCount&&a.ground.normal.y>.68&&Math.abs(a.ground.y-a.pos.y)<.16);
 a.grounded=true;const b=a.bot=new f.BotBrain(a,'normal');b.path=[4878,4817,4755];b.pi=1;
 a.intent.move.set(-.7473839690478782,0,-.6643923560567137);a.intent.squid=true;
 const end=new THREE.Vector3(-19.468021961368496,3,-10.027094295443508),sqRadius=PLAYER.s3SwimTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale,kidRadius=PLAYER.s3HumanoidTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale;
 assert.equal(clearance.clear(a.pos,new THREE.Vector3(goal.x,goal.y,goal.z),sqRadius,PLAYER.squidBodyLift,PLAYER.squidHeight,true),true,'straight interpolation floats over the genuine supported contour');
 assert.equal(clearance.clear(a.pos,end,sqRadius,PLAYER.squidBodyLift,PLAYER.squidHeight,true),false);
 assert.equal(clearance.clear(a.pos,end,kidRadius,PLAYER.stepUp,PLAYER.height,false),true);
 const position=Array.from(a.pos.toArray()),velocity=Array.from(a.vel.toArray()),move=Array.from(a.intent.move.toArray()),ink=a.ink;
 assert.equal(f.nativeSourceGroundedForm(b,G),true);assert.equal(a.intent.squid,false);
 assert.deepEqual(Array.from(a.pos.toArray()),position);assert.deepEqual(Array.from(a.vel.toArray()),velocity);assert.deepEqual(Array.from(a.intent.move.toArray()),move);assert.equal(a.ink,ink);
 for(const [field,value]of [['grounded',false],['climbing',true],['specialActive',true],['superJumpState',{}]]){
  const previous=a[field];a[field]=value;a.intent.squid=true;assert.equal(f.nativeSourceGroundedForm(b,G),false);assert.equal(a.intent.squid,true);a[field]=previous;
 }
 a.intent.jump=true;a.intent.squid=true;assert.equal(f.nativeSourceGroundedForm(b,G),false);assert.equal(a.intent.squid,true);a.intent.jump=false;
 b.target={alive:true,team:0};assert.equal(f.nativeSourceGroundedForm(b,G),false);assert.equal(a.intent.squid,true);b.target=null;
 b._nativeTowerBoarding={phase:'hop'};assert.equal(f.nativeSourceGroundedForm(b,G),false);assert.equal(a.intent.squid,true);b._nativeTowerBoarding=null;
 b.path=[4151,4479];b.pi=1;assert.equal(N.nodes[4151].nb.find(e=>e.to===4479)?.type,'drop');assert.equal(f.nativeSourceGroundedForm(b,G),false);assert.equal(a.intent.squid,true);
 assert.equal(digest(),beforeDigest);assert.deepEqual(Object.keys(a.s3.abilityPoints),[]);
 console.log(JSON.stringify({sourceGroundedForm:{sourceSha256:L.manifest.sourceSha256,sourceNodes:[4878,4817,4755],sourceUnchanged:true,squidBlocked:true,kidClear:true,inputOnly:true,scope:'Actual source capsule and input API guard; initial grounded contact uses real source probe. Guard setups are contract checks, not physical traversal or whole-bank qualification.'}}));
});
