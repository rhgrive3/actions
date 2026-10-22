#!/usr/bin/env node
// Latest-head native range smoke, separate from the frozen inverse experiment.
// No source overlays or historical admission. Bind committed build inputs and
// every emitted artifact before running the actual renderer/weapon path.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const [siteArg,outArg,expectedHead]=process.argv.slice(2);
assert.match(expectedHead||'',/^[a-f0-9]{40}$/);
const git=(...args)=>execFileSync('git',['-C',root,...args]);
assert.equal(git('rev-parse','HEAD').toString().trim(),expectedHead);
const site=path.resolve(siteArg),out=path.resolve(outArg),hash=b=>createHash('sha256').update(b).digest('hex');
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
assert.equal(hash(JSON.stringify(build.files)),build.inputHash);
assert.equal(hash(JSON.stringify(build.artifacts)),build.contentHash);
const sourcePath=p=>{const[k,...tail]=p.split('/');return k==='upstream'?'inkwave-public/'+tail.join('/'):k==='patch'?'patches/splatoon3/'+tail.join('/'):k==='build-script'?'scripts/'+tail.join('/'):'patches/'+p;};
for(const [p,h]of Object.entries(build.files))assert.equal(hash(git('show',expectedHead+':'+sourcePath(p))),h,'Committed input '+p);
for(const [p,h]of Object.entries(build.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,p))),h,'Emitted artifact '+p);
fs.mkdirSync(out,{recursive:true});
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'Native driver anchor '+a);return s.replace(a,b);};
const entry=new URL('./lib/inkwave-range-menu-entry.mjs',import.meta.url).href;
let driver=fs.readFileSync(path.join(root,'scripts/render-inkwave-projectile-shapes.mjs'),'utf8').replace(/^#!.*\n/,'');
const originalDriverSha256=hash(driver);
driver="import {enterRangeFromMenu} from "+JSON.stringify(entry)+";\n"+driver;
driver=once(driver,"from 'playwright'","from "+JSON.stringify(import.meta.resolve('playwright')));
driver=once(driver,"  await page.goto(base + '/?range&skipTitle');","  await enterRangeFromMenu(page,base);");
driver=once(driver,"  page.on('pageerror', e => console.error('pageerror', String(e)));","  const pageErrors=[]; page.on('pageerror',e=>pageErrors.push(String(e)));");
// Require actual admitted projectiles, finite source positions and completed
// renderer screenshots. Preserve the ordinary input and native frame stepping.
driver=once(driver,"        manifest.push({ label, tick, view, file, ...info });",`        if(pageErrors.length)throw Error('Native page errors: '+pageErrors.join(' | '));
        if(!info.count||!info.pos.length||!info.pos.every(p=>p.length===3&&p.every(Number.isFinite)))throw Error('No finite native Explosher projectile');
        manifest.push({ label, tick, view, file, ...info });`);
const copy=path.join(out,'current-native-driver.mjs');fs.writeFileSync(copy,driver);
execFileSync(process.execPath,[copy,site,out,'s3-slosher-washtub'],{stdio:'inherit',env:{...process.env,TICKS:'0,3,8',VIEWS:'behind'}});
const frames=JSON.parse(fs.readFileSync(path.join(out,'manifest.json')));
assert.deepEqual(frames.map(f=>[f.label,f.tick,f.view]),[0,3,8].map(t=>['s3-slosher-washtub',t,'behind']));
for(const f of frames){const png=fs.readFileSync(path.join(out,f.file));assert(png.length>1024,'Empty native capture');f.sha256=hash(png);}
fs.writeFileSync(path.join(out,'latest-head-receipt.json'),JSON.stringify({expectedHead,tree:git('rev-parse','HEAD^{tree}').toString().trim(),inputHash:build.inputHash,contentHash:build.contentHash,originalDriverSha256,diagnosticDriverSha256:hash(driver),frames,scope:'latest-head native input/weapon/projectile/render smoke; frozen inverse pair remains separately gated; no retail parity claim'},null,2));
