import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import path from'node:path';import{fileURLToPath}from'node:url';import{makeSite,resolveRequest,pins,sha256}from'./binding.mjs';
const root=process.env.SOURCE_ROOT||fileURLToPath(new URL('../../../',import.meta.url));
const inputs={candidate:fs.readFileSync(path.join(root,'patches/native-stages/runtime/native-load.mjs')),baseline:fs.readFileSync(new URL('./baseline.mjs',import.meta.url)),cache:fs.readFileSync(path.join(root,'patches/native-stages/runtime/source-cache.mjs')),three:fs.readFileSync(path.join(root,'inkwave-public/vendor/three/build/three.module.js')),threeCore:fs.readFileSync(path.join(root,'inkwave-public/vendor/three/build/three.core.js'))};
test('Content-revision routes bind exact source and Three bytes',()=>{const s=makeSite(inputs);assert.match(s.manifest.revision,/^[a-f0-9]{64}$/);for(const[p,m]of Object.entries(s.manifest.artifacts)){const b=resolveRequest(s,s.prefix+p);assert.equal(sha256(b),m.sha256);assert.equal(b.length,m.bytes);}assert.equal(sha256(resolveRequest(s,s.prefix+'candidate/native-load.mjs')),pins.candidate);});
for(const key of Object.keys(pins))test('Reject altered '+key,()=>assert.throws(()=>makeSite({...inputs,[key]:Buffer.from('wrong')})));
for(const suffix of ['candidate/native-load.mjs?x=1','candidate/../candidate/native-load.mjs','candidate/%6eative-load.mjs','candidate/native-load.mjs.bak','missing.mjs'])test('Reject unbound route '+suffix,()=>{const s=makeSite(inputs);assert.throws(()=>resolveRequest(s,s.prefix+suffix));});
test('Reject old revision mixed with current modules',()=>{const s=makeSite(inputs);assert.throws(()=>resolveRequest(s,'/_versions/'+('0'.repeat(64))+'/candidate/native-load.mjs'));});

// Execute the literal classifier and reconstruction loop from both pinned runtimes.
for(const name of ['baseline','candidate'])test(name+' multiple fixture reconstructs distinct normals; old pair is rejected',()=>{
 const src=inputs[name].toString(), classify=src.match(/const p=readPixels\(\),mean=\[0,0,0\][\s\S]*?else for\(const m of matched\)m.channels\[role\]=[^;]+;/)?.[0];
 const loop=src.split('\n').find(line=>line.trimStart().startsWith('for(let i=0;i<pixels.length;i+=4){let x='));
 assert.ok(classify&&loop,'literal production normal operations present');
 const convert=new Function('pixels',`let encoding;const role='normal',matched=[{}],readPixels=()=>pixels;${classify}\n${loop}\nreturn {encoding,pixels:Array.from(pixels)};`);
 const decode=color=>convert(new Uint8ClampedArray([...color,255]));
 const first=decode([128,128,0]),old=decode([0,0,0]),next=decode([32,0,0]);
 assert.equal(first.encoding,'unorm-rg');assert.equal(next.encoding,'signed-byte-rg');
 assert.deepEqual(first.pixels,[128,128,255,255]);assert.deepEqual(old.pixels,first.pixels);
 assert.deepEqual(next.pixels,[160,128,251,255]);assert.notDeepEqual(next.pixels,first.pixels);
 const probe=fs.readFileSync(new URL('./probe.mjs',import.meta.url),'utf8');assert.ok(probe.includes('i?[32,0,0]:cfg.color'));
});
