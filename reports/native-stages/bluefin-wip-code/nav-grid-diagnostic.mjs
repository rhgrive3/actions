import fs from 'node:fs';
import {nativeFixture,readStage} from '../patches/native-stages/tests/fixture.mjs';
const f=await nativeFixture(),{G,THREE}=f,L=G.level=new f.NativeLevel(readStage('.codex-stage-sources/generated','bluefin')),P=G.physics=new f.NativePhysics(L);
class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});const N=G.nav=Object.create(f.NavGraph.prototype);Object.assign(N,{level:L,physics:P,step:.5,nodes:[]});let t=performance.now();N._build();
const goals=[[-20,3,-10],[20,3,10],[-20,9,-40],[20,9,40],[-12,15,-70],[12,15,70]],routes=L.spawnPads.map((pad,team)=>goals.map(p=>{const id=N.nearest(new THREE.Vector3(...p),1.2),node=N.nodes[id],path=N.path(N.nativeSpawnNodeIds[team],id,team,50000);return{goal:p,node:node?{x:node.x,y:node.y,z:node.z}:null,pathNodes:path?.length??null};}));
const result={status:'read-only-density-diagnostic',step:N.step,sourceGeometryUnchanged:true,nodes:N.nodes.length,valid:N.validIds.length,spawnIds:N.nativeSpawnNodeIds,routes,navMilliseconds:performance.now()-t};try{const s=f.nativeRankedStage(G);result.ranked={tower:s.tower.supported,zones:s.zones};}catch(e){result.rankedError=e.message;}
fs.writeFileSync('.browser-evidence/nav-grid-diagnostic.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
