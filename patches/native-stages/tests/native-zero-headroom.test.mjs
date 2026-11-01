import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { consumeNativeWork, consumeNativeWorkAsync } from '../runtime/native-work.mjs';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const clean = source => source.replace(/^import .*;\n/gm, '').replaceAll('export function ', 'function ').replaceAll('export class ', 'class ').replaceAll('export const ', 'const ');
const renderSource = clean(read('../runtime/native-render.mjs'));
const cull = new Function('THREE', 'consumeNativeWork', 'consumeNativeWorkAsync', renderSource + '\nreturn installNativeDisplayCulling;')(THREE, consumeNativeWork, consumeNativeWorkAsync);
const beforeCull = new Function('THREE', clean(read('./fixtures/native-display-culling-before-20261030.mjs.txt')) + '\nreturn installNativeDisplayCulling;')(THREE);
const { NativeInkMesh, partitionNativeInk } = new Function('THREE', 'consumeNativeWork', 'consumeNativeWorkAsync', clean(read('../runtime/native-ink-chunks.mjs')) + '\nreturn {NativeInkMesh,partitionNativeInk};')(THREE, consumeNativeWork, consumeNativeWorkAsync);
const NativeLevel = new Function('THREE', 'Level', clean(read('../runtime/native-level.mjs')) + '\nreturn NativeLevel;')(THREE, class {});
const seedWord = seed => Math.floor((Math.fround(seed) - Math.floor(Math.fround(seed))) * 65536);
const NativePaintDetail = new Function('THREE', 'G', 'paintShapeSeed', clean(read('../runtime/native-paint-detail.mjs')) + '\nreturn NativePaintDetail;')(THREE, {}, seedWord);
const beforeTriangles = new Function('floorSurface', 'NATIVE_DETAIL_TILE', 'PAD', 'GUARD', 'SIDE', 'VERTEX_LIMIT', 'NATIVE_DETAIL_PPM', 'NATIVE_DETAIL_SIZE', 'paintShapeSeed',
  read('./fixtures/native-detail-triangles-before-20261031.mjs.txt'))(f => f?.triangles && f.turf, 256, 8, 8 / 30, 8, 32766, 30, 1024, seedWord);

function random(seed = 7) { return () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296); }
function camera(x, width = 19) {
  const c = new THREE.OrthographicCamera(-width, width, width, -width, .1, 200);
  c.position.set(x, 20, 30); c.lookAt(x, 0, 0); c.updateMatrixWorld(); return c;
}
function geometry(fragmented = false, count = 1600) {
  const data = new Float32Array(count * 9);
  for (let i = 0; i < count; i++) {
    const tile = fragmented ? i % 8 : Math.floor(i / (count / 8));
    const x = tile * 24, z = (i % 8) * .05;
    data.set([x, 0, z, x + .1, 0, z, x, .1, z + .1], i * 9);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(data, 3)); return g;
}
function consume(g, gpu) {
  for (const range of g.index.updateRanges) gpu.set(g.index.array.subarray(range.start, range.start + range.count), range.start);
  g.index.clearUpdateRanges();
}

test('display culling matches frozen source across changed prefixes, hidden tails and delayed multi-camera uploads', () => {
  for (const fragmented of [false, true]) {
    const source = geometry(fragmented); source.setIndex(new THREE.BufferAttribute(Uint32Array.from({ length: source.getAttribute('position').count }, (_, i) => i), 1));
    const a = new THREE.Mesh(source, new THREE.MeshBasicMaterial()), b = new THREE.Mesh(source.clone(), a.material);
    a.updateMatrixWorld(); b.updateMatrixWorld(); const old = beforeCull(a), next = cull(b);
    const ga = a.geometry.index.array.slice(), gb = b.geometry.index.array.slice();
    assert.equal(old.tiles, next.tiles);
    for (let frame = 0; frame < 360; frame++) {
      const c = camera([0, 48, 96, 168, 1000, 84][Math.floor(frame / 3) % 6], frame % 7 === 0 ? 200 : 19);
      old.select(c); next.select(c);
      assert.equal(a.geometry.drawRange.count, b.geometry.drawRange.count);
      const count = a.geometry.drawRange.count;
      assert.deepEqual(b.geometry.index.array.slice(0, count), a.geometry.index.array.slice(0, count));
      if (frame % 4 === 0) {
        consume(a.geometry, ga); consume(b.geometry, gb);
        assert.deepEqual(gb.slice(0, count), ga.slice(0, count), 'delayed GPU buffer contents');
      }
    }
    old.dispose(); next.dispose(); a.geometry.dispose(); b.geometry.dispose(); a.material.dispose();
  }
});

