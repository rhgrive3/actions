import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { TowerRule } from '../runtime/ranked/tower.mjs';
import { installSplatling } from '../runtime/splatling.mjs';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { specialVfxDirector } from '../runtime/special-vfx.mjs';

test('settled Tower interpolation skips writes while restore and direct state edits are normalized',()=>{
  const rule=new TowerRule({counts:[100,100],penalties:[0,0]}, {tower:{path:[[-10,0,0],[0,0,0],[10,0,0]],centerIndex:1,checkpoints:[[],[]]}});
  let writes=0;rule.state.position=new Proxy(rule.state.position,{set(t,k,v){writes++;return Reflect.set(t,k,v);}});
  rule.update(0,{actors:[]});assert.equal(writes,3);
  for(let i=0;i<30;i++)rule.update(1/60,{actors:[]});assert.equal(writes,3);
  rule.state.pathDistance=12;rule.update(0,{actors:[]});assert.deepEqual([...rule.state.position],[2,0,0]);
  rule.state.position[0]=999;rule.update(0,{actors:[]});assert.equal(rule.state.position[0],2);
  const restored={...rule.state,position:[999,999,999],pathDistance:10};rule.restore(restored);
  rule.update(0,{actors:[]});assert.deepEqual(rule.state.position,[0,0,0]);
});

test('Splatling fixed arity dispatch preserves extensions, nested speed leases and exception unwind',()=>{
  class WeaponRunner{reset(){}}
  class Actor{}
  const rows=[];let nested=false,crash=false;
  class Projectiles{_fireRound(...args){
    const [actor,weapon]=args;rows.push({count:args.length,speed:weapon.projSpeed,tail:args.at(-1)});
    if(crash)throw Error('round');
    if(!nested&&actor?.nested){nested=true;this._fireRound(actor,weapon,1,2,3,4,5,6);nested=false;assert.equal(weapon.projSpeed,rows.at(-2).speed);}
    return weapon.projSpeed;
  }}
  installSplatling({WeaponRunner,Actor,Projectiles,G:{},PLAYER:{inkMax:100}}, {}, {});
  const system=new Projectiles(),weapon={kind:'splatling',projSpeed:60,speedRandomRate:.12,speedRandomBias:1};
  const random=Math.random;Math.random=()=>.5;
  try{
    assert.equal(system._fireRound({},weapon,1,2,3,4,5,6),60);assert.equal(rows.at(-1).count,8);
    assert.equal(system._fireRound({},weapon,1,2,3,4,5,6,'extension'),60);assert.equal(rows.at(-1).count,9);assert.equal(rows.at(-1).tail,'extension');
    system._fireRound({nested:true},weapon,1,2,3,4,5,6);
    crash=true;assert.throws(()=>system._fireRound({},weapon,1,2,3,4,5,6),/round/);crash=false;
    assert.equal(system._fireRound({},weapon,1,2,3,4,5,6),60);assert.equal(weapon.projSpeed,60);
    system._fireRound({}, {kind:'shooter',projSpeed:20},1,2,3,4,5,6,'extension');assert.equal(rows.at(-1).count,9);
  }finally{Math.random=random;}
});

test('full Charger piercing uses one local base per shot and keeps target sorting and independent positions',()=>{
  const source=fs.readFileSync(new URL('../runtime/weapons.mjs',import.meta.url),'utf8');
  const start=source.indexOf('  const fireCharger = Projectiles.prototype.fireCharger;'),end=source.indexOf('  const auto =',start);
  let clones=0;const logs=[],G={actors:[],physics:{raycast(_a,_b,_c,hit){hit.hit=false;return hit;}}};
  class Hit{}
  class Projectiles{
    fireCharger(){assert.equal(G.actors.length,0);}
    _muzzle(_a,v){return v.set(0,0,0);}
    _aimFrom(_a,_m,v){return v.set(0,0,1);}
    applyHit(_a,b){logs.push(b.id);}
  }
  const bases=[];
  const Physics={segmentCapsuleDist(_a,_b,base,_r,_h,out){bases.push(base);out.dist=.1;out.t=base.z/10;}};
  new Function('Projectiles','G','THREE','Hit','Physics','PLAYER','isChargerFullCharge',source.slice(start,end))(Projectiles,G,THREE,Hit,Physics,{radius:.3,height:1.7,squidHeight:.5},c=>c===1);
  const targets=[3,1,2].map(id=>{const pos=new THREE.Vector3(id,0,id);const clone=pos.clone;pos.clone=function(){clones++;return clone.call(this);};return {id,pos,team:1,alive:true,smoothY:.2};});
  G.actors=targets;const ps=new Projectiles(),actor={team:0};ps.fireCharger(actor,{rangeMax:10,damageMax:160},1);
  assert.equal(clones,1);assert.deepEqual(logs,[1,2,3]);assert.equal(new Set(bases).size,1);assert.ok(targets.every(t=>t.pos.y===0));
  const firstBase=bases[0];ps.fireCharger(actor,{rangeMax:10,damageMax:160},1);assert.notEqual(bases.at(-1),firstBase);
});

