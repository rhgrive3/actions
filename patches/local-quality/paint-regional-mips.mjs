// Regenerate the existing mip chain using an aligned, native-GPU
// subregion plus the small global tail. Original cadence and filters are kept.
import * as THREE from 'three';
import {nativeMipCompatibility} from './paint-native-mip-guard.mjs';
const KEY='_iwPaintRegionalMips', INSTALLED=Symbol.for('inkwave.paint-regional-mips.v1');
function allocate(p) {
 const r=p.renderer,gl=r?.getContext?.(),N=p.size;
 if(p.level?.native || !gl?.texStorage2D || N<256 || (N&(N-1)) || p.rt?.texture?.type!==THREE.UnsignedByteType || p.rt.texture.format!==THREE.RGBAFormat)return null;
 const atlas=r.properties.get(p.rt.texture).__webglTexture;
 if(!atlas || p.rt.texture.colorSpace!==THREE.NoColorSpace || p.rt.samples!==0 ||
    p.rt.texture.wrapS!==THREE.ClampToEdgeWrapping || p.rt.texture.wrapT!==THREE.ClampToEdgeWrapping ||
    !p.mat?.vertexShader?.includes('gl_Position = vec4(aPos, 0.0, 1.0)') || !nativeMipCompatibility(gl))return null;
 const size=Math.min(256,N/4),levels=1+Math.log2(size),tail=Math.min(5,levels-1);
 const saved=gl.getParameter(gl.TEXTURE_BINDING_2D);
 // The atlas is privately owned by PaintSystem. Verify its base level once;
 // getTexParameter inside every frame would synchronize command submission.
 gl.bindTexture(gl.TEXTURE_2D,atlas);
 const base=gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_BASE_LEVEL);
 gl.bindTexture(gl.TEXTURE_2D,saved);
 if(base!==0)return null;
 const texture=gl.createTexture(),framebuffer=gl.createFramebuffer();
 if(!texture||!framebuffer){if(texture)gl.deleteTexture(texture);if(framebuffer)gl.deleteFramebuffer(framebuffer);return null;}
 const read=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);let complete=false;
 try{gl.bindTexture(gl.TEXTURE_2D,texture);gl.texStorage2D(gl.TEXTURE_2D,levels,gl.RGBA8,size,size);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 gl.bindFramebuffer(gl.READ_FRAMEBUFFER,framebuffer);
 gl.framebufferTexture2D(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
 complete=gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
 }finally{
 gl.bindTexture(gl.TEXTURE_2D,saved);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,read);
 if(!complete){gl.deleteTexture(texture);gl.deleteFramebuffer(framebuffer);}
 }
 if(!complete)return null;
 return {gl,atlas,target:p.rt,material:p.mat,vertexShader:p.mat.vertexShader,fragmentShader:p.mat.fragmentShader,texture,framebuffer,N,size,tail,minX:N,minY:N,maxX:0,maxY:0,dirty:false,forceFull:false,
   plan:{count:0,xy:new Int32Array(16)},partial:0,full:0,basePixels:0,tailPixels:0};
}
function reset(s){s.minX=s.minY=s.N;s.maxX=s.maxY=0;s.dirty=false;}
function rect(s,x0,y0,x1,y1){s.minX=Math.min(s.minX,x0);s.minY=Math.min(s.minY,y0);s.maxX=Math.max(s.maxX,x1);s.maxY=Math.max(s.maxY,y1);s.dirty=true;}
function track(s,p){
 if(s.forceFull)return;
 const N=s.N,a=p.aPos;
 for(let q=0;q<p.quads;q++){
  const i=q*8;
  const x0=(Math.min(a[i],a[i+2])+1)*N*.5,y0=(Math.min(a[i+1],a[i+5])+1)*N*.5;
  const x1=(Math.max(a[i],a[i+2])+1)*N*.5,y1=(Math.max(a[i+1],a[i+5])+1)*N*.5;
  if(!Number.isFinite(x0+y0+x1+y1)){s.forceFull=true;return;}
  rect(s,Math.max(0,Math.floor(x0)-2),Math.max(0,Math.floor(y0)-2),Math.min(N,Math.ceil(x1)+2),Math.min(N,Math.ceil(y1)+2));
 }
 if(p.dryMesh.visible){
  const g=p.dryMesh.geometry,pos=g.attributes.position;
  const indices=g.index,count=Math.min(g.drawRange.count,indices?.count??pos.count);
  if(!Number.isFinite(count)){s.forceFull=true;return;}
  for(let j=0;j<count;j++){
   const i=indices?indices.getX(j):j;
   const x=(pos.getX(i)+1)*N*.5,y=(pos.getY(i)+1)*N*.5;
   if(!Number.isFinite(x)||!Number.isFinite(y)){s.forceFull=true;return;}
   rect(s,Math.max(0,Math.floor(x)-1),Math.max(0,Math.floor(y)-1),Math.min(N,Math.ceil(x)+1),Math.min(N,Math.ceil(y)+1));
  }
 }
}
function region(s){
 if(!s.dirty||s.forceFull||!Number.isFinite(s.minX+s.minY+s.maxX+s.maxY))return null;
 const align=2**s.tail,x=Math.max(0,Math.min(s.N-s.size,Math.floor(s.minX/align)*align)),y=Math.max(0,Math.min(s.N-s.size,Math.floor(s.minY/align)*align));
 const cols=Math.max(1,Math.ceil((s.maxX-x)/s.size)),rows=Math.max(1,Math.ceil((s.maxY-y)/s.size));
 // Bound extra copies. Broad/dense ink retains one full native rebuild.
 if(cols*rows>8 || cols*rows*s.size*s.size>s.N*s.N*.25)return null;
 const plan=s.plan;plan.count=0;
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
  const i=plan.count++*2;plan.xy[i]=Math.min(s.N-s.size,x+col*s.size);plan.xy[i+1]=Math.min(s.N-s.size,y+row*s.size);
 }
 return plan;
}
function generate(s,plan){
 const {gl,N,size,tail}=s,T=gl.TEXTURE_2D;
 const base=0;
 const read=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),draw=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),texture=gl.getParameter(gl.TEXTURE_BINDING_2D);
 try{
  gl.bindTexture(T,s.atlas);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER,s.framebuffer);
  for(let i=0;i<plan.count;i++){
   const x=plan.xy[i*2],y=plan.xy[i*2+1];
   gl.framebufferTexture2D(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,T,s.atlas,0);
   gl.bindTexture(T,s.texture);
   gl.copyTexSubImage2D(T,0,0,0,x,y,size,size);
   gl.generateMipmap(T);
   gl.bindTexture(T,s.atlas);
   for(let l=1;l<=tail;l++){
    gl.framebufferTexture2D(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,T,s.texture,l);
    gl.copyTexSubImage2D(T,l,x>>l,y>>l,0,0,size>>l,size>>l);
   }
  }
  gl.texParameteri(T,gl.TEXTURE_BASE_LEVEL,tail);
  gl.generateMipmap(T);
 }finally{
  gl.bindTexture(T,s.atlas);gl.texParameteri(T,gl.TEXTURE_BASE_LEVEL,base);
  gl.bindTexture(T,texture);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER,read);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,draw);
 }
 s.partial++;s.basePixels+=size*size*plan.count;s.tailPixels+=(N>>tail)**2;reset(s);
}

