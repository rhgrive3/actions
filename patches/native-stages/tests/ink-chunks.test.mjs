import test from 'node:test';import assert from 'node:assert/strict';
import {nativeFixture,readStage} from './fixture.mjs';
import fs from 'node:fs';import path from 'node:path';

test('native ink clips unpainted colour after evaluating shading derivatives',async()=>{
 const f=await nativeFixture(),{THREE}=f,paint={texture:new THREE.Texture(),size:256},material=f.nativeInkMaterial(paint,new THREE.Texture());
 const base=THREE.ShaderLib.physical,shader={uniforms:{},vertexShader:base.vertexShader,fragmentShader:base.fragmentShader};material.onBeforeCompile(shader);
 const clip=shader.fragmentShader.indexOf('if (texture2D(uPaint, vPaintUv).a < 0.015) discard;');
 assert(clip>shader.fragmentShader.lastIndexOf('dFdx(normal)'),'early discard makes ink edge derivatives undefined');
 assert(clip<shader.fragmentShader.indexOf('#include <opaque_fragment>'));assert.equal(shader.uniforms.uPaint.value,paint.texture);material.dispose();
});

test('native ink attributes retain source order, UVs and exact typed allocation',async()=>{
 const f=await nativeFixture(),{THREE}=f;
 const triangles=new Float32Array([
  0,0,0, 2,0,0, 0,0,1,
  4,1,5, 6,1,5, 4,1,6,
 ]);
 const face={
  triangles:[1,0],atlas:{x:3,y:5,pad:1,ppm:4},
  origin:new THREE.Vector3(),u:new THREE.Vector3(1,0,0),
  v:new THREE.Vector3(0,0,1),n:new THREE.Vector3(0,1,0),
  su:8,sv:7,wall:true,
 };
 const paint={paintFaces:[{...face,atlas:null},face],size:128};
 const g=f.nativeInkGeometry({data:{triangles}},paint);
 const expectedPositions=[4,1,5,6,1,5,4,1,6,0,0,0,2,0,0,0,0,1];
 assert.deepEqual(Array.from(g.getAttribute('position').array),expectedPositions);
 const sizes={position:3,normal:3,color:3,paintUv:2,faceUv:2,
  faceData:4,faceFlags:3,faceTan:3,lightUv:2};
 for(const [name,size] of Object.entries(sizes)){
  const attr=g.getAttribute(name);
  assert.equal(attr.count,6,name);
  assert.equal(attr.itemSize,size,name);
  assert.equal(attr.array.byteLength,6*size*4,name+' allocated extra capacity');
  // Source modules execute in a separate vm.SourceTextModule realm. instanceof
  // the host Float32Array rejects a genuine Float32Array created by that
  // realm. Keep the strict element type/stride/capacity check across realms.
  assert.equal(Object.prototype.toString.call(attr.array),'[object Float32Array]',name);
  assert.equal(attr.array.BYTES_PER_ELEMENT,4,name+' element width');
 }
 assert.deepEqual(Array.from(g.getAttribute('faceUv').array),[4,5,6,5,4,6,0,0,2,0,0,1]);
 assert.deepEqual(Array.from(g.getAttribute('paintUv').array),[
  20/128,26/128,28/128,26/128,20/128,30/128,
  4/128,6/128,12/128,6/128,4/128,10/128,
 ]);
 assert.deepEqual(Array.from(g.getAttribute('faceFlags').array),[1,0,-1,1,0,-1,1,0,-1,1,0,-1,1,0,-1,1,0,-1]);
 assert.deepEqual(Array.from(g.getAttribute('faceData').array),Array.from({length:6},()=>[0,1,8,7]).flat());
 assert.equal(g.boundingSphere?.radius>0,true);
 g.dispose();
});

