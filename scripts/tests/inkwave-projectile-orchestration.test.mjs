import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import assert from 'node:assert/strict';import * as T from '../../inkwave-public/vendor/three/build/three.module.js';
import {probeProjectileVisibility} from '../lib/inkwave-projectile-visibility-probe.mjs';
class Hit{constructor(){this.hit=false;this.dist=0;this.point=new T.Vector3();this.normal=new T.Vector3(0,1,0);this.block=0;this.face=-1;}}
const results=[];
for(const mode of ['blocked','post-rig-clear','case-error','held-fire-error']){
 const entryFire=mode==='held-fire-error';let fired=entryFire,frames=0,renders=0,thrown=false;
 const a={pos:new T.Vector3(1,2,3),aimDir:new T.Vector3(0,0,1),aimPoint:new T.Vector3(1,3,20),intent:{fire:false},alive:true,form:'kid',weaponRunner:{reset(){},cooldown:0},setWeapon(w){if(mode.endsWith('error')&&!thrown){thrown=true;throw Error('controlled first case failure');}this.weapon=w;}};
 const rig={yaw:0,pitch:0};
 const system={list:[],blobs:{count:0},clear(){this.list=[];},_step(){return false;},_draw(){},_muzzle(a,out){return out.copy(a.pos).addScaledVector(a.aimDir,.4).add({x:0,y:1,z:0});},_aimFrom(a,m,out){return out.copy(a.aimDir);},inkFlight:{worldHit:new Hit(),world(from,to,r,h){h.hit=!(mode==='post-rig-clear'&&Math.abs(rig.yaw-Math.PI/2)<1e-8);h.dist=h.hit?0:from.distanceTo(to);h.point.copy(from);return h;}}};
 const originalStep=system._step,originalWorld=system.inkFlight.world;
 const G={local:a,projectiles:system,camera:new T.PerspectiveCamera(),level:{blocks:[{nativeObject:7,center:new T.Vector3(),half:new T.Vector3(10,10,10)}]},fx:{clear(){},inkVolumes:{metrics:{active:0},assets:new Map()}},time:0};
 const g=G.game={rig,match:{state:'playing',paused:false},frozen:false,_skipRender:false,input:{mouse:{left:entryFire}},debug:{freeze(){g.frozen=true;},freezeBots(){},fire(on){fired=on;g.input.mouse.left=on;}},R:{render(){renders++;}},_frame(dt){frames++;G.time+=dt;a.intent.fire=fired;a.aimDir.set(Math.sin(rig.yaw)*Math.cos(rig.pitch),Math.sin(rig.pitch),Math.cos(rig.yaw)*Math.cos(rig.pitch));}};
 globalThis.NG=G;
 const page={evaluate:async(fn,arg)=>fn(arg),screenshot:async()=>{}};
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-combined-orchestration-'));let report;try{report=await probeProjectileVisibility(page,out);}finally{fs.rmSync(out,{recursive:true,force:true});}
 assert.equal(report.visibilityEstablished,false,'no manufactured native rounds cannot establish visibility');
 assert.equal(report.cases.length,6,'all weapon/scenario cases are attempted');
 const controls=report.cases.filter(c=>c.scenario==='clear-lane');
 if(mode==='post-rig-clear')for(const c of controls){assert.equal(c.selectedLane.requestedYaw,Math.PI/2);assert.equal(c.selectedLane.rigYaw,Math.PI/2);assert.equal(c.selectedLane.hit,false);assert.equal(c.clearLaneVerified,true);assert.equal(c.laneSearch.length,5);}
 else for(const c of controls){assert.equal(c.selectedLane,null);assert.equal(c.clearanceFailure,'no-clear-native-muzzle-lane');assert.equal(c.laneSearch.length,48);assert.equal(c.laneSearch[0].nativeObject,7);}
 if(mode.endsWith('error'))assert.equal(report.cases[0].status,'failed-diagnostic-case');
 assert.equal(system._step,originalStep);assert.equal(system.inkFlight.world,originalWorld);assert.equal(rig.yaw,0);assert.equal(rig.pitch,0);assert.equal(fired,entryFire);assert.equal(g.input.mouse.left,entryFire);assert.equal(g.frozen,false);assert.equal(g._skipRender,false);assert.equal(globalThis.__projectileCaseRestore,undefined);
 assert.ok(renders>0,'no-live capture requests a fresh composer render');
 results.push({mode,cases:report.cases.length,failures:report.failures.length,frames,renders,visibilityEstablished:report.visibilityEstablished,restored:true});delete globalThis.NG;
}
console.log(JSON.stringify({scope:'Diagnostic orchestration/selection controls with a mock native API and actual Three vectors, not actual gameplay/terrain/GPU validation.',results},null,2));
