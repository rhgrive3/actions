import fs from 'node:fs';
import {nativeFixture,readStage} from '../patches/native-stages/tests/fixture.mjs';
const f=await nativeFixture(),{THREE}=f,L=new f.NativeLevel(readStage(process.env.INKWAVE_NATIVE_STAGE_ASSETS,'shipshape')),P=new f.NativePhysics(L),rows=[];
for(const sign of [-1,1])for(const z of [38,39,40])for(const side of [-.1,0,.1])for(let k=0;k<=90;k++){
 const y=1.7+k*.05,origin=new THREE.Vector3(sign*26.5,y,sign*z+side),hit=P.raycast(origin,new THREE.Vector3(-sign,0,0),1.25);if(!hit.hit){rows.push({sign,z,side,y,hit:false});continue;}
 const face=L.faces[hit.face],role=L.manifest.objects[L.triangleWorld.objectIds[hit.triangle]],i=face?Math.max(0,Math.min(face.nu-1,Math.floor(hit.u/face.cu))):null,j=face?Math.max(0,Math.min(face.nv-1,Math.floor(hit.v/face.cv))):null,center=face?face.origin.clone().addScaledVector(face.u,(i+.5)*face.cu).addScaledVector(face.v,(j+.5)*face.cv):null;
 rows.push({sign,z,side,y,hit:true,triangle:hit.triangle,flags:L.triangleWorld.flags[hit.triangle],sourceObject:role.name,explicitNoPaint:/NoPaint/.test(role.name+' '+role.material),role:{active:role.active,collidable:role.collidable,paintable:role.paintable,grate:role.grate},face:hit.face,faceMembership:face?.triangles.includes(hit.triangle),containsOnFace:face?L.containsOnFace(face,hit.point):false,normal:hit.normal.toArray(),uv:[hit.u,hit.v],cell:face?{i,j,cu:face.cu,cv:face.cv,mask:L.mask[face.grid+j*face.nu+i],centerUV:[(i+.5)*face.cu,(j+.5)*face.cv],centerInsideExactSourcePolygon:L.containsOnFace(face,center)}:null});
}
fs.writeFileSync('.ci-scratch/mask-scan.json',JSON.stringify(rows,null,2)+'\n');
const selected=rows.filter(r=>r.side===0&&r.z===39),runs=[];
for(const row of selected){const key=[row.sign,row.hit,row.sourceObject,row.face,row.containsOnFace,row.cell?.mask,row.cell?.centerInsideExactSourcePolygon].join('|'),last=runs.at(-1);if(last?.key===key){last.toY=row.y;last.samples++;}else runs.push({key,fromY:row.y,toY:row.y,samples:1,example:row});}
console.log(JSON.stringify({sourceSha256:L.manifest.sourceSha256,totalSamples:rows.length,paintableInsideButDead:rows.filter(r=>r.role?.paintable&&r.containsOnFace&&r.cell?.mask===0).length,runs}));
