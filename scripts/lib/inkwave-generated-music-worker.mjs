// QA-only binding of an observed Blob worker to its loaded, immutable creator.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parse} from '../../patches/loading-cache/vendor/acorn.mjs';
import {MUSIC_TIMER_SOURCE} from './inkwave-roller-blob-provenance.mjs';
export const NATIVE_MUSIC_TIMER_SOURCE=MUSIC_TIMER_SOURCE;
const hash=b=>createHash('sha256').update(b).digest('hex');
const GENERATED='@generated/native-music-timer-worker';
export const createBlobWorkerEvidence=()=>({schema:2,creations:Object.create(null),workers:[],responses:[],owners:[]});
function caller(stack,origin){
 const line=stack?.split('\n')[2];
 assert(line&&/\._startTimer\s*\(/.test(line),'Missing direct native _startTimer caller');
 const m=line.match(/\((https?:\/\/[^\s)]+):(\d+):(\d+)\)$/);assert(m,'Missing native caller location');
 const u=new URL(m[1]);assert.equal(u.origin,origin,'Foreign creator');assert.equal(u.search+u.hash,'','Unexpected creator URL suffix');
 return {path:decodeURIComponent(u.pathname).slice(1),method:'_startTimer',line:Number(m[2]),column:Number(m[3])};
}
export function recordBlobWorkerCreation(e,p,origin,frame){
 assert(frame?.mainFrame&&new URL(frame.frameUrl).origin===origin,'Worker must originate in captured main frame');
 assert(!p.error,p.error);const u=new URL(p.url);assert(u.protocol==='blob:'&&u.origin===origin,'Foreign Blob creation');
 assert.equal(p.mime,'text/javascript');assert.equal(p.workerOptions,'default');
 assert(Array.isArray(p.bytes)&&p.bytes.length<=4096&&p.bytes.every(n=>Number.isInteger(n)&&n>=0&&n<=255));
 const bytes=Buffer.from(p.bytes);assert.equal(bytes.length,p.size);assert.equal(bytes.toString('utf8'),MUSIC_TIMER_SOURCE);
 assert(!e.creations[p.url]&&Object.keys(e.creations).length<16,'Duplicate or excessive Blob creation');
 const creator=caller(p.creationStack,origin),worker=caller(p.workerStack,origin);
 assert.equal(worker.path,creator.path);e.creations[p.url]={creator,worker,body:bytes.toString('utf8')};
 return e.creations[p.url];
}
export function observeGeneratedWorker(e,url,origin){
 const u=new URL(url);assert.notEqual(u.protocol,'data:','Unexpected data Worker');
 assert(u.protocol==='blob:'&&u.origin===origin,'Foreign Blob Worker');
 assert(!e.workers.includes(url),'Duplicate observed Worker');e.workers.push(url);
}
function visit(node,fn){if(!node||typeof node!=='object')return;if(fn(node)===false)return;for(const [key,value]of Object.entries(node))if(key!=='loc'){if(Array.isArray(value))value.forEach(v=>visit(v,fn));else if(value&&typeof value==='object')visit(value,fn);}}
function derive(source){
 const methods=[];visit(parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true}),n=>{if(n.type==='MethodDefinition'&&(n.key.name||n.key.value)==='_startTimer')methods.push(n);});
 assert.equal(methods.length,1,'One pinned native timer method required');
 // Resolve bindings in their lexical block. A minifier may reuse an outer
 // tick callback's name for the inner try-block source literal or URL.
 const creates=[],workers=[],assignments=[],scopes=new WeakMap();
 const root={parent:null,declarations:new Map()};
 function declare(scope,name,init){assert(!scope.declarations.has(name),'Ambiguous native timer binding');scope.declarations.set(name,{init});}
 function walk(n,scope){
  if(!n||typeof n!=='object')return;
  if(/^(?:FunctionExpression|FunctionDeclaration|ArrowFunctionExpression|ClassExpression|ClassDeclaration)$/.test(n.type))return;
  if(n.type==='BlockStatement'||n.type==='CatchClause')scope={parent:scope,declarations:new Map()};
  scopes.set(n,scope);
  if(n.type==='CatchClause'&&n.param){assert.equal(n.param.type,'Identifier');declare(scope,n.param.name,null);}
  if(n.type==='VariableDeclaration')for(const d of n.declarations){assert.equal(d.id.type,'Identifier','Native timer binding must be explicit');declare(n.kind==='var'?root:scope,d.id.name,d.init);}
  if(n.type==='AssignmentExpression'||n.type==='UpdateExpression')assignments.push({target:n.left||n.argument,scope});
  if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&!n.callee.computed&&n.callee.object.name==='URL'&&n.callee.property.name==='createObjectURL')creates.push(n);
  if(n.type==='NewExpression'&&n.callee.name==='Worker')workers.push(n);
  for(const [key,value]of Object.entries(n))if(key!=='loc'){if(Array.isArray(value))value.forEach(v=>walk(v,scope));else if(value&&typeof value==='object')walk(value,scope);}
 }
 walk(methods[0].value.body,root);
 function binding(scope,name){for(;scope;scope=scope.parent)if(scope.declarations.has(name))return scope.declarations.get(name);return null;}
 assert.equal(creates.length,1,'One native Blob call required');assert.equal(workers.length,1,'One native Worker call required');
 const create=creates[0],worker=workers[0],blob=create.arguments[0];
 assert(blob?.type==='NewExpression'&&blob.callee.name==='Blob'&&blob.arguments.length===2);
 const parts=blob.arguments[0],opts=blob.arguments[1];assert(parts?.type==='ArrayExpression'&&parts.elements.length===1);
 const value=parts.elements[0].type==='Identifier'?binding(scopes.get(create),parts.elements[0].name)?.init:parts.elements[0];
 assert(value?.type==='Literal'&&value.value===MUSIC_TIMER_SOURCE,'Pinned native timer bytes absent');
 assert(opts?.type==='ObjectExpression'&&opts.properties.length===1&&
   (opts.properties[0].key.name||opts.properties[0].key.value)==='type'&&opts.properties[0].value.value==='text/javascript');
 assert.equal(worker.arguments.length,1);assert.equal(worker.arguments[0].type,'Identifier');
 const urlBinding=binding(scopes.get(worker),worker.arguments[0].name);
 assert.equal(urlBinding?.init,create,'Worker must consume the native created URL');
 assert(!assignments.some(({target,scope})=>target.type==='Identifier'&&binding(scope,target.name)===urlBinding),'Native Worker URL binding was reassigned');
 for(const [node,name]of [[create,'URL'],[worker,'Worker'],[blob,'Blob']])assert(!binding(scopes.get(node),name),'Native timer global was shadowed');
 return {create:{start:{...create.loc.start},end:{...create.loc.end}},worker:{start:{...worker.loc.start},end:{...worker.loc.end}}};
}
function checkLocation(frame,call){assert(frame.line>=call.start.line&&frame.line<=call.end.line&&
 (frame.line!==call.start.line||frame.column>=call.start.column+1)&&
 (frame.line!==call.end.line||frame.column<=call.end.column+1),'Creator frame outside the pinned native callsite');}
