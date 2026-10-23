// QA-only immutable provenance for native lazy audio and deterministic sea module Workers.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parse} from '../../patches/loading-cache/vendor/acorn.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const workerName=path=>/^((?:_versions\/[A-Za-z0-9_-]+\/)?patches\/splatoon3\/runtime\/audio\/)(grain|reverb)-worker(\.mjs)$/.exec(path)||/^((?:_versions\/[A-Za-z0-9_-]+\/)?src\/world\/)(wave)-worker(\.js)$/.exec(path);
export const isNativeModuleWorkerOwner=path=>/^(?:_versions\/[A-Za-z0-9_-]+\/)?src\/world\/wave-prewarm\.js$/.test(path)||/^(?:_versions\/[A-Za-z0-9_-]+\/)?patches\/splatoon3\/runtime\/audio\/(grain|reverb)-prewarm\.mjs$/.test(path);
function target(url,origin){const u=new URL(url);assert(['http:','https:'].includes(u.protocol)&&u.origin===origin&&!u.search&&!u.hash,'Foreign or unpinned native module Worker');const path=decodeURIComponent(u.pathname).slice(1),m=workerName(path);assert(m,'Unknown native module Worker');return{path,prefix:m[1],name:m[2],extension:m[3]};}
function caller(stack,origin){const line=stack?.split('\n')[2]?.trim();
 // V8's direct anonymous/timer callbacks use "at URL:line:column"; named
 // frames use "at function (URL:line:column)". Only the immediate caller is
 // admitted, and its exact module callsite is checked against loaded bytes.
 const m=line?.match(/\((https?:\/\/[^\s)]+):(\d+):(\d+)\)$/)
   || line?.match(/^at (https?:\/\/[^\s)]+):(\d+):(\d+)$/);assert(m,'Missing direct native module Worker caller');const u=new URL(m[1]);assert.equal(u.origin,origin);assert.equal(u.search+u.hash,'');return{path:decodeURIComponent(u.pathname).slice(1),line:Number(m[2]),column:Number(m[3])};}
const options=(value,name)=>{assert.deepEqual(Object.keys(value||{}).sort(),['name','type']);assert.equal(value.type,'module');assert.equal(value.name,'inkwave-'+name);};
export function recordNativeModuleWorkerCreation(e,p,origin){
 const t=target(p.url,origin);options(p.workerOptions,t.name);const frame=caller(p.workerStack,origin);
 assert.equal(frame.path,t.prefix+t.name+'-prewarm'+t.extension,'Wrong native module Worker owner');
 const rows=e.moduleCreations||= [];assert(rows.length<8&&!rows.some(r=>r.path===t.path),'Duplicate native module Worker');rows.push({...t,creator:frame,workerOptions:p.workerOptions});
}
export function observeNativeModuleWorker(e,url,origin){const t=target(url,origin),rows=e.moduleWorkers||=[];assert(!rows.includes(t.path),'Duplicate observed native module Worker');rows.push(t.path);}
function derivedCall(source,name,extension){
 const calls=[];const visit=n=>{if(!n||typeof n!=='object')return;
  if(n.type==='VariableDeclarator'&&['Worker','URL'].includes(n.id?.name)||n.type==='ImportSpecifier'&&['Worker','URL'].includes(n.local?.name))assert.fail('Native module Worker global shadowed');
  if(n.type==='NewExpression'&&n.callee.name==='Worker')calls.push(n);
  for(const [key,v]of Object.entries(n))if(key!=='loc'){if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}
 };visit(parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true}));
 assert.equal(calls.length,1,'One native module Worker call required');const call=calls[0],url=call.arguments[0],opt=call.arguments[1];
 assert.equal(call.arguments.length,2);assert(url?.type==='NewExpression'&&url.callee.name==='URL'&&url.arguments.length===2);assert.equal(url.arguments[0].value,'./'+name+'-worker'+extension);
 const meta=url.arguments[1];assert(meta?.type==='MemberExpression'&&meta.object?.type==='MetaProperty'&&meta.object.meta.name==='import'&&meta.object.property.name==='meta'&&meta.property.name==='url');
 assert.equal(opt?.type,'ObjectExpression');assert.equal(opt.properties.length,2);const vals={};for(const p of opt.properties){assert.equal(p.type,'Property');assert.equal(p.value.type,'Literal');vals[p.key.name||p.key.value]=p.value.value;}options(vals,name);
 return{start:{...call.loc.start},end:{...call.loc.end}};
}
function verify(file,row,loaded,manifest){
 const m=workerName(file);assert(m);const p=row.nativeWorkerProvenance;assert(p?.observed===true,'Native module Worker lacks observation');
 assert.equal(p.creator.path,m[1]+m[2]+'-prewarm'+m[3]);assert.equal(loaded[p.creator.path]?.sha256,p.creatorSha256);assert.equal(manifest.artifacts[p.creator.path],p.creatorSha256);assert.equal(hash(p.creatorSourceUtf8),p.creatorSha256);assert.equal(Buffer.byteLength(p.creatorSourceUtf8),loaded[p.creator.path].bytes);
 options(p.workerOptions,m[2]);const call=derivedCall(p.creatorSourceUtf8,m[2],m[3]);assert.deepEqual(p.call,call);
 assert(p.creator.line>=call.start.line&&p.creator.line<=call.end.line&&(p.creator.line!==call.start.line||p.creator.column>=call.start.column+1)&&(p.creator.line!==call.end.line||p.creator.column<=call.end.column+1),'Native module Worker caller outside pinned callsite');
 assert.equal(row.sha256,manifest.artifacts[file]);assert(Number.isSafeInteger(row.bytes)&&row.bytes>0);
 const prefix=m[1].replace(/(?:patches\/splatoon3\/runtime\/audio\/|src\/world\/)$/,'');assert(!prefix||prefix==='_versions/'+manifest.build?.revision+'/','Foreign native module Worker revision');
}
export function bindNativeModuleWorkers(e,loaded,manifest){
 const rows=e.moduleCreations||[],seen=e.moduleWorkers||[];assert.equal(rows.length,seen.length,'Native module Worker creation/observation denominator');
 for(const r of rows){assert(seen.includes(r.path));const owner=e.owners.filter(o=>new URL(o.url).pathname.slice(1)===r.creator.path);assert.equal(owner.length,1,'Loaded native module Worker owner required');
  const row=loaded[r.path];assert(row,'Native module Worker response missing');row.nativeWorkerProvenance={creator:r.creator,creatorSourceUtf8:owner[0].body,creatorSha256:hash(owner[0].body),call:derivedCall(owner[0].body,r.name,r.extension),workerOptions:r.workerOptions,observed:true};verify(r.path,row,loaded,manifest);
 }
 verifyNativeModuleWorkerRows(loaded,manifest);
}
export function verifyNativeModuleWorkerRows(loaded,manifest){for(const [file,row]of Object.entries(loaded))if(workerName(file))verify(file,row,loaded,manifest);}
