import * as THREE from 'three';
import { G } from '../../../src/core/ctx.js';
import { paintShapeSeed } from '../../splatoon3/runtime/paint-ownership.mjs';

// A fixed 4 MiB texture, independent of the number of source charts.
// The coarse atlas retains the whole world. Visible floor tiles
// replay the very same splat shader onto the original source triangles.
export const NATIVE_DETAIL_SIZE = 1024;
export const NATIVE_DETAIL_TILE = 256;
export const NATIVE_DETAIL_PPM = 30;
const SIDE = 8, PAD = 8, SLOTS = 16, RECORD_BUDGET = 128, VERTEX_LIMIT = 32766;
const GUARD = PAD / NATIVE_DETAIL_PPM;
const floorSurface = f => f?.triangles && f.turf;

// Static projection data is useful while replaying growing splats, but the
// unbounded 160-byte-per-triangle proposal can retain hundreds of megabytes.
// Keep a per-detail FIFO with both byte and face limits; oversized charts use
// the same reusable scratch path. Native source geometry is immutable for the
// level lifetime; replacing arrays, face bases or planes invalidates a record.
const PROJECTION_CACHE_BYTES = 2 * 1024 * 1024, PROJECTION_CACHE_FACES = 64;
function projectDetailTriangle(out, base, id, f, plane, T) {
  let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity,minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(let k=0;k<3;k++){
    const n=id*9+k*3,x=T[n],y=T[n+1],z=T[n+2],dx=x-f.origin.x,dy=y-f.origin.y,dz=z-f.origin.z;
    const u=dx*f.u.x+dy*f.u.y+dz*f.u.z,v=dx*f.v.x+dy*f.v.y+dz*f.v.z;
    const a=x*plane.u.x+y*plane.u.y+z*plane.u.z,b=x*plane.v.x+y*plane.v.y+z*plane.v.z;
    const q=base+k*4;out[q]=a;out[q+1]=b;out[q+2]=u;out[q+3]=v;
    minU=Math.min(minU,u);maxU=Math.max(maxU,u);minV=Math.min(minV,v);maxV=Math.max(maxV,v);
    minX=Math.min(minX,a);maxX=Math.max(maxX,a);minZ=Math.min(minZ,b);maxZ=Math.max(maxZ,b);
  }
  out[base+12]=minU;out[base+13]=maxU;out[base+14]=minV;out[base+15]=maxV;
  out[base+16]=minX;out[base+17]=maxX;out[base+18]=minZ;out[base+19]=maxZ;
}
function sameProjectionFrame(frame,f,plane) {
  return frame[0]===f.origin.x&&frame[1]===f.origin.y&&frame[2]===f.origin.z&&
    frame[3]===f.u.x&&frame[4]===f.u.y&&frame[5]===f.u.z&&frame[6]===f.v.x&&frame[7]===f.v.y&&frame[8]===f.v.z&&
    frame[9]===plane.u.x&&frame[10]===plane.u.y&&frame[11]===plane.u.z&&frame[12]===plane.v.x&&frame[13]===plane.v.y&&frame[14]===plane.v.z;
}

export function enableNativePaintDetail(paint) {
  if (paint.nativeDetail) return paint.nativeDetail;
  if (!paint.level?.native || !paint.mat || !paint.renderer?.getContext || !paint._emitGrowth) return null;
  return paint.nativeDetail = new NativePaintDetail(paint);
}

