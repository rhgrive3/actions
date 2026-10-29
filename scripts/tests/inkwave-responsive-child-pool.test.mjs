import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mapResponsiveCases,mapResponsiveByEngine,spawnResponsiveCase} from '../ci/inkwave-responsive-child-pool.mjs';

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
  assert.match(script,/await mapResponsiveByEngine\(cohort,workers,runCase\)/);
  assert.match(script,/row\.ok=processResult\.status===0 && !processResult\.error && !row\.error/);
  assert.match(script,/workers===1\s*\? spawnSync\(process\.execPath,argv,\{cwd:root,encoding:'utf8',timeout:20\*60\*1000,maxBuffer:16\*1024\*1024\}\)/);
  assert.match(script,/spawnResponsiveCase\(process\.execPath,argv,\{cwd:root,timeoutMs:20\*60\*1000,maxBuffer:16\*1024\*1024\}\)/);
  assert.match(workflow,/check-inkwave-responsive-isolated\.mjs --source \.built-site\/_site --section all[^\n]+--workers 2/);
});

test('engine-owned concurrency admits one WebKit and one Chromium, never two WebKit processes',async()=>{
  const cases=['chromium','webkit'].flatMap(engine=>Array.from({length:7},(_,index)=>({engine,name:String(index)})));
  const active={chromium:0,webkit:0};const peak={chromium:0,webkit:0};const seen=[];
  const result=await mapResponsiveByEngine(cases,2,async c=>{
    active[c.engine]++;peak[c.engine]=Math.max(peak[c.engine],active[c.engine]);
    assert(active.chromium+active.webkit<=2);
    await new Promise(r=>setTimeout(r,5));
    seen.push(c.engine+'-'+c.name);
    active[c.engine]--;
    return c.engine+'-'+c.name;
  });
  assert.deepEqual(peak,{chromium:1,webkit:1});
  assert.deepEqual(result,cases.map(c=>c.engine+'-'+c.name));
  assert.equal(seen.length,14);
  assert.equal(new Set(seen).size,14);
});
test('engine-owned queues keep fail-closed outcome even if one browser fails',async()=>{
 const cases=['chromium','webkit'].flatMap(engine=>[0,1,2].map(name=>({engine,name})));
 const finished=[];
 await assert.rejects(()=>mapResponsiveByEngine(cases,2,async c=>{
   finished.push(c.engine+c.name);
   if(c.engine==='webkit'&&c.name===1)throw Error('webkit browser closed');
   return true;
 }),/webkit browser closed/);
 assert.equal(finished.length,6);
 assert.deepEqual(finished.sort(),cases.map(c=>c.engine+c.name).sort());
 for(const invalid of [[{engine:'firefox'}],[{engine:'webkit'}],[{engine:'chromium'}]])
  await assert.rejects(()=>mapResponsiveByEngine(invalid,2,async()=>{}),/Both browser engines/);
});
