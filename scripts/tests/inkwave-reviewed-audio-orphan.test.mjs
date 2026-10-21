import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { writeBuildIdentity, sha256 } from '../../patches/splatoon3/adapter.mjs';
import { createHash } from 'node:crypto';
import { adaptBuildSource } from '../inkwave-source-composition.mjs';
import { REVIEWED_AUDIO_ORPHAN, reviewedAudioOrphanDecision } from '../lib/inkwave-reviewed-audio-orphan.mjs';
const source = fs.readFileSync(new URL('../../' + REVIEWED_AUDIO_ORPHAN, import.meta.url), 'utf8');
const owners = new Map(['src/main.js', 'src/game/character.js', 'src/audio/music.js'].map(file =>
  [file, adaptBuildSource(file, fs.readFileSync(new URL('../../inkwave-public/' + file, import.meta.url), 'utf8'))]));
const fixture = () => new Map([...owners, [REVIEWED_AUDIO_ORPHAN, source],
  ...['patches/splatoon3/bootstrap.mjs', 'patches/loading-cache/runtime/startup.mjs', 'patches/loading-cache/sw.js', 'entry-script-1.mjs'].map(file => [file, ''])]);
const decide = (code, file='src/probe.js', authored=source) => reviewedAudioOrphanDecision(authored, new Map([...fixture(), [file, code]]), owners);

test('reviewed current orphan preserves authored source and omits only its deployable copy', () => {
  assert.equal(createHash('sha256').update(source).digest('hex'), '119a9fa2c5910cb9378111116fa28de945eaeed988e832065fc3ff9e9ba322cf');
  assert.equal(decide('export const x = 1;').omit, true);
  assert.equal(fs.readFileSync(new URL('../../' + REVIEWED_AUDIO_ORPHAN, import.meta.url), 'utf8'), source);
  assert.equal(decide('', 'src/probe.js', source + '\n').omit, false, 'unreviewed initialization cannot be omitted');
});

for (const [name, code] of [
  ['static import', 'import { withChargedHitAudio } from "../patches/splatoon3/runtime/audio/charge-hit-cue.mjs";'],
  ['side-effect import', 'import "../patches/splatoon3/runtime/audio/charge-hit-cue.mjs";'],
  ['re-export', 'export * from "../patches/splatoon3/runtime/audio/charge-hit-cue.mjs";'],
  ['literal dynamic import', 'import("../patches/splatoon3/runtime/audio/charge-hit-cue.mjs");'],
  ['literal lazy-loader argument', 'loadModule("../patches/splatoon3/runtime/audio/charge-hit-cue.mjs");'],
  ['URL reference', 'new Worker(new URL("../patches/splatoon3/runtime/audio/charge-hit-cue.mjs", import.meta.url));'],
  ['encoded literal', 'import("../patches/splatoon3/runtime/audio/%63harge-hit-cue.mjs?x=1");'],
]) test(name + ' prevents omission', () => assert.equal(decide(code).omit, false));

test('new opaque import and worker sites retain the module', () => {
  for (const code of ['import(nextPath);', 'new Worker(nextPath);', 'import(prefix + tail);', 'import(`./${name}.mjs`);'])
    assert.equal(decide(code).omit, false, code);
  assert.equal(decide('import(path); import(path); import(path);', 'src/main.js').omit, false, 'added site in a reviewed file is also rejected');
});

test('parse errors preserve the module instead of making incomplete graph claims', () => {
  assert.equal(decide('import(').omit, false);
});