export function bindBlobWorkerEvidence(e,loaded,manifest){
 assert.equal(e.schema,2);
 for(const response of e.responses){
  const c=e.creations[response.url];assert(c,'Unobserved Blob worker creation');
  assert(e.workers.includes(response.url),'Blob not observed as a Worker');
  assert.equal(response.body,c.body,'Worker response differs from created Blob');
  assert.equal(response.sha256,hash(Buffer.from(c.body)));assert.equal(response.bytes,Buffer.byteLength(c.body));
  const path=c.creator.path;assert(path==='src/audio/music.js'||path===`_versions/${manifest.build?.revision}/src/audio/music.js`,'Unpinned native creator path');
  const owners=e.owners.filter(o=>new URL(o.url).pathname.slice(1)===path);assert.equal(owners.length,1);
  const source=owners[0].body,sha=hash(Buffer.from(source));assert.equal(sha,manifest.artifacts[path]);assert.equal(loaded[path]?.sha256,sha,'Creator was not the actually loaded module');assert.equal(loaded[path]?.bytes,Buffer.byteLength(source));
  const calls=derive(source);checkLocation(c.creator,calls.create);checkLocation(c.worker,calls.worker);
  const proof={creatorSourceUtf8:source,calls};
  if(loaded[path].generatedTimerSource)assert.deepEqual(loaded[path].generatedTimerSource,proof);
  loaded[path].generatedTimerSource=proof;
  const row={sha256:response.sha256,bytes:response.bytes,provenance:{creator:{path,method:'_startTimer'},creatorSha256:sha,operation:'URL.createObjectURL+Worker'}};
  if(loaded[GENERATED])assert.deepEqual(loaded[GENERATED],row);loaded[GENERATED]=row;
 }
 assert(e.responses.length>0,'Worker response missing');
 assert.equal(e.responses.length,e.workers.length,'Worker response missing');
 assert.equal(Object.keys(e.creations).length,e.responses.length,'Worker response missing');
}
export function verifyGeneratedWorkerRows(loaded,manifest){
 const row=loaded[GENERATED];if(!row)return false;
 const p=row.provenance,path=p?.creator?.path,owner=loaded[path],proof=owner?.generatedTimerSource;
 assert(path==='src/audio/music.js'||path===`_versions/${manifest.build?.revision}/src/audio/music.js`);
 assert.equal(p.creator.method,'_startTimer');assert.equal(p.operation,'URL.createObjectURL+Worker');
 assert(proof&&typeof proof.creatorSourceUtf8==='string');
 assert.equal(hash(Buffer.from(proof.creatorSourceUtf8)),owner.sha256,'Creator source is not the actually loaded bytes');
 assert.equal(owner.bytes,Buffer.byteLength(proof.creatorSourceUtf8));assert.equal(owner.sha256,manifest.artifacts[path]);assert.equal(p.creatorSha256,owner.sha256);
 assert.deepEqual(proof.calls,derive(proof.creatorSourceUtf8),'Callsites are not derived from pinned creator');
 assert.equal(row.sha256,hash(Buffer.from(MUSIC_TIMER_SOURCE)));assert.equal(row.bytes,Buffer.byteLength(MUSIC_TIMER_SOURCE));return true;
}
// Serialized into the captured page. Native constructors and immutable Blob data
// are retained; the wrapper observes only, before the page creates any worker.
export function installBlobWorkerObserver({bindingName}){
 const nativeCreate=URL.createObjectURL,NativeWorker=globalThis.Worker,creations=new Map(),pending=[];
 URL.createObjectURL=function(blob){const stack=new Error().stack,url=Reflect.apply(nativeCreate,this,arguments);if(blob instanceof Blob)creations.set(String(url),{blob,stack});return url;};
 globalThis.Worker=new Proxy(NativeWorker,{construct(target,args,newTarget){
  const workerStack=new Error().stack,url=String(args[0]),c=creations.get(url);
  const worker=Reflect.construct(target,args,newTarget);
  const report=globalThis[bindingName];
  if(!c)pending.push(Promise.resolve(report({error:'Unknown Blob worker creation',url})));
  else pending.push(c.blob.arrayBuffer().then(b=>report({url,mime:c.blob.type,size:c.blob.size,bytes:Array.from(new Uint8Array(b)),workerOptions:args.length===1?'default':'explicit',creationStack:c.stack,workerStack})));
  return worker;
 }});
 Object.defineProperty(globalThis,'__inkwaveBlobWorkerAudit',{value:{async flush(){await Promise.all(pending);}}});
}
