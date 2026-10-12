import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const NATIVE_ROOT=path.resolve(import.meta.dirname,'../../patches/native-stages');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export function nativeStageIdentity(){
 const files={};const walk=dir=>{for(const d of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){const file=path.join(dir,d.name);if(d.isDirectory())walk(file);else if(!file.includes('/tests/')&&!file.includes('/tools/')&&file.endsWith('.mjs'))files[path.relative(NATIVE_ROOT,file)]=hash(fs.readFileSync(file));}};walk(NATIVE_ROOT);return files;
}
/** Keep the large third-party payload outside the revision/PWA snapshot. The
 * runtime verifies it with a pinned integrity manifest. Only opt-in builds get it. */
export function prepareNativeStageBuild(assetPath){
 if(!assetPath)return null;
 const root=fs.realpathSync(path.resolve(assetPath)),catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json')));
 const ids=['scorch','hagglefish','inkblot','mako','brinewater'];
 if(catalog.schema!==1||catalog.sourceCommit!=='0611f51b35c9736ee986fb2218461e2585b7875e'||catalog.stages.length!==5||ids.some(id=>!catalog.stages.some(s=>s.id===id)))throw Error('Native build requires all five pinned stage conversions');
 const stages=catalog.stages.map(s=>{
  const file=path.join(root,s.id,'integrity.json'),integrity=JSON.parse(fs.readFileSync(file));
  for(const [rel,expected] of Object.entries(integrity)){
   if(path.isAbsolute(rel)||rel.split('/').includes('..'))throw Error('Native asset traversal');
   const bytes=fs.readFileSync(path.join(root,s.id,rel));
   if(bytes.length!==expected.bytes||hash(bytes)!==expected.sha256)throw Error('Native build integrity mismatch: '+s.id+'/'+rel);
  }
  return {id:s.id,name:s.name,bounds:s.bounds,spawnPads:s.spawnPads,spawnBarrier:s.spawnBarrier,sourceSha256:s.sourceSha256,integritySha256:hash(fs.readFileSync(file)),version1130Verified:false};
 });
 return {root,config:{schema:1,baseURL:'../../_native-reference-assets/',runtimeSha256:hash(JSON.stringify(nativeStageIdentity())),stages}};
}
export function copyLocalNativeAssets(build,prepared){
 if(!prepared)return;
 const target=path.join(build,'_native-reference-assets');fs.mkdirSync(target,{recursive:true});
 for(const s of prepared.config.stages)fs.cpSync(path.join(prepared.root,s.id),path.join(target,s.id),{recursive:true});
 fs.writeFileSync(path.join(target,'LOCAL-ONLY.txt'),'Third-party extracted models. Redistribution rights and 11.3.0 placements unverified. Do not deploy this build.\n');
}
