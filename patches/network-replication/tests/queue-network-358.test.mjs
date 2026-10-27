import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {validNetworkProjectileCosmetics} from '../snapshot-guard.mjs';
import {indexedGhostBudget} from '../ghost-live-index.mjs';
import {actualModule} from './added-actual-module.mjs';
const guard=fs.readFileSync(new URL('../snapshot-guard.mjs',import.meta.url),'utf8'),start=guard.indexOf('export function validNetworkProjectileCosmetics('),end=guard.indexOf('\nexport function validSnapshotTimestamp',start);
const before=vm.runInNewContext('('+guard.slice(start,end).replace('export function','function').replace(/  if \(e\[20\][\s\S]*?(?=  if \(e\[21\])/, '  for (const [i,low,high] of [[20,0,8],[22,0,16],[23,0,4],[24,0,512],[25,-2,4]]) {if (e[i] !== undefined && !bounded(e[i], low, high)) return false;}\n')+')', {NETWORK_PROJECTILE_TAIL_RATIO_MAX:4096,NETWORK_PROJECTILE_TAIL_EXTENT_MAX:128,bounded:(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b,finite:Number.isFinite,integer:(v,a,b)=>Number.isSafeInteger(v)&&v>=a&&v<=b,validNetworkProjectileInkMeta:m=>!Array.isArray(m)||m.length===5&&m[0]==='iw-ink-flight-1'&&['shooter','dualies','splatling'].includes(m[1])&&Number.isSafeInteger(m[2])&&m[2]>=0&&typeof m[3]==='number'&&m[3]>=0&&m[3]<1&&typeof m[4]==='boolean'});
test('cosmetic scalar checks retain every range boundary and getter visitation order',()=>{
 assert.match(before.toString(),/for \(const \[i,low,high\]/);
 const cases=[undefined,null,NaN,Infinity,-Infinity,false,'0',0,-0,.1,4,8,16,128,512,4096];
 for(const i of [19,20,21,22,23,24,25,26,27])for(const value of cases){const e=[0,'p'];e[15]=1;e[i]=value;assert.equal(validNetworkProjectileCosmetics(e),before(e),i+':'+value);}
 for(const [i,lo,hi]of [[20,0,8],[22,0,16],[23,0,4],[24,0,512],[25,-2,4]])for(const value of [lo-1e-9,lo,hi,hi+1e-9]){const e=[0,'p'];e[i]=value;assert.equal(validNetworkProjectileCosmetics(e),before(e));}
 const run=fn=>{const reads=[],e=[0,'p'];for(const i of [19,20,22,23,24,25,21,26,27])Object.defineProperty(e,i,{get(){reads.push(i);return i===23?NaN:undefined;}});return [fn(e),reads];};assert.deepEqual(run(validNetworkProjectileCosmetics),run(before));
});
const net=adaptBuildSource('src/net/netmatch.js',fs.readFileSync(new URL('../../../inkwave-public/src/net/netmatch.js',import.meta.url),'utf8')),a=net.indexOf('const NETWORK_GHOST_TOTAL_LIMIT'),b=net.indexOf('\n\n',net.indexOf('  return true;\n}',a));
const quota=vm.runInNewContext('(()=>{'+net.slice(a,b)+';return canAllocateNetworkGhost})()',{indexedGhostBudget,Array,Symbol});
test('composed indexed quota retains exact boundaries and custom-container fallback',()=>{
 const actor={owner:'peer'},peer={owner:'peer'},other={owner:'other'};
 const old=(list,who)=>{let all=0,byActor=0,byPeer=0;for(const r of list){if(!r?.ghost)continue;if(++all>=640)return false;if(r.owner===who&&++byActor>=128)return false;if(r.owner?.owner===who.owner&&++byPeer>=256)return false;}return true;};
 for(const n of [0,1,127,128,129,255,256,639,640,750])for(const mode of ['actor','peer','spread','local','sparse']){const list=Array.from({length:n},(_,i)=>mode==='sparse'&&i%2?null:{ghost:mode!=='local',owner:mode==='actor'?actor:mode==='peer'?peer:i%3===0?actor:other});assert.equal(quota({list,ghostProjectile(){}},actor),old(list,actor),n+':'+mode);}
 const list=[];list[Symbol.iterator]=function*(){for(let i=0;i<128;i++)yield{ghost:true,owner:actor};};assert.equal(quota({list,ghostProjectile(){}},actor),false);
 const growing=[];Object.defineProperty(growing,0,{get(){growing.push(...Array.from({length:128},()=>({ghost:true,owner:actor})));return{ghost:true,owner:actor};},configurable:true});growing.length=1;assert.equal(quota({list:growing,ghostProjectile(){}},actor),false,'fallback must observe a getter that expands the live iterator');
 assert.equal(quota({list:{length:0},ghostProjectile(){}},actor),false);assert.equal(quota({list:[]},actor),false);
});
test('single-slice pose proposal loses mutation performed by an owner lookup callback',async()=>{
 const candidate=source=>source.replace("      if(ownerActor(nm,from,r[0]))poses.set(r[0],r.slice(1,4));", "      const xyz=r.slice(1,4);\n      if(ownerActor(nm,from,r[0]))poses.set(r[0],xyz);");
 const original=await actualModule('patches/network-replication/combat-provenance.mjs',{extra:'export {record};'}),changed=await actualModule('patches/network-replication/combat-provenance.mjs',{transform:candidate,extra:'export {record};'});
 const run=api=>{const row=[1,0,0,0],actor={owner:'peer',remote:true,alive:true};const nm={byNid:{get(){row[1]=10;return actor;}}};api.record(nm,'peer',{ts:100,a:[row],e:[]},100);return Array.from(nm._combatPoseScratch.get(1));};
 assert.deepEqual(run(original.api),[10,0,0],'accepted pose reads the source after synchronous owner callback');assert.deepEqual(run(changed.api),[0,0,0],'premature slice misses the owner mutation');
});
