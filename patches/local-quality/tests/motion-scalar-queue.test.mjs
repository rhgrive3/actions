import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const raw=rel=>fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');
const clamp=(x,a,b)=>x<a?a:x>b?b:x;
function tracked(){const calls={exp:0,expm1:0,sin:0,cos:0,hypot:0},math=Object.create(Math);for(const name of Object.keys(calls))math[name]=(...args)=>{calls[name]++;return Math[name](...args);};return{math,calls};}
function method(s,name){const a=s.indexOf(' '+name+'('),b=s.indexOf('\n }',a);assert.ok(a>=0&&b>a);return s.slice(a,b+3).trim();}
function actorMethod(s,name){const a=s.indexOf('  '+name+'('),b=s.indexOf('\n  }',a);assert.ok(a>=0&&b>a);return s.slice(a,b+4).trim();}

test('actual displacement expressions preserve branch arithmetic and halve moving-world trig',()=>{
 const s=raw('src/game/motion/source-controller.js'),a=s.indexOf('  const n=this.treadmill?'),b=s.indexOf('  const visualSpeed=',a),next=s.slice(a,b);
 let before=next.replace('  let cosYaw,sinYaw;\n','');for(const name of ['cos','sin'])before=before.replaceAll(`(${name}Yaw??=Math.${name}(yaw))`,`Math.${name}(yaw)`);
 const run=(code,input)=>{const t=tracked(),fn=new Function('Math','return function({lm,dist,dx,dz,yaw}){'+code+'return [rawX,rawZ];}')(t.math);return{out:fn.call({treadmill:input.treadmill},input),calls:t.calls};};
 for(const treadmill of [false,true])for(const dist of [0,-0,1e-300,.03,12,Infinity,NaN])for(const yaw of [0,-0,.5,-3,NaN,Infinity]){
  const input={treadmill,dist,dx:dist*.4,dz:dist*.7,yaw,lm:{x:.6,z:.8}},old=run(before,input),now=run(next,input);assert.deepEqual(now.out,old.out);
  const active=!treadmill&&dist>0;assert.equal(old.calls.sin,active?2:0);assert.equal(now.calls.sin,active?1:0);assert.equal(old.calls.cos,active?2:0);assert.equal(now.calls.cos,active?1:0);
 }
});

test('actual per-foot exponential kernels retain all states and evaluate each needed rate only once per call',()=>{
 const s=raw('src/game/motion/retarget.js'),a=s.indexOf('   const walkClearance='),b=s.indexOf('\n   f.support.copy',a),next=s.slice(a,b);
 const old=next.replace('(walkBase??=Math.min(.052,.008+speed*.013+.003*Math.abs(lateral)))','Math.min(.052,.008+speed*.013+.003*Math.abs(lateral))')
  .replace('(runBase??=Math.min(.048,.004+speed*.007))','Math.min(.048,.004+speed*.007)')
  .replace('omega===32?(decay32??=Math.exp(-omega*h)):(decay26??=Math.exp(-omega*h))','Math.exp(-omega*h)')
  .replace('runResponse===50?(run50??=-Math.expm1(-runResponse*h)):(run22??=-Math.expm1(-runResponse*h))','-Math.expm1(-runResponse*h)');
 const run=(body,cache,dt,speed,lateral,states)=>{const t=tracked(),fn=new Function('Math','clamp','return function(states,dt,speed,lateral){let walkBase,runBase,soleFactor,decay26,decay32,run22,run50;const walkMix=clamp((3.5-speed)/1,0,1),walkEase=walkMix*walkMix*(3-2*walkMix);for(const f of states){const airWeight=f.airWeight;'+
  (cache?'if(f.ready)f.sole=soleFactor??=-Math.expm1(-45*dt);':'if(f.ready)f.sole=-Math.expm1(-45*dt);')+body+'}return states;}')(t.math,clamp);return{out:fn.call({locomotion:true},structuredClone(states),dt,speed,lateral),calls:t.calls};};
 for(const dt of [0,-0,1/30,1/60,1/120,.1,NaN,Infinity])for(const speed of [0,2.5,3.5,6])for(const split of [false,true])for(const ready of [false,true]){
  const states=[{airWeight:.8,airLiftWalk:.01,airLiftVelocity:0,airLiftRun:.02,ready},{airWeight:.8,airLiftWalk:split?.08:.01,airLiftVelocity:.03,airLiftRun:split?0:.02,ready}];
  const a=run(old,false,dt,speed,-.4,states),b=run(next,true,dt,speed,-.4,states);assert.deepEqual(b.out,a.out);assert.ok(b.calls.exp<=a.calls.exp);assert.ok(b.calls.expm1<=a.calls.expm1);
  if(!split){assert.equal(b.calls.exp,1);assert.equal(b.calls.expm1,ready?2:1);}
 }
});

