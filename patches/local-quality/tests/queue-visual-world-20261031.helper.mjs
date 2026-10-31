import fs from 'node:fs';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
export const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-visual-world-20261031/baseline.json',import.meta.url),'utf8'));
export const raw=rel=>fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');
// Frozen exact direct-source predecessors. New builds ship optimized owner
// bytes directly, while this A/B harness keeps the historical source for
// fully independent geometry and callback-order equivalence checks.
const directPredecessor = Object.freeze({
  'src/world/props-core.js':'./fixtures/props-core-direct-before-20261031.js.txt',
  'src/world/props-marina-vessels.js':'./fixtures/props-marina-vessels-direct-before-20261031.js.txt',
});
export const composed=(rel,before=false)=>{
  const predecessor=before&&directPredecessor[rel];
  const source=predecessor?fs.readFileSync(new URL(predecessor,import.meta.url),'utf8'):raw(rel);
  return adaptBuildSource(rel,source,{queueVisualWorld20261031:!before});
};
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
