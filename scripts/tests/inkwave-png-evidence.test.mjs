import test from 'node:test';import assert from 'node:assert/strict';import {deflateSync} from 'node:zlib';
import {decodeCapturePng,verifySavedPngCapture} from '../lib/inkwave-png-evidence.mjs';
import {createCaptureEvaluator} from '../lib/inkwave-capture-evidence.mjs';
const crc=bytes=>{let c=0xffffffff;for(const v of bytes){c^=v;for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
const chunk=(type,data)=>{const b=Buffer.alloc(12+data.length);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);b.writeUInt32BE(crc(b.subarray(4,-4)),b.length-4);return b;};
const encode=(rgba,filter=0)=>{
 const hdr=Buffer.alloc(13);hdr.writeUInt32BE(4);hdr.writeUInt32BE(4,4);hdr[8]=8;hdr[9]=6;
 const raw=Buffer.alloc(68);for(let y=0;y<4;y++){raw[y*17]=filter;for(let x=0;x<16;x++){
  const a=x>=4?rgba[y*16+x-4]:0,b=y?rgba[(y-1)*16+x]:0,c=y&&x>=4?rgba[(y-1)*16+x-4]:0;
  const p=a+b-c,dist=[Math.abs(p-a),Math.abs(p-b),Math.abs(p-c)],paeth=dist[0]<=dist[1]&&dist[0]<=dist[2]?a:dist[1]<=dist[2]?b:c;
  raw[y*17+x+1]=(rgba[y*16+x]-[0,a,b,Math.floor((a+b)/2),paeth][filter])&255;
 }}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',hdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
};
const flip=raw=>Buffer.concat([3,2,1,0].map(y=>raw.subarray(y*16,y*16+16)));
const opaque=()=>Buffer.from(Array.from({length:64},(_,i)=>i%4===3?255:(i*19)%251));
const record=(raw,png,attrs={alpha:true,premultipliedAlpha:true})=>({png:'data:image/png;base64,'+png.toString('base64'),rawRGBA:raw.toString('base64'),capture:{width:4,height:4,format:'RGBA8',orientation:'bottom-up',state:{contextAttributes:attrs,drawingBufferColorSpace:'srgb'}}});
test('exact PNG decoder reverses all five PNG filters without color/alpha conversion',()=>{
 const bytes=opaque();for(let filter=0;filter<5;filter++)assert.deepEqual(decodeCapturePng(encode(bytes,filter)).rgba,bytes);
 const bad=encode(bytes);bad[bad.length-1]^=1;assert.throws(()=>decodeCapturePng(bad),/CRC/);assert.throws(()=>decodeCapturePng(bad.subarray(0,24)),/Truncated/);
});
test('exact samples enforce alpha/opaque zero tolerance and partial-alpha RGB tolerance one',()=>{
 const raw=opaque();raw.set([5,10,15,128],0);const serialized=flip(raw);serialized.set([10,20,30,128],48);
 const valid=record(raw,encode(serialized));assert.equal(verifySavedPngCapture(valid).expectedChannelMax[0],0);
 for(const [index,change,pass] of [[48,1,true],[48,2,false],[51,1,false],[0,1,false]]){const altered=Buffer.from(serialized);altered[index]+=change;const input=record(raw,encode(altered));if(pass)assert.equal(verifySavedPngCapture(input).expectedChannelMax[0],1);else assert.throws(()=>verifySavedPngCapture(input),/Exact saved PNG differs/);}
});
test('wrong position, flip, frame, dimensions and context cannot be accepted by exact decoder',()=>{
 const raw=opaque(),top=flip(raw),later=Buffer.from(top);later[8]+=2;
 for(const bytes of [raw,Buffer.concat([top.subarray(4),top.subarray(0,4)]),later])assert.throws(()=>verifySavedPngCapture(record(raw,encode(bytes))),/Exact saved PNG differs/);
 const dimensions=record(raw,encode(top));dimensions.capture.width=8;assert.throws(()=>verifySavedPngCapture(dimensions),/dimensions/);
 const p3=record(raw,encode(top));p3.capture.state.drawingBufferColorSpace='display-p3';assert.throws(()=>verifySavedPngCapture(p3),/color space/);
});

// Independent Pillow-generated fixtures; corrupted low-alpha RGB is lost by a 2D roundtrip.
const lowRaw=Buffer.from('FCg8/xQoPP8UKDz/FCg8/xQoPP8AAAABFCg8/xQoPP8UKDz/FCg8/xQoPP8UKDz/FCg8/xQoPP8UKDz/FCg8/w==','base64');
const lowCorrect=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIElEQVR4nGMU0bD5z4AEmBjQABMDAwPDmxtH4BKM6FoAutoFfzXTm3gAAAAASUVORK5CYII=','base64');
const lowCorrupt=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIElEQVR4nGMU0bD5z4AEmBjQABMDAwNDwI0jcAlGdC0AqS4E4xHY3dYAAAAASUVORK5CYII=','base64');
test('low-alpha corruption hidden by 2D premultiplication is rejected from exact PNG samples',()=>{
 assert.equal(verifySavedPngCapture(record(lowRaw,lowCorrect)).expectedChannelMax[0],0);
 assert.throws(()=>verifySavedPngCapture(record(lowRaw,lowCorrupt)),/Exact saved PNG differs/);
});
test('caller requires exact validation and preserves corrupt PNG/raw when browser preliminary result would pass',async()=>{
 const input=record(lowRaw,lowCorrupt),files=new Map();input.mode='low-alpha-negative';
 const evaluator=createCaptureEvaluator({page:{evaluate:async()=>input},out:'/evidence',onPersistenceError:()=>assert.fail('unexpected persistence error'),writeFile:(p,b)=>files.set(p,b)});
 await assert.rejects(evaluator(()=>{}),/Exact saved PNG differs/);
 assert.deepEqual(files.get('/evidence/capture-failure-1.png'),lowCorrupt);assert.deepEqual(files.get('/evidence/capture-failure-1.rgba'),lowRaw);
 assert.match(files.get('/evidence/capture-failure-1.json'),/exactPngValidation/);
 const success=createCaptureEvaluator({page:{evaluate:async()=>record(lowRaw,lowCorrect)},out:'/unused',onPersistenceError:()=>{}});
 assert.equal((await success(()=>{})).capture.exactPngValidation.expectedChannelMax[0],0);
});
