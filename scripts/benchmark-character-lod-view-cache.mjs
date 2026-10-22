// Reproducible review of the queue's small view-snapshot cache. This candidate
// is deliberately not installed in the game without a measured benefit.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from '../inkwave-public/vendor/three/build/three.module.js';
const source=fs.readFileSync(new URL('../inkwave-public/src/game/character.js',import.meta.url),'utf8'),start=source.indexOf('  _screenPx() {'),end=source.indexOf('\n  }',start)+4,method=source.slice(start,end).trim();
assert.ok(start>0&&end>start);
function scenario(candidate){
 const camera=new THREE.PerspectiveCamera(60,16/9,.1,1000),viewport=new THREE.Vector2(),renderer={revision:0},G={camera,renderer};
 let width=1280,height=720;renderer.getSize=out=>out.set(width,height);renderer.resize=(w,h)=>{width=w;height=h;renderer.revision++;};
 const c={camera:null,renderer:null,revision:-1,x:0,y:0,z:0,e5:0,position:new THREE.Vector3(),height:0};
 function snapshot(){const camera=G.camera,r=G.renderer,m=camera.matrixWorld.elements,e5=camera.projectionMatrix.elements[5];
  if(c.camera!==camera||c.renderer!==r||c.revision!==r.revision||c.x!==m[12]||c.y!==m[13]||c.z!==m[14]||c.e5!==e5){c.camera=camera;c.renderer=r;c.revision=r.revision;c.x=m[12];c.y=m[13];c.z=m[14];c.e5=e5;c.position.setFromMatrixPosition(camera.matrixWorld);c.height=r.getSize(viewport).y;}return c;}
 const branch='      _lodC.setFromMatrixPosition(G.camera.matrixWorld); e5 = G.camera.projectionMatrix.elements[5];\n      vh = G.renderer ? G.renderer.getSize(_vVH).y : innerHeight;';assert.ok(method.includes(branch));
 const text=candidate?method.replace(branch,'      const view = snapshot(); _lodC.copy(view.position); e5 = view.e5; vh = view.height;'):method;
 const fn=new Function('G','_lodC','_lodK','_vVH','KID_H','snapshot','innerHeight','return function '+text)(G,new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector2(),1.32,snapshot,720);
 const characters=Array.from({length:8},(_,i)=>{const root=new THREE.Object3D();root.position.set(i*.8,0,8+i*4);return {root,inWorld:true};});
 function frame(i){camera.matrixWorld.elements[12]=(i%100)*.003;camera.matrixWorld.elements[13]=1.8;if(i%173===0){renderer.resize(1280,i%346===0?720:900);}if(i%197===0){camera.fov=i%394===0?60:75;camera.updateProjectionMatrix();}}
 return {fn,characters,frame};
}
const a=scenario(false),b=scenario(true);let comparisons=0;
for(let i=0;i<1000;i++){a.frame(i);b.frame(i);for(let j=0;j<8;j++){assert.equal(b.fn.call(b.characters[j]),a.fn.call(a.characters[j]));comparisons++;}}
function run(s,n){let checksum=0;const begin=performance.now();for(let i=0;i<n;i++){s.frame(i);for(const ch of s.characters)checksum+=s.fn.call(ch);}return {ms:performance.now()-begin,checksum};}
for(let i=0;i<3;i++){run(a,10000);run(b,10000);}const base=[],cache=[];
for(let i=0;i<9;i++){const order=i%2?[b,a]:[a,b],results=order.map(s=>run(s,50000));const aa=results[i%2?1:0],bb=results[i%2?0:1];assert.equal(aa.checksum,bb.checksum);base.push(aa.ms);cache.push(bb.ms);}
const differences=base.map((value,i)=>cache[i]-value);let seed=19;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32),means=[];for(let trial=0;trial<10000;trial++){let total=0;for(let i=0;i<differences.length;i++)total+=differences[Math.floor(random()*differences.length)];means.push(total/differences.length);}means.sort((a,b)=>a-b);const differenceCI=[means[250],means[9750]];
const median=xs=>[...xs].sort((x,y)=>x-y)[Math.floor(xs.length/2)],baselineMs=median(base),candidateMs=median(cache),report={scope:'V8 actual Character._screenPx with8realObject3Droots; cheapgetSize fixture follows vendored logical-size getter; cache has explicit viewportrevision supplied by fixture, not a production resize mechanism',node:process.version,comparisons,callsPerRound:400000,rounds:9,baselineMs,candidateMs,ratio:candidateMs/baselineMs,pairedMeanDifference95PercentBootstrapMs:differenceCI,baselineSamples:base,candidateSamples:cache,decision:differenceCI[0]>=0?'reject-slower-cache-candidate':differenceCI[1]>=0?'reject-no-established-gain-in-reviewed-cache':'requires-browser-profile-and-real-viewport-invalidation-before-admission',limitations:'No iPad/WebKit timing, GPU/FPS or universal rejection of future orchestration-level batching.'};
console.log(JSON.stringify(report,null,2));if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
