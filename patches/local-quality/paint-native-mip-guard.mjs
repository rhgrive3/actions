// One bounded, context-local compatibility check before regional native mips.
// It never changes the game's textures, quality, cadence or GL bindings.
// The small readback occurs once at atlas creation, not in the frame loop.
const checked=new WeakMap();
export function nativeMipCompatibility(gl){
 if(checked.has(gl))return checked.get(gl);
 if(!gl?.texStorage2D || gl.isContextLost())return false;
 const T=gl.TEXTURE_2D,N=128,K=3,S=64,levels=8;
 const saved={texture:gl.getParameter(gl.TEXTURE_BINDING_2D),read:gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),draw:gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),pack:gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING),unpack:gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING)};
 const stores=[gl.PACK_ALIGNMENT,gl.PACK_ROW_LENGTH,gl.PACK_SKIP_PIXELS,gl.PACK_SKIP_ROWS,gl.UNPACK_ALIGNMENT,gl.UNPACK_ROW_LENGTH,gl.UNPACK_IMAGE_HEIGHT,gl.UNPACK_SKIP_PIXELS,gl.UNPACK_SKIP_ROWS,gl.UNPACK_SKIP_IMAGES,gl.UNPACK_FLIP_Y_WEBGL,gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL];
 const values=stores.map(p=>gl.getParameter(p));
 const textures=[],fbo=gl.createFramebuffer();let ok=false;
 const create=(size,count)=>{const tex=gl.createTexture();textures.push(tex);gl.bindTexture(T,tex);gl.texStorage2D(T,count,gl.RGBA8,size,size);gl.texParameteri(T,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(T,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(T,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(T,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return tex;};
 try{
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER,null);
  stores.forEach(p=>gl.pixelStorei(p,p===gl.PACK_ALIGNMENT||p===gl.UNPACK_ALIGNMENT?1:0));
  const data=new Uint8Array(N*N*4);let seed=0x91459127;
  for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed>>>24;}
  const ref=create(N,levels);gl.texSubImage2D(T,0,0,0,N,N,gl.RGBA,gl.UNSIGNED_BYTE,data);gl.generateMipmap(T);
  const dst=create(N,levels);gl.texSubImage2D(T,0,0,0,N,N,gl.RGBA,gl.UNSIGNED_BYTE,data);gl.generateMipmap(T);
  const scratch=create(S,7);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER,fbo);
  // Several non-zero, eight-pixel-aligned origins exercise fine/tail seams.
  for(const [x,y,w,h] of [[8,16,19,23],[56,48,7,11],[24,8,31,17]]){
   const patch=new Uint8Array(w*h*4);for(let i=0;i<patch.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;patch[i]=seed>>>24;}
   gl.bindTexture(T,ref);gl.texSubImage2D(T,0,x,y,w,h,gl.RGBA,gl.UNSIGNED_BYTE,patch);gl.generateMipmap(T);
   gl.bindTexture(T,dst);gl.texSubImage2D(T,0,x,y,w,h,gl.RGBA,gl.UNSIGNED_BYTE,patch);
   const ox=Math.min(N-S,Math.floor(x/8)*8),oy=Math.min(N-S,Math.floor(y/8)*8);
   gl.framebufferTexture2D(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,T,dst,0);
   if(gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Unsupported calibration framebuffer');
   gl.bindTexture(T,scratch);gl.copyTexSubImage2D(T,0,0,0,ox,oy,S,S);gl.generateMipmap(T);
   gl.bindTexture(T,dst);
   for(let l=1;l<=K;l++){gl.framebufferTexture2D(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,T,scratch,l);gl.copyTexSubImage2D(T,l,ox>>l,oy>>l,0,0,S>>l,S>>l);}
   gl.texParameteri(T,gl.TEXTURE_BASE_LEVEL,K);gl.generateMipmap(T);gl.texParameteri(T,gl.TEXTURE_BASE_LEVEL,0);
   for(let l=1;l<levels;l++){
    const side=N>>l,a=new Uint8Array(side*side*4),b=new Uint8Array(a.length);
    gl.framebufferTexture2D(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,T,ref,l);gl.readPixels(0,0,side,side,gl.RGBA,gl.UNSIGNED_BYTE,a);
    gl.framebufferTexture2D(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,T,dst,l);gl.readPixels(0,0,side,side,gl.RGBA,gl.UNSIGNED_BYTE,b);
    if(a.some((v,i)=>v!==b[i]))throw Error('Native mip rounding differs');
   }
  }
  ok=!gl.isContextLost();
 }catch{ok=false;}finally{
  for(const tex of textures)gl.deleteTexture(tex);gl.deleteFramebuffer(fbo);
  stores.forEach((p,i)=>gl.pixelStorei(p,values[i]));
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER,saved.pack);gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER,saved.unpack);
  gl.bindTexture(T,saved.texture);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,saved.read);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,saved.draw);
 }
 checked.set(gl,ok);
 gl.canvas?.addEventListener?.('webglcontextlost',()=>checked.delete(gl),{once:true});
 return ok;
}