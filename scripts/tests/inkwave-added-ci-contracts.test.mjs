import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {parse} from '../../patches/loading-cache/vendor/acorn.mjs';
import {assertValidateWorkflowContract} from '../ci/inkwave-validate-contract.mjs';
const root=new URL('../../',import.meta.url);
const read=name=>fs.readFileSync(new URL('.github/workflows/'+name,root),'utf8');
const expression="${{ github.workflow }}-${{ github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.number) || format('run-{0}', github.run_id) }}";
const quality=read('ci-quality-gate.yml');
function qualityPolicy(source){const block=/^concurrency:\n((?:[ \t].*\n)*)/m.exec(source)?.[1];assert(block);assert.equal(/^  group: (.*)$/m.exec(block)?.[1],expression);assert.match(block,/^  cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}$/m);return true;}
const group=({workflow='A+',event,pr,ref,run})=>`${workflow}-${event==='pull_request'?`pr-${pr}`:`run-${run}`}`;
test('A+ replaces obsolete PR checks while retaining every main and manual run',()=>{
 qualityPolicy(quality);
 const context={event:'pull_request',pr:1815,run:1};assert.equal(group(context),group({...context,run:2}));
 assert.notEqual(group({event:'push',ref:'refs/heads/main',run:1}),group({event:'push',ref:'refs/heads/main',run:2}));
 assert.notEqual(group({event:'pull_request',pr:1815}),group({event:'pull_request',pr:1816}));
 assert.notEqual(group({event:'pull_request',pr:1815}),group({event:'push',ref:'refs/heads/main'}));
 assert.notEqual(group({event:'workflow_dispatch',run:1}),group({event:'workflow_dispatch',run:2}));
 for(const changed of [quality.replace(expression,'all-inkwave'),quality.replace(expression,'${{ github.sha }}'),quality.replace("cancel-in-progress: ${{ github.event_name == 'pull_request' }}",'cancel-in-progress: true')])assert.throws(()=>qualityPolicy(changed));
});
test('required checks keep their identities and cancellation cannot skip the required Validate fan-in',()=>{
 assert.match(quality,/^  verify-aplus-suite:\n/m);assert.doesNotMatch(quality,/^    if:.*cancelled\(\)/m);
 const source=read('validate-inkwave-update.yml'),gate=source.slice(source.indexOf('  validate:'),source.indexOf('  browser:'));
 assertValidateWorkflowContract(source);
 assert.ok(gate.includes("if: ${{ always() && inputs.diagnostic_only != true && (github.event_name != 'pull_request' || github.event.pull_request.draft == false) }}"));
 assert.match(gate,/needs: \[admission_preflight, build_site, validate_core, patch_tests, circleci_offload_gate, browser, seven_claims, resource_paint_continuation\]/);assert.match(gate,/test "\$PREFLIGHT_RESULT" = success/);assert.match(gate,/test "\$CORE_RESULT" = success/);assert.match(gate,/test "\$PATCH_RESULT" = success/);assert.match(gate,/test "\$PATCH_RESULT" = skipped/);assert.match(gate,/test "\$CIRCLECI_RESULT" = success/);assert.match(gate,/test "\$CIRCLECI_RESULT" = skipped/);assert.match(source,/INKWAVE_CIRCLECI_OFFLOAD/);
 assert.doesNotMatch(gate,/!cancelled\(\)|continue-on-error/);
});
const profile=['/*','!/*/','/.github/','/inkwave-public/','/patches/','/scripts/','/server/','/tests/','/tools/','!/tools/inkwave-modeler/','/reports/','/docs/'];
// Only Validate core executes the CircleCI parity gate that reads this config.
const coreProfile=[...profile.slice(0,3),'/.circleci/config.yml',...profile.slice(3)];
// The build job consumes only the checked-in ink-volume source under reports.
const buildProfile=profile.flatMap(p=>p==='/reports/'?[p,'!/reports/*','/reports/ink-volume/','!/reports/ink-volume/*','/reports/ink-volume/source/']:[p]);
// Keep the original profiles exact for the other jobs. These two reviewed
// expansions materialize the complete JavaScript metadata audit inventory.
const auditJavaScriptProfile=['*.js','*.mjs','*.cjs'];
const buildAuditProfile=[...buildProfile,'# The global metadata AST guard reads every tracked JavaScript file.',...auditJavaScriptProfile];
const coreAuditProfile=[...coreProfile,'# Include audit code while keeping excluded authoring binaries absent.',...auditJavaScriptProfile];
// Main-weapon jobs also consume the exact tracked JavaScript closure, while
// retaining only ink-volume source under reports (no historical evidence).
const weaponProfile=[...profile.slice(0,-1),'!/reports/*','/reports/ink-volume/','!/reports/ink-volume/*','/reports/ink-volume/source/','/docs/',...auditJavaScriptProfile];
// Exact immutable checkout input closure for the mandatory low-cost preflight.
const admissionProfile=['/scripts/','/patches/','/inkwave-public/src/','/inkwave-public/index.html','/inkwave-public/sw.js','/.github/workflows/','/package-lock.json'];
function checkouts(source){return [...source.matchAll(/      - uses: actions\/checkout@v4\n([\s\S]*?)(?=      - |$)/g)].map(m=>({job:[...source.slice(0,m.index).matchAll(/^  ([\w-]+):$/gm)].at(-1)?.[1],block:m[1]}));}
function assertCurrentCheckouts(name,source,count){
 const blocks=checkouts(source);assert.equal(blocks.length,count);
 if(name==='validate-inkwave-update.yml')assert.equal(blocks.filter(({job})=>job==='validate_core').length,1,'one native core checkout');
 for(const {job,block}of blocks){if(block.includes('ref: 83f27e5d59db944458a85122a95d1154e3543393')){assert.doesNotMatch(block,/filter:|sparse-checkout/);continue;}assert.match(block,/filter: blob:none/);assert.match(block,/sparse-checkout-cone-mode: false/);const actual=/sparse-checkout: \|\n((?:            .*\n)*)/.exec(block)?.[1].trim().split('\n').map(x=>x.trim());assert.deepEqual(actual,name==='validate-inkwave-update.yml'&&job==='admission_preflight'?admissionProfile:name==='validate-inkwave-update.yml'&&job==='build_site'?buildAuditProfile:name==='validate-inkwave-update.yml'&&job==='validate_core'?coreAuditProfile:name==='inkwave-main-weapons.yml'?weaponProfile:profile,name+' '+job);assert.match(block,/ref: \$\{\{|ref: 83f27e5d59db944458a85122a95d1154e3543393/);}
}
test('current sparse checkouts retain the complete input closure and historical baseline stays full',()=>{
 for(const[name,count]of[['validate-inkwave-update.yml',11],['inkwave-main-weapons.yml',4]])assertCurrentCheckouts(name,read(name),count);
 const weapon=read('inkwave-main-weapons.yml');assert.match(weapon,/ref: 83f27e5d59db944458a85122a95d1154e3543393[\s\S]*path: work\/roller-grip-baseline/);assert.match(weapon,/git fetch --no-tags --depth=1 origin "\$DIFF_BASE"/);
});
test('exact job-bound sparse profiles reject missing, unexpected and misplaced CircleCI inputs',()=>{
 const name='validate-inkwave-update.yml',source=read(name),circle='            /.circleci/config.yml\n';
 assertCurrentCheckouts(name,source,11);
 for(const altered of [
  source.replace('            /package-lock.json\n',''),
  source.replace('            /package-lock.json\n','            /package.json\n'),
  source.replace('            /package-lock.json\n','            /package-lock.json\n            /package-lock.json\n'),
  source.replace(circle,''),
  source.replace(circle,circle+'            /unexpected-input/\n'),
  source.replace(circle,circle+circle),
  source.replace(circle+'            /inkwave-public/\n','            /inkwave-public/\n'+circle),
  source.replace('  validate_core:\n','  renamed_core:\n'),
  source.replace('            /.github/\n','            /.github/\n'+circle),
 ]){assert.notEqual(altered,source);assert.throws(()=>assertCurrentCheckouts(name,altered,11));}
 const weapon=read('inkwave-main-weapons.yml');
 assert.throws(()=>assertCurrentCheckouts('inkwave-main-weapons.yml',weapon.replace('            /.github/\n','            /.github/\n'+circle),4));
 for(const audit of [buildAuditProfile,coreAuditProfile]){
  const tail=audit.slice(-4).map(line=>'            '+line+'\n').join('');
  for(const pattern of auditJavaScriptProfile)for(const change of ['',pattern+'\n            '+pattern,'*.py']){
   const altered=source.replace(tail,tail.replace('            '+pattern+'\n',change?'            '+change+'\n':''));
   assert.notEqual(altered,source);assert.throws(()=>assertCurrentCheckouts(name,altered,11));
  }
 }
});
function matches(pattern,file){let out='^';for(let i=0;i<pattern.length;i++){const c=pattern[i];if(c==='*'){if(pattern[i+1]==='*'){out+='.*';i++;}else out+='[^/]*';}else if(c==='?')out+='[^/]';else out+=c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}return new RegExp(out+'$').test(file);}
function paths(source,event){const section=event==='push'?source.slice(source.indexOf('  push:'),source.indexOf('  pull_request:')):source.slice(source.indexOf('  pull_request:'),source.indexOf('  workflow_dispatch:'));return [...section.matchAll(/^      - '([^']+)'$/gm)].map(m=>m[1]);}
test('both main-weapon event filters cover every executed test entrypoint, including negative missing-route controls',()=>{
 const source=read('inkwave-main-weapons.yml');const entries=[...new Set(source.match(/(?:patches|scripts|server|tests)\/[\w./-]+\.test\.mjs/g)||[])];assert(entries.length>=40);
 const covered=patterns=>entries.every(file=>patterns.some(p=>matches(p,file)));
 for(const event of['push','pull_request']){const patterns=paths(source,event);assert(covered(patterns));for(const missing of['issue-771-roller-speed-swerve','reverse-shot-release','source-posture','roller-flick-movement','roller','bomb-kit-fidelity','air-attack-acceleration','dynamo-handle-center','brella-physics','stringer-source-1130','stringer-tilt-motion']){const exact='patches/splatoon3/tests/'+missing+'.test.mjs';assert.equal(covered(patterns.filter(p=>p!==exact)),false,'missing route '+exact);}}
});
const sparseFixtureFile='scripts/tests/inkwave-ci-sparse-checkout.test.mjs';
const historicalSparseFixtureSha256='b8c11c5cfeb0a5ed219323973d9a3154e51faa22a1461f58c545e34c72425452';
const excludedFixturePaths=['tools/inkwave-modeler/blender/large.blend','tools/inkwave-modeler/docs/reference.png','tools/inkwave-modeler/src/editor.js'];
// The exception is limited to the two audited fixture snapshots. This also
// prevents an added prototype mutation or dynamic side effect from intercepting
// approved text operations. Future fixture edits require an explicit re-review.
const fixtureSourcePins={
 [sparseFixtureFile]:'05303588abb91c74e0925b410702f72ca7e0e91e1e0f361134f8e226af30a0fb',
 'scripts/tests/continuous-browser-video.test.mjs':'7436ae93586542669dcab5b9756dfbb279fb0292e02b3792a9e693273b16d6f3',
};
// Re-reviewed touch CI delta: crypto import, test title/unused-install expectation,
// and one workflow-restoration negative control only. Reverse the exact reviewed
// text to the original whole-file seal; synthetic fixture/consumer AST pins below
// remain unchanged. An unrelated edit fails both current and historical seals.
const reviewedSparseSourceDelta = [
  {
    "before": "",
    "after": "import {createHash} from 'node:crypto';\n"
  },
  {
    "before": "test('test jobs keep original entries and only the pinned build dependency where required',()=>{\n",
    "after": "test('test-only jobs keep original entries without installing unused packages',()=>{\n"
  },
  {
    "before": "  const source=read('.github/workflows/'+workflow);if(workflow==='inkwave-touch-frame-pacing.yml'){assert.equal((source.match(/npm install/g)||[]).length,1);assert.match(source,/npm install --no-save --no-package-lock --silent esbuild@0\\.28\\.2/);assert.doesNotMatch(source,/playwright|npx /);}else assert.doesNotMatch(source,/npm install|npx /);assert.match(source,/node-version: 22/);assert.match(source,/node --experimental-vm-modules --test /);for(const entry of tests)assert(source.includes(entry));\n",
    "after": "  const source=read('.github/workflows/'+workflow);assert.doesNotMatch(source,/npm install|npm ci|playwright|npx /);assert.match(source,/node-version: 22/);assert.match(source,/node --experimental-vm-modules --test /);for(const entry of tests)assert(source.includes(entry));\n"
  },
  {
    "before": "",
    "after": "\ntest('touch test-only dependency removal restores the exact reviewed prior workflow',()=>{\n const source=read('.github/workflows/inkwave-touch-frame-pacing.yml');\n const boundary=\"      - name: Verify touch cadence, profiler and final composed main loop\\n\";\n assert.equal(source.split(boundary).length,2);\n const restored=source.replace(boundary,\"      - name: Install pinned build dependency\\n        run: npm install --no-save --no-package-lock --silent esbuild@0.28.2\\n\"+boundary);\n assert.equal(createHash('sha256').update(restored).digest('hex'),\"3894070c7ca5bdd936c5eecec84f5ffe5b9c6a20e6d347941e0651a672cf9371\");\n});\n"
  }
];
function restoreReviewedSparseSource(source) {
 let restored=source;
 for(const {before,after} of reviewedSparseSourceDelta) {
  assert.equal(restored.split(after).length,2,'exactly one reviewed sparse fixture delta');
  restored=restored.replace(after,before);
 }
 assert.equal(createHash('sha256').update(restored).digest('hex'),
  '788a50eee7f93cd50c301fe45c96f62942295f2c75948c89b1bf247190bef272',
  'reversed sparse fixture must retain the exact original audited source');
 return restored;
}
test('reviewed touch CI fixture delta reverses to its immutable original source seal',()=>{
 const source=fs.readFileSync(new URL(sparseFixtureFile,root),'utf8');
 assert.equal(createHash('sha256').update(source).digest('hex'),fixtureSourcePins[sparseFixtureFile]);
 restoreReviewedSparseSource(source);
 const boundary='\n// The metadata guard deliberately audits every tracked JavaScript module, not';
 assert.equal(source.split(boundary).length,2);
 assert.equal(createHash('sha256').update(source.split(boundary)[0]).digest('hex'),
  'd1c3a8e8702f0033e2df9c7a0b9ce1244c02e3f8cd0d030f3870087f2053c2fb',
  'global-audit suffix removal retains the exact author-reviewed touch epoch');
 for(const {after} of reviewedSparseSourceDelta) {
  assert.throws(()=>restoreReviewedSparseSource(source.replace(after,'')));
  assert.throws(()=>restoreReviewedSparseSource(source+after));
 }
 assert.throws(()=>restoreReviewedSparseSource(source+'\n// unrelated fixture mutation\n'));
});
// Re-reviewed 2026-10-29: removed only the byte-identical second sparse-negative
// loop. All three immutable consumer hashes and all original workflow blob
// seals below are unchanged; each negative control still runs exactly once.
// Only three literal nodes in this one audited test describe sparse exclusions;
// none is an input consumed by the build or runtime. The owning constructs
// are pinned as a whole: permitting an otherwise legitimate identifier as an
// arbitrary subexpression would allow an alias, import, or filesystem read.
const volumeFixtureFile='scripts/tests/continuous-browser-video.test.mjs';
const volumeSparseLiteral='          filter: blob:none\n          sparse-checkout-cone-mode: false\n          sparse-checkout: |\n            /*\n            !/tools/inkwave-modeler/blender/\n            !/tools/inkwave-modeler/docs/\n';
const volumeConsumerPins={
 assertUnchangedDefaultVolumeJob:'21c5260329a72134ccd25df81c597362ffd5e03373155e79c2fb0c44df7f5c0f',
 sparseNegativeControls:'536b2a51855b47a205fb9ea08bf4b78e1b0df743916715d47fba74a85c4fca7a',
 workflowNegativeControls:'2090dd9f7cc10b7fcd94c91e3d53bdef2dfc3c3fd160348145d19c07eff3ccc5',
};
function maskReviewedVolumeFixture(source){
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
 const declarations=ast.body.filter(n=>n.type==='VariableDeclaration'&&n.kind==='const').flatMap(n=>n.declarations).filter(n=>n.id.type==='Identifier'&&n.id.name==='reviewedSparseCheckout');
 assert.equal(declarations.length,1,'one audited sparse literal binding');
 const declaration=declarations[0];
 assert.equal(declaration.init?.type,'Literal','sparse exclusion must be literal data');
 assert.equal(declaration.init.value,volumeSparseLiteral);
 const functions=ast.body.filter(n=>n.type==='FunctionDeclaration'&&n.id?.name==='assertUnchangedDefaultVolumeJob');
 const negatives=ast.body.filter(n=>n.type==='ForOfStatement'&&source.slice(n.start,n.end).includes("['missing sparse fetch',"));
 assert.equal(functions.length,1);assert.equal(negatives.length,1,'exactly one reviewed sparse negative loop');
 const workflowNegatives=ast.body.filter(n=>n.type==='ForOfStatement'&&source.slice(n.start,n.end).includes("['missing build trigger',"));
 assert.equal(workflowNegatives.length,1);
 const allowed=[functions[0],...negatives],workflowNegative=workflowNegatives[0];
 for(const [node,pin]of [[allowed[0],volumeConsumerPins.assertUnchangedDefaultVolumeJob],...negatives.map(node=>[node,volumeConsumerPins.sparseNegativeControls]),[workflowNegative,volumeConsumerPins.workflowNegativeControls]])
  assert.equal(createHash('sha256').update(source.slice(node.start,node.end)).digest('hex'),pin,'sparse data consumers must remain audited text-only operations');
 let literals=[];let identifiers=0;
 const visit=(node,ancestors=[])=>{
  if(!node||typeof node!=='object')return;
  assert(!(node.type==='Identifier'&&node.name==='eval'),'dynamic eval cannot access audited fixture bindings');
  if(node.type==='Identifier'&&node.name==='reviewedSparseCheckout'&&node!==declaration.id){
   assert(allowed.some(owner=>ancestors.includes(owner)),'sparse exclusion may not be used outside audited consumers');identifiers++;
  }
  if(node.type==='Literal'&&typeof node.value==='string'&&node.value.includes('tools/inkwave-modeler/')&&node!==declaration.init){
   if(negatives.some(owner=>ancestors.includes(owner)))assert.equal(node.value,'!/tools/inkwave-modeler/blender/');
   else {
    assert(ancestors.includes(workflowNegative),'only audited negative-control literals are data');
    assert(['!/tools/inkwave-modeler/docs/','/tools/inkwave-modeler/docs/'].includes(node.value));
   }
   literals.push(node);
  }
  for(const value of Object.values(node))if(Array.isArray(value)){for(const child of value)visit(child,[...ancestors,node]);}else if(value&&typeof value==='object')visit(value,[...ancestors,node]);
 };
 visit(ast);assert.equal(identifiers,6);
 assert.deepEqual(literals.map(n=>n.value).sort(),['!/tools/inkwave-modeler/blender/','!/tools/inkwave-modeler/docs/','/tools/inkwave-modeler/docs/'].sort());
 let checked=source;for(const node of [declaration.init,...literals].sort((a,b)=>b.start-a.start))checked=checked.slice(0,node.start)+"''"+checked.slice(node.end);
 return checked;
}
function assertNoAuthoringDependency(file,source){
 if(Object.hasOwn(fixtureSourcePins,file))
  assert.equal(createHash('sha256').update(source).digest('hex'),fixtureSourcePins[file],'audited fixture changed; re-review before updating its narrow literal exemption');
 let checked=file===volumeFixtureFile?maskReviewedVolumeFixture(source):source;
 if(file===sparseFixtureFile){
  restoreReviewedSparseSource(source);
  // Only the reviewed literal data in this temporary-repository fixture is
  // exempt. Imports, filesystem references and the rest of its code are scanned.
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
  const bindings=ast.body.filter(n=>n.type==='VariableDeclaration'&&n.kind==='const').flatMap(n=>n.declarations);
  const declarations=bindings.filter(n=>n.id.type==='Identifier'&&n.id.name==='excludedAuthoringFixturePaths');
  assert.equal(declarations.length,1,'one explicit synthetic fixture declaration');
  const declaration=declarations[0],data=declaration.init;
  assert.equal(data?.type,'ArrayExpression','fixture paths are data, never executable expressions');
  assert.deepEqual(data.elements.map(n=>n?.type==='Literal'?n.value:null),excludedFixturePaths);
  const exampleDeclarations=bindings.filter(n=>n.id.type==='Identifier'&&n.id.name==='examples');
  assert.equal(exampleDeclarations.length,1,'one synthetic examples binding');
  const examples=exampleDeclarations[0].init;
  assert.equal(examples?.type,'ArrayExpression');
  const loops=ast.body.filter(n=>n.type==='ForOfStatement');
  assert.equal(loops.length,1,'one audited temporary-repository consumer');
  const hash=node=>createHash('sha256').update(source.slice(node.start,node.end)).digest('hex');
  assert.equal(hash(examples),'d4adf6f46026455bd6a5de54b1c53b292882aabc3c6f92239824cdda4ceb6b51','examples are only reviewed synthetic data');
  assert.equal(hash(loops[0]),'a2d12f255e47de617fd9304380266dddc110d5d1a2fdaada4ee1c31edb748ad8','synthetic data are only used in the audited temporary fixture');
  const visit=(node,parent,grandparent,ancestors=[])=>{
   if(!node||typeof node!=='object')return;
   assert(!(node.type==='Identifier'&&node.name==='eval'),'dynamic eval cannot access audited fixture bindings');
   if(node.type==='Identifier'&&node.name==='excludedAuthoringFixturePaths'&&node!==declaration.id){
    const list=parent?.type==='SpreadElement'&&grandparent===examples&&examples?.type==='ArrayExpression';
    const membership=parent?.type==='MemberExpression'&&parent.object===node&&!parent.computed&&parent.property.name==='includes'
     &&grandparent?.type==='CallExpression'&&grandparent.callee===parent&&ancestors.includes(loops[0]);
    assert(list||membership,'synthetic paths cannot become an import or filesystem dependency');
   }
   if(node.type==='Identifier'&&node.name==='examples'&&node!==exampleDeclarations[0].id)
    assert(ancestors.includes(loops[0]),'synthetic examples cannot become an import or filesystem dependency outside the audited fixture');
   for(const value of Object.values(node))if(Array.isArray(value)){for(const child of value)visit(child,node,parent,[...ancestors,node]);}else if(value&&typeof value==='object')visit(value,node,parent,[...ancestors,node]);
  };
  visit(ast);
  checked=source.slice(0,data.start)+'[]'+source.slice(data.end);
 }
 assert.doesNotMatch(checked,/tools\/inkwave-modeler\//,'excluded authoring dependency in '+file);
}
test('expanded sparse audit retains the complete historical fixture bytes',()=>{
 const source=fs.readFileSync(new URL(sparseFixtureFile,root),'utf8');
 const restored=restoreReviewedSparseSource(source);
 const boundary=restored.indexOf('\n// The metadata guard deliberately audits every tracked JavaScript module, not');
 assert.ok(boundary>0,'one explicit boundary for the later global metadata tests');
 assert.equal(createHash('sha256').update(restored.slice(0,boundary)).digest('hex'),historicalSparseFixtureSha256);
});
test('the excluded authoring workbench is not referenced by runtime/test/build input code',()=>{
 const files=execFileSync('git',['ls-files','-z','inkwave-public','patches','scripts','server','tests'],{cwd:root,encoding:'utf8'}).split('\0').filter(f=>/\.(?:mjs|js|py)$/.test(f)&&f!=='scripts/tests/inkwave-added-ci-contracts.test.mjs');
 for(const file of files)assertNoAuthoringDependency(file,fs.readFileSync(new URL(file,root),'utf8'));
});

test('authoring dependency guard rejects executable fixture paths and extra consumers',()=>{
 const fixture=fs.readFileSync(new URL(sparseFixtureFile,root),'utf8');
 assertNoAuthoringDependency(sparseFixtureFile,fixture);
 for(const mutation of [
  fixture.replace("'tools/inkwave-modeler/blender/large.blend'","String('tools/inkwave-modeler/blender/large.blend')"),
  fixture+"\nfs.readFileSync(excludedAuthoringFixturePaths[0]);\n",
  fixture+"\nimport 'tools/inkwave-modeler/src/editor.js';\n",
  fixture.replace('const examples=[...excludedAuthoringFixturePaths,','const examples=[...excludedAuthoringFixturePaths.map(x=>x),'),
 ])assert.throws(()=>assertNoAuthoringDependency(sparseFixtureFile,mutation));
 assert.throws(()=>assertNoAuthoringDependency('scripts/runtime.mjs',"import 'tools/inkwave-modeler/src/editor.js';"));
});

test('synthetic sparse paths cannot hide real authoring imports or filesystem reads',()=>{
 const source=fs.readFileSync(new URL(sparseFixtureFile,root),'utf8');
 assertNoAuthoringDependency(sparseFixtureFile,source);
 for(const extra of [
  "import editor from '../../tools/inkwave-modeler/src/editor.js';",
  "await import('../../tools/inkwave-modeler/src/editor.js');",
  "fs.readFileSync(new URL('../../tools/inkwave-modeler/src/editor.js',import.meta.url));",
  "fs.readFileSync('tools/inkwave-modeler/blender/large.blend');",
  'await import(excludedAuthoringFixturePaths[1]);',
  'fs.readFileSync(excludedAuthoringFixturePaths[0]);',
  'fs.readFileSync(...excludedAuthoringFixturePaths);',
  'await import(examples[2]);',
  'fs.readFileSync(examples[0]);',
  'const alias=examples; fs.readFileSync(alias[0]);',
  "await import(eval('examples')[2]);",
  'Array.prototype.includes=function(){fs.readFileSync(this[0]);return false};excludedAuthoringFixturePaths.includes(0);',
  'const readAlias=fs.readFileSync.bind(fs);readAlias(examples[0]);',
  "Array.prototype.includes=(()=>{}).constructor('fs.readFileSync(this[0])');",
 ])assert.throws(()=>assertNoAuthoringDependency(sparseFixtureFile,source+'\n'+extra));
 assert.throws(()=>assertNoAuthoringDependency('inkwave-public/src/main.js',source),'fixture data is not a general source exemption');
 assert.throws(()=>assertNoAuthoringDependency(sparseFixtureFile,source.replace("['tools/inkwave-modeler/blender/large.blend'","[fs.readFileSync('tools/inkwave-modeler/blender/large.blend')")),'fixture initializer cannot execute a read');
});

// Exercise the installed final gate, rather than merely finding status words.
// This proves no partial, failed or canceled native/offloaded fan-in is green.
test('actual Validate shell requires precisely the native or offloaded complete fan-in',()=>{
 const workflow=read('validate-inkwave-update.yml');
 const gate=workflow.slice(workflow.indexOf('  validate:'),workflow.indexOf('  browser:'));
 const body=gate.split('        run: |\n')[1];assert(body,'required gate shell');
 const shell=body.split('\n').map(line=>line.replace(/^          /,'')).join('\n');
 const admissible=(offload,core,patch,circle)=>({
  PREFLIGHT_RESULT:'success',BUILD_RESULT:'success',CONTRACTS_ONLY:'false',
  CORE_RESULT:core,PATCH_RESULT:patch,CIRCLECI_RESULT:circle,
  BROWSER_RESULT:offload?'skipped':'success',SEVEN_RESULT:'success',RESOURCE_RESULT:'success',
  OFFLOAD_ACTIVE:String(offload)
 });
 const baseline=admissible(false,'success','success','skipped');
 const run=(command,env)=>spawnSync('bash',['--noprofile','--norc','-e','-o','pipefail','-c',command],{env:{...process.env,...baseline,...env},encoding:'utf8'});
 for(const offload of [false,true])for(const core of ['success','failure','cancelled','skipped'])for(const patch of ['success','failure','cancelled','skipped'])for(const circle of ['success','failure','cancelled','skipped']){
  const env=admissible(offload,core,patch,circle);
  const result=run(shell,env);assert.ifError(result.error);
  assert.equal(result.status===0,core==='success'&&(offload?patch==='skipped'&&circle==='success':patch==='success'&&circle==='skipped'),JSON.stringify(env));
 }
 // Each mandatory new result must reject failure, cancellation and omission.
 for(const name of ['PREFLIGHT_RESULT','BUILD_RESULT','BROWSER_RESULT','SEVEN_RESULT','RESOURCE_RESULT'])for(const state of ['failure','cancelled','skipped'])assert.notEqual(run(shell,{[name]:state}).status,0,name+'='+state);
 for(const state of ['failure','cancelled','success'])assert.notEqual(run(shell,{OFFLOAD_ACTIVE:'true',PATCH_RESULT:'skipped',CIRCLECI_RESULT:'success',BROWSER_RESULT:state}).status,0,'offloaded browser '+state);
 // The new gate must reject a failed preflight even when all legacy jobs pass.
 const preflightFailed={...admissible(false,'success','success','skipped'),PREFLIGHT_RESULT:'failure'};
 assert.notEqual(run(shell,preflightFailed).status,0);
 assert.equal(run(shell.replace('test "$PREFLIGHT_RESULT" = success','true # missing preflight guard'),preflightFailed).status,0);
 for(const [needle,env]of [
  ['test "$CORE_RESULT" = success',admissible(false,'failure','success','skipped')],
  ['test "$PATCH_RESULT" = success',admissible(false,'success','failure','skipped')],
  ['test "$CIRCLECI_RESULT" = success',admissible(true,'success','skipped','failure')],
 ]){
  const altered=shell.replace(needle,'true # removed required receipt');assert.notEqual(altered,shell);
  assert.notEqual(run(shell,env).status,0);assert.equal(run(altered,env).status,0,'negative control exposes omitted '+needle);
 }
 const heavy=['CORE_RESULT','PATCH_RESULT','CIRCLECI_RESULT','BROWSER_RESULT','SEVEN_RESULT','RESOURCE_RESULT'];
 const contracts={...baseline,CONTRACTS_ONLY:'true',...Object.fromEntries(heavy.map(name=>[name,'skipped']))};
 for(const good of [baseline,{...baseline,OFFLOAD_ACTIVE:'true',PATCH_RESULT:'skipped',CIRCLECI_RESULT:'success',BROWSER_RESULT:'skipped'},contracts]){
  assert.equal(run(shell,good).status,0,'complete current gate');
  for(const name of Object.keys(baseline).filter(name=>name.endsWith('_RESULT'))){
   for(const value of ['success','failure','cancelled','skipped']){
    if(value===good[name])continue;
    assert.notEqual(run(shell,{...good,[name]:value}).status,0,'gate rejects '+name+'='+value);
   }
  }
 }
 for(const scope of ['', 'unknown'])assert.notEqual(run(shell,{...baseline,CONTRACTS_ONLY:scope}).status,0);
});


test('volume exclusions are limited to audited literal data, never executable consumers',()=>{
 const source=fs.readFileSync(new URL(volumeFixtureFile,root),'utf8');
 assertNoAuthoringDependency(volumeFixtureFile,source);
 // Exercise the AST restriction independently of the whole-source pin as well.
 maskReviewedVolumeFixture(source);
 // The single reviewed loop is pinned: removing, duplicating or modifying it
 // must fail even when bypassing the outer whole-file digest check.
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
 const loops=ast.body.filter(n=>n.type==='ForOfStatement'&&source.slice(n.start,n.end).includes("['missing sparse fetch',"));
 assert.equal(loops.length,1);
 for(const loop of loops){
  assert.throws(()=>maskReviewedVolumeFixture(source.slice(0,loop.start)+source.slice(loop.end)));
  const body=source.slice(loop.start,loop.end),bad=body.replace("s.replace(reviewedSparseCheckout,'')","fs.readFileSync(reviewedSparseCheckout)");
  assert.notEqual(bad,body);assert.throws(()=>maskReviewedVolumeFixture(source.slice(0,loop.start)+bad+source.slice(loop.end)));
 }
 assert.throws(()=>maskReviewedVolumeFixture(source+'\n'+source.slice(loops[0].start,loops[0].end)));
 for(const changed of [
  source+'\nconst alias=reviewedSparseCheckout;',
  source+"\neval('reviewedSparseCheckout');",
  source.replace('s.replace("!/tools/inkwave-modeler/docs/","/tools/inkwave-modeler/docs/")','fs.readFileSync("/tools/inkwave-modeler/docs/")'),
 ]){assert.notEqual(changed,source);assert.throws(()=>maskReviewedVolumeFixture(changed));}
 for(const extra of [
  "import '../../tools/inkwave-modeler/src/editor.js';",
  "await import('../../tools/inkwave-modeler/src/editor.js');",
  "fs.readFileSync('tools/inkwave-modeler/blender/large.blend');",
  'await import(reviewedSparseCheckout);',
  'fs.readFileSync(reviewedSparseCheckout);',
  'const alias=reviewedSparseCheckout;',
  'const loader=()=>reviewedSparseCheckout;',
  "fs.readFileSync(eval('reviewedSparseCheckout').split('\\n')[4].trim().slice(2));",
  "await import(eval('reviewedSparseCheckout').split('\\n')[4].trim().slice(2));",
  "const indirect=eval; indirect('reviewedSparseCheckout');",
  "String.prototype.replace=function(...args){fs.readFileSync(args[0]);return this;};",
  'const bound=fs.readFileSync.bind(fs);bound(reviewedSparseCheckout);',
  "String.prototype.replace=(()=>{}).constructor('fs.readFileSync(arguments[0])');",
 ])assert.throws(()=>assertNoAuthoringDependency(volumeFixtureFile,source+'\n'+extra));
 for(const changed of [
  source.replace("const reviewedSparseCheckout = '","const reviewedSparseCheckout = String('").replace('const reviewedRetention',"); const reviewedRetention"),
  source.replace('!/tools/inkwave-modeler/docs/','!/tools/inkwave-modeler/'),
  source.replace("s.replace('!/tools/inkwave-modeler/blender/','!/tools/')","fs.readFileSync('!/tools/inkwave-modeler/blender/')"),
  source.replace('s.replace("!/tools/inkwave-modeler/docs/","/tools/inkwave-modeler/docs/")','fs.readFileSync("/tools/inkwave-modeler/docs/")'),
  source.replace('[reviewedSparseCheckout,checkoutAnchor]','fs.readFileSync([reviewedSparseCheckout,checkoutAnchor])'),
  source.replace("assert.equal(old.split(addition).length-1,1,", "fs.readFileSync(addition);assert.equal(old.split(addition).length-1,1,"),
  source.replace("s.replace(reviewedSparseCheckout,'')","fs.readFileSync(s.replace(reviewedSparseCheckout,''))"),
 ]){assert.notEqual(changed,source);assert.throws(()=>assertNoAuthoringDependency(volumeFixtureFile,changed));}
 assert.throws(()=>assertNoAuthoringDependency('scripts/runtime.mjs',source),'exception belongs only to audited test');
});
