#!/usr/bin/env node
// CPU logic measurement using the production native physics and navigation.
// This asserts the source blocker; it must never certify opposing-bank gameplay.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {nativeFixture,readStage} from '../patches/native-stages/tests/fixture.mjs';

const root=path.resolve(process.argv[2]||'.codex-stage-sources/nav-diagnostic');
const out=path.resolve(process.argv[3]||'.browser-evidence/mahi/placement.json');
const f=await nativeFixture(),data=readStage(root,'mahi');
assert.equal(data.manifest.diagnosticOnly,true,'Only private diagnostic data may enter this probe');
const level=new f.NativeLevel(data),physics=new f.NativePhysics(level);
f.G.level=level;f.G.physics=physics;
const started=performance.now(),nav=new f.NavGraph(level,physics),navigationMilliseconds=performance.now()-started;
const adj=nav.nodes.map(()=>[]);
for(const node of nav.nodes)for(const edge of node.nb){adj[node.id].push(edge.to);adj[edge.to].push(node.id);}
const component=new Int32Array(nav.nodes.length).fill(-1),components=[];
for(const node of nav.nodes){
 if(component[node.id]>=0)continue;
 const id=components.length,stack=[node.id],members=[];component[node.id]=id;
 while(stack.length){const at=stack.pop();members.push(at);for(const next of adj[at])if(component[next]<0){component[next]=id;stack.push(next);}}
 const nodes=members.map(id=>nav.nodes[id]);
 components.push({id,nodes:nodes.length,bounds:{minX:Math.min(...nodes.map(n=>n.x)),maxX:Math.max(...nodes.map(n=>n.x)),minZ:Math.min(...nodes.map(n=>n.z)),maxZ:Math.max(...nodes.map(n=>n.z)),minY:Math.min(...nodes.map(n=>n.y)),maxY:Math.max(...nodes.map(n=>n.y))}});
}
const samples=level.spawnPads.map(pad=>{
 const hit=physics.raycast(pad.clone().setY(pad.y+2),pad.clone().set(0,-1,0),5);
 assert(hit.hit&&hit.normal.y>.68,'Opposing trial sample lacks original triangle support');
 const nearest=nav.nodes.reduce((best,node)=>{const distance=(node.x-pad.x)**2+(node.z-pad.z)**2+((node.y-pad.y)*2.5)**2;return distance<best.distance?{node,distance}:best;},{node:null,distance:Infinity}).node;
 assert(nearest);
 return {trialPosition:pad.toArray(),supportPoint:hit.point.toArray(),supportNormal:hit.normal.toArray(),sourceObject:data.manifest.objects[level.triangleWorld.objectIds[hit.triangle]].name,
  navNode:nearest.id,navComponent:component[nearest.id],prunedValid:!!nav.valid[nearest.id]};
});
const reach=seed=>{const seen=new Set([seed]),queue=[seed];for(let i=0;i<queue.length;i++)for(const edge of nav.nodes[queue[i]].nb)if(!seen.has(edge.to)){seen.add(edge.to);queue.push(edge.to);}return seen;};
const forward=reach(samples[0].navNode).has(samples[1].navNode),backward=reach(samples[1].navNode).has(samples[0].navNode);
const report={id:'mahi',status:'placement-unavailable',measurement:'production NativePhysics/NavGraph CPU logic; not retail/hardware measurement',diagnosticBounds:data.manifest.bounds,
 navNodes:nav.nodes.length,validNodes:nav.validIds.length,componentCount:components.length,largestComponents:components.sort((a,b)=>b.nodes-a.nodes).slice(0,8),opposingBankSamples:samples,
 directedRoutes:{bank0ToBank1:forward,bank1ToBank0:backward},mutuallyReachableOpposingBanks:forward&&backward,navigationMilliseconds,retailPlacementVerified:false};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
assert.equal(report.mutuallyReachableOpposingBanks,false,'Source changed: re-evaluate stage availability before enabling');
assert.notEqual(samples[0].navComponent,samples[1].navComponent);
console.log(JSON.stringify(report));
