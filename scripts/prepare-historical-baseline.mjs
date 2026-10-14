#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {execFileSync}from'node:child_process';
const [sourceArg,targetArg,repositoryArg]=process.argv.slice(2),source=path.resolve(sourceArg),target=path.resolve(targetArg),repository=path.resolve(repositoryArg||sourceArg),base='b3e8312c9ab4be773561ff8c28ff3423271593b5';
assert.ok(!fs.existsSync(target),'Historical snapshot must be fresh');assert.ok(!target.startsWith(source+path.sep),'Snapshot cannot be nested inside source');
const expectedBytes=fs.readFileSync(new URL('./b3e-public-build.json',import.meta.url)),hash=b=>crypto.createHash('sha256').update(b).digest('hex');assert.equal(hash(expectedBytes),'78b852e50d358ec27bb0f9a39e1a8090274a511dd1788f63e13eb7ec8d4dead7');const expected=JSON.parse(expectedBytes);
const git=(...args)=>execFileSync('git',['-C',repository,...args]);const tree=new Map(git('ls-tree','-rz',base).toString().split('\0').filter(Boolean).map(row=>{const[meta,p]=row.split('\t'),[mode,type,sha]=meta.split(' ');assert.equal(type,'blob');assert.ok(mode==='100644'||mode==='100755','Unsupported historical file mode');return[p,{mode,sha}];}));
const blob=b=>crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex');let linked=0,replaced=0;
for(const[rel,entry]of tree){
 const from=path.join(source,rel),to=path.join(target,rel);if(!fs.existsSync(from))continue;
 const bytes=fs.readFileSync(from);fs.mkdirSync(path.dirname(to),{recursive:true});
 if(blob(bytes)===entry.sha){fs.linkSync(from,to);linked++;}else{const old=git('show',base+':'+rel);assert.equal(blob(old),entry.sha);const tmp=to+'.tmp';fs.writeFileSync(tmp,old,{mode:entry.mode==='100755'?0o755:0o644});fs.renameSync(tmp,to);replaced++;}
}
const inputPath=p=>{const i=p.indexOf('/'),kind=p.slice(0,i),rest=p.slice(i+1);return({'upstream':'inkwave-public','patch':'patches/splatoon3','build-script':'scripts'}[kind]||'patches/'+kind)+'/'+rest;};
const required=Object.entries(expected.files).map(([p,h])=>[inputPath(p),h]);required.push(['scripts/build-inkwave.mjs',expected.build.script]);
for(const[rel,h]of required){const p=path.join(target,rel);if(!fs.existsSync(p)){const bytes=git('show',base+':'+rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes);}const b=fs.readFileSync(p);assert.equal(hash(b),h,'Historical input '+rel);assert.equal(blob(b),tree.get(rel)?.sha,'Historical tracked blob '+rel);}
// Verify every materialized file, not merely the four reverse-patched paths.
let verified=0;for(const[rel,entry]of tree){const p=path.join(target,rel);if(fs.existsSync(p)){assert.equal(blob(fs.readFileSync(p)),entry.sha,rel);verified++;}}
const receipt={base,expectedManifestSHA256:hash(expectedBytes),linked,replaced,verifiedMaterializedTrackedFiles:verified,verifiedRequiredInputs:required.length,sourceInodesNeverWritten:true,scope:'Partial source snapshot when input source is partial; every recorded runtime/build input plus every materialized tracked file verified against historical Git blobs. Final build must match complete official manifest and all artifacts.'};
fs.writeFileSync(path.join(path.dirname(target),'historical-source-receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
