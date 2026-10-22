// Usage: node patches/native-stages/tools/update-source-inventories.mjs <API JSON directory>
// The input must contain <pinned tree SHA>.json from the GitHub recursive tree
// endpoint. This tool reads metadata only and independently checks Git objects.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {nativeStageCatalog} from '../../../scripts/lib/inkwave-native-stages.mjs';
const input=process.argv[2];if(!input)throw Error('API JSON directory is required');
const output=fileURLToPath(new URL('../source-inventories/',import.meta.url));fs.mkdirSync(output,{recursive:true});
const hash=(algorithm,bytes)=>crypto.createHash(algorithm).update(bytes).digest('hex');
const modes=new Map([['040000','tree'],['100644','blob'],['100755','blob'],['120000','blob'],['160000','commit']]);
function verify(tree,pinned){
 if(tree.sha!==pinned||tree.truncated!==false||!Array.isArray(tree.tree))throw Error('Incomplete or foreign API tree');
 const entries=new Map(),dirs=new Map([['',[]]]);
 for(const e of tree.tree){
  if(modes.get(e.mode)!==e.type||typeof e.path!=='string'||e.path.includes('\\')||e.path.includes('\0')||e.path.split('/').some(s=>!s||s==='.'||s==='..')||entries.has(e.path)||!/^[a-f0-9]{40}$/.test(e.sha)||(e.type==='blob'&&(!Number.isSafeInteger(e.size)||e.size<0)))throw Error('Invalid API metadata');
  entries.set(e.path,e);const at=e.path.lastIndexOf('/'),parent=at<0?'':e.path.slice(0,at),name=e.path.slice(at+1);
  if(!dirs.has(parent))dirs.set(parent,[]);dirs.get(parent).push({...e,name});if(e.type==='tree'&&!dirs.has(e.path))dirs.set(e.path,[]);
 }
 for(const [name,children] of dirs){
  if(name&&entries.get(name)?.type!=='tree')throw Error('Missing parent subtree');
  const sorted=children.slice().sort((a,b)=>Buffer.compare(Buffer.from(a.name+(a.type==='tree'?'/':'')),Buffer.from(b.name+(b.type==='tree'?'/':''))));
  const body=Buffer.concat(sorted.map(e=>Buffer.concat([Buffer.from(e.mode.replace(/^0+/,'')+' '+e.name+'\0'),Buffer.from(e.sha,'hex')]))),digest=hash('sha1',Buffer.concat([Buffer.from('tree '+body.length+'\0'),body]));
  if(digest!==(name?entries.get(name).sha:pinned))throw Error('API tree content does not reconstruct pinned Git object: '+name);
 }
 return tree.tree.map(e=>[e.mode,e.path,e.sha,e.type==='blob'?e.size:null]).sort((a,b)=>Buffer.compare(Buffer.from(a[1]),Buffer.from(b[1])));
}
const pins=[],summary=[];
for(const stage of nativeStageCatalog().stages){
 const tree=JSON.parse(fs.readFileSync(path.join(input,stage.tree+'.json'),'utf8')),entries=verify(tree,stage.tree),body=JSON.stringify({schema:1,tree:stage.tree,entries})+'\n';
 fs.writeFileSync(path.join(output,stage.tree+'.json'),body);pins.push([stage.tree,hash('sha256',body)]);summary.push({id:stage.id,entries:entries.length,bytes:Buffer.byteLength(body)});
}
const cache=fileURLToPath(new URL('../runtime/source-cache.mjs',import.meta.url)),source=fs.readFileSync(cache,'utf8');
const block='// BEGIN GENERATED PINNED SOURCE INVENTORIES\nconst PINNED_SOURCE_TREES=Object.freeze('+JSON.stringify(Object.fromEntries(pins),null,1)+');\n// END GENERATED PINNED SOURCE INVENTORIES';
if(!source.includes('// BEGIN GENERATED PINNED SOURCE INVENTORIES'))throw Error('Missing generated inventory pin marker');
fs.writeFileSync(cache,source.replace(/\/\/ BEGIN GENERATED PINNED SOURCE INVENTORIES[\s\S]*?\/\/ END GENERATED PINNED SOURCE INVENTORIES/,block));
console.log(JSON.stringify({stages:summary.length,entries:summary.reduce((n,r)=>n+r.entries,0),bytes:summary.reduce((n,r)=>n+r.bytes,0),summary}));
