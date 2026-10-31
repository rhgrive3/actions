import * as THREE from 'three';
import {consumeNativeWork,consumeNativeWorkAsync} from './native-work.mjs';

// Reconstruct source-order runs directly into the existing GPU index array.
function writeIdentityRange(target, out, start, end) {
 for(let i=start;i<end;i++)target[out++]=i;
 return out;
}

// Keep every queued write until WebGL consumes it, even if a later selection
// temporarily removes that tail. It can become visible again without another
// CPU value change, so dropping pending ranges would expose stale GPU indices.
function publishIndexRange(attribute, dirty, count) {
 if(!count||dirty.start>=dirty.end)return;
 let start=dirty.start,end=dirty.end;
 for(const range of attribute.updateRanges){
  start=Math.min(start,range.start);end=Math.max(end,range.start+range.count);
 }
 const range=attribute._nativeUploadRange||(attribute._nativeUploadRange={start:0,count:0});
 range.start=start;range.count=end-start;
 attribute.updateRanges.length=0;attribute.updateRanges.push(range);
 attribute.needsUpdate=true;
}

/** Rendering partition only: each original triangle appears once, with shared
 * source attributes and no clipped, simplified or regenerated positions. A
 * triangle crossing a tile boundary stays whole; its actual bounds control
 * culling. The tile size has no relation to retail collision or paint cells. */
export function partitionNativeInk(geometry,tileSize=16,triangleTile=null,boundsOnly=false){return consumeNativeWork(partitionNativeInkSteps(geometry,tileSize,triangleTile,boundsOnly));}
function* partitionNativeInkSteps(geometry,tileSize=16,triangleTile=null,boundsOnly=false){
 if(!Number.isFinite(tileSize)||tileSize<=0)throw new RangeError('Invalid native ink tile size');
 const p=geometry.getAttribute('position'),groups=new Map();
 if(geometry.index||p.count%3)throw new Error('Native ink partition requires complete non-indexed triangles');
 // The in-game mesh needs just the tile mapping and bounds, not index arrays.
 const direct=triangleTile!==null;
 if(direct&&(!(triangleTile instanceof Uint32Array)||triangleTile.length!==p.count/3))throw new TypeError('Invalid native ink triangle-tile output');
 const proto=p.isInterleavedBufferAttribute?THREE.InterleavedBufferAttribute.prototype:THREE.BufferAttribute.prototype;
 const raw=!p.normalized&&!p.isFloat16BufferAttribute&&ArrayBuffer.isView(p.array)&&
  p.getX===proto.getX&&p.getY===proto.getY&&p.getZ===proto.getZ;
 const array=raw?p.array:null,stride=p.isInterleavedBufferAttribute?p.data.stride:p.itemSize,offset=p.isInterleavedBufferAttribute?p.offset:0;
 for(let i=0;i<p.count;i+=3){
  if(i&&i%768===0)yield;
  const ia=i*stride+offset,ib=ia+stride,ic=ib+stride;
  const ax=raw?array[ia]:p.getX(i),ay=raw?array[ia+1]:p.getY(i),az=raw?array[ia+2]:p.getZ(i);
  const bx=raw?array[ib]:p.getX(i+1),by=raw?array[ib+1]:p.getY(i+1),bz=raw?array[ib+2]:p.getZ(i+1);
  const cx=raw?array[ic]:p.getX(i+2),cy=raw?array[ic+1]:p.getY(i+2),cz=raw?array[ic+2]:p.getZ(i+2);
  const tx=Math.floor(((ax+bx+cx)/3)/tileSize),ty=Math.floor(((ay+by+cy)/3)/tileSize),tz=Math.floor(((az+bz+cz)/3)/tileSize);
  const key=tx>=-512&&tx<512&&ty>=-512&&ty<512&&tz>=-512&&tz<512
   ?(tx+512)|((ty+512)<<10)|((tz+512)<<20):tx+','+ty+','+tz;
  // Only diagnostic tile metadata needs a string; do not allocate one per
  // triangle. Keep the public nativeTile value and the original centroid math.
  let g=groups.get(key);if(!g){g={key:tx+','+ty+','+tz,indices:direct?null:[],bounds:new THREE.Box3(),tile:groups.size};groups.set(key,g);}
  if(direct)triangleTile[i/3]=g.tile;
  else g.indices.push(i,i+1,i+2);
  const {min,max}=g.bounds;
  min.x=Math.min(min.x,ax,bx,cx);min.y=Math.min(min.y,ay,by,cy);min.z=Math.min(min.z,az,bz,cz);
  max.x=Math.max(max.x,ax,bx,cx);max.y=Math.max(max.y,ay,by,cy);max.z=Math.max(max.z,az,bz,cz);
 }
 return [...groups.values()].map(({key,indices,bounds})=>{
  // Runtime tiles are culling metadata, never drawables. Public partitions
  // retain BufferGeometry ownership and their existing shared attributes.
  const g=boundsOnly&&direct?{userData:{}}:new THREE.BufferGeometry();
  if(!boundsOnly||!direct){
   for(const [name,a] of Object.entries(geometry.attributes))g.setAttribute(name,a);
   if(indices)g.setIndex(new THREE.BufferAttribute(new Uint32Array(indices),1));
  }
  // computeBoundingSphere() would include the entire shared attribute array.
  g.boundingBox=bounds;g.boundingSphere=bounds.getBoundingSphere(new THREE.Sphere());
  // Include the corners despite floating point cancellation at the sphere edge.
  g.boundingSphere.radius+=Math.max(1,g.boundingSphere.radius)*1e-7;g.userData.nativeTile=key;
  return g;
 });
}