test('render chunks preserve crossing triangles and bound only their indexed vertices',async()=>{
 const f=await nativeFixture(),{THREE}=f,g=new THREE.BufferGeometry();
 // First triangle spans tiles; second is far away. The chunks share positions
 // but must never share the full-stage sphere, or culling silently stops working.
 g.setAttribute('position',new THREE.Float32BufferAttribute([-20,0,0,20,0,0,0,3,4, 100,0,100,103,0,100,100,0,103],3));
 g.setAttribute('paintUv',new THREE.Float32BufferAttribute([0,0,1,0,0,1, 0,0,1,0,0,1],2));
 const chunks=f.partitionNativeInk(g,16);assert.equal(chunks.length,2);
 assert.equal(chunks[0].getAttribute('position'),g.getAttribute('position'));
 assert.deepEqual(Array.from(chunks[0].index.array),[0,1,2]);assert.deepEqual(Array.from(chunks[1].index.array),[3,4,5]);
 assert(chunks[0].boundingSphere.radius<25);assert(chunks[1].boundingSphere.radius<3);
 for(const c of chunks)for(const i of c.index.array)assert(c.boundingBox.containsPoint(new THREE.Vector3().fromBufferAttribute(g.getAttribute('position'),i)));
 assert.throws(()=>f.partitionNativeInk(g,0),/Invalid/);
 const mesh=new f.NativeInkMesh(g,new THREE.MeshBasicMaterial()),old=mesh.chunks;let disposed=0;
 old.forEach(x=>x.addEventListener('dispose',()=>disposed++));const next=g.clone().setIndex(null);next.setDrawRange(0,Infinity);g.dispose();mesh.geometry=next;
 assert.equal(disposed,2);assert.equal(mesh.geometry,next);assert.equal(mesh.chunks.length,2);
 const camera=new THREE.PerspectiveCamera(60,1,.1,80);camera.position.set(0,10,20);camera.lookAt(0,0,0);camera.updateMatrixWorld();mesh.updateMatrixWorld();mesh.selectVisible(camera);
 assert.equal(next.drawRange.count,3,'far tile culled, crossing triangle retained');assert.deepEqual(Array.from(next.index.array.subarray(0,3)),[0,1,2]);
 const version=next.index.version;mesh.selectVisible(camera);assert.equal(next.index.version,version,'unchanged visibility must not re-upload indices');
 camera.position.set(101,10,120);camera.lookAt(101,0,101);camera.updateMatrixWorld();mesh.selectVisible(camera);assert.equal(next.drawRange.count,3);assert.deepEqual(Array.from(next.index.array.subarray(0,3)),[3,4,5]);
 camera.position.set(1000,10,1000);camera.lookAt(1000,0,980);camera.updateMatrixWorld();mesh.selectVisible(camera);assert.equal(next.drawRange.count,0);
 camera.position.set(0,10,20);camera.lookAt(0,0,0);camera.updateMatrixWorld();mesh.selectVisible(camera);assert.equal(next.drawRange.count,3,'return from empty view restores the source draw');
 mesh.dispose();assert.equal(mesh.chunks.length,0);assert.equal(mesh.geometry,null);mesh.material.dispose();
});

