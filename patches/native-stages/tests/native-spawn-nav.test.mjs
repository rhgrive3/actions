import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {nativeFixture,readStage} from './fixture.mjs';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';

const roots=(process.env.NATIVE_NAV_FIXTURE_ASSETS||process.env.INKWAVE_NATIVE_STAGE_ASSETS||'').split(path.delimiter).filter(Boolean);
const stages=roots.flatMap(root=>JSON.parse(fs.readFileSync(path.join(root,'catalog.json'),'utf8')).stages.map(s=>({root,id:s.id})));

test('native adaptation leaves all four real legacy navigation graphs unchanged',async()=>{
 const exports="export {NavGraph} from './inkwave-public/src/game/nav.js';export {MAP_LAYOUTS} from './inkwave-public/src/world/maps.js';";
 const upstream=await fixture({fullRuntime:true,extraExports:exports}),adapted=await fixture({fullRuntime:true,adaptNative:adaptBuildSource,adaptRuntime:adaptBuildSource,extraExports:exports});
 for(const [id,layout] of Object.entries(upstream.MAP_LAYOUTS)){
  const a=new upstream.Level(layout),b=new adapted.Level(adapted.MAP_LAYOUTS[id]);
  const original=new upstream.NavGraph(a,new upstream.Physics(a)),nativeAdapted=new adapted.NavGraph(b,new adapted.Physics(b));
  assert.equal(JSON.stringify(nativeAdapted.nodes),JSON.stringify(original.nodes),id+' legacy nodes and directed edges');
  assert.deepEqual(Buffer.from(nativeAdapted.valid),Buffer.from(original.valid),id+' legacy component validity');
  assert.equal(nativeAdapted.nativeSpawnNodeIds,undefined);
 }
});

test('native pruning retains source-supported spawn layers and only real directed routes',{skip:!roots.length},async()=>{
 const f=await nativeFixture(),{G,THREE}=f,results=[];
 for(const {root,id} of stages){
  const data=readStage(root,id),level=new f.NativeLevel(data),physics=new f.NativePhysics(level);
  G.level=level;G.physics=physics;
  const geometryHash=()=>{const hash=crypto.createHash('sha256');for(const a of [data.vertices,data.indices,data.triangles])hash.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));return hash.digest('hex');};
  const before=geometryHash(),nav=new f.NavGraph(level,physics);
  assert.equal(nav.nativeSpawnNodeIds.length,2);
  const reachable=new Uint8Array(nav.nodes.length),queue=[...new Set(nav.nativeSpawnNodeIds)];
  for(const seed of queue)reachable[seed]=1;
  for(let i=0;i<queue.length;i++)for(const edge of nav.nodes[queue[i]].nb)if(!reachable[edge.to]){reachable[edge.to]=1;queue.push(edge.to);}
  assert.deepEqual(Buffer.from(nav.valid),Buffer.from(reachable),id+' validity must be actual directed reachability');
  const seeds=[];
  for(const [team,pad] of level.spawnPads.entries()){
   const source=physics.raycast(pad.clone().add(new THREE.Vector3(0,.3,0)),new THREE.Vector3(0,-1,0),.6);
   assert(source.hit&&source.normal.y>.68,id+' actual pad support');
   const nearest=nav.nearest(pad,1.2),node=nav.nodes[nearest];
   assert(node&&nav.valid[nearest],id+' pad remains navigable');
   assert(Math.abs(node.y-source.point.y)<=.7,id+' cannot relocate spawn to a lower decorative layer');
   assert(Math.hypot(node.x-pad.x,node.z-pad.z)<=nav.step*1.6,id+' source-adjacent node');
   assert(nav.valid[nav.nativeSpawnNodeIds[team]],id+' original seed is retained');
   seeds.push({team,pad:pad.toArray(),node:nearest,height:node.y,sourceHeight:source.point.y});
  }
  assert.equal(geometryHash(),before,'navigation cannot replace source geometry or collision');
  if(id==='manta'){
   assert(nav.nodes.some(n=>n.y< -4&&Math.abs(n.x)<10&&Math.abs(n.z)<10),'lower hull source supports remain in candidate graph');
   assert(!nav.validIds.some(id=>nav.nodes[id].y< -4),'disconnected lower hull is not playable navigation');
   assert(nav.validIds.every(id=>nav.nodes[id].y>0),'actual upper deck remains authoritative');
  }
  results.push({id,candidateNodes:nav.nodes.length,validNodes:nav.validIds.length,seeds,paintableNodes:nav.validIds.filter(id=>nav.nodes[id].nativePaintable).length,sourceCollisionTriangles:level.triangleWorld.triangleCount});
 }
 console.log(JSON.stringify(results));
 if(process.env.NATIVE_NAV_REPORT)fs.writeFileSync(process.env.NATIVE_NAV_REPORT,JSON.stringify(results,null,2));
});
