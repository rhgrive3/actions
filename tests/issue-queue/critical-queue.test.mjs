// Regression fixtures for queued critical INKWAVE defects.
// Run: node --test tests/issue-queue/critical-queue.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeSettings, sanitizeProfile, awardProfileXP, validWeaponId, validStartRoster } from '../../inkwave-public/src/core/save-validation.mjs';
import { crabTankShotGeometry } from '../../patches/splatoon3/runtime/crab-tank-aim.mjs';

class Vec {
  constructor(x=0,y=0,z=0){ this.set(x,y,z); }
  set(x,y,z){ this.x=x;this.y=y;this.z=z;return this; }
  copy(v){return this.set(v.x,v.y,v.z);}
  addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}
  sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
  lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z;}
  length(){return Math.sqrt(this.lengthSq());}
  normalize(){return this.multiplyScalar(1/Math.max(1e-30,this.length()));}
  multiplyScalar(n){this.x*=n;this.y*=n;this.z*=n;return this;}
  distanceTo(v){return new Vec(this.x-v.x,this.y-v.y,this.z-v.z).length();}
  dot(v){return this.x*v.x+this.y*v.y+this.z*v.z;}
  clone(){return new Vec(this.x,this.y,this.z);}
}
const angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,a.dot(b))))*180/Math.PI;
const settings={sensitivity:1,padSensitivity:1,fov:82,gyroSens:0,touchSens:0,touchScale:1,
  touchOpacity:.85,cameraShake:1,aimAssist:1,rumble:1,master:.8,music:.6,sfx:.85,quality:'high'};
const quality={low:{},medium:{},high:{},ultra:{}};
const weapons={shooter:{kind:'shooter'},roller:{kind:'roller'}};
const profile={level:1,xp:0,weapon:'shooter',matches:0,wins:0};
const xpForLevel=level=>800+level*350;