/** One draw in original triangle order. Chunks only select indices for this
 * original Mesh. Attributes, full bounds, transparent sort position and material
 * stay intact, including where source triangles overlap across tile boundaries. */
export class NativeInkMesh extends THREE.Mesh {
  static async create(geometry,material,tileSize=16,options={},work={}){
    const triangleTile=new Uint32Array(geometry.getAttribute('position').count/3);
    const chunks=await consumeNativeWorkAsync(partitionNativeInkSteps(geometry,tileSize,triangleTile,true),work);
    return new NativeInkMesh(geometry,material,tileSize,{...options,preparedPartition:{geometry,triangleTile,chunks}});
  }
  constructor(geometry, material, tileSize = 16, {willBindPaint=false,preparedPartition=null} = {}) {
    super(geometry, material);
    this.name = 'native-game-ink';
    this.tileSize = tileSize;
    this.receiveShadow = true;
    this._view = new THREE.Matrix4();
    this._frustum = new THREE.Frustum();
    this._faceCulling = true;
    this._ready = true;
    this._deferRunTables=willBindPaint;
    this._preparedPartition=preparedPartition;
    this.geometry = geometry;
    this.onBeforeRender = (_renderer, scene, camera) => {
      // GTAO normal/depth override must not render transparent paint as opaque.
      // Restore the last colour range *before* the camera-cache fast path.
      if (scene?.overrideMaterial) {
        if (!this._overrideHidden) this._colourDrawCount = this.geometry.drawRange.count;
        this._overrideHidden = true;
        this.geometry.setDrawRange(0, 0);
        return;
      }
      if (this._overrideHidden) {
        this._overrideHidden = false;
        this.geometry.setDrawRange(0, this._colourDrawCount);
      }
      if(this._stencilMask)this.material.stencilWrite=!!_renderer?.getRenderTarget?.()?.stencilBuffer;
      this.selectVisible(camera);
    };
  }
  _ensureRunTables() {
    if(this._runTiles)return;
    const triCount=this._triangleTile.length;
    // The source is non-indexed. Precompute ascending contiguous runs in
    // *source triangle order*, never in tile order: transparent overlay
    // blending depends on the original draw order.
    const tiles = [], starts = [], ends = [];
    for (let start = 0; start < triCount;) {
      const tile = this._triangleTile[start];
      let end = start + 1;
      while (end < triCount && this._triangleTile[end] === tile) end++;
      tiles.push(tile); starts.push(start * 3); ends.push(end * 3);
      start = end;
    }
    this._runTiles = this._triangleTile.constructor.from(tiles);
    this._runStarts = Uint32Array.from(starts);
    this._runEnds = Uint32Array.from(ends);
    // Many tiny interleaved runs make subarray construction more costly than
    // the original scalar loop. Use that loop only on highly fragmented maps.
    this._fragmentedRuns = tiles.length > triCount / 4;
  }
  get geometry() { return this._geometry; }
  /** Diagnostic switch: false restores tile-only selection for A/B checks. */
  get faceCulling() { return this._faceCulling; }
  set faceCulling(value) {
    this._faceCulling = !!value;
    this._faceDirty = true;
    this._lastViewValid = false;
  }
  set geometry(next) {
    if (!this._ready) { this._geometry = next; return; }
    const triCount = next.getAttribute('position').count / 3;
    const prepared=this._preparedPartition;this._preparedPartition=null;
    const triangleTile = prepared?.geometry===next?prepared.triangleTile:new Uint32Array(triCount);
    const chunks = prepared?.geometry===next?prepared.chunks:partitionNativeInk(next, this.tileSize,triangleTile,true);
    this._detachPaint();
    this._disposeChunks();
    this._geometry = next;
    this.chunks = chunks;
    this._visible = new Uint8Array(chunks.length).fill(255);
    // Tile IDs have a smaller domain than vertex offsets. Keep the public
    // partition output Uint32, then narrow only after the actual tile count.
    const TileArray=chunks.length<=65536?Uint16Array:Uint32Array;
    this._triangleTile = TileArray===Uint16Array?new Uint16Array(triangleTile):triangleTile;

    // The source is non-indexed. Precompute ascending contiguous runs in
    // *source triangle order*, never in tile order: transparent overlay
    // blending depends on the original draw order.
    // No source-order run storage while painted chunks are known empty.
    this._runTiles = this._runStarts = this._runEnds = null;
    this._fragmentedRuns = false;
    if (!this._deferRunTables) this._ensureRunTables();
    // No retained full-size identity index: avoid doubling this GPU buffer.
    this._drawIndex = new THREE.BufferAttribute(new Uint32Array(triCount * 3), 1)
      .setUsage(THREE.DynamicDrawUsage);
    this._indexDirty={start:Infinity,end:0};
    next.setIndex(this._drawIndex);
    this._lastView = new Float64Array(16);
    this._lastViewValid = false;
    this._lastCoordinateSystem = undefined;
    this._lastReversedDepth = undefined;
    this._lastVisibleCount = 0;
    this._fullDraw = false;
    // Null means no paint binding (existing callers keep full geometry).
    this._painted = null;
    this._paintedCount = 0;
    this._overrideHidden = false;
    this._colourDrawCount = 0;
  }

