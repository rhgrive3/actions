import {performance} from 'node:perf_hooks';
import {inflateSync} from 'node:zlib';
const SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
const crc32=bytes=>{let c=0xffffffff;for(const value of bytes){c^=value;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
// Complete non-interlaced Chromium RGB/RGBA PNG, not a visual-quality test.
// Keep the existing byte/minimum viewport bounds, including DPR>1 captures.
export function validateGameplayViewportPng(bytes,minWidth,minHeight){
 if(!Buffer.isBuffer(bytes)||bytes.length<512||bytes.length>32*1024*1024||!bytes.subarray(0,8).equals(SIGNATURE))throw Error('Native combat viewport PNG missing or incomplete');
 if(!Number.isSafeInteger(minWidth)||!Number.isSafeInteger(minHeight)||minWidth<1||minHeight<1)throw Error('Native combat viewport dimensions invalid');
 let header=null,parts=[],idatClosed=false,palette=false,ended=false;
 for(let offset=8;offset<bytes.length;){
  if(offset+12>bytes.length)throw Error('Native combat viewport PNG truncated');
  const n=bytes.readUInt32BE(offset),end=offset+12+n,type=bytes.toString('latin1',offset+4,offset+8);
  if(end>bytes.length||! /^[A-Za-z]{4}$/.test(type)||(type.charCodeAt(2)&32)||crc32(bytes.subarray(offset+4,end-4))!==bytes.readUInt32BE(end-4))throw Error('Native combat viewport PNG chunk/CRC invalid');
  const value=bytes.subarray(offset+8,end-4);if(parts.length&&type!=='IDAT')idatClosed=true;
  if(type==='IHDR'){if(header||offset!==8||n!==13)throw Error('Native combat viewport PNG IHDR invalid');header=value;}
  else if(!header)throw Error('Native combat viewport PNG IHDR missing');
  else if(type==='IDAT'){if(idatClosed)throw Error('Native combat viewport PNG non-contiguous IDAT');parts.push(value);}
  else if(type==='PLTE'){if(palette||parts.length||!n||n>768||n%3)throw Error('Native combat viewport PNG PLTE invalid');palette=true;}
  else if(type==='IEND'){if(n||end!==bytes.length)throw Error('Native combat viewport PNG IEND invalid');ended=true;break;}
  else if((type.charCodeAt(0)&32)===0)throw Error('Native combat viewport PNG critical chunk unsupported');
  offset=end;
 }
 if(!ended||!header||!parts.length)throw Error('Native combat viewport PNG IDAT/IEND missing');
 const width=header.readUInt32BE(0),height=header.readUInt32BE(4);
 if(width<minWidth||height<minHeight||width*height>16777216||header[8]!==8||![2,6].includes(header[9])||header[10]||header[11]||header[12])throw Error('Native combat viewport PNG dimensions/format invalid');
 const channels=header[9]===6?4:3,row=width*channels+1,size=row*height,compressed=Buffer.concat(parts),decoded=inflateSync(compressed,{info:true,maxOutputLength:size});
 if(decoded.engine.bytesWritten!==compressed.length||decoded.buffer.length!==size)throw Error('Native combat viewport PNG zlib length/input invalid');
 for(let y=0;y<height;y++)if(decoded.buffer[y*row]>4)throw Error('Native combat viewport PNG filter invalid');
 return {width,height,bytes:bytes.length,complete:true};
}
export async function captureGameplayViewportPng({cdp,width,height,save,timeoutMs=120000}){
 if(!cdp||typeof cdp.send!=='function'||typeof save!=='function'||!Number.isFinite(timeoutMs)||timeoutMs<=0)throw TypeError('Native viewport CDP/writer/positive deadline required');
 const deadline=performance.now()+timeoutMs;let timer,terminal=false;
 const check=()=>{if(terminal||performance.now()>=deadline){const error=new Error('Native combat viewport capture timeout');error.name='TimeoutError';throw error;}};
 // Reserve/observe the request before external CDP code. A late reply may be
 // consumed, but never initiate decoding or a new file write after timeout.
 const pending=Promise.resolve().then(()=>{check();return cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:false});}).then(result=>{
  check();const png=Buffer.from(result.data||'','base64'),info=validateGameplayViewportPng(png,width,height);check();
  return Promise.resolve(save(png)).then(()=>{check();return info;});
 });
 try{return await Promise.race([pending,new Promise((_,reject)=>{const expire=()=>{const left=deadline-performance.now();if(left>0){timer=setTimeout(expire,left);return;}terminal=true;const error=new Error('Native combat viewport capture timeout');error.name='TimeoutError';reject(error);};timer=setTimeout(expire,Math.max(0,deadline-performance.now()));})]);}
 finally{terminal=true;clearTimeout(timer);}
}