export class NativePaintDetail {
  constructor(paint) {
    this.paint = paint;
    this.pages = new Map(); this.records = new WeakMap(); this.serial = 0;
    this.planes = new Map(); this.planeByFace = new WeakMap();
    this.slots = Array(SLOTS).fill(null); this.dirtySelection = true;
    this.focus = new THREE.Vector3(); this.selectionKey = '';
    this.uniforms = {
      uNativeDetailPaint: { value: null },
      uNativeDetailPages: { value: Array.from({ length: SLOTS }, () => new THREE.Vector4()) },
      uNativeDetailU: { value: Array.from({ length: SLOTS }, () => new THREE.Vector4()) },
      uNativeDetailV: { value: Array.from({ length: SLOTS }, () => new THREE.Vector4()) },
      uNativeBaseSize: { value: paint.size }, uNativeBasePpm: { value: paint.ppm },
    };
    this.enabled = true;
    this.emit = paint._emitGrowth;
    const detail = this, release = paint._releaseSplatGrowth, clear = paint.clear, dispose = paint.dispose, flush = paint.flush;
    paint._emitGrowth = function(g, tn, dT, dripOnly, bodyOnly) {
      const result = detail.emit.apply(this, arguments);
      if (!dripOnly) detail.record(g, tn, dT);
      return result;
    };
    paint._releaseSplatGrowth = function(g) { detail.records.delete(g); return release?.apply(this, arguments); };
    paint.clear = function() { const result = clear.apply(this, arguments); detail.clear(); return result; };
    paint.flush = function() { const result = flush.apply(this, arguments); detail.flush(); return result; };
    paint.dispose = function() { detail.dispose(); return dispose.apply(this, arguments); };
    this.restore = () => {
      paint._emitGrowth = this.emit; paint._releaseSplatGrowth = release;
      paint.clear = clear; paint.flush = flush; paint.dispose = dispose;
    };
    this.sink = Object.create(paint);
    this._drawTriangles=this.triangles.bind(this);
    this._savedColor=new THREE.Color();this._savedViewport=new THREE.Vector4();this._savedScissor=new THREE.Vector4();
    this._projectionCache=new Map();this._projectionBytes=0;
    this.target = new THREE.WebGLRenderTarget(NATIVE_DETAIL_SIZE, NATIVE_DETAIL_SIZE, {
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: false, stencilBuffer: false,
    });
    this.uniforms.uNativeDetailPaint.value = this.target.texture;
    paint.renderer.initRenderTarget?.(this.target);
    this.material = paint.mat.clone(); this.material.uniforms = paint.mat.uniforms;
    this.material.toneMapped = false;
    this.geometry = new THREE.BufferGeometry();
    this.arrays = {};
    for (const [name, size] of [['aPos',2],['aLocal',3],['aSplat',4],['aStretch',3],['aGrow',4]]) {
      const array = this.arrays[name] = new Float32Array(VERTEX_LIMIT * size);
      this.geometry.setAttribute(name, new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage));
    }
    this.mesh = new THREE.Mesh(this.geometry, this.material); this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.mesh); this.camera = new THREE.Camera();
    this.vertexCount = 0;
    this.triangle = new Float64Array(20);
    this.clear();
  }

  record(g, tn, dT) {
    if (this.disposed || !g.entries?.length || !Number.isFinite(g.R) || g.R<=0) return;
    let record = this.records.get(g);
    if (!record || record.g.R !== g.R || record.g.seed !== g.seed || record.g.kind !== g.kind || record.g.team !== g.team || record.entryLength !== g.entries.length) {
      // No actor, pooled growth object or mutable entry array survives here.
      const step = g.entryStride === 8 ? 8 : 7, entries = [];
      for (let i = 0; i < g.entries.length; i += step)
        if (floorSurface(g.entries[i])) entries.push(...g.entries.slice(i, i + step));
      if (!entries.length) return;
      record = { id: ++this.serial, entryLength: g.entries.length, tn, dT, pages: [],
        g: { R:g.R, seed:g.seed, kind:g.kind, team:g.team, dripDur:0,
          entries, entryStride:step, entryRadius:g.entryRadius, paintOrder:0, netOrderId:0 } };
      this.records.set(g, record);
      this.sink._pushQuad = (f,u0,u1,v0,v1) => this.index(record, f, u0,u1,v0,v1);
      this.emit.call(this.sink, record.g, 3, 1, false);
    }
    record.tn = Math.max(record.tn, tn); record.dT = Math.max(record.dT, dT);
    for (const page of record.pages) if (page.slot >= 0) page.pending.set(record.id, record);
  }

  index(record, f, u0,u1,v0,v1) {
    if(!Number.isFinite(u0+u1+v0+v1))return;
    u0=Math.max(0,u0);u1=Math.min(f.su,u1);v0=Math.max(0,v0);v1=Math.min(f.sv,v1);
    if (u1<=u0 || v1<=v0) return;
    let plane=this.planeByFace.get(f);
    if(!plane){
      const d=f.origin.dot(f.n),key=[f.n.x,f.n.y,f.n.z,...f.u.toArray(),d].map((v,i)=>Math.round(v*(i===6?1000:10000))).join(',');
      plane=this.planes.get(key);
      if(!plane){plane={key,u:f.u,v:f.v,n:f.n,d};this.planes.set(key,plane);}
      this.planeByFace.set(f,plane);
    }
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(const u of [u0,u1])for(const v of [v0,v1]){
      const x=f.origin.x+f.u.x*u+f.v.x*v,y=f.origin.y+f.u.y*u+f.v.y*v,z=f.origin.z+f.u.z*u+f.v.z*v;
      const a=x*plane.u.x+y*plane.u.y+z*plane.u.z,b=x*plane.v.x+y*plane.v.y+z*plane.v.z;
      minX=Math.min(minX,a);maxX=Math.max(maxX,a);minZ=Math.min(minZ,b);maxZ=Math.max(maxZ,b);
    }
    // Populate neighbour guards too: cubic reconstruction must see the same
    // original coverage on both sides of a virtual-tile boundary.
    const loX=Math.floor((minX-GUARD)/SIDE),hiX=Math.floor((maxX+GUARD-1e-9)/SIDE),loZ=Math.floor((minZ-GUARD)/SIDE),hiZ=Math.floor((maxZ+GUARD-1e-9)/SIDE);
    this.focus.copy(f.origin).addScaledVector(f.u,(u0+u1)/2).addScaledVector(f.v,(v0+v1)/2);
    for(let x=loX;x<=hiX;x++)for(let z=loZ;z<=hiZ;z++){
      const key=plane.key+','+x+','+z;
      let page=this.pages.get(key);
      if(!page){
        const center=new THREE.Vector3().copy(plane.n).multiplyScalar(plane.d).addScaledVector(plane.u,x*SIDE+SIDE/2).addScaledVector(plane.v,z*SIDE+SIDE/2);
        page={key,x:x*SIDE,z:z*SIDE,plane,center,records:new Map(),pending:new Map(),slot:-1,ready:false};this.pages.set(key,page);this.dirtySelection=true;
      }
      if(!page.records.has(record.id)){page.records.set(record.id,record);record.pages.push(page);}
    }
  }

  select() {
    const p=this.paint.viewPos || G.camera?.position || this.focus, key=Math.floor(p.x/2)+','+Math.floor(p.y/2)+','+Math.floor(p.z/2);
    if(!this.dirtySelection && key===this.selectionKey)return;
    this.dirtySelection=false;this.selectionKey=key;
    const pages=[...this.pages.values()];
    const distance=page=>page.center.distanceToSquared(p);
    pages.sort((a,b)=>distance(a)-distance(b));
    const selected=new Set(pages.slice(0,SLOTS));
    for(let i=0;i<SLOTS;i++)if(this.slots[i]&&!selected.has(this.slots[i])){
      const old=this.slots[i];old.slot=-1;old.ready=false;old.pending.clear();this.slots[i]=null;
    }
    for(const page of selected)if(page.slot<0){
      const slot=this.slots.indexOf(null);page.slot=slot;page.ready=false;page.needsClear=true;
      page.pending=new Map(page.records);this.slots[slot]=page;
    }
  }

  _publishPage(i) {
    const page=this.slots[i],uniform=this.uniforms.uNativeDetailPages.value[i];
    if(page&&!page.pending.size&&!page.needsClear)page.ready=true;
    if(page?.ready){
      const {n,u,v,d}=page.plane;uniform.set(n.x,n.y,n.z,d);
      this.uniforms.uNativeDetailU.value[i].set(u.x,u.y,u.z,page.x);
      this.uniforms.uNativeDetailV.value[i].set(v.x,v.y,v.z,page.z);
    }else uniform.set(0,0,0,0);
  }

  flush() {
    if(this.disposed || globalThis.document?.hidden)return;
    this.uniforms.uNativeBaseSize.value=this.paint.size;this.uniforms.uNativeBasePpm.value=this.paint.ppm;
    if(!this.enabled){for(const value of this.uniforms.uNativeDetailPages.value)value.set(0,0,0,0);return;}
    this.select();
    let hasWork=false;
    for(const page of this.slots)if(page&&(page.needsClear||page.pending.size)){hasWork=true;break;}
    // Uniforms must still follow selection/enable changes while idle, but no
    // target, viewport, clear colour or scissor state needs a round trip.
    if(!hasWork){for(let i=0;i<SLOTS;i++)this._publishPage(i);return;}
    const renderer=this.paint.renderer, previous=renderer.getRenderTarget(),
      face=renderer.getActiveCubeFace?.()||0,mip=renderer.getActiveMipmapLevel?.()||0,
      auto=renderer.autoClear, color=renderer.getClearColor(this._savedColor),alpha=renderer.getClearAlpha();
    const viewport=renderer.getViewport(this._savedViewport),scissor=renderer.getScissor(this._savedScissor),scissorTest=renderer.getScissorTest();
    let budget=RECORD_BUDGET;
    try{
      renderer.autoClear=false;renderer.setClearColor(0,0);renderer.setRenderTarget(this.target);
      this.sink._pushQuad=this._drawTriangles;
      for(let i=0;i<SLOTS;i++){
        const page=this.slots[i];
        if(page&&(page.needsClear||(page.pending.size&&budget>0))){
          const x=(i%4)*NATIVE_DETAIL_TILE,y=Math.floor(i/4)*NATIVE_DETAIL_TILE;
          renderer.setScissor(x,y,NATIVE_DETAIL_TILE,NATIVE_DETAIL_TILE);renderer.setScissorTest(true);
          if(page.needsClear){renderer.clear(true,false,false);page.needsClear=false;}
          this.drawing=page;this.vertexCount=0;
          for(const [id,record]of page.pending){
            if(budget<=0)break;
            this.emit.call(this.sink,record.g,record.tn,record.dT,false);
            page.pending.delete(id);budget--;
          }
          this.draw();
        }
        this._publishPage(i);
      }
    }finally{
      this.drawing=null;renderer.setRenderTarget(previous,face,mip);renderer.setViewport(viewport);
      renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);renderer.setClearColor(color,alpha);renderer.autoClear=auto;
    }
  }

  _projectedTriangles(f,plane,T) {
    const cache=this._projectionCache;
    let entry=cache.get(f);
    if(entry&&entry.source===T&&entry.ids===f.triangles&&entry.points.length===f.triangles.length*20&&
      entry.plane===plane&&sameProjectionFrame(entry.frame,f,plane))return entry.points;
    if(entry){this._projectionBytes-=entry.points.byteLength;cache.delete(f);}
    const bytes=f.triangles.length*20*Float64Array.BYTES_PER_ELEMENT;
    if(!bytes||bytes>PROJECTION_CACHE_BYTES)return null;
    while(cache.size&&(this._projectionBytes+bytes>PROJECTION_CACHE_BYTES||cache.size>=PROJECTION_CACHE_FACES)){
      const oldest=cache.keys().next().value;this._projectionBytes-=cache.get(oldest).points.byteLength;cache.delete(oldest);
    }
    const points=new Float64Array(f.triangles.length*20);
    for(let t=0;t<f.triangles.length;t++)projectDetailTriangle(points,t*20,f.triangles[t],f,plane,T);
    const frame=Float64Array.of(f.origin.x,f.origin.y,f.origin.z,f.u.x,f.u.y,f.u.z,f.v.x,f.v.y,f.v.z,
      plane.u.x,plane.u.y,plane.u.z,plane.v.x,plane.v.y,plane.v.z);
    cache.set(f,{points,source:T,ids:f.triangles,plane,frame});this._projectionBytes+=bytes;
    return points;
  }

  triangles(f,u0,u1,v0,v1,lu,lv,dn,R,team,seed,kind,sdu,sdv,sa,tn,dT,mode) {
    const page=this.drawing;if(!floorSurface(f)||this.planeByFace.get(f)!==page.plane)return;
    const T=this.paint.level.data.triangles,ox=(page.slot%4)*NATIVE_DETAIL_TILE+PAD,oy=Math.floor(page.slot/4)*NATIVE_DETAIL_TILE+PAD;
    const cached=this._projectedTriangles(f,page.plane,T),points=cached||this.triangle,word=paintShapeSeed(seed),kind2=kind*2;
    const loX=page.x-GUARD,hiX=page.x+SIDE+GUARD,loZ=page.z-GUARD,hiZ=page.z+SIDE+GUARD;
    for(let tri=0;tri<f.triangles.length;tri++){
      const base=cached?tri*20:0;
      if(!cached)projectDetailTriangle(points,0,f.triangles[tri],f,page.plane,T);
      if(points[base+13]<u0||points[base+12]>u1||points[base+15]<v0||points[base+14]>v1||
        points[base+17]<loX||points[base+16]>hiX||points[base+19]<loZ||points[base+18]>hiZ)continue;
      if(this.vertexCount+3>VERTEX_LIMIT)this.draw();
      for(let q=base;q<base+12;q+=4){
        const x=points[q],z=points[q+1],u=points[q+2],v=points[q+3];
        const i=this.vertexCount++,a=this.arrays;
        a.aPos[i*2]=((ox+(x-page.x)*NATIVE_DETAIL_PPM)/NATIVE_DETAIL_SIZE)*2-1;
        a.aPos[i*2+1]=((oy+(z-page.z)*NATIVE_DETAIL_PPM)/NATIVE_DETAIL_SIZE)*2-1;
        const i3=i*3,i4=i*4;
        a.aLocal[i3]=u-lu;a.aLocal[i3+1]=v-lv;a.aLocal[i3+2]=dn;
        a.aSplat[i4]=R;a.aSplat[i4+1]=team;a.aSplat[i4+2]=seed;a.aSplat[i4+3]=kind2;
        a.aStretch[i3]=sdu;a.aStretch[i3+1]=sdv;a.aStretch[i3+2]=sa;
        a.aGrow[i4]=tn;a.aGrow[i4+1]=dT;a.aGrow[i4+2]=mode;a.aGrow[i4+3]=word;
      }
    }
  }

  draw() {
    if(!this.vertexCount)return;
    for(const attr of Object.values(this.geometry.attributes)){attr.clearUpdateRanges();attr.addUpdateRange(0,this.vertexCount*attr.itemSize);attr.needsUpdate=true;}
    this.geometry.setDrawRange(0,this.vertexCount);this.paint.renderer.render(this.scene,this.camera);this.vertexCount=0;
  }

  clear() {
    this.pages.clear();this.records=new WeakMap();this.slots.fill(null);this.dirtySelection=true;this.serial=0;
    this.planes.clear();this.planeByFace=new WeakMap();
    this._projectionCache.clear();this._projectionBytes=0;
    for(const value of this.uniforms.uNativeDetailPages.value)value.set(0,0,0,0);
  }

  dispose() {
    if(this.disposed)return;this.disposed=true;this.clear();this.restore();
    this.target.dispose();this.geometry.dispose();this.material.dispose();this.paint.nativeDetail=null;
  }

  decorate(fragment, stencil=false) {
    if(stencil)return fragment+NATIVE_DETAIL_GLSL+'\nvoid main(){iwPrepareNativePaint();if(iwPaintSample(iwPaintUv).a<0.015)discard;gl_FragColor=vec4(0.0);}';
    fragment=fragment.replace(/\bvPaintUv\b/g,'iwPaintUv').replace('varying vec2 iwPaintUv;','varying vec2 vPaintUv;')
      .replace(/\buAtlasSize\b/g,'iwPaintSize').replace('uniform float iwPaintSize;','uniform float uAtlasSize;')
      .replace(/\buTexel\b/g,'iwPaintTexel').replace('uniform float iwPaintTexel;','uniform float uTexel;')
      .replace(/\buPpm\b/g,'iwPaintPpm').replace('uniform float iwPaintPpm;','uniform float uPpm;')
      .replaceAll('textureGrad(uPaint,','iwPaintGrad(').replaceAll('textureLod(uPaint,','iwPaintLod(').replaceAll('texture2D(uPaint,','iwPaintSample(')
      .replace('vec2 pdx = dFdx(iwPaintUv), pdy = dFdy(iwPaintUv);','vec2 pdx = iwPaintDx, pdy = iwPaintDy;');
    fragment=fragment.replace('uniform float uInkClock;',NATIVE_DETAIL_GLSL+'\nuniform float uInkClock;');
    return fragment.replace('void main() {','void main() {\n iwPrepareNativePaint();');
  }
}

