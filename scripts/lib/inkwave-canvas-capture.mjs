// Installed once with page.evaluate. Capture occurs synchronously before any
// await; PNG decoding afterward verifies the specified serialization of GL RGBA.
// Raw framebuffer bytes and serialized straight-alpha PNG are distinct evidence.
export function installCanvasCapture(){
 // Experimental values bypass only the disabled policy uniform, never its
 // production configuration. Reject every unverified stage/theme explicitly.
 globalThis.__nativeFillCoefficient=(id,theme,mode,glass)=>{
  if(id!=='inkblot'||!['day','sunset'].includes(theme))throw Error('Diagnostic fill scope is limited to Inkblot day/sunset');
  if(!mode.startsWith('fill-')||glass)return 0;
  if(!/^fill-(020|035|050)(-no-ink)?$/.test(mode))throw Error('Unreviewed diagnostic fill coefficient');
  return Number(mode.slice(5,8))/100;
 };
 globalThis.__captureNativeCanvas=async(mode)=>{
  globalThis.__nativeCanvasCaptureFailure=null;
  const r=NG.renderer,gl=r.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
  // Pinned WebGLRenderer getters only invoke target.copy (Vector4) or set (Vector2).
  // Keep these read-only targets local, avoiding an undeclared Three namespace.
  const target=()=>({copy(v){this.x=v.x;this.y=v.y;this.z=v.z;this.w=v.w;return this;},set(x,y){this.x=x;this.y=y;return this;},toArray(){return [this.x,this.y,this.z,this.w];}});
  const viewport=r.getViewport(target()).toArray(),scissor=r.getScissor(target()).toArray(),size=r.getSize(target());
  const state={contextAttributes:gl.getContextAttributes(),drawingBufferColorSpace:gl.drawingBufferColorSpace??null,unpackColorSpace:gl.unpackColorSpace??null,outputColorSpace:r.outputColorSpace??null,
   glViewport:Array.from(gl.getParameter(gl.VIEWPORT)),glScissor:Array.from(gl.getParameter(gl.SCISSOR_BOX)),glScissorTest:gl.isEnabled(gl.SCISSOR_TEST),
   readFramebufferIsDefault:gl.getParameter(gl.READ_FRAMEBUFFER_BINDING??gl.FRAMEBUFFER_BINDING)===null,drawFramebufferIsDefault:gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING??gl.FRAMEBUFFER_BINDING)===null,
   packAlignment:gl.getParameter(gl.PACK_ALIGNMENT),packRowLength:gl.PACK_ROW_LENGTH===undefined?0:gl.getParameter(gl.PACK_ROW_LENGTH),packSkipPixels:gl.PACK_SKIP_PIXELS===undefined?0:gl.getParameter(gl.PACK_SKIP_PIXELS),packSkipRows:gl.PACK_SKIP_ROWS===undefined?0:gl.getParameter(gl.PACK_SKIP_ROWS),targetIsDefault:r.getRenderTarget()===null,viewport,scissor,scissorTest:r.getScissorTest(),canvas:[r.domElement.width,r.domElement.height],drawingBuffer:[w,h],logicalSize:[size.x,size.y],pixelRatio:r.getPixelRatio()};
  globalThis.__nativeCanvasCaptureFailure={mode,state,width:w,height:h,error:'Capture state rejected before pixel read'};
  if(w<=0||h<=0||!state.readFramebufferIsDefault||!state.drawFramebufferIsDefault||state.glScissorTest||state.glViewport.some((v,i)=>v!==[0,0,w,h][i])||state.packRowLength||state.packSkipPixels||state.packSkipRows||(w*4)%state.packAlignment!==0||!state.targetIsDefault||state.scissorTest||viewport.some((v,i)=>v!==[0,0,size.x,size.y][i])||r.domElement.width!==w||r.domElement.height!==h)throw Error('Capture target/viewport/scissor/canvas does not match the full default framebuffer: '+JSON.stringify(state));
  // Keep exact synchronous inputs even if readback/export/decode throws.
  // Do not alter alpha, normalize colors, redraw, or synthesize the PNG.
  const base64=data=>{let text='';for(let i=0;i<data.length;i+=8192)text+=String.fromCharCode(...data.subarray(i,i+8192));return btoa(text);};
  const alphaSummary=data=>{let min=255,max=0,nonOpaque=0;for(let i=3;i<data.length;i+=4){min=Math.min(min,data[i]);max=Math.max(max,data[i]);if(data[i]!==255)nonOpaque++;}return {min,max,nonOpaque};};
  const evidence={mode,state,width:w,height:h,orientation:'bottom-up',format:'RGBA8'};
  globalThis.__nativeCanvasCaptureFailure=evidence;
  try{
  const preReadError=gl.getError();evidence.preReadError=preReadError;
  const pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  const glError=gl.getError();Object.assign(evidence,{glError,rawRGBA:base64(pixels),alpha:alphaSummary(pixels)});
  const png=r.domElement.toDataURL('image/png');evidence.png=png;
  if(preReadError||glError)throw Error('Capture GL error: '+JSON.stringify({preReadError,glError}));
  const rois={floor:[.25,0,.75,.35],walls:[.12,.35,.88,.65],sky:[.25,.75,.75,.95]};
  const statistics=(data,topDown)=>{const out={};for(const [name,[x0,y0,x1,y1]] of Object.entries(rois)){let n=0,sum=0,black=0,white=0;for(let y=Math.floor(y0*h);y<y1*h;y++)for(let x=Math.floor(x0*w);x<x1*w;x++){const i=((topDown?h-1-y:y)*w+x)*4,l=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];n++;sum+=l;if(l<16)black++;if(l>245)white++;}out[name]={mean:sum/n,blackFraction:black/n,whiteFraction:white/n};}return out;};
  const stats=statistics(pixels,false),attributes=state.contextAttributes;
  if(state.drawingBufferColorSpace!==null&&state.drawingBufferColorSpace!=='srgb')throw Error('Unsupported capture drawing-buffer color space: '+state.drawingBufferColorSpace);
  if(!attributes||typeof attributes.alpha!=='boolean'||typeof attributes.premultipliedAlpha!=='boolean')throw Error('Capture context attributes unavailable');
  // WebGL 1.0 spec, Premultiplied Alpha: PNG is straight alpha. This is a
  // serialization expectation, not a mutation of the framebuffer or source PNG.
  // https://registry.khronos.org/webgl/specs/latest/1.0/#PREMULTIPLIED_ALPHA
  const demultiply=attributes.alpha&&attributes.premultipliedAlpha;
  const expected=new Uint8Array(pixels),loss={rgbAboveAlphaPixels:0,zeroAlphaPixels:0,zeroAlphaNonzeroRGBPixels:0};
  for(let i=0;i<pixels.length;i+=4){const a=pixels[i+3];
   if(!attributes.alpha&&a!==255)throw Error('Opaque context returned nonopaque framebuffer alpha');
   if(pixels[i]>a||pixels[i+1]>a||pixels[i+2]>a)loss.rgbAboveAlphaPixels++;
   if(a===0){loss.zeroAlphaPixels++;if(pixels[i]||pixels[i+1]||pixels[i+2])loss.zeroAlphaNonzeroRGBPixels++;}
   if(demultiply)for(let k=0;k<3;k++)expected[i+k]=a===0?0:Math.min(255,Math.round(pixels[i+k]*255/a));
  }
  const expectedPngStats=statistics(expected,false);
  Object.assign(evidence,{stats,expectedPngStats,serialization:demultiply?'premultiplied-RGBA8-to-straight-PNG':'straight-RGBA8-to-PNG',frameEvidence:'readPixels and toDataURL in one synchronous task; serialization comparison cannot distinguish changes erased by clamping or zero alpha',loss});
  // All asynchronous work below uses already-captured PNG bytes, never a later frame.
  const bitmap=await createImageBitmap(await(await fetch(png)).blob(),{colorSpaceConversion:'none',premultiplyAlpha:'none'});
  if(bitmap.width!==w||bitmap.height!==h){bitmap.close();throw Error('Captured PNG dimensions differ from GL');}
  const canvas=new OffscreenCanvas(w,h),ctx=canvas.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'});ctx.drawImage(bitmap,0,0);bitmap.close();
  const decoded=ctx.getImageData(0,0,w,h).data;
  const channelMax=[0,0,0,0],expectedChannelMax=[0,0,0,0],mismatchSamples=[];
  let alphaMismatchPixels=0,opaqueRGBMismatchPixels=0,rawMismatchPixels=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const source=(y*w+x)*4,dest=((h-1-y)*w+x)*4;let rawMismatch=false,invalid=false;
   if(pixels[source+3]!==decoded[dest+3]){alphaMismatchPixels++;invalid=true;}
   if(pixels[source+3]===255&&[0,1,2].some(k=>pixels[source+k]!==decoded[dest+k])){opaqueRGBMismatchPixels++;invalid=true;}
   for(let k=0;k<4;k++){
    const rawDelta=Math.abs(pixels[source+k]-decoded[dest+k]),expectedDelta=Math.abs(expected[source+k]-decoded[dest+k]);
    channelMax[k]=Math.max(channelMax[k],rawDelta);expectedChannelMax[k]=Math.max(expectedChannelMax[k],expectedDelta);
    if(rawDelta>1)rawMismatch=true;if(expectedDelta>1)invalid=true;
   }
   if(rawMismatch)rawMismatchPixels++;
   if(invalid&&mismatchSamples.length<16)mismatchSamples.push({x,yBottomUp:y,gl:Array.from(pixels.subarray(source,source+4)),expectedPng:Array.from(expected.subarray(source,source+4)),png:Array.from(decoded.subarray(dest,dest+4))});
  }
  const pngStats=statistics(decoded,true),maxChannelDifference=Math.max(...channelMax),expectedMaxChannelDifference=Math.max(...expectedChannelMax);
  Object.assign(evidence,{pngStats,maxChannelDifference,channelMax,rawMismatchPixels,expectedMaxChannelDifference,expectedChannelMax,alphaMismatchPixels,opaqueRGBMismatchPixels,mismatchSamples,pngAlpha:alphaSummary(decoded)});
  if(expectedMaxChannelDifference>1||alphaMismatchPixels||opaqueRGBMismatchPixels||Object.keys(expectedPngStats).some(k=>Math.abs(expectedPngStats[k].mean-pngStats[k].mean)>1))throw Error('Saved PNG differs from expected framebuffer serialization: '+JSON.stringify({maxChannelDifference,expectedMaxChannelDifference,channelMax,expectedChannelMax,alphaMismatchPixels,opaqueRGBMismatchPixels,mismatchSamples,loss}));
  globalThis.__nativeCanvasCaptureFailure=null;
  const {png:capturedPng,rawRGBA,...capture}=evidence;
  return {mode,stats,glError,capture:{...capture,method:'synchronous canvas PNG; decoded serialized straight-alpha bytes checked against context-specific framebuffer serialization; raw byte differences retained',tolerance:1,opaqueRGBTolerance:0,alphaTolerance:0,statsRepresentation:'raw framebuffer RGB',pngStatsRepresentation:'serialized straight-alpha PNG RGB'},png:capturedPng,rawRGBA};
  }catch(error){evidence.error=error.stack||String(error);throw error;}
 };
}