  /** Bind only this native world's paint instance, never global prototypes. */
  bindPaint(paint, { knownEmpty = false } = {}) {
    this._detachPaint();
    if (!paint || typeof paint._pushQuad !== 'function' || typeof paint.clear !== 'function')
      throw new TypeError('Native ink paint binding requires a paint system');
    const mesh = this, push = paint._pushQuad, clear = paint.clear;
    this._painted = new Uint8Array(this.chunks.length);
    this._paintedCount = 0;
    this._bindFaces(paint);
    // Binding an already painted atlas must not hide previously stored ink.
    if (!knownEmpty && paint.grid?.some?.(value => value !== 0)) {
      this._painted.fill(1);
      this._paintedCount = this._painted.length;
      this._facePainted?.fill(1);this._paintedFaceWords?.fill(0xffffffff);
    }
    this._lastViewValid = false;
    this._visible.fill(255);
    const wrappedPush = function(f, u0, u1, v0, v1) {
      const result = push.apply(this, arguments);
      const a = f?.atlas;
      if (a) {
        const pad = (a.pad - 0.5) / a.ppm;
        const minU = Math.max(-pad, u0), maxU = Math.min(f.su + pad, u1);
        const minV = Math.max(-pad, v0), maxV = Math.min(f.sv + pad, v1);
        if (minU < maxU && minV < maxV) {
          mesh._markFace(f);
          mesh._markPaintBounds(f, minU, maxU, minV, maxV);
        }
      }
      return result;
    };
    const wrappedClear = function() {
      const result = clear.apply(this, arguments);
      mesh.clearPainted();
      return result;
    };
    paint._pushQuad = wrappedPush;
    paint.clear = wrappedClear;
    this._paintBinding = { paint, push, clear, wrappedPush, wrappedClear };
    this._installStencilMask(paint.renderer);
    return this;
  }

