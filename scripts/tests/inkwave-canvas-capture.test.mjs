import test from 'node:test';
import assert from 'node:assert/strict';
import {installCanvasCapture} from '../lib/inkwave-canvas-capture.mjs';
async function fakeBrowser({mismatch=false,viewport=[0,0,4,4],scissorTest=false,target=null}={}){
 const names=['NG','T','createImageBitmap','OffscreenCanvas','__captureNativeCanvas','__nativeFillCoefficient'],saved=new Map(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const pixels=Uint8Array.from({length:64},(_,i)=>i%4===3?255:(Math.floor(i/16)+1)*40),topDown=new Uint8Array(64);
 for(let y=0;y<4;y++)topDown.set(pixels.subarray(y*16,y*16+16),(3-y)*16);if(mismatch)topDown[4]=255;
 const events=[],png='data:image/png;base64,cG5n';
 try{
  const vector={toArray:()=>viewport};globalThis.T={Vector4:class{},Vector2:class{}};
  const gl={drawingBufferWidth:4,drawingBufferHeight:4,RGBA:1,UNSIGNED_BYTE:2,readPixels(_x,_y,_w,_h,_f,_t,out){events.push('GL');out.set(pixels);},getError:()=>0};
  globalThis.NG={renderer:{getContext:()=>gl,getViewport:()=>vector,getScissor:()=>({toArray:()=>[0,0,4,4]}),getSize:()=>({x:4,y:4}),getRenderTarget:()=>target,getScissorTest:()=>scissorTest,getPixelRatio:()=>1,domElement:{width:4,height:4,toDataURL(){events.push('PNG');return png;}}}};
  globalThis.createImageBitmap=async blob=>{assert.equal(await blob.text(),'png');events.push('decode');return {width:4,height:4,close(){}};};
  globalThis.OffscreenCanvas=class{getContext(){return {drawImage(){},getImageData(){return {data:topDown};}};}};
  installCanvasCapture();const capture=await __captureNativeCanvas('test');assert.deepEqual(events,['GL','PNG','decode']);return capture;
 }finally{for(const [k,desc] of saved)if(desc)Object.defineProperty(globalThis,k,desc);else delete globalThis[k];}
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
