import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import crypto from 'node:crypto';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const old=fs.readFileSync(new URL('./fixtures/added-assets/source-cache-before.mjs.txt',import.meta.url),'utf8'),source=fs.readFileSync(new URL('../../native-stages/runtime/source-cache.mjs',import.meta.url),'utf8');
async function download(source,data,{length=data.length,header=''+data.length,known=true,parts=7,bad=false,failRead=false}={}){
 const events=[],progress=[],allocations=[],cleanup={cancel:0,release:0},writes=[];let cursor=0,clock=0;
 class Pixels extends Uint8Array{constructor(...args){super(...args);if(typeof args[0]==='number'){allocations.push(args[0]);events.push('allocate:'+args[0]);}}}
 const chunk=Math.max(1,Math.ceil(data.length/parts)),reader={async read(){events.push('read');if(failRead&&cursor>=chunk)throw failure;const value=data.slice(cursor,cursor+chunk);cursor+=value.length;return value.length?{done:false,value}:{done:true};},async cancel(){cleanup.cancel++;},releaseLock(){cleanup.release++;}};
 const failure=Error('stream read failed'),expected={sha256:crypto.createHash('sha256').update(data).digest('hex'),...(known?{bytes:length}:{})};if(bad)expected.sha256='0'.repeat(64);
 const cache={async match(){return null;},async put(url){if(url==='https://source.invalid/fixture.obj')writes.push(url);}};
 const context=vm.createContext({console,crypto:crypto.webcrypto,Uint8Array:Pixels,TextEncoder,Response,Date,performance:{now:()=>clock+=80},caches:{keys:async()=>[],open:async()=>cache,delete:async()=>true},fetch:async()=>({ok:true,headers:{get:()=>header},body:{getReader:()=>reader}})});
 const mod=new vm.SourceTextModule(source,{context});await mod.link(()=>{throw Error('unexpected import');});await mod.evaluate();let bytes,error;
 try{bytes=await mod.namespace.sourceBytes('progress-unit','https://source.invalid/fixture.obj',expected,null,p=>progress.push({...p}));}catch(e){error=e;}
 return{bytes,error,progress,events,allocations,cleanup,writes,failure};
}
test('authenticated source progress writes directly while preserving bytes, callback cadence and cache integrity',async()=>{
 for(const n of [0,1,65,1024,16384])for(const parts of [1,2,7,33]){
  const data=Uint8Array.from({length:n},(_,i)=>(i*31+17)%256),a=await download(old,data,{parts}),b=await download(source,data,{parts});assert.equal(a.error,undefined);assert.equal(b.error,undefined);assert.deepEqual(Buffer.from(b.bytes),Buffer.from(a.bytes));assert.deepEqual(b.progress,a.progress);assert.deepEqual(b.writes,a.writes);assert.equal(b.cleanup.cancel,0);assert.equal(b.cleanup.release,1);
  if(n>32){assert(b.events.indexOf('allocate:'+n)<b.events.indexOf('read'));assert(a.events.indexOf('allocate:'+n)>a.events.indexOf('read'));}
 }
});
test('untrusted HTTP length cannot cause upfront allocations and unknown pinned length retains exact fallback',async()=>{
 const data=Uint8Array.from({length:1024},(_,i)=>i%256);
 for(const known of [true,false])for(const header of ['','2199023255552','-3','17']){
  const b=await download(source,data,{known,header});assert.equal(b.error,undefined);assert.deepEqual(Buffer.from(b.bytes),Buffer.from(data));assert(!b.allocations.some(n=>n>data.length));if(!known)assert(b.events.indexOf('allocate:1024')>b.events.indexOf('read'));
 }
});
test('short, overflow, bad integrity and reader failure cannot publish bytes and always release stream ownership',async()=>{
 const data=new Uint8Array(257).fill(37);
 for(const options of [{length:258},{length:256},{bad:true},{failRead:true}]){
  const b=await download(source,data,options);assert(b.error);assert.equal(b.bytes,undefined);assert.equal(b.writes.length,0);assert.equal(b.cleanup.release,1);
  if(options.failRead){assert.equal(b.error,b.failure);assert.equal(b.cleanup.cancel,1);}else assert.match(b.error.message,/Source asset (byte count|integrity) mismatch/);
 }
});
const raw=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8');
const method=code=>{const i=code.indexOf('  async _loadLightmap('),j=code.indexOf('\n  // deck slabs',i);assert(i>=0&&j>i);return code.slice(i,j);};
function lightmap(code){const calls=[],textures=[],metas=new Map(),warning=[];const THREE={NoColorSpace:'none',LinearMipmapLinearFilter:'mipmap',LinearFilter:'linear',TextureLoader:class{async loadAsync(url){const tex={url,disposed:0,dispose(){this.disposed++;}};textures.push(tex);return tex;}}};
 const Game=new Function('THREE','fetch','console',`return class {${method(code)}}`)(THREE,async url=>{calls.push(url);const id=/([^/]+)\.json$/.exec(url)[1];if(metas.get(id)==='error')throw Error('metadata failed');return{json:async()=>metas.get(id)||{hash:id,ppm:8,size:2048}};},{warn(...a){warning.push(a);}});
 const level=id=>({faces:[{light:1},{light:2}],lightSize:2048,layoutLightmap(ppm,size){this.ppm=ppm;this.lightSize=size;this.layoutHash=id;}});
 return{game:new Game(),calls,textures,metas,warning,level};}
