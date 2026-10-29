import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptHistoricalSourceMotion20261026,restoreHistoricalSourceMotion20261026} from '../queue-historical-source-motion-20261026-adapter.mjs';
import {adaptWalkPresentation} from '../walk-presentation-adapter.mjs';
import {adaptRemainingVisualQueue20261027} from '../queue-remaining-visual-20261027-adapter.mjs';
import {adaptOffscreenHairTargets} from '../offscreen-hair-target-adapter.mjs';
import {replaceOnce} from '../adapter.mjs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
const REL='src/game/motion/source-controller.js';
const fixtureBytes=fs.readFileSync(new URL('./fixtures/queue-historical-source-motion-before-20261026.json',import.meta.url));
const fixture=JSON.parse(fixtureBytes);
const before=fixture.modules[REL].source,after=adaptHistoricalSourceMotion20261026(REL,before);
const sha=s=>createHash('sha256').update(s).digest('hex');
const method=s=>{const a=s.indexOf(' actionClip('),b=s.indexOf('\n sampleManual',a);return new Function('return ({'+s.slice(a,b)+'});')().actionClip;};
const methods=[method(before),method(after)];
const helper=after.slice(after.indexOf('// Historical queue: one exact dt slot'));
const names=['iwMotionResponse24Exp','iwMotionResponse12Exp','iwMotionResponse10Expm1','iwMotionResponse12Expm1','iwMotionResponse7Exp','iwMotionResponse8Expm1'];
const rates=[24,12,10,12,7,8],modes=['exp','exp','expm1','expm1','exp','expm1'];
const kernels=math=>new Function('Math',helper+'\nreturn ['+names.join(',')+'];')(math);
// Independently pinned exact source-controller anchors owned by the later 2026-10-27
// visual queue. Reverse in strict reverse order; this is text-only compatibility,
// not a performance or visual acceptance. Zero or multiple matches fail closed.
const laterOwnerPairs=[["const lm=s.localMove||{};this.treadmill=!c.inWorld&&dist<1e-10&&Number(s.speed)>0&&Math.hypot(lm.x||0,lm.z||0)>0;","const lm=s.localMove||{};let treadmillLength;this.treadmill=!c.inWorld&&dist<1e-10&&Number(s.speed)>0&&(treadmillLength=Math.hypot(lm.x||0,lm.z||0))>0;"],["const n=this.treadmill?Math.hypot(lm.x||0,lm.z||0):dist;","const n=this.treadmill?treadmillLength:dist;"],["  this.gaitSpeed=this.pivoting?Math.max(this.speed,Math.abs(this.turnRate)*Math.hypot(c.rest.footL.x,c.rest.footL.z+0.11)):this.speed;","  if(this.pivoting&&(!Object.is(this._pivotRestX,c.rest.footL.x)||!Object.is(this._pivotRestZ,c.rest.footL.z))){this._pivotRestX=c.rest.footL.x;this._pivotRestZ=c.rest.footL.z;this._pivotRadius=Math.hypot(c.rest.footL.x,c.rest.footL.z+0.11);}\n  this.gaitSpeed=this.pivoting?Math.max(this.speed,Math.abs(this.turnRate)*this._pivotRadius):this.speed;"],["locomotionProfile,sampleContact,feasibleContact,smooth5","locomotionProfile,sampleContact,sampleContactPair,feasibleContact,smooth5"],["    for(let i=0;i<2;i++){\n     this.contact[i]+=sampleContact(p,i,normalizedFrame)","    const contactSamples=sampleContactPair(p,normalizedFrame,this._contactSamples||(this._contactSamples=new Float64Array(2)));\n    for(let i=0;i<2;i++){\n     this.contact[i]+=contactSamples[i]"],["sampleContactPair,feasibleContact,smooth5","sampleContactPair,feasibleContact,feasibleContactPrepared,smooth5"],["   contactArg.speed=this.speed;contactArg.cadenceHz=cadenceHz;contactArg.legReach=this.character.limbs.legL.a+this.character.limbs.legL.b;","   contactArg.speed=this.speed;contactArg.cadenceHz=cadenceHz;contactArg.legReach=this.character.limbs.legL.a+this.character.limbs.legL.b;\n   const worldCycle=Math.max(0,contactArg.speed)/Math.max(1e-6,contactArg.cadenceHz),reachDuty=contactArg.legReach*0.62/Math.max(1e-6,worldCycle);"],["feasibleContact(p,i,normalizedFrame,contactArg)","feasibleContactPrepared(p,i,normalizedFrame,reachDuty)"]];
function reverseLaterOwner(source, mutate=(s)=>s){
 let value=source;for(let i=laterOwnerPairs.length-1;i>=0;i--){
  const [original,later]=laterOwnerPairs[i];value=mutate(value,later,i);
  value=replaceOnce(value,later,original,'pinned later owner '+i);
 }return value;
}
// The hair adapter runs before the motion FK owner. The pinned historical
// fixture already contains that owner's idle-balance rewrite, so translate
// exactly that one reviewed anchor into the fixture's composition boundary.
function composeHairOwner(source,pairs=[]){
 return adaptOffscreenHairTargets(REL,source,(text,original,later,label)=>{
  if(label==='#845 suppress hidden idle hair inputs'){
   assert.equal(original,'this.bodyBalance.add(idleProfile,1);this.hairTargets.add(this.pose,idleProfile,1);');
   assert.equal(later,'this.bodyBalance.add(idleProfile,1);if(!c._oobBudget)this.hairTargets.add(this.pose,idleProfile,1);');
   const from='this.bodyBalance.add(idleProfile,1);',to='this.bodyBalance.add(idleProfile,1,this.bodyBalance._centerFk);';
   original=original.replace(from,to);later=later.replace(from,to);
  }
  pairs.push([original,later,label]);return replaceOnce(text,original,later,label);
 });
}
// The separately reviewed be1c4b71 hair-input pool changed exactly four
// replacement outputs. Retain the original7d2f7f0e receipt and the new receipt;
// every source anchor and complete current composition still fails closed.
const hairInputRowChanges=[
 [
  "#845 retain only clips that contribute hair, before action overlays",
  "  this._iwHairClipCount=this.currentClips.length;this._iwHairLoop=!special;\n  // Pivoting changes the feet, not the gaze/weapon pose into a full lateral",
  "  if(this._iwHairDeferred){\n   // Optimized diagnostics own pooled inputs. Read them without materializing\n   // public clip descriptors, then retain our own scalar rows across updates.\n   const frame=this._iwMotionClipFrame?.();\n   const clips=frame?(frame.ready?frame.cached:frame.rows):this.currentClips;\n   const count=frame&&!frame.ready?frame.count:clips.length;\n   const rows=this._iwHairClips||(this._iwHairClips=[]);\n   for(let i=0;i<count;i++){\n    const item=clips[i],row=rows[i]||(rows[i]={name:null,frame:0,weight:0});\n    row.name=item.name;row.frame=item.frame;row.weight=item.weight;\n   }\n   this._iwHairClipCount=count;this._iwHairLoop=!special;\n  }\n  // Pivoting changes the feet, not the gaze/weapon pose into a full lateral"
 ],
 [
  "#845 rebuild deferred hair before the first visible accessory solve",
  " _ensureHairTargets(){\n  if(!this._iwHairDeferred)return;\n  this.hairTargets.clear();\n  for(let i=0;i<this._iwHairClipCount;i++){\n   const item=this.currentClips[i];\n   this.bank.sample(item.name,item.frame,this.tmp,this._iwHairLoop);\n   this.hairTargets.add(this.tmp,locomotionProfile(this.bank,item.name),item.weight);\n  }\n  if(this._iwHairTransition<1)this.hairTargets.mix(this.previousHairTargets,1-this._iwHairTransition);\n  this._iwHairDeferred=false;\n }\n applyAccessories(dt){if(this.active&&this.pose){if(!this.manual)this._ensureHairTargets();",
  " _ensureHairTargets(){\n  if(!this._iwHairDeferred)return;\n  this.hairTargets.clear();\n  for(let i=0;i<this._iwHairClipCount;i++){\n   const item=this._iwHairClips[i];\n   this.bank.sample(item.name,item.frame,this.tmp,this._iwHairLoop);\n   this.hairTargets.add(this.tmp,locomotionProfile(this.bank,item.name),item.weight);\n   item.name=null;\n  }\n  if(this._iwHairTransition<1)this.hairTargets.mix(this.previousHairTargets,1-this._iwHairTransition);\n  this._iwHairDeferred=false;\n }\n applyAccessories(dt){if(this.active&&this.pose){if(!this.manual)this._ensureHairTargets();"
 ],
 [
  "#845 manual poses discard automatic pending hair inputs",
  " sampleManual(){\n  this._iwHairDeferred=false;this._iwHairClipCount=0;",
  " sampleManual(){\n  this._iwHairDeferred=false;this._iwHairClipCount=0;if(this._iwHairClips)this._iwHairClips.length=0;"
 ],
 [
  "#845 drop deferred bank inputs on bank changes and disposal",
  " clearBankCaches(){\n  this._iwHairDeferred=false;this._iwHairClipCount=0;",
  " clearBankCaches(){\n  this._iwHairDeferred=false;this._iwHairClipCount=0;if(this._iwHairClips)this._iwHairClips.length=0;"
 ]
];
function legacyHairOwnerPairs(pairs){
 let changed=0;
 const prior=pairs.map(([original,later,label])=>{
  const update=hairInputRowChanges.find(row=>row[0]===label);
  if(!update)return [original,later,label];
  assert.equal(later,update[2],'exact reviewed hair-input row replacement');changed++;
  return [original,update[1],label];
 });
 assert.equal(changed,4,'all four reviewed hair-input row changes are present');
 return prior;
}
function reverseHairOwner(source,pairs,mutate=(s)=>s){
 let value=source;for(let i=pairs.length-1;i>=0;i--){
  const [original,later,label]=pairs[i];value=mutate(value,later,i);
  value=replaceOnce(value,later,original,label);
 }return value;
}
const original=(math,index,dt)=>modes[index]==='exp'?1-math.exp(-rates[index]*dt):-math.expm1(-rates[index]*dt);

