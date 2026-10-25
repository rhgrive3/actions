import test from 'node:test';
import assert from 'node:assert/strict';
import { objectiveOverlayChanged } from '../runtime/ranked/minimap-cache.mjs';
import { ClamsRule } from '../runtime/ranked/clams.mjs';
import { RankedWorld } from '../runtime/ranked/world.mjs';
import { installRankedUi, objectiveText } from '../runtime/ranked/ui.mjs';
import { RankedEngine } from '../runtime/ranked/engine.mjs';
import { noteRankedBarrierShots, resetRankedBarrierAdmission } from '../runtime/ranked/barrier-admission.mjs';
import { rainmakerWallBlast } from '../runtime/ranked/rainmaker-defense.mjs';

test('unranked overlay sleeps without inspecting map, then clears exactly once on ranked departure', () => {
  const map = { get level() { throw Error('idle snapshot'); } };
  assert.equal(objectiveOverlayChanged(map, null, {}), false);
  const active = {mode:'zones', stage:{zones:[]},rule:{state:{zones:[]}}};
  const normal = {level:{bounds:{}},w:20,h:20,s:1};
  assert.equal(objectiveOverlayChanged(normal,active,{}),true);
  assert.equal(objectiveOverlayChanged(normal,active,{}),false);
  assert.equal(objectiveOverlayChanged(normal,null,{}),true);
  assert.equal(objectiveOverlayChanged(normal,null,{}),false);
  assert.equal(objectiveOverlayChanged(normal,active,{}),true);
});

test('empty eligible pickup list skips field access and releases reentrant scratch lease', () => {
  const r = Object.create(ClamsRule.prototype);
  r.state = {get clams(){throw Error('field accessed');}};
  r._actorList=()=>[{alive:false}];
  r._processPickups({});
  assert.equal(r._pickupDepth,0);
  assert.deepEqual(r._pickupActorBuffers,[[]]);
  r._actorList=()=>[{alive:true}];
  assert.throws(()=>r._processPickups({}),/field accessed/);
  assert.equal(r._pickupDepth,0);
  assert.deepEqual(r._pickupActorBuffers,[[]]);
});

function clamWorld(time) {
 const world=Object.create(RankedWorld.prototype);
 Object.assign(world,{G:{time},mode:'clams',clamGeometry:{},_clamMarkers:new Map(),clamsGroup:{remove(){}}});
 world._clamMarker=c=>{
  let m=world._clamMarkers.get(String(c.id));
  if(!m){m={mesh:{visible:false,position:{set(...p){this.p=p;}},rotation:{set(x,y,z){Object.assign(this,{x,y,z});}}}};world._clamMarkers.set(String(c.id),m);}
  return m;
 };
 return world;
}
test('clam marker rotations preserve exact axis values at 30/60/120 Hz, time rewind and invalid clocks',()=>{
 const world=clamWorld(0);
 const clams=Array.from({length:40},(_,id)=>({id,pos:[id,0,id],velocity:[id,-id,id/3]}));
 for(const hz of [30,60,120])for(const time of [0,-0,1/hz,3.25,-2,NaN,Infinity]){
  world.G.time=time;world._updateClams({rule:{state:{clams,baskets:[{team:0,pendingBreak:{pos:[0,0,0]}}]}}});
  const clock=Number.isFinite(time)?time:0;
  for(const c of clams){const r=world._clamMarkers.get(String(c.id)).mesh.rotation;assert.ok(Object.is(r.x,c.velocity[0]*.04));assert.ok(Object.is(r.y,c.velocity[1]*.04+clock*1.4));assert.ok(Object.is(r.z,c.velocity[2]*.04));}
  assert.ok(Object.is(world._clamMarkers.get('drill-0').mesh.rotation.z,clock*24));
  assert.equal(world._clamSetScratch.value.size,0);assert.equal(world._clamSetScratch.busy,false);
 }
 let reads=0;Object.defineProperty(world.G,'time',{get(){return ++reads;}});
 world._updateClams({rule:{state:{clams:clams.slice(0,2)}}});
 assert.equal(reads,4,'accessor clocks retain original twice-per-marker reads');
 assert.equal(world._clamMarkers.get('0').mesh.rotation.y,2*1.4);
 assert.equal(world._clamMarkers.get('1').mesh.rotation.y,-.04+4*1.4);
});

