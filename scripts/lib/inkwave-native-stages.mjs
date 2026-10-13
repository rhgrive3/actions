import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {BASE_SOURCE_STAGES,SOURCE_RECIPE,SOURCE_COMMIT} from '../../patches/native-stages/runtime/source-catalog.mjs';
export const NATIVE_ROOT=path.resolve(import.meta.dirname,'../../patches/native-stages');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export function nativeStageIdentity(){
 const files={};const walk=dir=>{for(const d of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){const file=path.join(dir,d.name);if(d.isDirectory())walk(file);else if(!file.includes('/tests/')&&!file.includes('/tools/')&&(file.endsWith('.mjs')||file.includes('/definitions/')&&file.endsWith('.json')))files[path.relative(NATIVE_ROOT,file)]=hash(fs.readFileSync(file));}};walk(NATIVE_ROOT);return files;
}
export function nativeStageCatalog(definitions=path.join(NATIVE_ROOT,'definitions')){
 const stages=BASE_SOURCE_STAGES.map(s=>({...s})),unavailableStages=[],seen=new Set(stages.map(s=>s.id));
 for(const file of fs.existsSync(definitions)?fs.readdirSync(definitions).filter(f=>f.endsWith('.json')).sort():[]){
  const s=JSON.parse(fs.readFileSync(path.join(definitions,file),'utf8'));
  if(!/^[-a-z0-9]+$/.test(s.id)||file!==s.id+'.json'||!/^Vss_[A-Za-z0-9]+$/.test(s.internal)||typeof s.name!=='string'||!s.name||seen.has(s.id)||s.version1130Verified!==false||typeof s.placementStatus!=='string'||!s.placementStatus)throw Error('Invalid native stage definition: '+file);
  seen.add(s.id);
  if(['source-unavailable','placement-unavailable'].includes(s.availability)){
   if(typeof s.reason!=='string'||!s.reason||!s.source?.commit||s.source?.repository!=='kirakira-dev/KiTrix')throw Error('Unavailable stage requires source evidence: '+file);
   unavailableStages.push(s);continue;
  }
  const b=s.bounds;
  if(s.availability&&s.availability!=='available'||! /^[a-f0-9]{64}$/.test(s.sourceSha256)||! /^[a-f0-9]{40}$/.test(s.tree)||!b||!['minX','minZ','maxX','maxZ'].every(k=>Number.isFinite(b[k]))||b.maxX<=b.minX||b.maxZ<=b.minZ||!Number.isFinite(s.spawnBarrier)||s.spawnBarrier<0||!Array.isArray(s.spawnPads)||s.spawnPads.length!==2||s.spawnPads.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)||p[0]<b.minX||p[0]>b.maxX||p[2]<b.minZ||p[2]>b.maxZ))throw Error('Native stage lacks pinned source or valid inferred supports: '+file);
  if(s.sourceSemantics){
   for(const [key,patterns] of Object.entries(s.sourceSemantics)){
    if(!['inactiveObjectPatterns','nonCollidableObjectPatterns','nonPaintableObjectPatterns'].includes(key)||!Array.isArray(patterns)||patterns.some(p=>typeof p!=='string'||!p.startsWith('^')||p.length>300))throw Error('Invalid inferred object semantics: '+file);
    patterns.forEach(p=>new RegExp(p));
   }
  }
  if(s.sourceNavigation!==undefined&&(!s.sourceNavigation||typeof s.sourceNavigation!=='object'||Object.keys(s.sourceNavigation).some(k=>k!=='wallClimb')||s.sourceNavigation.wallClimb!==true))throw Error('Invalid inferred source navigation: '+file);
  stages.push(s);
 }
 return {stages,unavailableStages};
}
/** Keep the large third-party payload outside the revision/PWA snapshot. The
 * runtime verifies it with a pinned integrity manifest. Only opt-in builds get it. */
export function prepareNativeStageBuild(assetPath){
 const available=nativeStageCatalog(),runtimeSha256=hash(JSON.stringify(nativeStageIdentity()));
 if(!assetPath)return {root:null,config:{schema:1,mode:'browser-direct',runtimeSha256,unavailableStages:available.unavailableStages,stages:available.stages.map(s=>({...s,integritySha256:hash(JSON.stringify([SOURCE_RECIPE,s.sourceSha256,s.tree,s.sourceSemantics||null,s.bounds,s.spawnPads]))}))}};
 const root=fs.realpathSync(path.resolve(assetPath)),catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json')));
 if(catalog.schema!==1||catalog.sourceCommit!==SOURCE_COMMIT||!Array.isArray(catalog.stages)||!catalog.stages.length||new Set(catalog.stages.map(s=>s.id)).size!==catalog.stages.length)throw Error('Native build requires unique pinned stage conversions');
 const stages=catalog.stages.map(s=>{
  const definition=available.stages.find(d=>d.id===s.id);
  if(!definition||s.internal!==definition.internal||s.sourceSha256!==definition.sourceSha256||JSON.stringify(s.bounds)!==JSON.stringify(definition.bounds)||JSON.stringify(s.spawnPads)!==JSON.stringify(definition.spawnPads)||JSON.stringify(s.sourceSemantics||null)!==JSON.stringify(definition.sourceSemantics||null))throw Error('Native conversion differs from reviewed stage definition: '+s.id);
  const file=path.join(root,s.id,'integrity.json'),integrity=JSON.parse(fs.readFileSync(file));
  for(const [rel,expected] of Object.entries(integrity)){
   if(path.isAbsolute(rel)||rel.split('/').includes('..'))throw Error('Native asset traversal');
   const bytes=fs.readFileSync(path.join(root,s.id,rel));
   if(bytes.length!==expected.bytes||hash(bytes)!==expected.sha256)throw Error('Native build integrity mismatch: '+s.id+'/'+rel);
  }
  if(JSON.stringify(s.sourceNavigation||null)!==JSON.stringify(definition.sourceNavigation||null))throw Error('Native navigation differs from reviewed definition: '+s.id);
  return {...definition,integritySha256:hash(fs.readFileSync(file)),version1130Verified:false};
 });
 return {root,config:{schema:1,mode:'local-prepared',baseURL:'../../_native-reference-assets/',runtimeSha256,unavailableStages:available.unavailableStages,stages}};
}
export function copyLocalNativeAssets(build,prepared){
 if(!prepared?.root)return;
 const target=path.join(build,'_native-reference-assets');fs.mkdirSync(target,{recursive:true});
 for(const s of prepared.config.stages)fs.cpSync(path.join(prepared.root,s.id),path.join(target,s.id),{recursive:true});
 fs.writeFileSync(path.join(target,'LOCAL-ONLY.txt'),'Third-party extracted models. Redistribution rights and 11.3.0 placements unverified. Do not deploy this build.\n');
}
