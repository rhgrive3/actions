import fs from 'node:fs';
import {nativeFixture,readStage} from '../patches/native-stages/tests/fixture.mjs';
const f=await nativeFixture(),{G,THREE,PLAYER}=f,L=G.level=new f.NativeLevel(readStage(process.env.INKWAVE_NATIVE_STAGE_ASSETS,'bluefin')),P=G.physics=new f.NativePhysics(L),W=L.triangleWorld;
const from=new THREE.Vector3(-19.238425606074273,3.242939895330204,-9.822992963660472),to=new THREE.Vector3(-19.468021961368496,3,-10.027094295443508),rows=[];
for(const squid of [true,false]){
 const radius=(squid?PLAYER.s3SwimTerrainRadiusRaw:PLAYER.s3HumanoidTerrainRadiusRaw)*PLAYER.s3TerrainDistanceScale,lift=squid?PLAYER.squidBodyLift:PLAYER.stepUp,height=squid?PLAYER.squidHeight:PLAYER.height,low=lift+radius,high=Math.max(low,height-radius),s0=from.clone().setY(from.y+low),s1=to.clone().setY(to.y+high),box=new THREE.Box3().setFromPoints([s0,s1]).expandByScalar(radius),contacts=[];
 W.queryBox(box.min,box.max,id=>{
  if(squid&&(W.flags[id]&4))return;
  const t=W.triangle(id),distance=W._capsuleDistance(s0,s1,t);
  if(distance<radius-.003)contacts.push({triangle:id,face:L.data.triangleFace[id],object:L.manifest.objects[L.data.objectIds[id]].name,flags:W.flags[id],normal:Array.from(W.normals.subarray(id*3,id*3+3)),axisDistance:distance,penetration:radius-distance,closestAxis:W._bests.toArray(),closestSource:W._bestp.toArray()});
 });
 rows.push({form:squid?'squid':'kid',radius,lift,height,skipGrates:squid,fromBodyFits:P.bodyFits(from,radius,lift,height,squid,.003),toBodyFits:P.bodyFits(to,radius,lift,height,squid,.003),sweepClear:f.nativeDropClearance(L).clear(from,to,radius,lift,height,squid),sourceContacts:contacts.sort((a,b)=>b.penetration-a.penetration).slice(0,8)});
}
const supports=[from,to].map(pos=>{const hit=P.raycast(pos.clone().setY(pos.y+.3),new THREE.Vector3(0,-1,0),.8);return{position:pos.toArray(),hit:hit.hit,triangle:hit.triangle,face:hit.face,point:hit.point.toArray(),normal:hit.normal.toArray(),object:hit.triangle>=0?L.manifest.objects[L.data.objectIds[hit.triangle]].name:null};});
const report={sourceSha256:L.manifest.sourceSha256,maskRecipe:L.manifest.recipe,from:from.toArray(),to:to.toArray(),rows,supports,scope:'Read-only immutable source contact diagnosis of retained846 raw30Hz trajectory. Squid sweep is the actual degenerate vertical-axis capsule. Kid comparison contacts are an axis approximation; authoritative kid clear/bodyFits use installed helpers. No graph, source, ownership or actor state changes.'};
fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2));console.log(JSON.stringify(report));