test('build guard precedes graph/assets/revision and retains source identity inputs', () => {
  const build = fs.readFileSync(new URL('../build-inkwave.mjs', import.meta.url), 'utf8');
  assert.ok(build.indexOf('const decision = reviewedAudioOrphanDecision(') < build.indexOf('const loadingPlan = prepareLoading('));
  assert.match(build, /if \(decision\.omit\) fs\.unlinkSync\(audioOrphan\)/);
  assert.match(build, /path\.join\(projectRoot, REVIEWED_AUDIO_ORPHAN\)/);
  assert.match(build, /'lib\/inkwave-reviewed-audio-orphan\.mjs'/);
  assert.match(build, /identity\.files\['build-script\/' \+ file\] = sha256/);
  assert.match(build, /identity\.inputHash = sha256\(JSON\.stringify\(identity\.files\)\)/);
  assert.match(build, /walk\(path\.join\(LOADING_ROOT, 'runtime'\)\)/);
  assert.match(build, /entry-script-/);
  const helper = fs.readFileSync(new URL('../lib/inkwave-reviewed-audio-orphan.mjs', import.meta.url));
  const first = createHash('sha256').update(helper).digest('hex');
  const second = createHash('sha256').update(Buffer.concat([helper, Buffer.from('\n')])).digest('hex');
  const identity = h => createHash('sha256').update(JSON.stringify({['build-script/lib/inkwave-reviewed-audio-orphan.mjs']:h})).digest('hex');
  assert.notEqual(identity(first), identity(second), 'one-byte guard change changes the same input-hash expression');
});

test('same-shaped dynamic binding changes retain a newly required module', () => {
  for (const [file, before, after] of [
    ['src/main.js', 'try { return await import(path); }', "try { const next = './' + 'charge-' + 'hit-cue.mjs'; return await import(next); }"],
    ['src/main.js', "loadModule('./ui/menus.js'", "loadModule('./' + 'charge-' + 'hit-cue.mjs'"],
    ['src/game/character.js', "'./motion/' + 'source-controller.js'", "'./' + 'charge-' + 'hit-cue.mjs'"],
    ['src/audio/music.js', "new Blob([src], { type: 'text/javascript' })", "new Blob([src + 'import(\"./charge-\"+\"hit-cue.mjs\")'], { type: 'text/javascript' })"],
  ]) {
    assert.ok(owners.get(file).includes(before), file + ' actual reviewed binding');
    const changed = new Map(owners); changed.set(file, owners.get(file).replace(before, after));
    assert.equal(reviewedAudioOrphanDecision(source, new Map([...fixture(), ...changed]), changed).omit, false, file);
  }
});
test('unrelated code and positions do not invalidate the reviewed loader closure', () => {
  const changed = new Map([...owners].map(([file, code]) => [file, '// unrelated comment\n' + code + '\nexport const unrelatedQAValue = 42;']));
  assert.equal(reviewedAudioOrphanDecision(source, new Map([...fixture(), ...changed]), changed).omit, true);
});
test('missing graph roots, reviewed owners and dynamic sites retain the helper', () => {
  for (const file of fixture().keys()) { const modules = fixture(); modules.delete(file); assert.equal(reviewedAudioOrphanDecision(source, modules, owners).omit, false, file); }
  assert.equal(reviewedAudioOrphanDecision(source, new Map(), owners).omit, false);
  assert.equal(reviewedAudioOrphanDecision(source, fixture(), new Map()).omit, false);
  assert.equal(reviewedAudioOrphanDecision(source, new Map([...fixture(), ['src/main.js', 'export const x=1;']]), owners).omit, false);
});

test('computed URL bases are not exempted from opaque-site review', () => {
  assert.equal(decide("import(new URL('', 'https://example.invalid/patches/splatoon3/runtime/audio/' + 'charge-' + 'hit-cue.mjs'));").omit, false);
  assert.equal(decide("import(new URL('./known.mjs', import.meta.url).href);").omit, true);
});


