import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../inkwave-public/vendor/three/build/three.module.js';
import * as nativeWork from '../../patches/native-stages/runtime/native-work.mjs';

const ctx=vm.createContext({console});
const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v);},{context:ctx});
const modules={three:synthetic(THREE),'./native-work.mjs':synthetic(nativeWork),
 '../../../src/world/levelMaterial.js':synthetic({createLevelMaterial(){throw Error('unused');}}),
 './native-paint-detail.mjs':synthetic({enableNativePaintDetail(){throw Error('unused');}})};
const mod=new vm.SourceTextModule(fs.readFileSync(process.env.INKWAVE_NATIVE_DISPLAY_EXPERIMENT,'utf8'),{context:ctx});
await mod.link(name=>modules[name]);await mod.evaluate();
const install=mod.namespace.installNativeDisplayCulling;

function mesh(tight){
 const positions=[],indices=[];
 for(let x=-12;x<12;x++)for(let z=-12;z<4;z++){
  const v=positions.length/3,X=x*16,Z=z*16,y=-6;
  positions.push(X,y,Z, X+15,y,Z, X+15,y,Z+15, X,y,Z+15);
  indices.push(v,v+1,v+2,v,v+2,v+3);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 g.setIndex(new THREE.BufferAttribute(new Uint16Array(indices),1));g.computeBoundingSphere();
 const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial());mesh.updateMatrixWorld();
 const culler=install(mesh,16,1,tight);return {mesh,g,culler,source:indices,positions};
}
function camera(x,y,z,yaw,pitch,ortho=false){
 const c=ortho?new THREE.OrthographicCamera(-20,20,12,-12,.1,200):new THREE.PerspectiveCamera(35,1.5,.1,200);
 c.position.set(x,y,z);c.lookAt(x+Math.sin(yaw),y+pitch,z-Math.cos(yaw));c.updateMatrixWorld();return c;
}
test('tight native display bounds retain every potentially visible triangle and source order',()=>{
 const a=mesh(false),b=mesh(true);let reduced=0;
 try{
  const cameras=[];
  for(let i=0;i<72;i++)cameras.push(camera(Math.sin(i*.37)*24,Math.cos(i*.21)*5,Math.sin(i*.19)*20,i*.41,Math.sin(i*.23)*.25,i%9===0));
  const transforms=[
   new THREE.Matrix4(),
   new THREE.Matrix4().compose(new THREE.Vector3(-10,2,3),new THREE.Quaternion().setFromEuler(new THREE.Euler(.1,.37,-.2)),new THREE.Vector3(-1,1,1)),
   new THREE.Matrix4().compose(new THREE.Vector3(5,-3,-7),new THREE.Quaternion().setFromEuler(new THREE.Euler(-.3,-.5,.2)),new THREE.Vector3(.4,-1.8,2.5)),
  ];
  for(const transform of transforms)for(let i=0;i<cameras.length;i++){
   a.mesh.matrixWorld.copy(transform);b.mesh.matrixWorld.copy(transform);
   const c=cameras[i];a.culler.select(c);b.culler.select(c);
   const base=Array.from(a.g.index.array.slice(0,a.g.drawRange.count));
   const next=Array.from(b.g.index.array.slice(0,b.g.drawRange.count));
   const selected=new Set();for(let j=0;j<next.length;j+=3)selected.add(next[j]+'/'+next[j+1]+'/'+next[j+2]);
   let at=0;for(const id of next){while(at<base.length&&base[at]!==id)at++;assert.ok(at<base.length,'source triangle order must be a subsequence');at++;}
   assert.ok(next.length<=base.length);if(!transform.equals(transforms[0]))assert.deepEqual(next,base,'nonidentity world transform must use the original sphere selection');if(next.length<base.length)reduced++;
   const f=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse).multiply(b.mesh.matrixWorld));
   const box=new THREE.Box3(),v=new THREE.Vector3();
   for(let j=0;j<b.source.length;j+=3){
    box.makeEmpty();for(let k=0;k<3;k++)box.expandByPoint(v.fromBufferAttribute(b.g.attributes.position,b.source[j+k]));
    if(f.intersectsBox(box))assert.ok(selected.has(b.source[j]+'/'+b.source[j+1]+'/'+b.source[j+2]),'potentially visible triangle omitted');
   }
   if(i%11===0){a.g.index.clearUpdateRanges();b.g.index.clearUpdateRanges();}
  }
  assert.ok(reduced>0,'exercise tighter selection, including negative-scale and rotated transforms');
 }finally{for(const x of [a,b]){x.culler.dispose();x.g.dispose();x.mesh.material.dispose();}}
});

