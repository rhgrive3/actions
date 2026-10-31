import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {composed,declaration} from './queue-visual-world-20261031.helper.mjs';
const clamp=(v,a,b)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t,damp=(a,b,k,dt)=>lerp(a,b,1-Math.exp(-k*dt));
const rng=()=>{let s=735;return()=>((s=Math.imul(s,1664525)+1013904223>>>0)/2**32);};
function method(rel,klass,name,before,deps={}){const s=declaration(composed(rel,before),klass,name).source;return new Function(...Object.keys(deps),'return ({'+s+'}).'+name)(...Object.values(deps));}
const byte=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);

test('native gaze and treadmill gates preserve exact branches, state and random draws',()=>{
 const mj=t=>{t=clamp(t,0,1);return t*t*t*(10+t*(6*t-15));};
 const funcs=[true,false].map(b=>method('src/game/character.js','Character','_gazeTick',b,{clamp,lerp,damp,mj,X_BROWFLASH:2}));
 const random=rng();for(let i=0;i<10000;i++){
  const ex=i<8?[0,-0,.075,.075-1e-16,.075+1e-16,NaN,Infinity,-Infinity][i]:random()-.5,dy=random()-.5,dt=i%7===0?0:i%13===0?-.01:1/[30,60,120][i%3];
  const out=funcs.map(f=>{let calls=0;const events=[],o={gz:{st:-1,fx:0,fy:0,x:0,y:0,mT:.1,mx:.01,my:.02},rng:()=>{calls++;return .4;},kidForm:true,bl:{t:-1,next:1},_blinkStart:(...a)=>events.push(a),_mxPlay:(...a)=>events.push(a)};f.call(o,dt,ex,dy);return{o:o.gz,calls,events};});assert.deepEqual(out[0],out[1]);
 }
 const codes=[true,false].map(b=>composed('src/game/character.js',b));const kernels=codes.map(s=>{const start=s.indexOf('    const sv = s.speed ?? 0;'),end=s.indexOf('\n    if (this.tread)',start);return new Function('s','EMPTY_STATE','walkTreadAllowed',s.slice(start,end)+';return {tread:this.tread,lml:this.tread?lml:0};');});
 for(const hs of [0,.119,.12,1,NaN,Infinity])for(const speed of [0,.4,.401,NaN,Infinity])for(const v of [0,-0,.05,.051,NaN,Infinity]){const out=kernels.map(fn=>fn.call({hs,grounded:true},{speed,localMove:{x:v,z:0}},{},(_c,b)=>b));assert.deepEqual(out[0],out[1]);}
});

test('finger zero-amplitude gate preserves every actual joint Euler and spring/RNG side effect',()=>{
 const codes=[true,false].map(b=>composed('src/game/character.js',b)),names=['IKL','LTW','HANDPL','HANDPR','S_GRIP','S_GRIPL'];const deps=Object.fromEntries(names.map((k,i)=>[k,i*3]));
 Object.assign(deps,{clamp,lerp,damp:(a)=>a,spr:(S,i)=>S[i]||0,hk:(h,fist,grip,relaxed,open)=>h<0?grip+(fist-grip)*Math.min(1,-h):h<1?grip+(relaxed-grip)*h:relaxed+(open-relaxed)*Math.min(1,h-1),FINGER_SPREAD:[-.08,-.02,.03,.08]});
 const funcs=codes.map(s=>new Function(...Object.keys(deps),'return ({'+declaration(s,'Character','_applyFingers').source+'})._applyFingers')(...Object.values(deps)));
 for(const h of [-1,-1e-300,-0,0,1e-300,.5,1,2,3,NaN,Infinity,-Infinity])for(const t of [-0,0,1,4,8,1e200,NaN,Infinity])for(const dt of [0,1/30,1/60,1/120]){
  const out=funcs.map(fn=>{const trace=[],finger=()=>({rotation:{set(...v){trace.push(v);}}});let calls=0;const o={t,handS:[h,h],sp:new Float64Array(30),gripT:2,rng:()=>{calls++;return .5;},fing:Array.from({length:2},()=>({f1:Array.from({length:4},finger),f2:Array.from({length:4},finger),t1:finger(),t2:finger()})),weapon:{trig:.3}};fn.call(o,new Float64Array(64),dt);return{trace,calls,sp:Array.from(o.sp),gripT:o.gripT};});assert.deepEqual(out[0],out[1]);
 }
});