test('actual Actor facing/visual methods share horizontal speed while direct callers and remote updates remain valid',()=>{
 const s=raw('src/game/actor.js'),face=actorMethod(s,'_face'),finish=actorMethod(s,'_finishFrame');
 const oldFace=face.replace(', hs = Math.hypot(this.vel.x, this.vel.z)','').replace('    this.fireFacing =','    const hs = Math.hypot(this.vel.x, this.vel.z);\n    this.fireFacing =');
 const oldFinish=finish.replace('    const hs = Math.hypot(this.vel.x, this.vel.z);\n','').replace('else this._face(dt, isSquid, hs);','else this._face(dt, isSquid);\n    const hs = Math.hypot(this.vel.x, this.vel.z);');
 const PLAYER={faceOmega:20,faceMaxRate:12.5,faceMaxAcc:170,squidFaceOmega:26,squidFaceMaxRate:17,swimFaceMaxRate:14,squidFaceMaxAcc:260,aimFaceOmega:36,aimFaceMaxRate:24,aimFaceMaxAcc:380,inkMax:100,hp:100};
 const angleDiff=(a,b)=>{let d=(b-a)%(2*Math.PI);if(d>Math.PI)d-=2*Math.PI;if(d< -Math.PI)d+=2*Math.PI;return d;};
 const run=(body,tail,hz,remote,form)=>{const t=tracked(),G={teamColors:[new THREE.Color(),new THREE.Color()]};
  const make=code=>new Function('Math','PLAYER','G','clamp','angleDiff','TAU','_v','return function '+code)(t.math,PLAYER,G,clamp,angleDiff,2*Math.PI,new THREE.Vector3());
  const actor={anim:{localMove:{}},intent:{move:new THREE.Vector3(.5,0,.8)},vel:new THREE.Vector3(3,.2,4),pos:new THREE.Vector3(1,2,3),form,remote,netTurnRate:.3,yaw:.4,yawVel:.2,_faceTarget:.2,fireFacing:.1,aimYaw:.7,ink:80,hp:90,invuln:0,hurtFlash:.2,smoothY:.1,smoothYV:.02,grounded:true,groundTeam:1,enemyTeam:1,
   specialFrac:()=>.3,_events(){},weaponRunner:{firingPose:()=>false},character:{root:new THREE.Group(),setHurt(){},update(){}}};actor._face=make(body);make(tail).call(actor,1/hz);
  return{out:structuredClone({anim:actor.anim,yaw:actor.yaw,yawVel:actor.yawVel,face:actor._faceTarget,fireFacing:actor.fireFacing,smoothY:actor.smoothY,smoothYV:actor.smoothYV,pos:actor.character.root.position.toArray()}),calls:t.calls};};
 for(const hz of [30,60,120])for(const remote of [false,true])for(const form of ['kid','squid']){const a=run(oldFace,oldFinish,hz,remote,form),b=run(face,finish,hz,remote,form);assert.deepEqual(b.out,a.out);assert.equal(a.calls.hypot-b.calls.hypot,remote?0:1);}
});

