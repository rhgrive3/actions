import fs from 'node:fs';import assert from 'node:assert/strict';
import {THREE,mapHead,screenBounds,isolatedHead} from './lib/inkwave-tracked-blob-mapping.mjs';
const root=new URL('../',import.meta.url);
const source=fs.readFileSync(new URL('inkwave-public/src/game/weapons.js',root),'utf8');
const body=source.slice(source.indexOf('  _draw() {')+12,source.indexOf('\n  }\n}',source.indexOf('  _draw() {')));
const spawn=fs.readFileSync(new URL('patches/splatoon3/runtime/main-weapon-catalog.mjs',root),'utf8');assert.ok(spawn.includes("type:'shot',wid:r.id"));assert.ok(spawn.includes('vis:.1,tail0:.8,tailK:1.3,wob:.02,wobF:26,nose:.3,sats:0'));
const fixture=JSON.parse(fs.readFileSync(new URL('./lib/inkwave-tracked-shot-fixture.json',import.meta.url)));const row={temporal:{frames:fixture.frames}},a=fixture.admission,results=[];
for(const frame of row.temporal.frames){
 const p={type:'shot',wid:'s3-blaster-short',pos:new THREE.Vector3(...frame.position),vel:new THREE.Vector3(...frame.velocity),start:new THREE.Vector3(...a.muzzle),age:frame.age,life:.11,size:.2,seed:a.seed,vis:.1,tail0:.8,tailK:1.3,wob:.02,wobF:26,nose:.3,sats:0,owner:{color:new THREE.Color('red')}};
 const geometry=new THREE.SphereGeometry(1,14,12).rotateX(Math.PI/2),blobs=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial(),700),blobShape=new THREE.InstancedBufferAttribute(new Float32Array(2800),4),system={list:[p],blobs,blobShape,inkFlight:{draw:(b,s,n)=>n}};
 Function('_dir','_q','_s','_m','_c','_v','_v2','_v3','ZAX','MAX_BLOBS','SAT_SIZE','smoothstep',body).call(system,new THREE.Vector3(),new THREE.Quaternion(),new THREE.Vector3(),new THREE.Matrix4(),new THREE.Color(),new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3(0,0,1),700,[.46,.33,.24,.17],(a,b,x)=>THREE.MathUtils.smoothstep(x,a,b));
 const lifeIndependence=structuredClone({life:p.life,size:p.size});
 assert.equal(blobs.count,1);const index=mapHead(p,blobs.instanceMatrix.array,blobShape.array,blobs.count);assert.equal(index,0);
 const originalLife=p.life;p.life=10;p.size=999;assert.equal(mapHead(p,blobs.instanceMatrix.array,blobShape.array,blobs.count),0);p.life=originalLife;p.size=lifeIndependence.size;
 if(frame.frame===6){const wrong={...p,type:'blast'};assert.throws(()=>mapHead(wrong,blobs.instanceMatrix.array,blobShape.array,blobs.count),/missing/);}
 assert.throws(()=>mapHead({...p,vis:.3},blobs.instanceMatrix.array,blobShape.array,blobs.count),/missing/);
 const camera=JSON.parse(frame.camera),vp=new THREE.Matrix4().fromArray(camera[7]).multiply(new THREE.Matrix4().fromArray(camera[6]));
 const roi=screenBounds(geometry,Array.from(blobs.instanceMatrix.array.slice(0,16)),Array.from(blobShape.array.slice(0,4)),vp,1920,1080);
 assert.deepEqual(isolatedHead(index,[roi]),roi);results.push({frame:frame.frame,age:p.age,sourceType:p.type,sats:p.sats,activeInstances:blobs.count,index,roi});
}
const out={scope:'Exact native draw with hosted contact positions/velocities/seed/camera plus source-defined catalogue visual fields; single-shot CPU replay only. No actual buffer capture or visibility inference.',placeholderFields:'life=.11 and size=.2 are placeholders: type shot skips blast life deformation, vis=.1 supersedes size and sats=0 skips satellite life fade; neither affects this shader matrix/shape result.',viewport:'1920x1080 from configured 960x540 viewport at DPR2; needs actual capture binding before GPU use',negativeControls:'Changing unused shot life/size preserves mapping; using legacy blast late-life deformation or wrong vis fails mapping.',results};
assert.equal(results.length,4);console.log('Four source-reconstructed catalogue frames PASS; no GPU visibility conclusion');
