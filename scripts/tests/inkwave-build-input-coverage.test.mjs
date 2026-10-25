import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {staticEsModuleImports} from '../lib/inkwave-module-imports.mjs';
import {touchLayoutIdentity} from '../../patches/touch-layout/adapter.mjs';
import {reliabilityIdentity} from '../../patches/reliability/adapter.mjs';
import {qualityIdentity} from '../../patches/local-quality/adapter.mjs';
import {networkIdentity} from '../../patches/network-replication/adapter.mjs';
import {rangeIdentity} from '../../patches/practice-range/adapter.mjs';
import {loadingIdentity} from '../../patches/loading-cache/adapter.mjs';
import {nativeStageIdentity} from '../lib/inkwave-native-stages.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=rel=>typeof rel==='string' && rel.length>0 && !path.posix.isAbsolute(rel) &&
  !rel.includes('\\') && !rel.split('/').some(part=>part==='.' || part==='..' || part==='');
const read=rel=>fs.readFileSync(path.join(root,rel));

// These are the real identity producers used by build-inkwave. The two source
// trees follow writeBuildIdentity's tests/Markdown exclusion. No build runs.
function productionIdentities(){
  const identities=new Map();
  const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);
  for(const base of ['inkwave-public','patches/splatoon3'])for(const file of walk(path.join(root,base)).sort()){
    if(file.includes('/tests/') || file.endsWith('.md'))continue;
    identities.set(path.relative(root,file).split(path.sep).join('/'),hash(fs.readFileSync(file)));
  }
  for(const [base,identity] of [
    ['patches/touch-layout',touchLayoutIdentity()],['patches/reliability',reliabilityIdentity()],
    ['patches/local-quality',qualityIdentity()],['patches/network-replication',networkIdentity()],
    ['patches/practice-range',rangeIdentity()],['patches/loading-cache',loadingIdentity()],
    ['patches/native-stages',nativeStageIdentity()],
  ])for(const [rel,digest] of Object.entries(identity)){
    assert.ok(canonical(rel),'canonical namespace-relative identity: '+base+'/'+rel);
    assert.match(digest,/^[a-f0-9]{64}$/,'SHA256 identity: '+base+'/'+rel);
    const file=base+'/'+rel;
    assert.ok(!identities.has(file),'one canonical identity owner: '+file);
    identities.set(file,digest);
  }
  return identities;
}

// The entry itself is tracked by the builder's build-script namespace. This
// gate covers every local static dependency beneath it, including re-exports,
// transitive imports and cycles; Node/package imports are outside this scope.
function verifyLocalDependencies(entry,readSource,identities){
  const visited=new Set();
  function visit(file){
    assert.ok(canonical(file),'local dependency stays within source root: '+file);
    if(visited.has(file))return;visited.add(file);
    const bytes=readSource(file);
    if(file!==entry){
      assert.ok(identities.has(file),'untracked production dependency: '+file);
      assert.equal(identities.get(file),hash(bytes),'stale production dependency identity: '+file);
    }
    for(const spec of staticEsModuleImports(bytes.toString()))if(spec.startsWith('.')){
      visit(path.posix.normalize(path.posix.join(path.posix.dirname(file),spec)));
    }
  }
  visit(entry);return visited;
}

test('every local production composition dependency is SHA256-tracked in its actual input namespace',()=>{
  const identities=productionIdentities();
  const closure=verifyLocalDependencies('scripts/inkwave-source-composition.mjs',read,identities);
  assert.ok(closure.size>300,'check the complete production closure, not a narrowed fixture');
  for(const rel of ['drive-core-queue-adapter.mjs','drive-visual-audio-adapter.mjs','queue-world-20261024-adapter.mjs']){
    const file='patches/local-quality/'+rel;
    assert.ok(closure.has(file),'new terminal adapter is reachable: '+file);
    assert.equal(identities.get(file),hash(read(file)),'new terminal adapter is tracked: '+file);
  }
});

function fixture(){
  const sources=new Map([
    ['entry.mjs',`import{adapt}from'./layer/adapter.mjs';import fs from'node:fs';const text="import './not-a-module.mjs'";`],
    ['layer/adapter.mjs',`export{adapt}from'./helper.mjs';export*from'./side.mjs';`],
    ['layer/helper.mjs',`import'../entry.mjs';export function adapt(code){return code;}`],
    ['layer/side.mjs','export const side=1;'],
  ]);
  const identities=new Map([...sources].filter(([file])=>file!=='entry.mjs').map(([file,source])=>[file,hash(source)]));
  const readSource=file=>{assert.ok(sources.has(file),'fixture source exists: '+file);return Buffer.from(sources.get(file));};
  return{sources,identities,readSource};
}
test('independent compact imports, re-exports and a cycle are visited once without string-literal false imports',()=>{
  const f=fixture();
  assert.deepEqual([...verifyLocalDependencies('entry.mjs',f.readSource,f.identities)].sort(),[...f.sources.keys()].sort());
});
test('a new transitive local dependency fails until its identity is registered',()=>{
  const f=fixture();
  f.sources.set('layer/side.mjs',"export*from'./new-adapter.mjs';");
  f.identities.set('layer/side.mjs',hash(f.sources.get('layer/side.mjs')));
  f.sources.set('layer/new-adapter.mjs','export const added=2;');
  assert.throws(()=>verifyLocalDependencies('entry.mjs',f.readSource,f.identities),/untracked production dependency: layer\/new-adapter\.mjs/);
  f.identities.set('layer/new-adapter.mjs',hash(f.sources.get('layer/new-adapter.mjs')));
  assert.equal(verifyLocalDependencies('entry.mjs',f.readSource,f.identities).size,5);
});
test('removed registration and changed bytes cannot pass using a stale identity map',()=>{
  const missing=fixture();missing.identities.delete('layer/helper.mjs');
  assert.throws(()=>verifyLocalDependencies('entry.mjs',missing.readSource,missing.identities),/untracked production dependency: layer\/helper\.mjs/);
  const changed=fixture();changed.sources.set('layer/helper.mjs','export const adapt=()=>42;');
  assert.throws(()=>verifyLocalDependencies('entry.mjs',changed.readSource,changed.identities),/stale production dependency identity: layer\/helper\.mjs/);
});
test('relative dependency traversal cannot silently escape the repository identity namespace',()=>{
  const f=fixture();f.sources.set('entry.mjs',"import'../outside.mjs';");
  assert.throws(()=>verifyLocalDependencies('entry.mjs',f.readSource,f.identities),/local dependency stays within source root/);
});
