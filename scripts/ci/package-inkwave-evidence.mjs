import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const EVIDENCE_ARTIFACT_LIMIT=128*1024*1024;
const order=(a,b)=>a<b?-1:a>b?1:0;
const encodeManifest=manifest=>Buffer.from(JSON.stringify(manifest,null,2)+'\n');
export function trimEvidenceInventory(manifest,maximumBytes){
 if(!manifest.files.length||encodeManifest(manifest).length<=maximumBytes)return;
 const files=manifest.files,omitted=manifest.omittedInventoryEntries;let low=0,high=files.length;
 // Removing a complete row reduces the encoded size even when the omitted
 // count gains a digit. Find the same longest prefix as repeated tail removal,
 // counting actual UTF-8 bytes and the omitted count at every candidate.
 while(low<high){
  const kept=Math.ceil((low+high)/2);
  manifest.files=files.slice(0,kept);manifest.omittedInventoryEntries=omitted+files.length-kept;
  if(encodeManifest(manifest).length<=maximumBytes)low=kept;else high=kept-1;
 }
 manifest.files=files.slice(0,low);manifest.omittedInventoryEntries=omitted+files.length-low;
}
function assertNoSymlinkComponents(file){
 const absolute=path.resolve(file);let current=path.parse(absolute).root;
 for(const part of absolute.slice(current.length).split(path.sep).filter(Boolean)){
  current=path.join(current,part);let stat;try{stat=fs.lstatSync(current);}catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(stat.isSymbolicLink())throw Error('Evidence path must not contain symlinks');
 }
}
function openRegularNoFollow(file){
 if(fs.realpathSync(path.dirname(file))!==path.dirname(file))throw Error('Evidence directory must not contain symlinks');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{if(!fs.fstatSync(fd).isFile())throw Error('Evidence must be a regular file');return fd;}catch(e){fs.closeSync(fd);throw e;}
}
async function digest(file){const fd=openRegularNoFollow(file),hash=crypto.createHash('sha256');try{for await(const chunk of fs.createReadStream(null,{fd,autoClose:false}))hash.update(chunk);return hash.digest('hex');}finally{fs.closeSync(fd);}}
function copyRegularNoFollow(source,target,offset,length){
 const fd=openRegularNoFollow(source);let dest;
 try{dest=fs.openSync(target,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);const buffer=Buffer.alloc(Math.min(1024*1024,Math.max(length,1)));let position=0;while(position<length){const n=fs.readSync(fd,buffer,0,Math.min(buffer.length,length-position),offset+position);if(!n)break;let written=0;while(written<n){const w=fs.writeSync(dest,buffer,written,n-written);if(!w)throw Error('Evidence write made no progress');written+=w;}position+=n;}return position;}finally{if(dest!==undefined)fs.closeSync(dest);fs.closeSync(fd);}
}
function inventory(root){
 const entries=[];function walk(dir){if(!fs.existsSync(dir))return;for(const name of fs.readdirSync(dir).sort(order)){
  const file=path.join(dir,name),stat=fs.lstatSync(file),rel=path.relative(root,file).split(path.sep).join('/');
  if(stat.isDirectory())walk(file);else entries.push({path:rel,file,bytes:stat.isFile()?stat.size:0,mtime:stat.mtimeMs,regular:stat.isFile()});
 }}walk(root);return entries;
}
function priority(row){
 if(/\.log$|(?:stderr|stdout)\.txt$/.test(row.path))return 0;
 if(/inkwave-build\.json$|source.*identity.*\.json$/.test(row.path))return 1;
 if(row.path.endsWith('.json'))return 2;
 return /\.png$/i.test(row.path)?3:5;
}
export async function packageEvidence(input,{output=path.resolve(input+'-bounded'),limit=EVIDENCE_ARTIFACT_LIMIT,sourceSha=null,buildIdentity=null,preferredPaths=[],preferredFiles=[]}={}){
 input=path.resolve(input);output=path.resolve(output);
 if(!Number.isSafeInteger(limit)||limit<1024)throw Error('Artifact limit must be at least 1024 bytes');
 if(input===output||output.startsWith(input+path.sep)||input.startsWith(output+path.sep))throw Error('Bounded package must be separate from original evidence');
 assertNoSymlinkComponents(input);assertNoSymlinkComponents(output);
 const entries=inventory(input),originalBytes=entries.reduce((n,row)=>n+row.bytes,0),overBudget=originalBytes>limit,unsupported=entries.some(row=>!row.regular);
 if(!overBudget&&!unsupported&&entries.length)return {eligible:true,path:input,failed:false,overBudget:false,originalBytes,submittedBytes:originalBytes};
 if(buildIdentity&&fs.existsSync(buildIdentity)&&fs.lstatSync(buildIdentity).isFile()){if(entries.some(row=>row.path==='build/inkwave-build.json'))throw Error('Duplicate build evidence path');entries.push({path:'build/inkwave-build.json',file:path.resolve(buildIdentity),bytes:fs.statSync(buildIdentity).size,mtime:0,regular:true});}
 const rows=[];for(const entry of entries)rows.push({...entry,sha256:entry.regular?await digest(entry.file):null,disposition:'omitted',reason:entry.regular?'artifact-budget':'non-regular-file'});
 const fullInventoryHash=crypto.createHash('sha256');for(const row of rows)fullInventoryHash.update(JSON.stringify({path:row.path,bytes:row.bytes,sha256:row.sha256})+'\n');
 const rank=row=>preferredFiles.includes(row.path)?(row.path.endsWith('/wiper-native-result.json')?-2:-1):
  priority(row)===3&&preferredPaths.some(prefix=>row.path.startsWith(prefix+'/'))?2.5:priority(row);
 const selected=rows.slice().sort((a,b)=>rank(a)-rank(b)||(rank(a)>=2.5?b.mtime-a.mtime:0)||order(a.path,b.path));
 const manifest={schema:1,status:overBudget?'over-budget':unsupported?'non-regular-evidence':'no-evidence',sourceSha,limitBytes:limit,originalBytes,inventorySha256:fullInventoryHash.digest('hex'),inventoryEntries:rows.length,omittedInventoryEntries:0,files:selected.map(({file,mtime,regular,...row})=>row)};
 const encode=()=>encodeManifest(manifest);
 // Even unusually large inventories must leave a submitted diagnostic. The
 // complete inventory is bound by its digest; retained rows identify omissions.
 trimEvidenceInventory(manifest,limit/2);
 const reserve=Math.min(limit,Math.max(1024,Math.ceil(encode().length*1.5)));let remaining=limit-reserve;
 fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(output,{recursive:true});
 selected.length=manifest.files.length;
 for(let index=0;index<selected.length;index++){
  const row=selected[index];if(!row.regular)continue;const info=manifest.files[index],target=path.join(output,'files',row.path);
  const tail=row.bytes>remaining&&/\.log$/.test(row.path),length=tail?Math.min(remaining,1024*1024):row.bytes;
  if(length>remaining||tail&&length<256)continue;
  fs.mkdirSync(path.dirname(target),{recursive:true});
  copyRegularNoFollow(row.file,target,tail?row.bytes-length:0,length);
  const submittedBytes=fs.statSync(target).size,submittedSha256=await digest(target);
  if(submittedBytes>remaining||submittedBytes!==length||!tail&&submittedSha256!==row.sha256){fs.unlinkSync(target);info.reason='changed-during-packaging';continue;}
  info.disposition=tail?'tail-copy':'copied';delete info.reason;info.submittedPath='files/'+row.path;info.submittedBytes=submittedBytes;info.submittedSha256=submittedSha256;if(tail)info.originalByteOffset=row.bytes-submittedBytes;remaining-=submittedBytes;
 }
 let body=encode();
 // The reserve includes copy metadata. Retain the manifest even if a future
 // metadata field grows, by dropping the lowest-priority submitted copies.
 for(let index=selected.length-1;index>=0;index--){
  if(body.length+limit-reserve-remaining<=limit)break;const info=manifest.files[index];if(!info.submittedPath)continue;
  fs.unlinkSync(path.join(output,info.submittedPath));remaining+=info.submittedBytes;for(const key of ['submittedPath','submittedBytes','submittedSha256','originalByteOffset'])delete info[key];info.disposition='omitted';info.reason='manifest-budget';body=encode();
 }
 fs.writeFileSync(path.join(output,'EVIDENCE_MANIFEST.json'),body);
 const submittedBytes=inventory(output).reduce((n,row)=>n+row.bytes,0);if(submittedBytes>limit)throw Error('Bounded evidence package exceeded its limit');
 return {eligible:true,path:output,failed:true,overBudget,originalBytes,submittedBytes,manifest};
}
export async function packageBrowserFailureEvidence(input,options={}){
 const preferredPaths=[],preferredFiles=new Set();
 assertNoSymlinkComponents(path.resolve(input));
 try{
  const fd=openRegularNoFollow(path.resolve(input,'responsive/responsive-result.json'));let text;try{text=fs.readFileSync(fd,'utf8');}finally{fs.closeSync(fd);}const report=JSON.parse(text);
  const engines=new Set(['chromium','webkit']);
  const viewports=new Set(['phone-portrait','phone-landscape','small-phone','tablet-portrait','tablet-landscape','tablet-split','desktop']);
  for(const row of report.shards||[])if(row.ok===false&&engines.has(row.engine)&&viewports.has(row.name))
   preferredPaths.push('responsive/cases/'+row.engine+'-'+row.name);
 }catch{} // Missing/malformed reports are still retained as evidence, never acceptance.
 // Preserve the exact captures named by a failed Wiper receipt ahead of large
 // successful catalog JSONs. Accept only simple PNG basenames: the inventory
 // still enforces regular files and binds all retained/omitted hashes.
 try{
  const root=path.resolve(input),dir=path.join(root,'wiper-native'),receipt=path.join(dir,'wiper-native-result.json');
  if(!fs.lstatSync(root).isDirectory()||!fs.lstatSync(dir).isDirectory()||!fs.lstatSync(receipt).isFile())throw Error('Wiper receipt must be a regular in-root file');
  const fd=openRegularNoFollow(receipt);let text;try{text=fs.readFileSync(fd,'utf8');}finally{fs.closeSync(fd);}const report=JSON.parse(text);
  if(report.status==='failed'&&report.kind==='controlled-native-wiper-visual-acceptance'){
   const linked=new Set(['wiper-native/wiper-native-result.json']);
   if(!Array.isArray(report.cases))throw Error('Invalid Wiper cases');
   for(const row of report.cases){if(!Array.isArray(row.frames))throw Error('Invalid Wiper frames');for(const frame of row.frames){if(!Array.isArray(frame.images))throw Error('Invalid Wiper images');for(const image of frame.images)
    if(typeof image?.file!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.png$/.test(image.file))throw Error('Invalid Wiper image path');else linked.add('wiper-native/'+image.file);}}
   for(const file of linked)preferredFiles.add(file);
  }
 }catch{} // A missing or malformed receipt is not acceptance evidence.
 return packageEvidence(input,{...options,preferredPaths,preferredFiles:[...preferredFiles]});
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const args=process.argv.slice(2),browser=args[0]==='--browser-failure';if(browser)args.shift();
 if(args.length<2||args.length>3)throw Error('Usage: package-inkwave-evidence.mjs [--browser-failure] <evidence> <bounded-output> [build-manifest]');
 const options={output:args[1],limit:Number(process.env.INKWAVE_ARTIFACT_LIMIT_BYTES||EVIDENCE_ARTIFACT_LIMIT),sourceSha:process.env.SOURCE_SHA||null,buildIdentity:args[2]||null};
 const result=await (browser?packageBrowserFailureEvidence:packageEvidence)(args[0],options);
 // Eligibility is independent of the budget gate's failed status.
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`eligible=${result.eligible}\npath=${result.path}\n`);
 console.log(JSON.stringify({...result,manifest:undefined}));if(result.failed)process.exitCode=1;
}
