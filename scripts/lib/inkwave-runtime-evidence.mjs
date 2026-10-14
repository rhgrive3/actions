import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export const physicalLocation=name=>fs.existsSync(name)?fs.realpathSync(name):path.join(physicalLocation(path.dirname(name)),path.basename(name));
export function persistentDirectory(name){
 const resolved=physicalLocation(path.resolve(name));
 const roots=['/mnt/workspace',fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'')];
 if(['/tmp','/var/tmp','/dev/shm'].some(p=>resolved===p||resolved.startsWith(p+'/'))||!roots.some(p=>resolved.startsWith(physicalLocation(p)+'/')))throw Error('Persistent workspace required: '+resolved);
 fs.mkdirSync(resolved,{recursive:true});return resolved;
}
// Chromium appends its singleton directory/socket name to TMPDIR (44 bytes).
// Validate a short physical cache path; never fall back to OS temporary storage.
export function persistentBrowserTemp(target){
 const directory=persistentDirectory(target);
 if(Buffer.byteLength(directory)+48>=108)throw Error('Browser temporary directory exceeds Unix socket budget');
 return directory;
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
 const namespaces={'upstream/':'inkwave-public/','patch/':'patches/splatoon3/','touch-layout/':'patches/touch-layout/','reliability/':'patches/reliability/','local-quality/':'patches/local-quality/','network-replication/':'patches/network-replication/','loading-cache/':'patches/loading-cache/','practice-range/':'patches/practice-range/','native-stages/':'patches/native-stages/','build-script/':'scripts/'};
 const inputs=Object.entries(manifest.files).map(([name,expected])=>{
  if(name.split('/').some(p=>!p||p==='.'||p==='..'||p.includes('\\')))throw Error('Unknown input: '+name);
  const prefix=Object.keys(namespaces).find(p=>name.startsWith(p));if(!prefix)throw Error('Unknown input: '+name);
  return [namespaces[prefix]+name.slice(prefix.length),expected];
 });
 inputs.push(['scripts/build-inkwave.mjs',manifest.build.script]);
 const tree=new Map(execFileSync('git',['ls-tree','-r','-z',sha],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean).map(row=>{const [meta,file]=row.split('\t');return [file,meta.split(' ')[2]];}));
 const blobs=inputs.map(([file])=>{const blob=tree.get(file);if(!blob)throw Error('Missing source input: '+file);return blob;});
 // Bound aggregate capture independently of the number of committed inputs.
 // Metadata is checked first; each body batch is at most 8 MiB unless one
 // existing input alone needs more (still subject to the 64 MiB input cap).
 const metadata=execFileSync('git',['cat-file','--batch-check'],{cwd:root,input:blobs.join('\n')+'\n',encoding:'utf8',maxBuffer:8*1024*1024}).trimEnd().split('\n');
 if(metadata.length!==blobs.length)throw Error('Invalid git source metadata');
 const sizes=metadata.map((line,i)=>{
  const [blob,type,text]=line.split(' '),size=Number(text);
  if(blob!==blobs[i]||type!=='blob'||!/^\d+$/.test(text)||!Number.isSafeInteger(size)||size<0||size>64*1024*1024)throw Error('Invalid git source size');
  return size;
 });
 for(let start=0;start<inputs.length;){
  let end=start,total=0;
  do{total+=sizes[end]+blobs[end].length+32;end++;}while(end<inputs.length&&total+sizes[end]+blobs[end].length+32<=8*1024*1024);
  const batch=execFileSync('git',['cat-file','--batch'],{cwd:root,input:blobs.slice(start,end).join('\n')+'\n',maxBuffer:total});
  let offset=0;
  for(let i=start;i<end;i++){
   const newline=batch.indexOf(10,offset);if(newline<offset)throw Error('Invalid git source receipt');
   const [blob,type,text]=batch.subarray(offset,newline).toString().split(' '),size=Number(text);
   if(blob!==blobs[i]||type!=='blob'||size!==sizes[i])throw Error('Invalid git source receipt');
   offset=newline+1;
   if(offset+size>=batch.length||batch[offset+size]!==10)throw Error('Truncated git source receipt');
   const bytes=batch.subarray(offset,offset+size);offset+=size+1;
   if(hash(bytes)!==inputs[i][1])throw Error('Build differs from source SHA: '+inputs[i][0]);
  }
  if(offset!==batch.length)throw Error('Unexpected git source receipt bytes');
  start=end;
 }
 return manifest;
}
export function sampleStats(values){
 const a=[...values].sort((a,b)=>a-b);
 if(!a.length)return {n:0};
 const middle=Math.floor(a.length/2);
 return{n:a.length,mean:a.reduce((sum,value)=>sum+value,0)/a.length,median:a.length%2?a[middle]:(a[middle-1]+a[middle])/2,p95:a[Math.min(a.length-1,Math.floor(a.length*.95))],max:a.at(-1)};
}

export function invalidWindows(scenarios,fixed){
 return scenarios.flatMap(s=>s.runs.filter(r=>fixed?r.counts.frame!==30:r.frames.n<30).map(r=>({scenario:s.scenario,repeat:r.repeat,menu:r.menu})));
}

// Prime natural CSS presentation outside input timing. Software WebGL can
// delay a rendering opportunity far beyond a short JS timer deadline.
export async function primeRuntimeMenuRows(page,screenshotPath,mode=null){
 await page.evaluate(mode=>{
  const g=probeG.game,m=g.menus;
  if(mode!==null){if(g._onDevice)g._onDevice(mode);else m.setInputMode(mode);}
  const [a,b]=m._candidates().filter(e=>e.dataset.nav==='row');
  if(!a||!b)throw Error('Missing mode-input rows');
  window.runtimeModePrime={a,b};
 },mode);
 await page.screenshot({path:screenshotPath,timeout:900000});
 await page.waitForFunction(()=>{
  const {a,b}=window.runtimeModePrime;
  if(!a.isConnected||!b.isConnected)throw Error('Mode-input rows detached during priming');
  return Math.min(+getComputedStyle(a).opacity,+getComputedStyle(b).opacity)>=.9;
 },undefined,{timeout:900000});
}
