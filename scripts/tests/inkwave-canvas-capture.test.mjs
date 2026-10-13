import test from 'node:test';
import assert from 'node:assert/strict';
import {installCanvasCapture} from '../lib/inkwave-canvas-capture.mjs';
async function fakeBrowser({mismatch=false,viewport=[0,0,4,4],scissorTest=false,target=null,pixelRatio=1,glViewport=[0,0,4,4],readFramebuffer=null,alphaMismatch=false,flipped=false,glError=0,exportError=false,inspectFailure=()=>{}}={}){
 const names=['NG','T','createImageBitmap','OffscreenCanvas','__captureNativeCanvas','__nativeFillCoefficient','__nativeCanvasCaptureFailure'],saved=new Map(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const pixels=Uint8Array.from({length:64},(_,i)=>i%4===3?255:(Math.floor(i/16)+1)*40),topDown=new Uint8Array(64);
 for(let y=0;y<4;y++)topDown.set(pixels.subarray(y*16,y*16+16),(3-y)*16);if(mismatch)topDown[4]=255;if(alphaMismatch)topDown[3]=1;if(flipped)topDown.set(pixels);
 const events=[],png='data:image/png;base64,cG5n';
 try{
  const vector={toArray:()=>viewport};globalThis.T={Vector4:class{},Vector2:class{}};
  const gl={drawingBufferWidth:4,drawingBufferHeight:4,RGBA:1,UNSIGNED_BYTE:2,readPixels(_x,_y,_w,_h,_f,_t,out){events.push('GL');out.set(pixels);},getError:()=>glError,VIEWPORT:3,SCISSOR_BOX:4,SCISSOR_TEST:5,READ_FRAMEBUFFER_BINDING:6,DRAW_FRAMEBUFFER_BINDING:7,PACK_ALIGNMENT:8,getContextAttributes:()=>({alpha:true,premultipliedAlpha:true,preserveDrawingBuffer:false}),getParameter:k=>k===3?glViewport:k===4?[0,0,4,4]:k===6?readFramebuffer:k===8?4:null,isEnabled:()=>false};
  globalThis.NG={renderer:{getContext:()=>gl,getViewport:()=>vector,getScissor:()=>({toArray:()=>[0,0,4,4]}),getSize:()=>({x:4/pixelRatio,y:4/pixelRatio}),getRenderTarget:()=>target,getScissorTest:()=>scissorTest,getPixelRatio:()=>pixelRatio,domElement:{width:4,height:4,toDataURL(){events.push('PNG');if(exportError)throw Error('PNG export failed');return png;}}}};
  globalThis.createImageBitmap=async blob=>{assert.equal(await blob.text(),'png');events.push('decode');return {width:4,height:4,close(){}};};
  globalThis.OffscreenCanvas=class{getContext(){return {drawImage(){},getImageData(){return {data:topDown};}};}};
  installCanvasCapture();const capture=await __captureNativeCanvas('test');assert.deepEqual(events,['GL','PNG','decode']);return capture;
 }catch(error){inspectFailure(globalThis.__nativeCanvasCaptureFailure);throw error;}finally{for(const [k,desc] of saved)if(desc)Object.defineProperty(globalThis,k,desc);else delete globalThis[k];}
}
test('capture compares bottom-up GL with decoded PNG orientation and ROI',async()=>{
 const c=await fakeBrowser();assert.equal(c.capture.maxChannelDifference,0);assert.deepEqual(c.stats,c.capture.pngStats);assert.equal(c.glError,0);assert.ok(c.png.startsWith('data:image/png;base64,'));
});
test('capture rejects wrong framebuffer state before taking pixels',async()=>{
 for(const options of [{viewport:[0,0,2,4]},{scissorTest:true},{target:{}}])await assert.rejects(fakeBrowser(options),/target\/viewport\/scissor\/canvas/);
});
test('capture rejects mismatched decoded PNG rather than reporting different frame as evidence',async()=>{
 await assert.rejects(fakeBrowser({mismatch:true}),/Saved PNG differs/);
});

test('diagnostic overrides are explicit, bounded and cannot enable glass or unknown scope',()=>{
 const oldCapture=globalThis.__captureNativeCanvas,oldFill=globalThis.__nativeFillCoefficient;
 try{installCanvasCapture();
  for(const theme of ['day','sunset'])for(const [mode,value] of [['baseline',0],['fill-020',.2],['fill-035',.35],['fill-050',.5],['fill-035-no-ink',.35]]){
   assert.equal(__nativeFillCoefficient('inkblot',theme,mode,false),value);assert.equal(__nativeFillCoefficient('inkblot',theme,mode,true),0);
  }
  for(const [id,theme] of [['shipshape','day'],['inkblot','night'],['inkblot','dusk'],[undefined,'day'],['inkblot',undefined]])assert.throws(()=>__nativeFillCoefficient(id,theme,'fill-035',false),/limited/);
  assert.throws(()=>__nativeFillCoefficient('inkblot','day','fill-999',false),/Unreviewed/);
 }finally{if(oldCapture)globalThis.__captureNativeCanvas=oldCapture;else delete globalThis.__captureNativeCanvas;if(oldFill)globalThis.__nativeFillCoefficient=oldFill;else delete globalThis.__nativeFillCoefficient;}
});

test('capture uses actual pixel viewport and accepts consistent non-unit DPR',async()=>{
 const c=await fakeBrowser({pixelRatio:.5,viewport:[0,0,8,8]});assert.equal(c.capture.state.pixelRatio,.5);
 for(const opts of [{glViewport:[0,0,8,8]},{readFramebuffer:{}}])await assert.rejects(fakeBrowser(opts),/target\/viewport\/scissor\/canvas/);
});
test('capture preserves original bytes and distinguishes RGB, alpha and flip failures',async()=>{
 for(const [opts,channel,delta] of [[{mismatch:true},0,95],[{alphaMismatch:true},3,254],[{flipped:true},0,120]]){
  let evidence;await assert.rejects(fakeBrowser({...opts,inspectFailure:e=>evidence=e}),/Saved PNG differs/);
  assert.equal(evidence.channelMax[channel],delta);assert.equal(evidence.png,'data:image/png;base64,cG5n');
  assert.deepEqual(Buffer.from(evidence.rawRGBA,'base64'),Buffer.from(Uint8Array.from({length:64},(_,i)=>i%4===3?255:(Math.floor(i/16)+1)*40)));assert.equal(evidence.alpha.min,255);assert.equal(evidence.orientation,'bottom-up');assert.match(evidence.error,/Saved PNG differs/);
 }
});
test('capture fails closed on GL errors and retains synchronous evidence',async()=>{
 let evidence;await assert.rejects(fakeBrowser({glError:1282,inspectFailure:e=>evidence=e}),/Capture GL error/);assert.equal(evidence.glError,1282);assert.equal(evidence.preReadError,1282);assert.ok(evidence.rawRGBA);
});

test('PNG export exception retains available raw bytes and original error',async()=>{
 let evidence;await assert.rejects(fakeBrowser({exportError:true,inspectFailure:e=>evidence=e}),/PNG export failed/);
 assert.deepEqual(Buffer.from(evidence.rawRGBA,'base64'),Buffer.from(Uint8Array.from({length:64},(_,i)=>i%4===3?255:(Math.floor(i/16)+1)*40)));
 assert.match(evidence.error,/PNG export failed/);assert.equal(evidence.png,undefined);assert.equal(evidence.glError,0);
});
