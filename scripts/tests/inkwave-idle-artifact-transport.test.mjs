import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {serveIdleArtifact} from '../check-inkwave-idle-resources.mjs';

const sha=body=>crypto.createHash('sha256').update(body).digest('hex');
function fixture(t){
 const site=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'idle-artifacts-'))),artifacts={};
 t.after(()=>fs.rmSync(site,{recursive:true,force:true}));
 const add=(key,body)=>{fs.mkdirSync(path.dirname(path.join(site,key)),{recursive:true});fs.writeFileSync(path.join(site,key),body);artifacts[key]=sha(body);};
 const loaded=new Set(),calls=[];
 const route=(url,method='GET')=>({request:()=>({url:()=>url,method:()=>method}),fetch(){throw Error('Double HTTP hop must not run');},async continue(){calls.push('continue');},async fulfill(response){calls.push(response);}});
 return {site,manifest:{artifacts},add,loaded,calls,route};
}
test('root query, versioned modules and binary images use actual SHA-verified bytes without an HTTP hop',async t=>{
 const f=fixture(t);
 for(const [key,url,body,mime] of [
  ['index.html','http://127.0.0.1:1234/?devstage&skipTitle',Buffer.from('<html>real</html>'),'text/html'],
  ['_versions/abc/src/fx/fxHooks.js','http://127.0.0.1:1234/_versions/abc/src/fx/fxHooks.js',Buffer.from('export const fx=1;'),'text/javascript'],
  ['a b.png','http://127.0.0.1:1234/a%20b.png',Buffer.from([0,255,13,10]),'image/png']
 ]){
  f.add(key,body);assert.equal(await serveIdleArtifact(f.route(url),f.site,f.manifest,f.loaded),key);
  const response=f.calls.at(-1);assert.equal(response.status,200);assert.equal(response.headers['content-type'],mime);assert.deepEqual(response.body,body);assert(f.loaded.has(key));
 }
 assert.equal(f.calls.length,3);
});
test('unlisted GETs and other methods continue to the real server without recording fake loaded evidence',async t=>{
 const f=fixture(t);f.add('index.html','real');
 for(const [url,method] of [['http://127.0.0.1/missing.js','GET'],['http://127.0.0.1/','POST'],['http://127.0.0.1/','HEAD']])assert.equal(await serveIdleArtifact(f.route(url,method),f.site,f.manifest,f.loaded),null);
 assert.deepEqual(f.calls,['continue','continue','continue']);assert.equal(f.loaded.size,0);
});
test('modified or missing listed bytes fail before fulfilling or recording loaded evidence',async t=>{
 const f=fixture(t);f.add('index.html','original');fs.writeFileSync(path.join(f.site,'index.html'),'changed');
 await assert.rejects(serveIdleArtifact(f.route('http://127.0.0.1/'),f.site,f.manifest,f.loaded),/Loaded byte mismatch/);
 fs.unlinkSync(path.join(f.site,'index.html'));
 await assert.rejects(serveIdleArtifact(f.route('http://127.0.0.1/'),f.site,f.manifest,f.loaded),/ENOENT/);
 assert.equal(f.calls.length,0);assert.equal(f.loaded.size,0);
});
test('manifest entries cannot escape the site through encoded paths or symlinks',async t=>{
 const f=fixture(t),outside=fs.mkdtempSync(path.join(os.tmpdir(),'idle-outside-'));
 t.after(()=>fs.rmSync(outside,{recursive:true,force:true}));fs.writeFileSync(path.join(outside,'secret.js'),'outside');
 fs.symlinkSync(path.join(outside,'secret.js'),path.join(f.site,'link.js'));f.manifest.artifacts['link.js']=sha('outside');f.manifest.artifacts['../secret.js']=sha('outside');
 for(const url of ['http://127.0.0.1/link.js','http://127.0.0.1/..%2Fsecret.js'])await assert.rejects(serveIdleArtifact(f.route(url),f.site,f.manifest,f.loaded),/Invalid build artifact path/);
 assert.equal(f.calls.length,0);assert.equal(f.loaded.size,0);
});
test('cold observer completes before releasing unchanged main bytes and propagates its original failure',async t=>{
 const f=fixture(t),key='_versions/abc/src/main.js',url='http://127.0.0.1/'+key;
 f.add(key,'export const main=1;');let observed=false;
 await serveIdleArtifact(f.route(url),f.site,f.manifest,f.loaded,async event=>{assert.deepEqual(event,{key,url});assert.equal(f.calls.length,0);assert.equal(new URL('./core/ctx.js',event.url).pathname,'/_versions/abc/src/core/ctx.js');await Promise.resolve();observed=true;});
 assert(observed);assert.equal(f.calls.length,1);assert.equal(f.calls[0].body.toString(),'export const main=1;');
 const failure=Error('cold observer failed');
 await assert.rejects(serveIdleArtifact(f.route(url),f.site,f.manifest,f.loaded,async()=>{throw failure;}),e=>e===failure);
 assert.equal(f.calls.length,1);
});