test('pinned source-controller reconstructs the walk owner and historical queue (text only)',()=>{
 assert.equal(sha(fixtureBytes),'92b24e5c1ff331c66623e73988d176561c8b47875fc6bdeffc85c799870c598a','frozen fixture bytes');
 assert.equal(sha(before),fixture.modules[REL].sha256);
 assert.equal(restoreHistoricalSourceMotion20261026(REL,after),before);
 assert.equal(adaptHistoricalSourceMotion20261026('unrelated','same'),'same');
 assert.throws(()=>adaptHistoricalSourceMotion20261026(REL,after),/composition conflict/);
 assert.throws(()=>adaptHistoricalSourceMotion20261026(REL,''),/composition conflict/);
 const current=adaptBuildSource(REL,fs.readFileSync(new URL('../../../inkwave-public/'+REL,import.meta.url),'utf8'));
 const afterHistoricalRestore=restoreHistoricalSourceMotion20261026(REL,current);
 assert.equal(sha(JSON.stringify(laterOwnerPairs)),'26654dc4115ea24a28d7fad6c73eacafcd41298c7c4a34f183fbe790de638976','pinned later owner anchor pairs');
 const currentBeforeLaterOwner=reverseLaterOwner(afterHistoricalRestore);
 for(let target=0;target<laterOwnerPairs.length;target++){
  for(const mode of ['missing','duplicate'])assert.throws(()=>reverseLaterOwner(afterHistoricalRestore,(text,anchor,i)=>i!==target?text:mode==='missing'?text.replace(anchor,''):text.replace(anchor,anchor+anchor)),/expected exactly one/);
 }
 // Independently pinned pre-owner bytes plus the precise later walk owner
 // anchors; this checks source composition only, not Character behavior.
 const unique=(s,from,to)=>{const i=s.indexOf(from);assert.ok(i>=0&&s.indexOf(from,i+from.length)<0,'unique walk owner anchor');return s.slice(0,i)+to+s.slice(i+from.length);};
 const importAnchor="import { nativeWeaponPoseRequired, sourceActionUpperOnly } from '../../../patches/splatoon3/runtime/source-weapon-owner.mjs';";
 let composed=unique(before,importAnchor,"import { walkPresentationSpeed } from '../../../patches/local-quality/walk-presentation.mjs';\n"+importAnchor);
 composed=unique(composed,'  this.speed=dt>0?dist/dt:0;this.velocityY=dt>0?dy/dt:0;this.distance+=dist;',`  const rawTravelSpeed=dt>0?dist/dt:0;
  const ordinaryWalk=(s.form||'kid')==='kid'&&(s.grounded??true)&&!this.manual;
  this.speed=walkPresentationSpeed(this,rawTravelSpeed,dt,teleport||!ordinaryWalk);this.velocityY=dt>0?dy/dt:0;this.distance+=dist;`);
 const hairPairs=[],withHair=composeHairOwner(composed,hairPairs);
 assert.equal(hairPairs.length,9,'all reviewed hair owner anchors are represented');
 assert.equal(sha(JSON.stringify(legacyHairOwnerPairs(hairPairs))),'9b6dc62be57eb1240fff1a4816ac2f15775348089c4ed32a2b92df77a6aa5aad','original frozen hair owner anchor pairs');
 assert.equal(sha(JSON.stringify(hairPairs)),'8e79598ba85b25232222c948cb254eededae9958c9d6f922f7b70a3b3e43bf75','reviewed pooled hair owner anchor pairs');
 assert.equal(reverseHairOwner(withHair,hairPairs),composed,'hair owner reverses on independently pinned walk composition');
 for(let target=0;target<hairPairs.length;target++)for(const mode of ['missing','duplicate'])
  assert.throws(()=>reverseHairOwner(currentBeforeLaterOwner,hairPairs,(text,anchor,i)=>i!==target?text:mode==='missing'?text.replace(anchor,''):text.replace(anchor,anchor+anchor)),/expected exactly one/);
 const restoredCurrent=reverseHairOwner(currentBeforeLaterOwner,hairPairs);
 assert.equal(current,adaptRemainingVisualQueue20261027(REL,adaptHistoricalSourceMotion20261026(REL,withHair)),'pinned walk, reviewed hair owner, historical owner and subsequent visual queue compose exactly');
 assert.equal(restoredCurrent,composed,'pinned historical source plus exact walk owner anchors');
 const walkImport="import { walkPresentationSpeed } from '../../../patches/local-quality/walk-presentation.mjs';\n";
 const ownerImport="import { nativeWeaponPoseRequired, sourceActionUpperOnly }";
 let expected=adaptWalkPresentation(REL,before,replaceOnce);
 assert.ok(expected.startsWith(walkImport)); expected=expected.slice(walkImport.length);
 expected=replaceOnce(expected,ownerImport,walkImport+ownerImport,'walking import order');
 assert.equal(current,adaptRemainingVisualQueue20261027(REL,adaptHistoricalSourceMotion20261026(REL,composeHairOwner(expected))),'walk adapter and later owners retain the pinned source composition');
 assert.equal(restoredCurrent,expected,'prior composition plus the reviewed walking presentation is retained');
 // Both independently reconstructed ownership paths must agree byte-for-byte.
 assert.equal(expected,composed,'walk adapter and pinned owner anchors agree');
 const speedAnchor='  this.speed=dt>0?dist/dt:0;this.velocityY=dt>0?dy/dt:0;this.distance+=dist;';
 assert.throws(()=>adaptWalkPresentation(REL,before.replace(speedAnchor,''),replaceOnce),/expected exactly one/);
 assert.throws(()=>adaptWalkPresentation(REL,before+speedAnchor,replaceOnce),/expected exactly one/);
 assert.throws(()=>unique(before.replace(importAnchor,''),importAnchor,''),/unique walk owner anchor/);
 assert.throws(()=>unique(before+importAnchor,importAnchor,''),/unique walk owner anchor/);
 assert.ok(after.includes('if(name===undefined){name=this.choose([`${prefix}_${family}`,`${prefix}_Nrml`,...Array.from(this.bank.clips.keys()).filter(k=>k.startsWith(prefix))]);dances.set(danceKey,name);}'),'dance eager lookup remains unchanged');
 assert.equal(/\bFunction\b/.test(after),false,'no dynamic-code identifier changes the existing orphan scanner gate');
});

