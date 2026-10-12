/** Identical emitted-source probes for before/after. No mock replacement camera,
 * renderer, reticle or projectile solver. Display/audio/character mesh are absent.
 * Usage: INKWAVE_BUILT_SITE=/absolute/site node --experimental-vm-modules
 *   scripts/measure-camera-aim-controls.mjs /path/to/result.json
 */
import fs from 'node:fs';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { fixture } from '../patches/splatoon3/tests/source-fixture.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
const {G,THREE}=f,V=(...args)=>new THREE.Vector3(...args),a=f.make('shooter');
G.settings={aimAssist:0,sensitivity:1,padSensitivity:0,gyro:false};
G.physics.cameraProbe=(_o,_d,w,_r,out)=>Object.assign(out,{hard:w,soft:w,floor:false});
const cam=G.camera=new THREE.PerspectiveCamera(55,16/9,.15,1000),rig=G.rig=new f.CameraRig(cam);
rig.follow(a,true);rig._prevMode='follow';rig.pitch=0;rig.update(1/60);
const input={lastDevice:'kbm',mouse:{dx:0,dy:0},pressed:new Set(),padPressed:new Set(),_padEpoch:0,
 down:()=>false,wasPressed:()=>false,padButton:()=>false,padValue:()=>0,padAxis:()=>0,
 padStick:(_x,_y,out)=>Object.assign(out,{x:0,y:0,mag:0})};
const controller=new f.PlayerController(a,rig,input);
const result={baselineCommit:'f2c870859d637fccba88031c3786ecec4d95248d',site:process.env.INKWAVE_BUILT_SITE,
 measuredAt:new Date().toISOString(),build:process.env.INKWAVE_BUILT_SITE ? JSON.parse(fs.readFileSync(process.env.INKWAVE_BUILT_SITE+'/inkwave-build.json','utf8')).contentHash : null,environment:{node:process.version,platform:process.platform,cpu:os.cpus()[0]?.model},
 conditions:{referenceAspect:'16:9',normalFovDegrees:55,controllerFilterRatePerSecond:60,
 note:'CPU-only actual emitted modules; no GPU, physical input hardware, retail execution or end-to-end latency claim.'},measurements:{}};
