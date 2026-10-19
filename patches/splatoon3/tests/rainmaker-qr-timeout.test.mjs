import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {emptyLoadout} from '../runtime/gear.mjs';
async function boot(){
 const f=await fixture({fullRuntime:true,realProjectiles:true,adaptNative:adaptBuildSource,adaptRuntime:adaptBuildSource,extraExports:`export {createRankedEffects} from './patches/splatoon3/runtime/ranked/combat.mjs'; export {installRanked} from './patches/splatoon3/runtime/ranked/install.mjs'; export {RankedEngine} from './patches/splatoon3/runtime/ranked/engine.mjs'; export {flushPendingLethal} from './patches/splatoon3/runtime/damage-timing.mjs';`});
 f.context.structuredClone=structuredClone;f.installRanked({...f.installedRuntime,structuredClone});
 Object.assign(f.G,{netm:null,fx:undefined,paint:{splat:()=>0,sample:()=>1}});f.G.physics.los=()=>true;
 f.G.level.spawnPads=[new f.THREE.Vector3(),new f.THREE.Vector3()];f.G.physics.groundProbe=(_x,_y,_z,_u,_d,_r,h)=>{h.hit=false;return h};return f;
}
function setup(f){
 const a=f.make(),b=f.make();Object.assign(a,{team:0,nid:'carrier',owner:'viewer',invuln:0});Object.assign(b,{team:1,nid:'enemy',invuln:0});
 const l=emptyLoadout();for(const g of l){g.main='quickRespawn';g.subs=['quickRespawn','quickRespawn','quickRespawn']}a.s3.loadout=l;a.s3RefreshGear();
 const m={state:'playing',mode:'rainmaker',actors:[a,b],ranked:new f.RankedEngine('rainmaker',{}),playing:()=>true,canRespawn:()=>false};f.G.match=m;
 const effects=f.createRankedEffects({...f.installedRuntime,G:f.G,THREE:f.THREE,Hit:f.Hit,emit:f.emit},m);
 const revive=()=>{a.respawn();a.invuln=0};
 const timeout=()=>effects.event({kind:'rainmaker-timeout',id:'carrier',pos:a.pos.toArray(),team:0});
 return {a,b,m,effects,revive,timeout};
}
test('local timeout advances QR history, retains zero-kill requirement and never attributes a kill',async()=>{
 const f=await boot();
 for(const seq of [['timeout','enemy'],['enemy','timeout'],['enemy','timeout','enemy'],['enemy','kill','timeout','enemy']]){
  const w=setup(f);let deaths=0,killed=false;
  for(const action of seq){
   if(action==='kill'){w.b.splat(w.a,'weapon');killed=true;assert.equal(w.a.s3.quickRespawnHistory.splats,1);continue}
   if(deaths)w.revive();
   if(action==='timeout')w.timeout();else w.a.splat(w.b,'weapon');
   const shouldShorten=deaths>0&&!killed;
   assert.equal(w.a.respawnTimer,shouldShorten?4.5:8.5,seq.join('/')+' '+action);
   assert.equal(w.a.s3.quickRespawnHistory.seenEnemyDeath,true);
   assert.equal(w.a.s3.quickRespawnHistory.splats,0);
   deaths++;killed=false;
  }
  // Carrier self-timeout cannot add a fake splat to any enemy.
  assert.equal(w.b.stats.splats,seq.filter(x=>x==='enemy').length);
  w.effects.dispose();
 }
});
test('water, fall, generic null rainmaker and self deaths neither start QR history nor consume eligibility',async()=>{
 const f=await boot();
 for(const cause of ['water','fall','rainmaker','weapon'])for(const primed of [false,true]){
  const w=setup(f);if(primed){w.a.splat(w.b,'weapon');w.revive()}
  w.a.splat(cause==='weapon'?w.a:null,cause);
  assert.equal(w.a.respawnTimer,cause==='water'?7:cause==='fall'?5.5:8.5);
  assert.equal(w.a.s3.quickRespawnHistory.seenEnemyDeath,primed);
  w.revive();w.a.splat(w.b,'rainmaker');assert.equal(w.a.respawnTimer,primed?4.5:8.5,'enemy Rainmaker remains ordinary enemy death');w.effects.dispose();
 }
});
function follower(f,w){
 const nm=new f.NetMatch({myId:'viewer',hostId:'host',isHost:false,_members:new Set(['host','viewer']),tr:{sendTo(){},broadcast(){}}},{id:'qr-timeout',mode:'rainmaker'});nm.bind(w.m);f.G.netm=nm;return nm;
}
const packet=(a)=>({k:'rkdamage',match:'qr-timeout',seq:1,victim:'carrier',attacker:null,damage:2000,deathReason:'rainmaker-timeout',life:a.netLife??0});
test('authenticated follower preserves explicit timeout reason through deferred lethal and respawn',async()=>{
 const f=await boot();
 for(const primed of [false,true]){
  const w=setup(f);if(primed){w.a.splat(w.b,'weapon');w.revive()}
  const nm=follower(f,w),p=packet(w.a);nm.onMessage('host',p);assert.equal(w.a.alive,true,'one-tick lethal stays deferred');
  f.G.time+=1/60;assert.equal(f.flushPendingLethal(w.a,f.G.time),true);assert.equal(w.a.respawnTimer,primed?4.5:8.5);assert.equal(w.a.s3.quickRespawnHistory.seenEnemyDeath,true);
  const deaths=w.a.stats.deaths;nm.onMessage('host',p);assert.equal(w.a.stats.deaths,deaths);
  w.revive();w.a.splat(w.b,'weapon');assert.equal(w.a.respawnTimer,4.5);w.effects.dispose();
 }
});
test('timeout wire tag is emitted only by carrier timeout and rejects malformed or unauthorised packets',async()=>{
 const f=await boot();
 {const w=setup(f),sent=[];w.a.remote=true;f.G.netm={cfg:{id:'qr-timeout'},_sendNow:p=>sent.push(p)};w.timeout();assert.equal(sent[0].deathReason,'rainmaker-timeout');assert.equal(sent[0].attacker,null);assert.equal(sent[0].damage,2000);w.effects.dispose()}
 for(const alter of [p=>({...p,deathReason:'water'}),p=>({...p,damage:180}),p=>({...p,attacker:'enemy'}),p=>({...p,life:p.life+1}),p=>({...p,match:'old'}),p=>({...p,seq:0})]){
  const w=setup(f),nm=follower(f,w);nm.onMessage('host',alter(packet(w.a)));assert.equal(w.a.hp,100);assert.equal(w.a.s3.quickRespawnHistory.seenEnemyDeath,false);w.effects.dispose();
 }
 {const w=setup(f),nm=follower(f,w);nm.onMessage('intruder',packet(w.a));assert.equal(w.a.hp,100);w.effects.dispose()}
});
test('ordinary null-attacker ranked damage stays QR-ineligible and water/fall wire causes remain rejected',async()=>{
 const f=await boot();
 for(const cause of [undefined,'Gachihoko_Bullet','Gachihoko_BombCore','GachihokoTimeUpBurst','water','fall','environment']){
  const w=setup(f),nm=follower(f,w),p=packet(w.a);delete p.deathReason;if(cause!==undefined)p.cause=cause;
  assert.doesNotThrow(()=>nm.onMessage('host',p),'null attacker must be emitted as null, not undefined');
  const accepted=cause===undefined||cause.startsWith('Gachihoko');
  if(accepted)assert.ok(w.a.hp<=0);else assert.equal(w.a.hp,100);
  if(accepted){f.G.time+=1/60;assert.equal(f.flushPendingLethal(w.a,f.G.time),true);assert.equal(w.a.respawnTimer,8.5)}
  assert.equal(w.a.s3.quickRespawnHistory.seenEnemyDeath,false);assert.equal(w.b.stats.splats,0);w.effects.dispose();
 }
});
