import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Vector3,Group,Matrix4} from '../../../inkwave-public/vendor/three/build/three.module.js';
import {specialPresentationToken} from '../runtime/special-presentation-owner.mjs';
import {createRequire} from 'node:module';
import {compactModuleStrings} from '../../../scripts/lib/inkwave-source-compaction.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {recordGhostPush,retireGhostRound,clearGhostIndex} from '../../network-replication/ghost-live-index.mjs';
import {throwVolley,trizookaSpecialWeapon} from '../runtime/kit-trizooka.mjs';
import {configureTrizookaNative,kitTrizookaBirth,flushTrizookaBirths,kitTrizookaGhost,kitVolleyPacketIndex} from '../runtime/trizooka-collision.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const vfxPath=process.env.TRIZOOKA_VFX_SOURCE;
const source=vfxPath?fs.readFileSync(vfxPath,'utf8'):read('../runtime/special-vfx.mjs');
const native=adaptBuildSource('src/game/weapons.js',read('../../../inkwave-public/src/game/weapons.js'));
const methods=native.slice(native.indexOf('  _new() {'),native.indexOf('  ghostBomb('));
const update=native.slice(native.indexOf('  update(dt) {'),native.indexOf('  // High-angle /'));
const net=adaptBuildSource('src/net/netmatch.js',read('../../../inkwave-public/src/net/netmatch.js'));
const rec=net.slice(net.indexOf('  recProj(p) {'),net.indexOf('  recBomb(b) {'));
const kit=read('../runtime/kit-trizooka.mjs');
const birth=kit.slice(kit.indexOf('  const nativeTag ='),kit.indexOf('\n  const existing = SPECIALS[TRIZOOKA_ID]'));
class Vec extends Vector3 {
  constructor(x=0,y=0,z=0){super(x,y,z);}
  set(x,y,z){Object.assign(this,{x,y,z});return this;}
  copy(v){return this.set(v.x,v.y,v.z);}
  clone(){return new Vec(this.x,this.y,this.z);}
  setY(y){this.y=y;return this;}
  addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}
  multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;}
  normalize(){return this.multiplyScalar(1/(Math.hypot(this.x,this.y,this.z)||1));}
}
function loadMotion(){
  let code=adaptBuildSource('patches/splatoon3/runtime/special-motion.mjs',read('../runtime/special-motion.mjs'))
    .replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
  code+='\nglobalThis.motionApi={trizookaPresentationMuzzle,presentationStates,presentationBlocked};';
  if(process.env.TRIZOOKA_VFX_ESBUILD)code=compactModuleStrings(createRequire(import.meta.url)(process.env.TRIZOOKA_VFX_ESBUILD).transformSync(code,{loader:'js',minify:true,charset:'utf8'}).code).code;
  const context=vm.createContext({console,specialPresentationToken});vm.runInContext(code,context);return context.motionApi;
}
function fixture({enabled=true,reject=false,nested=false,terminal=false,programSource=source}={}){
  const motion=loadMotion();
  const G={time:0}, enums=new Proxy({},{get:()=>1}),SPECIALS={trizooka:{projectileDescriptor:()=>trizookaSpecialWeapon()}};
  const context=vm.createContext({console,G,THREE:{Vector3:Vec},WEAPONS:{},SPECIALS,
    vfxRandom:()=>.25,SPARK:enums,PUFF:enums,RIBBON:enums,SHELL:enums,DISC:enums,
    WAIL_SPEAKER_POSITIONS:[],trizookaPresentationMuzzle:motion.trizookaPresentationMuzzle,inkVacPresentationMuzzle:()=>false,captureInkVolume(){},addPlayerForwardVelocity(){},
    validNetworkProjectileCosmetics:()=>!reject,kitTrizookaGhost,kitVolleyPacketIndex,
    kitTrizookaBirth,flushTrizookaBirths,inkVacState:a=>a.state,
    recordGhostPush,retireGhostRound,clearGhostIndex,
    slosherBirthInkMeta:()=>null,recordSlosherPaintBirth(){},r2:x=>Math.round(x*100)/100,r3:x=>Math.round(x*1000)/1000});
  let code=adaptBuildSource('patches/splatoon3/runtime/special-vfx.mjs',programSource)
    .replace(/^import .*;\n/gm,'').replace(/^export default .*;$/gm,'').replace(/^export /gm,'');
  code+='\nglobalThis.api={Director,DIRECTORS,ROUND_FX,installSpecialVfx,directors};';
  code+='\nclass NativeProjectiles{'+methods+update+'};globalThis.P=NativeProjectiles;';
  code+='\nclass NativeNet{'+rec+'};globalThis.N=NativeNet;';
  code+='\nfunction installNativeBirth(Projectiles){'+birth+'};globalThis.installNativeBirth=installNativeBirth;';
  if(process.env.TRIZOOKA_VFX_ESBUILD) code=compactModuleStrings(createRequire(import.meta.url)(process.env.TRIZOOKA_VFX_ESBUILD).transformSync(code,{loader:'js',minify:true,charset:'utf8'}).code).code;
  vm.runInContext(code,context);
  const {Director,DIRECTORS,ROUND_FX,installSpecialVfx,directors}=context.api,P=context.P;
  P.prototype._step=function(p,dt){p.prev.copy(p.pos);p.age+=dt;p.pos.addScaledVector(p.vel,dt);if(terminal){p.dead=true;return true;}return false;};
  context.installNativeBirth(P);
  const originalPush=P.prototype._push,originalGhost=P.prototype.ghostProjectile;
  if(reject)P.prototype._push=()=>false;
  if(nested)P.prototype.ghostProjectile=function(...args){const p=originalGhost.apply(this,args);if(p)this._push(this.list.pop());return p;};
  // The extracted native class omits its constructor; mirror main's real opt-in,
  // and supply its actual imported lifecycle functions rather than no-op stubs.
  assert.ok(native.includes('this._queueGhostLifecycle = true;'));
  const system=new P();Object.assign(system,{_queueGhostLifecycle:true,list:[],pool:[],inkFlight:{restore(){},beginFrame(){},updateDrops(){}},
    projectileVisuals:{reset(){},beginStep(){},recordStep(){}},
    _muzzle:(a,v)=>v.set(2,3,4),_aimFrom:(a,m,v)=>v.set(0,0,1),_recycle(p){this.pool.push(p);},
    _draw(){},_updateChargerDrops(){},_updateBombs(){},_updateClouds(){},_updateBeams(){}});
  const packets=[],nm=new context.N();Object.assign(nm,{mute:0,_rec(row){const result=[G.time,...row];packets.push(result);return result;}});
  const fx={s3SpecialVfxEnabled:enabled};class FX{update(){}clear(){}setCollider(){}}
  Object.assign(G,{projectiles:system,netm:nm,fx});configureTrizookaNative({G,SPECIALS});
  const flashes=[],rings=[],sprays=[],director=Object.assign(Object.create(Director.prototype),{
    inkVacShots:new WeakSet(),trizookaShots:new WeakSet(),inkjetImpacts:new WeakSet(),rounds:new Map(),
    v:Array.from({length:8},()=>new Vec()),rgb:()=>[1,0,0],aim:(_,v)=>v.set(0,0,1),hdr:c=>c,
    call(fn,...args){return fn?.apply(this,args);},activation(){},
    spark(kind,p,vx,vy,vz,life,s0,s1,c,alpha,options){flashes.push({at:G.time,life,pos:{...p},s0,s1,c,alpha,options});},
    disc(...args){rings.push(args);},muzzle(){sprays.push(G.time);},shell(){},smoke(){},streaks(){},petals(){}});
  directors.set(fx,director);installSpecialVfx({FX,Projectiles:P,G});
  const actor={pos:new Vec(),alive:true,owner:'local',remote:false,nid:1,team:0,netLife:1,aimYaw:0};
  const track={d:{},color:[1,0,0]};
  function render(){
    if(fx.s3SpecialVfxEnabled===false)return;
    // Run the actual installed director's Trizooka-specific branches; do not
    // need unrelated particle pools. Actual native clocks/recording run above.
    DIRECTORS.trizooka.frame?.call(director,actor,track,1/60);
    for(const p of system.list){if(p.wid!=='trizooka'||p.dead)continue;
      const r=director.rounds.get(p);if(!r&&(!ROUND_FX.trizooka.when||ROUND_FX.trizooka.when(p))){
        const next={d:{},color:[1,0,0]};director.rounds.set(p,next);
        const ribbon=director.ribbon;director.ribbon=()=>({});ROUND_FX.trizooka.start.call(director,next,p);director.ribbon=ribbon;
      }}
  }
  function volley(){return throwVolley(system,actor,trizookaSpecialWeapon());}
  function tick(dt){G.time+=dt;system.update(dt);render();}
  const packet=i=>[0,'p',7,'blast','trizooka',2,3,4,0,0,67.5,0,5.5,.2667,3.2,.22,0,0,1.1,0,.1,.8,1.3,.035,26,.3,3,null,i,1];
  return {G,system,actor,volley,tick,render,packet,packets,flashes,rings,sprays,director,DIRECTORS,ROUND_FX,fx,originalPush,motion};
}
const close=(a,b,msg)=>assert.ok(Math.abs(a-b)<1e-9,`${msg}: ${a} != ${b}`);
test('actual native volley birth path emits three distinct pulses at 0/4/8F; heavy spray stays once',()=>{
  const f=fixture();f.render();f.volley();assert.equal(f.flashes.length,1);
  for(let i=0;i<12;i++)f.tick(1/60);
  assert.equal(f.flashes.length,3);f.flashes.forEach((v,i)=>{close(v.at,i*4/60,'pulse');assert.equal(v.life,3/60);assert.deepEqual(v.pos,{x:2,y:3,z:4});});
  assert.equal(f.rings.length,3);assert.equal(f.sprays.length,1);assert.equal(f.packets.length,3);
});
test('native clocks, packets, positions and damage ownership are identical with effects disabled',()=>{
  function run(enabled,hz){const f=fixture({enabled});f.volley();for(let i=0;i<hz/2;i++)f.tick(1/hz);
    return {packets:f.packets,rounds:f.system.list.map(p=>({age:p.age,pos:p.pos,vel:p.vel,damage:p.damage,damageOwner:p.damageOwner,delay:p.delay,action:p.s3ActionIndex,lobe:p.s3VolleyIndex})),flashes:f.flashes.length};}
  for(const hz of [30,60,120,144]){const on=run(true,hz),off=run(false,hz);assert.equal(JSON.stringify({...on,flashes:0}),JSON.stringify(off));assert.equal(on.flashes,3);}
});
test('birth pulses agree at 30/60/120Hz including tick-endpoint flushes; high Hz does not duplicate',()=>{
  for(const hz of [30,60,120]){const f=fixture();f.volley();for(let i=0;i<hz/4;i++)f.tick(1/hz);
    assert.equal(f.flashes.length,3);f.flashes.forEach((v,i)=>close(v.at,i*4/60,`${hz}Hz`));}
});
test('no state-counter flash, no pending trails, and cancelled delayed births never pulse',()=>{
  const f=fixture();f.actor.s3Trizooka={shots:0};f.render();f.actor.s3Trizooka.shots=1;f.render();assert.equal(f.flashes.length,0);
  const p=f.volley();f.render();assert.equal(f.director.rounds.size,1);assert.equal(f.flashes.length,1);
  f.actor.alive=false;for(let i=0;i<12;i++)f.tick(1/60);assert.equal(f.flashes.length,1);assert.equal(f.packets.length,1);
  assert.ok(p[1].s3TrizookaBirthCancelled);assert.ok(p[2].s3TrizookaBirthCancelled);
});
test('native birth cancellation on life/ownership change and disabled effects emits nothing later',()=>{
  for(const change of [a=>a.netLife++,a=>a.owner='new',a=>a.remote=true]){const f=fixture();f.volley();change(f.actor);for(let i=0;i<12;i++)f.tick(1/60);assert.equal(f.flashes.length,1);}
  const f=fixture({enabled:false});f.volley();for(let i=0;i<12;i++)f.tick(1/60);assert.equal(f.flashes.length,0);f.fx.s3SpecialVfxEnabled=true;f.render();assert.equal(f.flashes.length,0,'re-enabling does not replay births observed while disabled');
});
test('accepted remote ghosts bypass _push, nested observer paths deduplicate, rejected births do not flash',()=>{
  for(const nested of [false,true]){const f=fixture({nested});f.actor.remote=true;
    for(let i=0;i<3;i++){f.G.time=i*4/60;const p=f.system.ghostProjectile(f.actor,f.packet(i));f.render();f.system._push(p);}
    assert.equal(f.flashes.length,3);assert.equal(f.sprays.length,1);assert.equal(f.packets.length,0);}
  const f=fixture({reject:true});assert.equal(f.system._push({wid:'trizooka'}),false);assert.equal(f.system.ghostProjectile(f.actor,f.packet(0)),null);assert.equal(f.flashes.length,0);
});
test('birth and same-step terminal still emit once; no late resurrection after clearing presentation',()=>{
  const f=fixture({terminal:true});f.volley();for(let i=0;i<6;i++)f.tick(1/30);assert.equal(f.flashes.length,3);assert.equal(f.system.list.length,0);
  const g=fixture();g.volley();for(let i=0;i<12;i++)g.tick(1/60);
  for(const name of ['tracks','objects','lasers','domes','coolers','fists','storms'])g.director[name]=new Map();g.director.kit={clear(){}};g.director.clear();
  g.render();assert.equal(g.flashes.length,3);
});
test('native _new reuse resets dedup; newborn unrelated/dead/ended shots and other systems do not flash',()=>{
  const f=fixture(),p=f.volley();for(let i=0;i<12;i++)f.tick(1/60);f.system.list.length=0;f.system.pool.push(...p);f.director.rounds.clear();f.volley();for(let i=0;i<12;i++)f.tick(1/60);assert.equal(f.flashes.length,6);
  const before=f.flashes.length;for(const changes of [{dead:true},{_netEnded:true},{wid:'shooter'}]){const q=f.system._new();Object.assign(q,{wid:'trizooka',owner:f.actor,dead:false,s3TrizookaBirthPending:false,s3TrizookaBirthCancelled:false},changes);f.system._push(q);}
  const other=Object.create(Object.getPrototypeOf(f.system));Object.assign(other,{list:[],projectileVisuals:{},pool:[]});const unrelated=f.system._new();Object.assign(unrelated,{wid:'trizooka',owner:f.actor,dead:false,s3TrizookaBirthPending:false,s3TrizookaBirthCancelled:false});other._push(unrelated);assert.equal(f.flashes.length,before);
});
test('existing Ink Vac hook and Trizooka hook each emit once, without cross-special flashes',()=>{
  const f=fixture();f.actor.state={phase:'exhale'};const p=f.system._new();Object.assign(p,{wid:'inkVac',owner:f.actor,dead:false});p.pos.set(2,3,4);p.start.copy(p.pos);f.system._push(p);f.system._push(p);
  assert.equal(f.sprays.length,1);assert.equal(f.flashes.length,0);f.volley();assert.equal(f.flashes.length,1);assert.equal(f.sprays.length,2);
});
if(process.env.TRIZOOKA_VFX_BASELINE)test('negative control: baseline emits one long hot pulse and simultaneous triple rings per action',()=>{
  const f=fixture({programSource:fs.readFileSync(process.env.TRIZOOKA_VFX_BASELINE,'utf8')});f.actor.s3Trizooka={shots:0};f.render();f.volley();f.actor.s3Trizooka.shots=1;f.render();for(let i=0;i<12;i++)f.tick(1/60);
  assert.equal(f.flashes.length,1);assert.equal(f.flashes[0].life,.14);assert.equal(f.rings.length,3);
});

