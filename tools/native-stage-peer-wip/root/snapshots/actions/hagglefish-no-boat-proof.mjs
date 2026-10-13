import fs from 'node:fs';import path from 'node:path';
import {BASE_SOURCE_STAGES} from '../patches/native-stages/runtime/source-catalog.mjs';
import {convertSource} from '../patches/native-stages/runtime/source-convert.mjs';
import {nativeFixture} from '../patches/native-stages/tests/fixture.mjs';
const s=BASE_SOURCE_STAGES.find(s=>s.id==='hagglefish'),dir='.codex-stage-sources/KiTrix/stages/'+s.internal,files={};
for(const name of fs.readdirSync(path.join(dir,'textures')))files['textures/'+name]={};
const data=convertSource({...s,sourceSemantics:{nonCollidableObjectPatterns:['^FldObj_YagaraFloatBoat[AB]_']}},fs.readFileSync(path.join(dir,s.internal+'.obj'),'utf8'),fs.readFileSync(path.join(dir,s.internal+'.mtl'),'utf8'),files);
const f=await nativeFixture(),{G}=f,L=new f.NativeLevel(data),P=new f.NativePhysics(L);G.level=L;G.physics=P;
class Paint extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
G.paint=new Paint(null,L,{atlasSize:2048,maxDensity:4,cell:.25});const start=performance.now(),N=new f.NavGraph(L,P);G.nav=N;
const reach=seed=>{const ids=new Set([seed]),q=[seed];for(let i=0;i<q.length;i++)for(const e of N.nodes[q[i]].nb)if(N.valid[e.to]&&!ids.has(e.to)){ids.add(e.to);q.push(e.to);}return ids;};
const seeds=L.spawnPads.map(p=>N.nearest(p,1.2)),both=seeds.map(reach),joint=[...both[0]].filter(id=>both[1].has(id));
let ranked;try{const r=f.nativeRankedStage(G);ranked={zones:r.zones,tower:r.tower.path,rainmaker:r.rainmaker};}catch(e){ranked={error:e.message};}
const report={inferredExcludedUnplacedModels:true,sourceVertices:data.manifest.geometry.vertices,sourceTriangles:data.manifest.geometry.triangles,collisionTriangles:data.manifest.geometry.collisionTriangles,navNodes:N.nodes.length,valid:N.validIds.length,spawnSeeds:seeds,reachable:both.map(s=>s.size),joint:joint.length,navMilliseconds:performance.now()-start,ranked};
fs.writeFileSync('.ci-scratch/hagglefish-no-boat-proof.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,ranked:{...ranked,tower:ranked.tower?.length}}));
