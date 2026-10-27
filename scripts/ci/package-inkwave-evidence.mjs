import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const EVIDENCE_ARTIFACT_LIMIT=128*1024*1024;
const order=(a,b)=>a<b?-1:a>b?1:0;
async function digest(file){const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');}
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
export async function packageEvidence(input,{output=path.resolve(input+'-bounded'),limit=EVIDENCE_ARTIFACT_LIMIT,sourceSha=null,buildIdentity=null,preferredPaths=[]}={}){
 input=path.resolve(input);output=path.resolve(output);
 if(!Number.isSafeInteger(limit)||limit<1024)throw Error('Artifact limit must be at least 1024 bytes');
 if(input===output||output.startsWith(input+path.sep)||input.startsWith(output+path.sep))throw Error('Bounded package must be separate from original evidence');
 const entries=inventory(input),originalBytes=entries.reduce((n,row)=>n+row.bytes,0),overBudget=originalBytes>limit,unsupported=entries.some(row=>!row.regular);
 if(!overBudget&&!unsupported&&entries.length)return {eligible:true,path:input,failed:false,overBudget:false,originalBytes,submittedBytes:originalBytes};
 if(buildIdentity&&fs.existsSync(buildIdentity)&&fs.lstatSync(buildIdentity).isFile())entries.push({path:'build/inkwave-build.json',file:path.resolve(buildIdentity),bytes:fs.statSync(buildIdentity).size,mtime:0,regular:true});
 const rows=[];for(const entry of entries)rows.push({...entry,sha256:entry.regular?await digest(entry.file):null,disposition:'omitted',reason:entry.regular?'artifact-budget':'non-regular-file'});
 const fullInventoryHash=crypto.createHash('sha256');for(const row of rows)fullInventoryHash.update(JSON.stringify({path:row.path,bytes:row.bytes,sha256:row.sha256})+'\n');
 const manifest={schema:1,status:overBudget?'over-budget':unsupported?'non-regular-evidence':'no-evidence',sourceSha,limitBytes:limit,originalBytes,inventorySha256:fullInventoryHash.digest('hex'),inventoryEntries:rows.length,omittedInventoryEntries:0,files:rows.map(({file,mtime,regular,...row})=>row)};
 const encode=()=>Buffer.from(JSON.stringify(manifest,null,2)+'\n');
 // Even unusually large inventories must leave a submitted diagnostic. The
 // complete inventory is bound by its digest; retained rows identify omissions.
 while(encode().length>limit/2&&manifest.files.length){manifest.files.pop();manifest.omittedInventoryEntries++;}
 const reserve=Math.min(limit,Math.max(1024,Math.ceil(encode().length*1.5)));let remaining=limit-reserve;
 fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(output,{recursive:true});
 const rank=row=>priority(row)===3&&preferredPaths.some(prefix=>row.path.startsWith(prefix+'/'))?2.5:priority(row);
 const selected=rows.slice(0,manifest.files.length).sort((a,b)=>rank(a)-rank(b)||(rank(a)>=2.5?b.mtime-a.mtime:0)||order(a.path,b.path));
 for(const row of selected){
  if(!row.regular)continue;const info=manifest.files.find(item=>item.path===row.path),target=path.join(output,'files',row.path);
  const tail=row.bytes>remaining&&/\.log$/.test(row.path),length=tail?Math.min(remaining,1024*1024):row.bytes;
  if(length>remaining||tail&&length<256)continue;
  fs.mkdirSync(path.dirname(target),{recursive:true});
  if(tail){const fd=fs.openSync(row.file,'r');try{const bytes=Buffer.alloc(length),read=fs.readSync(fd,bytes,0,length,row.bytes-length);fs.writeFileSync(target,bytes.subarray(0,read));}finally{fs.closeSync(fd);}}
  else fs.copyFileSync(row.file,target);
  const submittedBytes=fs.statSync(target).size,submittedSha256=await digest(target);
  if(submittedBytes>remaining||!tail&&(submittedBytes!==row.bytes||submittedSha256!==row.sha256)){fs.unlinkSync(target);info.reason='changed-during-packaging';continue;}
  info.disposition=tail?'tail-copy':'copied';delete info.reason;info.submittedPath='files/'+row.path;info.submittedBytes=submittedBytes;info.submittedSha256=submittedSha256;if(tail)info.originalByteOffset=row.bytes-submittedBytes;remaining-=submittedBytes;
 }
 let body=encode();
 // The reserve includes copy metadata. Retain the manifest even if a future
 // metadata field grows, by dropping the lowest-priority submitted copies.
 for(const row of selected.slice().reverse()){
  if(body.length+limit-reserve-remaining<=limit)break;const info=manifest.files.find(item=>item.path===row.path);if(!info.submittedPath)continue;
  fs.unlinkSync(path.join(output,info.submittedPath));remaining+=info.submittedBytes;for(const key of ['submittedPath','submittedBytes','submittedSha256','originalByteOffset'])delete info[key];info.disposition='omitted';info.reason='manifest-budget';body=encode();
 }
 fs.writeFileSync(path.join(output,'EVIDENCE_MANIFEST.json'),body);
 const submittedBytes=inventory(output).reduce((n,row)=>n+row.bytes,0);if(submittedBytes>limit)throw Error('Bounded evidence package exceeded its limit');
 return {eligible:true,path:output,failed:true,overBudget,originalBytes,submittedBytes,manifest};
}
export async function packageBrowserFailureEvidence(input,options={}){
 const preferredPaths=[];
 try{
  const report=JSON.parse(fs.readFileSync(path.join(input,'responsive/responsive-result.json'),'utf8'));
  const engines=new Set(['chromium','webkit']);
  const viewports=new Set(['phone-portrait','phone-landscape','small-phone','tablet-portrait','tablet-landscape','tablet-split','desktop']);
  for(const row of report.shards||[])if(row.ok===false&&engines.has(row.engine)&&viewports.has(row.name))
   preferredPaths.push('responsive/cases/'+row.engine+'-'+row.name);
 }catch{} // Missing/malformed reports are still retained as evidence, never acceptance.
 return packageEvidence(input,{...options,preferredPaths});
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
