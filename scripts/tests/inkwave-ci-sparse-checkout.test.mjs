import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
const read=file=>fs.readFileSync(new URL('../../'+file,import.meta.url),'utf8');
const command=(cwd,args,options={})=>execFileSync('git',args,{cwd,stdio:['pipe','pipe','pipe'],...options});
// Synthetic names created only inside the temporary Git fixture below.
// The dependency guard validates this exact data declaration, not a file exemption.
const excludedAuthoringFixturePaths=['tools/inkwave-modeler/blender/large.blend','tools/inkwave-modeler/docs/reference.png','tools/inkwave-modeler/src/editor.js'];
const examples=[...excludedAuthoringFixturePaths,'tools/native-recovery-qa/workflow.test.mjs','tools/audio/collect-public-reference-recordings.py','.github/workflows/inkwave-audio-reference-fetch.yml','scripts/build-inkwave.mjs','patches/local-quality/adapter.mjs','inkwave-public/src/main.js','inkwave-public/assets/source-motion/Player00.f32.gz','reports/source/evidence.json'];
for(const workflow of ['validate-inkwave-ranked.yml','inkwave-runtime-frame-parity.yml','inkwave-audio-reference-fetch.yml','inkwave-paint-hotpath.yml','inkwave-touch-frame-pacing.yml','inkwave-composed-cpu.yml','inkwave-small-tank.yml','inkwave-object-presentation-qa.yml'])test(workflow+' materializes exactly its intended sparse inputs',()=>{
 const source=read('.github/workflows/'+workflow);assert.match(source,/sparse-checkout-cone-mode: false/);if(workflow==='inkwave-object-presentation-qa.yml')assert.match(source,/filter: blob:none/);else assert.doesNotMatch(source,/\n\s+filter:/);
 const patterns=source.match(/          sparse-checkout: \|\n((?:            [^\n]+\n)+)/)?.[1].trim().split('\n').map(s=>s.trim());assert(patterns?.length);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-sparse-'));try{
  command(root,['init','-b','fixture']);for(const file of examples){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),file);}
  command(root,['add','.']);command(root,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture']);command(root,['sparse-checkout','set','--no-cone','--stdin'],{input:patterns.join('\n')+'\n'});
  const materialized=examples.filter(file=>fs.existsSync(path.join(root,file)));
  assert.deepEqual(materialized,workflow==='inkwave-audio-reference-fetch.yml'?examples.filter(file=>file==='tools/audio/collect-public-reference-recordings.py'||file==='.github/workflows/inkwave-audio-reference-fetch.yml'):examples.filter(file=>!excludedAuthoringFixturePaths.includes(file)||(['inkwave-paint-hotpath.yml','inkwave-touch-frame-pacing.yml','inkwave-composed-cpu.yml','inkwave-small-tank.yml'].includes(workflow)&&file.endsWith('/src/editor.js'))));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('test jobs keep original entries and only the pinned build dependency where required',()=>{
 for(const [workflow,tests]of [['inkwave-touch-frame-pacing.yml',['range-frame-pacing.test.mjs','range-hitch-tracer.test.mjs','quality.test.mjs','cargo-offline-precache.test.mjs']],['inkwave-roller-support-source-pin.yml',['issue-847-roller-drum-support.test.mjs']]]){
  const source=read('.github/workflows/'+workflow);if(workflow==='inkwave-touch-frame-pacing.yml'){assert.equal((source.match(/npm install/g)||[]).length,1);assert.match(source,/npm install --no-save --no-package-lock --silent esbuild@0\.28\.2/);assert.doesNotMatch(source,/playwright|npx /);}else assert.doesNotMatch(source,/npm install|npx /);assert.match(source,/node-version: 22/);assert.match(source,/node --experimental-vm-modules --test /);for(const entry of tests)assert(source.includes(entry));
 }
});
test('the sparse audio collector parses and imports only Python standard-library modules',()=>{
 const script=new URL('../../tools/audio/collect-public-reference-recordings.py',import.meta.url).pathname;
 execFileSync('python3',['-c',"import ast,pathlib,sys; tree=ast.parse(pathlib.Path(sys.argv[1]).read_text()); names={a.name.split('.')[0] for n in ast.walk(tree) if isinstance(n,ast.Import) for a in n.names}|{n.module.split('.')[0] for n in ast.walk(tree) if isinstance(n,ast.ImportFrom)}; assert names <= sys.stdlib_module_names, names-sys.stdlib_module_names",script]);
});

// The metadata guard deliberately audits every tracked JavaScript module, not
// only its current literal callers. Sparse consumers must materialize that same
// inventory, including future code outside the runtime's normal directories.
for(const [workflow,job]of [['ci-quality-gate.yml','verify-aplus-suite'],['validate-inkwave-update.yml','build_site'],['validate-inkwave-update.yml','validate_core']])test(workflow+' '+job+' retains the complete global JavaScript audit inventory',()=>{
 const source=read('.github/workflows/'+workflow);
 const block=source.match(new RegExp('^  '+job+':\\n(?:(?!^  [A-Za-z0-9_-]+:)[^\\n]*\\n)*','m'))?.[0];
 assert.ok(block,'global metadata guard owner '+job);
 const patterns=block.match(/          sparse-checkout: \|\n((?:            [^\n]+\n)+)/)?.[1].trim().split('\n').map(line=>line.trim());
 assert.ok(patterns?.length,'explicit non-cone checkout patterns');
 const repository=new URL('../../',import.meta.url).pathname;
 const inventory=command(repository,['ls-files','-z'],{encoding:'utf8',maxBuffer:8*1024*1024}).split('\0').filter(file=>/\.(?:js|mjs|cjs)$/.test(file));
 const auditExamples=['unrelated-audit/source.js','unrelated-audit/source.mjs','unrelated-audit/source.cjs'];
 const expected=[...new Set([...inventory,...auditExamples])];
 const binaries=['tools/inkwave-modeler/blender/large.blend','tools/inkwave-modeler/docs/reference.png'];
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-global-audit-sparse-'));
 try{
  command(root,['init','-b','fixture']);
  for(const file of [...expected,...binaries]){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),'// fixture\n');}
  command(root,['add','.']);command(root,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','complete audit inventory']);
  const configure=rules=>command(root,['sparse-checkout','set','--no-cone','--stdin'],{input:rules.join('\n')+'\n'});
  configure(patterns.filter(rule=>!['*.js','*.mjs','*.cjs'].includes(rule)));
  assert.ok(expected.some(file=>!fs.existsSync(path.join(root,file))),'old sparse selection omits code required by the global audit');
  configure(patterns);
  assert.deepEqual(expected.filter(file=>!fs.existsSync(path.join(root,file))),[],'every tracked JavaScript input is available to the unchanged AST audit');
  for(const file of binaries)assert.equal(fs.existsSync(path.join(root,file)),false,'large authoring inputs remain excluded: '+file);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