test('action candidate removal preserves 17920 native-map priorities and live map mutations',()=>{
 const clips=['Attack_BBll','Attack_Rllr','Shoot_Nrml','Shoot_Rllr','ThrowBomb_Rllr','ThrowBomb_Nrml','Damage','ToHumanRespawn'];let cases=0;
 for(let mask=0;mask<256;mask++)for(const family of ['Nrml','BBll','Rllr','Chrg','Glng','Sprd',undefined])for(const event of ['shoot','slosh','flick','charge_release','throw','hit','spawn','unknown',null,undefined]){
  const receiver={bank:{clips:new Map(clips.filter((_,i)=>mask&(1<<i)).map(n=>[n,{}]))}};
  assert.equal(methods[1].call(receiver,family,event),methods[0].call(receiver,family,event));cases++;
 }
 assert.equal(cases,17920);
 const receivers=methods.map(()=>({bank:{clips:new Map()}}));
 for(const key of ['ThrowBomb_Nrml','ThrowBomb_Rllr','Damage','Attack_BBll']){
  receivers.forEach(r=>r.bank.clips.set(key,{}));assert.equal(methods[1].call(receivers[1],'Rllr','throw'),methods[0].call(receivers[0],'Rllr','throw'));
  receivers.forEach(r=>r.bank.clips.delete(key));assert.equal(methods[1].call(receivers[1],'Rllr','throw'),methods[0].call(receivers[0],'Rllr','throw'));
 }
});

