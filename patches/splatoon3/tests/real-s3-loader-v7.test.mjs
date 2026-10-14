import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RealS3SampleLoader,sameModuleFetch} from '../runtime/audio/real-s3-loader.mjs';
import {AuthorizedSamplePack,validateAuthorizedManifest} from '../runtime/audio/authorized-samples.mjs';

const manifest=JSON.parse(fs.readFileSync(new URL('../runtime/audio/real-s3-samples.json',import.meta.url),'utf8'));
const ctx={sampleRate:48000,createBuffer(ch,n,sr){let data=Array.from({length:ch},()=>new Float32Array(n));return{numberOfChannels:ch,length:n,sampleRate:sr,duration:n/sr,getChannelData:i=>data[i]};},async decodeAudioData(){return this.createBuffer(1,4800,48000)}};
const response={ok:true,headers:{get:()=>null},arrayBuffer:async()=>new ArrayBuffer(32)};

 test('2022 real S3 source list is compatible with main/kit audio registry',()=>{
  const valid=validateAuthorizedManifest(manifest);
  assert.equal(valid.length,268);
  assert.ok(valid.every(x=>x.file.startsWith('s3-real/Wp_')||x.file.startsWith('s3-real/Sp_')));
  // 260 catalogued file/Drive-ID associations from v10, plus 8 new SHA-audited
  // local files whose individual Drive IDs have not been independently indexed.
  const originals=valid.filter(x=>x.sourceFileId!=null);
  const added=valid.filter(x=>x.sourceFileId==null);
  assert.equal(originals.length,260);assert.equal(added.length,8);
  assert.ok(originals.every(x=>/^[A-Za-z0-9_-]{20,}$/.test(x.sourceFileId)));
  assert.ok(added.every(x=>x.sourceIndexState?.startsWith('unresolved-per-file-Google-ID') &&
    /^[0-9a-f]{64}$/.test(x.sha256) && x.sourceURL===null));
  assert.equal(new Set(valid.map(x=>x.id+':'+x.event+':'+x.variant)).size,valid.length);
  assert.ok(valid.some(x=>x.id==='s3-charger-long'&&x.event==='fire_full'));
  assert.ok(valid.some(x=>x.id==='s3-brush-mini'&&x.event==='fire'));
  assert.ok(valid.some(x=>x.id==='s3-shelter-normal'&&x.event==='purge'));
  assert.ok(!valid.some(x=>x.id==='s3-stringer-explosion'));
 });
 test('real S3 asset URLs cannot escape their installed folder or point to remote URLs',()=>{
  for(const input of ['https://bad.example/evil.mp3','./../secret.mp3','./s3-real/../evil.mp3','./s3-real/file.mp3?x=1','./s3-real/file.wav'])
    assert.throws(()=>sameModuleFetch(input,()=>response));
  let captured;
  sameModuleFetch('./s3-real/Wp_ChargerLong_Shot_00.mp3',url=>{captured=String(url);return response});
  assert.ok(captured.endsWith('/patches/splatoon3/runtime/audio/s3-real/Wp_ChargerLong_Shot_00.mp3'));
 });
 test('concurrent outfit and special reads are serialized rather than losing selected samples',async()=>{
  let manifestDownloads=0,assetDownloads=0;
  const bank={authorized:new AuthorizedSamplePack(ctx,{fetcher:async()=>response})};
  const small={...manifest,clips:manifest.clips.filter(x=>(x.id==='s3-charger-long'&&x.event==='fire')||(x.id==='special:trizooka'&&x.event==='fire'))};
  const loader=new RealS3SampleLoader(bank,{fetcher:async()=>{manifestDownloads++;return{ok:true,json:async()=>small}},assetFetcher:async()=>{assetDownloads++;return response}});
  const [a,b]=await Promise.all([loader.ensure('s3-charger-long'),loader.ensure('special:trizooka')]);
  assert.equal(a.rejected,0);assert.equal(b.rejected,0);
  assert.ok(bank.authorized.pick('s3-charger-long','fire'));
  assert.ok(bank.authorized.pick('special:trizooka','fire'));
  assert.equal(manifestDownloads,1);assert.equal(assetDownloads,2);
  const cached=await loader.ensure('s3-charger-long');assert.equal(cached.cached,true);assert.equal(assetDownloads,2);
  const missing=await loader.ensure('s3-charger-pencil');assert.equal(missing.missing,true);
 });
 test('a missing real S3 pack fails closed and never permits remote sample fetches',async()=>{
  let assets=0,tries=0;
  const bank={authorized:new AuthorizedSamplePack(ctx,{fetcher:async()=>response})};
  const loader=new RealS3SampleLoader(bank,{fetcher:async()=>{tries++;return{ok:false,status:404}},assetFetcher:async()=>{assets++;return response}});
  assert.equal((await loader.ensure('shooter')).unavailable,true);
  await loader.ensure('shooter');
  assert.equal(tries,1);assert.equal(assets,0);
  assert.equal(loader.stats().status,'unavailable');
  loader.manifestRetryAt=Date.now()-1;
  await loader.ensure('shooter');assert.equal(tries,2,'transient manifest failure retries after its bounded backoff');
 });
 test('small cache evicts dormant clip without removing a currently playing buffer reference',async()=>{
   const bank=new AuthorizedSamplePack(ctx,{maxBytes:19200,fetcher:async()=>response});
   const mini={schema:1,usageRights:manifest.usageRights,clips:[
     {id:'shooter',event:'fire',file:'a.mp3',variant:0},
     {id:'shooter',event:'fire',file:'b.mp3',variant:1}
   ]};
   const r=await bank.load(mini,{concurrency:1});
   assert.equal(r.loaded,2);assert.equal(r.rejected,0);
   assert.equal(bank.stats().clips,1);assert.equal(bank.pick('shooter','fire').file,'b.mp3');
 });
