import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { applyRainmakerPose, rainmakerAimQuaternion } from '../runtime/ranked/rainmaker-motion.mjs';
import { RAINMAKER_SHOT_RECOVERY_SECONDS as RECOVERY } from '../runtime/ranked/rainmaker.mjs';
const names=['ANC','ANCR','AFOLT','AFOLR','IKR','IKL','LTW','LTGT','POLER','POLEL','SPINE','CHEST','HANDPL','HANDPR','CLAVR'];
const C=Object.fromEntries(names.map((k,i)=>[k,i*3]));
const fixture=()=>{
 const ch={P:new Float64Array(46),actor:{nid:'carrier',team:0,slot:0,alive:true},kidForm:true,weapon:{},sourceMotion:{active:true,sourceUpper:true,keepSourceArms:true,constrainLeft:false}};
 const state={carrier:'carrier',charge:{value:0,firing:false,pending:null,recovery:0}};
 return {ch,state,match:{mode:'rainmaker',ranked:{rule:{state}}}};
};
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-10,`${label}: ${a} vs ${b}`);
test('final owner samples carry, charge, actual pending release and recovery without writing game state',()=>{
 const {ch,state,match}=fixture();
 for(const c of [{value:0},{value:.1,firing:true},{value:1,firing:true},{value:0,pending:{charge:1},delay:1/60},{value:0,recovery:RECOVERY},{value:0,recovery:RECOVERY/2},{value:0,recovery:0}]){
  state.charge=c;const before=JSON.stringify(state),actor=JSON.stringify(ch.actor);ch.P.fill(0);
  assert.equal(applyRainmakerPose(ch,{aimPitch:0},C,match,1/60),true);
  assert.equal(JSON.stringify(state),before);assert.equal(JSON.stringify(ch.actor),actor);
  assert(ch.P.every(Number.isFinite));assert.equal(ch.P[C.IKR],1);assert.equal(ch.P[C.LTW],0);
  assert.equal(ch.sourceMotion.sourceUpper,false);assert.equal(ch.sourceMotion.keepSourceArms,false);
  assert.equal(ch.sourceMotion.active,true,'sampled legs stay active');
  assert(ch._rainmakerPitch>=-.08&&ch._rainmakerPitch<=.22);
  if(c.pending)near(ch._rainmakerKick,0,'mouse-up windup is not a shot');
  if(c.recovery===RECOVERY)near(ch._rainmakerKick,1,'actual shot starts recoil');
  if(!c.recovery)near(ch._rainmakerKick,0,'no invented shot');
 }
});
test('20F authority recovery returns monotonically at 30/60/120 Hz with identical sampled peaks',()=>{
 for(const hz of [30,60,120]){
  const {ch,state,match}=fixture();state.charge={value:1};applyRainmakerPose(ch,{},C,match,1/hz);
  let previous=Infinity;
  for(let i=0;i<=Math.round(RECOVERY*hz);i++){
   state.charge={value:0,recovery:Math.max(0,RECOVERY-i/hz)};ch.P.fill(0);
   applyRainmakerPose(ch,{},C,match,1/hz);
   assert(ch._rainmakerKick<=previous+1e-12);previous=ch._rainmakerKick;
   if(i===0)near(ch._rainmakerPitch,-.08,'peak');
  }
  near(previous,0,'recovery ends with authority');
 }
});
test('partial cancel has no recoil and the raise blend does not snap to carry',()=>{
 const {ch,state,match}=fixture();state.charge={value:.25,firing:true};applyRainmakerPose(ch,{},C,match,1/60);
 state.charge={value:0};applyRainmakerPose(ch,{},C,match,1/60);
 assert(ch._rainmakerReady>0&&ch._rainmakerReady<1);near(ch._rainmakerKick,0,'cancel');
 for(let i=0;i<60;i++)applyRainmakerPose(ch,{},C,match,1/60);
 assert(ch._rainmakerReady<1e-7);
});
test('noncarriers, drop, death, squid, special, goal hold and opt-out leave native channels untouched',()=>{
 const mutations=[f=>f.state.carrier=null,f=>f.state.carrier='other',f=>f.ch.actor.alive=false,f=>f.ch.kidForm=false,f=>f.ch.dance='win',f=>f.ch.actor.specialActive={},f=>f.ch.actor.superJumpState={},f=>f.state.goalHold={},f=>f.ch.s3RainmakerMotionEnabled=false];
 for(const change of mutations){const f=fixture();change(f);f.ch.P.fill(.123);const before=Array.from(f.ch.P),source={...f.ch.sourceMotion};
  assert.equal(applyRainmakerPose(f.ch,{},C,f.match,1/60),false);assert.deepEqual(Array.from(f.ch.P),before);assert.deepEqual(f.ch.sourceMotion,source);
 }
});
test('reuses the one final weapon owner and all model geometry; no frame array or math-object allocation',()=>{
 const file=new URL('../runtime/ranked/rainmaker-motion.mjs',import.meta.url),source=fs.readFileSync(file,'utf8');
 assert.doesNotMatch(source.replace(/\/\/[^\n]*/g,''),/\bnew\s|\.clone\(|\.map\(|\.slice\(|\.push\(|setTimeout|requestAnimationFrame/);
 const family=fs.readFileSync(new URL('../runtime/weapon-handoff-motion.mjs',import.meta.url),'utf8');
 assert.equal((family.match(/proto\._applyPose = function/g)||[]).length,1);
 assert.match(family,/G\?\.match\?\.mode === 'rainmaker'\) applyRainmakerPose/);
 const model=fs.readFileSync(new URL('../runtime/ranked/rainmaker-model.mjs',import.meta.url),'utf8');
 const update=model.slice(model.indexOf('  function update('));assert.doesNotMatch(update,/\bnew THREE\./);
 assert.match(update,/mesh\.position\.copy\(point\)/);assert.match(update,/rainmakerAimQuaternion\(aimQ/);
});

test('canonical string and numeric IDs match without allocating state for a noncarrier',()=>{
 const f=fixture();f.ch.actor.nid=17;f.state.carrier='other';const keys=Object.keys(f.ch);assert.equal(applyRainmakerPose(f.ch,{},C,f.match,1/60),false);assert.deepEqual(Object.keys(f.ch),keys);
 f.state.carrier='017';assert.equal(applyRainmakerPose(f.ch,{},C,f.match,1/60),false);
 f.state.carrier='17';assert.equal(applyRainmakerPose(f.ch,{},C,f.match,1/60),true);assert.equal(f.ch._rainmakerId,'17');
 f.ch.actor.nid=18;f.state.carrier='18';assert.equal(applyRainmakerPose(f.ch,{},C,f.match,1/60),true);assert.equal(f.ch._rainmakerId,'18');
});

// Direction inputs to the upright frame are finite, as supplied by Actor aim.
// Character's visual stream is a private seeded closure, not gameplay Math.random.
test('visual RNG is per-character and does not consume the gameplay random stream',()=>{
 const character=fs.readFileSync(new URL('../../../inkwave-public/src/game/character.js',import.meta.url),'utf8');
 const actor=fs.readFileSync(new URL('../../../inkwave-public/src/game/actor.js',import.meta.url),'utf8');
 const spread=fs.readFileSync(new URL('../runtime/weapon-edgecases.mjs',import.meta.url),'utf8');
 const definition=character.match(/^function mulberry\(seed\).*$/m)?.[0];assert(definition);
 let gameplayDraws=0;const math=Object.create(Math);math.random=()=>{gameplayDraws++;return .5;};
 const make=new Function('Math',definition+';return mulberry;')(math),a=make(17),b=make(17),reference=make(17);
 for(let i=0;i<1000;i++)a();for(let i=0;i<100;i++)assert.equal(b(),reference());assert.equal(gameplayDraws,0);
 assert.match(character,/const seed = hashStr\(this.name\);[\s\S]*?this.rng = mulberry\(seed\)/);
 assert.match(actor,/this.character = new CharacterClass\(\{ color: G.teamColors\[team\], weapon, style, name, isLocal \}\)/);
 assert.doesNotMatch(actor,/character\.rng|\brng\s*:/);assert.match(spread,/radiusSample\(Math.random\(\)\)/);
});

test('upright objective aim is shared, normalized and continuous over heading seams and near-vertical pitch',()=>{
 const q=new THREE.Quaternion(),work=new THREE.Quaternion(),axis=new THREE.Vector3(),aim=new THREE.Vector3(),forward=new THREE.Vector3(),up=new THREE.Vector3(),a=new THREE.Quaternion(),b=new THREE.Quaternion();
 for(let i=0;i<=72;i++)for(const pitch of [-Math.PI/2+1e-7,-1.05,0,1.15,Math.PI/2-1e-7]){
  const yaw=-Math.PI+i*Math.PI/36;aim.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
  rainmakerAimQuaternion(q,aim,0,yaw,axis,work);forward.set(0,0,1).applyQuaternion(q);up.set(0,1,0).applyQuaternion(q);
  assert(forward.distanceTo(aim)<1e-8);assert(up.y>=-1e-10);near(q.length(),1,'unit rotation');
 }
 for(const pitch of [-1.05,0,1.15]){for(const [q,yaw]of [[a,Math.PI-1e-8],[b,-Math.PI+1e-8]]){aim.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));rainmakerAimQuaternion(q,aim,.22,yaw,axis,work);}assert(a.angleTo(b)<1e-7);}
 // Exact vertical uses the finite actor heading; a matching near-vertical
 // direction approaches that same frame without an arbitrary roll flip.
 for(const y of [-1,1])for(const yaw of [-Math.PI,-1,0,1,Math.PI]){
  aim.set(0,y,0);rainmakerAimQuaternion(a,aim,0,yaw,axis,work);
  aim.set(Math.sin(yaw)*1e-9,y,Math.cos(yaw)*1e-9).normalize();rainmakerAimQuaternion(b,aim,0,yaw,axis,work);
  assert(a.toArray().every(Number.isFinite));assert(a.angleTo(b)<1e-7);
 }
 const {ch,state,match}=fixture();state.charge={value:1};
 for(const threshold of [.4,1.15]){const z=[];for(const aimPitch of [threshold-1e-7,threshold+1e-7]){applyRainmakerPose(ch,{aimPitch},C,match,1/60);z.push(ch.P[C.ANC+2]);}assert(Math.abs(z[1]-z[0])<1e-6,'continuous bounded forward reach');}
 const owner=fs.readFileSync(new URL('../runtime/weapon-handoff-motion.mjs',import.meta.url),'utf8'),model=fs.readFileSync(new URL('../runtime/ranked/rainmaker-model.mjs',import.meta.url),'utf8');
 assert.match(owner,/rainmakerAimQuaternion\(q3, v5, ch\._rainmakerPitch/);assert.match(model,/if \(ch\._rainmakerPose\) rainmakerAimQuaternion\(aimQ, aim, ch\._rainmakerPitch/);assert.match(model,/else aimQ\.setFromUnitVectors\(forward, aim\)/);
});