const NATIVE_DETAIL_GLSL=`
uniform sampler2D uNativeDetailPaint;
uniform vec4 uNativeDetailPages[16];
uniform vec4 uNativeDetailU[16],uNativeDetailV[16];
uniform float uNativeBaseSize,uNativeBasePpm;
vec2 iwPaintUv,iwPaintDx,iwPaintDy;
float iwPaintSize,iwPaintTexel,iwPaintPpm;
bool iwDetailActive=false;
void iwPrepareNativePaint(){
 iwPaintUv=vPaintUv;iwPaintSize=uNativeBaseSize;iwPaintTexel=1.0/uNativeBaseSize;iwPaintPpm=uNativeBasePpm;
 vec2 baseDx=dFdx(vPaintUv),baseDy=dFdy(vPaintUv);
 vec3 worldDx=dFdx(vWPos),worldDy=dFdy(vWPos);
 iwPaintDx=baseDx;iwPaintDy=baseDy;
 float closest=0.006;bool found=false;vec2 bestPoint=vec2(0.0),bestSlot=vec2(0.0);vec3 bestU=vec3(0.0),bestV=vec3(0.0);
 for(int i=0;i<16;i++){
  vec4 page=uNativeDetailPages[i],u=uNativeDetailU[i],v=uNativeDetailV[i];
  if(!(dot(vWNorm,page.xyz)>0.9999))continue;
  float distance=abs(dot(vWPos,page.xyz)-page.w);
  if(!(distance<closest))continue;
  vec2 p=vec2(dot(vWPos,u.xyz)-u.w,dot(vWPos,v.xyz)-v.w);
  if(p.x>=0.0&&p.x<8.0&&p.y>=0.0&&p.y<8.0){
   closest=distance;found=true;bestPoint=p;bestSlot=vec2(mod(float(i),4.0),floor(float(i)/4.0))*256.0;bestU=u.xyz;bestV=v.xyz;
  }
 }
 if(found){
  iwPaintUv=(bestSlot+8.0+bestPoint*30.0)/1024.0;iwPaintSize=1024.0;iwPaintTexel=1.0/1024.0;iwPaintPpm=30.0;
  iwPaintDx=vec2(dot(worldDx,bestU),dot(worldDx,bestV))*30.0/1024.0;
  iwPaintDy=vec2(dot(worldDy,bestU),dot(worldDy,bestV))*30.0/1024.0;iwDetailActive=true;
 }
}
vec4 iwCombinePaint(vec4 fine,vec4 coarse){return coarse.a>0.00001?vec4(coarse.rgb*(fine.a/coarse.a),fine.a):fine;}
vec2 iwCoarseUV(vec2 uv){return vPaintUv+(uv-iwPaintUv)*(uNativeBasePpm/30.0)*(1024.0/uNativeBaseSize);}
vec4 iwPaintSample(vec2 uv){if(!iwDetailActive)return texture2D(uPaint,uv);return iwCombinePaint(texture2D(uNativeDetailPaint,uv),texture2D(uPaint,iwCoarseUV(uv)));}
vec4 iwPaintLod(vec2 uv,float lod){if(!iwDetailActive)return textureLod(uPaint,uv,lod);return iwCombinePaint(textureLod(uNativeDetailPaint,uv,0.0),textureLod(uPaint,iwCoarseUV(uv),0.0));}
vec4 iwPaintGrad(vec2 uv,vec2 dx,vec2 dy){if(!iwDetailActive)return textureGrad(uPaint,uv,dx,dy);float k=(uNativeBasePpm/30.0)*(1024.0/uNativeBaseSize);return iwCombinePaint(textureGrad(uNativeDetailPaint,uv,dx,dy),textureGrad(uPaint,iwCoarseUV(uv),dx*k,dy*k));}
`;
