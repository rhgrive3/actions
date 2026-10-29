import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseValidateWorkflow} from '../ci/inkwave-validate-contract.mjs';
import {assertSourceSuiteCoverage} from '../ci/inkwave-source-coverage.mjs';
import {planTestSuite} from '../ci/run-inkwave-test-suite.mjs';
const root=new URL('../../',import.meta.url);
const read=name=>fs.readFileSync(new URL('.github/workflows/'+name,root),'utf8');
const events=y=>{const parsed=parseValidateWorkflow(y);return parsed.on||parsed.true;};
function assertPaths(name,source){
  const required=name==='inkwave-pause-gpu.yml'?[
    'patches/local-quality/pause-frame-retention.mjs','patches/local-quality/composer-target-adapter.mjs',
    'patches/local-quality/adapter.mjs','scripts/inkwave-source-composition.mjs','scripts/build-inkwave.mjs',
  ]:name==='inkwave-gameplay-resources.yml'?[
    'patches/local-quality/combat-gpu-cpu-perfect-adapter.mjs','scripts/inkwave-source-composition.mjs',
    'scripts/build-inkwave.mjs','patches/local-quality/adapter.mjs','inkwave-public/src/fx/fx.js',
  ]:['scripts/inkwave-menu-focus-pins.json'];
  const on=events(source);
  for(const event of name==='inkwave-pause-gpu.yml'?['pull_request']:['push','pull_request']){
    const paths=on[event].paths;
    for(const input of required)assert.equal(paths.filter(x=>x===input).length,1,`${name}/${event}: ${input}`);
    assert(!paths.includes('scripts/**'));assert(!paths.includes('README.md'));
  }
  if(name==='inkwave-pause-gpu.yml')assert.equal(on.push,undefined,'do not broaden this PR-only workflow');
  return required;
}
for(const name of ['inkwave-pause-gpu.yml','inkwave-gameplay-resources.yml','validate-inkwave-update.yml'])test(name+' traces each required single-file input and rejects a missing route',()=>{
  const source=read(name);for(const input of assertPaths(name,source)){
    const changed=source.replace("      - '"+input+"'\n",'');assert.notEqual(changed,source);assert.throws(()=>assertPaths(name,changed));
  }
});
function assertPagesDelegation(source,validate){
  const steps=parseValidateWorkflow(source).jobs.deploy.steps;
  const exact=flag=>steps.map((step,index)=>({step,index})).filter(({step})=>step.run==='node scripts/ci/inkwave-pages-validation.mjs '+flag);
  const wait=exact('--wait'),once=exact('--once');assert.equal(wait.length,1);assert.equal(once.length,1);
  for(const {step} of [...wait,...once]){assert.equal(step.if,undefined);assert.equal(step['continue-on-error'],undefined);assert.equal(step.env.GITHUB_TOKEN,'${{ secrets.GITHUB_TOKEN }}');}
  const upload=steps.findIndex(s=>s.uses?.startsWith('actions/upload-pages-artifact@')),deploy=steps.findIndex(s=>s.uses?.startsWith('actions/deploy-pages@'));
  assert(wait[0].index<upload&&upload<once[0].index&&once[0].index<deploy,'both same-SHA validation barriers precede publication');
  assert.doesNotMatch(source,/--test patches\/local-quality\/tests\/\*\.test\.mjs/,'Pages deliberately delegates full source regression');
  return assertSourceSuiteCoverage(validate,'quality');
}
function qualityCommand(args=planTestSuite('source-quality')[0].args){
  assert.deepEqual(args.slice(0,3),['--experimental-vm-modules','--test','--test-concurrency=2']);
  assert(args.slice(3).length>0&&args.slice(3).every(x=>x.endsWith('.test.mjs')),'only full test file operands follow the options');
  return args;
}
test('Pages delegates full quality coverage to mandatory Validate and retains both same-SHA publication barriers',()=>{
  const source=read('pages-inkwave.yml'),validate=read('validate-inkwave-update.yml');
  const plan=assertPagesDelegation(source,validate);assert(plan.all.length>0);
  for(const flag of ['--wait','--once'])assert.throws(()=>assertPagesDelegation(source.replace('node scripts/ci/inkwave-pages-validation.mjs '+flag,'true'),validate));
  const full='        run: node --experimental-vm-modules scripts/check-inkwave-patches.mjs\n';
  assert(validate.includes(full));
  for(const replacement of ['        run: true\n',full.trimEnd()+' --exclude patches/local-quality/tests\n'])assert.throws(()=>assertPagesDelegation(source,validate.replace(full,replacement)),/mandatory complete CPU source shards/);
  const excessiveConcurrency=validate.replace("INKWAVE_TEST_CONCURRENCY: ${{ matrix.shard == 2 && '1' || '2' }}","INKWAVE_TEST_CONCURRENCY: '4'");
  assert.notEqual(excessiveConcurrency,validate,'negative changes the actual current CPU concurrency policy');
  assert.throws(()=>assertPagesDelegation(source,excessiveConcurrency),/mandatory complete CPU source shards/);
  const args=qualityCommand();assert.throws(()=>qualityCommand([...args.filter(x=>x!=='--test-concurrency=2'),'--test-concurrency=2']));
});
test('delegated quality Node option order admits at most two workers while running all six fixtures',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'iw-pages-workers-'));
  try{
    assertPagesDelegation(read('pages-inkwave.yml'),read('validate-inkwave-update.yml'));
    const options=qualityCommand().slice(0,3);
    const files=Array.from({length:6},(_,i)=>path.join(directory,`worker-${i}.test.mjs`));
    for(const [i,file] of files.entries())fs.writeFileSync(file,`import test from 'node:test';import fs from 'node:fs';test('worker-${i}',async()=>{fs.appendFileSync('events.jsonl',JSON.stringify({id:${i},kind:'start'})+String.fromCharCode(10));await new Promise(r=>setTimeout(r,120));fs.appendFileSync('events.jsonl',JSON.stringify({id:${i},kind:'end'})+String.fromCharCode(10));});\n`);
    const env={...process.env};delete env.NODE_TEST_CONTEXT;
    const result=spawnSync(process.execPath,[...options,...files],{cwd:directory,encoding:'utf8',timeout:20000,env});
    assert.equal(result.status,0,result.stderr+result.stdout);
    const records=fs.readFileSync(path.join(directory,'events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
    let active=0,peak=0;const started=new Set(),ended=new Set();
    for(const r of records){if(r.kind==='start'){active++;started.add(r.id);}else{active--;ended.add(r.id);}peak=Math.max(peak,active);assert(active>=0);}
    assert.equal(started.size,6);assert.equal(ended.size,6);assert.equal(active,0);assert(peak<=2,`observed ${peak} simultaneous workers`);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
const cases=['small-phone','phone','android','standard','landscape','browser-bars','notched','tablet','desktop'];
function mobile(engine,model,names){return {status:'passed',contentHash:'content',inputHash:'input',revision:'revision',engine,viewportModel:model,audit:false,errors:[],cases:names.map(name=>({name,checks:[{label:'real test fixture',ok:true}]}))};}
test('the actual browser receipt binds all mobile evidence and fails closed on absent, mixed or incomplete cases',()=>{
  const workflow=parseValidateWorkflow(read('validate-inkwave-update.yml'));
  const step=workflow.jobs.browser.steps.find(s=>s.name==='Bind passing browser evidence to the tested commit');
  const program=/^python3 - <<'PY'\n([\s\S]*)\nPY\s*$/.exec(step.run)?.[1];assert(program);
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'iw-mobile-receipt-'));
  const evidence=path.join(directory,'storage/evidence');
  const baseline={
    'responsive/responsive-result.json':{status:'passed',contentHash:'content'},
    'mobile-menus/chromium/result.json':mobile('chromium','mobile-emulation',cases),
    'mobile-menus/webkit/result.json':mobile('webkit','mobile-emulation',cases),
    'mobile-menus/webkit-resize/result.json':mobile('webkit','resizable-touch',['phone','landscape']),
  };
  try{
    fs.mkdirSync(path.join(directory,'.built-site/_site'),{recursive:true});
    fs.writeFileSync(path.join(directory,'.built-site/_site/inkwave-build.json'),JSON.stringify({contentHash:'content',inputHash:'input',build:{revision:'revision'}}));
    fs.writeFileSync(path.join(directory,'.built-site/_site-source-sha.txt'),'a'.repeat(40)+'\n');
    const run=reports=>{
      fs.rmSync(evidence,{recursive:true,force:true});fs.mkdirSync(evidence,{recursive:true});
      for(const [name,report] of Object.entries(reports)){const file=path.join(evidence,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(report));}
      return spawnSync('python3',['-c',program],{cwd:directory,encoding:'utf8',timeout:10000,env:{...process.env,CI_STORAGE:path.join(directory,'storage'),BROWSER_SUITE:'responsive',RUNTIME_PERFORMANCE:'false',SOURCE_SHA:'a'.repeat(40),GITHUB_RUN_ID:'1',GITHUB_RUN_ATTEMPT:'1',GITHUB_EVENT_NAME:'pull_request'}});
    };
    const good=run(baseline);assert.equal(good.status,0,good.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(evidence,'ci-result.json'))).checks,Object.keys(baseline));
    for(const name of Object.keys(baseline).slice(1))for(const field of ['missing','status','contentHash','inputHash','revision','engine','viewportModel','audit','errors','case','duplicate-case','failed-check']){
      const reports=structuredClone(baseline),row=reports[name];
      if(field==='missing')delete reports[name];
      else if(field==='audit')row.audit=true;
      else if(field==='errors')row.errors=['late pageerror'];
      else if(field==='case')row.cases.pop();
      else if(field==='duplicate-case')row.cases[0]=structuredClone(row.cases[1]);
      else if(field==='failed-check')row.cases[0].checks[0].ok=false;
      else row[field]='wrong';
      assert.notEqual(run(reports).status,0,name+'/'+field);assert.equal(fs.existsSync(path.join(evidence,'ci-result.json')),false);
    }
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