  // Reject unpainted pixels with fixed-function stencil before the expensive
  // physical ink shader. Its derivative instructions remain in their original
  // order: surviving fragment quads still get the GPU's helper invocations.
  // Targets without stencil (notably water reflections) use the original draw.
  _installStencilMask(renderer){
    if(this._stencilMask||!renderer||!this.material.userData?.uniforms?.uPaint)return;
    const owner=this,uniforms={uPaint:{value:null}};
    const material=new THREE.ShaderMaterial({
      uniforms,
      vertexShader:'attribute vec2 paintUv; varying vec2 vPaintUv; void main(){ vPaintUv=paintUv; vec4 mvPosition=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mvPosition; }',
      fragmentShader:'uniform sampler2D uPaint; varying vec2 vPaintUv; void main(){ if(texture2D(uPaint,vPaintUv).a<0.015)discard; gl_FragColor=vec4(0.0); }',
      transparent:true,colorWrite:false,depthWrite:false,depthTest:true,toneMapped:false,
      polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
      stencilWrite:true,stencilWriteMask:1,stencilFunc:THREE.AlwaysStencilFunc,stencilRef:1,
      stencilFail:THREE.KeepStencilOp,stencilZFail:THREE.KeepStencilOp,stencilZPass:THREE.ReplaceStencilOp,
    });
    const detail=this.material.userData.nativePaintDetail;
    if(detail){
      Object.assign(uniforms,detail.uniforms);
      material.vertexShader='attribute vec2 paintUv; varying vec2 vPaintUv; varying vec3 vWPos; varying vec3 vWNorm; void main(){vPaintUv=paintUv;vWPos=(modelMatrix*vec4(position,1.0)).xyz;vWNorm=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
      material.fragmentShader=detail.decorate('uniform sampler2D uPaint; varying vec2 vPaintUv; varying vec3 vWPos; varying vec3 vWNorm; ',true);
    }
    Object.defineProperty(material,'visible',{configurable:true,get(){return !!renderer.getRenderTarget?.()?.stencilBuffer;}});
    const mask=new THREE.Mesh(this.geometry,material);
    // Quality changes replace the owner's atlas geometry. Share its current
    // geometry/index at lookup time, including during render-list collection.
    Object.defineProperty(mask,'geometry',{configurable:true,get(){return owner.geometry;}});
    mask.name='native-ink-stencil';mask.renderOrder=-1;mask.matrixAutoUpdate=false;
    mask.onBeforeRender=(r,scene,camera)=>{
      owner.onBeforeRender(r,scene,camera);
      uniforms.uPaint.value=owner.material.userData.uniforms.uPaint.value;
    };
    this.material.stencilFunc=THREE.EqualStencilFunc;this.material.stencilRef=1;
    this.material.stencilFuncMask=1;this.material.stencilWriteMask=0;
    this.material.stencilFail=this.material.stencilZFail=this.material.stencilZPass=THREE.KeepStencilOp;
    this._stencilMask=mask;this.add(mask);
  }

