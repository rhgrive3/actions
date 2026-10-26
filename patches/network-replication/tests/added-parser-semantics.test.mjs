import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {actualModule} from './added-actual-module.mjs';
const profile=JSON.parse(fs.readFileSync(new URL('../../splatoon3/profile.json',import.meta.url),'utf8'));
const markerCurrent=`  let markerIndex=-1,multipleMarkers=false;
  for(let index=31;index<=35;index++)if(event[index]===true){if(markerIndex<0)markerIndex=index;else multipleMarkers=true;}
  if(multipleMarkers)return null;`;
const markerProposed=`  let markerIndex=-1;
  for(let index=31;index<=35;index++)if(event[index]===true){if(markerIndex>=0)return null;markerIndex=index;}`;
async function load(candidate=false){
 const f=await actualModule('patches/splatoon3/runtime/weapons-fidelity.mjs',{
  transform:s=>{
   if(!candidate)return s;
   assert.equal(s.split(markerCurrent).length,2,'unique current full-scan marker parser');
   assert.equal(s.split('!packet.slice(5,19).every(Number.isFinite)').length,2,'unique current finite-field parser');
   return s.replace(markerCurrent,markerProposed).replace('!packet.slice(5,19).every(Number.isFinite)',
    '!packetFiniteFields(packet)');
  },
  extra:`export {prepareFidelityProjectilePacket};
  export function setTestApi(value,data){api=value;completion=data;}
  function packetFiniteFields(packet){for(let i=5;i<19;i++)if(i in packet&&!Number.isFinite(packet[i]))return false;return true;}`});
 f.api.setTestApi({WEAPONS:{slosher:{id:'slosher',kind:'slosher'}},SPECIALS:{}},profile.weaponsFidelityCompletion);return f;
}
function event(){const e=Array(34).fill(0);Object.assign(e,{0:100,1:'p',2:1,3:'slosh',4:'slosher',11:0,12:1,27:{s3SlosherPaintBirth:['inkwave-slosher-birth-v1','epoch',0]},29:.5,30:1,31:0,32:1,33:1});return e;}

test('actual proposed scalar marker early-return skips an observable later marker getter',async()=>{
 const original=await load(),candidate=await load(true);
 for(const f of [original,candidate])assert(f.source.includes(markerCurrent));
 const run=f=>{const e=event();let reads=0;e[31]=e[32]=true;Object.defineProperty(e,35,{get(){reads++;return false;}});assert.equal(f.api.prepareFidelityProjectilePacket(e),null);return reads;};
 assert.equal(run(original),1);assert.equal(run(candidate),0,'proposal changes current parser evaluation order');
});

test('actual proposed finite direct-loop skips later prepared-packet getters after invalid data',async()=>{
 const original=await load(),candidate=await load(true);
 const run=f=>{
  const packet=f.api.prepareFidelityProjectilePacket(event());assert(packet);
  let reads=0;packet[5]=NaN;Object.defineProperty(packet,18,{get(){reads++;return 0;}});
  assert.equal(f.api.fidelitySlosherPaintBirth(packet),null);return reads;
 };
 assert.equal(run(original),1);assert.equal(run(candidate),0,'slice snapshots all present values before every rejects');
});

test('ordinary and sparse input admission remains equal but does not erase the executable counterexamples',async()=>{
 const original=await load(),candidate=await load(true);
 for(let bits=0;bits<32;bits++){
  const e=event();for(let i=0;i<5;i++)if(bits&(1<<i))e[31+i]=true;
  assert.equal(!!original.api.prepareFidelityProjectilePacket(e),!!candidate.api.prepareFidelityProjectilePacket(e));
 }
 for(const value of [0,1,NaN,Infinity,undefined,null,'1']){
  const e=event();e[5]=value;delete e[18];
  assert.equal(!!original.api.fidelitySlosherPaintBirth(e),!!candidate.api.fidelitySlosherPaintBirth(e));
 }
});
