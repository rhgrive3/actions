import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {parse} from '../../patches/loading-cache/vendor/acorn.mjs';
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
 assert.match(gate,/if: \$\{\{ always\(\) && inputs\.diagnostic_only != true \}\}/);
 assert.match(gate,/needs: \[validate_core, patch_tests\]/);assert.match(gate,/test "\$CORE_RESULT" = success/);assert.match(gate,/test "\$PATCH_RESULT" = success/);
 assert.doesNotMatch(gate,/!cancelled\(\)|continue-on-error/);
});
const profile=['/*','!/*/','/.github/','/inkwave-public/','/patches/','/scripts/','/server/','/tests/','/tools/','!/tools/inkwave-modeler/','/reports/','/docs/'];
function checkouts(source){return [...source.matchAll(/      - uses: actions\/checkout@v4\n([\s\S]*?)(?=      - |$)/g)].map(m=>m[1]);}
test('current sparse checkouts retain the complete input closure and historical baseline stays full',()=>{
 for(const[name,count]of[['validate-inkwave-update.yml',9],['inkwave-main-weapons.yml',4]]){
  const blocks=checkouts(read(name));assert.equal(blocks.length,count);
  for(const block of blocks){if(block.includes('ref: 83f27e5d59db944458a85122a95d1154e3543393')){assert.doesNotMatch(block,/filter:|sparse-checkout/);continue;}assert.match(block,/filter: blob:none/);assert.match(block,/sparse-checkout-cone-mode: false/);const actual=/sparse-checkout: \|\n((?:            .*\n)*)/.exec(block)?.[1].trim().split('\n').map(x=>x.trim());assert.deepEqual(actual,profile);assert.match(block,/ref: \$\{\{|ref: 83f27e5d59db944458a85122a95d1154e3543393/);}
 }
 const weapon=read('inkwave-main-weapons.yml');assert.match(weapon,/ref: 83f27e5d59db944458a85122a95d1154e3543393[\s\S]*path: work\/roller-grip-baseline/);assert.match(weapon,/git fetch --no-tags --depth=1 origin "\$DIFF_BASE"/);
});
function matches(pattern,file){let out='^';for(let i=0;i<pattern.length;i++){const c=pattern[i];if(c==='*'){if(pattern[i+1]==='*'){out+='.*';i++;}else out+='[^/]*';}else if(c==='?')out+='[^/]';else out+=c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}return new RegExp(out+'$').test(file);}
function paths(source,event){const section=event==='push'?source.slice(source.indexOf('  push:'),source.indexOf('  pull_request:')):source.slice(source.indexOf('  pull_request:'),source.indexOf('  workflow_dispatch:'));return [...section.matchAll(/^      - '([^']+)'$/gm)].map(m=>m[1]);}
test('both main-weapon event filters cover every executed test entrypoint, including negative missing-route controls',()=>{
 const source=read('inkwave-main-weapons.yml');const entries=[...new Set(source.match(/(?:patches|scripts|server|tests)\/[\w./-]+\.test\.mjs/g)||[])];assert(entries.length>=40);
 const covered=patterns=>entries.every(file=>patterns.some(p=>matches(p,file)));
 for(const event of['push','pull_request']){const patterns=paths(source,event);assert(covered(patterns));for(const missing of['issue-771-roller-speed-swerve','reverse-shot-release','source-posture','roller-flick-movement','roller','bomb-kit-fidelity','air-attack-acceleration','dynamo-handle-center','brella-physics','stringer-source-1130','stringer-tilt-motion']){const exact='patches/splatoon3/tests/'+missing+'.test.mjs';assert.equal(covered(patterns.filter(p=>p!==exact)),false,'missing route '+exact);}}
});
const sparseFixtureFile='scripts/tests/inkwave-ci-sparse-checkout.test.mjs';
const excludedFixturePaths=['tools/inkwave-modeler/blender/large.blend','tools/inkwave-modeler/src/editor.js'];
function assertNoAuthoringDependency(file,source){
 let checked=source;
 if(file===sparseFixtureFile){
  // Only the reviewed literal data in this temporary-repository fixture is
  // exempt. Imports, filesystem references and the rest of its code are scanned.
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
  const bindings=ast.body.filter(n=>n.type==='VariableDeclaration'&&n.kind==='const').flatMap(n=>n.declarations);
  const declarations=bindings.filter(n=>n.id.type==='Identifier'&&n.id.name==='excludedAuthoringFixturePaths');
  assert.equal(declarations.length,1,'one explicit synthetic fixture declaration');
  const declaration=declarations[0],data=declaration.init;
  assert.equal(data?.type,'ArrayExpression','fixture paths are data, never executable expressions');
  assert.deepEqual(data.elements.map(n=>n?.type==='Literal'?n.value:null),excludedFixturePaths);
  const examples=bindings.find(n=>n.id.type==='Identifier'&&n.id.name==='examples')?.init;
  const visit=(node,parent,grandparent)=>{
   if(!node||typeof node!=='object')return;
   if(node.type==='Identifier'&&node.name==='excludedAuthoringFixturePaths'&&node!==declaration.id){
    const list=parent?.type==='SpreadElement'&&grandparent===examples&&examples?.type==='ArrayExpression';
    const membership=parent?.type==='MemberExpression'&&parent.object===node&&!parent.computed&&parent.property.name==='includes'
     &&grandparent?.type==='CallExpression'&&grandparent.callee===parent;
    assert(list||membership,'synthetic paths cannot become an import or filesystem dependency');
   }
   for(const value of Object.values(node))if(Array.isArray(value)){for(const child of value)visit(child,node,parent);}else if(value&&typeof value==='object')visit(value,node,parent);
  };
  visit(ast);
  checked=source.slice(0,data.start)+'[]'+source.slice(data.end);
 }
 assert.doesNotMatch(checked,/tools\/inkwave-modeler\//,'excluded authoring dependency in '+file);
}
test('the excluded authoring workbench is not referenced by runtime/test/build input code',()=>{
 const files=execFileSync('git',['ls-files','-z','inkwave-public','patches','scripts','server','tests'],{cwd:root,encoding:'utf8'}).split('\0').filter(f=>/\.(?:mjs|js|py)$/.test(f)&&f!=='scripts/tests/inkwave-added-ci-contracts.test.mjs');
 for(const file of files)assertNoAuthoringDependency(file,fs.readFileSync(new URL(file,root),'utf8'));
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
 ])assert.throws(()=>assertNoAuthoringDependency(sparseFixtureFile,source+'\n'+extra));
 assert.throws(()=>assertNoAuthoringDependency('inkwave-public/src/main.js',source),'fixture data is not a general source exemption');
 assert.throws(()=>assertNoAuthoringDependency(sparseFixtureFile,source.replace("['tools/inkwave-modeler/blender/large.blend'","[fs.readFileSync('tools/inkwave-modeler/blender/large.blend')")),'fixture initializer cannot execute a read');
});