test('actual Aim Assist method keeps boundary selection and state while pruning distant angles before trig',()=>{
  const source=adaptBuildSource('src/game/player.js',fs.readFileSync(new URL('../../../inkwave-public/src/game/player.js',import.meta.url),'utf8'));
  const start=source.indexOf('  _assistTarget(strength) {'),end=source.indexOf('\n  computeAim',start),method=source.slice(start,end);
  const before=method.replace('      if (dot < COS_ASSIST_MAX) continue;\n','');
  const state=()=>({has:false,target:null,yaw:0,pitch:0});
  const counts=[];
  for(const angle of [0,2.5,9.999999999,10,10.000000001,35,90,180]){
    const G={actors:[],camera:{position:new THREE.Vector3(),getWorldDirection:v=>v.set(0,0,1)},physics:{los:()=>true}};
    const actor={team:0,pos:new THREE.Vector3(),weapon:{kind:'shooter',range:20}};
    G.actors=[{id:1,team:1,alive:true,anim:{form:'kid'},form:'kid',invuln:0,pos:new THREE.Vector3(Math.sin(angle*Math.PI/180)*10,-.95,Math.cos(angle*Math.PI/180)*10)}];
    const results=[];
    for(const body of [before,method]){
      let trig=0;const math=Object.create(Math);for(const key of ['acos','atan2'])math[key]=(...a)=>{trig++;return Math[key](...a);};
      const context={THREE,G,Math:math,DEG:Math.PI/180,COS_ASSIST_MAX:Math.cos(10*Math.PI/180)-1e-12,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),_v:new THREE.Vector3(),_c:new THREE.Vector3(),_fwd:new THREE.Vector3()};
      const fn=vm.runInNewContext('({'+body+'})._assistTarget',context),controller={assist:state(),a:actor};
      const result=fn.call(controller,1);results.push({target:result?.target?.id,state:{...controller.assist,target:controller.assist.target?.id}});counts.push(trig);
    }
    assert.deepEqual(results[1],results[0],String(angle));
  }
  assert.equal(counts.at(-1),0);assert.equal(counts.at(-2),2);
});

test('actual Boss charge branch preserves ordered body hits and recoil with two trig evaluations',()=>{
  const source=adaptBuildSource('src/boss/bossHazards.js',fs.readFileSync(new URL('../../../inkwave-public/src/boss/bossHazards.js',import.meta.url),'utf8'));
  const start=source.indexOf("          case 'charge': {"),end=source.indexOf("          case 'frenzy':",start),body=source.slice(start,end);
  const baseline=body.replace('            const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);\n','').replace(/\bsy\b/g,'Math.sin(p.yaw)').replace(/\bcy\b/g,'Math.cos(p.yaw)');
  const count=[];
  const compile=body=>{let trig=0;const math=Object.create(Math);for(const key of ['sin','cos'])math[key]=(...a)=>{trig++;return Math[key](...a);};
    const fn=vm.runInNewContext('(function(a,p){const u1=1,tele=.5,m={d:[0,2]},mul=.7,key=()=>"ram";switch("charge"){'+body+'}})',
      {Math:math,chargeDist:()=>3,WALL_BODY:[{z:2.3,r:2.5},{z:-1.8,r:2.6}],HZ:{chargeDmg:40}});
    return {fn,calls:()=>trig};};
  const before=compile(baseline),after=compile(body);
  for(let i=0;i<3000;i++){
    const p={x:0,y:0,z:0,yaw:(i*.713)%6.28},a={pos:new THREE.Vector3((i%23)-11,(i%7)-2,(i%29)-14),vel:new THREE.Vector3(1,2,3),grounded:true};
    const values=[];
    for(const kernel of [before,after]){
      const actor={...a,pos:a.pos.clone(),vel:a.vel.clone()},damage=[],self={hits:new Set(i%11===0?['ram']:[]),_damage:(_a,n)=>damage.push(n)};
      kernel.fn.call(self,actor,p);values.push({vel:actor.vel.toArray(),grounded:actor.grounded,hits:[...self.hits],damage});
    }
    assert.deepEqual(values[1],values[0]);
  }
  count.push(before.calls(),after.calls());assert.equal(count[1],6000);assert.ok(count[0]>count[1]);
});

test('Inkjet admission shares round classification and falls back after same-length recycling',async()=>{
  const f=await fixture({fullRuntime:true,realProjectiles:true}),{G,THREE}=f,api=f.installedRuntime;
  G.scene=new THREE.Scene();G.projectiles=new api.Projectiles(G.scene);G.camera=new THREE.PerspectiveCamera();
  const fx=G.fx=new api.FX(G.scene,{quality:'high'});fx.setCollider(()=>null);
  const actor=f.make('shooter');actor.specialActive={id:'inkjet'};actor.form='kid';actor.alive=true;G.actors=[actor];
  const inkjet={wid:'inkjet',seed:1,pos:new THREE.Vector3(),vel:new THREE.Vector3(),owner:actor,team:0,dead:false};
  G.projectiles.list=[...Array.from({length:100},()=>({wid:'shooter',pos:new THREE.Vector3()})),inkjet];
  fx.update(1/60,G.camera);const director=specialVfxDirector(fx),seen=[],candidates=director.frameRoundCandidates;
  director.frameRoundCandidates=function(){const list=candidates.call(this);seen.push(list.length);return list;};
  fx.update(1/60,G.camera);assert.ok(seen.length>=2);assert.ok(seen.every(n=>n===1));
  seen.length=0;const track=director.track;let recycled=false;
  director.track=function(a){const result=track.call(this,a);if(!recycled){recycled=true;const p=G.projectiles._new();Object.assign(p,{wid:'inkjet',seed:2,pos:new THREE.Vector3(),vel:new THREE.Vector3(),owner:actor,team:0,dead:false});G.projectiles.list[0]=p;}return result;};
  fx.update(1/60,G.camera);assert.ok(seen.includes(101),'same-length birth invalidates the cached subset');
  fx.clear();assert.equal(director._frameRounds.length,0);
});
