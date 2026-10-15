// Reproduce the test-only fixed model-source archive from its exact canonical repository commit.
// Run with Node 24.19.0: node --experimental-vm-modules scripts/freeze-inkwave-lod-model-fixture.mjs /path/to/main805
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import zlib from 'node:zlib';import vm from 'node:vm';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
const ROOT=path.resolve(process.argv[2]||'.'),COMMIT='80555b8cf12e3a9529c0f461bd2acc3ee17f1764';
assert.equal(execFileSync('git',['-C',ROOT,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),COMMIT,'use the exact immutable main805 checkout');
assert.equal(execFileSync('git',['-C',ROOT,'status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim(),'','tracked source must be clean');
const {adaptBuildSource}=await import(pathToFileURL(path.join(ROOT,'scripts/inkwave-source-composition.mjs')).href);
const gitsha=b=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(b)+'\0').update(b).digest('hex');
const resolve=(spec,from)=>spec==='three'?'vendor/three/build/three.module.js':spec.startsWith('three/addons/')?'vendor/three/jsm/'+spec.slice(13):path.posix.normalize(path.posix.join(path.posix.dirname(from),spec));
const sources={},vendors={},queue=['src/game/character-weapons.js','patches/splatoon3/runtime/weapon-models/registry.mjs'];
for(let at=0;at<queue.length;at++){
 const id=queue[at];if(sources[id]||vendors[id])continue;
 const upstream=!id.startsWith('patches/'),rel=(upstream?'inkwave-public/':'')+id,raw=fs.readFileSync(path.join(ROOT,rel),'utf8');
 const code=upstream&&!id.startsWith('vendor/')?adaptBuildSource(id,raw):raw;
 if(id.startsWith('vendor/'))vendors[id]={gitSha:gitsha(raw)};
 else sources[id]={gitSha:gitsha(raw),adaptedSha256:crypto.createHash('sha256').update(code).digest('hex'),code};
 const module=new vm.SourceTextModule(code);
 for(const spec of module.dependencySpecifiers){assert.ok(spec.startsWith('.')||spec.startsWith('three'),'no external dependencies');queue.push(resolve(spec,id));}
}
const data=Buffer.from(JSON.stringify({commit:COMMIT,scope:'Existing repository source only. Main805 immutable model/geometry dependency closure, upstream public modules adapted by the same production source composition. Vendor source is reused with exact Git SHA verification. No user attachments.',sources,vendors}));
const compressed=zlib.gzipSync(data,{level:9}),out=path.resolve(process.argv[3]||'weapon-lod-main805-sources.json.gz');fs.writeFileSync(out,compressed);
console.log(JSON.stringify({out,compressedBytes:compressed.length,expandedBytes:data.length,sha256:crypto.createHash('sha256').update(compressed).digest('hex')}));