test('action getters, replacement banks, string coercion and thrown lookups retain their original order',()=>{
 function run(fn,mode){
  const trace=[];let reads=0;
  const lastClip={has(name){trace.push(['last-call',name,this===lastClip]);return true;}};
  const receiver={get bank(){trace.push('bank');reads++;if(mode==='throw-bank')throw Error('bank failure');return reads===1?first:{get clips(){trace.push('last-clips');return lastClip;}};}};
  const firstClip={get has(){trace.push('first-has');if(mode==='throw-has')throw Error('has failure');return function(name){trace.push(['first-call',name,this===firstClip]);if(mode==='throw-call')throw Error('call failure');return false;};}};
  const first={get clips(){trace.push('first-clips');return firstClip;}};
  const family={toString(){trace.push('family-string');if(mode==='throw-family')throw Error('family failure');return 'Rllr';}};
  let result,error;try{result=fn.call(receiver,family,mode==='unknown'?'unknown':'throw');}catch(e){error=[e.name,e.message];}
  return {result,error,trace};
 }
 for(const mode of ['replace-bank','throw-bank','throw-has','throw-call','throw-family','unknown'])assert.deepEqual(run(methods[1],mode),run(methods[0],mode),mode);
});

test('response slots preserve signed zero, abnormal dt and exact arithmetic and share all same-dt actors',()=>{
 const counts={exp:0,expm1:0},math=Object.create(Math);
 for(const mode of ['exp','expm1'])math[mode]=function(x){assert.equal(this,undefined);counts[mode]++;return Math[mode](x);};
 // Cached native captures are called without a receiver; actual Math functions ignore it.
 const funcs=kernels(math);
 for(const dt of [undefined,null,0,-0,1/30,1/60,1/120,.1,.12,-.01,Number.MIN_VALUE,NaN,Infinity,-Infinity])for(let i=0;i<funcs.length;i++){
  // Non-number fallback deliberately retains Math as the callback receiver.
  if(typeof dt!=='number')continue;
  assert.ok(Object.is(funcs[i](dt),original(Math,i,dt)),`${names[i]} / ${String(dt)}`);
 }
 funcs.forEach(f=>f(1/60));counts.exp=counts.expm1=0;
 for(let frame=0;frame<120;frame++)for(let actor=0;actor<8;actor++)funcs.forEach(f=>f(1/60));
 assert.deepEqual(counts,{exp:0,expm1:0});funcs.forEach(f=>f(1/30));assert.deepEqual(counts,{exp:3,expm1:3});
});

