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
// real Git identity comparison run in a child; the mandatory minimap helper is absent.
write('package.json','{"type":"module"}');
write('patches/local-quality/quality-probe.mjs','export const runQualityBrowserProbe=()=>{throw Error("Unexpected probe")};');
write('patches/local-quality/paint-mipmap-probe.mjs','export const runPaintMipmapBrowserProbe=()=>{throw Error("Unexpected probe")};');
write('scripts/check-inkwave-hud-authority.mjs','export const checkHudAuthority=()=>{},checkUiVisualProbes=()=>{};');
// Keep the checker's real import-time appearance helpers available. Their
// browser functions must not run before source-identity validation.
for(const [,relative] of checker.matchAll(/^import .* from '(\.\/lib\/[^']+\.mjs)';$/gm))
 write(path.join('scripts',relative),fs.readFileSync(new URL(relative,new URL('../check-inkwave-browser.mjs',import.meta.url))));
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

// Exercise the real negative-fixture assembler with the real HUD verifier,
// not the inert HUD module above. Import-time transitive dependencies must be
// copied before any dirty-source rejection can be considered evidence.
const fixtureSource=fs.readFileSync(new URL('../check-inkwave-touch-layout-identity.mjs',import.meta.url),'utf8');
const captureDependency="'scripts/lib/inkwave-frozen-hud-capture.mjs'";
assert.equal(fixtureSource.split(captureDependency).length,2,'One transitive frozen HUD fixture dependency');
const missingCapture=fixtureSource.replace(', '+captureDependency,'');
const fixtureRepo=path.join(root,'real-verifier-fixture');
const fixtureWrite=(name,bytes)=>write(path.join('real-verifier-fixture',name),bytes);
const fixtureFiles=new Set(['scripts/build-inkwave.mjs','scripts/check-inkwave-browser.mjs',
 'scripts/check-inkwave-hud-authority.mjs','scripts/lib/inkwave-frozen-hud-capture.mjs',
 'patches/local-quality/quality-probe.mjs','patches/local-quality/paint-mipmap-probe.mjs',
 ...rows.map(([,file])=>file)]);
for(const [,relative]of checker.matchAll(/^import .* from '(\.\/lib\/[^']+\.mjs)';$/gm))
 fixtureFiles.add(path.join('scripts',relative));
for(const file of fixtureFiles)fixtureWrite(file,fs.readFileSync(path.join(repo,file)));
const fixtureInputs=[...rows,['local-quality/quality-probe.mjs','patches/local-quality/quality-probe.mjs'],
 ['local-quality/paint-mipmap-probe.mjs','patches/local-quality/paint-mipmap-probe.mjs']];
const fixtureIdentity={artifacts:{},contentHash:hash('{}'),
 files:Object.fromEntries(fixtureInputs.map(([key,file])=>[key,hash(fs.readFileSync(path.join(fixtureRepo,file)))])),
 build:{script:hash(fs.readFileSync(path.join(fixtureRepo,'scripts/build-inkwave.mjs'))),touchLayout:{},network:{},reliability:{}}};
fixtureWrite('site/inkwave-build.json',JSON.stringify(fixtureIdentity));
const noBrowserEnv={...process.env,PLAYWRIGHT_MODULE:path.join(fixtureRepo,'browser-must-not-load.mjs')};
function checkFixture(source,mode,label){
 fixtureWrite('scripts/check-inkwave-touch-layout-identity.mjs',source);
 const checkout=path.join(fixtureRepo,'checkouts',label),evidence=path.join(fixtureRepo,'evidence',label);
 const args=[path.join(fixtureRepo,'scripts/check-inkwave-touch-layout-identity.mjs'),
  '--site',path.join(fixtureRepo,'site'),'--source',path.join(fixtureRepo,'inkwave-public'),
  '--checkout-dir',checkout,'--evidence-dir',evidence,...(mode?[mode]:[])];
 const result=spawnSync(process.execPath,args,{encoding:'utf8',timeout:30000,env:noBrowserEnv});
 fs.writeFileSync(path.join(root,label+'-assembler-stderr.log'),result.stderr||'');
 assert.equal(result.error,undefined,'Fixture assembler did not timeout');assert.equal(result.signal,null);
 // Preserve the actual child stderr as well: a nonzero exit alone could mask
 // ERR_MODULE_NOT_FOUND instead of exercising the unchanged Git comparison.
 const child=spawnSync(process.execPath,[path.join(checkout,'scripts/check-inkwave-browser.mjs'),
  '--site',path.join(checkout,'candidate-site'),'--evidence-dir',evidence,
  '--profile-dir',path.join(checkout,'browser-profile'),'--exact-source'],
 {encoding:'utf8',timeout:10000,env:noBrowserEnv});
 fs.writeFileSync(path.join(root,label+'-child-stderr.log'),child.stderr||'');
 assert.equal(child.error,undefined,'Browser verifier did not timeout');assert.equal(child.signal,null);assert.equal(child.status,1);
 return{result,child,evidence};
}
for(const [i,[key,file]]of rows.entries())test('real negative fixture copies HUD dependency for '+key,()=>{
 const mode=i===1?'--network':i===2?'--reliability':null;
 const bad=checkFixture(missingCapture,mode,'missing-hud-'+i);
 assert.equal(bad.result.status,1);assert.match(bad.result.stderr,/Reject the dirty overlay specifically/);
 assert.match(bad.child.stderr,/ERR_MODULE_NOT_FOUND/);assert.match(bad.child.stderr,/inkwave-frozen-hud-capture/);
 assert.ok(!bad.child.stderr.includes('Build input differs from commit: '+file));
 const good=checkFixture(fixtureSource,mode,'complete-hud-'+i);
 assert.equal(good.result.status,0,good.result.stderr);
 assert.ok(good.child.stderr.includes('Build input differs from commit: '+file),good.child.stderr);
 assert.doesNotMatch(good.child.stderr,/ERR_MODULE_NOT_FOUND/);
 const name=i===1?'network':i===2?'reliability':'touch-layout';
 const receipt=JSON.parse(fs.readFileSync(path.join(good.evidence,name+'-identity-result.json'),'utf8'));
 assert.equal(receipt.status,'passed');assert.equal(receipt.productCommitAttested,false);
});
