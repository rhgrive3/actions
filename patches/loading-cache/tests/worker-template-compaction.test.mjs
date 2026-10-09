import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '../vendor/acorn.mjs';
import { finalizeLoadingWorker } from '../adapter.mjs';

const revision='a'.repeat(64);
function setup(t) {
  const persistent=path.resolve(process.env.INKWAVE_TEST_SCRATCH || '/mnt/workspace/.dev-state/agent-work/scratch/inkwave-worker-template-tests');
  assert(persistent.startsWith('/mnt/workspace/'), 'worker fixture destination must be under persistent workspace');
  let ancestor=persistent;
  while(!fs.existsSync(ancestor)) ancestor=path.dirname(ancestor);
  const realAncestor=fs.realpathSync(ancestor);
  assert(realAncestor==='/mnt/workspace'||realAncestor.startsWith('/mnt/workspace/'), 'worker fixture ancestor must resolve to persistent workspace');
  fs.mkdirSync(persistent,{recursive:true});
  const resolved=fs.realpathSync(persistent);
  assert(resolved.startsWith('/mnt/workspace/'), 'worker fixtures require persistent workspace storage');
  const root=fs.mkdtempSync(path.join(resolved,'case-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'index.html'),'<html>preserved index</html>');
  return root;
}
function literal(root) {
  const code=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const ast=parse(code,{ecmaVersion:'latest',sourceType:'script'});
  const node=ast.body.flatMap(n=>n.type==='VariableDeclaration'?n.declarations:[]).find(n=>n.id.name==='BUILD').init;
  return JSON.parse(code.slice(node.start,node.end));
}
test('worker compaction occurs before configuration insertion and retains the complete JSON contract',t=>{
  const root=setup(t),assets={'asset with space.js':[7,'b'.repeat(64)],'__INKWAVE_CACHE_CONFIG_VALUE__.png':[9,'c'.repeat(64)]};
  const plan={assets,precache:Object.keys(assets),assetBytes:16,precacheBytes:16};
  finalizeLoadingWorker(root,revision,plan);const before=literal(root);let calls=0;
  const result=finalizeLoadingWorker(root,revision,plan,source=>{
    calls++;assert(source.includes('__INKWAVE_CACHE_CONFIG_VALUE__'));assert(!source.includes(revision));assert(!source.includes('asset with space.js'));
    return source.replace('const BUILD =','const BUILD=');
  });
  assert.equal(calls,1);assert.deepEqual(literal(root),before);assert.deepEqual(literal(root).assets,assets);
  assert.deepEqual(literal(root).precache,plan.precache);assert.equal(result.workerBytes,fs.statSync(path.join(root,'sw.js')).size);
});
test('lost or duplicated compaction markers fail closed',t=>{
  const root=setup(t),plan={assets:{},precache:[],assetBytes:0,precacheBytes:0};
  assert.throws(()=>finalizeLoadingWorker(root,revision,plan,s=>s.replace('__INKWAVE_CACHE_CONFIG_VALUE__','null')),/worker stamp/);
  assert.throws(()=>finalizeLoadingWorker(root,revision,plan,s=>s+'\n__INKWAVE_CACHE_CONFIG_VALUE__'),/worker stamp/);
});
test('template compaction never bypasses the unchanged worker size ceiling',t=>{
  const root=setup(t),assets={};
  for(let i=0;i<1000;i++)assets[`asset-${i}.js`]=[1,'d'.repeat(64)];
  const plan={assets,precache:Object.keys(assets),assetBytes:1000,precacheBytes:1000};
  assert.throws(()=>finalizeLoadingWorker(root,revision,plan,()=> 'const BUILD=__INKWAVE_CACHE_CONFIG_VALUE__;'),/64 KiB/);
});