test('changed Math callbacks and coercing dt use uncached calls with the original Math receiver',()=>{
 for(const i of [0,1,2,3,4,5]){
  const math=Object.create(Math),funcs=kernels(math),mode=modes[i];let gets=0,calls=0;
  Object.defineProperty(math,mode,{configurable:true,get(){gets++;return function(x){assert.equal(this,math);calls++;return Math[mode](x)+calls*.001;};}});
  const expected=[];let ec=0;for(const dt of [1/60,1/60,0,-0,NaN,undefined,null])expected.push(mode==='exp'?1-(Math[mode](-rates[i]*dt)+ ++ec*.001):-(Math[mode](-rates[i]*dt)+ ++ec*.001));
  const actual=[1/60,1/60,0,-0,NaN,undefined,null].map(dt=>funcs[i](dt));assert.deepEqual(actual,expected);assert.equal(gets,7);assert.equal(calls,7);
  let coercions=0;const dt={valueOf(){return ++coercions/60;}};funcs[i](dt);funcs[i](dt);assert.equal(coercions,2);assert.equal(calls,9);
  Object.defineProperty(math,mode,{value:Math[mode],configurable:true});assert.ok(Object.is(funcs[i](1/60),original(Math,i,1/60)));
 }
});

test('historical lazy dance shortcut has observable mutable-roster counterexamples and remains unadopted',()=>{
 const line=before.split('\n').find(l=>l.includes('if(name===undefined){')&&l.includes('dances.set'));
 const lazy="if(name===undefined){const direct=`${prefix}_${family}`,normal=`${prefix}_Nrml`;name=this.bank.clips.has(direct)?direct:this.bank.clips.has(normal)?normal:this.choose([direct,normal,...Array.from(this.bank.clips.keys()).filter(k=>k.startsWith(prefix))]);dances.set(danceKey,name);}";
 const compile=s=>new Function('prefix','family','let name;const dances=new Map(),danceKey=prefix+":"+family;'+s+';return name;');
 const old=compile(line),naive=compile(lazy);
 const receiver=custom=>{
  const clips=new Map([['Win_Rllr',{}],['Win_Other',{}]]);
  if(custom){const keys=clips.keys;clips.keys=function(){this.delete('Win_Rllr');return keys.call(this);};}
  return {bank:{clips},choose(names){for(const n of names)if(this.bank.clips.has(n))return n;throw Error('No source clip in '+names.join(', '));}};
 };
 assert.equal(old.call(receiver(true),'Win','Rllr'),'Win_Other');assert.equal(naive.call(receiver(true),'Win','Rllr'),'Win_Rllr');
 const chooseSource=before.split('\n').find(line=>line.startsWith(' choose(candidates)'));
 const NativeController=new Function('return class SourceMotionController {'+chooseSource+'};')();
 const native=()=>{const c=new NativeController();c.bank={clips:new Map([['Win_Rllr',{}],['Win_Other',{}]])};return c;};
 const a=native(),b=native();a.bank.clips.set(1,{});b.bank.clips.set(1,{});
 for(const r of [a,b]){
  assert.equal(Object.getOwnPropertyDescriptor(r,'bank').value,r.bank);
  assert.equal(Object.getOwnPropertyDescriptor(r.bank,'clips').value,r.bank.clips);
  assert.equal(Object.getPrototypeOf(r.bank.clips),Map.prototype);
  assert.equal(r.bank.clips.keys,Map.prototype.keys);assert.equal(r.bank.clips.has,Map.prototype.has);
  assert.equal(r.choose,NativeController.prototype.choose);
 }
 assert.throws(()=>old.call(a,'Win','Rllr'),TypeError);assert.equal(naive.call(b,'Win','Rllr'),'Win_Rllr');
 const c=receiver(false),d=receiver(false);c.choose=d.choose=function(){return 'Win_Other';};
 assert.equal(old.call(c,'Win','Rllr'),'Win_Other');assert.equal(naive.call(d,'Win','Rllr'),'Win_Rllr');
 assert.equal(after.split('\n').find(l=>l.includes('if(name===undefined){')&&l.includes('dances.set')),line);
});