const sourceIds=process.env.INKWAVE_NATIVE_STAGE_ASSETS?JSON.parse(fs.readFileSync(path.join(process.env.INKWAVE_NATIVE_STAGE_ASSETS,'catalog.json'),'utf8')).stages.map(s=>s.id):['scorch','hagglefish','inkblot','mako','brinewater'];
for(const id of sourceIds)test('source ink partition preserves every vertex, triangle and paint attribute: '+id,{skip:!process.env.INKWAVE_NATIVE_STAGE_ASSETS},async()=>{
 const f=await nativeFixture(),level=new f.NativeLevel(readStage(process.env.INKWAVE_NATIVE_STAGE_ASSETS,id));
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 const paint=new Cpu(null,level,{atlasSize:2048,maxDensity:4}),g=f.nativeInkGeometry(level,paint),chunks=f.partitionNativeInk(g),seen=new Uint8Array(g.getAttribute('position').count/3),p=g.getAttribute('position'),point=new f.THREE.Vector3();
 assert(chunks.length>1);
 for(const c of chunks){
  for(const [name,a] of Object.entries(g.attributes))assert.equal(c.getAttribute(name),a,name+' source attribute copied or changed');
  for(let j=0;j<c.index.count;j+=3){const i=c.index.getX(j);assert.equal(c.index.getX(j+1),i+1);assert.equal(c.index.getX(j+2),i+2);assert.equal(i%3,0);assert.equal(seen[i/3]++,0,'duplicate source triangle');}
  for(const i of c.index.array){point.fromBufferAttribute(p,i);assert(c.boundingBox.containsPoint(point));assert(c.boundingSphere.containsPoint(point));}
 }
 assert(seen.every(n=>n===1),'missing source triangle');chunks.forEach(c=>c.dispose());
 const mesh=new f.NativeInkMesh(g,new f.THREE.MeshBasicMaterial()),sphere=g.boundingSphere,r=Math.max(1,sphere.radius),camera=new f.THREE.OrthographicCamera(-2*r,2*r,2*r,-2*r,.1,10*r);
 camera.position.copy(sphere.center).add(new f.THREE.Vector3(0,5*r,0));camera.lookAt(sphere.center);camera.updateMatrixWorld();mesh.updateMatrixWorld();mesh.selectVisible(camera);
 assert.equal(g.drawRange.count,p.count);for(let i=0;i<p.count;i++)assert.equal(g.index.getX(i),i,'full view must retain exact original triangle order');
 mesh.dispose();mesh.material.dispose();
});

test('native ink bulk runs retain interleaved transparent source triangle order', async () => {
 const f=await nativeFixture(), {THREE}=f, g=new THREE.BufferGeometry();
 // Source order is near, far, near. Tile-grouped packing would change it.
 g.setAttribute('position',new THREE.Float32BufferAttribute([
  0,0,0, 1,0,0, 0,1,0,
  100,0,100, 101,0,100, 100,1,100,
  2,0,0, 3,0,0, 2,1,0,
 ],3));
 const mesh=new f.NativeInkMesh(g,new THREE.MeshBasicMaterial());
 const camera=new THREE.PerspectiveCamera(60,1,.1,50);
 camera.position.set(1,4,12);camera.lookAt(1,0,0);camera.updateMatrixWorld();
 mesh.updateMatrixWorld();
 assert.equal(mesh.selectVisible(camera),1);
 assert.deepEqual(Array.from(mesh.geometry.index.array.slice(0,g.drawRange.count)),[0,1,2,6,7,8]);
 const version=mesh.geometry.index.version;
 camera.position.set(1.2,4,12);camera.lookAt(1,0,0);camera.updateMatrixWorld();
 assert.equal(mesh.selectVisible(camera),1);
 assert.equal(mesh.geometry.index.version,version,'moved camera with unchanged visible set avoids GPU writes');
 camera.position.set(50,2,50);camera.lookAt(51,0,50);camera.updateMatrixWorld();
 assert.equal(mesh.selectVisible(camera),0);
 camera.position.set(1,4,12);camera.lookAt(1,0,0);camera.updateMatrixWorld();
 assert.equal(mesh.selectVisible(camera),1);
 assert.deepEqual(Array.from(mesh.geometry.index.array.slice(0,g.drawRange.count)),[0,1,2,6,7,8]);
 mesh.dispose();mesh.material.dispose();
});

test('native ink culling respects stage world transforms and camera clip changes', async () => {
 const f=await nativeFixture(),{THREE}=f,g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute([
  0,0,0, 1,0,0, 0,1,0,
  100,0,100, 101,0,100, 100,1,100,
 ],3));
 const mesh=new f.NativeInkMesh(g,new THREE.MeshBasicMaterial()),camera=new THREE.PerspectiveCamera(60,1,.1,50);
 mesh.position.set(200,0,0);mesh.updateMatrixWorld();
 camera.position.set(200,3,10);camera.lookAt(200,0,0);camera.updateMatrixWorld();
 assert.equal(mesh.selectVisible(camera),1);
 assert.deepEqual(Array.from(g.index.array.slice(0,g.drawRange.count)),[0,1,2]);
 const version=g.index.version;
 assert.equal(mesh.selectVisible(camera),1);
 assert.equal(g.index.version,version);
 camera.far=3;camera.updateProjectionMatrix();
 assert.equal(mesh.selectVisible(camera),0,'projection change invalidates cached frustum');
 camera.far=50;camera.updateProjectionMatrix();
 assert.equal(mesh.selectVisible(camera),1);
 mesh.dispose();mesh.material.dispose();
});

