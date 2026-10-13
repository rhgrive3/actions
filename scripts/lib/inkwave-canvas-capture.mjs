// Installed once with page.evaluate. Capture occurs synchronously before any
// await; PNG decoding afterward verifies the exact saved bytes against GL.
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
  const viewport=r.getViewport(new T.Vector4()).toArray(),scissor=r.getScissor(new T.Vector4()).toArray(),size=r.getSize(new T.Vector2());
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
  const stats=statistics(pixels,false);
  // All asynchronous work below uses already-captured PNG bytes, never a later frame.
  const bitmap=await createImageBitmap(await(await fetch(png)).blob(),{colorSpaceConversion:'none',premultiplyAlpha:'none'});
  if(bitmap.width!==w||bitmap.height!==h){bitmap.close();throw Error('Captured PNG dimensions differ from GL');}
  const canvas=new OffscreenCanvas(w,h),ctx=canvas.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'});ctx.drawImage(bitmap,0,0);bitmap.close();
  const decoded=ctx.getImageData(0,0,w,h).data;let maxChannelDifference=0;const channelMax=[0,0,0,0],mismatchSamples=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let k=0;k<4;k++){const source=(y*w+x)*4,dest=((h-1-y)*w+x)*4,difference=Math.abs(pixels[source+k]-decoded[dest+k]);maxChannelDifference=Math.max(maxChannelDifference,difference);channelMax[k]=Math.max(channelMax[k],difference);if(difference>1&&mismatchSamples.length<16)mismatchSamples.push({x,yBottomUp:y,channel:k,gl:Array.from(pixels.subarray(source,source+4)),png:Array.from(decoded.subarray(dest,dest+4))});}
  const pngStats=statistics(decoded,true);
  Object.assign(evidence,{stats,pngStats,maxChannelDifference,channelMax,mismatchSamples,pngAlpha:alphaSummary(decoded)});
  if(maxChannelDifference>1||Object.keys(stats).some(k=>Math.abs(stats[k].mean-pngStats[k].mean)>1))throw Error('Saved PNG differs from synchronous GL pixels: '+JSON.stringify({maxChannelDifference,channelMax,mismatchSamples,alpha:evidence.alpha,pngAlpha:evidence.pngAlpha,stats,pngStats}));
  globalThis.__nativeCanvasCaptureFailure=null;
  return {mode,stats,glError,capture:{state,pngStats,maxChannelDifference,channelMax,alpha:evidence.alpha,pngAlpha:evidence.pngAlpha,method:'synchronous canvas PNG; decoded same bytes and compared all RGBA channels to bottom-up GL readPixels',tolerance:1},png};
  }catch(error){evidence.error=error.stack||String(error);throw error;}
 };
}
