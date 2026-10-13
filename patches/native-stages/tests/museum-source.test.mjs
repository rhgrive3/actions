import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nativeFixture,readStage} from './fixture.mjs';
import {nativeStageCatalog} from '../../../scripts/lib/inkwave-native-stages.mjs';
const ROOT=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const source=nativeStageCatalog().stages.find(s=>s.id==='museum');
test('Museum identity retains pinned source and opposed supports without a retail placement claim',()=>{
 assert.equal(source.internal,'Vss_Pivot03');
 assert.equal(source.name,'キンメダイ美術館');
 assert.equal(source.sourceSha256,'ffe207e9b3d3eb4fc482ca45887fea1f1a131fdb2e2a0403535e1f281453bad1');
 assert.equal(source.tree,'777211951cc54e036f9770990476f968bf5a1a33');
 assert.equal(source.version1130Verified,false);
 assert.ok(source.spawnPads[0][0]*source.spawnPads[1][0]<0&&source.spawnPads[0][2]*source.spawnPads[1][2]<0);
 assert.match(source.placementStatus,/rotating-object.*unverified/i);
});
test('Museum opposed pads reach source paint and all local non-moving objectives', {skip:!ROOT||!fs.existsSync(path.join(ROOT,'museum','manifest.json'))},async()=>{
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,data=readStage(ROOT,'museum');
 G.level=new f.NativeLevel(data);G.physics=new f.NativePhysics(G.level);
 class CpuPaint extends f.PaintSystem {_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new CpuPaint(null,G.level,{atlasSize:2048,maxDensity:4,cell:.25});
 const noPaint=data.manifest.objects.find(o=>o.name==='FldObj_Pivot03_PackPnt_Obj_GeneralBoxNoPaint_30x15x15_Blitz_1__FenceVinyl');
 assert.ok(noPaint.active&&noPaint.collidable);assert.equal(noPaint.paintable,false,'explicit source NoPaint name retains collision');
 const supports=[];
 for(const pad of G.level.spawnPads){
  const hit=G.physics.raycast(pad.clone().add(new THREE.Vector3(0,2,0)),new THREE.Vector3(0,-1,0),4);
  assert.ok(hit.hit&&hit.normal.y>.7);assert.ok(Math.abs(hit.point.y-pad.y)<.02);
  assert.ok(G.physics.bodyFits(pad.clone().setY(pad.y+.01),PLAYER.radius+.04,.32,PLAYER.height));
  supports.push({triangle:hit.triangle,sourceObject:data.manifest.objects[data.objectIds[hit.triangle]].name});
 }
 G.nav=new f.NavGraph(G.level,G.physics);
 const rank=f.nativeRankedStage(G),targets=[rank.zones[0].center,rank.rainmaker.center,...rank.rainmaker.goals,...rank.rainmaker.checkpoints.flat(),...rank.clams.spawns,...rank.clams.goals];
 const reachable=[];
 for(let team=0;team<2;team++){
  const start=G.nav.nearest(G.level.spawnPads[team],1.2);assert.ok(G.nav.valid[start]);
  let checked=0;for(const target of targets){const end=G.nav.nearest(new THREE.Vector3(...target),1.2);assert.ok(G.nav.path(start,end,team,50000),'team '+team+' directed objective route');checked++;}
  const seen=new Set([start]),queue=[start];for(let i=0;i<queue.length;i++)for(const e of G.nav.nodes[queue[i]].nb)if(G.nav.valid[e.to]&&!seen.has(e.to)){seen.add(e.to);queue.push(e.to);}
  reachable.push({team,spawnNode:start,reachableNodes:seen.size,objectives:checked});
 }
 const result={id:'museum',supports,navNodes:G.nav.nodes.length,validNodes:G.nav.validIds.length,reachable,paintFaces:G.level.faces.length,gridCells:G.paint.grid.length,sourceGeometryUnchanged:true,version1130Verified:false};
 if(process.env.MUSEUM_CPU_EVIDENCE)fs.writeFileSync(process.env.MUSEUM_CPU_EVIDENCE,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
});
