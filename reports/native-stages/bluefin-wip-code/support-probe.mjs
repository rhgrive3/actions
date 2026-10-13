import fs from 'node:fs';
import {nativeFixture,readStage} from '../patches/native-stages/tests/fixture.mjs';
const f=await nativeFixture(),{G,THREE,PLAYER}=f,data=readStage('.codex-stage-sources/generated','bluefin'),result=[];
class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
for(const pads of [[[-12,15,-70],[12,15,70]],[[-12,12,-55],[12,12,55]],[[-20,9,-40],[20,9,40]],[[-25,9,-30],[25,9,30]],[[-20,3,-10],[20,3,10]]]){
 const m={...data.manifest,spawnPads:pads},L=new f.NativeLevel({...data,manifest:m}),P=new f.NativePhysics(L);G.level=L;G.physics=P;G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});
 const support=L.spawnPads.map(p=>{const h=P.raycast(p.clone().add(new THREE.Vector3(0,2,0)),new THREE.Vector3(0,-1,0),4);return {pad:p.toArray(),point:h.hit?h.point.toArray():null,normal:h.hit?h.normal.toArray():null,bodyFits:P.bodyFits(p.clone().add(new THREE.Vector3(0,.01,0)),PLAYER.radius+.04,.32,PLAYER.height),object:h.hit?L.manifest.objects[L.data.objectIds[h.triangle]].name:null};});
 const proof={pads,support};try{G.nav=new f.NavGraph(L,P);proof.nav={nodes:G.nav.nodes.length,valid:G.nav.validIds.length,seeds:G.nav.nativeSpawnNodeIds};const ranked=f.nativeRankedStage(G);proof.ranked=ranked;const goals=[...ranked.zones.map(z=>z.center),...ranked.rainmaker.goals,ranked.rainmaker.center,...ranked.rainmaker.checkpoints.flat(),...ranked.clams.spawns,...ranked.tower.path.map(p=>[p[0],p[1]-(ranked.tower.localLift??3.3),p[2]])];proof.routes=L.spawnPads.map((p,team)=>goals.map(g=>G.nav.path(G.nav.nearest(p,1.2),G.nav.nearest(new THREE.Vector3(...g),1.2),team,50000)?.length??null));}catch(e){proof.error=e.stack;}
 result.push(proof);fs.writeFileSync('.browser-evidence/support-probe.json',JSON.stringify(result,null,2));console.log(JSON.stringify({pads,support,nav:proof.nav,error:proof.error,tower:proof.ranked?.tower.supported,routes:proof.routes?.map(a=>({count:a.length,failed:a.filter(x=>x===null).length}))}));
}
