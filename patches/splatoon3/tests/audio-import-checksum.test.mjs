import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {AuthorizedSamplePack} from '../runtime/audio/authorized-samples.mjs';
const bytes=()=>new Uint8Array([1,2,3,4,5,6,7,8]).buffer;
const checksum=createHash('sha256').update(new Uint8Array(bytes())).digest('hex');
const manifest=clips=>({schema:1,usageRights:'Synthetic generated test fixture',clips});
const clip=(variant,extra={})=>({id:'shooter',event:'fire',file:'sample.mp3',variant,...extra});
function fixture({detach=false}={}) {
  const fetched=[],decoded=[];
  const ctx={state:'running',sampleRate:8000,async decodeAudioData(input){
    decoded.push(input);if(detach)structuredClone(input,{transfer:[input]});
    return {length:64,numberOfChannels:1,sampleRate:8000,duration:.008,getChannelData:()=>new Float32Array(64)};
  }};
  const pack=new AuthorizedSamplePack(ctx,{maxBytes:1024,fetcher:async()=>{
    const body=bytes();fetched.push(body);return {ok:true,headers:{get:()=>null},arrayBuffer:async()=>body};
  }});
  return {pack,fetched,decoded};
}
test('checksum mismatch rejects fetched bytes before the native decoder receives them',async()=>{
  const f=fixture();const result=await f.pack.load(manifest([clip(0,{sha256:'f'.repeat(64)})]));
  assert.equal(result.loaded,0);assert.equal(result.rejected,1);assert.match(result.errors[0].error,/Checksum/);
  assert.equal(f.decoded.length,0);assert.equal(f.pack.loaded.size,0);
});
test('one bad declaration cannot poison a later valid borrower of the same downloaded file',async()=>{
  const f=fixture({detach:true});const result=await f.pack.load(manifest([
    clip(0,{sha256:'f'.repeat(64)}),clip(1,{sha256:checksum}),clip(2,{sha256:checksum}),
  ]),{concurrency:1});
  assert.equal(result.loaded,2);assert.equal(result.rejected,1);assert.equal(f.fetched.length,1);assert.equal(f.decoded.length,1);
  assert.equal(f.pack.pick('shooter','fire',0).buffer,f.pack.pick('shooter','fire',1).buffer);
  assert.equal(f.fetched[0].byteLength,8,'checksum borrowers retain their verified original bytes');
});
test('pure unhashed files give decodeAudioData the fetched buffer once without copying it',async()=>{
  const f=fixture({detach:true});const result=await f.pack.load(manifest([clip(0),clip(1)]),{concurrency:2});
  assert.equal(result.loaded,2);assert.equal(f.decoded.length,1);assert.equal(f.decoded[0],f.fetched[0]);
  assert.equal(f.fetched[0].byteLength,0,'test decoder transferred the exact original buffer');
});
test('mixed unhashed and hashed borrowers preserve bytes for every declared checksum',async()=>{
  const f=fixture({detach:true});const result=await f.pack.load(manifest([clip(0),clip(1,{sha256:checksum})]),{concurrency:1});
  assert.equal(result.loaded,2);assert.equal(result.rejected,0);assert.equal(f.fetched.length,1);assert.equal(f.decoded.length,1);
  assert.notEqual(f.decoded[0],f.fetched[0]);assert.equal(f.fetched[0].byteLength,8);
});
