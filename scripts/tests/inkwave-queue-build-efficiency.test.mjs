import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {compactInstalledAudioManifest} from '../lib/inkwave-audio-manifest.mjs';
import {validateAuthorizedManifest} from '../../patches/splatoon3/runtime/audio/authorized-samples.mjs';
import {requiresGameQuality,qualityScope} from '../inkwave-quality-scope.mjs';
import {checkJavaScriptSyntax} from '../inkwave-syntax-batch.mjs';
import {createArtifactDigests} from '../lib/inkwave-artifact-digests.mjs';

const scratch=new URL('../../.ci-scratch/',import.meta.url);
fs.mkdirSync(scratch,{recursive:true});
function temp(){return fs.mkdtempSync(path.join(scratch.pathname,'queue-build-'));}
test('required quality check skips only positively identified unrelated changes',()=>{
  for(const files of [['README.md'],['lanes/a.json'],['.github/workflows/hex-a.yml'],['docs/a.md']]) assert.equal(requiresGameQuality(files),false);
  for(const files of [[],['scripts/run-logged-test-process.mjs'],['package.json'],['server/src/a.js'],['inkwave-public/src/a.js'],['.github/workflows/ci-quality-gate.yml'],['README.md','patches/a.mjs'],['unknown.json']]) assert.equal(requiresGameQuality(files),true);
  const sha='a'.repeat(40),head='b'.repeat(40);
  assert.equal(qualityScope(null,head).relevant,true);
  assert.equal(qualityScope(sha,head,()=>{throw Error('missing history');}).relevant,true);
  assert.equal(qualityScope(sha,head,()=> 'README.md\0').relevant,false);
});
test('batch parser agrees with Node check on valid and invalid module fixtures',()=>{
  const dir=temp();
  try {
    fs.writeFileSync(path.join(dir,'package.json'),'{"type":"module"}');
    const fixtures=['export const value=1;','await Promise.resolve();','#!/usr/bin/env node\nexport {};','import {x} from "./missing.mjs";','const = 1;','export {;','return 3;',''];
    for(let i=0;i<fixtures.length;i++) {
      const sub=path.join(dir,'case'+i);fs.mkdirSync(sub);
      const file=path.join(sub,i%2?'space é.js':'fixture.mjs');fs.writeFileSync(file,fixtures[i]);
      const result=checkJavaScriptSyntax([sub]);
      assert.equal(result.files,1);
      assert.equal(result.errors.length===0,spawnSync(process.execPath,['--check',file]).status===0,file);
    }
    assert.throws(()=>checkJavaScriptSyntax([path.join(dir,'missing')]),/ENOENT/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('artifact digest snapshot keeps independent authorities and detects mutation',()=>{
  const dir=temp();
  try {
    fs.writeFileSync(path.join(dir,'a.bin'),Buffer.alloc(1024*1024,7));
    const digest=createArtifactDigests(dir),a=digest('a.bin');
    assert.equal(a.sha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'a.bin'))).digest('hex'));
    assert.equal(a.bytes,1024*1024);assert.equal(digest('./a.bin'),a);
    assert.throws(()=>assert.equal(a.sha256,'0'.repeat(64)));
    assert.throws(()=>digest('../outside'),/escapes/);
    fs.writeFileSync(path.join(dir,'a.bin'),Buffer.alloc(1024*1024,8));
    assert.throws(()=>digest('a.bin'),/changed/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('installed audio projection retains every ordered runtime declaration and provenance',()=>{
 const source=fs.readFileSync(new URL('../../patches/splatoon3/runtime/audio/real-s3-installed.json',import.meta.url),'utf8');
 const before=JSON.parse(source),output=compactInstalledAudioManifest(source),after=JSON.parse(output);
 const keys=['id','event','variant','file','gain','sha256','loopStart','loopEnd','seamlessLoop'];
 assert.equal(after.clips.length,before.clips.length);
 assert.deepEqual(validateAuthorizedManifest(after).map(c=>keys.map(k=>c[k])),validateAuthorizedManifest(before).map(c=>keys.map(k=>c[k])));
 assert.equal(after.provenance.sourceManifestSha256,crypto.createHash('sha256').update(source).digest('hex'));
 assert(output.length<source.length/2,'drop audit-only repeated metadata and indentation');
 assert.throws(()=>compactInstalledAudioManifest(JSON.stringify({...before,clips:[{...before.clips[0],sha256:'invalid'}]})),/SHA/);
});

test('the normal production copy pass skips only the privately bundled Three core before composition', () => {
  const script = fs.readFileSync(new URL('../build-inkwave.mjs', import.meta.url), 'utf8');
  const start = script.indexOf('    const replacedThree = '), end = script.indexOf('\n    // Its asset inventory', start);
  assert(start >= 0 && end > start);
  const body = script.slice(start, end);
  const run = new Function('unminified', 'process', 'moduleExists', 'path', 'files', `
    const SRC = '/source', fs = { existsSync() { return moduleExists; }, readFileSync(file) { return file; } }, visited = [];
    const composeSource = (rel, text) => { visited.push([rel, text]); return text; };
    for (const rel of files) { const file = path.join(SRC, rel); ${body} }
    return visited.map(row => row[0]);`);
  const files = ['vendor/three/build/three.core.js', 'vendor/three/build/three.module.js', 'src/main.js'];
  assert.deepEqual(run(false, { env: {} }, true, path, files), files.slice(1));
  assert.deepEqual(run(true, { env: {} }, true, path, files), files);
  assert.deepEqual(run(false, { env: { INKWAVE_NO_THREE_SHAKE: '1' } }, true, path, files), files);
  assert.deepEqual(run(false, { env: {} }, false, path, files), files);
});