test('native ink bulk path retains separated source runs without changing blend order', async () => {
 const f=await nativeFixture(),{THREE}=f,g=new THREE.BufferGeometry(),positions=[];
 const tri=(x,z)=>positions.push(x,0,z,x+0.7,0,z,x,0.7,z);
 for(let i=0;i<8;i++)tri(0+(i%4)*.2,i*.2);
 for(let i=0;i<8;i++)tri(120+(i%4)*.2,120+i*.2);
 for(let i=0;i<8;i++)tri(1+(i%4)*.2,i*.2);
 g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 const mesh=new f.NativeInkMesh(g,new THREE.MeshBasicMaterial());
 assert.equal(mesh._fragmentedRuns,false,'contiguous source runs use the bulk copy path');
 const camera=new THREE.PerspectiveCamera(60,1,.1,55);
 camera.position.set(1,3,15);camera.lookAt(1,0,0);camera.updateMatrixWorld();mesh.updateMatrixWorld();
 assert.equal(mesh.selectVisible(camera),1);
 const actual=Array.from(g.index.array.subarray(0,g.drawRange.count));
 const expected=[...Array.from({length:24},(_,i)=>i),...Array.from({length:24},(_,i)=>48+i)];
 assert.deepEqual(actual,expected,'the two separated near runs retain original source order');
 const version=g.index.version;mesh.selectVisible(camera);assert.equal(g.index.version,version);
 mesh.dispose();mesh.material.dispose();
});
test('signed projection zero is recognized by the cached view comparison', async () => {
 const f=await nativeFixture(), {THREE}=f, g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
 const mesh=new f.NativeInkMesh(g,new THREE.MeshBasicMaterial());
 assert.equal(Object.is(0,-0),false);
 assert.match(f.NativeInkMesh.prototype.selectVisible.toString(),/Object\.is\(elements\[i\], previous\[i\]\)/);
 mesh.dispose();mesh.material.dispose();
});