test('the actual build block scans import-map targets and removes only the staged orphan', () => {
  const build = fs.readFileSync(new URL('../build-inkwave.mjs', import.meta.url), 'utf8');
  const block = build.slice(build.indexOf('const audioOrphan ='), build.indexOf('// ---- module graph from'));
  assert.ok(block.startsWith('const audioOrphan =') && block.includes('JSON.parse(match[2])'));
  const run = html => {
    const BUILD='/stage', SRC='/source', LOADING_ROOT='/loading', projectRoot='/project', deleted=[];
    const files=new Map([...fixture()].filter(([file])=>!file.startsWith('entry-script-')).map(([file,code])=>[BUILD+'/'+file,code]));
    files.set(BUILD+'/index.html',html); files.set(projectRoot+'/'+REVIEWED_AUDIO_ORPHAN,source);
    for (const [file,code] of owners) files.set(SRC+'/'+file,code);
    files.set(LOADING_ROOT+'/runtime/startup.mjs',''); files.set(LOADING_ROOT+'/sw.js','');
    let result;
    vm.runInNewContext(block, { BUILD, SRC, LOADING_ROOT, projectRoot, path, REVIEWED_AUDIO_ORPHAN,
      console:{log(){}}, adaptBuildSource:(_file,code)=>code,
      reviewedAudioOrphanDecision(...args){return result=reviewedAudioOrphanDecision(...args);},
      walk:dir=>[...files.keys()].filter(file=>file.startsWith(dir+'/')),
      fs:{existsSync:file=>files.has(file),readFileSync:file=>{assert.ok(files.has(file),file);return files.get(file);},unlinkSync:file=>deleted.push(file)},
    }); return {result,deleted};
  };
  const clean=run('<script type="module" src="./src/main.js"></script>');
  assert.equal(clean.result.omit,true); assert.deepEqual(clean.deleted,['/stage/'+REVIEWED_AUDIO_ORPHAN]);
  const alias=run('<script type="importmap">{"imports":{"cue":"./patches/splatoon3/runtime/audio/charge-hit-cue.mjs"}}</script><script type="module">import("cue")</script>');
  assert.equal(alias.result.omit,false); assert.deepEqual(alias.deleted,[]);
});

test('real identity writer retains authored input and the build helper one-byte negative', () => {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-orphan-identity-'));
  try {
    const upstream=path.join(temp,'upstream'),patch=path.join(temp,'patch'),out=path.join(temp,'out');
    for(const dir of[upstream,patch+'/runtime/audio',out])fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(upstream+'/index.html','');fs.writeFileSync(patch+'/runtime/audio/charge-hit-cue.mjs',source);
    const first=writeBuildIdentity(upstream,out,patch);
    assert.equal(first.files['patch/runtime/audio/charge-hit-cue.mjs'],sha256(source));
    fs.writeFileSync(patch+'/runtime/audio/charge-hit-cue.mjs',source+'\n');
    const changed=writeBuildIdentity(upstream,out,patch);assert.notEqual(first.inputHash,changed.inputHash);assert.equal(first.contentHash,changed.contentHash);
    const build=fs.readFileSync(new URL('../build-inkwave.mjs',import.meta.url),'utf8');
    const match=build.match(/for \(const file of \['inkwave-source-composition\.mjs'[\s\S]*?\n\}/);assert.ok(match);
    const hashLine=build.match(/identity\.inputHash = sha256\(JSON\.stringify\(identity\.files\)\);/);assert.ok(hashLine);
    const apply=mutate=>{const identity=structuredClone(first);vm.runInNewContext(match[0].replaceAll('import.meta.url','buildScriptURL')+'\n'+hashLine[0],{
      identity,sha256,URL,buildScriptURL:new URL('../build-inkwave.mjs',import.meta.url).href,
      fs:{readFileSync(file){const bytes=fs.readFileSync(file);return mutate&&String(file).endsWith('/lib/inkwave-reviewed-audio-orphan.mjs')?Buffer.concat([bytes,Buffer.from('\n')]):bytes;}},
    });return identity;};
    const baseline=apply(false),negative=apply(true);assert.ok(baseline.files['build-script/lib/inkwave-reviewed-audio-orphan.mjs']);assert.notEqual(baseline.inputHash,negative.inputHash);
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
});

test('only the three reviewed complete QA URL expressions bypass opaque-site retention', () => {
  for (const [file, target] of [['patches/local-quality/paint-mipmap-probe.mjs','src/world/paint.js'], ['patches/local-quality/paint-mipmap-probe.mjs','patches/local-quality/world-quality.mjs'], ['patches/local-quality/quality-probe.mjs','src/config.js']]) {
    assert.equal(decide(`import(new URL('${target}', document.baseURI).href);`,file).omit,true);
    assert.equal(decide(`import(new URL('${target}', document.baseURI).href);`,'src/unreviewed.js').omit,false);
    assert.equal(decide(`import(new URL('', 'https://example.invalid/' + 'charge-' + 'hit-cue.mjs').href);`,file).omit,false);
    assert.equal(decide(`import(new URL('${target}', nextBase).href);`,file).omit,false);
  }
});
