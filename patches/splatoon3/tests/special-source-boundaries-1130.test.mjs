import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// Every runtime entry is checked through production composition, not a second
// hand-written implementation. Source 11.3.0 reference is Leanny/splat3
// @7280ff9cde8bb1c5dcef46c700c326471584d2e6.
const EXTRA = `
  export { SPECIAL_NAMES } from './patches/splatoon3/runtime/catalogue.mjs';
  export { ALL_SPECIALS, waveBreakerGroundMarkRatio, krakenDashSweptContact } from './patches/splatoon3/runtime/all-specials.mjs';
`;
const NAMES = {
  trizooka: 'ウルトラショット', bubbler: 'グレートバリア', zipcaster: 'ショクワンダー',
  tentaMissiles: 'マルチミサイル', inkjet: 'ジェットパック', storm: 'アメフラシ',
  booyahBomb: 'ナイスダマ', ultraStamp: 'ウルトラハンコ', killerWail: 'メガホンレーザー5.1ch',
  inkVac: 'キューインキ', crabTank: 'カニタンク', reefslider: 'サメライド',
  tripleInkstrike: 'トリプルトルネード', tacticooler: 'エナジースタンド',
  superChump: 'デコイチラシ', krakenRoyale: 'テイオウイカ',
  splattercolorScreen: 'スミナガシート', waveBreaker: 'ホップソナー',
  tripleSplashdown: 'ウルトラチャクチ',
};
async function setup(){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:EXTRA});
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  return f;
}
function equip(actor,id){
  actor.weapon={...actor.weapon,special:id,specialCost:100};actor.special=100;
  actor.alive=true;actor.remote=false;
  actor.intent.fire=false;actor.intent.sub=false;actor.intent.jump=false;
  actor._prevIntent ||= {}; Object.assign(actor._prevIntent,{fire:false,sub:false,jump:false,squid:false});
}

test('nineteen multiplayer specials exist as real installable entries and keep Japanese names',async()=>{
 const f=await setup();
 assert.deepEqual(Object.keys(f.SPECIAL_NAMES).sort(),Object.keys(NAMES).sort());
 for(const [id,name] of Object.entries(NAMES)){
   assert.equal(f.SPECIAL_NAMES[id],name,`catalogue label for ${id}`);
   assert.equal(f.SPECIALS[id]?.id,id,`installed runtime special ${id}`);
 }
 assert.equal(Object.keys(f.ALL_SPECIALS).length,13,'13 catalogue-specific and 6 native kit special families');
});

test('Wave Breaker ground marking follows every sourced 11.3.0 4F/10F/18F control point',async()=>{
 const f=await setup(),ratio=f.waveBreakerGroundMarkRatio;
 for(const [frame,expected] of [[0,0],[3.99,0],[4,.19],[10,.4],[18,.615],[27,.615],[37,.615],[45,.615]]){
   assert.ok(Math.abs(ratio(frame)-expected)<1e-12,`frame ${frame} expected ${expected}, got ${ratio(frame)}`);
 }
 assert.ok(Math.abs(ratio(7)-.295)<1e-12);
 assert.ok(Math.abs(ratio(14)-.5075)<1e-12);
 assert.equal(ratio(NaN),0);
 assert.equal(ratio(-10),0);
});

test('Wave Breaker physically reveals an opponent on the sourced 10F 0.4-radius boundary',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'waveBreaker');
 victim.team=1;f.G.actors=[a,victim];
 a._startSpecial();a.intent.fire=true;a._updateSpecial(1/60);
 const wave=f.G.projectiles._s3AllSpecialObjects.find(o=>o.kind==='wave');
 assert.ok(wave);assert.equal(wave.maxRadius,20);
 victim.pos.copy(wave.pos);victim.pos.z+=7.85;
 for(let i=0;i<10;i++){f.G.time+=1/60;f.G.projectiles.update(1/60);}
 assert.ok(victim.s3.revealedUntil?.[0]>f.G.time, 'radius 7.85 must be marked at frame 10 (0.4 * 20)');
});

test('Kraken Royale dash sweeps the whole 1.5-unit source capsule instead of only its midpoint',async()=>{
 const f=await setup();
 const p={x:0,z:0},q={x:0,z:.35};
 assert.equal(f.krakenDashSweptContact(p,q,{x:1.49,z:0}),true,'near initial endpoint');
 assert.equal(f.krakenDashSweptContact(p,q,{x:1.49,z:.35}),true,'near final endpoint');
 assert.equal(f.krakenDashSweptContact(p,q,{x:1.51,z:0}),false,'outside real radius');
 assert.equal(f.krakenDashSweptContact(p,p,{x:0,z:0}),true,'zero movement');
 assert.equal(f.krakenDashSweptContact(p,q,{x:Infinity,z:0}),false,'reject invalid input');
});

test('Kraken Royale collision admission hits an edge-of-capsule target once',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'krakenRoyale');
 victim.team=1;f.G.actors=[a,victim];a._resolve=()=>{};
 a.aimPoint.set(0,1,20);a.aimDir.set(0,0,1);
 const hits=[],hit=f.G.projectiles.applyHit;
 f.G.projectiles.applyHit=function(...args){hits.push(args);return hit.apply(this,args);};
 a._startSpecial();a.intent.fire=true;a._updateSpecial(1/60);
 a.intent.fire=false;
 for(let i=0;i<36;i++)a._updateSpecial(1/60);
 assert.equal(a._s3AllSpecialState.phase,'dash');
 victim.pos.set(a.pos.x+1.49,0,a.pos.z);
 a._updateSpecial(1/60);
 assert.ok(hits.some(h=>h[1]===victim&&h[3]==='krakenRoyale'), 'entry end of dash capsule must hit');
});