test('actual composed lightmap re-entry reuses only verified bounded metadata and keeps every GPU texture world-owned',async()=>{
 const a=lightmap(raw),b=lightmap(adaptBuildSource('src/main.js',raw));
 for(let i=0;i<40;i++){const id=['tidewater','kelpline','halyard','cargo'][i%4],la=a.level(id),lb=b.level(id),ta=await a.game._loadLightmap(la,id),tb=await b.game._loadLightmap(lb,id);assert.deepEqual({...tb,dispose:null},{...ta,dispose:null});assert.deepEqual({...lb,layoutLightmap:null},{...la,layoutLightmap:null});if(i)assert.notEqual(tb,b.textures[i-1]);ta.dispose();tb.dispose();}
 assert.equal(a.calls.length,40);assert.equal(b.calls.length,4);assert.equal(b.textures.length,40);assert(b.textures.every(t=>t.disposed===1));assert.equal(b.game._iwLightmapMetadata.size,4);for(const v of b.game._iwLightmapMetadata.values())assert.deepEqual(Object.keys(v),['hash','ppm','size']);
});
test('changed layout revalidates fresh metadata, invalid metadata falls back and cache remains bounded per Game',async()=>{
 const b=lightmap(adaptBuildSource('src/main.js',raw));await b.game._loadLightmap(b.level('one'),'one');b.metas.set('one',{hash:'edited',ppm:4,size:1024});const tex=await b.game._loadLightmap(b.level('edited'),'one');assert(tex);assert.equal(b.calls.length,2);assert.equal(b.game._iwLightmapMetadata.get('one').hash,'edited');
 const bad=b.level('wrong');assert.equal(await b.game._loadLightmap(bad,'one'),null);assert(bad.faces.every(f=>f.light===null));assert.equal(bad.lightSize,0);assert.equal(b.game._iwLightmapMetadata.has('one'),false);
 b.metas.set('missing','error');const failed=b.level('missing');assert.equal(await b.game._loadLightmap(failed,'missing'),null);assert(failed.faces.every(f=>f.light===null));assert.equal(b.game._iwLightmapMetadata.has('missing'),false);
 for(const id of ['a','b','c','d','e','f'])await b.game._loadLightmap(b.level(id),id);assert.equal(b.game._iwLightmapMetadata.size,4);assert.equal(b.game._iwLightmapMetadata.has('a'),false);assert.equal(b.game._iwLightmapMetadata.has('b'),false);
 const fresh=lightmap(adaptBuildSource('src/main.js',raw));await fresh.game._loadLightmap(fresh.level('f'),'f');assert.equal(fresh.calls.length,1);assert.notEqual(fresh.game._iwLightmapMetadata,b.game._iwLightmapMetadata);
});
test('stale cached lightmap followed by stale fetched metadata makes only one bounded refetch and evicts the entry',async()=>{
 const b=lightmap(adaptBuildSource('src/main.js',raw));
 await b.game._loadLightmap(b.level('one'),'one');
 b.metas.set('one',{hash:'still-stale',ppm:4,size:1024});
 const level=b.level('edited');
 assert.equal(await b.game._loadLightmap(level,'one'),null);
 assert.equal(b.calls.length,2);assert.equal(b.textures.length,1);
 assert.equal(b.game._iwLightmapMetadata.has('one'),false);
 assert.equal(level.lightSize,0);assert(level.faces.every(f=>f.light===null));
});
