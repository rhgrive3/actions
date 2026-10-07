import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './controls-fixture.mjs';
import {resetPlatformInput} from '../../local-quality/platform-input.mjs';
const STEP=1/60;
async function rig(weapon='shooter'){
 const f=await fixture({match:true,fidelity:true,network:true});f.installWeaponsFidelity(f,f.profile);
 const input=new f.Input({}),a=f.make(weapon),camera={yaw:0,pitch:0},controller=new f.PlayerController(a,camera,input);controller.computeAim=()=>{};a.isLocal=true;a.nid=1;a.owner='B';
 const m=new f.Match({duration:100,mode:'turf'});Object.assign(m,{local:a,actors:[a],controller,follower:true,time:100,state:'playing'});
 Object.assign(f.G,{match:m,rig:camera,actors:[a],settings:{...f.DEFAULT_SETTINGS,aimAssist:0},mode:'match'});
 let bombs=0;Object.assign(f.G.projectiles,{throwBomb(){bombs++;},update(){},list:[],bombs:[],clouds:[],beams:[],sights:new Map()});f.G.paint.coverage=()=>[.9,.1];
 const frame=(n=1)=>{for(let i=0;i<n;i++){f.G.time+=STEP;m.updateController(STEP);m.update(STEP);input.endFrame();}};
 return {...f,input,a,controller,m,frame,bombs:()=>bombs};
}

// #991: the platform boundary neutralizes physical input, so S3 deferred shots
// derived from that input must not survive it and replay later.
test('#991 blur between FIRE press and the 3F Splattershot first shot cancels the queued shot',async()=>{
 const h=await rig('shooter');h.input.mouse.left=true;h.frame(1);
 const r=h.a.weaponRunner;assert.equal(r.s3ShooterPendingFirst,true,'startup queue armed before the boundary');
 resetPlatformInput(h.input,h.controller);
 assert.equal(h.a.intent.fire,false);assert.equal(r.s3ShooterPendingFirst,false);assert.equal(r.s3ShooterFirstRemaining,0);
 h.frame(12);assert.equal(h.shots.length,0,'no projectile without a new FIRE input');
 h.input.mouse.left=true;h.frame(10);assert.ok(h.shots.length>=1,'a fresh FIRE input still fires normally');
});

test('#991 suspend/resume reset between squid exit and the 12F first shot cancels the queued shot',async()=>{
 const h=await rig('shooter');const r=h.a.weaponRunner;
 r.s3SwimFireQueued=true;r.s3SwimFireRemaining=h.profile.weapons.shooter.swimFirstShotDelay;
 resetPlatformInput(h.input,h.controller);
 assert.equal(r.s3SwimFireQueued,false);assert.equal(r.s3SwimFireRemaining,0);
 h.frame(20);assert.equal(h.shots.length,0);
});

test('#991 boundary reset leaves recovery, cooldown and already accepted projectiles untouched',async()=>{
 const h=await rig('shooter');const r=h.a.weaponRunner,shot={};h.G.projectiles.list.push(shot);
 r.cooldown=.4;r.lockT=.3;
 resetPlatformInput(h.input,h.controller);
 assert.equal(r.cooldown,.4);assert.equal(r.lockT,.3);assert.equal(h.G.projectiles.list[0],shot);
});

test('#991 reset without a weapon runner or cancel hook stays a no-op',async()=>{
 const h=await rig('shooter');h.a.weaponRunner.cancelPendingInput=undefined;
 resetPlatformInput(h.input,h.controller);
 h.a.weaponRunner=null;resetPlatformInput(h.input,h.controller);
});
