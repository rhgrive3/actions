import test from 'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{gunzipSync}from'node:zlib';import{createHash}from'node:crypto';
import*as T from'../../../inkwave-public/vendor/three/build/three.module.js';
import{createVerticalShaftReturn,verticalShaftReturnWindow}from'../runtime/roller-vertical-shaft-return.mjs';
import{floorEvaluator}from'../../../scripts/lib/inkwave-roller-floor-constraints.mjs';
import{createVerticalShaftReturn as frozenEcf5}from'./fixtures/roller-vertical-shaft-return.ecf5eedb.source.mjs';
const saved=JSON.parse(gunzipSync(fs.readFileSync(new URL('../../../reports/roller-ground-boundary-20261023/observed.json.gz',import.meta.url))));
const rows=new Map();for(let tick=35;tick<=58;tick++){const e=saved.layerEvents.filter(x=>x.tick===tick);rows.set(tick,{input:e.find(x=>x.stage==='rollerIKIn'&&x.side==='R'),normal:e.find(x=>x.stage==='nativeIKIn'&&x.side==='R')});}
const kid=e=>({quaternion:new T.Quaternion().fromArray(e.constraints.kid.q),scale:new T.Vector3().fromArray(e.constraints.kid.scale)}),
 angle=(a,b)=>new T.Quaternion().fromArray(a).angleTo(new T.Quaternion().fromArray(b)),near=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<1e-12);
function replay(release=48){const read=createVerticalShaftReturn(),owner={},attack={vertical:true,released:true,windup:31/60,interval:56/60},result=[];
 for(let tick=40;tick<=56;tick++){const{input:e,normal}=rows.get(tick),socket=new T.Quaternion().fromArray(e.constraints.handR.q),k=kid(e);attack.elapsed=e.attack?.elapsed??tick/60;
  const candidate=read(owner,attack,new T.Quaternion().fromArray(e.quaternion),socket,k,tick>=release),evaluate=floorEvaluator(e.constraints,e.target),out=candidate?evaluate(candidate.toArray()):evaluate(normal.quaternion,{applyAlign:false});
  const floor=saved.frames.find(r=>r.frame===tick).floorSearch;
  if(!candidate)read.capture(owner,new T.Quaternion().fromArray(normal.quaternion),socket,k,floor.axis,floor.a);
  result.push({tick,candidate:!!candidate,...out});}
 return{read,owner,result};}

test('saved production snapshot reproduces q0/qUp and old-fails/new-passes49 without a late residual',()=>{
 const{read,owner,result}=replay(),s=read.snapshot(owner);
 assert(near(s.q0,[.20311659924998873,-.16747970938845552,.9642774157834771,.029381277409551522]));
 assert(near(s.qUp,[.15063963948459475,.6908745899336225,.6908745899336226,-.15063963948459475]));
 assert(Math.abs(s.t0-rows.get(48).input.attack.elapsed)<1e-12);assert.equal(s.end,56/60);
 for(const r of result){assert(r.error<=.003&&r.leftReachError<1e-12&&r.rightReachError<1e-12);if(r.tick<=48||r.tick===56)assert(near(r.q,rows.get(r.tick).normal.quaternion),'untouched boundary '+r.tick);}
 const old=angle(rows.get(48).normal.quaternion,rows.get(49).normal.quaternion),current=angle(result[8].q,result[9].q);
 assert(old>1.8,'unchanged negative control exposes original jump');assert(Math.abs(current-.2286678491072095)<1e-12,'independent replay expectation');
 assert.equal(s.fallbacks,0);assert.equal(s.active,false);
});

test('release captures only a corrected native sample; clear late carry stays native through the deadline',()=>{
 for(const release of[40,46,48,49,52,55,56]){const r=replay(release),s=r.read.snapshot(r.owner),first=Math.max(46,release);
  if(first>=56){assert.equal(s,null);continue;}
  assert(Math.abs(s.t0-rows.get(first).input.attack.elapsed)<1e-12);
  if(first>=49){assert.equal(s.captures,0);assert.equal(s.spent,true);assert(r.result.every(x=>!x.candidate),'no later retry after clear first sample');}
  const start=r.result.find(x=>x.tick===first);assert(near(start.q,rows.get(first).normal.quaternion));
  assert(near(r.result.at(-1).q,rows.get(56).normal.quaternion));
 }
 for(const[windup,interval]of[[12,33],[31,56],[42,63]]){const a={windup:windup/60,interval:interval/60},w=verticalShaftReturnWindow(a);assert.equal(w.end,interval/60);assert(w.back<w.end);}
});

