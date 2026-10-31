import fs from 'node:fs';
import crypto from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
export const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-visual-world-20261031/baseline.json',import.meta.url),'utf8'));
export const raw=rel=>fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');
// Keep the pre-migration baseline immutable after direct owners adopt composed bytes.
const directJson=gunzipSync(Buffer.from(fs.readFileSync(new URL('./fixtures/queue-direct-world-before-20261031.json.gz.base64',import.meta.url),'utf8'),'base64'));
if(crypto.createHash('sha256').update(directJson).digest('hex')!=='75b06e7a7fc55c245178ccec3de0eba4d14544e4961341d7ac051288d2a182e8')throw Error('Direct-world baseline fixture hash mismatch');
export const directWorldBaseline=JSON.parse(directJson);
export const rawBefore=rel=>directWorldBaseline.modules[rel]?.source??raw(rel);
export const composed=(rel,before=false)=>adaptBuildSource(rel,before?rawBefore(rel):raw(rel),{queueVisualWorld20261031:!before});
export function declaration(source,klass,key){
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});let found;
 function walk(n){if(!n||typeof n!=='object'||found)return;
 if(klass&&n.type==='ClassDeclaration'&&n.id.name===klass){found=key===null?n:n.body.body.find(m=>m.key.name===key);return;}
 if(!klass&&n.type==='FunctionDeclaration'&&n.id.name===key){found=n;return;}
 for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);
 }walk(ast);if(!found)throw Error('missing declaration '+klass+'.'+key);return{...found,source:source.slice(found.start,found.end)};
}
export function restore(rel,s){for(const e of baseline.modules[rel]?.entries||[]){const n=declaration(s,e.type==='function'?null:e.type==='class'?e.name:e.class,e.type==='class'?null:e.name);s=s.slice(0,n.start)+e.source+s.slice(n.end);}return s;}
export function sameGeometry(a,b,{expanded=false}={}){
 const aa=expanded&&a.index?a.toNonIndexed():a,bb=expanded&&b.index?b.toNonIndexed():b;
 const clean=g=>Object.fromEntries(Object.entries(g.attributes).map(([k,v])=>[k,{size:v.itemSize,normalized:v.normalized,values:Array.from(v.array)}]));
 return {before:clean(aa),after:clean(bb),indexBefore:aa.index?Array.from(aa.index.array):null,indexAfter:bb.index?Array.from(bb.index.array):null};
}
