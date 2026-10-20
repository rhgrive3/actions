// Regression fixtures for queued critical INKWAVE defects.
// Run: node --test tests/issue-queue/critical-queue.test.mjs
import test from 'node:test';
// Keep the camera aliasing regression in the existing critical-queue CI gate.
import './camera-collision-probe.test.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { adaptBuildSource } from '../../scripts/inkwave-source-composition.mjs';
import { sanitizeSettings, sanitizeSettingsChange, sanitizeProfile, awardProfileXP, validWeaponId, validStartRoster } from '../../inkwave-public/src/core/save-validation.mjs';
import { crabTankShotGeometry } from '../../patches/splatoon3/runtime/crab-tank-aim.mjs';
import { updateShotGuide } from '../../patches/splatoon3/runtime/weapons-fidelity.mjs';
import { isPaintOrderClock, nextPaintOrderClock, paintClockComesAfter } from '../../patches/splatoon3/runtime/paint-ownership.mjs';
import { kitPaintRadiusAllowed, consumeKitPaint } from '../../patches/network-replication/kit-paint-admission.mjs';
import { packPaintAuthority, admitPaintAuthority, consumePaintAuthority } from '../../patches/network-replication/paint-authority.mjs';
import { migrateAimProfiles, applyAimSettingsChange } from '../../patches/local-quality/aim-profile.mjs';
import { parse } from '../../patches/loading-cache/vendor/acorn.mjs';
import { adaptQueueNine } from '../../patches/reliability/queue-nine-final-adapter.mjs';
import { reliabilityIdentity } from '../../patches/reliability/adapter.mjs';

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
test('S3 signed sensitivities and profile-only changes preserve the native aim owner',()=>{
  for(const value of [-5,0,5]) {
    const saved=sanitizeSettings({padSensitivityScale:'s3',padSensitivity:value,gyroSens:value,
      aimProfiles:{tv:{padSensitivity:value,gyroSens:value},handheld:{padSensitivity:-value,gyroSens:-value}}},settings,quality);
    assert.equal(saved.padSensitivity,value);assert.equal(saved.gyroSens,value);
    assert.equal(saved.aimProfiles.tv.padSensitivity,value);assert.equal(saved.aimProfiles.handheld.padSensitivity,-value);
    const live=sanitizeSettingsChange({padSensitivity:value,gyroSens:value}, {...settings,padSensitivityScale:'s3'},quality);
    assert.equal(live.padSensitivity,value);assert.equal(live.gyroSens,value);
  }
  const current=migrateAimProfiles({...settings,padSensitivityScale:'s3',aimProfiles:{
    tv:{padSensitivity:-4,gyroSens:-3},handheld:{padSensitivity:4,gyroSens:3}}},settings);
  const change=sanitizeSettingsChange({aimProfile:'handheld'},current,quality);
  assert.deepEqual(change,{aimProfile:'handheld'},'do not copy TV flat values into a Handheld-only switch');
  applyAimSettingsChange(current,change);
  assert.equal(current.padSensitivity,4);assert.equal(current.gyroSens,3);
  assert.equal(current.aimProfiles.tv.padSensitivity,-4);
  const invalid=sanitizeSettingsChange({padSensitivity:NaN,gyroSens:Infinity,
    aimProfiles:{tv:{padSensitivity:'bad',gyroSens:{}}}},current,quality);
  assert.equal(invalid.padSensitivity,4);assert.equal(invalid.gyroSens,3);
  assert.equal(invalid.aimProfiles.tv.padSensitivity,-4);assert.equal(invalid.aimProfiles.tv.gyroSens,-3);
  const disabled={gyro:false,padSensitivity:0,gyroSens:0,touchSens:0,rumble:0,aimAssist:0,cameraShake:0,master:0,music:0,sfx:0};
  assert.deepEqual(sanitizeSettingsChange(disabled,current,quality),disabled,'valid disabled/centered controls are not repaired away');
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
function method(file, signature, endAnchor, deps, source = null) {
  const src=source ?? readFileSync(new URL(file,import.meta.url),'utf8');
  const start=src.indexOf(signature);
  assert.ok(start>=0,signature+' missing');
  const stop=src.indexOf(endAnchor,start);
  assert.ok(stop>start,signature+' end missing');
  const methodText=src.slice(start,stop+(endAnchor.includes('}') ? 4 : 0)).trim();
  const name=signature.trim().slice(0,signature.indexOf('(')-signature.indexOf(signature.trim()));
  return new Function(...Object.keys(deps),'return ({'+methodText+'}).'+name)(...Object.values(deps));
}
test('composed fixed-step player aim uses current input yaw, not stale gameCam',()=>{
  // Verify the production-composed camera adapter, not the pre-adapter
  // Player prototype. No extra camera spring step or world raycast is added.
  const base = readFileSync(new URL('../../inkwave-public/src/game/player.js', import.meta.url), 'utf8');
  const composed = adaptBuildSource('src/game/player.js', base);
  assert.match(composed, /simulationAimCamera\(this, G.physics\)/);
  const actor={pos:new Vec(),aimPoint:new Vec(),weapon:{kind:'shooter',range:12},team:0,aimYaw:Math.PI/6,aimPitch:0};
  const cam={position:new Vec(0,1.3,-4.5),getWorldDirection(out){return out.set(0,0,1)}};
  const tickCam={position:new Vec(-2.25,1.3,-3.897114317),getWorldDirection(out){return out.set(.5,0,Math.sqrt(3)/2)}};
  const rig={mode:'follow',target:actor,yaw:Math.PI/6,
    forward(out){return out.set(.5,0,Math.sqrt(3)/2);}};
  const G={rig:{gameCam:cam},camera:cam,physics:{raycast(){return {hit:false}}},actors:[],boss:null};
  const fn=method('../../inkwave-public/src/game/player.js','  computeAim(simulation = false) {','\n  }\n}',{
    G,_v:new Vec(),_v2:new Vec(),_fwd:new Vec(),_c:new Vec(),_hit:{},
    simulationAimCamera:()=>tickCam,
    Physics:{},PLAYER:{radius:.5},clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),updateShotGuide,
  },composed);
  const controller={a:actor,rig,onTarget:null,inRange:false};
  fn.call(controller,true);
  assert.ok(Math.abs(Math.atan2(actor.aimPoint.x,actor.aimPoint.z)*180/Math.PI-30)<.01);
  assert.ok(actor.aimPoint.z>50);
  fn.call(controller,false);
  assert.ok(Math.abs(Math.atan2(actor.aimPoint.x,actor.aimPoint.z))<1e-9);
});
function paintOwners(source) {
  const start=source.indexOf("const PAINT_ORDER_TAG ="),end=source.indexOf('const firstSplatSessions',start);
  assert.ok(start>=0 && end>start,'actual composed paint owner helpers');
  return new Function('isPaintOrderClock','nextPaintOrderClock','paintClockComesAfter','kitPaintRadiusAllowed','admitPaintAuthority',
    source.slice(start,end)+'\nreturn {readPaintOrder,receivePaintOrder};')(
      isPaintOrderClock,nextPaintOrderClock,paintClockComesAfter,kitPaintRadiusAllowed,admitPaintAuthority);
}
function splatRig(composed, splat) {
  const fn=method('../../inkwave-public/src/net/netmatch.js',
    '  _applyRemoteSplatEvent(e, commitReplay = true) {','\n  commitDeadlinePaint()',{
      G:{paint:{splat}},_v:new Vec(),_v2:new Vec(),consumeKitPaint,consumePaintAuthority,...paintOwners(composed),
    },composed);
  const actor={nid:0,owner:'host',team:0,pos:new Vec()},nm={applying:false,_paintReplayWarned:false,_paintClockState:{clock:0,applied:new Map()},
    myId:'host',s:{hostId:'host',_members:new Set(['host'])},cfg:{id:'game'},byNid:new Map([[0,actor]])};
  let seq=0;
  const event=(kind,seed=1)=>{
    seq++;const proof=packPaintAuthority(nm,null,0,{claimOwner:actor});
    return Object.assign([0,'s',0,0,1,1,0,seed,kind,0,0,0,0,-1,
      ['inkwave-paint-order-v1','game',seq,0,proof],1,1],{_netPeer:'host',_netTick:seq,_netSeq:seq});
  };
  return {fn,nm,event};
}
test('composed malformed remote splat never traps replay or suppresses later paint',()=>{
  const composed=adaptBuildSource('src/net/netmatch.js',
    readFileSync(new URL('../../inkwave-public/src/net/netmatch.js',import.meta.url),'utf8'));
  const splats=[];
  const {fn,nm,event}=splatRig(composed,(c,r,t,o)=>{splats.push([r,t,o.kind]);if(o.seed===999)throw Error('test paint failure');});
  assert.equal(fn.call(nm,event({toString:null})),false);
  assert.equal(nm.applying,false);
  assert.equal(fn.call(nm,event('shot')),true);
  assert.equal(nm.applying,false);
  assert.equal(splats.length,1);
  const warn=console.warn;console.warn=()=>{};
  try{assert.equal(fn.call(nm,event('shot',999)),false);}finally{console.warn=warn;}
  assert.equal(nm.applying,false);
  assert.equal(fn.call(nm,event('line')),true);
  assert.equal(splats.length,3);
});
test('composed paint admission keeps every source kind and rejects malformed owners before replay mutation',()=>{
  const composed=adaptBuildSource('src/net/netmatch.js',readFileSync(new URL('../../inkwave-public/src/net/netmatch.js',import.meta.url),'utf8'));
  const seen=[],{fn,nm,event}=splatRig(composed,(_c,_r,_t,o)=>seen.push(o));
  const kinds=['shot','line','blast','bomb','trail','drop','roll','rollFloor','speck',
    'source-shot','source-splash','ink-shot','ink-slosh','ink-brush','ink-flick','ink-contact',
    'ink-charger-a','ink-charger-b','ink-charger-c','ink-blast','ink-blast-rectified'];
  for(const kind of kinds)assert.equal(fn.call(nm,event(kind)),true,kind+' legitimate authenticated paint');
  assert.deepEqual(seen.map(o=>o.kind),kinds,'source contour identifiers survive replay');
  const previousClock=nm._paintClockState.clock,previousSeq=nm._paintClockState.applied.get('host');
  const canonical=()=>{const e=event('ink-shot');e[14]=['inkwave-paint-order-v1','game',previousClock+7,1,e[14][4]];e._netTick=1;e._netSeq=previousSeq+1;return e;};
  const invalid=[
    e=>{e[8]='constructor';},e=>{e[8]={};},e=>{e[2]=1e308;},e=>{e[7]=NaN;},
    e=>{e[5]=0;},e=>{e[6]=2;},e=>{e[13]=-2;},e=>{e[14][1]='other-match';},
    e=>{e._netPeer='stranger';},e=>{e._netTick=undefined;},
    e=>{e[14].pop();},e=>{e[14][4][2]=99;},e=>{e[14][4][3]++;},
  ];
  for(const corrupt of invalid) {
    const e=canonical();corrupt(e);const count=seen.length;
    assert.equal(fn.call(nm,e),false);
    assert.equal(nm._paintClockState.applied.get('host'),previousSeq);assert.equal(nm._paintClockState.clock,previousClock);
    assert.equal(nm.applying,false);assert.equal(seen.length,count);
  }
  nm.applying=true;
  assert.equal(fn.call(nm,canonical()),true);assert.equal(nm.applying,true,'nested replay owner is restored');
  assert.equal(nm._paintClockState.applied.get('host'),previousSeq+1);assert.equal(nm._paintClockState.clock,previousClock+7);
  const count=seen.length;assert.equal(fn.call(nm,canonical()),false);assert.equal(seen.length,count,'same source event paints once');
});
test('composed late menu attract callback cannot dispose a newly started match',async()=>{
  const composed=adaptBuildSource('src/main.js',
    readFileSync(new URL('../../inkwave-public/src/main.js',import.meta.url),'utf8'));
  let resolve;
  const old={attract:true},live={attract:false};
  const G={mode:'menu',paint:{coverage:()=>[0,0]}};
  const fn=method('../../inkwave-public/src/main.js','  _updateAttract(dt) {',
    '\n  // ---------------------------------------------------------------------------------------- match flow',{G,THREE:{}},composed);
  let resets=0;
  const game={match:old,_matchFlow:{},attractT:110,shotT:100,menus:{current:'main'},rig:{mode:'orbit'},
    _fade:()=>new Promise(r=>{resolve=r}),_setPalette(){},_pickPalette(){return 0},
    _startAttract(){resets++}};
  fn.call(game,.02);
  game.match=live;game._matchFlow={};resolve();
  await Promise.resolve();await Promise.resolve();
  assert.equal(resets,0);assert.equal(game.match,live);
});


test('real production composition retains source-admission and bounded progression',()=>{
  const base=(path)=>readFileSync(new URL('../../inkwave-public/'+path,import.meta.url),'utf8');
  const main=adaptBuildSource('src/main.js',base('src/main.js'));
  const cfg=adaptBuildSource('src/config.js',base('src/config.js'));
  const session=adaptBuildSource('src/net/session.js',base('src/net/session.js'));
  const paint=adaptBuildSource('src/world/paint.js',base('src/world/paint.js'));
  for(const [name,source] of Object.entries({main,cfg,session,paint}))
    assert.doesNotThrow(()=>parse(source,{ecmaVersion:'latest',sourceType:'module'}),name+' full composition must parse without duplicate imports');
  assert.match(main,/normalizeQueueProfile\(loadJSON\('inkwave.profile'/);
  assert.match(main,/sanitizeSettings\(loadJSON\('inkwave.settings'/);
  assert.match(main,/sanitizeSettingsChange\(partial, this.settings, QUALITY\)/);
  assert.equal(main.split('settleProgression(p, PROGRESSION);').length-1,2);
  assert.equal(main.split('p.xp += gained;').length-1,2,'original score owners still award exactly once');
  assert.ok(!main.includes('while (p.xp >= PROGRESSION.xpForLevel(p.level))'));
  assert.match(main,/validStartRoster\(cfg\?\.roster, G.net\?\.myId/);
  assert.match(session,/validStartRoster\(cfg\?\.roster, this.myId/);
  assert.match(cfg,/Object.hasOwn\(QUALITY, settings.quality\)/);
  assert.match(paint,/Object.hasOwn\(K, opts.kind\)/);
});
test('final queue composition fails closed when an existing admission or scoring owner is removed',()=>{
  const main=adaptBuildSource('src/main.js',readFileSync(new URL('../../inkwave-public/src/main.js',import.meta.url),'utf8'));
  for(const [anchor,label] of [
    ["this.profile = normalizeQueueProfile(loadJSON('inkwave.profile', DEFAULT_PROFILE), WEAPONS);",'persisted profile owner'],
    ['getLoadout: () => ({ weapon: safeWeaponId(self.profile.weapon, WEAPONS) })','loadout getter owner'],
    ['if (!validWeaponId(weapon, WEAPONS)) return;','loadout admission owner'],
    ['weapon: safeWeaponId(this.profile.weapon, WEAPONS),','offline loadout owner'],
    ['if (!validStartRoster(cfg?.roster, G.net?.myId, WEAPONS, cfg?.mode, G.net?.hostId))','online roster owner'],
    ['if (!a?.weapon || !a.weaponRunner) return;','HUD local actor owner'],
    ['normalizeQueueProfile(p, WEAPONS);','result profile owner'],
    ['settleProgression(p, PROGRESSION);','bounded progression owner'],
    ['const privateBattle = !!G.netm;','private battle XP owner'],
  ]) {
    assert.ok(main.includes(anchor));
    assert.throws(()=>adaptQueueNine('src/main.js',main.replace(anchor,'')),new RegExp(label));
  }
});
test('build input identity includes the actual terminal queue transformer',()=>{
  const source=readFileSync(new URL('../../patches/reliability/queue-nine-final-adapter.mjs',import.meta.url));
  assert.equal(reliabilityIdentity()['queue-nine-final-adapter.mjs'],createHash('sha256').update(source).digest('hex'));
});