const m=result.measurements;
function follow(actor){rig.follow(actor,true);rig._prevMode='follow';rig.pitch=0;rig.yaw=0;rig.update(1/60);}
m.scope=[];
for(const id of ['charger','splatling','s3-charger-longscope','s3-charger-normalscope']){
 const actor=f.make(id);actor.weaponRunner.charging=true;actor.weaponRunner.charge=1;follow(actor);
 for(let i=0;i<300;i++)rig.update(1/60);
 m.scope.push({id,fovDegrees:cam.fov,zoom:rig.zoom,sourceScope:actor.weapon.catalogRecord?.parameters?.WeaponScopeParam??null});
}
follow(a);m.boom=[];
for(const hard of [2,.1,0]){
 G.physics.cameraProbe=(_o,_d,_w,_r,out)=>Object.assign(out,{hard,soft:hard,floor:false});rig.boom.reset(4.5);rig._inkwaveCameraProbeCache=null;
 rig.update(1/60);m.boom.push({hardMeters:hard,boomMeters:rig.curDist,penetrationMeters:Math.max(0,rig.curDist-hard)});
}
G.physics.cameraProbe=(_o,_d,w,_r,out)=>Object.assign(out,{hard:w,soft:w,floor:false});follow(a);
const baseRaycast=G.physics.raycast;let ray=V();
G.physics.raycast=(o,d,l,h,...rest)=>{if(l===70)ray.copy(d);return baseRaycast(o,d,l,h,...rest);};
rig.yaw=Math.PI/2;a.aimDir.set(1,0,0);controller.computeAim(true);
m.sameTickAim={requestedYawDegrees:90,actualYawDegrees:Math.atan2(ray.x,ray.z)*180/Math.PI,errorDegrees:Math.acos(Math.max(-1,Math.min(1,ray.dot(a.aimDir))))*180/Math.PI};
G.physics.raycast=baseRaycast;
m.input=[];
for(const hz of [30,60,120]){
 follow(a);controller.padLook.x=controller.padLook.y=0;
 input.lastDevice='pad';input.pad={connected:true,mapping:'standard',index:0};
 input.padStick=(x,_y,out)=>Object.assign(out,x===2?{x:1,y:0,mag:1}:{x:0,y:0,mag:0});
 for(let i=0;i<hz;i++)controller.update(1/hz);
 m.input.push({hz,yawRadians:rig.yaw,yawDegrees:rig.yaw*180/Math.PI});
}
m.inputSpreadDegrees=Math.max(...m.input.map(x=>x.yawDegrees))-Math.min(...m.input.map(x=>x.yawDegrees));
input.lastDevice='kbm';input.pad=null;input.padStick=(_x,_y,out)=>Object.assign(out,{x:0,y:0,mag:0});follow(a);
m.renderCadence=[];
for(const hz of [30,60,120]){
 follow(a);let fixed=0,maxError=0;const clock=new f.FixedClock();
 G.physics.raycast=(o,d,l,h,...rest)=>{if(l===70)ray.copy(d);return baseRaycast(o,d,l,h,...rest);};
 for(let render=0;render<hz;render++){
  clock.advance(1/hz,()=>{fixed++;rig.yaw+=Math.PI/120;a.aimDir.set(Math.sin(rig.yaw),0,Math.cos(rig.yaw));controller.computeAim(true);
   maxError=Math.max(maxError,Math.acos(Math.max(-1,Math.min(1,ray.dot(a.aimDir))))*180/Math.PI);});
  rig.update(1/hz);
 }
 m.renderCadence.push({hz,fixedTicks:fixed,maxAimAngularErrorDegrees:maxError});
}
G.physics.raycast=baseRaycast;follow(a);a.aimDir.set(0,0,1);
const muzzle=V(.3,1.05,.3),target=V(0,1.05,1),aim=G.projectiles._aimFrom(a,muzzle,V(),target),expected=target.clone().sub(muzzle).normalize();
m.closeAim={muzzleMeters:muzzle.toArray(),targetMeters:target.toArray(),direction:aim.toArray(),angularErrorDegrees:Math.acos(Math.max(-1,Math.min(1,aim.dot(expected))))*180/Math.PI};
m.projection=[];
for(const aspect of [16/9,4/3,21/9,9/16]){
 cam.aspect=aspect;let diff=0;
 for(let i=0;i<120;i++){rig.fovKick=.009-i*.00005;rig.update(1/120);
  diff=Math.max(diff,...cam.projectionMatrix.elements.map((x,k)=>Math.abs(x-rig.gameCam.projectionMatrix.elements[k])));}
 m.projection.push({aspect,maxProjectionElementError:diff});
}
// CPU cost includes production cameraProbe and final sweep against real Physics.
// Deliberately query all 25 nearby boxes for a reproducible conservative broadphase;
// this is NOT a measured production-level query distribution or GPU frame time.
cam.aspect=16/9;const blocks=[];
for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)blocks.push({id:blocks.length,solid:true,grate:false,
 center:V(x*4,-1,z*4),half:V(1.5,1,1.5),axes:[V(1,0,0),V(0,1,0),V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]});
const level={blocks,faces:[],groundHeight:()=>0,queryBlocks(_a,_b,_c,_d,out){out.length=0;for(let i=0;i<blocks.length;i++)out.push(i);return out;}};
G.level=level;G.physics=new f.Physics(level);follow(a);
for(let i=0;i<1000;i++){rig.yaw+=.0001;rig.update(1/60);}
const costs=[];
for(let repeat=0;repeat<25;repeat++){const t=performance.now();for(let i=0;i<400;i++){rig.yaw+=.0001;rig.update(1/60);}costs.push((performance.now()-t)/400);}
costs.sort((x,y)=>x-y);m.cameraCpu={unit:'ms/update',warmup:1000,groups:25,updatesPerGroup:400,
 median:costs[12],p95:costs[23],min:costs[0],max:costs.at(-1),groupMeans:costs,
 note:'Node CPU-only; full camera update, 25-box all-candidates fixture. Not device frame rate or end-to-end input latency.'};
// Include the simulation-aim refresh as well; five additional rays can run on
// a changed optical origin. Measure this, rather than hiding it in camera-only cost.
const combined=[];
for(let i=0;i<500;i++){rig.update(1/60);rig.yaw+=.0001;controller.computeAim(true);}
for(let group=0;group<15;group++){const start=performance.now();for(let i=0;i<200;i++){
 rig.update(1/60);rig.yaw+=.0001;controller.computeAim(true);
}combined.push((performance.now()-start)/200);}
combined.sort((x,y)=>x-y);m.cameraAndAimCpu={unit:'ms/update',warmup:500,groups:15,updatesPerGroup:200,
 median:combined[7],p95:combined[14],groupMeans:combined,
 note:'Same 25-box CPU fixture; camera update plus a same-tick changed aim direction. No GPU or transport.'};
const out=process.argv[2];if(!out)throw Error('Output JSON path required');fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
