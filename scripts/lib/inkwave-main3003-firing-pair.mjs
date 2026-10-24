// Additional exact pair only. Historical source fixtures remain untouched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

export const MAIN3003_BASE='3003088e7d3da6e3b41829a96714698a348b555b';
export const MAIN3003_HEAD='fc4e107cc39109522d3eec8eb5cc5bebff2c6724';
export const MAIN3003_MODE='oct23-main3003-firing-source-build-pair';
export const MAIN3003_FIXTURE_SHA256='80824cf99125fdf58a98394e2913764cf18ae1f40bb81f11f83647ab87367f51';
export const MAIN3003_QA_PATHS=Object.freeze([
  '.github/workflows/inkwave-projectile-visuals.yml',
  'scripts/check-inkwave-projectile-visuals.mjs',
  'scripts/fixtures/inkwave-main3003-firing-pair.json.gz',
  'scripts/lib/inkwave-main3003-firing-pair.mjs',
  'scripts/lib/inkwave-projectile-current-pair.mjs',
  'scripts/tests/inkwave-main3003-firing-pair.test.mjs',
  'scripts/verify-inkwave-projectile-current-pair.mjs',
]);
const hash=x=>createHash('sha256').update(x).digest('hex');
const packed=fs.readFileSync(new URL('../fixtures/inkwave-main3003-firing-pair.json.gz',import.meta.url));
assert.equal(hash(packed),MAIN3003_FIXTURE_SHA256,'main3003 complete pair fixture pin');
const fixture=JSON.parse(gunzipSync(packed));
const freeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
freeze(fixture);
assert.equal(fixture.schema,1);assert.equal(fixture.repository,'rhgrive3/actions');
assert.equal(fixture.pr,1857);assert.equal(fixture.branch,'fix/shooter-splatling-cosmetics-20261023');
assert.equal(fixture.baseCommit,MAIN3003_BASE);assert.equal(fixture.sourceHead,MAIN3003_HEAD);
assert.deepEqual(Object.keys(fixture.epochs),[MAIN3003_BASE,MAIN3003_HEAD]);
export const main3003Fixture=()=>structuredClone(fixture);
export const main3003Epoch=epoch=>fixture.epochs[epoch];
export function main3003Route(pr,base){
  return pr===fixture.pr&&base===MAIN3003_BASE?{exactMain3003:true,mode:MAIN3003_MODE,
    sourceHead:MAIN3003_HEAD,fixtureSha256:MAIN3003_FIXTURE_SHA256,deltas:{[MAIN3003_BASE]:structuredClone(fixture.deltas)}}:null;
}

// These immutable builds use canonical in-repository inputs. Optional external
// account/native bundles and compiler overrides are not silently enrolled.
export function assertMain3003Environment(env){
  for(const key of ['INKWAVE_ACCOUNT_BUILD','INKWAVE_NATIVE_STAGE_ASSETS','ESBUILD_MODULE'])
    assert.ok(!env[key],'canonical main3003 pair excludes external '+key);
  for(const key of ['INKWAVE_BUILD_UNMINIFIED','INKWAVE_NO_THREE_SHAKE'])
    assert.notEqual(env[key],'1','canonical main3003 build required: '+key);
}

// A source epoch and its reviewed QA-only direct successor are separate labels.
// Future descendants, unrelated copied trees and additional changed paths fail.
export function assertMain3003Head(declared,git){
  if(declared===MAIN3003_HEAD)return;
  assert.deepEqual(git(['show','-s','--format=%P',declared]).trim().split(' '),[MAIN3003_HEAD],
    'main3003 head must be fc4 or its one reviewed QA-only successor');
  assert.deepEqual(git(['diff','--no-renames','--name-only',MAIN3003_HEAD,declared]).trim().split('\n').sort(),
    [...MAIN3003_QA_PATHS],'exact main3003 QA successor paths');
}

export function assertMain3003Inputs(rows,epoch){
  const expected=fixture.epochs[epoch];assert.ok(expected,'exact main3003 source epoch');
  const byPath=new Map(rows.map(r=>[r.path,r]));
  const prefixes={upstream:'inkwave-public',patch:'patches/splatoon3','build-script':'scripts'};
  for(const root of fixture.roots.filter(r=>r.startsWith('patches/')))prefixes[root.slice(8)]=root;
  for(const [key,sha256]of Object.entries(expected.build.files)){
    const [prefix,...parts]=key.split('/');assert.ok(prefixes[prefix]&&parts.length,'known build input namespace');
    const relative=prefixes[prefix]+'/'+parts.join('/');
    assert.equal(path.posix.normalize(relative),relative,'safe builder input path');
    assert.equal(byPath.get(relative)?.sha256,sha256,relative+': actual complete builder input');
  }
  assert.equal(hash(JSON.stringify(expected.build.files)),expected.build.inputHash,'pinned complete input identity');
  return {inputHash:expected.build.inputHash,inputCount:Object.keys(expected.build.files).length};
}

export function assertMain3003Artifacts(site,epoch){
  const expected=fixture.epochs[epoch]?.build;assert.ok(expected,'exact source/build label');
  const root=path.resolve(site);let prefix=path.parse(root).root;
  for(const part of root.slice(prefix.length).split('/')){
    prefix=path.join(prefix,part);assert.ok(!fs.lstatSync(prefix).isSymbolicLink(),'artifact parent symlinks rejected');
  }
  const manifestFile=path.join(root,'inkwave-build.json');
  assert.ok(fs.lstatSync(manifestFile).isFile()&&!fs.lstatSync(manifestFile).isSymbolicLink(),'regular build manifest');
  const bytes=fs.readFileSync(manifestFile);assert.equal(hash(bytes),expected.manifestSha256,'exact source-labeled build manifest');
  const manifest=JSON.parse(bytes);
  assert.deepEqual(manifest.files,expected.files,'complete actual input map');
  assert.deepEqual(manifest.artifacts,expected.artifacts,'complete actual artifact map');
  assert.equal(hash(JSON.stringify(manifest.files)),manifest.inputHash);assert.equal(manifest.inputHash,expected.inputHash);
  assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);assert.equal(manifest.contentHash,expected.contentHash);
  const wanted={...expected.artifacts,'inkwave-build.json':expected.manifestSha256},executables=new Set(expected.executables),seen=[];
  const visit=relative=>{
    const file=path.join(root,relative),stat=fs.lstatSync(file);
    assert.ok(!stat.isSymbolicLink(),relative+': artifact symlinks rejected');
    if(stat.isDirectory()){
      assert.ok(!relative||Object.keys(wanted).some(p=>p.startsWith(relative+'/')),relative+': extra artifact directory');
      for(const name of fs.readdirSync(file).sort())visit(relative?relative+'/'+name:name);
    }else{
      assert.ok(stat.isFile()&&Object.hasOwn(wanted,relative),relative+': unknown artifact');
      assert.equal(stat.mode&0o111?'100755':'100644',executables.has(relative)?'100755':'100644',relative+': artifact mode');
      assert.equal(hash(fs.readFileSync(file)),wanted[relative],relative+': actual artifact bytes');seen.push(relative);
    }
  };
  visit('');assert.deepEqual(seen.sort(),Object.keys(wanted).sort(),'missing/extra output closure');
  return {sourceEpoch:epoch,inputHash:expected.inputHash,contentHash:expected.contentHash,
    manifestSha256:expected.manifestSha256,inputCount:Object.keys(expected.files).length,
    artifactCount:Object.keys(expected.artifacts).length,physicalFiles:seen.length};
}
