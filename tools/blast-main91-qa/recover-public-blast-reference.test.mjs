import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedURL,selectVideo,limitedFetch} from './recover-public-blast-reference.mjs';
test('fixed HTTPS host rejects credentials, aliases and insecure schemes',()=>{
 assert.equal(allowedURL('https://video.twimg.com/a.mp4','video.twimg.com').hostname,'video.twimg.com');
 for(const bad of ['http://video.twimg.com/a.mp4','https://video.twimg.com.evil.test/a.mp4','https://evil.test/a.mp4','https://u:p@video.twimg.com/a.mp4','https://video.twimg.com:444/a.mp4'])assert.throws(()=>allowedURL(bad,'video.twimg.com'));
});
test('selects allowed MP4 only; highest bitrate deterministic',()=>{
 assert.equal(selectVideo({video:{variants:[{src:'https://video.twimg.com/a.mp4',bitrate:1},{src:'https://video.twimg.com/b.mp4',bitrate:2},{src:'https://evil.test/a.mp4',bitrate:99},{src:'https://video.twimg.com/a.m3u8',bitrate:100}]}}),'https://video.twimg.com/b.mp4');
 assert.equal(selectVideo({mediaDetails:[{video_info:{variants:[{url:'https://video.twimg.com/c.mp4'}]}}]}),'https://video.twimg.com/c.mp4');
 assert.throws(()=>selectVideo({}));
});
function response({status=200,length=null,location=null,chunks=[]}={}){
 return {status,ok:status===200,headers:{get:name=>name==='location'?location:length},
 body:{cancel:async()=>{},async *[Symbol.asyncIterator](){for(const c of chunks)yield Buffer.from(c);}}};
}
test('redirect host and hop bounds are enforced before extra fetch',async()=>{
 const old=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return response({status:302,location:'https://evil.test/a.mp4'});};
  await assert.rejects(limitedFetch('https://video.twimg.com/a.mp4','video.twimg.com',4),/fixed HTTPS host/);assert.equal(calls,1);
  calls=0;globalThis.fetch=async()=>{calls++;return response({status:302,location:'/b.mp4'});};
  await assert.rejects(limitedFetch('https://video.twimg.com/a.mp4','video.twimg.com',4),/redirect bound/);assert.equal(calls,4);
 }finally{globalThis.fetch=old;}
});
test('declared and streaming size limits reject; bounded bytes unchanged',async()=>{
 const old=globalThis.fetch;
 try{
  globalThis.fetch=async()=>response({length:'5'});
  await assert.rejects(limitedFetch('https://video.twimg.com/a.mp4','video.twimg.com',4),/content-length/);
  globalThis.fetch=async()=>response({chunks:[[1,2,3],[4,5]]});
  await assert.rejects(limitedFetch('https://video.twimg.com/a.mp4','video.twimg.com',4),/stream exceeds/);
  globalThis.fetch=async()=>response({chunks:[[1,2],[3,4]]});
  assert.deepEqual((await limitedFetch('https://video.twimg.com/a.mp4','video.twimg.com',4)).bytes,Buffer.from([1,2,3,4]));
 }finally{globalThis.fetch=old;}
});
test('network rejection is surfaced rather than replaced with fabricated bytes',async()=>{
 const old=globalThis.fetch;try{globalThis.fetch=async()=>{throw Error('fixture timeout');};await assert.rejects(limitedFetch('https://video.twimg.com/a.mp4','video.twimg.com',4),/fixture timeout/);}finally{globalThis.fetch=old;}
});
