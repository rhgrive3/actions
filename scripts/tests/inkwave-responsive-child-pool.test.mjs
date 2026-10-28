import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mapResponsiveCases,spawnResponsiveCase} from '../lib/inkwave-responsive-child-pool.mjs';

test('two workers run every case once, never exceed two and retain canonical order', async () => {
  let active=0,maxActive=0;
  const cases=Array.from({length:14},(_,index)=>index);
  const output=await mapResponsiveCases(cases,2,async index=>{
    active++;maxActive=Math.max(active,maxActive);
    await new Promise(resolve=>setTimeout(resolve,index%2===0?10:3));
    active--;return index*2;
  });
  assert.deepEqual(output,cases.map(n=>n*2));
  assert.equal(active,0);
  assert.equal(maxActive,2);
});

test('workers and complete case manifest fail closed on invalid inputs',async()=>{
  for(const count of [0,3,-1,1.5,NaN])await assert.rejects(()=>mapResponsiveCases([1],count,async()=>true),/Invalid bounded responsive/);
  await assert.rejects(()=>mapResponsiveCases([],1,async()=>true),/Invalid bounded responsive/);
  await assert.rejects(()=>mapResponsiveCases([1],1,null),/Invalid bounded responsive/);
});

test('a failing viewport cannot suppress another worker or produce a successful cohort',async()=>{
  const visited=[];
  await assert.rejects(()=>mapResponsiveCases([0,1,2,3],2,async value=>{
    visited.push(value);
    if(value===1)throw Error('viewport failure');
    return value;
  }),/viewport failure/);
  assert.deepEqual(visited.sort((a,b)=>a-b),[0,1,2,3]);
});

test('child execution preserves real exit status and both bounded output streams',async()=>{
  const result=await spawnResponsiveCase(process.execPath,
    ['-e',"process.stdout.write('ready');process.stderr.write('warning')"],
    {cwd:process.cwd(),timeoutMs:10000,maxBuffer:1024});
  assert.equal(result.status,0);
  assert.equal(result.error,null);
  assert.equal(result.stdout,'ready');
  assert.equal(result.stderr,'warning');
  const bad=await spawnResponsiveCase(process.execPath,['-e','process.exit(7)'],{timeoutMs:10000,maxBuffer:1024});
  assert.equal(bad.status,7);
});

test('timeout and oversized stderr cannot yield a passing child',async()=>{
  const timeout=await spawnResponsiveCase(process.execPath,['-e','setInterval(()=>{},1000)'],
    {timeoutMs:250,maxBuffer:1024});
  assert.equal(timeout.error?.code,'INKWAVE_RESPONSIVE_TIMEOUT');
  assert.notEqual(timeout.status,0);
  const overflow=await spawnResponsiveCase(process.execPath,['-e',"process.stderr.write('x'.repeat(65536))"],
    {timeoutMs:10000,maxBuffer:1024});
  assert.match(String(overflow.error),/stderr exceeded/);
  // A fast child may exit 0 before SIGTERM arrives; the explicit buffer error
  // still makes the actual viewport row fail closed.
  assert.ok(overflow.error);
});

test('live acceptance preserves all 14 isolated viewports with two bounded workers',()=>{
  const script=fs.readFileSync(new URL('../check-inkwave-responsive-isolated.mjs',import.meta.url),'utf8');
  const workflow=fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml',import.meta.url),'utf8');
  assert.match(script,/report\.cases\.length === 14 && report\.shards\.length === 14/);
  assert.match(script,/await mapResponsiveCases\(cohort,workers,runCase\)/);
  assert.match(script,/row\.ok=processResult\.status===0 && !processResult\.error && !row\.error/);
  assert.match(script,/spawnResponsiveCase\(process\.execPath,args,\{cwd:root,timeoutMs:20\*60\*1000,maxBuffer:16\*1024\*1024\}\)/);
  assert.match(workflow,/check-inkwave-responsive-isolated\.mjs --source \.built-site\/_site --section all[^\n]+--workers 2/);
});
