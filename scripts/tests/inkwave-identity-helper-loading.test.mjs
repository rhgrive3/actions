import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
const repo=fileURLToPath(new URL('../../',import.meta.url));
const checker=fs.readFileSync(new URL('../check-inkwave-browser.mjs',import.meta.url),'utf8');
const deferred="const { runMinimapCanvasProbe } = await import('./lib/minimap-canvas-probe.mjs');";
assert.equal(checker.split(deferred).length,2,'One deferred minimap helper');
const early=checker.replace(deferred,'').replace('#!/usr/bin/env node\n',"#!/usr/bin/env node\nimport { runMinimapCanvasProbe } from './lib/minimap-canvas-probe.mjs';\n");
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const scratch=path.join(repo,'.dev-state','agent-work','identity-helper-regression');fs.mkdirSync(scratch,{recursive:true});
const root=fs.mkdtempSync(path.join(scratch,'fixture-'));
const write=(name,bytes)=>{const p=path.join(root,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes);};
// Only import-time dependencies are inert. The exact production checker and
// real Git identity comparison run in a child; no browser helper is installed.
write('package.json','{"type":"module"}');
write('patches/local-quality/quality-probe.mjs','export const runQualityBrowserProbe=()=>{throw Error("Unexpected probe")};');
write('patches/local-quality/paint-mipmap-probe.mjs','export const runPaintMipmapBrowserProbe=()=>{throw Error("Unexpected probe")};');
write('scripts/check-inkwave-hud-authority.mjs','export const checkHudAuthority=()=>{},checkUiVisualProbes=()=>{};');
write('scripts/build-inkwave.mjs','// fixed build\n');
const rows=[['touch-layout/mobile.js','patches/touch-layout/mobile.js'],['network-replication/adapter.mjs','patches/network-replication/adapter.mjs'],['reliability/input-adapter.mjs','patches/reliability/input-adapter.mjs']];
for(const [,file]of rows)write(file,'// clean overlay\n');
execFileSync('git',['init','-q'],{cwd:root});execFileSync('git',['add','.'],{cwd:root});execFileSync('git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Identity fixture'],{cwd:root});
function run(source,key,file,dirty,label){
 write(file,dirty?'// dirty overlay\n':'// clean overlay\n');
 write('site/inkwave-build.json',JSON.stringify({artifacts:{},contentHash:hash('{}'),files:{[key]:hash(fs.readFileSync(path.join(root,file)))},build:{script:hash('// fixed build\n')}}));
 write('scripts/check-inkwave-browser.mjs',source);
 const r=spawnSync(process.execPath,[path.join(root,'scripts/check-inkwave-browser.mjs'),'--site',path.join(root,'site'),'--evidence-dir',path.join(root,'evidence-'+label),'--profile-dir',path.join(root,'profile-'+label),'--exact-source'],{encoding:'utf8',timeout:10000});
 fs.writeFileSync(path.join(root,label+'-stderr.log'),r.stderr||'');
 assert.equal(r.error,undefined,'Child did not timeout');assert.equal(r.signal,null);assert.equal(r.status,1);
 return r.stderr;
}
for(const [i,[key,file]]of rows.entries())test('dirty '+key+' rejects by commit identity before browser helper loading',()=>{
 const bad=run(early,key,file,true,'early-'+i);assert.match(bad,/ERR_MODULE_NOT_FOUND/);assert.match(bad,/minimap-canvas-probe/);assert.ok(!bad.includes('Build input differs from commit: '+file));
 const good=run(checker,key,file,true,'deferred-'+i);assert.ok(good.includes('Build input differs from commit: '+file));assert.doesNotMatch(good,/ERR_MODULE_NOT_FOUND/);write(file,'// clean overlay\n');
});
test('clean identity still attempts the mandatory minimap helper',()=>{
 const [key,file]=rows[0],s=run(checker,key,file,false,'clean');assert.match(s,/ERR_MODULE_NOT_FOUND/);assert.match(s,/minimap-canvas-probe/);assert.doesNotMatch(s,/Build input differs/);
});