// Run the actual shared sprite CPU update without constructing WebGL resources.
// This tests uploaded opacity/expiry, not GPU appearance or final bloom.
test('actual sprite pool keeps brief cores visible at 30/60/120 Hz and leaves dark gaps at 60 Hz',()=>{
  const kitSource=read('../runtime/special-vfx-kit.mjs');
  const begin=kitSource.indexOf('class SpritePool {'),end=kitSource.indexOf('\n// ---------------------------------------------------------------------------------------------------------------',begin);
  let program=kitSource.slice(begin,end)+'\nglobalThis.SpritePool=SpritePool;';
  if(process.env.TRIZOOKA_VFX_ESBUILD)program=createRequire(import.meta.url)(process.env.TRIZOOKA_VFX_ESBUILD).transformSync(program,{loader:'js',minify:true}).code;
  const context=vm.createContext({vfxRandom:()=>.25,TAU:Math.PI*2});vm.runInContext(program,context);
  function pool(){const p=Object.create(context.SpritePool.prototype);Object.assign(p,{cap:8,n:0,S:23,p:new Float32Array(8*23),additive:true,mesh:{geometry:{}}});
    for(const name of ['aPos','aDir','aCol','aPar'])p[name]={array:new Float32Array(9*4),clearUpdateRanges(){},addUpdateRange(){}};return p;}
  const first=fixture();first.volley();const core=first.flashes[0];assert.equal(core.options.fadeIn,0);
  for(const hz of [30,60,120]){const p=pool();p.spawn(0,0,0,0,0,0,core.life,core.s0,core.s1,...core.c,core.alpha,2,core.options);p.update(1/hz);assert.ok(p.n>0&&p.aCol.array[7]>.4,`${hz}Hz first draw remains visibly opaque`);}
  const p=pool(),samples=[];
  for(let frame=0;frame<13;frame++){if([0,4,8].includes(frame))p.spawn(0,0,0,0,0,0,core.life,core.s0,core.s1,...core.c,core.alpha,2,core.options);p.update(1/60);let max=0;for(let j=1;j<=p.n;j++)max=Math.max(max,p.aCol.array[j*4+3]);samples.push(max);}
  assert.ok(samples[0]>.7&&samples[4]>.7&&samples[8]>.7);assert.ok(samples[3]<1e-6&&samples[7]<1e-6&&samples[11]<1e-6,'hot cores do not bridge four-frame birth intervals');
});