test('production squid skin tables retain exact attributes and preserve missing/unused bone errors',()=>{
 const s=adaptBuildSource('src/game/motion/squid-rig.js',raw('src/game/motion/squid-rig.js')),next=method(s,'skinGeometry');
 const a=next.indexOf("  const headIds=['Sqd_head0'"),b=next.indexOf('\n  for(let i=0;i<n;i++){',a);
 let old=next.slice(0,a)+"  const headY=['Sqd_head0','Sqd_head1','Sqd_head2'].map(name=>this.map.clone().multiply(this.bank.rest.world[id(name)]).elements[13]);"+next.slice(b);
 old=old.replace('a=headIds[0];b=headIds[1];',"a=id('Sqd_head0');b=id('Sqd_head1');").replace('a=headIds[1];b=headIds[2];',"a=id('Sqd_head1');b=id('Sqd_head2');")
  .replaceAll('chainIds[k]?.[segment-1]??','').replaceAll('chainIds[k]?.[segment]??','').replaceAll('chainIds[k]?.[0]??','').replaceAll('chainIds[k]?.[1]??','').replaceAll('waistId??','');
 const arms=['L','B','A','A','B','C','C','D','D','R'],names=['Sqd_head0','Sqd_head1','Sqd_head2','Sqd_waist'];for(const side of ['L','R'])for(let i=1;i<=3;i++)names.push(`Sqd_arm${i}_${side}`);for(const side of ['A','B','C','D'])for(let i=1;i<=2;i++)names.push(`Sqd_leg${side}${i}`);
 const make=(code,index)=>new Function('THREE','clamp','cache','sourceSkinnedGeometries','ARM_FOR_VERTEX','return function '+code)(THREE,clamp,new WeakMap(),new WeakSet(),arms).bind({index,map:new THREE.Matrix4(),bank:{rest:{world:names.map((_,i)=>new THREE.Matrix4().makeTranslation(0,i*.1,0))}}});
 function geo(count=2000){const g=new THREE.BufferGeometry(),p=new Float32Array(count*3),c=new Float32Array(count*3),uv=new Float32Array(count*2),ex=new Float32Array(count);for(let i=0;i<count;i++){p[i*3+1]=i%4*.1;c[i*3+2]=(i%10)/10;uv[i*2]=(i%8)/7;ex[i]=i%3?1:0;}g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('color',new THREE.BufferAttribute(c,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setAttribute('aEx',new THREE.BufferAttribute(ex,1));return g;}
 const index=Object.fromEntries(names.map((name,i)=>[name,i]));let beforeReads=0,afterReads=0;
 for(const part of ['body','dark'])for(const compact of [false,true]){
  const reads=[0,0],functions=[old,next].map((code,k)=>make(code,new Proxy(index,{get(o,key){reads[k]++;return o[key];}}))),g=geo();g.userData.squidCompactSupports=compact;
  const out=functions.map(fn=>fn(g,part));for(const key of ['skinIndex','skinWeight'])assert.deepEqual(Buffer.from(out[1].attributes[key].array.buffer),Buffer.from(out[0].attributes[key].array.buffer));functions.forEach((fn,k)=>assert.equal(fn(g,part),out[k],'cache hit retains geometry identity'));beforeReads+=reads[0];afterReads+=reads[1];
 }
 assert.ok(afterReads<beforeReads/10);
 for(const missing of ['Sqd_head1','Sqd_waist','Sqd_arm1_L']){const bad={...index};delete bad[missing];const errors=[old,next].map(code=>{try{make(code,bad)(geo(),'body');}catch(e){return e.message;}});assert.equal(errors[1],errors[0]);assert.ok(errors[0]);}
 const unused={...index};delete unused.Sqd_arm3_L;const g=geo(1);g.attributes.aEx.setX(0,1);g.attributes.uv.setX(0,0);for(const code of [old,next])assert.doesNotThrow(()=>make(code,unused)(g,'body'));
 for(const k of [-.3,NaN]){const invalid=geo(1);invalid.attributes.aEx.setX(0,1);invalid.attributes.color.setZ(0,k);const errors=[old,next].map(code=>{try{make(code,index)(invalid,'body');}catch(e){return e.message;}});assert.equal(errors[1],errors[0]);}
 console.log(JSON.stringify({skinIndexPropertyReads:{before:beforeReads,after:afterReads},scope:'actual composed skinGeometry with Three.js buffers, no device timing'}));
});