test('partition preserves exact centroids, public keys, normalized and half-float attribute decoding', () => {
  const ordinary = geometry(false, 96).getAttribute('position');
  const interleaved = new Float32Array(ordinary.count * 5);
  for (let i = 0; i < ordinary.count; i++) interleaved.set([9, ordinary.getX(i), ordinary.getY(i), ordinary.getZ(i), 7], i * 5);
  const attrs = [ordinary, new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(interleaved, 5), 3, 1),
    new THREE.Int16BufferAttribute([-32768,0,0, -32767,0,1, -32766,1,0, 32766,0,0, 32767,0,1, 32767,1,0], 3, true),
    new THREE.Float16BufferAttribute(Array.from(ordinary.array, THREE.DataUtils.toHalfFloat), 3)];
  const outside = new THREE.BufferAttribute(new Float64Array([-8192.000000000002,0,0, -8192,0,0, -8192,0,1, 8192,0,0, 8192,0,1, 8192,1,0]), 3);
  attrs.push(outside);
  const custom=ordinary.clone();custom.getX=function(i){return this.array[i*3]*2;};attrs.push(custom);
  for (const attr of attrs) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', attr);
    const size = attr.normalized ? .2 : 16, expected = new Map();
    for (let i = 0; i < attr.count; i += 3) {
      const key = ['X','Y','Z'].map(axis => Math.floor(((attr['get'+axis](i) + attr['get'+axis](i+1) + attr['get'+axis](i+2)) / 3) / size)).join(',');
      let e = expected.get(key); if (!e) expected.set(key, e = { ids: [], box: new THREE.Box3() });
      for (let j = i; j < i + 3; j++) { e.ids.push(j); e.box.expandByPoint(new THREE.Vector3().fromBufferAttribute(attr, j)); }
    }
    const chunks = partitionNativeInk(g, size); assert.equal(chunks.length, expected.size);
    for (const chunk of chunks) {
      const e = expected.get(chunk.userData.nativeTile); assert.ok(e);
      assert.deepEqual(Array.from(chunk.index.array), e.ids); assert.ok(chunk.boundingBox.equals(e.box)); chunk.dispose();
    }
    g.dispose();
  }
});

test('uniform and mixed paint charts consume single-tile hints and retain source-order selections', () => {
  for(const fragmented of [false,true]){
    const a = new NativeInkMesh(geometry(fragmented), new THREE.MeshBasicMaterial()), b = new NativeInkMesh(geometry(fragmented), a.material);
    const faces = Array.from({ length: 16 }, (_, i) => ({ atlas: {}, triangles: Array.from({ length: 100 }, (_, j) => i * 100 + j) }));
    for (const mesh of [a,b]) { mesh.updateMatrixWorld(); mesh._bindFaces({ paintFaces: faces }); mesh._facePainted.fill(1); mesh._paintedFaceWords.fill(0xffff); }
    b._faceSingleTile = null;
    assert.ok(a._faceSingleTile.every(x => fragmented?x===-1:x>=0));
    for (let frame = 0; frame < 120; frame++) {
      const c = camera(frame % 8 * 24); a.selectVisible(c); b.selectVisible(c);
      assert.equal(a.geometry.drawRange.count,b.geometry.drawRange.count);
      assert.deepEqual(a.geometry.index.array.slice(0,a.geometry.drawRange.count),b.geometry.index.array.slice(0,b.geometry.drawRange.count));
      a._faceDirty = b._faceDirty = true;
    }
    a.dispose(); b.dispose(); a.material.dispose();
  }
});