test('near, far and side clipping boundaries retain potentially visible triangles',()=>{
 const samples=[];
 // Float32 values immediately inside, at and outside the near/far clip planes.
 for(const z of [-.10001,-.1,-.09999,-199.99997,-200,-200.00003])
  samples.push([[0,0,z],[.000001,0,z],[0,.000001,z]]);
 const edge=40*Math.tan(35*Math.PI/360)*1.5;
 for(const x of [-edge-.00002,-edge,-edge+.00002,edge-.00002,edge,edge+.00002])
  samples.push([[x,0,-40],[x,.001,-40],[x,0.002,-40]]);
 const positions=new Float32Array(samples.flat(2));
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
 geometry.setIndex(new THREE.BufferAttribute(Uint16Array.from({length:positions.length/3},(_,i)=>i),1));
 geometry.computeBoundingSphere();const m=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());m.updateMatrixWorld();
 const culler=install(m,16,1,true),cam=camera(0,0,0,0,0),f=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse));
 try{
  culler.select(cam);const selected=new Set(geometry.index.array.slice(0,geometry.drawRange.count));
  for(let t=0;t<samples.length;t++){
   const box=new THREE.Box3();for(let k=0;k<3;k++)box.expandByPoint(new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,t*3+k));
   if(f.intersectsBox(box))for(let k=0;k<3;k++)assert.ok(selected.has(t*3+k),'clipping boundary was excluded: '+t);
  }
 }finally{culler.dispose();geometry.dispose();m.material.dispose();}
});

test('tight selection preserves pending uploads across colour and shadow cameras',()=>{
 const f=mesh(true),colour=camera(0,0,0,0,0),shadow=camera(150,5,50,1,.1,true);
 const selectColour=()=>{f.mesh.onBeforeRender(null,null,colour,f.g,f.mesh.material,null);return Array.from(f.g.index.array.slice(0,f.g.drawRange.count));};
 try{
  const first=selectColour(),pending=f.g.index.updateRanges.map(r=>({...r}));assert.ok(pending.length,'first selection queued an upload');
  f.mesh.onBeforeShadow(null,f.mesh,colour,shadow,f.g,f.mesh.material,null);
  const second=Array.from(f.g.index.array.slice(0,f.g.drawRange.count));assert.notDeepEqual(second,first,'exercise shadow camera transition');
  for(const r of pending)assert.ok(f.g.index.updateRanges.some(n=>n.start<=r.start&&n.start+n.count>=r.start+r.count),'pending colour writes were discarded');
  assert.deepEqual(selectColour(),first,'colour selection restored after shadow camera');
  for(const r of pending)assert.ok(f.g.index.updateRanges.some(n=>n.start<=r.start&&n.start+n.count>=r.start+r.count),'pending writes were discarded across alternating cameras');
 }finally{f.culler.dispose();f.g.dispose();f.mesh.material.dispose();}
});


test('unusual camera matrices or clipping planes retain the original sphere selection',()=>{
 const a=mesh(false),b=mesh(true),views=[];
 try{
  const distant=camera(2001,0,0,0,0);views.push(distant);
  const tooNear=camera(0,0,0,0,0);tooNear.near=.001;tooNear.updateProjectionMatrix();views.push(tooNear);
  const tooFar=camera(0,0,0,0,0);tooFar.far=20000;tooFar.updateProjectionMatrix();views.push(tooFar);
  const scaled=camera(0,0,0,0,0);scaled.scale.set(2,.5,1);scaled.updateMatrixWorld();views.push(scaled);
  for(const [i,c] of views.entries()){a.culler.select(c);b.culler.select(c);assert.deepEqual(Array.from(b.g.index.array.slice(0,b.g.drawRange.count)),Array.from(a.g.index.array.slice(0,a.g.drawRange.count)),'fallback view '+i);}
 }finally{for(const f of [a,b]){f.culler.dispose();f.g.dispose();f.mesh.material.dispose();}}
});

test('cached view is invalidated when a compensating object transform disables tight selection',()=>{
 const a=mesh(false),b=mesh(true),first=camera(0,0,0,0,0),moved=camera(20,0,0,0,0);
 const values=x=>Array.from(x.g.index.array.slice(0,x.g.drawRange.count));
 try{
  a.culler.select(first);b.culler.select(first);assert.ok(values(b).length<values(a).length,'initial camera exercises tighter selection');
  const transform=new THREE.Matrix4().makeTranslation(20,0,0);a.mesh.matrixWorld.copy(transform);b.mesh.matrixWorld.copy(transform);
  a.culler.select(moved);b.culler.select(moved);assert.deepEqual(values(b),values(a),'fallback must restore sphere selection even if combined view is unchanged');
 }finally{for(const f of [a,b]){f.culler.dispose();f.g.dispose();f.mesh.material.dispose();}}
});

test('custom Three.js frustum and plane hooks use the original observable selection',()=>{
 const c=camera(0,0,0,0,0);
 for(const [target,name] of [[THREE.Frustum.prototype,'intersectsSphere'],[THREE.Frustum.prototype,'intersectsBox'],[THREE.Plane.prototype,'distanceToPoint'],[THREE.Vector3.prototype,'dot']]){
  const a=mesh(false),b=mesh(true),original=target[name];let calls=0;
  try{
   target[name]=function(...args){calls++;return original.apply(this,args);};
   a.culler.select(c);b.culler.select(c);
   assert.ok(calls>0||name==='intersectsBox','exercise the custom hook');
   assert.deepEqual(Array.from(b.g.index.array.slice(0,b.g.drawRange.count)),Array.from(a.g.index.array.slice(0,a.g.drawRange.count)),name+' must use sphere fallback');
  }finally{target[name]=original;for(const f of [a,b]){f.culler.dispose();f.g.dispose();f.mesh.material.dispose();}}
 }
});
