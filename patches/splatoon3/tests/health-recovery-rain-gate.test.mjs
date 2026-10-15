import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fixture} from './source-fixture.mjs';
const OLD=`  const P = api.PLAYER, r = tuning, rain = stormRecoveryState(a, api);
  if (!onEnemy && !rain.enemy && a.lastDamage + 1e-10 >= r.regenDelay && a.hp < P.hp) {`;
const NEW=`  const P = api.PLAYER, r = tuning;
  // Rain cannot change an ineligible recovery tick. Keep the exact comparisons
  // (including NaN behavior), and query live clouds once recovery is possible.
  if (onEnemy || !(a.lastDamage + 1e-10 >= r.regenDelay) || !(a.hp < P.hp)) return;
  const rain = stormRecoveryState(a, api);
  if (!rain.enemy) {`;
function snapshot(root){const seen=new Map();function walk(v){if(typeof v==='number')return Number.isNaN(v)?'NaN':Object.is(v,-0)?'-0':!Number.isFinite(v)?String(v):v;if(!v||typeof v!=='object')return typeof v==='function'?'[function]':v;if(seen.has(v))return {$ref:seen.get(v)};seen.set(v,seen.size);return Object.fromEntries(Object.keys(v).sort().map(k=>[k,walk(v[k])]));}return walk(root);}
async function setup(baseline){
 const f=await fixture({productionComposition:true,adaptRuntime:(rel,s)=>rel==='patches/splatoon3/runtime/resources.mjs'&&baseline?s.replace(NEW,OLD):s});
 f.setRandom(()=>.5);const a=f.make('charger'),V=f.THREE.Vector3;
 const level={blocks:[],faces:[],queryBlocks(_x,_z,_xx,_zz,out){out.length=0;for(let i=0;i<this.blocks.length;i++)out.push(i);return out;}};
 const physics=new f.Physics(level),nativeLos=physics.los;let los=0;
 physics.los=function(...args){los++;return nativeLos.apply(this,args);};
 f.G.physics=physics;f.G.projectiles={clouds:[]};
 const clone=V.prototype.clone;let clones=0;V.prototype.clone=function(){clones++;return clone.call(this);};
 return {f,a,V,physics,level,get counts(){return {los,clones};},reset(){los=clones=0;},restore(){V.prototype.clone=clone;f.restoreRandom();}};
}
function clouds(f,kind){return Array.from({length:kind===0?0:8},(_,i)=>({team:kind===1?0:kind===2?1:i%2,t:1,dur:8,group:{position:new f.THREE.Vector3(0,5,0)}}));}
test('ineligible HP recovery avoids real LOS and clones without changing any Actor field',{skip:process.env.INKWAVE_BUILT_SITE?'source-only baseline transformation; emitted functional case runs below':false},async t=>{
 assert.equal(fs.readFileSync(new URL('../runtime/resources.mjs',import.meta.url),'utf8').split(NEW).length,2);
 const old=await setup(true),next=await setup(false);t.after(()=>{old.restore();next.restore();});
 const hps=[100,101,99,0,NaN,Infinity,-Infinity],delays=[0,1-1e-10,1-2e-10,1,NaN,Infinity,-Infinity];
 let cases=0,removed=0;
 for(const hp of hps)for(const lastDamage of delays)for(const onEnemy of [false,true])for(const submerged of [false,true])for(const kind of [0,1,2,3])for(const hz of [30,60,120]){
  for(const s of [old,next]){s.a.hp=hp;s.a.lastDamage=lastDamage;s.a.alive=true;s.a.pos.set(0,0,0);s.f.G.projectiles.clouds=clouds(s.f,kind);s.reset();}
  old.f.updateHealthRecovery(old.a,1/hz,onEnemy,submerged);next.f.updateHealthRecovery(next.a,1/hz,onEnemy,submerged);
  assert.deepEqual(snapshot(next.a),snapshot(old.a));
  const eligible=!onEnemy&&lastDamage+1e-10>=old.f.profile.resources.regenDelay&&hp<old.f.PLAYER.hp;
  if(!eligible){assert.equal(next.counts.los,0);assert.equal(next.counts.clones,0);}else assert.deepEqual(next.counts,old.counts);
  removed+=old.counts.los-next.counts.los;cases++;
 }
 assert.equal(cases,2352);assert.ok(removed>0);
 // No cached full-health decision: injury, enemy rain and removal are observed.
 for(const s of [old,next]){s.a.hp=100;s.a.lastDamage=2;s.f.G.projectiles.clouds=clouds(s.f,1);s.f.updateHealthRecovery(s.a,1/60);s.a.hp=50;s.f.updateHealthRecovery(s.a,1/60);}
 assert.equal(next.a.hp,old.a.hp);assert.ok(next.a.hp>50);
 for(const s of [old,next]){s.f.G.projectiles.clouds=clouds(s.f,2);s.f.updateHealthRecovery(s.a,1/60);s.f.G.projectiles.clouds=[];s.f.updateHealthRecovery(s.a,1/60);}
 assert.deepEqual(snapshot(next.a),snapshot(old.a));
 // Death, special ownership, spatial cutoffs, occluding roof and cloud order.
 let transitions=0;
 for(const alive of [false,true])for(const blocked of [false,true])for(const y of [-9,-8.999999,0,5,5.000001])for(const special of [null,'storm','inkVac']){
  for(const s of [old,next]){
   s.a.alive=alive;s.a.hp=50;s.a.lastDamage=2;s.a.pos.set(0,y,0);s.a.stormGaugeLock=3;
   s.a.specialActive=special?{id:special,t:2,phase:'hold'}:null;
   s.a.superJumpState={phase:'flight',t:.2};s.a.ink=17;s.a.special=43;
   const center=new s.V(0,2.5,0),half=new s.V(1,.25,1);
   s.level.blocks=blocked?[{id:0,solid:true,center,half,axes:[new s.V(1,0,0),new s.V(0,1,0),new s.V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1],aabbMin:center.clone().sub(half),aabbMax:center.clone().add(half)}]:[];
   s.f.G.projectiles.clouds=clouds(s.f,transitions%3+1).reverse();s.reset();
   s.f.updateHealthRecovery(s.a,1/60,false,false);
  }
  assert.deepEqual(snapshot(next.a),snapshot(old.a));assert.deepEqual(next.counts,old.counts);transitions++;
 }
 for(const s of [old,next])s.level.blocks=[];
 // Read-only native LOS uses its private result cache; later queries overwrite it.
 for(const s of [old,next])assert.equal(s.physics.los(new s.V(),new s.V(0,4,0)),true);
 console.log('HEALTH_RAIN_PARITY',JSON.stringify({cases,transitions,avoidedNativeLosCalls:removed}));
});