test('native painted-only culling keeps crossing triangles, clears and restores the colour pass',async()=>{
 const f=await nativeFixture(), {THREE}=f, g=new THREE.BufferGeometry();
 // The giant source triangle is assigned by centroid, but paint hits an edge.
 g.setAttribute('position',new THREE.Float32BufferAttribute([
  -20,0,0, 20,0,0, 0,0,20,
  70,0,70, 72,0,70, 70,0,72
 ],3));
 const mesh=new f.NativeInkMesh(g,new THREE.MeshBasicMaterial()),originalPush=function(){return 7;},
       originalClear=function(){this.grid.fill(0);return 'cleared';};
 const paint={grid:new Uint8Array(4),_pushQuad:originalPush,clear:originalClear};
 mesh.bindPaint(paint);
 const camera=new THREE.OrthographicCamera(-100,100,100,-100,.1,300);
 camera.position.set(20,120,20);camera.lookAt(20,0,20);camera.updateMatrixWorld();mesh.updateMatrixWorld();
 assert.equal(mesh.selectVisible(camera),0,'never shade empty ink mesh');
 assert.equal(g.drawRange.count,0);
 const face={atlas:{pad:1,ppm:2},su:40,sv:20,
   origin:new THREE.Vector3(-20,0,0),u:new THREE.Vector3(1,0,0),v:new THREE.Vector3(0,0,1)};
 assert.equal(paint._pushQuad(face,1,2,1,2),7);
 assert.equal(mesh.selectVisible(camera),1,'source triangle must survive edge paint');
 assert.equal(g.drawRange.count,3);
 assert.deepEqual(Array.from(g.index.array.slice(0,3)),[0,1,2]);
 const version=g.index.version;
 mesh.onBeforeRender(null,{overrideMaterial:new THREE.MeshNormalMaterial()},camera);
 assert.equal(g.drawRange.count,0,'GTAO never writes opaque ink normals');
 mesh.onBeforeRender(null,{overrideMaterial:null},camera);
 assert.equal(g.drawRange.count,3,'same-camera colour pass must restore drawRange');
 assert.equal(g.index.version,version,'restoring GTAO must not reupload indices');
 assert.equal(paint.clear(),'cleared');
 assert.equal(mesh.selectVisible(camera),0,'clear makes every chunk unpainted again');
 assert.equal(g.drawRange.count,0);
 // Unexpected face-coordinate mismatch must not silently hide ink.
 paint._pushQuad({...face,origin:new THREE.Vector3(300,0,300)},1,2,1,2);
 assert.equal(mesh.selectVisible(camera),2,'unknown paint mapping fails open');
 assert.equal(g.drawRange.count,6);
 mesh.dispose();mesh.material.dispose();
 assert.equal(paint._pushQuad,originalPush,'disposing restores paint callbacks');
 assert.equal(paint.clear,originalClear);
});
test('prepainted binding fails open rather than hiding an existing ink atlas',async()=>{
 const f=await nativeFixture(), {THREE}=f, g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,0,1],3));
 const mesh=new f.NativeInkMesh(g,new THREE.MeshBasicMaterial());
 const paint={grid:new Uint8Array([1]),_pushQuad(){},clear(){}};
 mesh.bindPaint(paint);
 const camera=new THREE.PerspectiveCamera(60,1,.1,40);
 camera.position.set(0,5,12);camera.lookAt(0,0,0);camera.updateMatrixWorld();mesh.updateMatrixWorld();
 assert.equal(mesh.selectVisible(camera),1);
 assert.equal(g.drawRange.count,3);
 mesh.dispose();mesh.material.dispose();
});
test('native display excludes alpha and glass from AO without losing tiny-feature shadows',async()=>{
 const f=await nativeFixture(),{THREE}=f;
 const tri=(size)=>[[0,0,0],[size,0,0],[0,size,0]].flatMap((p)=>[...p,0,1,0,0,0]);
 const verts=new Float32Array([...tri(.01),...tri(1),...tri(1),...tri(1)]);
 const objects=['tiny','solid','glass','alpha'].map((name,i)=>({
  name,material:name==='tiny'?'solid':name,active:true,glass:name==='glass',
  collidable:true,vo:i*3,vc:3,io:i*3,ic:3
 }));
 const data={manifest:{objects,materials:{solid:{},glass:{},alpha:{maps:{opacity:'mask.png'}}}},
  vertices:verts,indices:new Uint32Array([0,1,2,0,1,2,0,1,2,0,1,2])};
 const d=f.nativeDisplay(data,new Map(),'balanced');
 const [tiny,solid,glass,alpha]=d.group.children;
 assert.equal(tiny.castShadow,false,'sub-5cm detail is the only omitted caster');
 assert.equal(solid.castShadow,true,'visible small and large shadows stay intact');
 assert.equal(glass.castShadow,false);
 assert.equal(alpha.castShadow,false);
 for(const mesh of [glass,alpha]){
  const before=mesh.geometry.drawRange.count;
  assert.equal(typeof mesh.onBeforeRender,'function');
  mesh.onBeforeRender(null,{overrideMaterial:new THREE.MeshNormalMaterial()});
  assert.equal(mesh.geometry.drawRange.count,0);
  mesh.onBeforeRender(null,{overrideMaterial:null});
  assert.equal(mesh.geometry.drawRange.count,before);
 }
 assert.equal(solid.onBeforeRender,THREE.Object3D.prototype.onBeforeRender);
 d.dispose();
});