function pose(ch){
 ch.root.updateMatrixWorld(true);ch.skeleton.update();const m=ch.sourceMotion;
 return structuredClone({bones:ch.boneList.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray(),...b.matrixWorld.elements]),
  skeleton:[...ch.skeleton.boneMatrices],spring:[...ch.sp],hair:[...m.rootHair.state],phase:ch.phase,stance:[...ch.stance],muzzle:ch.getMuzzle(new ch.root.position.constructor()).toArray(),
  response:[m.shootBlend,m.pivotWeight,m.runBlend,m.strafeBalance,...m.direction],state:m.state,clips:m.currentClips,action:m.action,
  contacts:m.retarget.contacts.map(f=>[f.locked,f.anchor.toArray(),f.support.toArray(),f.airLift])});
}
test('actual source-loaded poses remain exact at 30/60/120 Hz with actions, dt normalization and shared actor gains',async()=>{
 const calls=[0,0];const apis=await Promise.all([before,after].map((code,i)=>sourceLoadedActorFixture({sourceOnly:true,moduleTransform:(rel,source)=>rel===REL?code:source,random:()=>{calls[i]++;return .4;}})));
 let checks=0;
 try{
  for(const hz of [30,60,120]){
   const actors=await Promise.all(apis.map(api=>api.make())),chars=actors.map(a=>a.character);chars.forEach(ch=>{ch.onEvent=null;ch.setLod('hero');});
   for(const weapon of ['shooter','slosher','charger','splatling'])for(let frame=0;frame<18;frame++){
    const dt=frame===3?0:frame===9?.12:1/hz;
    chars.forEach((ch,i)=>{if(frame===0)ch.setWeapon(weapon);apis[i].G.time+=dt;ch.root.position.x+=dt*(frame%3);ch.root.position.z+=dt*3;ch.root.rotation.y+=dt*.4;
     if(frame===4)ch.trigger('shoot');if(frame===6)ch.trigger('jump');if(frame===12)ch.trigger('land');if(frame===14)ch.trigger('throw');
     ch.update(dt,{form:'kid',grounded:frame<6||frame>=12,speed:3,localMove:{x:.2,z:1},ink:1,hp:1,firing:frame%4===0,aimPitch:.15,aimDist:10,vy:frame<9?2:-2});});
    assert.deepEqual(pose(chars[1]),pose(chars[0]),`${hz}/${weapon}/${frame}`);checks++;
   }
   for(const dt of [undefined,NaN,Infinity,-Infinity,-.01,-0,0,Number.MIN_VALUE,.25]){
    chars.forEach(ch=>ch.sourceMotion.advance(dt,{form:'kid',grounded:true,speed:0,localMove:{x:0,z:0},ink:1,hp:1}));
    assert.deepEqual(pose(chars[1]),pose(chars[0]),`normalized dt ${String(dt)}`);checks++;
   }
   apis.forEach(api=>api.reset());
  }
  assert.equal(calls[1],calls[0]);console.log(JSON.stringify({scope:'actual source-loaded Character; no browser FPS claim',poseComparisons:checks,randomCalls:calls}));
 }finally{apis.forEach(api=>api.reset());}
});
