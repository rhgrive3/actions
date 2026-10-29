import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

const source=fs.readFileSync(new URL('../runtime/native-ink-chunks.mjs',import.meta.url),'utf8')
  .replace("import * as THREE from 'three';",'').replaceAll('export function ','function ').replace('export class ','class ');
const NativeInkMesh=new Function('THREE',source+'\nreturn NativeInkMesh;')(THREE);
const oldSelect=new Function(fs.readFileSync(new URL('./fixtures/native-ink-selection-before.mjs.txt',import.meta.url),'utf8'))();
function make({triangles=2400,faces=24,baseline=false,fragmented=false}={}){
  const pos=new Float32Array(triangles*9);
  for(let i=0;i<triangles;i++){
    const x=fragmented?i%2*30:(i%50)*.08,z=fragmented?0:Math.floor(i/50)*.08;
    pos.set([x,0,z,x+.03,0,z,x,.03,z+.03],i*9);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const mesh=new NativeInkMesh(g,new THREE.MeshBasicMaterial());mesh.updateMatrixWorld();
  if(baseline)mesh.selectVisible=oldSelect;
  mesh._facePainted=new Uint8Array(faces);mesh._paintedFaceWords=new Uint32Array(Math.ceil(faces/32));
  mesh._faceStart=Uint32Array.from({length:faces+1},(_,i)=>Math.floor(i*triangles/faces));
  const camera=new THREE.OrthographicCamera(-100,100,100,-100,.1,300);camera.position.set(0,100,100);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  return {mesh,camera,g};
}
function paint(f,index){f.mesh._facePainted[index]=1;f.mesh._paintedFaceWords[index>>>5]|=1<<(index&31);f.mesh._faceDirty=true;}
function upload(f,state){
  const a=f.g.index;if(!state.gpu){state.gpu=a.array.slice();state.version=a.version;return;}
  if(state.version===a.version)return;
  const ranges=a.updateRanges.length?a.updateRanges:[{start:0,count:a.array.length}];
  for(const r of ranges){state.gpu.set(a.array.subarray(r.start,r.start+r.count),r.start);state.bytes+=r.count*4;state.calls++;}
  a.clearUpdateRanges();state.version=a.version;
}
function same(a,b,ga,gb){
  assert.equal(a.g.drawRange.count,b.g.drawRange.count);
  assert.deepEqual(a.g.index.array.slice(0,a.g.drawRange.count),b.g.index.array.slice(0,b.g.drawRange.count));
  if(ga){upload(a,ga);upload(b,gb);assert.deepEqual(ga.gpu.slice(0,a.g.drawRange.count),gb.gpu.slice(0,b.g.drawRange.count));}
}
function dispose(f){f.mesh.dispose();f.mesh.material.dispose();}

test('progressively painted charts upload only changed indices in the exact source order',()=>{
  const a=make({baseline:true}),b=make(),ga={bytes:0,calls:0},gb={bytes:0,calls:0};
  upload(a,ga);upload(b,gb); // allocate as a real existing render buffer
  for(let face=0;face<24;face++){
    paint(a,face);paint(b,face);a.mesh.selectVisible(a.camera);b.mesh.selectVisible(b.camera);same(a,b,ga,gb);
  }
  assert.equal(ga.bytes,360000);assert.equal(gb.bytes,28800);
  const version=b.g.index.version;b.mesh._faceDirty=true;b.mesh.selectVisible(b.camera);assert.equal(b.g.index.version,version,'same selected values do not invalidate GPU');
  dispose(a);dispose(b);
});

test('skipped rendering, hidden tails, reappearance, cameras, face mode and recreated GPU buffers preserve indices',()=>{
  const a=make({baseline:true,fragmented:true}),b=make({fragmented:true});let ga={bytes:0,calls:0},gb={bytes:0,calls:0};
  for(let frame=0;frame<600;frame++){
    if(frame%31===0){for(const f of [a,b]){f.mesh._facePainted.fill(0);f.mesh._paintedFaceWords.fill(0);f.mesh._faceDirty=true;}}
    if(frame%7===0){for(const f of [a,b]){f.mesh.faceCulling=!f.mesh.faceCulling;}}
    paint(a,frame%24);paint(b,frame%24);
    const x=[0,30,1000][Math.floor(frame/4)%3];
    for(const f of [a,b]){f.camera.left=-10;f.camera.right=10;f.camera.updateProjectionMatrix();f.camera.position.set(x,10,10);f.camera.lookAt(x,0,0);f.camera.updateMatrixWorld();f.mesh.selectVisible(f.camera);}
    same(a,b);
    if(frame%13===0){ga={bytes:0,calls:0};gb={bytes:0,calls:0};}
    if(frame%5===0)same(a,b,ga,gb);
  }
  dispose(a);dispose(b);
});

test('native index dirty publication benchmark reports CPU work alongside transfer benefit',()=>{
  const rows=[];
  for(const kind of ['progressive-paint','camera-shift']){
    const samples=[[],[]];let beforeBytes=0,afterBytes=0;
    for(let rep=0;rep<12;rep++)for(const optimized of (rep%2?[true,false]:[false,true])){
      const f=make({baseline:!optimized,triangles:24000,faces:240,fragmented:kind==='camera-shift'}),gpu={bytes:0,calls:0};
      upload(f,gpu);let elapsed=0;
      if(kind==='camera-shift'){for(let i=0;i<240;i++)paint(f,i);f.mesh.selectVisible(f.camera);upload(f,gpu);gpu.bytes=0;}
      for(let step=0;step<240;step++){
        if(kind==='progressive-paint')paint(f,step);
        else {const x=step%2*30;f.camera.left=-10;f.camera.right=10;f.camera.updateProjectionMatrix();f.camera.position.set(x,10,10);f.camera.lookAt(x,0,0);f.camera.updateMatrixWorld();}
        const t=performance.now();f.mesh.selectVisible(f.camera);elapsed+=performance.now()-t;upload(f,gpu);
      }
      if(rep>1)samples[optimized?1:0].push(elapsed);
      if(optimized)afterBytes=gpu.bytes;else beforeBytes=gpu.bytes;
      dispose(f);
    }
    const median=a=>a.sort((a,b)=>a-b)[a.length>>1];
    rows.push({kind,triangles:24000,steps:240,beforeMs:median(samples[0]),afterMs:median(samples[1]),beforeBytes,afterBytes});
  }
  console.log(JSON.stringify({scope:'Node actual selection method; wall-clock timing is host dependent; no GPU/device FPS claim',rows}));
});