  clearPainted() {
    this._lastPaintBounds=null;
    if (!this._painted) return;
    this._painted.fill(0);
    this._paintedCount = 0;
    this._facePainted?.fill(0);this._paintedFaceWords?.fill(0);
    this._faceDirty = true;
    this._lastViewValid = false;
    this._visible.fill(255);
  }

  _markPaintBounds(face, u0, u1, v0, v1) {
    if (!this._painted || this._paintedCount === this.chunks.length) return;
    const { origin: o, u, v } = face;
    // Paint and collision use the same local-space face basis. Every chunk
    // contains complete triangle bounds, not just its centroid tile: AABB
    // overlap is conservative even for a triangle crossing many 16m tiles.
    if (!o || !u || !v) {
      this._painted.fill(1);
      this._paintedCount = this._painted.length;
      this._lastViewValid = false;
      return;
    }
    const loX = o.x + Math.min(u.x * u0, u.x * u1) + Math.min(v.x * v0, v.x * v1) - 0.05;
    const hiX = o.x + Math.max(u.x * u0, u.x * u1) + Math.max(v.x * v0, v.x * v1) + 0.05;
    const loY = o.y + Math.min(u.y * u0, u.y * u1) + Math.min(v.y * v0, v.y * v1) - 0.05;
    const hiY = o.y + Math.max(u.y * u0, u.y * u1) + Math.max(v.y * v0, v.y * v1) + 0.05;
    const loZ = o.z + Math.min(u.z * u0, u.z * u1) + Math.min(v.z * v0, v.z * v1) - 0.05;
    const hiZ = o.z + Math.max(u.z * u0, u.z * u1) + Math.max(v.z * v0, v.z * v1) + 0.05;
    if (!(Number.isFinite(loX)&&Number.isFinite(hiX)&&Number.isFinite(loY)&&Number.isFinite(hiY)&&Number.isFinite(loZ)&&Number.isFinite(hiZ))) {
      this._painted.fill(1);
      this._paintedCount = this._painted.length;
      this._lastViewValid = false;
      return;
    }
    const cacheable=!!this._faceIndex?.has(face),memo=this._lastPaintBounds;
    if(cacheable&&memo&&memo.geometry===this.geometry&&memo.chunks===this.chunks&&memo.binding===this._paintBinding&&
        memo.loX===loX&&memo.hiX===hiX&&memo.loY===loY&&memo.hiY===hiY&&memo.loZ===loZ&&memo.hiZ===hiZ)return;
    if(cacheable){const next=this._lastPaintBounds ||= {};next.geometry=this.geometry;next.chunks=this.chunks;next.binding=this._paintBinding;next.loX=loX;next.hiX=hiX;next.loY=loY;next.hiY=hiY;next.loZ=loZ;next.hiZ=hiZ;}
    let changed = false, intersectsSource = false;
    const list = this._faceChunks(face), count = list ? list.length : this.chunks.length;
    for (let k = 0; k < count; k++) {
      const i = list ? list[k] : k, b = this.chunks[i].boundingBox;
      if (loX > b.max.x || hiX < b.min.x || loY > b.max.y || hiY < b.min.y ||
          loZ > b.max.z || hiZ < b.min.z) continue;
      intersectsSource = true;
      if (this._painted[i]) continue;
      this._painted[i] = 1;
      this._paintedCount++;
      changed = true;
    }
    // If exporter paint/geometry coordinates ever diverge, favour visible
    // ink over performance. A conservative full draw is never a paint bug.
    if (!intersectsSource && this.chunks.length) {
      this._painted.fill(1);
      this._paintedCount = this._painted.length;
      changed = true;
    }
    if (changed) this._lastViewValid = false;
  }

