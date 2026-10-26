// Reduced native clock-owner execution, NOT browser/GPU/screenshot evidence.
// Inputs/config/method bodies come from the production source tree, not a
// hand-authored four-frame timing fixture or copied gameplay implementation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const ROOT=process.env.DUALIES_SOURCE_ROOT||new URL('../../',import.meta.url).pathname;
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const {adaptBuildSource}=await import(pathToFileURL(path.join(ROOT,'scripts/inkwave-source-composition.mjs')));
const startupOwner=await import(pathToFileURL(path.join(ROOT,'patches/splatoon3/issue-477-adapter.mjs')));
const {installWeaponGates}=await import(pathToFileURL(path.join(ROOT,'patches/splatoon3/runtime/weapon-gates.mjs')));
const profile=JSON.parse(read('patches/splatoon3/profile.json')),HZ=profile.referenceHz,DT=1/HZ;
const {WEAPONS:rawWeapons}=await import(pathToFileURL(path.join(ROOT,'inkwave-public/src/config.js')));
const rawPath=process.env.DUALIES_RAW_WEAPONS||path.join(ROOT,'inkwave-public/src/game/weapons.js');
const emitted=adaptBuildSource('src/game/weapons.js',fs.readFileSync(rawPath,'utf8'));
const edge=read('patches/splatoon3/runtime/weapon-edgecases.mjs');
const runtime=read('patches/splatoon3/runtime/weapons.mjs');
const gates=read('patches/splatoon3/runtime/weapon-gates.mjs');
function method(name){const match=emitted.match(new RegExp('  '+name+'\\([^\\n]*\\) \\{[\\s\\S]*?\\n  \\}'));assert(match,'actual emitted '+name);return match[0];}
function vector(x=0,y=0,z=0){return {x,y,z,set(x,y,z){Object.assign(this,{x,y,z});return this;},clone(){return vector(this.x,this.y,this.z);}};}
function fixture(){
 const shots=[],G={paint:{splat:()=>0},projectiles:{fireDualies:(...args)=>shots.push(args)}};
 // Evaluate the actual raw-config declaration and the exact runtime install
 // profile loop; do not rebuild its timing values as a hand-written fixture.
 const WEAPONS=Object.fromEntries(Object.entries(rawWeapons).map(([id,spec])=>[id,{...spec}]));
 const install=process.env.DUALIES_INSTALL_SOURCE?fs.readFileSync(process.env.DUALIES_INSTALL_SOURCE,'utf8'):read('patches/splatoon3/runtime/install.mjs');
 const loop=install.match(/  for \(const \[kind, data\] of Object.entries\(profile.weapons\)\) \{[\s\S]*?\n  \}/);assert(loop);
 new Function('WEAPONS','profile',loop[0])(WEAPONS,profile);
 const Native=new Function('G','_v','MOVEMENT_EPSILON','emit','rumble','HAND_L','HAND_R',
  'return class {\n'+method('_dualies')+'\n'+method('tryDodge')+'\n}')(G,vector(),1e-10,()=>{},()=>{},'L','R');
 const a={weapon:WEAPONS.dualies,alive:true,form:'kid',grounded:true,ink:100,intent:{fire:true,move:{x:0,z:0}},vel:vector(),pos:vector(23,0,6),yaw:0,isLocal:true,character:{trigger(){}},addTurf(){}};
 const r=new Native();Object.assign(r,{a,rollsLeft:2,lockT:0,dodge:null,aimingSub:false,firingT:0,cooldown:0,rollPaint:0,hand:0,bloom:0,sinceHand:[0,0],_dodgeDir:vector(),_spreadDeg:()=>0,_empty(){throw Error('unexpected empty');}});
 return {Native,a,r,shots,w:a.weapon};
}
function installNativeTurret(Native){
 const start=runtime.indexOf('  const dualiesBase = WeaponRunner.prototype._dualies, spread = WeaponRunner.prototype._spreadDeg;');
 const end=runtime.indexOf('  WeaponRunner.prototype._spreadDeg = function (w)',start);assert(start>=0&&end>start);
 const helper=runtime.match(/function suppressDualiesGateInput\(runner, input\) \{[\s\S]*?\n\}/)[0];
 const enumerate=runtime.match(/function enumerableWeaponKeys\(source\) \{[\s\S]*?\n\}/)[0];
 const config=runtime.match(/export function cachedWeaponOverrideConfig\(cache, source, key, value\) \{[\s\S]*?\n\}/)[0].replace('export ','');
 new Function('WeaponRunner',enumerate+'\n'+config+'\n'+helper+'\nconst dualiesLockConfigs=new WeakMap();\n'+runtime.slice(start,end))(Native);
}
test('actual installed profile first-fire startup is distinct from emitted four-frame pre-roll',()=>{
 const {r,w,shots}=fixture();
 const wrapper=edge.match(/  WeaponRunner.prototype._dualies = function \(dt, inp, w\) \{[\s\S]*?\n  \};/)[0].replace('  WeaponRunner.prototype._dualies = ','').replace(/;$/,'');
 const clear=edge.match(/const clear = r => \{[^\n]+\};/)[0];
 r._dualies=new Function('dualies','EPS',clear+'\nreturn ('+wrapper+');')(r._dualies,1e-10);
 r._dualies(DT,{fire:true},w);assert.equal(r.s3DualiesStart,w.humanoidFirstShotDelay);assert.equal(shots.length,0);
 assert.notEqual(w.humanoidFirstShotDelay*HZ,startupOwner.DUALIES_STARTUP_FRAMES);
 for(let n=0;n<w.humanoidFirstShotDelay*HZ;n++)r._dualies(DT,{fire:true},w);
 assert.equal(shots.length,1,'actual edgecase owner admits the native base projectile call after its own delay');
});
test('actual emitted pre-roll owner holds movement clock, then native roll completes and installs source lock',()=>{
 const {r,w}=fixture();assert(r.tryDodge({x:1,z:0}));
 assert.equal(r.dodge.startupDur,startupOwner.DUALIES_STARTUP_SECONDS);
 for(let n=0;n<startupOwner.DUALIES_STARTUP_FRAMES;n++){r._dualies(DT,{fire:true},w);assert.equal(r.dodge.t,0);}
 for(let n=1;n<Math.round(w.rollTime*HZ);n++){r._dualies(DT,{fire:true},w);assert(r.dodge);}
 r._dualies(DT,{fire:true},w);assert.equal(r.dodge,null);assert(Math.abs(r.lockT-w.lockTime)<1e-10);
 assert.equal(Math.round(w.rollTime*HZ),startupOwner.DUALIES_ROLL_FRAMES);
 assert.equal(Math.round(w.lockTime*HZ),startupOwner.DUALIES_LOCK_FRAMES);
});
test('actual turret and weapon-gates owners enforce source post-roll gate and persist after zero lock until fire release',()=>{
 const {Native,r,w,a,shots}=fixture();installNativeTurret(Native);
 class Actor{update(){}}class Projectiles{_new(){} _push(){}}
 installWeaponGates({Actor,WeaponRunner:Native,Projectiles});
 const advanceBody=gates.match(/  const advance = \(r, dt\) => \{[\s\S]*?\n  \};/)[0];
 const eps=gates.match(/const EPS = [^;]+;/)[0];
 const elapsed=gates.match(/const elapsed = [^;]+;/)[0];
 const advance=new Function(eps+'\n'+elapsed+'\n'+advanceBody+';return advance;')();
 const step=()=>{advance(r,DT);r.cooldown-=DT;r._dualies(DT,{fire:a.intent.fire},w);};
 assert(r.tryDodge({x:1,z:0}));while(r.dodge)step();
 assert.equal(r.s3Turret,true);assert.equal(r.s3DodgeShotRemaining,w.rollShotDelay);
 assert.equal(r.s3DodgeShotPending,startupOwner.DUALIES_POST_ROLL_FIRE_GATE_SECONDS);
 for(let n=1;n<Math.round(w.rollShotDelay*HZ);n++){step();assert.equal(shots.length,0);}
 step();assert.equal(shots.length,1,'actual gate clears at the production delay, not a fixture timeout');
 while(r.lockT>0)step();assert.equal(r.s3Turret,true,'zero lock does not itself release actual turret');
 a.intent.fire=false;step();assert.equal(r.s3Turret,false);
});
