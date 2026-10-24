import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
const read=file=>fs.readFileSync(new URL('../../'+file,import.meta.url),'utf8');
const command=(cwd,args,options={})=>execFileSync('git',args,{cwd,stdio:['pipe','pipe','pipe'],...options});
// Synthetic names created only inside the temporary Git fixture below.
// The dependency guard validates this exact data declaration, not a file exemption.
const excludedAuthoringFixturePaths=['tools/inkwave-modeler/blender/large.blend','tools/inkwave-modeler/src/editor.js'];
const examples=[...excludedAuthoringFixturePaths,'tools/native-recovery-qa/workflow.test.mjs','tools/audio/collect-public-reference-recordings.py','.github/workflows/inkwave-audio-reference-fetch.yml','scripts/build-inkwave.mjs','patches/local-quality/adapter.mjs','inkwave-public/src/main.js','inkwave-public/assets/source-motion/Player00.f32.gz','reports/source/evidence.json'];
for(const workflow of ['validate-inkwave-ranked.yml','inkwave-runtime-frame-parity.yml','inkwave-audio-reference-fetch.yml'])test(workflow+' materializes exactly its intended sparse inputs',()=>{
 const source=read('.github/workflows/'+workflow);assert.match(source,/sparse-checkout-cone-mode: false/);assert.doesNotMatch(source,/\n\s+filter:/);
 const patterns=source.match(/          sparse-checkout: \|\n((?:            [^\n]+\n)+)/)?.[1].trim().split('\n').map(s=>s.trim());assert(patterns?.length);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-sparse-'));try{
  command(root,['init','-b','fixture']);for(const file of examples){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),file);}
  command(root,['add','.']);command(root,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture']);command(root,['sparse-checkout','set','--no-cone','--stdin'],{input:patterns.join('\n')+'\n'});
  const materialized=examples.filter(file=>fs.existsSync(path.join(root,file)));
  assert.deepEqual(materialized,workflow==='inkwave-audio-reference-fetch.yml'?examples.filter(file=>file==='tools/audio/collect-public-reference-recordings.py'||file==='.github/workflows/inkwave-audio-reference-fetch.yml'):examples.filter(file=>!excludedAuthoringFixturePaths.includes(file)));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('test-only jobs keep all original test entries without an npm install',()=>{
 for(const [workflow,tests]of [['inkwave-touch-frame-pacing.yml',['range-frame-pacing.test.mjs','range-hitch-tracer.test.mjs','quality.test.mjs','cargo-offline-precache.test.mjs']],['inkwave-roller-support-source-pin.yml',['issue-847-roller-drum-support.test.mjs']]]){
  const source=read('.github/workflows/'+workflow);assert.doesNotMatch(source,/npm install|npx /);assert.match(source,/node-version: 22/);assert.match(source,/node --experimental-vm-modules --test /);for(const entry of tests)assert(source.includes(entry));
 }
});
test('the sparse audio collector parses and imports only Python standard-library modules',()=>{
 const script=new URL('../../tools/audio/collect-public-reference-recordings.py',import.meta.url).pathname;
 execFileSync('python3',['-c',"import ast,pathlib,sys; tree=ast.parse(pathlib.Path(sys.argv[1]).read_text()); names={a.name.split('.')[0] for n in ast.walk(tree) if isinstance(n,ast.Import) for a in n.names}|{n.module.split('.')[0] for n in ast.walk(tree) if isinstance(n,ast.ImportFrom)}; assert names <= sys.stdlib_module_names, names-sys.stdlib_module_names",script]);
});