test('waypoint uses the real socket, world up and live scale; fixed waypoint and record storage are reused',()=>{
 const read=createVerticalShaftReturn(),owner={},a={windup:31/60,interval:56/60,elapsed:48/60},input=new T.Quaternion().setFromEuler(new T.Euler(.3,-.2,.7)),
 socket=new T.Quaternion().setFromEuler(new T.Euler(.2,.1,-.3)),k={quaternion:new T.Quaternion().setFromEuler(new T.Euler(.4,.7,-.1)),scale:new T.Vector3(1.2,.9,1.1)};
 let qClones=0,vClones=0;const qc=T.Quaternion.prototype.clone,vc=T.Vector3.prototype.clone;
 T.Quaternion.prototype.clone=function(){qClones++;return qc.call(this);};T.Vector3.prototype.clone=function(){vClones++;return vc.call(this);};
 try{assert.equal(read(owner,a,input,socket,k,true),null);read.capture(owner,input,socket,k,2,1.3);assert.deepEqual([qClones,vClones],[5,2],'one reused record');const initial=read.snapshot(owner),up=new T.Quaternion().fromArray(initial.qUp),shaft=new T.Vector3(0,0,1).applyQuaternion(up.multiply(socket.clone().invert())).multiply(k.scale).applyQuaternion(k.quaternion).normalize();
  assert(shaft.distanceTo(new T.Vector3(0,1,0))<1e-12);
  const allocated=[qClones,vClones];for(let i=1;i<48;i++){a.elapsed=(48+i/6)/60;read(owner,a,input,socket,k,true);}assert.deepEqual([qClones,vClones],allocated,'no per-sample quaternion/vector clones');
  k.quaternion.identity();k.scale.set(1,1,1);a.elapsed=55.9/60;read(owner,a,input,socket,k,true);assert.deepEqual(read.snapshot(owner).qUp,initial.qUp,'waypoint does not chase transform');
 }finally{T.Quaternion.prototype.clone=qc;T.Vector3.prototype.clone=vc;}
});

test('active interruption spends only that attack; first release and a new attack remain reusable',()=>{
 const read=createVerticalShaftReturn(),owner={},e=rows.get(48).input,k=kid(e),socket=new T.Quaternion().fromArray(e.constraints.handR.q),input=new T.Quaternion().fromArray(e.quaternion),a={windup:31/60,interval:56/60,elapsed:48/60};
 const begin=attack=>{assert.equal(read(owner,attack,input,socket,k,true),null);read.capture(owner,input,socket,k,2,1.3);};begin(a);a.elapsed=49/60;assert(read(owner,a,input,socket,k,true));
 assert.equal(read(owner,a,input,socket,k,false),null);assert.equal(read.snapshot(owner).active,false);assert.equal(read.snapshot(owner).spent,true);
 a.elapsed=53/60;begin(a);assert.equal(read.snapshot(owner).captures,1);assert.equal(read.snapshot(owner).active,false,'same attack never recaptures');
 read(owner,null,input,socket,k,false);begin(a);assert.equal(read.snapshot(owner).captures,1,'null cancellation does not erase spent identity');
 const next={...a,elapsed:48/60};assert.equal(read(owner,next,input,socket,k,false),null);begin(next);assert.equal(read.snapshot(owner).captures,2,'held before first activation is not consumed');
 next.elapsed=49/60;assert(read(owner,next,input,socket,k,true));next.elapsed=48/60;begin(next);assert.equal(read.snapshot(owner).captures,2,'rewinding same identity does not rearm');
 const fresh={...a,elapsed:48/60};begin(fresh);assert.equal(read.snapshot(owner).captures,3);read.clear(owner);assert.equal(read.snapshot(owner).active,false);begin(fresh);assert.equal(read.snapshot(owner).captures,3);
 assert.equal(read(owner,{...a,swingShape:'heavy'},input,socket,k,true),null);k.scale.y=0;assert.equal(read(owner,a,input,socket,k,true),null);
});

test('frozen ecf5 recaptures after repress; current helper retains one-shot ownership',()=>{
 assert.equal(createHash('sha256').update(fs.readFileSync(new URL('./fixtures/roller-vertical-shaft-return.ecf5eedb.source.mjs',import.meta.url))).digest('hex'),'9970995021e44d08059d2b0b294326a2a79a6c2de6d2fb9a087bb0e1af136d8c');
 for(const[factory,expected]of[[frozenEcf5,2],[createVerticalShaftReturn,1]]){const read=factory(),owner={},input=new T.Quaternion(),socket=new T.Quaternion(),k={quaternion:new T.Quaternion(),scale:new T.Vector3(1,1,1)},attack={windup:31/60,interval:56/60};
  for(const[tick,enabled]of[[47,false],[48,true],[49,true],[51,false],[52,false],[53,true],[54,true]]){attack.elapsed=tick/60;read(owner,attack,input,socket,k,enabled);read.capture(owner,input,socket,k,2,1.3);}
  assert.equal(read.snapshot(owner).captures,expected);
 }
});

test('a clear first native sample consumes no curve and cannot retry later in the same attack',()=>{
 const read=createVerticalShaftReturn(),owner={},input=new T.Quaternion(),socket=new T.Quaternion(),k={quaternion:new T.Quaternion(),scale:new T.Vector3(1,1,1)},a={windup:31/60,interval:56/60,elapsed:52/60};
 assert.equal(read(owner,a,input,socket,k,true),null);read.capture(owner,input,socket,k,-1,0);
 assert.equal(read.snapshot(owner).captures,0);assert.equal(read.snapshot(owner).spent,true);
 a.elapsed=53/60;assert.equal(read(owner,a,input,socket,k,true),null);read.capture(owner,input,socket,k,2,1.3);assert.equal(read.snapshot(owner).captures,0);
 const next={...a,elapsed:48/60};assert.equal(read(owner,next,input,socket,k,true),null);read.capture(owner,input,socket,k,2,1.3);assert.equal(read.snapshot(owner).captures,1);
});