test('scalar containsOnFace matches vendored Three at random, degenerate and shared-edge points', () => {
  const rng = random(), triangle = new THREE.Triangle(), p = new THREE.Vector3();
  const face = { origin: new THREE.Vector3(),u:new THREE.Vector3(1,0,0),v:new THREE.Vector3(0,0,1),n:new THREE.Vector3(0,1,0),su:1000,sv:1000,triangles:[0] };
  const data = new Float64Array(9), level = { triangleWorld: { triangles:data } };
  for (let i = 0; i < 4000; i++) {
    triangle.a.set(rng()*400,0,rng()*400); triangle.b.set(rng()*400,0,rng()*400); triangle.c.set(rng()*400,0,rng()*400);
    if (i % 17 === 0) triangle.c.copy(triangle.a);
    triangle.a.toArray(data,0); triangle.b.toArray(data,3); triangle.c.toArray(data,6);
    for (const t of [0,Number.EPSILON,.5,1-Number.EPSILON,1]) {
      p.lerpVectors(triangle.a,triangle.b,t); if(i%3===0)p.addScaledVector(triangle.c,.00001);
      const expected = triangle.containsPoint(p);
      assert.equal(NativeLevel.prototype.containsOnFace.call(level,face,p),expected,'shared edge '+i+':'+t);
    }
  }
});

function detailFixture() {
  const calls = [], state={target:{label:'original'},face:2,mip:3,color:new THREE.Color(.2,.3,.4),alpha:.6,viewport:new THREE.Vector4(1,2,300,200),scissor:new THREE.Vector4(3,4,100,90),scissorTest:true};
  const renderer={autoClear:true,initRenderTarget(){},getRenderTarget(){return state.target;},getActiveCubeFace(){return state.face;},getActiveMipmapLevel(){return state.mip;},
    getClearColor(v){return v.copy(state.color);},getClearAlpha(){return state.alpha;},getViewport(v){return v.copy(state.viewport);},getScissor(v){return v.copy(state.scissor);},getScissorTest(){return state.scissorTest;},
    setRenderTarget(t,f=0,m=0){calls.push('target');state.target=t;state.face=f;state.mip=m;},setClearColor(c,a){state.color.set(c);state.alpha=a;},
    setViewport(v){state.viewport.copy(v);},setScissor(...v){v.length===1?state.scissor.copy(v[0]):state.scissor.set(...v);},setScissorTest(v){state.scissorTest=v;},clear(){calls.push('clear');},render(){calls.push('render');}};
  const paint={renderer,size:512,ppm:8,level:{data:{triangles:new Float32Array(0)}},mat:new THREE.ShaderMaterial(),_emitGrowth(){},clear(){},flush(){},dispose(){}};
  const detail=new NativePaintDetail(paint);detail.select=()=>{};
  return {detail,paint,calls,state};
}