test('fixture-graph recovery gate immediately observes injury, friendly rain and enemy rain',async t=>{
 if(process.env.INKWAVE_BUILT_SITE){
  const site=path.resolve(process.env.INKWAVE_BUILT_SITE),manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
  const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
  const sourceHash=hash(fs.readFileSync(new URL('../runtime/resources.mjs',import.meta.url)));
  const emittedHash=hash(fs.readFileSync(path.join(site,'patches/splatoon3/runtime/resources.mjs')));
  assert.equal(manifest.files['patch/runtime/resources.mjs'],sourceHash);
  assert.equal(manifest.artifacts['patches/splatoon3/runtime/resources.mjs'],emittedHash);
  console.log('HEALTH_RAIN_EMITTED_RECEIPT',JSON.stringify({contentHash:manifest.contentHash,inputHash:manifest.inputHash,sourceHash,emittedHash}));
 }

 const f=await fixture({productionComposition:true});f.setRandom(()=>.5);t.after(()=>f.restoreRandom());
 const a=f.make('charger'),V=f.THREE.Vector3;
 const physics=new f.Physics({blocks:[],faces:[],queryBlocks(_x,_z,_xx,_zz,out){out.length=0;return out;}});
 const nativeLos=physics.los;let los=0;physics.los=function(...args){los++;return nativeLos.apply(this,args);};f.G.physics=physics;
 f.G.projectiles={clouds:clouds(f,1)};a.alive=true;a.pos.set(0,0,0);a.lastDamage=2;a.hp=f.PLAYER.hp;
 f.updateHealthRecovery(a,1/60);assert.equal(los,0);
 a.hp=50;a.lastDamage=0;f.updateHealthRecovery(a,1/60);assert.equal(los,0);assert.equal(a.hp,50);
 a.lastDamage=2;f.updateHealthRecovery(a,1/60,true);assert.equal(los,0);assert.equal(a.hp,50);
 for(const hz of [30,60,120]){
  a.hp=50;f.G.projectiles.clouds=clouds(f,1);f.updateHealthRecovery(a,1/hz);
  assert.equal(a.hp,50+f.profile.resources.regenRateSwim/hz);
  const healed=a.hp;f.G.projectiles.clouds=clouds(f,2);f.updateHealthRecovery(a,1/hz);assert.equal(a.hp,healed);
  f.G.projectiles.clouds=[];f.updateHealthRecovery(a,1/hz);assert.equal(a.hp,healed+f.profile.resources.regenRate/hz);
 }
 assert.ok(los>0,'late injured state queries current live clouds');
});