test('zero held clams skips actor indexing but still clears stale inventory markers',()=>{
 const world=Object.create(RankedWorld.prototype), old={visible:true};
 Object.assign(world,{mode:'clams',smallClamResources:{},_inventoryMarkers:new Map([['old',old]]),match:{get actors(){throw Error('actor scan');}}});
 world._updateInventories({rule:{state:{inventories:{a:{small:0,power:false}}}}});
 assert.equal(old.visible,false);assert.equal(world._inventoryScratch.busy,false);
 assert.equal(world._inventoryScratch.actors.size,0);
});

test('zones share one projection for rectangle and marker while preserving canvas values',()=>{
 const commands=[];let projections=0;
 const ctx=new Proxy({}, {get:(o,k)=>o[k]||((...a)=>commands.push([k,...a])),set:(o,k,v)=>{o[k]=v;return true;}});
 class Minimap{_compose(){} toCanvas(x,z,out){projections++;out.x=x*2;out.y=z*3;return out;}}
 const G={match:{ranked:{mode:'zones',stage:{zones:[{center:[2,0,3],size:[4,5]}]},rule:{state:{zones:[{team:0}]}}}},teamHex:['red','blue']};
 installRankedUi({G,Minimap});const map=new Minimap();Object.assign(map,{ctx,s:2});map._compose();
 assert.equal(projections,1);assert.deepEqual(commands.find(x=>x[0]==='fillRect'),['fillRect',0,4,8,10]);
 assert.deepEqual(commands.filter(x=>x[0]==='arc').map(x=>x.slice(1,3)),[[4,9],[4,9]]);
});

test('nonshot barrier packets never serialize payloads and cannot mint receipts',()=>{
 const engine=new RankedEngine('rainmaker',{rainmaker:{center:[0,0,0],goals:[[0,0,10],[0,0,-10]]}});
 const nm={isHost:true,match:{mode:'rainmaker',state:'playing',ranked:engine,rankedBarrierHits:[],actors:[{nid:'g',owner:'guest',alive:true}]}};
 resetRankedBarrierAdmission(nm);
 const poison={actor:{n:'g'},toJSON(){throw Error('unrelated event serialized');}};
 noteRankedBarrierShots(nm,'guest',{e:[[0,'ev','actor:jump',poison],[0,'b','g','torpedo',poison]]},0);
 assert.equal(nm.rankedBarrierProofs.get('guest')?.length||0,0);
 assert.equal(nm.rankedBarrierEventKeys.get('guest')?.size||0,0);
});

test('wall LOS allocates one owned origin and preserves signed-zero addition',()=>{
 let created=0;class V{constructor(x=0,y=0,z=0){created++;Object.assign(this,{x,y,z});}clone(){return new V(this.x,this.y,this.z);}distanceTo(p){return Math.hypot(this.x-p.x,this.y-p.y,this.z-p.z);}}
 const at=new V(-0,1,-0),position=new V(0,0,0),origins=[];
 const object={subId:'splashWall',team:1,phase:'deployed',pos:position,yaw:0};
 const api={THREE:{Vector3:V},G:{projectiles:{_s3SubObjects:[object]},physics:{los(a){origins.push(a);return false;}}}};
 const start=created;rainmakerWallBlast(api,at,null,0,100,1,2,1);
 assert.equal(created-start,2,'point plus single origin; blocked wall has no retained snapshot');
 assert.equal(origins.length,1);assert.ok(Object.is(origins[0].x,0));assert.ok(Object.is(origins[0].z,0));assert.equal(origins[0].y,1.05);
 assert.ok(Object.is(at.x,-0));
});
