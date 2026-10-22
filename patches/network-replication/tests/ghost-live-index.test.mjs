import test from 'node:test';import assert from 'node:assert/strict';
import {recordGhostPush,retireGhostRound,clearGhostIndex,indexedGhostBudget,matchingGhostRounds,ghostIndexStats} from '../ghost-live-index.mjs';
function oracle(p,a){let n=0,actor=0,peer=0;for(const r of p.list){if(!r?.ghost)continue;if(++n>=640)return false;if(r.owner===a&&++actor>=128)return false;if(r.owner?.owner===a.owner&&++peer>=256)return false;}return true;}
function push(p,r){p.list.push(r);recordGhostPush(p,r);return r;}
function retire(p,i){const r=p.list[i];p.list[i]=p.list.at(-1);p.list.pop();retireGhostRound(p,r);r.owner=null;return r;}
test('random mixed lifecycle budgets equal independent scan across retire, reuse, clear and owner handoff',()=>{
 let seed=709,nid=0;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 const actors=Array.from({length:24},(_,i)=>({nid:i,owner:i%8})),p={_queueGhostLifecycle:true,list:[]},pool=[];
 for(let i=0;i<20000;i++){
  const op=rng()%10;
  if(op<6){const r=pool.pop()||{};r.owner=actors[rng()%24];r.ghost=rng()%5!==0;r._netId=nid++%20;push(p,r);}
  else if(op<9&&p.list.length)pool.push(retire(p,rng()%p.list.length));
  else if(i%31===0){clearGhostIndex(p);for(const r of p.list)r.owner=null;p.list.length=0;}
  if(i%113===0)actors[rng()%24].owner=rng()%8;
  const a=actors[rng()%24];assert.equal(indexedGhostBudget(p,a),oracle(p,a),i);
  const stats=ghostIndexStats(p);assert.equal(stats.total,p.list.filter(r=>r.ghost).length);assert.equal(stats.rounds,stats.total);
 }
 clearGhostIndex(p);p.list.length=0;assert.deepEqual(ghostIndexStats(p),{total:0,actors:0,rounds:0});
});
test('strict actor, peer and total boundaries retain exact quota comparisons with local rounds mixed in',()=>{
 for(const [kind,limit]of [['actor',128],['peer',256],['total',640]])for(const count of [limit-1,limit,limit+1]){
  const a={owner:'peer',nid:1},p={_queueGhostLifecycle:true,list:[]};
  for(let i=0;i<count;i++)push(p,{ghost:true,owner:kind==='actor'?a:kind==='peer'?{owner:'peer'}:{owner:i},_netId:i});
  for(let i=0;i<80;i++)push(p,{ghost:false,owner:a});
  assert.equal(indexedGhostBudget(p,a),oracle(p,a),kind+count);
 }
});
test('terminal multimap returns every duplicate, handles actor nid changes, clears retirement ownership and never stores local rounds',()=>{
 const a={nid:3,owner:'a'},b={nid:3,owner:'b'},p={_queueGhostLifecycle:true,list:[]};
 const x=push(p,{ghost:true,owner:a,_netId:9}),y=push(p,{ghost:true,owner:a,_netId:9}),z=push(p,{ghost:true,owner:b,_netId:9});push(p,{ghost:false,owner:a,_netId:9});
 assert.deepEqual(Array.from(matchingGhostRounds(p,3,9)),[x,y,z]);
 retire(p,0);assert.deepEqual(new Set(matchingGhostRounds(p,3,9)),new Set([y,z]));a.nid=8;
 assert.deepEqual(Array.from(matchingGhostRounds(p,8,9)),[y]);
 clearGhostIndex(p);p.list.length=0;assert.equal(ghostIndexStats(p).actors,0);
});
test('legacy stores scan and unknown length/list mutations rebuild without weakening quota',()=>{
 const a={nid:1,owner:'x'},p={list:[]};assert.equal(indexedGhostBudget(p,a),null);
 p.list.push({ghost:true,owner:a,_netId:7});assert.equal(Array.from(matchingGhostRounds(p,1,7)).length,1);
 p._queueGhostLifecycle=true;indexedGhostBudget(p,a);
 for(let i=0;i<140;i++)p.list.push({ghost:true,owner:a});push(p,{ghost:false});
 assert.equal(indexedGhostBudget(p,a),false);p.list=[];assert.equal(indexedGhostBudget(p,a),true);
});
test('production composed projectile births, normal recycle and clear drive the same index module',async()=>{
 const {fixture}=await import('../../splatoon3/tests/source-fixture.mjs');
 const f=await fixture({productionComposition:true,realProjectiles:true,extraExports:"export {indexedGhostBudget,matchingGhostRounds,ghostIndexStats} from './patches/network-replication/ghost-live-index.mjs';"});
 const p=f.G.projectiles,a=f.make('shooter');a.nid=3;a.owner='peer';
 assert.equal(p._queueGhostLifecycle,true);assert.equal(f.indexedGhostBudget(p,a),true);
 // _push is the native live-list boundary; the descriptor below is the same
 // shape used by native shooters, without emitting a network event.
 const r=p._new();Object.assign(r,{ghost:true,owner:a,_netId:17,wid:'shooter'});p._push(r);
 assert.equal(f.ghostIndexStats(p).total,1);assert.equal(Array.from(f.matchingGhostRounds(p,3,17))[0],r);
 p.list.pop();p._recycle(r);assert.equal(f.ghostIndexStats(p).total,0);assert.equal(r.owner,null);
 const next=p._new();assert.equal(next,r);Object.assign(next,{ghost:true,owner:a,_netId:19,wid:'shooter'});p._push(next);
 assert.equal(f.ghostIndexStats(p).total,1);p.clear();assert.equal(f.ghostIndexStats(p).total,0);assert.equal(f.ghostIndexStats(p).actors,0);
});
test('ambiguous duplicate object entries fall back to exact legacy counting',()=>{
 const a={owner:'peer',nid:1},round={ghost:true,owner:a,_netId:7},p={_queueGhostLifecycle:true,list:Array(128).fill(round)};
 assert.equal(indexedGhostBudget(p,a),null);assert.equal(oracle(p,a),false);
 assert.equal(Array.from(matchingGhostRounds(p,1,7)).length,128);
});
