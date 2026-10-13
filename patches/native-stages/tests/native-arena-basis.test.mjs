import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {nativeArenaBasis,nativeSpawnYaw,nativeInitialLanding,nativeRetreatCoordinate} from '../runtime/native-spawn.mjs';
import {nativeFixture,readStage} from './fixture.mjs';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const ROOT=process.env.INKWAVE_NATIVE_STAGE_ASSETS,hasUrchin=ROOT&&fs.existsSync(path.join(ROOT,'urchin','manifest.json'));

test('inferred opposing-pad basis rotates native spawn yaw and retreat projection without touching legacy Z',()=>{
 const L={native:true,spawnPads:[[90,12,-20],[-90,12,20]]},b=nativeArenaBasis(L);assert(Math.abs(b.forward.x+180/Math.hypot(180,40))<1e-12);assert(Math.abs(b.forward.z-40/Math.hypot(180,40))<1e-12);assert(Math.abs(b.forward.x*b.lateral.x+b.forward.z*b.lateral.z)<1e-12);
 for(const team of [0,1]){const yaw=nativeSpawnYaw(L,team,team?Math.PI:0),sign=team?-1:1;assert(Math.abs(Math.sin(yaw)-b.forward.x*sign)<1e-12);assert(Math.abs(Math.cos(yaw)-b.forward.z*sign)<1e-12);assert.equal(nativeSpawnYaw({native:false},team,team?Math.PI:0),team?Math.PI:0);}
 assert.equal(nativeArenaBasis({native:false}),null);assert.throws(()=>nativeArenaBasis({native:true,spawnPads:[[0,0,0],[0,1,0]]}),/coincide/);
 assert.equal(nativeRetreatCoordinate({retreatZ:[-20,20]},[30,0,-10]),-10);assert.equal(nativeRetreatCoordinate({nativeRetreatAxis:[-1,0]},[30,0,-10]),-30);assert.equal(nativeRetreatCoordinate({nativeRetreatAxis:[2,0]},[30,0,-10]),-10);
});

test('native opening and death respawn use actual Urchin support and opposing-pad aim at 30/60/120 Hz for both teams',{skip:!hasUrchin},async()=>{
 const f=await nativeFixture(),{G,THREE}=f,L=new f.NativeLevel(readStage(ROOT,'urchin')),P=new f.NativePhysics(L);G.level=L;G.physics=P;
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.nav=new f.NavGraph(L,P);G.match.mode='turf';G.match.opts={};
 const basis=nativeArenaBasis(L),proof=[];
 for(const team of [0,1])for(const hz of [30,60,120])for(const opening of [true,false])for(const slot of [-1,0,1,2,3]){
  const a=f.make('shooter');a.team=team;a.slot=Math.max(0,slot);a.isBot=slot>=0;a._integrate=f.Actor.prototype._integrate;a.spawnAt(L.spawnPads[team],0);a.aimPoint.copy(L.spawnPads[team]);a.intent.move.set(0,0,0);a.intent.fire=false;
  if(opening)assert.equal(f.beginInitialSquidSpawn(a),true);else{a.alive=false;a.respawn();}
  const expected=nativeSpawnYaw(L,team,0);assert(Math.abs(a.yaw-expected)<1e-12);assert(Math.abs(a.aimYaw-expected)<1e-12);
  if(a.isBot){a.bot=new f.BotBrain(a,'normal');assert(Math.abs(a.bot.aimYaw-expected)<1e-12);}
  const target=a.s3.squidSpawn.target;assert(target);const pad=L.spawnPads[team],sign=team?-1:1;assert(((target.x-pad.x)*basis.forward.x+(target.z-pad.z)*basis.forward.z)*sign>0,'actual supported target lies toward opponent');
  a.intent.fire=true;a.update(1/hz);a.intent.fire=false;for(let i=0;i<Math.ceil(hz*1.5);i++){G.time+=1/hz;a.update(1/hz);}
  assert.equal(a.s3.squidSpawn,undefined);assert(a.alive&&a.grounded&&a.ground.hit,'actual source launch lands '+team+' '+hz+' '+opening);proof.push({team,hz,opening,slot,yaw:expected,grounded:a.grounded});
 }
 // Fallback candidates also use longitudinal/cross-axis selection and real source resolution.
 for(const team of [0,1]){const a=f.make('shooter');a.team=team;const p=nativeInitialLanding(G,a,(x,z)=>{const y=L.groundHeight(x,z);return Number.isFinite(y)&&P.bodyFits(new THREE.Vector3(x,y+.01,z),f.PLAYER.radius,.3,f.PLAYER.height)?{x,y,z}:null;});assert(p);const pad=L.spawnPads[team],sign=team?-1:1;assert(((p.x-pad.x)*basis.forward.x+(p.z-pad.z)*basis.forward.z)*sign>=0);}
 console.log(JSON.stringify({nativeOrientationLaunches:proof}));
});

test('ordinary Tidewater opening and death respawn retain team Z aim and ground landing',{skip:false},async()=>{
 const f=await fixture({fullRuntime:true,adaptNative:adaptBuildSource,adaptRuntime:adaptBuildSource,extraExports:"export {TIDEWATER} from './inkwave-public/src/world/maps.js';"}),{G}=f,L=new f.Level(f.TIDEWATER);G.level=L;G.physics=new f.Physics(L);G.match.mode='turf';G.match.opts={};
 for(const team of [0,1])for(const opening of [true,false]){const a=f.make('shooter');a.team=team;a._integrate=f.Actor.prototype._integrate;a.spawnAt(L.spawnPads[team],0);a.aimPoint.copy(L.spawnPads[team]);a.intent.fire=false;if(opening)assert(f.beginInitialSquidSpawn(a));else{a.alive=false;a.respawn();}assert.equal(a.yaw,team?Math.PI:0);assert.equal(a.aimYaw,team?Math.PI:0);a.intent.fire=true;a.update(1/60);a.intent.fire=false;for(let i=0;i<90;i++){G.time+=1/60;a.update(1/60);}assert.equal(a.s3.squidSpawn,undefined);assert(a.alive&&a.grounded);}
});
