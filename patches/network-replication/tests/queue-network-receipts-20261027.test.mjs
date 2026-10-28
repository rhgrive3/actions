import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {observeOwnerTick,commitOwnerTick} from '../owner-tick-receipt.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
test('owner receipt is synchronous, nested, epoch-bound and admits only native actor event identities',()=>{
 const actor={nid:1,owner:'p'},nm={s:{},match:{},cfg:{id:'m'}},d={k:'t',ts:1};
 assert.equal(observeOwnerTick(nm,'p',d,()=>{}).receipt,null);
 const result=observeOwnerTick(nm,'p',d,()=>{
  assert.equal(observeOwnerTick(nm,'q',d,()=>commitOwnerTick(nm,'p',d,[],[])).receipt,null);
  commitOwnerTick(nm,'p',d,[[1,'p',1],[1,'p',2]],[actor]);
 });assert.deepEqual(result.receipt.e,[[1,'p',1]]);
 assert.equal(observeOwnerTick(nm,'p',d,()=>{nm.s={};commitOwnerTick(nm,'p',d,[],[]);}).receipt,null);
 assert.throws(()=>observeOwnerTick(nm,'p',d,()=>{throw Error('stop');}));
 commitOwnerTick(nm,'p',d,[],[]);assert.equal(observeOwnerTick(nm,'p',d,()=>{}).receipt,null);
});
test('final composed native tick commits only after clock and event admission; wipeout is no longer before tick',()=>{
 const code=adaptBuildSource('src/net/netmatch.js',fs.readFileSync(new URL('../../../inkwave-public/src/net/netmatch.js',import.meta.url),'utf8'));
 const start=code.indexOf('  _tick(from, d) {'),end=code.indexOf('\n  _advance(',start),tick=code.slice(start,end);
 assert.ok(tick.indexOf('validOwnerClockTick')<tick.indexOf('commitOwnerTick'));
 assert.ok(tick.indexOf('p.events.push(e)')<tick.indexOf('commitOwnerTick'));
 assert.ok(tick.indexOf('commitOwnerTick')<tick.indexOf('acceptWipeoutTimeline'));
 assert.match(code,/case 't': this\._tick\(from, d\); break;/);
});
test('actual pending flush preserves all live FIFO claims when prune removes expired prefix and callbacks enqueue',()=>{
 const source=fs.readFileSync(new URL('../combat-provenance.mjs',import.meta.url),'utf8');
 const prune=source.slice(source.indexOf('function prune('),source.indexOf('\nfunction weaponId('));
 const flush=source.slice(source.indexOf('function flush('),source.indexOf('\nexport function installCombatProvenance'));
 for(const type of ['pvp','boss'])for(const times of [[98,99.5,99.8],[99.5,98,99.8],[99.5,99.8,98]]){
  const state={proofs:new Map(),pending:new Map(),contacts:new Map()},seen=[],peer={};
  const items=times.map((at,i)=>({at,type,d:{h:i+1,q:i+1,w:'shot'}}));state.pending.set('p',items);
  const nm={_combatProvenance:state,peers:new Map([['p',peer]])};
  const context=vm.createContext({Map,Set,state:()=>state,PENDING_AGE:.95,PROOF_AGE:3.5,SPECIAL_PROOF_AGE:10,
   combatAdmission(nm,from,d){context.prune(state,100);seen.push(d.h);if(seen.length===1)state.pending.set('p',[{at:99.9,type,d:{h:9,q:9}}]);return false;}});
  // This test isolates FIFO reentrancy/pruning; native admission is covered by
  // the production-composed receipt-order tests, so both policies admit here.
  vm.runInContext(prune+'\n'+flush,context);context.flush(nm,'p',100,()=>{},()=>{},()=>true,()=>true);
  assert.deepEqual(seen,times.flatMap((t,i)=>t>=99.05?[i+1]:[]));
  assert.deepEqual([...state.pending.get('p')].map(x=>x.d.h),[...seen,9]);
 }
});
test('actual splash arbitration snapshots shared collision hits across reentrant defense callbacks',()=>{
 const source=fs.readFileSync(new URL('../../splatoon3/runtime/torpedo-splashes.mjs',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('export function stepTorpedoSplashes('),source.indexOf('\nexport function clearTorpedoSplashes')).replace('export ','');
 class V{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}}
 for(const standWins of [false,true])for(const defenseWins of [false,true]){
  const world={hit:true,point:new V(1,2,3),normal:new V(0,1,0),dist:3};
  const stand=standWins?{point:new V(4,5,6),normal:new V(1,0,0),distance:2}:null;
  const d={age:0,prev:new V(),pos:new V(),vel:new V(),source:{spec:{gravity:0}},owner:{remote:false},size:.1};
  const seen=[],projectiles={_s3TorpedoSplashes:[d],kitDefenseCandidate(){world.point.x=99;if(stand)stand.point.x=99;return defenseWins?{distance:1,onHit(){seen.push('defense');}}:null;}};
  const api={THREE:{Vector3:V},Hit:class{},G:{physics:{segment:()=>world}}};
  const context=vm.createContext({coolerSegmentContact:()=>stand,remove(){seen.push('retire');},syncVisuals(){}});
  const sync=source.slice(source.indexOf('function requestVisualSync('),source.indexOf('\nexport function beginTorpedoVisualBatch'));
  vm.runInContext(sync+'\n'+body,context);context.stepTorpedoSplashes(api,projectiles,1/60,(_,at)=>seen.push([at.x,at.y,at.z]));
  assert.deepEqual(seen,defenseWins?['defense','retire']:[standWins?[4.035,5,6]:[1,2.035,3],'retire']);
 }
});