test('victory pose methods preserve all slots across transitions and exceptional times',()=>{
 for(const key of ['_dVictoryPump','_dVictoryHops']){
  const source=[true,false].map(b=>declaration(composed('src/game/character.js',b),'Character',key).source);const names=[...new Set(source.join('\n').match(/\b[A-Z][A-Z_]+\b/g))];const deps=Object.fromEntries(names.map((n,i)=>[n,i*4]));
  Object.assign(deps,{TAU:2*Math.PI,ANKLE_H:.08,frac:x=>x-Math.floor(x),clamp,lerp,ease:t=>{t=clamp(t,0,1);return t*t*(3-2*t);},backOut:(t,s=2.2)=>{t=clamp(t,0,1)-1;return t*t*((s+1)*t+s)+1;},wrapA:a=>(a+Math.PI)%(2*Math.PI)-Math.PI,win:(t,a,b,c,d)=>Math.min(clamp((t-a)/(b-a),0,1),clamp((d-t)/(d-c),0,1)),setAnc(D){D[deps.ANC]=.2;D[deps.ANC+1]=.7;},setE:(D,i,x,y,z)=>{D[i]=x;D[i+1]=y;D[i+2]=z;},lerpE:(D,i,x,y,z,t)=>{D[i]=lerp(D[i],x,t);D[i+1]=lerp(D[i+1],y,t);D[i+2]=lerp(D[i+2],z,t);}});
  const f=source.map(s=>new Function(...Object.keys(deps),'return ({'+s+'}).'+key)(...Object.values(deps)));
  for(const t of [-0,0,1,2,3,4,1e-14,1e200,NaN,Infinity,...Array.from({length:180},(_,i)=>i/30)]){const out=f.map(fn=>{const D=new Float64Array(512);fn.call({hold:{raise:{}}},D,t);return Array.from(D);});assert.deepEqual(out[0],out[1]);}
 }
});

test('bot octant and fallback coefficients preserve all wet-query coordinates and early exit order',()=>{
 const constants={IW_NEAR_WATER_BASIS:Array.from({length:8},(_,k)=>{const t=(k/8)*Math.PI*2;return[Math.cos(t),Math.sin(t)];}),_egCos0:Math.cos(.8),_egSin0:Math.sin(.8),_egCos1:Math.cos(1.45),_egSin1:Math.sin(1.45),edgeClearReusable:()=>false};
 for(const name of ['_nearWater','_edgeGuardUncached']){const f=[true,false].map(b=>method('src/game/bots.js','BotBrain',name,b,constants));
 for(const x of [0,-0,3,-12,1e100,NaN,Infinity])for(let threshold=0;threshold<12;threshold++){
  const out=f.map(fn=>{const queries=[],move=new THREE.Vector3(.3,0,.7),o={t:0,path:null,pi:0,_wet:(...p)=>{queries.push(p);return name==='_nearWater'?queries.length===threshold:queries.length<threshold;}},a={pos:{x,y:2,z:-3},vel:{x:4,z:1}};const result=name==='_nearWater'?fn.call(o,a,3.2):fn.call(o,a,move);return{result,queries,move:move.toArray()};});assert.deepEqual(out[0],out[1]);}
 }
});

test('folded prop merge bounds preserve Float32 geometry, winding, sphere and generator cancellation',()=>{
 const fs=[true,false].map(b=>{const s=declaration(composed('src/world/props-core.js',b),null,'mergePartSteps').source;return new Function('THREE','_v','WHITE_UV',s+';return mergePartSteps;')(THREE,new THREE.Vector3(),[.5,.5]);});
 const base=new THREE.SphereGeometry(.3,32,24),parts=Array.from({length:5},(_,i)=>({g:base,m:new THREE.Matrix4().compose(new THREE.Vector3(i*.013,-i*.001,i*3),new THREE.Quaternion().setFromEuler(new THREE.Euler(.3,-.7,i)),new THREE.Vector3(i%2?-2:1,1.3,.7)),c:new THREE.Color(.3,.7,.2),ao:i%2?0:null}));
 for(const input of [[],parts,[{...parts[0],m:new THREE.Matrix4().makeTranslation(NaN,0,0)}]])for(const uv of [true,false]){
  const out=fs.map(fn=>{const gen=fn(input,uv);let n,steps=0;do{n=gen.next();steps++;}while(!n.done);return{g:n.value,steps};});
  for(const key of Object.keys(out[0].g.attributes)){const [a,b]=out.map(o=>o.g.attributes[key]);assert.equal(Buffer.compare(byte(a.array),byte(b.array)),0,key);}
  assert.deepEqual(out[0].g.boundingBox,out[1].g.boundingBox);assert.deepEqual(out[0].g.boundingSphere,out[1].g.boundingSphere);if(input===parts)assert(out[1].steps<out[0].steps);out.forEach(o=>o.g.dispose());
 }
 const gen=fs[1](parts);gen.next();gen.return();assert.equal(gen.next().done,true);base.dispose();
});