function heldTrizooka(f){
  const world=new Group(),root=new Group(),kid=new Group(),model=new Group();world.add(root);root.add(kid);kid.add(model);
  model.name='special:trizooka';model.userData.muzzle=new Vec(0,.075,.402);
  const ch={root,kid,kidForm:true,actor:f.actor};f.actor.character=ch;f.actor.specialActive={id:'trizooka',phase:'charge'};
  const state={kind:'trizooka',model,models:new Map([['trizooka',model]])};f.motion.presentationStates.set(ch,state);
  world.updateMatrixWorld(true);return {world,root,kid,model,ch,state};
}
function currentNozzle(model){const p=model.userData.muzzle.clone();for(let n=model;n;n=n.parent)p.applyMatrix4(new Matrix4().compose(n.position,n.quaternion,n.scale));return p;}
const closePoint=(a,b,label)=>{for(const k of ['x','y','z'])close(a[k],b[k],label+' '+k);};
test('each local and ghost birth resamples translated/recoiled/rotated/scaled current nozzle without altering native snapshots',()=>{
  for(const remote of [false,true]){
    const f=fixture(),h=heldTrizooka(f);f.actor.remote=remote;const born=[];
    function pose(i){h.world.position.set(5+i,1,-3);h.root.position.set(i*.7,2,1);h.root.rotation.set(.1*i,.4+i*.2,-.06*i);h.kid.scale.set(1.1,.9,1.2);h.model.position.set(-.11,.96,.25-i*.035);h.model.rotation.set(-.2+i*.1,.25*i,.08);}
    if(remote){for(let i=0;i<3;i++){pose(i);f.G.time=i*4/60;const expected=currentNozzle(h.model);const p=f.system.ghostProjectile(f.actor,f.packet(i));born.push(p);closePoint(f.flashes[i].pos,expected,'ghost current nozzle');}}
    else{pose(0);const expected0=currentNozzle(h.model);born.push(...f.volley());closePoint(f.flashes[0].pos,expected0,'local initial nozzle');
      for(let frame=1;frame<=8;frame++){pose(frame/4);const expected=currentNozzle(h.model);f.tick(1/60);if(frame===4||frame===8)closePoint(f.flashes.at(-1).pos,expected,'local delayed nozzle');}}
    assert.equal(f.flashes.length,3);assert.notDeepEqual(f.flashes[1].pos,f.flashes[0].pos);
    for(const p of born)assert.deepEqual({...p.start},{x:2,y:3,z:4},'gameplay origin stays committed');
    assert.deepEqual({...f.actor.pos},{x:0,y:0,z:0});
  }
});
test('hidden/retired/missing/wrong-owner/nonfinite nozzles use finite native snapshot fallback',()=>{
  const cases=[
    h=>{h.model.visible=false;},h=>{h.kid.visible=false;},h=>{h.root.visible=false;},h=>{h.world.visible=false;},
    (h,f)=>{f.motion.presentationStates.delete(h.ch);},h=>{h.state.kind=null;},h=>{h.state.models.set('trizooka',new Group());},
    h=>{h.world.add(h.model);},h=>{h.model.userData.muzzle=null;},h=>{h.model.userData.muzzle.x=NaN;},h=>{h.root.scale.x=Infinity;},
    h=>{h.ch.s3SpecialPresentationEnabled=false;},h=>{h.ch.kidForm=false;},h=>{h.ch.dance=true;},
    (h,f)=>{f.actor.character={};},(h,f)=>{f.actor.specialActive={id:'inkVac'};},
    (h,f)=>{f.motion.presentationBlocked.set(h.ch,f.actor.specialActive);},
  ];
  for(const mutate of cases){const f=fixture(),h=heldTrizooka(f);h.root.position.set(8,2,3);mutate(h,f);f.volley();assert.equal(f.flashes.length,1);assert.deepEqual(f.flashes[0].pos,{x:2,y:3,z:4});}
});
test('read-only accessor rejects dead/jumping ownership and refreshes world matrices without native muzzle calls',()=>{
  const f=fixture(),h=heldTrizooka(f),out=new Vec();h.root.position.set(7,8,9);h.root.rotation.y=.9;
  let refreshed=0;const original=h.model.updateWorldMatrix;h.model.updateWorldMatrix=function(...args){refreshed++;return original.apply(this,args);};
  h.ch.getMuzzle=()=>{throw new Error('must not call gameplay muzzle');};h.ch.getAimMuzzle=h.ch.getMuzzle;
  assert.equal(f.motion.trizookaPresentationMuzzle(h.ch,out),true);closePoint(out,currentNozzle(h.model),'read-only world transform');assert.ok(refreshed>0);
  f.actor.alive=false;assert.equal(f.motion.trizookaPresentationMuzzle(h.ch,out),false);f.actor.alive=true;f.actor.superJumpState={};assert.equal(f.motion.trizookaPresentationMuzzle(h.ch,out),false);
});