function release(p){const s=p[KEY];if(!s)return;s.gl.deleteTexture(s.texture);s.gl.deleteFramebuffer(s.framebuffer);delete p[KEY];}
function usable(p,s){return s&&!s.forceFull&&s.target===p.rt&&s.N===p.rt.width&&s.N===p.rt.height&&
 p.rt.texture.type===THREE.UnsignedByteType&&p.rt.texture.format===THREE.RGBAFormat&&p.rt.texture.colorSpace===THREE.NoColorSpace&&
 p.mat===s.material&&p.mesh.material===s.material&&p.mat.vertexShader===s.vertexShader&&p.mat.fragmentShader===s.fragmentShader&&
 s.atlas===p.renderer.properties.get(p.rt.texture).__webglTexture&&!s.gl.isContextLost();}
export function installPaintRegionalMips(C){
 const P=C.prototype;if(Object.hasOwn(P,INSTALLED))return false;
 const init=P._initGPU,clear=P.clear,draw=P._drawQuads,regen=P._regenerateMipmaps,dispose=P.dispose;
 P._initGPU=function(...args){release(this);const v=init.apply(this,args);try{this[KEY]=allocate(this);}catch{this[KEY]=null;}return v;};
 P.clear=function(...args){const s=this[KEY];if(s)s.forceFull=true;try{return clear.apply(this,args);}finally{if(s){reset(s);s.forceFull=false;}}};
 P._drawQuads=function(...args){
  const s=this[KEY];if(!s||globalThis.document?.hidden||(!this.quads&&!this.dryMesh.visible))return draw.apply(this,args);
  if(!s.forceFull&&!usable(this,s)){release(this);return draw.apply(this,args);}
  track(s,this);
  const requested=!!this._mipRequested,bounds=requested&&usable(this,s)?region(s):null;
  if(!bounds){const v=draw.apply(this,args);if(requested){s.full++;reset(s);s.forceFull=false;}return v;}
  this._mipRequested=false;
  try{
   const v=draw.apply(this,args);
   try{generate(s,bounds);}
   catch(error){release(this);return regen.call(this);}
   this._lastMipClock=this.clock;this._mipsDirty=false;this._mipRebuildCount=(this._mipRebuildCount||0)+1;
   return v;
  }catch(error){this._mipRequested=true;throw error;}
 };
 P._regenerateMipmaps=function(...args){
  const s=this[KEY],bounds=!globalThis.document?.hidden&&usable(this,s)?region(s):null;
  if(!bounds){const v=regen.apply(this,args);if(s&&!globalThis.document?.hidden){s.full++;reset(s);}return v;}
  try{generate(s,bounds);}catch(error){release(this);return regen.apply(this,args);}this._lastMipClock=this.clock;this._mipsDirty=false;this._mipRebuildCount=(this._mipRebuildCount||0)+1;
 };
 P.dispose=function(...args){release(this);return dispose.apply(this,args);};
 Object.defineProperty(P,INSTALLED,{value:true});return true;
}