test('roller clamp and fixed four-channel face checks preserve exceptional values and operation order',()=>{
 const face=fs.readFileSync(new URL('../../splatoon3/runtime/face-motion.mjs',import.meta.url),'utf8');const expr=face.slice(face.indexOf('  s.clamped ='),face.indexOf('\n  s.origin.copy',face.indexOf('  s.clamped =')));const check=new Function('s',expr+';return s.clamped;');
 for(const v of [0,-0,1e-8,1e-8+1e-24,NaN,Infinity,-Infinity])for(let j=0;j<4;j++){const s={wanted:[0,0,0,0],applied:[0,0,0,0]};s.wanted[j]=v;assert.equal(check(s),s.wanted.some((x,i)=>Math.abs(x-s.applied[i])>1e-8));}
 const code=fs.readFileSync(new URL('../../splatoon3/runtime/roller.mjs',import.meta.url),'utf8');assert.equal((code.match(/const unclampedDistance = delta.length\(\);/g)||[]).length,2);
 const random=rng();for(let i=0;i<10000;i++){const v=new THREE.Vector3(i<5?[0,NaN,Infinity,-Infinity,1e-300][i]:random()*4-2,0,random()*4-2),a=v.clone(),b=v.clone(),reach=.5;
  if(a.length()>reach)a.setLength(reach);const n=b.length();if(n>reach)b.divideScalar(n||1).multiplyScalar(reach);assert.deepEqual(a.toArray(),b.toArray());}
 const shapes=fs.readFileSync(new URL('../../splatoon3/runtime/s3-projectile-shapes.mjs',import.meta.url),'utf8');assert.match(shapes,/idleMeshes: \[body, slashH, slashV, shell, core\]/);assert.match(shapes,/for \(const mesh of R.idleMeshes\)/);
});

test('actual projectile idle draw resets every owned mesh and returns independent counters',()=>{
 const source=fs.readFileSync(new URL('../../splatoon3/runtime/s3-projectile-shapes.mjs',import.meta.url),'utf8');
 const current=declaration(source,null,'drawS3Shapes').source;
 const funcs=[current.replace('R.idleMeshes','[R.body, R.slashH, R.slashV, R.shell, R.core]'),current].map(s=>new Function(s+';return drawS3Shapes;')());
 const results=funcs.map(fn=>{
  const mesh=()=>({count:5,visible:true}),R={body:mesh(),slashH:mesh(),slashV:mesh(),shell:mesh(),core:mesh(),wetSlashV:mesh(),sheets:{bursts:[],drills:[],mesh:mesh(),drillMesh:mesh()}};
  R.idleMeshes=[R.body,R.slashH,R.slashV,R.shell,R.core];const ranges=[];R.sparks={visible:true,userData:{count:12},geometry:{setDrawRange(...args){ranges.push(args);}}};
  const system={list:[],_s3Shapes:R},first=fn(system),second=fn(system);assert.notEqual(first,second);first.body=99;assert.equal(second.body,0);
  return{meshes:[...R.idleMeshes,R.wetSlashV,R.sheets.mesh,R.sheets.drillMesh],sparkVisible:R.sparks.visible,sparkCount:R.sparks.userData.count,ranges,counters:second};
 });
 assert.deepEqual(results[0],results[1]);assert(results[1].meshes.every(m=>m.count===0&&!m.visible));assert.equal(results[1].sparkVisible,false);assert.equal(results[1].sparkCount,0);
});