test('invalid graphics quality names cannot resolve prototype properties',()=>{
  for(const name of ['constructor','toString','__proto__','other',{},null,7]){
    assert.equal(sanitizeSettings({quality:name},settings,quality).quality,'high');
  }
  for(const name of Object.keys(quality)) assert.equal(sanitizeSettings({quality:name},settings,quality).quality,name);
});
test('corrupt persisted input scalars are finite on load and live changes',()=>{
  for(const value of ['not-a-number',{},[],null,1e308,-100,1e100]){
    const s=sanitizeSettings({sensitivity:value,padSensitivity:value,fov:value},settings,quality);
    assert.ok(Number.isFinite(s.sensitivity*0.0021));
    assert.ok(s.sensitivity>=.2 && s.sensitivity<=3);
    assert.ok(s.fov>=65 && s.fov<=100);
  }
  assert.equal(sanitizeSettings({gyroSens:-5,touchSens:-5,sensitivity:.75},settings,quality).gyroSens,-5);
  assert.equal(sanitizeSettings({sensitivity:.75},settings,quality).sensitivity,.75);
});
test('unknown saved weapon and inherited keys repair to playable loadout',()=>{
  for(const value of ['ghost','constructor','__proto__',{},null]){
    assert.equal(validWeaponId(weapons,value),false);
    assert.equal(sanitizeProfile({weapon:value},profile,weapons).weapon,'shooter');
  }
  assert.equal(sanitizeProfile({weapon:'roller'},profile,weapons).weapon,'roller');
});
test('XP awards are bounded even with a large finite JSON save',()=>{
  const p=sanitizeProfile({xp:1e308,level:1},profile,weapons);
  assert.equal(p.xp,0);
  awardProfileXP(p,1200,xpForLevel);
  assert.deepEqual([p.level,p.xp],[2,50]);
  const q=sanitizeProfile({xp:1e10,level:1},profile,weapons);
  awardProfileXP(q,1200,xpForLevel);
  assert.ok(q.level>2 && q.level<=100000);
  assert.ok(q.xp>=0 && q.xp<xpForLevel(q.level));
  const r={level:1,xp:1e308};
  awardProfileXP(r,1200,xpForLevel);
  assert.deepEqual([r.level,r.xp],[2,50]);
  for(const value of [undefined,null,-3,NaN,1e308,'500']) {
    const s={level:1,xp:value}; awardProfileXP(s,0,xpForLevel);
    assert.ok(Number.isSafeInteger(s.xp) && s.xp>=0);
  }
});
test('START requires a unique recipient-owned human and valid slot/nid',()=>{
  const a={nid:0,owner:'host',bot:false,team:0,slot:0};
  const b={nid:1,owner:'guest',bot:false,team:1,slot:0};
  assert.equal(validStartRoster([a,b],'guest'),true);
  assert.equal(validStartRoster([a],'guest'),false);
  assert.equal(validStartRoster([a,{...b,bot:true}],'guest'),false);
  assert.equal(validStartRoster([a,b,{...b,nid:2,slot:1}],'guest'),false);
  assert.equal(validStartRoster([a,{...b,nid:0}],'guest'),false);
  assert.equal(validStartRoster([a,{...b,team:2}],'guest'),false);
  assert.equal(validStartRoster([a,{...b,slot:4}],'guest'),false);
  assert.equal(validStartRoster([a,{...b,owner:'guest',team:0,slot:1}],'guest','boss'),true);
});
test('Crab Tank muzzle converges on attainable close targets in both modes',()=>{
  const actor={pos:new Vec(0,0,0),yaw:0,aimPoint:new Vec(0,.5,1.2),
    aimDir:new Vec(0,-.8,1.2).normalize(),aimYaw:0,aimPitch:Math.atan2(-.8,1.2)};
  for(const mode of ['shooter','cannon']){
    const origin=new Vec(),direction=new Vec();
    crabTankShotGeometry(actor,mode,origin,direction);
    const targetRay=actor.aimPoint.clone().sub(origin).normalize();
    assert.ok(angle(direction,targetRay)<.1,mode+' residual '+angle(direction,targetRay));
    assert.ok([origin.x,origin.y,origin.z,direction.x,direction.y,direction.z].every(Number.isFinite));
    actor.aimPoint.set(0,.5,5);actor.aimDir.set(0,-.8,5).normalize();
    crabTankShotGeometry(actor,mode,origin,direction);
    assert.ok(angle(direction,actor.aimPoint.clone().sub(origin).normalize())<.1,mode+' far shot');
    actor.aimPoint.set(0,0,0);actor.aimDir.set(0,0,1);
    crabTankShotGeometry(actor,mode,origin,direction);
    assert.ok([origin.x,origin.y,origin.z,direction.x,direction.y,direction.z].every(Number.isFinite));
    actor.aimPoint.set(0,.5,1.2);actor.aimDir.set(0,-.8,1.2).normalize();
  }
});
// Compile the real source methods (rather than a modelled duplicate) against
// deterministic stand-ins for the graphics/physics/network shell.
function method(file, signature, endAnchor, deps) {
  const src=readFileSync(new URL(file,import.meta.url),'utf8');
  const start=src.indexOf(signature);
  assert.ok(start>=0,signature+' missing');
  const stop=src.indexOf(endAnchor,start);
  assert.ok(stop>start,signature+' end missing');
  const methodText=src.slice(start,stop).trim();
  const name=signature.trim().slice(0,signature.indexOf('(')-signature.indexOf(signature.trim()));
  return new Function(...Object.keys(deps),'return ({'+methodText+'}).'+name)(...Object.values(deps));
}
test('fixed-step player aim uses current yaw, not stale gameCam',()=>{
  const actor={pos:new Vec(),aimPoint:new Vec(),weapon:{kind:'shooter',range:12},team:0,aimYaw:Math.PI/6,aimPitch:0};
  const cam={position:new Vec(0,1.3,-4.5),getWorldDirection(out){return out.set(0,0,1)}};
  const rig={mode:'follow',target:actor,curDist:4.5,shoulder:0,yaw:Math.PI/6,
    forward(out){return out.set(.5,0,Math.sqrt(3)/2);}};
  const G={rig:{gameCam:cam},camera:cam,physics:{raycast(){return {hit:false}}},actors:[],boss:null};
  const fn=method('../../inkwave-public/src/game/player.js','  computeAim(fixedStep = false) {','\n  }\n}',{
    G,_v:new Vec(),_v2:new Vec(),_fwd:new Vec(),_c:new Vec(),_hit:{},
    Physics:{},PLAYER:{radius:.5},clamp:(v,a,b)=>Math.max(a,Math.min(b,v))
  });
  const controller={a:actor,rig,onTarget:null,inRange:false};
  fn.call(controller,true);
  assert.ok(Math.abs(Math.atan2(actor.aimPoint.x,actor.aimPoint.z)*180/Math.PI-30)<.01);
  assert.ok(actor.aimPoint.z>50);
  fn.call(controller,false);
  assert.ok(Math.abs(Math.atan2(actor.aimPoint.x,actor.aimPoint.z))<1e-9);
});
test('malformed remote splat cannot trap replay flag or suppress later paint',()=>{
  const splats=[];
  const G={paint:{splat(c,r,t,o){splats.push([r,t,o.kind]);if(o.seed===999)throw Error('test paint failure');}}};
  const fn=method('../../inkwave-public/src/net/netmatch.js','  _play(from, e) {','\n  // ---- the boss',{G,
    _v:new Vec(),_v2:new Vec()});
  const nm={applying:false,_paintReplayWarned:false};
  const event=(kind,seed=1)=>[0,'s',0,0,1,1,0,seed,kind,0,0,0,0,-1];
  fn.call(nm,'peer',event({toString:null}));
  assert.equal(nm.applying,false);
  fn.call(nm,'peer',event('shot'));
  assert.equal(nm.applying,false);
  assert.equal(splats.length,1);
  const warn=console.warn;console.warn=()=>{};
  try{fn.call(nm,'peer',event('shot',999));}finally{console.warn=warn;}
  assert.equal(nm.applying,false);
  fn.call(nm,'peer',event('line'));
  assert.equal(splats.length,3);
});
test('late menu attract callback cannot dispose a newly launched match',async()=>{
  let resolve;
  const old={attract:true},live={attract:false};
  const G={mode:'menu',paint:{coverage:()=>[0,0]}};
  const fn=method('../../inkwave-public/src/main.js','  _updateAttract(dt) {','\n  // ---------------------------------------------------------------------------------------- match flow',{G,THREE:{}});
  let resets=0;
  const game={match:old,attractT:110,shotT:100,menus:{current:'main'},rig:{mode:'orbit'},
    _fade:()=>new Promise(r=>{resolve=r}),_setPalette(){},_pickPalette(){return 0},
    _startAttract(){resets++}};
  fn.call(game,.02);
  game.match=live;game._attractGeneration=1;resolve();
  await Promise.resolve();await Promise.resolve();
  assert.equal(resets,0);assert.equal(game.match,live);
});
