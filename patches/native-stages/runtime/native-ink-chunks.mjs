import * as THREE from 'three';

/** Rendering partition only: each original triangle appears once, with shared
 * source attributes and no clipped, simplified or regenerated positions. A
 * triangle crossing a tile boundary stays whole; its actual bounds control
 * culling. The tile size has no relation to retail collision or paint cells. */
export function partitionNativeInk(geometry,tileSize=16){
 if(!Number.isFinite(tileSize)||tileSize<=0)throw new RangeError('Invalid native ink tile size');
 const p=geometry.getAttribute('position'),groups=new Map(),point=new THREE.Vector3();
 if(geometry.index||p.count%3)throw new Error('Native ink partition requires complete non-indexed triangles');
 for(let i=0;i<p.count;i+=3){
  const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,y=(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
  const key=[Math.floor(x/tileSize),Math.floor(y/tileSize),Math.floor(z/tileSize)].join(',');
  let g=groups.get(key);if(!g){g={key,indices:[],bounds:new THREE.Box3()};groups.set(key,g);}
  for(let j=i;j<i+3;j++){g.indices.push(j);g.bounds.expandByPoint(point.set(p.getX(j),p.getY(j),p.getZ(j)));}
 }
 return [...groups.values()].map(({key,indices,bounds})=>{
  const g=new THREE.BufferGeometry();
  for(const [name,a] of Object.entries(geometry.attributes))g.setAttribute(name,a);
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(indices),1));
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
  constructor(geometry, material, tileSize = 16) {
    super(geometry, material);
    this.name = 'native-game-ink';
    this.tileSize = tileSize;
    this.receiveShadow = true;
    this._view = new THREE.Matrix4();
    this._frustum = new THREE.Frustum();
    this._faceCulling = true;
    this._ready = true;
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
      this.selectVisible(camera);
    };
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
    const chunks = partitionNativeInk(next, this.tileSize);
    this._detachPaint();
    this._disposeChunks();
    this._geometry = next;
    this.chunks = chunks;
    this._visible = new Uint8Array(chunks.length).fill(255);
    const triCount = next.getAttribute('position').count / 3;
    this._triangleTile = new Uint32Array(triCount);
    for (let tile = 0; tile < chunks.length; tile++) {
      const ix = chunks[tile].index;
      for (let j = 0; j < ix.count; j += 3) this._triangleTile[ix.getX(j) / 3] = tile;
    }

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
    this._runTiles = Uint32Array.from(tiles);
    this._runStarts = Uint32Array.from(starts);
    this._runEnds = Uint32Array.from(ends);
    // Many tiny interleaved runs make subarray construction more costly than
    // the original scalar loop. Use that loop only on highly fragmented maps.
    this._fragmentedRuns = tiles.length > triCount / 4;
    // Native TypedArray.set copies the visible original-index runs in bulk.
    // Its memory cost is explicit and stable, with no frame-time JS arrays.
    this._fullIndex = new Uint32Array(triCount * 3);
    for (let i = 0; i < this._fullIndex.length; i++) this._fullIndex[i] = i;
    this._drawIndex = new THREE.BufferAttribute(new Uint32Array(triCount * 3), 1)
      .setUsage(THREE.DynamicDrawUsage);
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
  bindPaint(paint) {
    this._detachPaint();
    if (!paint || typeof paint._pushQuad !== 'function' || typeof paint.clear !== 'function')
      throw new TypeError('Native ink paint binding requires a paint system');
    const mesh = this, push = paint._pushQuad, clear = paint.clear;
    this._painted = new Uint8Array(this.chunks.length);
    this._paintedCount = 0;
    this._bindFaces(paint);
    // Binding an already painted atlas must not hide previously stored ink.
    if (paint.grid?.some?.(value => value !== 0)) {
      this._painted.fill(1);
      this._paintedCount = this._painted.length;
      this._facePainted?.fill(1);
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
    return this;
  }

  clearPainted() {
    if (!this._painted) return;
    this._painted.fill(0);
    this._paintedCount = 0;
    this._facePainted?.fill(0);
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
    if (![loX, hiX, loY, hiY, loZ, hiZ].every(Number.isFinite)) {
      this._painted.fill(1);
      this._paintedCount = this._painted.length;
      this._lastViewValid = false;
      return;
    }
    let changed = false, intersectsSource = false;
    for (let i = 0; i < this.chunks.length; i++) {
      const b = this.chunks[i].boundingBox;
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

  /** Paint charts own disjoint padded atlas rects, and nativeInkGeometry emits
   * each chart's triangles contiguously in paintFaces order. A chart no quad
   * has reached has no ink texels, so its triangles need no draw. Any mismatch
   * leaves this map off and keeps the tile-only selection. */
  _bindFaces(paint) {
    this._faceIndex = this._faceStart = this._facePainted = null;
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
  }

  _markFace(face) {
    const painted = this._facePainted;
    if (!painted) return;
    const id = this._faceIndex.get(face);
    if (id === undefined) {
      // An atlas write outside the bound chart list: fail open to tiles.
      this._faceIndex = this._faceStart = this._facePainted = null;
    } else if (painted[id]) return;
    else painted[id] = 1;
    this._faceDirty = true;
    this._lastViewValid = false;
  }

  _detachPaint() {
    this._faceIndex = this._faceStart = this._facePainted = null;
    const binding = this._paintBinding;
    if (!binding) return;
    if (binding.paint._pushQuad === binding.wrappedPush) binding.paint._pushQuad = binding.push;
    if (binding.paint.clear === binding.wrappedClear) binding.paint.clear = binding.clear;
    this._paintBinding = null;
  }

  selectVisible(camera) {
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
    const index = this._drawIndex.array, full = this._fullIndex;
    if (faces) {
      // Painted charts in visible tiles, still in source triangle order.
      const starts = this._faceStart, tileOf = this._triangleTile, visible = this._visible;
      let count = 0;
      for (let face = 0; face < faces.length; face++) {
        if (!faces[face]) continue;
        for (let tri = starts[face], end = starts[face + 1]; tri < end; tri++) {
          if (!visible[tileOf[tri]]) continue;
          const i = tri * 3;
          index[count++] = i; index[count++] = i + 1; index[count++] = i + 2;
        }
      }
      this.geometry.setDrawRange(0, count);
      if (count) {
        this._drawIndex.clearUpdateRanges();
        this._drawIndex.addUpdateRange(0, count);
        this._drawIndex.needsUpdate = true;
      }
      this._fullDraw = false;
      return visibleCount;
    }
    if (visibleCount === this.chunks.length) {
      if (!this._fullDraw) {
        index.set(full);
        this._drawIndex.clearUpdateRanges();
        this._drawIndex.addUpdateRange(0, full.length);
        this._drawIndex.needsUpdate = true;
      }
      this.geometry.setDrawRange(0, full.length);
      this._fullDraw = true;
      return visibleCount;
    }

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
        index[count++] = i; index[count++] = i + 1; index[count++] = i + 2;
      }
    } else {
      let first = -1, last = 0;
      const tiles = this._runTiles, starts = this._runStarts, ends = this._runEnds;
      for (let k = 0; k < tiles.length; k++) {
        if (this._visible[tiles[k]]) {
          if (first === -1) { first = starts[k]; last = ends[k]; }
          else if (starts[k] === last) last = ends[k];
          else {
            index.set(full.subarray(first, last), count);
            count += last - first;
            first = starts[k]; last = ends[k];
          }
        } else if (first !== -1) {
          index.set(full.subarray(first, last), count);
          count += last - first;
          first = -1;
        }
      }
      if (first !== -1) {
        index.set(full.subarray(first, last), count);
        count += last - first;
      }
    }
    this.geometry.setDrawRange(0, count);
    this._drawIndex.clearUpdateRanges();
    this._drawIndex.addUpdateRange(0, count);
    this._drawIndex.needsUpdate = true;
    this._fullDraw = false;
    return visibleCount;
  }
  _disposeChunks() { for (const g of this.chunks || []) g.dispose(); this.chunks = []; }
  dispose() {
    this._detachPaint();
    this.removeFromParent();
    this._disposeChunks();
    this._geometry?.dispose();
    this._geometry = null;
    this._triangleTile = this._runTiles = this._runStarts = this._runEnds = this._fullIndex = null;
  }
}
