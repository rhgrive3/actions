// Read-only geometry diagnostic against an explicitly provisional shared helper.
// This is not accepted product or final qualification evidence.
import fs from 'node:fs';
import {nativeFixture} from '/workspace/stage-worktrees/flounder/patches/native-stages/tests/fixture.mjs';
import {readStage} from '../patches/native-stages/tests/fixture.mjs';
const f=await nativeFixture(),{G,THREE}=f,data=readStage('.codex-stage-sources/generated','bluefin');
const L=G.level=new f.NativeLevel({...data,manifest:{...data.manifest,sourceNavigation:{wallClimb:true}}}),P=G.physics=new f.NativePhysics(L);
class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});const t=performance.now(),N=G.nav=new f.NavGraph(L,P),climbs=N.nodes.flatMap(n=>n.nb.filter(e=>e.type==='climb').map(e=>({from:n.id,to:e.to,lower:[n.x,n.y,n.z],upper:[N.nodes[e.to].x,N.nodes[e.to].y,N.nodes[e.to].z],samples:e.climb.samples.length,sourceObjects:[...new Set(e.climb.samples.map(s=>L.manifest.objects[L.faces[s.face].object].name))]})));
const goals=[[0,3,0],[-20,9,-40],[20,9,40],[-12,15,-63],[12,15,63]],routes=L.spawnPads.map((p,team)=>goals.map(g=>{const from=N.nearest(p,1.2),to=N.nearest(new THREE.Vector3(...g),1.2),route=N.path(from,to,team,50000),node=N.nodes[to];return{goal:g,to:{x:node?.x,y:node?.y,z:node?.z},waypoints:route?.length??null,climbs:route?.slice(1).filter((id,i)=>N.edgeType(route[i],id)==='climb').length??null};}));
const result={status:'diagnostic-provisional-helper-only',helperHead:fs.readFileSync('/workspace/stage-worktrees/flounder/.git','utf8').trim(),pads:L.spawnPads.map(p=>p.toArray()),nodes:N.nodes.length,valid:N.validIds.length,climbEdges:climbs.length,climbExamples:climbs.slice(0,20),routes,navMilliseconds:performance.now()-t};
try{const s=f.nativeRankedStage(G);result.ranked={zones:s.zones,tower:s.tower.supported?{pathNodes:s.tower.path.length,span:s.tower.arenaSpan}:s.tower,rainmaker:s.rainmaker};}catch(e){result.rankedError=e.message;}
fs.writeFileSync('.browser-evidence/climb-diagnostic.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
