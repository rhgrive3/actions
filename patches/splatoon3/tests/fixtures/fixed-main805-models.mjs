// Test-only immutable repository-source fixture; never copied into a production build.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('../../../../',import.meta.url));
const FILE=fileURLToPath(new URL('./weapon-lod-main805-sources.json.gz',import.meta.url));
const SHA256='11362bbf7af3ea1a7105b0e4df63bc71e69a0e9ee18c8ac7d57f405a1349d0f7';
const gitsha=b=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(b)+'\0').update(b).digest('hex');
let cached;
export function fixedMain805Models(){return cached??=load();}
async function load(){
  const started=performance.now(),packed=fs.readFileSync(FILE);
  assert.equal(crypto.createHash('sha256').update(packed).digest('hex'),SHA256,'immutable main805 source archive');
  const archive=JSON.parse(zlib.gunzipSync(packed));
  assert.equal(archive.commit,'80555b8cf12e3a9529c0f461bd2acc3ee17f1764');
  const context=vm.createContext({console,performance,URL,URLSearchParams,TextEncoder,TextDecoder,setTimeout,clearTimeout});
  vm.runInContext('Math.random=()=>0.5',context);
  const resolve=(spec,from)=>spec==='three'?'vendor/three/build/three.module.js':spec.startsWith('three/addons/')?'vendor/three/jsm/'+spec.slice(13):path.posix.normalize(path.posix.join(path.posix.dirname(from),spec));
  const modules=new Map();
  function module(id){
    if(modules.has(id))return modules.get(id);
    let code;
    if(archive.sources[id])code=archive.sources[id].code;
    else{
      assert.ok(archive.vendors[id],id+' must belong to the fixed dependency closure');
      code=fs.readFileSync(path.join(ROOT,'inkwave-public',id),'utf8');
      assert.equal(gitsha(code),archive.vendors[id].gitSha,id+' vendor changed: explicitly review/update the fixed fixture');
    }
    const result=new vm.SourceTextModule(code,{context,identifier:id});modules.set(id,result);return result;
  }
  const entry=new vm.SourceTextModule(`export {getWeaponDef} from './src/game/character-weapons.js';export {registeredWeaponModels} from './patches/splatoon3/runtime/weapon-models/registry.mjs';`,{context,identifier:'entry.mjs'});
  await entry.link((spec,from)=>module(resolve(spec,from.identifier)));await entry.evaluate();
  const ids=[...new Set([...entry.namespace.registeredWeaponModels(),'slosher'])];assert.equal(ids.length,65);
  const rows=ids.map(id=>({id,definition:entry.namespace.getWeaponDef(id)}));
  return{commit:archive.commit,archiveSha256:SHA256,compressedBytes:packed.length,models:rows,initializationMs:performance.now()-started};
}
