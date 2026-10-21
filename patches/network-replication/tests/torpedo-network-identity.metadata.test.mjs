import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
const adapter = new URL('../adapter.mjs',import.meta.url);

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function identity(read=fs.readFileSync){
 const source=fs.readFileSync(adapter,'utf8');
 const start='export function networkIdentity() {';
 const end='\nexport function adaptNetworkSource';
 assert.equal(source.split(start).length,2);assert.equal(source.split(end).length,2);
 const code=source.slice(source.indexOf(start),source.indexOf(end)).replace('export ','').replaceAll('import.meta.url','ADAPTER_URL');
 return vm.runInNewContext(code+';networkIdentity()', {fs:{readFileSync:read},crypto,URL,ADAPTER_URL:adapter.href},{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}});
}
for(const helperName of ['torpedo-contact-commit.mjs','torpedo-birth-envelope.mjs','torpedo-launch-set.mjs']){
const helper = new URL('../'+helperName,import.meta.url);
test(helperName+' is strict identity input; one-byte source mutation changes inputHash',()=>{
 const base=identity();assert.equal(base[helperName],hash(fs.readFileSync(helper)));
 const changed=identity(url=>{const b=fs.readFileSync(url);if(url.href!==helper.href)return b;const out=Buffer.from(b);out[out.length-1]^=1;return out;});
 assert.notEqual(changed[helperName],base[helperName]);
 assert.notEqual(hash(JSON.stringify(changed)),hash(JSON.stringify(base)));
 assert.deepEqual(Object.keys(changed),Object.keys(base));assert.ok(Object.keys(base).every(k=>!k.includes('/tests/')));
 assert.throws(()=>identity(url=>{if(url.href===helper.href)throw new Error('missing helper');return fs.readFileSync(url);}),/missing helper/);
});
test(helperName+' emitted byte changes revision, not identity-only changes',()=>{
 const build=fs.readFileSync(new URL('../../../scripts/build-inkwave.mjs',import.meta.url),'utf8');
 assert.ok(build.includes('const revision = sha256(JSON.stringify(walk(BUILD).sort().map(file => [path.relative(BUILD,file),sha256(fs.readFileSync(file))])));'));
 const bytes=fs.readFileSync(helper),changed=Buffer.from(bytes);changed[changed.length-1]^=1;
 const revision=b=>hash(JSON.stringify([['patches/network-replication/'+helperName,hash(b)]]));
 assert.notEqual(revision(bytes),revision(changed));assert.equal(revision(bytes),revision(bytes));
});

}
