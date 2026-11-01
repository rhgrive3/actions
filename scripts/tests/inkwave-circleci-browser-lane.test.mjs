import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseBrowserLane, SUITES, runBoundResponsiveSuccessEvidence } from '../ci/run-circleci-browser-lane.mjs';

const workflow = fs.readFileSync('.github/workflows/validate-inkwave-update.yml', 'utf8');

test('core sparse checkout materializes every CircleCI parity gate input', () => {
  const core = workflow.split('  validate_core:\n')[1]?.split('\n  patch_tests:')[0];
  const patterns = core?.match(/          sparse-checkout: \|\n((?:            [^\n]+\n)+)/)?.[1].trim().split('\n').map(line => line.trim());
  assert.ok(patterns?.length, 'core must retain its explicit sparse input selection');
  const required = ['.github/workflows/validate-inkwave-update.yml', '.circleci/config.yml',
    'scripts/tests/inkwave-circleci-browser-lane.test.mjs', 'scripts/tests/inkwave-circleci-offload-gate.test.mjs',
    'scripts/ci/run-circleci-browser-lane.mjs', 'scripts/ci/check-circleci-offload.mjs'];
  const globalJavaScript = ['account/tests/example.test.mjs','account/runtime/example.js','account/audit/example.cjs'];
  const excluded = ['.circleci/unused.yml','account/tests/example.py','account/data/unrelated.json','unrelated-audit/source.blend','unrelated-audit/reference.png'];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inkwave-core-sparse-'));
  const git = args => execFileSync('git', args, {cwd:root, stdio:['pipe','pipe','pipe']});
  try {
    git(['init', '-q']);
    for (const file of [...required, ...globalJavaScript, ...excluded]) {
      fs.mkdirSync(path.dirname(path.join(root,file)), {recursive:true});
      fs.writeFileSync(path.join(root,file), file);
    }
    git(['add', '.']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture']);
    const select = selection => execFileSync('git', ['sparse-checkout','set','--no-cone','--stdin'],
      {cwd:root, input:selection.join('\n')+'\n', stdio:['pipe','pipe','pipe']});
    // Exact prior allowlist: the imported gate code remains, but its config is absent.
    select(patterns.filter(line => line !== '/.circleci/config.yml'));
    assert.equal(fs.existsSync(path.join(root,'.circleci/config.yml')), false);
    assert.ok(fs.existsSync(path.join(root,'scripts/ci/run-circleci-browser-lane.mjs')));
    // Preserve the former narrow profile independently. JavaScript outside
    // those directories was previously unrelated; the global AST audit now
    // reads every tracked JS/MJS/CJS file, so the current profile must retain it.
    const codePatterns=['*.mjs','*.js','*.cjs'];
    for (const pattern of codePatterns) assert.ok(patterns.includes(pattern),'global metadata input: '+pattern);
    select(patterns.filter(line => !codePatterns.includes(line)));
    for (const file of globalJavaScript) assert.equal(fs.existsSync(path.join(root,file)),false,'historical narrow profile: '+file);
    for (let index=0;index<codePatterns.length;index++) {
      select(patterns.filter(line => line!==codePatterns[index]));
      assert.equal(fs.existsSync(path.join(root,globalJavaScript[index])),false,'dropping one code extension loses its metadata input');
    }
    select(patterns);
    for (const file of [...required,...globalJavaScript]) assert.ok(fs.existsSync(path.join(root,file)), 'required gate or metadata input: '+file);
    for (const file of excluded) assert.equal(fs.existsSync(path.join(root,file)), false, 'unrelated input: '+file);
  } finally { fs.rmSync(root, {recursive:true, force:true}); }
});

test('CircleCI consumes all seven native browser suites without omitting native acceptance steps', () => {
  const result = new Map(SUITES.map(suite => [suite, parseBrowserLane(workflow, suite)]));
  assert.equal(result.size, 7);
  for (const [suite, parsed] of result) {
    assert.match(parsed.sourceHash, /^[0-9a-f]{64}$/);
    assert(parsed.commands.length >= 2, 'suite ' + suite + ' must run real native checks and receipt');
    assert.equal(parsed.commands.at(-1).name, 'Bind passing browser evidence to the tested commit');
    assert.equal(new Set(parsed.commands.map(s => s.name)).size, parsed.commands.length);
    assert(parsed.commands.every(s => s.command && !s.command.includes('!unsafe')));
    assert.equal(Object.keys(parsed.coverage).length, 7);
  }
  assert(result.get('active').commands.length > 20, 'active suite cannot silently shrink');
  assert(result.get('network').commands.length > 8, 'network suite cannot silently shrink');
  assert(result.get('ui').commands.length > 8, 'UI suite cannot silently shrink');
  assert(result.get('startup').commands.some(s => s.command.includes('check-inkwave-startup-browser.mjs')));
  assert(result.get('range').commands.some(s => s.command.includes('check-inkwave-range.mjs')));
  assert(result.get('responsive').commands.some(s => s.command.includes('check-inkwave-responsive-isolated.mjs')));
  assert(result.get('catalog').commands.some(s => s.command.includes('check-inkwave-motion-catalog.mjs')));
});

test('CircleCI refuses unknown conditions instead of silently skipping added required checks', () => {
  const mutated = workflow.replace("if: matrix.suite == 'range'", "if: matrix.suite == 'range' && false");
  assert.notEqual(mutated, workflow);
  assert.throws(() => parseBrowserLane(mutated, 'range'), /Unrecognized native browser conditional/);
});

test('only the reviewed failure evidence command may run outside native acceptance on CircleCI', () => {
  const command = 'node scripts/ci/package-inkwave-evidence.mjs --browser-failure';
  assert(workflow.includes(command));
  for (const mutated of [
    workflow.replace(command, 'node scripts/another-command.mjs --browser-failure'),
    workflow.replace('if: always() && (failure() || cancelled())\n        id: browser_failure_evidence',
      'if: success()\n        id: browser_failure_evidence'),
  ]) {
    assert.notEqual(mutated, workflow);
    assert.throws(() => parseBrowserLane(mutated, 'responsive'), /Unreviewed evidence-only step/);
  }
  const lane = parseBrowserLane(workflow, 'responsive');
  assert(lane.commands.every(step => !step.command.includes(command)));
  assert(lane.commands.some(step => step.command.includes('check-inkwave-responsive-isolated.mjs')));
});

test('CircleCI refuses an omitted acceptance receipt', () => {
  const mutated = workflow.replace('Bind passing browser evidence to the tested commit',
                                    'Remove native acceptance receipt');
  assert.notEqual(mutated, workflow);
  assert.throws(() => parseBrowserLane(mutated, 'ui'), /unconditional native step/);
});

test('CircleCI rejects an unverified performance baseline migration', () => {
  assert.throws(() => parseBrowserLane(workflow, 'active', true), /Runtime-performance baseline/);
});

test('Native command edits update the browser acceptance source hash', () => {
  const before = parseBrowserLane(workflow, 'range');
  const after = parseBrowserLane(workflow.replace('node scripts/check-inkwave-range.mjs',
    'node scripts/check-inkwave-range-altered.mjs'), 'range');
  assert.notEqual(before.sourceHash, after.sourceHash);
  assert(after.commands.some(s => s.command.includes('range-altered')));
});

test('CircleCI covers native gameplay inputs without waking heavy lanes for unrelated workflow edits', () => {
  const lines = workflow.split(/\r?\n/);
  const start = lines.indexOf('  pull_request:');
  const end = lines.indexOf('  workflow_dispatch:');
  assert(start >= 0 && end > start, 'Expected stable native PR trigger definition');
  const paths = lines.slice(start, end)
    .filter(x => /^\s{6}- /.test(x))
    .map(x => x.trim().slice(2).replace(/^['"]|['"]$/g, ''));
  assert(paths.length >= 30, 'Native GitHub path coverage unexpectedly shrunk');
  const setup = fs.readFileSync('.circleci/config.yml', 'utf8');
  const mappings = setup.split(/\r?\n/)
    .filter(x => /^\s{12}\S+ run-inkwave true$/.test(x))
    .map(x => new RegExp('^' + x.trim().split(' ')[0] + '$'));
  assert(mappings.length >= 10, 'Missing native CircleCI file-change selectors');
  const witness = p => p.replace(/\*\*/g, 'example/feature').replace(/\*/g, 'example').replace(/\?/g, 'x');
  for (const source of paths) {
    assert(mappings.some(x => x.test(witness(source))), 'CircleCI ignores a mandatory GitHub trigger: ' + source);
  }
  for (const irrelevant of ['README.md', 'docs/unrelated-note.md', '.github/workflows/hex-lane-quality.yml', '.github/workflows/inkwave-main-weapons.yml'])
    assert(!mappings.some(x => x.test(irrelevant)), 'Unrelated change launches heavy INKWAVE CI: ' + irrelevant);
  assert(setup.includes('same-base-run: false'), 'Do not repeat heavy CI on same-main revision');
});

// Metadata/runner scalar tests only: no browser acceptance command is executed.
const successTitle='Package verified responsive success evidence';
const bindingTitle='Bind passing browser evidence to the tested commit';
const successStart=workflow.indexOf('      - name: '+successTitle);
const successEnd=workflow.indexOf('      - name: Package bounded browser failure evidence',successStart);
assert(successStart>0&&successEnd>successStart);
const successBlock=workflow.slice(successStart,successEnd);
const binding={sourceSha:'a'.repeat(40),contentHash:'b'.repeat(64),suite:'responsive'};
const nativeSuccess=()=>({status:'passed',...binding,checks:['responsive/responsive-result.json']});
const evidenceStep=()=>parseBrowserLane(workflow,'responsive').successEvidence;

test('reviewed responsive packaging remains separate from all seven unchanged native acceptance command lists',()=>{
 const hashes=new Set();
 for(const suite of SUITES){const lane=parseBrowserLane(workflow,suite);hashes.add(lane.sourceHash);assert.equal(lane.commands.at(-1).name,bindingTitle);assert(!lane.commands.some(s=>s.name===successTitle));
  if(suite==='responsive'){assert.equal(lane.successEvidence.name,successTitle);assert.equal(lane.successEvidence.command,successBlock.split('\n').find(l=>l.startsWith('        run: ')).slice(13));}
  else assert.equal(lane.successEvidence,null);
 }
 assert.equal(hashes.size,1,'the complete actual browser job metadata stays source-hash bound');
});

test('responsive evidence metadata rejects changed commands, conditions, env, IDs, duplicates and binding order for every suite',()=>{
 const changedBlock=[
  successBlock.replace("success() && matrix.suite == 'responsive'","always() && matrix.suite == 'responsive'"),
  successBlock.replace("success() && matrix.suite == 'responsive'","success() && matrix.suite == 'catalog'"),
  successBlock.replace("success() && matrix.suite == 'responsive'","success() && matrix.suite == 'responsive' && false"),
  successBlock.replace('node scripts/ci/package-inkwave-success-evidence.mjs','node scripts/another-command.mjs'),
  successBlock.replace('steps.bind_browser_evidence.outcome','steps.other_step.outcome'),
  successBlock.replace('steps.bind_browser_evidence.outcome',"'success'"),
  successBlock.replace("inputs.full_success_evidence == true && '1' || '0'","'1'"),
  successBlock.replace('        id: browser_success_evidence\n',''),
  successBlock.replace('        env:\n',''),
  successBlock.replace('        run: ','        continue-on-error: true\n        run: '),
  successBlock.replace('        run: ','          UNREVIEWED_ENV: value\n        run: '),
  successBlock.replace('        if: ','        if: true\n        if: '),
  successBlock.replace('      - name: '+successTitle,'      - name: Unreviewed responsive packaging'),
  successBlock+successBlock,
  '',
 ];
 const sourceMutations=changedBlock.map(block=>workflow.slice(0,successStart)+block+workflow.slice(successEnd));
 sourceMutations.push(workflow.replace(successBlock,'').replace('      - name: '+bindingTitle,successBlock+'      - name: '+bindingTitle));
 sourceMutations.push(workflow.replace('        id: bind_browser_evidence\n','        id: unrelated_binding\n'));
 sourceMutations.push(workflow.replace('        id: bind_browser_evidence\n','        id: bind_browser_evidence\n        id: bind_browser_evidence\n'));
 sourceMutations.push(workflow.replace('      - name: Package bounded browser failure evidence',"      - name: Unreviewed late native check\n        if: matrix.suite == 'range'\n        run: node scripts/late-native.mjs\n      - name: Package bounded browser failure evidence"));
 for(const changed of sourceMutations){assert.notEqual(changed,workflow);for(const suite of SUITES)assert.throws(()=>parseBrowserLane(changed,suite),/responsive success evidence|Unrecognized native browser conditional|Native acceptance step after terminal evidence binding/);}
});

test('only a verified exact native binding can produce the CircleCI success outcome and bounded full flag',()=>{
 for(const full of [undefined,'0','1']){const native=nativeSuccess(),env={KEEP:'unchanged',INKWAVE_BROWSER_STEP_OUTCOME:'failure',INKWAVE_FULL_SUCCESS_EVIDENCE:full},before=structuredClone(native);let calls=0;
  runBoundResponsiveSuccessEvidence(evidenceStep(),native,binding,env,(command,args,options)=>{calls++;assert.equal(command,'bash');assert.deepEqual(args,['-e','-o','pipefail','-c',evidenceStep().command]);assert.equal(options.env.KEEP,'unchanged');assert.equal(options.env.INKWAVE_BROWSER_STEP_OUTCOME,'success');assert.equal(options.env.INKWAVE_FULL_SUCCESS_EVIDENCE,full==='1'?'1':'0');assert.equal(options.stdio,'inherit');return{status:0};});
  assert.equal(calls,1);assert.deepEqual(native,before);assert.equal(env.INKWAVE_BROWSER_STEP_OUTCOME,'failure','caller environment is not promoted or mutated');
 }
 for(const edit of [r=>r.status='failed',r=>r.status='cancelled',r=>r.sourceSha='c'.repeat(40),r=>r.contentHash='c'.repeat(64),r=>r.suite='catalog',r=>r.checks=[],r=>r.checks='forged-checklist',r=>delete r.sourceSha]){const native=nativeSuccess();edit(native);let calls=0;assert.throws(()=>runBoundResponsiveSuccessEvidence(evidenceStep(),native,binding,{INKWAVE_BROWSER_STEP_OUTCOME:'success'},()=>{calls++;return{status:0};}));assert.equal(calls,0);}
 for(const full of ['true','false','','2',1,{}]){let calls=0;assert.throws(()=>runBoundResponsiveSuccessEvidence(evidenceStep(),nativeSuccess(),binding,{INKWAVE_FULL_SUCCESS_EVIDENCE:full},()=>{calls++;return{status:0};}),/flag must be 0 or 1/);assert.equal(calls,0);}
 let calls=0;assert.throws(()=>runBoundResponsiveSuccessEvidence(evidenceStep(),nativeSuccess(),{...binding,suite:'catalog'},{},()=>{calls++;return{status:0};}));assert.equal(calls,0);
 for(const step of [{...evidenceStep(),name:'other'},{...evidenceStep(),command:'node scripts/other.mjs'}])assert.throws(()=>runBoundResponsiveSuccessEvidence(step,nativeSuccess(),binding,{},()=>assert.fail('unknown postprocessor executed')));
});

const runnerText=fs.readFileSync(new URL('../ci/run-circleci-browser-lane.mjs',import.meta.url),'utf8');
const runnerStart=runnerText.indexOf('  for (const step of commands) {'),runnerEnd=runnerText.indexOf("  record.status = 'passed';",runnerStart);
assert(runnerStart>0&&runnerEnd>runnerStart);
const runFragment=new Function('commands','env','record','recordWrite','spawnSync','fs','path','root','sha','expectedHash','suite','successEvidence','runBoundResponsiveSuccessEvidence','assert','console',runnerText.slice(runnerStart,runnerEnd));
function scalarRun({failAt=null,native=nativeSuccess(),packageResult={status:0}}={}){
 const commands=[{name:'native scalar check',command:'native-scalar'},{name:bindingTitle,command:'bind-scalar'}],events=[],record={status:'running'},env={INKWAVE_BROWSER_STEP_OUTCOME:'failure'},successEvidence=evidenceStep();let writes=0;
 const execute=(command,args,options)=>{const body=args.at(-1);if(body===successEvidence.command){events.push('package');assert.equal(options.env.INKWAVE_BROWSER_STEP_OUTCOME,'success');return packageResult;}events.push(body);return{status:body===failAt?1:0};};
 const fakeFS={readFileSync(file,encoding){assert.equal(file,path.join('/scalar-root','evidence','ci-result.json'));assert.equal(encoding,'utf8');events.push('read-bound-receipt');return JSON.stringify(native);}};
 let error;try{runFragment(commands,env,record,()=>{writes++;},execute,fakeFS,path,'/scalar-root',binding.sourceSha,binding.contentHash,binding.suite,successEvidence,(step,native,binding,env)=>runBoundResponsiveSuccessEvidence(step,native,binding,env,execute),assert,{log(){}});}catch(e){error=e;}
 return{events,record,writes,error};
}

test('actual CircleCI orchestration reads the native binding before running the exact successful postprocessor',()=>{const result=scalarRun();assert.equal(result.error,undefined);assert.deepEqual(result.events,['native-scalar','bind-scalar','read-bound-receipt','package']);});
test('actual CircleCI orchestration cannot reuse an old success after a native command or binding failure',()=>{for(const failAt of ['native-scalar','bind-scalar']){const result=scalarRun({failAt});assert(result.error);assert.equal(result.record.status,'failed');assert(!result.events.includes('read-bound-receipt'));assert(!result.events.includes('package'));}const result=scalarRun({native:{...nativeSuccess(),sourceSha:'c'.repeat(40)}});assert(result.error);assert(result.events.includes('read-bound-receipt'));assert(!result.events.includes('package'));});
test('actual CircleCI orchestration retains postprocessor exit and signal failures as failure',()=>{for(const packageResult of [{status:7},{status:null,signal:'SIGTERM'},{status:null,error:new Error('spawn denied')}]){const result=scalarRun({packageResult});assert(result.error);assert.equal(result.record.status,'failed');assert.equal(result.record.failedStep,successTitle);assert.equal(result.record.exitCode,packageResult.status);assert.equal(result.record.signal,packageResult.signal||null);assert.equal(result.writes,1);if(packageResult.error)assert.equal(result.error.cause,packageResult.error);}});