test('detail replay preserves attribute bytes and bounds projection-cache retention', () => {
  const {detail:d,paint}=detailFixture(), rng=random(11), T=paint.level.data.triangles=new Float32Array(900);
  for(let i=0;i<T.length;i+=3){T[i]=rng()*12;T[i+1]=0;T[i+2]=rng()*12;}
  const f={triangles:Array.from({length:100},(_,i)=>i),turf:true,origin:new THREE.Vector3(),u:new THREE.Vector3(1,0,0),v:new THREE.Vector3(0,0,1)};
  const plane={u:f.u,v:f.v,n:new THREE.Vector3(0,1,0),d:0};d.planeByFace.set(f,plane);d.drawing={plane,slot:0,x:0,z:0};
  const before={...d,triangle:new Float64Array(12),arrays:Object.fromEntries(Object.entries(d.arrays).map(([name,a])=>[name,new Float32Array(a.length)])),draw(){throw Error('unexpected capacity overflow');}};
  for(let frame=0;frame<40;frame++){
    d.vertexCount=before.vertexCount=0;const args=[f,0,8,0,8,rng(),rng(),0,1,1,rng(),frame%3,1,0,.2,frame*.01,.1,0];
    beforeTriangles.apply(before,args);d.triangles(...args);assert.equal(d.vertexCount,before.vertexCount);
    for(const [name,a]of Object.entries(d.arrays)){const size=d.geometry.getAttribute(name).itemSize;assert.deepEqual(a.slice(0,d.vertexCount*size),before.arrays[name].slice(0,d.vertexCount*size),name);}
  }
  const first=d._projectedTriangles(f,plane,T);assert.equal(first,d._projectedTriangles(f,plane,T));
  f.origin.x=.01;const shifted=d._projectedTriangles(f,plane,T);assert.notEqual(first,shifted,'basis mutation invalidates');
  assert.notEqual(shifted,d._projectedTriangles(f,plane,T.slice()),'source array replacement invalidates');
  for(let i=0;i<200;i++)d._projectedTriangles({...f,triangles:f.triangles.slice()},plane,T);
  assert.ok(d._projectionCache.size<=64);assert.ok(d._projectionBytes<=2*1024*1024);
  assert.equal(d._projectedTriangles({...f,triangles:new Uint32Array(14000)},plane,T),null,'oversized face uses bounded scratch path');
  d.clear();assert.equal(d._projectionBytes,0);assert.equal(d._projectionCache.size,0);d.dispose();paint.mat.dispose();
});

test('detail idle bypass publishes uniforms and active/failed flushes restore exact renderer state', () => {
  const {detail:d,paint,calls,state}=detailFixture();
  const original={target:state.target,face:state.face,mip:state.mip,color:state.color.clone(),alpha:state.alpha,viewport:state.viewport.clone(),scissor:state.scissor.clone(),scissorTest:state.scissorTest};
  const page={plane:{n:new THREE.Vector3(0,1,0),u:new THREE.Vector3(1,0,0),v:new THREE.Vector3(0,0,1),d:0},x:0,z:0,slot:0,ready:true,pending:new Map(),needsClear:false};d.slots[0]=page;
  for(let i=0;i<100;i++)d.flush();assert.equal(calls.length,0);assert.equal(d.uniforms.uNativeDetailPages.value[0].y,1);
  d.enabled=false;d.flush();assert.equal(d.uniforms.uNativeDetailPages.value[0].y,0);d.enabled=true;d.flush();assert.equal(d.uniforms.uNativeDetailPages.value[0].y,1);
  page.needsClear=true;d.flush();assert.deepEqual(calls,['target','clear','target']);
  assert.equal(state.target,original.target);assert.equal(state.face,original.face);assert.equal(state.mip,original.mip);assert.ok(state.color.equals(original.color));assert.equal(state.alpha,original.alpha);assert.ok(state.viewport.equals(original.viewport));assert.ok(state.scissor.equals(original.scissor));assert.equal(state.scissorTest,original.scissorTest);assert.equal(paint.renderer.autoClear,true);
  const callback=d.sink._pushQuad;page.pending.set(1,{g:{},tn:0,dT:1});d.emit=()=>{throw Error('synthetic draw failure');};
  assert.throws(()=>d.flush(),/synthetic draw failure/);assert.equal(d.sink._pushQuad,callback);assert.equal(state.target,original.target);assert.equal(state.face,2);assert.equal(state.mip,3);assert.equal(d.drawing,null);assert.equal(paint.renderer.autoClear,true);
  d.dispose();paint.mat.dispose();
});
