import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {execFileSync}from'node:child_process';
import{sourceLoadedActorFixture}from'../../patches/splatoon3/tests/source-loaded-actor-fixture.mjs';
import{buildSourceBVH}from'../../patches/native-stages/runtime/source-convert.mjs';
const f=await sourceLoadedActorFixture({random:()=>.5,extraExports:"export {installQuality}from './patches/local-quality/install.mjs'; export {NativeLevel}from './patches/native-stages/runtime/native-level.mjs';export {NativePhysics}from './patches/native-stages/runtime/native-physics.mjs';"});
f.installQuality(f.profile);const{G,THREE}=f;G.mode='match';G.match={state:'playing',attract:false,opts:{range:false},playing:()=>true};G.renderer={info:{render:{frame:100}},getRenderTarget:()=>null,getPixelRatio:()=>1,getSize:t=>{t.x=1280;t.y=720;return t;}};G.camera=new THREE.PerspectiveCamera(60,16/9,.15,6500);G.camera.position.set(0,1.5,8);G.camera.lookAt(0,1.5,100);G.camera.updateMatrixWorld(true);
const triangles=new Float32Array([-10,0,-10,-10,0,10,10,0,-10,10,0,-10,-10,0,10,10,0,10]);const data={triangles,...buildSourceBVH(triangles),normals:new Float32Array([0,1,0,0,1,0]),flags:new Uint32Array([3,3]),objectIds:new Uint32Array([0,0]),triangleFace:new Int32Array([0,0]),mask:new Uint8Array(),manifest:{id:'audit845-native-floor',bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10},spawnPads:[[-9,0,-9],[9,0,9]],spawnBarrier:0,objects:[{collidable:true,bounds:[[-10,-.2,-10],[10,0,10]]}],faces:[{n:[0,1,0],u:[1,0,0],v:[0,0,1],origin:[-10,0,-10],su:20,sv:20,triangles:[0,1],bounds:[[-10,0,-10],[10,0,10]]}]}};G.level=new f.NativeLevel(data);G.physics=new f.NativePhysics(G.level);
const output={sourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,scope:'CPU-only source-composed Character, actual loaded Player00 bank, NativePhysics flat triangle floor; no browser, full match, or hardware claim',rounds:[],setup:{dt:1/60,warmup:240,ticksPerRound:120}};
const actors=[];
for(let k=0;k<3;k++){const a=await f.make();a.isLocal=false;a.isBot=true;a.character.isLocal=false;a.character.setLod(null);a.vel.set(0,0,2.4);actors.push(a);}
const [a,b,c]=actors, names=['controlA','budget','controlB'];
for(let i=0;i<240;i++){G.renderer.info.render.frame++;G.time+=1/60;for(const x of actors){x.character._camFrame=G.renderer.info.render.frame;x._finishFrame(1/60);}}
const counts=actors.map(x=>{const out={ground:0,pose:0,apply:0,rootHair:0,accessories:0};const ch=x.character;for(const [obj,key,label] of [[ch,'_ground','ground'],[ch,'_buildPose','pose'],[ch,'_applyPose','apply'],[ch.sourceMotion.rootHair,'update','rootHair'],[ch.sourceMotion,'applyAccessories','accessories']]){const fn=obj[key];obj[key]=function(...args){out[label]++;return fn.apply(this,args);};}return out;});
let maxMuzzleDifference=0;const temp=new THREE.Vector3(),other=new THREE.Vector3();G.renderer.info.render.frame+=40;
for(let round=0;round<18;round++){
 const order=[[0,1,2],[2,1,0],[1,0,2],[2,0,1],[0,2,1],[1,2,0]][round%6];
 const roundTime=G.time, roundFrame=G.renderer.info.render.frame;
 const sample={round,order:order.map(i=>names[i]),cpuUs:{},wallMs:{},counts:{},budgetTicks:0,maxMuzzleDifference:0};
 for(const idx of order){const actor=actors[idx], ch=actor.character, before={...counts[idx]}, budgetBefore=ch._oobBudgetTicks, cpu=process.cpuUsage(),time=performance.now();
  G.time=roundTime;G.renderer.info.render.frame=roundFrame;
  for(let j=0;j<120;j++){G.renderer.info.render.frame++;G.time+=1/60;if(idx!==1)ch._camFrame=G.renderer.info.render.frame;actor._finishFrame(1/60);}
  sample.wallMs[names[idx]]=performance.now()-time;const elapsed=process.cpuUsage(cpu);sample.cpuUs[names[idx]]=elapsed.user+elapsed.system;
  sample.counts[names[idx]]=Object.fromEntries(Object.keys(before).map(k=>[k,counts[idx][k]-before[k]]));if(idx===1)sample.budgetTicks=ch._oobBudgetTicks-budgetBefore;
 }
 for(let i=1;i<3;i++){const d=a.character.getMuzzle(temp).distanceTo(actors[i].character.getMuzzle(other));sample.maxMuzzleDifference=Math.max(sample.maxMuzzleDifference,d);maxMuzzleDifference=Math.max(maxMuzzleDifference,d);}
 output.rounds.push(sample);
}
output.maxMuzzleDifference=maxMuzzleDifference;output.sourceActive=actors.map(x=>x.character.sourceMotion.active);output.grounded=actors.map(x=>x.character.sourceMotion.grounded);output.files=Object.fromEntries(['patches/local-quality/offline-offscreen-budget.mjs','patches/local-quality/adapter.mjs','patches/local-quality/install.mjs','patches/splatoon3/tests/source-loaded-actor-fixture.mjs'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
for(const actor of actors){G.scene.remove(actor.character.root);actor.character.dispose();}G.actors=[];
fs.writeFileSync('.ci-scratch/continuation-browser/845-timing-result.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