for(const remote of [false,true])test(`${remote?'ghost':'local'} foreign live-character alias uses native snapshot fallback`,()=>{
  const f=fixture();f.actor.remote=remote;f.actor.specialActive={id:'trizooka',phase:'charge'};
  const other={...f.actor,pos:new Vec(30,0,0)},h=heldTrizooka({...f,actor:other});
  h.root.position.set(40,8,-20);
  const foreign=new Vec();assert.equal(f.motion.trizookaPresentationMuzzle(h.ch,foreign),true);
  assert.deepEqual({...foreign},{x:40,y:8.075,z:-19.598},'foreign model is live, visible and internally owned');
  f.actor.character=h.ch;assert.equal(h.ch.actor,other);assert.equal(other.character,h.ch);
  const born=[];
  if(remote){for(let i=0;i<3;i++){f.G.time=i*4/60;born.push(f.system.ghostProjectile(f.actor,f.packet(i)));}}
  else{born.push(...f.volley());for(let frame=0;frame<8;frame++)f.tick(1/60);}
  assert.equal(f.flashes.length,3);for(const flash of f.flashes)assert.deepEqual(flash.pos,{x:2,y:3,z:4},'expected owner cannot borrow another actor’s live nozzle');
  for(const p of born)assert.deepEqual({...p.start},{x:2,y:3,z:4},'native snapshot stays untouched');
  assert.equal(f.packets.length,remote?0:3,'birth recording count stays native');
});
