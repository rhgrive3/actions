import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/idle-followup-baseline-c0938a3f.json',import.meta.url)));
async function boot(baseline){return fixture({fullRuntime:true,productionComposition:true,adaptRuntime:(rel,source)=>baseline&&frozen.files[rel]?frozen.files[rel]:adaptBuildSource(rel,source),extraExports:`
 export {Match} from './inkwave-public/src/game/match.js';
 export {coherentMotionStart,actorMotionTick} from './patches/splatoon3/runtime/actor-motion.mjs';
`});}
const pair=await Promise.all([boot(true),boot(false)]);
function scenario(f,{hz=60,seconds=1,online=false,attract=false,boss=false}={}){
 const {G,THREE}=f;G.actors=[];G.time=0;G.settings={quality:'low',aimAssist:0,sensitivity:1,padSensitivity:1};G.netm=online?{}:null;
 const count={snapshots:0,aim:0,rays:0,controller:0,updates:0,projectiles:0,paint:0,endFrame:0,poll:0,menus:0,net:0,gyro:0,bossRay:0},actors=Array.from({length:8},()=>f.make('shooter')),a=actors[0];
 actors.forEach((actor,i)=>{actor.nid=String(i);actor.team=i%2;actor.s3Motion=new Proxy({},{set(target,key,value){count.snapshots++;target[key]=value;return true}})});
 // A test-only empty Physics scene has no Level or segment collider; preserve the real no-hit contract.
 G.physics.segment=(_from,_to,out)=>{out.hit=false;return out;};
 G.physics.cameraProbe=(_o,_d,want,_r,out)=>Object.assign(out,{hard:want,soft:want,floor:false});
 const raycast=G.physics.raycast;G.physics.raycast=(...args)=>{if(args[2]===70)count.rays++;return raycast(...args)};
 const cam=new THREE.PerspectiveCamera(55,16/9,.15,1000),rig=G.rig=new f.CameraRig(cam);G.camera=cam;rig.follow(a,true);rig._prevMode='follow';rig.pitch=0;rig.update(1/60);
 G.boss=boss?{rayDist(){count.bossRay++;return 0}}:null;
 const keys=new Set(),input={lastDevice:'kbm',mouse:{dx:0,dy:0,left:false,right:false},pressed:new Set(),padPressed:new Set(),_padEpoch:0,
  mobile:{lookDX:0,lookDY:0,gyro:{enabled:false,discard(){count.gyro++}}},down:k=>keys.has(k),wasPressed:k=>input.pressed.has(k),padButton:()=>false,padValue:()=>0,padAxis:()=>0,padStick:(_x,_y,out)=>Object.assign(out,{x:0,y:0,mag:0}),
  pollPad(){count.poll++;this.padPressed.clear()},endFrame(){count.endFrame++;this.mouse.dx=this.mouse.dy=0;this.pressed.clear()}};
 const controller=new f.PlayerController(a,rig,input),aim=controller.computeAim;controller.computeAim=function(...args){count.aim++;return aim.apply(this,args)};
 let seed=119,draws=0;f.setRandom(()=>{draws++;return((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)});
 const match={paused:false,attract,state:'playing',time:180,mode:'turf',local:a,actors,controller,bossMode:boss?{}:null,playing(){return this.state==='playing'&&!this.paused},
  updateController(dt){count.controller++;return f.Match.prototype.updateController.call(this,dt)},
  update(dt){count.updates++;if(this.paused)return;this.time-=dt;for(const actor of actors){actor.pos.x+=actor.intent.move.x*dt;actor.pos.z+=actor.intent.move.z*dt;}f.VM_MATH.random();}};
 G.match=match;G.paint={sample:()=>1,splat:()=>0,useFixedPaintClock(){},advanceSimulation(){count.paint++}};G.projectiles=new f.Projectiles({add(){},remove(){}});G.projectiles.update=()=>count.projectiles++;G.net={update(){count.net++}};
 const game={input,match,rig,menus:{current:null},_padMenus(){count.menus++},_updateAttract(){}};f.installClock({G});
 const firstTick=f.actorMotionTick();f.runSimulation(game,1/60);
 Object.assign(controller.padLook,{x:.7,y:.3});controller.edgeT=.4;controller.assist.has=true;for(const key of ['fire','sub','special','jump','squid'])a.intent[key]=true;a.intent.move.set(1,0,1);
 match.paused=!online;game.menus.current='pause';const prior={...count},time=G.time,poses=actors.map(x=>x.pos.toArray());
 for(let frame=0;frame<Math.round(seconds*hz);frame++){input.mouse.dx=.2;input.mobile.lookDX=.1;input.padPressed.add(1);f.runSimulation(game,1/hz);}
 const pauseCounts=Object.fromEntries(Object.keys(count).map(k=>[k,count[k]-prior[k]])),pausedState={time:G.time,matchTime:match.time,poses:actors.map(x=>x.pos.toArray()),intent:JSON.parse(JSON.stringify(a.intent)),enabled:controller.enabled,padLook:{...controller.padLook},edgeT:controller.edgeT,assist:controller.assist.has,draws,ticks:game.s3Clock.ticks,motionTicks:f.actorMotionTick()-firstTick,input:{mouse:input.mouse.dx,touch:input.mobile.lookDX,pad:input.padPressed.size}};
 if(!online&&!attract){assert.equal(G.time,time);assert.deepEqual(pausedState.poses,poses);assert.equal(pausedState.intent.fire,false);assert.equal(controller.assist.has,false);assert.equal(controller.padLook.x,0);}
 const stale=f.coherentMotionStart(a);
 match.paused=false;game.menus.current=null;keys.add('KeyW');keys.add('KeyE');input.mouse.left=true;input.mouse.dx=.25;input.pressed.add('KeyF');input.padPressed.add(1);
 do{f.runSimulation(game,1/hz)}while(!game._s3Ticked);
 const resume={time:G.time,matchTime:match.time,poses:actors.map(x=>x.pos.toArray()),intent:JSON.parse(JSON.stringify(a.intent)),aim:a.aimPoint.toArray(),aimYaw:a.aimYaw,aimPitch:a.aimPitch,padLook:{...controller.padLook},edgeT:controller.edgeT,draws,ticks:game.s3Clock.ticks,motionTicks:f.actorMotionTick()-firstTick,input:{mouse:input.mouse.dx,touch:input.mobile.lookDX,pad:input.padPressed.size},coherent:!!f.coherentMotionStart(a)};
 f.restoreRandom();G.boss=null;return JSON.parse(JSON.stringify({pausedState,pauseCounts,resume,stale:!!stale}));
}
for(const hz of [30,60,120])for(const seconds of [.1,1,10,60])test('offline pause '+seconds+'s at '+hz+'Hz preserves clock/input/controller/RNG/resume with zero snapshot writes and aim queries',()=>{
 const [old,next]=pair.map(f=>scenario(f,{hz,seconds,boss:seconds===10}));assert.deepEqual(next.pausedState,old.pausedState);assert.deepEqual(next.resume,old.resume);assert(next.resume.coherent);assert.equal(next.stale,false);assert.equal(old.stale,true);
 assert.equal(next.pauseCounts.aim,0);assert.equal(next.pauseCounts.rays,0);assert.equal(next.pauseCounts.snapshots,0);assert(old.pauseCounts.aim>0&&old.pauseCounts.rays>0&&old.pauseCounts.snapshots>0);
 for(const key of ['controller','updates','projectiles','paint','endFrame','poll','menus','net','gyro'])assert.equal(next.pauseCounts[key],old.pauseCounts[key],key);
});
for(const options of [{online:true},{attract:true},{online:true,boss:true}])test('online/attract exclusion '+JSON.stringify(options)+' preserves every query/tick/write',()=>{const [old,next]=pair.map(f=>scenario(f,{...options,hz:120,seconds:1}));assert.deepEqual(next,old);assert(next.pauseCounts.aim>0);assert(next.pauseCounts.snapshots>0);});
