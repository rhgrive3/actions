import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Vector3 } from '../../../inkwave-public/vendor/three/build/three.core.js';
import { RankedWorld } from '../runtime/ranked/world.mjs';
import { ClamsRule } from '../runtime/ranked/clams.mjs';
import { RankedEngine, OWNED_RANKED_FRAME, OWNED_RANKED_ACTOR, OWNED_RANKED_BLOCKED } from '../runtime/ranked/engine.mjs';
import {actualModule} from '../../network-replication/tests/added-actual-module.mjs';
import { admitRankedPose } from '../runtime/ranked/pose-admission.mjs';
import { createZoneCoveragePair } from '../runtime/ranked/zone-coverage-samples.mjs';

const previousText=fs.readFileSync(new URL('./fixtures/queue-ranked-zone-before-806a0f28.mjs.txt',import.meta.url),'utf8');
const floorCellCenter=(face,i,j,out)=>out.copy(face.origin).addScaledVector(face.u,(i+.5)*face.cu).addScaledVector(face.v,(j+.5)*face.cv).addScaledVector(face.n,.06);
class PreviousCell { constructor(face,cell,area,i,j){Object.assign(this,{face,cell,area,i,j});}get center(){return floorCellCenter(this.face,this.i,this.j,this.face.origin.clone());} }
const previous=new Function('finite','EPSILON','floorCellCenter','RankedZoneCell','zoneAreaTotals','createZoneCoveragePair','validTeam','return ({'+previousText.replace(/\n  (zoneCoverage|captureZone)\(/g,',\n  $1(')+'});')(
 Number.isFinite,1e-6,floorCellCenter,PreviousCell,new WeakMap(),createZoneCoveragePair,t=>t===0||t===1);
function zoneFixture(seed,old=false,largeIndex=false){
 const faces=Array.from({length:7},(_,i)=>({id:i,turf:i!==5,n:new Vector3(0,i===6?.5:1,0),origin:new Vector3((i%3)-2,i===4?3:0,Math.floor(i/3)-2),u:new Vector3(1,0,0),v:new Vector3(0,0,1),grid:(largeIndex?0x80000001:0)+i*24,nu:6,nv:4,cu:[.1,.3,Math.PI/9][i%3],cv:[.2,.7,Math.SQRT2/8][i%3]}));
 const grid={},dead={};for(const face of faces)for(let i=0;i<24;i++){grid[face.grid+i]=(i+seed+face.id)%3;if((i+seed)%13===0)dead[face.grid+i]=1;}
 const stamps=[],paint={grid,dead,paintFaces:faces,version:0,splat(point,radius,team,options){stamps.push([point.toArray(),radius,team,options]);return 1;}};
 const world=Object.assign(Object.create(RankedWorld.prototype),{THREE:{Vector3},paint,stage:{zones:[{center:[0,0,0],size:[6,6],heightTolerance:.8},{center:[.2,1,0],size:[2,4]}]}});
 if(old)Object.assign(world,previous);
 world._buildZoneIndex();return{world,stamps};
}
test('packed zone cells preserve ordered double areas, capture coordinates, seeds and immutable diagnostic views',()=>{
 for(let seed=0;seed<80;seed++)for(const large of [false,true]){
  const a=zoneFixture(seed,true,large),b=zoneFixture(seed,false,large);
  if(!large)assert.equal(typeof Object.getOwnPropertyDescriptor(b.world._zoneCells,0).get,'function','ordinary cells have a lazy diagnostic view');
  for(let iteration=0;iteration<3;iteration++){
   assert.deepEqual(b.world.zoneCoverage(),a.world.zoneCoverage());
   for(let zone=0;zone<2;zone++)assert.equal(b.world.captureZone(zone,iteration%2),a.world.captureZone(zone,iteration%2));
   assert.deepEqual(b.stamps,a.stamps);
   for(const item of [a,b]){item.world.paint.version++;for(const key of Object.keys(item.world.paint.grid))item.world.paint.grid[key]=(item.world.paint.grid[key]+1)%3;}
  }
  const diagnostic=w=>w._zoneCells.map(rows=>rows.map(x=>[x.face.id,x.cell,x.area,x.i,x.j,x.center.toArray()]));
  assert.deepEqual(diagnostic(b.world),diagnostic(a.world));
  assert.ok(b.world._zoneCells.every(rows=>Object.isFrozen(rows)&&rows.every(Object.isFrozen)));
 }
});
test('custom replacement, defineProperty, deletion and unknown revisions use the generic zone contract',()=>{
 for(const change of ['set','define','delete','outer']){
  const a=zoneFixture(2,true),b=zoneFixture(2,false);
  for(const item of [a,b]){
   item.world.zoneCoverage();const cells=item.world._zoneCells[0].slice(0,3);
   if(change==='set')item.world._zoneCells[0]=cells;
   if(change==='define')Object.defineProperty(item.world._zoneCells,0,{value:cells,configurable:true,writable:true});
   if(change==='delete')delete item.world._zoneCells[0];
   if(change==='outer')item.world._zoneCells=[cells,[]];
   delete item.world.paint.version;
  }
  assert.deepEqual(b.world.zoneCoverage(),a.world.zoneCoverage());
  assert.equal(b.world.captureZone(0,1),a.world.captureZone(0,1));assert.deepEqual(b.stamps,a.stamps);
 }
});
const stage={id:'queue-ranked',zones:[{}],clams:{spawns:[],goals:[[0,0,50],[0,0,-50]]}};
test('Clams position storage reuses only branded native actor rows, never caller arrays or snapshots',()=>{
 const engine=new RankedEngine('clams',stage),rule=engine.rule;
 const row={id:'a',team:0,pos:[1,2,3],alive:true},inputs={};
 const frame={actors:[row],inputs};Object.defineProperty(frame,OWNED_RANKED_FRAME,{value:inputs});Object.defineProperty(row,OWNED_RANKED_ACTOR,{value:row.pos});
 rule._registerActors(frame);const owned=rule.state.actorPositions.a;
 assert.notEqual(owned,row.pos);const snapshot=rule.snapshot();
 row.pos[0]=4;rule._registerActors(frame);assert.equal(rule.state.actorPositions.a,owned);assert.deepEqual([...owned],[4,2,3]);assert.deepEqual(snapshot.actorPositions.a,[1,2,3]);
 const custom={actors:[{...row,pos:[7,8,9]}],inputs};
 rule._registerActors(custom);const first=rule.state.actorPositions.a;custom.actors[0].pos[0]=10;rule._registerActors(custom);
 assert.notEqual(rule.state.actorPositions.a,first);assert.deepEqual(first,[7,8,9]);
 rule._registerActors(frame);assert.notEqual(rule.state.actorPositions.a,first);
 delete rule.state.actorPositions.a;rule._registerActors(frame);assert.notEqual(rule.state.actorPositions.a,owned);
 assert.ok(new ClamsRule(engine,stage));
});
test('owned already-disarmed catch-up frames keep identity; custom frames and throw edges stay isolated',()=>{
 for(const own of [false,true])for(const throwing of [false,true])for(const frozen of [false,true]){
  const e=new RankedEngine('clams',stage),seen=[];
  e.rule.update=(_dt,frame)=>seen.push(frame);
  const inputs={a:{throw:throwing}},frame={actors:[],inputs,barrierHits:frozen?Object.freeze([]):[]};
  if(own)Object.defineProperty(frame,OWNED_RANKED_FRAME,{value:inputs});
  e.update(2/60,frame);assert.equal(seen.length,2);assert.equal(seen[0],frame);
  assert.equal(seen[1]===frame,own&&!throwing&&frozen);
  assert.equal(seen[1].inputs.a.throw,false);assert.equal(frame.inputs.a.throw,throwing);
 }
});
test('ranked pose stops floor probing after support and rejects stale time without terrain queries',()=>{
 const row=Array(21).fill(0);row[0]=7;row[1]=1;row[3]=2;row[10]=17;row[16]=0;
 const actor={pos:[1,0,2],team:0};let probes=0;
 const world={floorAt(){probes++;return 0;}},state={};
 assert.equal(admitRankedPose(state,row,actor,1,world),true);assert.equal(probes,1);
 const accepted=structuredClone(state);probes=0;
 assert.equal(admitRankedPose(state,row,actor,1,world),false);assert.equal(probes,0);assert.deepEqual(state,accepted);
 probes=0;const noFloor={floorAt(){probes++;return null;}},other={};
 assert.equal(admitRankedPose(other,row,actor,1,noFloor),true);assert.equal(probes,5);assert.equal(other.last.grounded,false);
});
test('native branded Rainmaker LOS is lazy after score ordering; selected lane and path attempts are unchanged',async()=>{
 const module=await actualModule('patches/splatoon3/runtime/ranked/bots.mjs',{extra:'export {rainmakerBarrierApproach};'}),fn=module.api.rainmakerBarrierApproach;
 let skipped=0;
 for(let seed=0;seed<200;seed++){
  function run(branded,replace=false){
   const calls=[],paths=[],brain={a:{pos:{x:seed%3,y:0,z:0},team:0,weapon:{range:12}}};
   const nodes=Array.from({length:100},(_,id)=>({id,x:2+(id%10)*.65,y:0,z:Math.floor(id/10)*.6-3}));
   const frame={blocked(a){calls.push([...a]);return Math.round(a[0]*100+a[2]*100+seed)%5===0;}};
   if(branded)frame[OWNED_RANKED_BLOCKED]=frame.blocked;
   if(replace){const original=frame.blocked;frame.blocked=(...args)=>original(...args);}
   const G={nav:{nodes,validIds:nodes.map(x=>x.id),nearest:()=>0,path(_s,id){paths.push(id);return(id+seed)%4===0;}}};
   const result=fn(brain,{x:0,y:0,z:0},null,frame,G);return{result:result&&{...result},calls,paths};
  }
  const a=run(false),b=run(true);assert.deepEqual(b.result,a.result);assert.deepEqual(b.paths,a.paths);assert.ok(b.calls.length<=a.calls.length);skipped+=a.calls.length-b.calls.length;
  const custom=run(true,true);assert.deepEqual(custom,a,'replaced callbacks restore original evaluation order');
 }
 assert.ok(skipped>0);
});