  /** #1671: every quad the paint wrapper marks is clamped to its face's
   * padded rect [-pad, su + pad] x [-pad, sv + pad], and the bound arithmetic
   * above is monotone in u0..v1, so a quad box lies inside the box of that
   * whole rect. A chunk the quad overlaps therefore overlaps the rect box:
   * visiting only those chunks, in index order, marks the same chunks and
   * finds the same intersectsSource. The list is keyed by the rect box's own
   * values, so a moved or re-laid-out face recomputes it; null scans all. */
  _faceChunks(face) {
    const a = face.atlas, o = face.origin, u = face.u, v = face.v;
    if (!a) return null;
    const pad = (a.pad - 0.5) / a.ppm, u0 = -pad, u1 = face.su + pad, v0 = -pad, v1 = face.sv + pad;
    const loX = o.x + Math.min(u.x * u0, u.x * u1) + Math.min(v.x * v0, v.x * v1) - 0.05;
    const hiX = o.x + Math.max(u.x * u0, u.x * u1) + Math.max(v.x * v0, v.x * v1) + 0.05;
    const loY = o.y + Math.min(u.y * u0, u.y * u1) + Math.min(v.y * v0, v.y * v1) - 0.05;
    const hiY = o.y + Math.max(u.y * u0, u.y * u1) + Math.max(v.y * v0, v.y * v1) + 0.05;
    const loZ = o.z + Math.min(u.z * u0, u.z * u1) + Math.min(v.z * v0, v.z * v1) - 0.05;
    const hiZ = o.z + Math.max(u.z * u0, u.z * u1) + Math.max(v.z * v0, v.z * v1) + 0.05;
    if (!(u0 < u1 && v0 < v1) || !(Number.isFinite(loX)&&Number.isFinite(hiX)&&Number.isFinite(loY)&&Number.isFinite(hiY)&&Number.isFinite(loZ)&&Number.isFinite(hiZ))) return null;
    const lists = this._faceChunkLists || (this._faceChunkLists = new Map());
    const e = lists.get(face);
    if (e && e.chunks === this.chunks && e.loX === loX && e.hiX === hiX && e.loY === loY && e.hiY === hiY && e.loZ === loZ && e.hiZ === hiZ) return e.list;
    const list = [];
    for (let i = 0; i < this.chunks.length; i++) {
      const b = this.chunks[i].boundingBox;
      if (loX > b.max.x || hiX < b.min.x || loY > b.max.y || hiY < b.min.y || loZ > b.max.z || hiZ < b.min.z) continue;
      list.push(i);
    }
    lists.set(face, { chunks: this.chunks, loX, hiX, loY, hiY, loZ, hiZ, list });
    return list;
  }

  /** Paint charts own disjoint padded atlas rects, and nativeInkGeometry emits
   * each chart's triangles contiguously in paintFaces order. A chart no quad
   * has reached has no ink texels, so its triangles need no draw. Any mismatch
   * leaves this map off and keeps the tile-only selection. */
  _bindFaces(paint) {
    this._faceIndex = this._faceStart = this._facePainted = this._paintedFaceWords = null;
    this._faceDirty = true;
    const triangles = this._triangleTile.length, index = new Map(), starts = [0];
    for (const f of paint.paintFaces || []) {
      if (!f?.atlas || !f.triangles) continue;
      if (index.has(f)) return;
      index.set(f, starts.length - 1);
      starts.push(starts[starts.length - 1] + f.triangles.length);
    }
    if (starts[starts.length - 1] !== triangles) return;
    this._faceIndex = index;
    this._faceStart = Uint32Array.from(starts);
    this._facePainted = new Uint8Array(index.size);
    this._paintedFaceWords = new Uint32Array(Math.ceil(index.size/32));
  }

  _markFace(face) {
    const painted = this._facePainted;
    if (!painted) return;
    const id = this._faceIndex.get(face);
    if (id === undefined) {
      // An atlas write outside the bound chart list: fail open to tiles.
      this._faceIndex = this._faceStart = this._facePainted = this._paintedFaceWords = null;
    } else if (painted[id]) return;
    else {
      painted[id] = 1;
      this._paintedFaceWords[id>>>5]|=1<<(id&31);
      // A newly painted chart outside the already selected visible tiles
      // does not change today's draw index; keep the bit for a future view.
      if (!this._faceCulling) return;
      if (!this._faceDirty) {
        let visible = false;
        for (let tri = this._faceStart[id], end = this._faceStart[id+1]; tri < end; tri++) {
          if (this._visible[this._triangleTile[tri]]) { visible = true; break; }
        }
        if (!visible) return;
      }
    }
    this._faceDirty = true;
    this._lastViewValid = false;
  }

