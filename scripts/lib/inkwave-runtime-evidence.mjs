import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
export const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export const physicalLocation=name=>fs.existsSync(name)?fs.realpathSync(name):path.join(physicalLocation(path.dirname(name)),path.basename(name));
export function persistentDirectory(name){
 const resolved=physicalLocation(path.resolve(name));
 if(!resolved.startsWith('/mnt/workspace/'))throw Error('Persistent workspace required: '+resolved);
 fs.mkdirSync(resolved,{recursive:true});return resolved;
}
export function verifyRuntimeBuild(site,root,sha){
 if(!/^[a-f0-9]{40}$/.test(sha))throw Error('Full source SHA required');
 const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
 if(hash(JSON.stringify(manifest.artifacts))!==manifest.contentHash)throw Error('Manifest mismatch');
 for(const [file,expected]of Object.entries(manifest.artifacts)){
  const resolved=fs.realpathSync(path.join(site,file));
  if(!resolved.startsWith(fs.realpathSync(site)+'/'))throw Error('Artifact outside site');
  if(hash(fs.readFileSync(resolved))!==expected)throw Error('Artifact mismatch: '+file);
 }
 const namespaces={'upstream/':'inkwave-public/','patch/':'patches/splatoon3/','touch-layout/':'patches/touch-layout/','reliability/':'patches/reliability/','local-quality/':'patches/local-quality/'};
 const inputs=Object.entries(manifest.files).map(([name,expected])=>{
  const prefix=Object.keys(namespaces).find(p=>name.startsWith(p));if(!prefix)throw Error('Unknown input: '+name);
  return [namespaces[prefix]+name.slice(prefix.length),expected];
 });
 inputs.push(['scripts/build-inkwave.mjs',manifest.build.script]);
 const tree=new Map(execFileSync('git',['ls-tree','-r','-z',sha],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean).map(row=>{const [meta,file]=row.split('\t');return [file,meta.split(' ')[2]];}));
 const blobs=inputs.map(([file])=>{const blob=tree.get(file);if(!blob)throw Error('Missing source input: '+file);return blob;});
 const batch=execFileSync('git',['cat-file','--batch'],{cwd:root,input:blobs.join('\n')+'\n',maxBuffer:64*1024*1024});
 let offset=0;
 inputs.forEach(([file,expected],i)=>{
  const end=batch.indexOf(10,offset);const [blob,type,size]=batch.subarray(offset,end).toString().split(' ');
  if(blob!==blobs[i]||type!=='blob')throw Error('Invalid git source receipt');offset=end+1;
  const bytes=batch.subarray(offset,offset+Number(size));offset+=Number(size)+1;
  if(hash(bytes)!==expected)throw Error('Build differs from source SHA: '+file);
 });
 return manifest;
}
export function sampleStats(values){
 const a=[...values].sort((a,b)=>a-b);
 if(!a.length)return {n:0};
 return{n:a.length,median:a[Math.floor(a.length*.5)],p95:a[Math.min(a.length-1,Math.floor(a.length*.95))],max:a.at(-1)};
}

export function invalidWindows(scenarios,fixed){
 return scenarios.flatMap(s=>s.runs.filter(r=>fixed?r.counts.frame!==30:r.frames.n<30).map(r=>({scenario:s.scenario,repeat:r.repeat,menu:r.menu})));
}
