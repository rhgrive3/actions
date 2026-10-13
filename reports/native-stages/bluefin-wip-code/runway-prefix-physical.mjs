import fs from 'node:fs';
import {nativeFixture,readStage} from '../patches/native-stages/tests/fixture.mjs';
const f=await nativeFixture({includeCharacter:true}),{G,THREE,PLAYER}=f;
const L=G.level=new f.NativeLevel(readStage(process.env.INKWAVE_NATIVE_STAGE_ASSETS,'bluefin')),P=G.physics=new f.NativePhysics(L),N=G.nav=new f.NavGraph(L,P);
class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
G.match.mode='turf';G.match.opts={};G.camera=new THREE.PerspectiveCamera();
const route=N.path(5047,6540,0,Math.max(6000,N.nodes.length*4));if(!route)throw Error('No existing raw lower-island waypoint chain');
const rows=[];f.setRandom(()=>.5);
try{for(const hz of [30,60,120]){
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();
 const a=new f.Actor({team:0,name:'source lower-prefix diagnosis',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.spawnAt(new THREE.Vector3(19,3,-8.5),0);G.actors=[a];
 const clearance=f.nativeDropClearance(L),radius=PLAYER.s3HumanoidTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale;
 const tick=()=>{G.time+=1/hz;a.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);};
 for(let i=0;i<6;i++)tick();let samples=0,seconds=0,failed=null;const reached=[],targets=route.map(id=>N.nodes[id]);
 for(let k=0;k<targets.length;k++){
  const node=targets[k],edge=k?N.nodes[route[k-1]].nb.find(e=>e.to===node.id):null;let arrived=false,jumped=false;
  for(let i=0;i<hz*6;i++){
   const dx=node.x-a.pos.x,dz=node.z-a.pos.z,d=Math.hypot(dx,dz),speed=Math.hypot(a.vel.x,a.vel.z);
   if(a.alive&&a.grounded&&d<.18&&speed<.65&&f.nativeSourceFootSupported(G,a,node)){arrived=true;break;}
   a.intent.squid=a.intent.fire=a.intent.sub=a.intent.special=false;a.intent.jump=false;
   if(edge?.type==='jump'&&a.grounded&&!jumped){a.intent.jump=true;jumped=true;}
   const magnitude=d<.09?0:Math.min(.7,Math.max(.12,d*.65));a.intent.move.set(d>1e-6?dx/d*magnitude:0,0,d>1e-6?dz/d*magnitude:0);
   if(d>1e-6)a.aimYaw=Math.atan2(dx,dz);const previous=a.pos.clone();tick();samples++;seconds+=1/hz;
   if(!clearance.clear(previous,a.pos,radius,PLAYER.stepUp,PLAYER.height,false)){failed={reason:'actual capsule sweep',node:node.id,edgeType:edge?.type||'unqualified two-cell physical walk',from:previous.toArray(),to:a.pos.toArray(),grounded:a.grounded,form:a.form};break;}
   if(!a.alive){failed={reason:'Actor died',node:node.id,position:a.pos.toArray()};break;}
  }
  if(!arrived){failed||={reason:'source waypoint did not plant within6seconds',node:node.id,target:[node.x,node.y,node.z],position:a.pos.toArray(),grounded:a.grounded,footSupported:f.nativeSourceFootSupported(G,a,node)};break;}
  reached.push({node:node.id,position:a.pos.toArray(),sourceFootSupported:true,edgeType:edge?.type||'unqualified two-cell physical walk'});
 }
 rows.push({hz,success:!failed,seconds,capsuleSamples:samples,start:[19,3,-8.5],end:a.pos.toArray(),goal:[20,3,18.5],reachedWaypoints:reached,failed,alive:a.alive,grounded:a.grounded,gearAP:Object.keys(a.s3.abilityPoints).length});
}}
finally{f.restoreRandom();}
const report={foundation:'846f0532b6b3bcde3dfed893b81ee07d3dc58cd5',recipe:'inkwave-browser-source-v4',sourceNavigation:L.manifest.sourceNavigation,rawWaypointChain:route,existingGraphStartValid:!!N.valid[4970],existingGraphGoalValid:!!N.valid[6540],rows,conditions:'Stage-only physical human prefix diagnosis. First two-cell crossing is an already measured human candidate, not a Nav edge. Subsequent targets follow the existing raw adjacency inside the unreachable lower island. Production Character/Actor and every actual capsule/static-foot contact; zeroAP, empty paint, ordinary kid inputs only, no later pose/velocity/ink/ownership writes, all source NoPaint/geometry retained. No whole-pad or ordinary-bot qualification.'};
fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2));console.log(JSON.stringify(rows.map(({hz,success,seconds,capsuleSamples,end,reachedWaypoints,failed})=>({hz,success,seconds,capsuleSamples,end,reachedWaypoints:reachedWaypoints.length,failed}))));