  _detachPaint() {
    this._lastPaintBounds=null;
    // A face-list entry retains its face, chunks and their shared attributes.
    // Keep this cache within one paint binding/geometry lifetime.
    this._faceChunkLists=null;
    this._faceIndex = this._faceStart = this._facePainted = this._paintedFaceWords = null;
    const binding = this._paintBinding;
    if (!binding) return;
    if (binding.paint._pushQuad === binding.wrappedPush) binding.paint._pushQuad = binding.push;
    if (binding.paint.clear === binding.wrappedClear) binding.paint.clear = binding.clear;
    this._paintBinding = null;
  }

  selectVisible(camera) {
    // No chart has reached the atlas yet (or paint was cleared). There are
    // no ink vertices to select, regardless of the camera or stage transform.
    // Keep the view invalid so the first paint always evaluates its current
    // camera, including after an AO override or a camera move while empty.
    if (this._painted !== null && this._paintedCount === 0) {
      this.geometry.setDrawRange(0, 0);
      this._lastVisibleCount = 0;
      this._fullDraw = false;
      this._lastViewValid = false;
      return 0;
    }
    // World transform and renderer depth convention are part of the
    // frustum contract, including transformed stage objects and reverse Z.
    this._view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .multiply(this.matrixWorld);
    const elements = this._view.elements, previous = this._lastView;
    let same = this._lastViewValid &&
      this._lastCoordinateSystem === camera.coordinateSystem &&
      this._lastReversedDepth === camera.reversedDepth;
    if (same) {
      for (let i = 0; i < 16; i++) {
        if (!Object.is(elements[i], previous[i])) { same = false; break; }
      }
    }
    if (same && !this._faceDirty) return this._lastVisibleCount;
    for (let i = 0; i < 16; i++) previous[i] = elements[i];
    this._lastViewValid = true;
    this._lastCoordinateSystem = camera.coordinateSystem;
    this._lastReversedDepth = camera.reversedDepth;
    this._frustum.setFromProjectionMatrix(
      this._view, camera.coordinateSystem, camera.reversedDepth
    );

    let changed = false, visibleCount = 0;
    for (let tile = 0; tile < this.chunks.length; tile++) {
      const visible = (this._painted === null || this._painted[tile]) &&
        this._frustum.intersectsSphere(this.chunks[tile].boundingSphere) ? 1 : 0;
      if (visible !== this._visible[tile]) changed = true;
      this._visible[tile] = visible;
      visibleCount += visible;
    }
    this._lastVisibleCount = visibleCount;
    const faces = this._faceCulling ? this._facePainted : null;
    const paintOnly = !changed && this._faceDirty;
    if (this._faceDirty) changed = true;
    this._faceDirty = false;
    // Moving a camera without changing the visible set never re-uploads
    // indices. Zero visible indices require only a drawRange update.
    if (!changed) return visibleCount;
    if (visibleCount === 0) {
      this.geometry.setDrawRange(0, 0);
      this._fullDraw = false;
      return 0;
    }
    const index = this._drawIndex.array;
    const dirty=this._indexDirty;dirty.start=Infinity;dirty.end=0;
    if (faces) {
      // Painted charts in visible tiles, still in source triangle order.
      const starts = this._faceStart, tileOf = this._triangleTile, visible = this._visible;
      let count = 0;
      // Most paint stamps append source-ordered charts without changing tile
      // visibility. Compare only that path; moving-camera rebuilds retain the
      // original loop and its cost even when the whole index list changes.
      if(paintOnly){
      for(let wordIndex=0;wordIndex<this._paintedFaceWords.length;wordIndex++){
        let word=this._paintedFaceWords[wordIndex];
        while(word){
        const bit=31-Math.clz32(word&-word),face=wordIndex*32+bit;word=(word&(word-1))>>>0;
        if(face>=faces.length)continue;
        for (let tri = starts[face], end = starts[face + 1]; tri < end; tri++) {
          if (!visible[tileOf[tri]]) continue;
          const i = tri * 3;
          if(dirty.start===Infinity){
            if(index[count]===i&&index[count+1]===i+1&&index[count+2]===i+2){count+=3;continue;}
            dirty.start=count;
          }
          index[count++]=i;index[count++]=i+1;index[count++]=i+2;
        }
        }
      }
      }else{
        dirty.start=0;
      for(let wordIndex=0;wordIndex<this._paintedFaceWords.length;wordIndex++){
        let word=this._paintedFaceWords[wordIndex];
        while(word){
        const bit=31-Math.clz32(word&-word),face=wordIndex*32+bit;word=(word&(word-1))>>>0;
        if(face>=faces.length)continue;
        for (let tri = starts[face], end = starts[face + 1]; tri < end; tri++) {
          if (!visible[tileOf[tri]]) continue;
          const i = tri * 3;
          index[count++]=i;index[count++]=i+1;index[count++]=i+2;
        }
        }
      }
      }
      this.geometry.setDrawRange(0, count);
      if(dirty.start!==Infinity)dirty.end=count;
      publishIndexRange(this._drawIndex,dirty,count);
      this._fullDraw = false;
      return visibleCount;
    }
    if (visibleCount === this.chunks.length) {
      if (!this._fullDraw) {
        writeIdentityRange(index,0,0,index.length);
        dirty.start=0;dirty.end=index.length;
        publishIndexRange(this._drawIndex,dirty,index.length);
      }
      this.geometry.setDrawRange(0, index.length);
      this._fullDraw = true;
      return visibleCount;
    }

    this._ensureRunTables();
    // Coalesce adjacent *visible source-order runs*, even if their tiles
    // differ. This can reduce thousands of scalar writes to a few
    // TypedArray.set operations without changing triangle order.
    let count = 0;
    if (this._fragmentedRuns) {
      // Scalar fallback preserves original performance when source triangles
      // alternate tiles too frequently for contiguous bulk writes.
      for (let tri = 0; tri < this._triangleTile.length; tri++) {
        if (!this._visible[this._triangleTile[tri]]) continue;
        const i = tri * 3;
        index[count++]=i;index[count++]=i+1;index[count++]=i+2;
      }
    } else {
      let first = -1, last = 0;
      const tiles = this._runTiles, starts = this._runStarts, ends = this._runEnds;
      for (let k = 0; k < tiles.length; k++) {
        if (this._visible[tiles[k]]) {
          if (first === -1) { first = starts[k]; last = ends[k]; }
          else if (starts[k] === last) last = ends[k];
          else {
            count=writeIdentityRange(index,count,first,last);
            first = starts[k]; last = ends[k];
          }
        } else if (first !== -1) {
          count=writeIdentityRange(index,count,first,last);
          first = -1;
        }
      }
      if (first !== -1) {
        count=writeIdentityRange(index,count,first,last);
      }
    }
    this.geometry.setDrawRange(0, count);
    dirty.start=0;dirty.end=count;
    publishIndexRange(this._drawIndex,dirty,count);
    this._fullDraw = false;
    return visibleCount;
  }
  _disposeChunks() { for (const g of this.chunks || []) g.dispose?.(); this.chunks = []; }
  dispose() {
    this._detachPaint();
    if(this._stencilMask){this._stencilMask.removeFromParent();this._stencilMask.material.dispose();this._stencilMask=null;}
    this.removeFromParent();
    this._disposeChunks();
    this._geometry?.dispose();
    this._geometry = null;
    this._triangleTile = this._runTiles = this._runStarts = this._runEnds = null;
    this._drawIndex = this._visible = this._painted = null;
    this._indexDirty = null;
    this._paintedCount = 0;
  }
}
