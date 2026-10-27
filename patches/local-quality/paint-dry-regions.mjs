// Exact sparse drying for the RGBA8 paint atlas. No change to paint fragments,
// blend equations, mip cadence, gameplay ownership, or simulation timestamps.
import * as THREE from 'three';
import {PaintDryRegions} from './paint-dry-region-grid.mjs';

const INSTALLED = Symbol.for('inkwave.paint-dry-regions.v1');
const KEY = '_iwPaintDryRegions';
const MAX_RECTS = 128;


function allocate(paint) {
  if(paint.level?.native)return null; // Native-stage texture ownership is a separate, unmodified path.
  const original=paint.dryMesh?.geometry;
  const p=original?.attributes?.position;
  const m=paint.dryMesh?.material,tex=paint.rt?.texture;
  // This zero-wetness optimization is valid only for the canonical UNORM8
  // subtractive dry pass, never an unknown shader or floating-point atlas.
  if(!p || !paint.rt || paint.rt.width!==paint.size || paint.rt.height!==paint.size ||
     tex?.type!==THREE.UnsignedByteType || tex.format!==THREE.RGBAFormat || paint.rt.samples!==0 ||
     !m?.fragmentShader?.includes('vec4(0.0, uDry, 0.0, 0.0)') ||
     m.blendEquation!==THREE.ReverseSubtractEquation || m.blendSrc!==THREE.OneFactor ||
     m.blendDst!==THREE.OneFactor || m.blendEquationAlpha!==THREE.AddEquation ||
     m.blendSrcAlpha!==THREE.ZeroFactor || m.blendDstAlpha!==THREE.OneFactor)return null;
  let top=-Infinity;
  for(let i=0;i<p.count;i++)top=Math.max(top,p.getY(i));
  const tracker=new PaintDryRegions(paint.size,top);
  const positions=new Float32Array(MAX_RECTS*12);
  const indices=new Uint16Array(MAX_RECTS*6);
  for(let i=0;i<MAX_RECTS;i++){
    const v=i*4,k=i*6;indices[k]=v;indices[k+1]=v+1;indices[k+2]=v+2;
    indices[k+3]=v;indices[k+4]=v+2;indices[k+5]=v+3;
  }
  const geometry=new THREE.BufferGeometry();
  const attribute=new THREE.BufferAttribute(positions,3);attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position',attribute);geometry.setIndex(new THREE.BufferAttribute(indices,1));
  geometry.setDrawRange(0,0);
  return {tracker,original,geometry,positions,attribute,range:{start:0,count:0},target:paint.rt,material:m,vertexShader:m.vertexShader,fragmentShader:m.fragmentShader,
    counters:{dryPasses:0,sparsePasses:0,fullPasses:0,coveredPixels:0,baselinePixels:0}};
}
function selectDryGeometry(paint,state){
  const t=state.tracker;
  const rebuilt=t.rebuild();
  if(t.full){paint.dryMesh.geometry=state.original;return;}
  if(rebuilt){
    const p=state.positions,n=t.axis;
    for(let i=0;i<t.count;i++){
      const a=i*4,b=i*12;
      const x0=t.rects[a]/n*2-1,x1=t.rects[a+2]/n*2-1;
      const y0=t.rects[a+1]/n*2-1,y1=Math.min(t.top,t.rects[a+3]/n*2-1);
      p[b]=x0;p[b+1]=y0;p[b+2]=0;p[b+3]=x1;p[b+4]=y0;p[b+5]=0;
      p[b+6]=x1;p[b+7]=y1;p[b+8]=0;p[b+9]=x0;p[b+10]=y1;p[b+11]=0;
    }
    state.geometry.setDrawRange(0,t.count*6);
    if(t.count){
      state.range.count=t.count*12;state.attribute.clearUpdateRanges();
      state.attribute.updateRanges.push(state.range);state.attribute.needsUpdate=true;
    }
  }
  paint.dryMesh.geometry=state.geometry;
}
function release(paint){
  const s=paint[KEY];if(!s)return;
  if(paint.dryMesh?.geometry===s.geometry)paint.dryMesh.geometry=s.original;
  s.geometry.dispose();delete paint[KEY];
}
export function installPaintDryRegions(PaintSystem) {
  const P=PaintSystem.prototype;
  if(Object.hasOwn(P,INSTALLED))return false;
  const init=P._initGPU,draw=P._drawQuads,clear=P.clear,dispose=P.dispose;
  if([init,draw,clear,dispose].some(fn=>typeof fn!=='function'))throw new TypeError('PaintSystem lifecycle required');
  P._initGPU=function(...args){
    release(this);const result=init.apply(this,args);this[KEY]=allocate(this);return result;
  };
  P.clear=function(...args){
    const result=clear.apply(this,args);this[KEY]?.tracker.reset();return result;
  };
  P._drawQuads=function(...args){
    const s=this[KEY];
    if(!s || globalThis.document?.hidden || (!this.quads&&!this.dryMesh.visible))return draw.apply(this,args);
    // Unexpected target replacement is not a license to discard unknown ink.
    if(s.target!==this.rt || this.rt.width!==s.tracker.size || this.rt.height!==s.tracker.size ||
       (this.dryMesh.material!==s.material)||this.dryMesh.material.vertexShader!==s.vertexShader||this.dryMesh.material.fragmentShader!==s.fragmentShader||
       (this.dryMesh.geometry!==s.original&&this.dryMesh.geometry!==s.geometry)){
      release(this);return draw.apply(this,args);
    }
    const t=s.tracker, drying=this.dryMesh.visible;
    if(drying&&(!Number.isFinite(this._dryU?.uDry?.value)||this._dryU.uDry.value<0)){release(this);return draw.apply(this,args);}
    // Conservatively under-count every dry step by one UNORM8 unit. Expiry
    // therefore cannot precede exact-zero wetness on supported RGBA8 targets.
    const amount=drying?Math.max(0,Math.floor(this._dryU.uDry.value*255-1e-6)):0;
    const next=t.credit+amount;
    if(drying)t.expire();
    if(this.quads){
      const profile=this._iwPaintProfileBatch;
      if(profile?.prepared&&profile.preparedCount===this.quads)t.markPixelRects(profile.rectangles,this.quads,next);
      else t.markPositions(this.aPos,this.quads,next);
    }
    if(drying){
      selectDryGeometry(this,s);
      const c=s.counters;c.dryPasses++;t.full?c.fullPasses++:c.sparsePasses++;
      c.baselinePixels+=t.size*t.size*(t.top+1)*.5;
      if(t.full)c.coveredPixels+=t.size*t.size*(t.top+1)*.5;
      else for(let i=0;i<t.count;i++){const k=i*4;
        c.coveredPixels+=(t.rects[k+2]-t.rects[k])*t.tile*Math.max(0,Math.min((t.top+1)*.5*t.size,t.rects[k+3]*t.tile)-t.rects[k+1]*t.tile);}
    }
    const result=draw.apply(this,args);
    t.credit=next;
    return result;
  };
  P.dispose=function(...args){release(this);return dispose.apply(this,args);};
  Object.defineProperty(P,INSTALLED,{value:true});return true;
}
