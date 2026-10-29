import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {parseValidateWorkflow} from '../ci/inkwave-validate-contract.mjs';
const root=new URL('../../',import.meta.url),text=fs.readFileSync(new URL('.github/workflows/inkwave-headgear-visual-qa.yml',root),'utf8');
function contract(source){
 const jobs=parseValidateWorkflow(source).jobs,build=jobs['build-headgear'],render=jobs['render-headgear'],combine=jobs['verify-combined'];assert(build&&render&&combine);
 assert.equal(render.needs,'build-headgear');assert.equal(combine.needs,'render-headgear');assert.equal(combine.if,'always()');assert.equal(render.if,undefined);
 const commands=job=>job.steps.map(s=>s.run||'').join('\n');
 assert.equal((source.match(/node scripts\/build-inkwave.mjs inkwave-public _site/g)||[]).length,1);
 for(const token of ['node --test patches/local-quality/tests/headgear-source.test.mjs','--test patches/local-quality/tests/headgear-*.fixture.mjs']){assert(commands(build).includes(token));assert(!commands(render).includes(token));}
 assert.equal(render.strategy['fail-fast'],false);assert.deepEqual(render.strategy.matrix.include.map(r=>r.key),['multi-4-5','multi-6-7','multi-8-9','multi-10-11','production-ibl','production']);
 const upload=build.steps.find(s=>s.uses==='actions/upload-artifact@v4'),download=render.steps.find(s=>s.uses==='actions/download-artifact@v4');assert.equal(upload.with.name,download.with.name);assert(upload.with.name.includes('env.SOURCE_SHA'));assert(upload.with.name.includes('github.run_attempt'));assert.equal(upload.with['if-no-files-found'],'error');assert.equal(upload.with['compression-level'],0);
 const restore=render.steps.find(s=>s.name==='Verify and restore the exact prepared candidate');assert.equal(restore.env.EXPECTED_ARCHIVE_SHA256,'${{ needs.build-headgear.outputs.archive_sha256 }}');assert(restore.run.includes('sha256sum --check --strict'));assert(restore.run.includes('test "$(cat _site-source-sha.txt)" = "$SOURCE_SHA"'));assert.equal(build.outputs.archive_sha256,'${{ steps.archive.outputs.sha256 }}');
 assert(render.steps.indexOf(restore)<render.steps.findIndex(s=>s.name==='Render bounded multiview shard'));
 const checkout=render.steps.find(s=>s.uses==='actions/checkout@v4');assert.equal(checkout.with.ref,'${{ github.event.pull_request.head.sha || github.sha }}');for(const name of ['qa','multiview','ibl'])assert(checkout.with['sparse-checkout'].includes('/tools/headgear-production-'+name+'/'));assert(!checkout.with['sparse-checkout'].includes('/*'));
 assert.equal(combine.steps.find(s=>s.uses==='actions/checkout@v4').with['sparse-checkout'].trim(),'/tools/headgear-production-qa/verify-shards.mjs');
 for(const n of ['qa','multiview','ibl']){const runner=fs.readFileSync(new URL('tools/headgear-production-'+n+'/run.mjs',root),'utf8');assert(runner.includes('manifest.artifacts'));assert(runner.includes('exact candidate checkout'));assert(runner.includes('served receipt'));}
 return restore.run;
}
test('one prepared SHA feeds all six unchanged Headgear render denominators and exact-byte gates',()=>contract(text));
test('shared artifact contract rejects missing dependencies, wrong archive owner and missing digest verification',()=>{
 for(const [a,b] of [['    needs: build-headgear\n',''],['${{ needs.build-headgear.outputs.archive_sha256 }}','${{ github.sha }}'],['sha256sum --check --strict','true'],['headgear-site-${{ env.SOURCE_SHA }}-${{ github.run_attempt }}','wrong-site'],['    needs: render-headgear\n',''],["          - key: multi-4-5\n","          - key: missing\n"]]){assert(text.includes(a));assert.throws(()=>contract(text.replace(a,b)));}
});
test('actual restore shell rejects byte tampering and a different checkout SHA before any render',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'iw-headgear-artifact-')),source='a'.repeat(40),restore=contract(text);
 const run=(cmd,args,options={})=>spawnSync(cmd,args,{cwd:directory,encoding:'utf8',timeout:20000,...options});
 const build=receipt=>{fs.rmSync(path.join(directory,'_site'),{recursive:true,force:true});fs.mkdirSync(path.join(directory,'_site'));fs.writeFileSync(path.join(directory,'_site/module.mjs'),'export const exact=true;\n');fs.writeFileSync(path.join(directory,'_site-source-sha.txt'),receipt+'\n');fs.mkdirSync(path.join(directory,'.headgear-site'),{recursive:true});const tar=run('tar',['-cf','.headgear-site/headgear-site.tar','_site','_site-source-sha.txt']);assert.equal(tar.status,0,tar.stderr);return createHash('sha256').update(fs.readFileSync(path.join(directory,'.headgear-site/headgear-site.tar'))).digest('hex');};
 const execute=digest=>run('bash',['-e','-o','pipefail','-c',restore],{env:{...process.env,SOURCE_SHA:source,EXPECTED_ARCHIVE_SHA256:digest}});
 try{
  const digest=build(source);assert.equal(execute(digest).status,0);assert.notEqual(execute('bad').status,0);assert.notEqual(execute('0'.repeat(64)).status,0);
  fs.appendFileSync(path.join(directory,'.headgear-site/headgear-site.tar'),'tampered');assert.notEqual(execute(digest).status,0);
  const other=build('b'.repeat(40));assert.notEqual(execute(other).status,0);
  fs.rmSync(path.join(directory,'.headgear-site/headgear-site.tar'));assert.notEqual(execute(other).status,0);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
