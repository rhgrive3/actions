// Rejected candidate benchmark, not a runtime dependency.
// npm pack @noble/hashes@1.8.0; verify registry SHA512 and unpack/install locally.
// NOBLE_SHA1_MODULE=/absolute/package/esm/legacy.js node .../benchmark-source-sha1.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const module=process.env.NOBLE_SHA1_MODULE;if(!module)throw Error('NOBLE_SHA1_MODULE required');
const {sha1}=await import(pathToFileURL(module));
if(process.argv[2]){
 const mode=process.argv[2],size=Number(process.argv[3]),input=Buffer.alloc(size,0x5a),header=Buffer.from('blob '+size+'\0');
 const before=process.memoryUsage(),start=performance.now();let digest;
 if(mode==='native'){const joined=new Uint8Array(header.length+input.length);joined.set(header);joined.set(input,header.length);digest=Buffer.from(await crypto.webcrypto.subtle.digest('SHA-1',joined)).toString('hex');}
 else digest=Buffer.from(sha1.create().update(header).update(input).digest()).toString('hex');
 const elapsed=performance.now()-start,after=process.memoryUsage(),peakRss=process.resourceUsage().maxRSS*1024;
 assert.equal(digest,crypto.createHash('sha1').update(header).update(input).digest('hex'));console.log(JSON.stringify({mode,size,elapsed,before,after,peakRss}));
}else{
 const vectors=[['','da39a3ee5e6b4b0d3255bfef95601890afd80709'],['abc','a9993e364706816aba3e25717850c26c9cd0d89d'],['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq','84983e441c3bd26ebaae4aa1f95129e5e54670f1'],['a'.repeat(1000000),'34aa973cd4c4daa4f61eeb2bdbad27316534016f']];
 for(const [text,expected]of vectors){const input=Buffer.from(text);for(const chunk of [1,63,64,65,65536]){const h=sha1.create();for(let i=0;i<input.length;i+=chunk)h.update(input.subarray(i,i+chunk));assert.equal(Buffer.from(h.digest()).toString('hex'),expected);}}
 for(let size=0;size<260;size++){const input=Buffer.alloc(size,0x7f),header=Buffer.from('blob '+size+'\0');assert.equal(Buffer.from(sha1.create().update(header).update(input).digest()).toString('hex'),crypto.createHash('sha1').update(header).update(input).digest('hex'));}
 const rows=[];for(const size of [1048576,16777216,67108864])for(const mode of ['native','stream']){const r=spawnSync(process.execPath,[new URL(import.meta.url).pathname,mode,String(size)],{env:process.env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);rows.push(JSON.parse(r.stdout));}
 const report={node:process.version,package:'@noble/hashes@1.8.0',integrity:'sha512-jCs9ldd7NwzpgXDIf6P3+NrHh9/sD6CQdxHyjQI+h/6rDNo88ypBxxz45UDuZHz9r3tNz7N/VInSVoVdtXEI4A==',vectors:20,gitLengthVectors:260,auditScope:'Upstream independent audit excludes SHA1',rows,decision:'Rejected as default runtime: extra synchronous CPU / main-thread work; keep WebCrypto. No physical device benefit claimed.'};
 fs.writeFileSync(new URL('../../../reports/queue-native-20261022/sha1-candidate-node.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(rows.map(({mode,size,elapsed,peakRss,before,after})=>({mode,size,elapsed,peakRss,arrayBufferGrowth:after.arrayBuffers-before.arrayBuffers}))));
}
