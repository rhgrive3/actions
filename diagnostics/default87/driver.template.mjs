#!/usr/bin/env node
import {verifyExactBuild,checkSavedFiveReopening} from './saved-five-reopen.mjs';
import { checkAcceptedDefaultConsumption } from '__SOURCE_ROOT__/scripts/lib/inkwave-accepted-default-probe.mjs';
import { checkWeaponAppearancePicker } from '__SOURCE_ROOT__/scripts/lib/inkwave-weapon-appearance-probe.mjs';
import { clickNativeKitCard } from '__SOURCE_ROOT__/scripts/lib/inkwave-canonical-kit-input.mjs';
import { runQualityBrowserProbe } from '__SOURCE_ROOT__/patches/local-quality/quality-probe.mjs';
import { runPaintMipmapBrowserProbe } from '__SOURCE_ROOT__/patches/local-quality/paint-mipmap-probe.mjs';
import { checkHudAuthority, checkUiVisualProbes } from '__SOURCE_ROOT__/scripts/check-inkwave-hud-authority.mjs';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const option = name => { const i=process.argv.indexOf(name); if(i<0 || !process.argv[i+1]) throw new Error('Required '+name); return path.resolve(process.argv[i+1]); };
const site=option('--site'), evidence=option('--evidence-dir'), profile=option('--profile-dir');
const uiProbesOnly = process.argv.includes('--ui-probes-only');if(uiProbesOnly)throw Error('Saved-five acceptance cannot skip full probes');
const ROOT=option('--source-root');if(fs.realpathSync(ROOT)!==fs.realpathSync('__SOURCE_ROOT__'))throw Error('Private driver imports require the exact prepared source root');
const physicalLocation = name => fs.existsSync(name) ? fs.realpathSync(name) : path.join(physicalLocation(path.dirname(name)),path.basename(name));
for(const directory of [evidence,profile]) {
  const resolved=physicalLocation(directory);
  if(['/tmp','/var/tmp','/dev/shm'].some(root=>resolved===root||resolved.startsWith(root+'/'))) throw new Error('Use workspace-owned persistent storage: '+resolved);
  fs.mkdirSync(directory,{recursive:true});
}
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
if(hash(JSON.stringify(manifest.artifacts))!==manifest.contentHash) throw new Error('Build identity mismatch');
for(const [file,expected] of Object.entries(manifest.artifacts)) if(hash(fs.readFileSync(path.join(site,file)))!==expected) throw new Error('Artifact mismatch: '+file);
const officialBinding=JSON.parse(fs.readFileSync(option('--official-binding'),'utf8'));if(!officialBinding.diagnosticProductionBuildVerified||!officialBinding.allSourceInputsVerified||officialBinding.head!=='c386cbe581dfda252b611751301f277761fa1269'||officialBinding.candidateTree!=='a619a4476f23c6c768bf4b6fda3983a16dc1e043'||officialBinding.contentHash!==manifest.contentHash)throw Error('Exact diagnostic e1a build binding required');
const savedFiveBinding={...verifyExactBuild({sourceRoot:ROOT,sourceMap:option('--source-map'),site,manifest}),head:officialBinding.head};
const sourceSha=process.argv.includes('--exact-source') ? execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim() : null;
// Bind every build input to the actual checkout commit when --exact-source is used.
if(process.argv.includes('--exact-source')) {
  const tree=new Map(execFileSync('git',['ls-tree','-r','-z',sourceSha],{cwd:ROOT,encoding:'utf8'}).split('\0').filter(Boolean).map(row=>{ const [meta,file]=row.split('\t'); return [file,meta.split(' ')[2]]; }));
  const files=Object.keys(manifest.files).map(key=>{
    if(key.startsWith('upstream/')) return 'inkwave-public/'+key.slice(9);
    if(key.startsWith('patch/')) return 'patches/splatoon3/'+key.slice(6);
    if(key.startsWith('touch-layout/')) return 'patches/touch-layout/'+key.slice(13);
    if(key.startsWith('reliability/')) return 'patches/reliability/'+key.slice(12);
    if(key.startsWith('local-quality/')) return 'patches/local-quality/'+key.slice(14);
    if(key.startsWith('network-replication/')) return 'patches/network-replication/'+key.slice(20);
    if(key.startsWith('loading-cache/')) return 'patches/loading-cache/'+key.slice(14);
    if(key.startsWith('practice-range/')) return 'patches/practice-range/'+key.slice(15);
    if(key.startsWith('native-stages/')) return 'patches/native-stages/'+key.slice(14);
    if(key.startsWith('build-script/')) return 'scripts/'+key.slice(13);
    throw new Error('Unknown build input namespace: '+key);
  });
  Object.entries(manifest.files).forEach(([key,expected],i)=>{if(hash(fs.readFileSync(path.join(ROOT,files[i])))!==expected)throw new Error('Build input differs from manifest: '+key);});
  if(hash(fs.readFileSync(path.join(ROOT,'scripts/build-inkwave.mjs')))!==manifest.build.script)throw new Error('Build pipeline mismatch');
  files.push('scripts/build-inkwave.mjs');
  const blobs=execFileSync('git',['hash-object','--',...files],{cwd:ROOT,encoding:'utf8'}).trim().split('\n');
  files.forEach((file,i)=>{if(blobs[i]!==tree.get(file))throw new Error('Build input differs from commit: '+file);});
}
// Identity-negative fixtures intentionally stop before loading browser helpers.
const { runMinimapCanvasProbe } = await import('__SOURCE_ROOT__/scripts/lib/minimap-canvas-probe.mjs');
const { probeTurfLead } = await import('__SOURCE_ROOT__/scripts/lib/inkwave-turf-lead-probe.mjs');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.glb':'model/gltf-binary'};
const server=http.createServer((request,response)=>{
  try { const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname); const file=path.resolve(site,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(site+path.sep)||!fs.statSync(file).isFile()) throw new Error('Missing');
    response.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(response);
  }catch{response.writeHead(404);response.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const address='http://127.0.0.1:'+server.address().port+'/';
let browser;
try {
 browser=await chromium.launchPersistentContext(profile,{headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),viewport:{width:1280,height:800},args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page = await browser.newPage(), errors = [], failures = [], consoleErrors = [], receipts = [];
// Fulfill with the exact bytes returned by the local server after verification.
// API responses retain preload bodies that Chrome's DevTools may discard.
const savedFiveExactResponses=[];
const savedFivePendingResponses=new Set();
const savedFiveResponseErrors=[];
async function verifyServiceWorkerResponse(response){
 if(!response.fromServiceWorker())return;
 if(new URL(response.url()).origin!==new URL(address).origin)throw new Error('Service-worker response origin mismatch');
 const key=decodeURIComponent(new URL(response.url()).pathname).replace(/^\//,'') || 'index.html';
 if(!manifest.artifacts[key])return;
 const body=await response.body(),digest=hash(body);
 if(digest!==manifest.artifacts[key])throw new Error('Loaded service-worker artifact mismatch: '+key);
 savedFiveExactResponses.push({key,verified:true,sha256:digest,transport:'service-worker'});
}
page.on('response',response=>{
 const pending=verifyServiceWorkerResponse(response).catch(error=>{savedFiveResponseErrors.push(error);errors.push(error.message);});
 savedFivePendingResponses.add(pending);pending.finally(()=>savedFivePendingResponses.delete(pending));
});
async function settleSavedFiveResponses(){
 while(savedFivePendingResponses.size)await Promise.all([...savedFivePendingResponses]);
 if(savedFiveResponseErrors.length)throw savedFiveResponseErrors[0];
}

await page.route(address+'**', async route => {
  try {
    const response=await route.fetch(), body=await response.body();
    const key=decodeURIComponent(new URL(response.url()).pathname).replace(/^\//,'') || 'index.html';
    if(manifest.artifacts[key] && hash(body)!==manifest.artifacts[key]) throw new Error('Loaded artifact mismatch: '+key);
    if(manifest.artifacts[key])savedFiveExactResponses.push({key,verified:true,sha256:hash(body)});
    receipts.push(key.replace(/^_versions\/[a-f0-9]+\//,'')); await route.fulfill({response,body});
  }catch(error){ errors.push(error.message); await route.abort(); }
});
await page.bringToFront();
await page.addInitScript(() => { localStorage.setItem('inkwave.settings', JSON.stringify({quality:'low', shadows:false, bloom:false, minimap:false})); });
page.on('pageerror', error => errors.push(error.message));
page.on('requestfailed', request => failures.push({ url: request.url(), error: request.failure()?.errorText }));
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 1500)); });
let result;
try {
  await page.goto(address, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(async () => { globalThis.s3ProbeG = (await import(new URL('src/core/ctx.js',document.baseURI).href)).G; });
  await page.waitForFunction(() => (!!globalThis.s3ProbeG?.game?.menus && globalThis.s3ProbeG.s3?.installed && globalThis.s3ProbeG.mode !== 'boot') || !!document.getElementById('boot-error')?.textContent, null, { timeout: 180000 });
  console.error('active browser: native boot ready');
  if (await page.locator('#boot-error').textContent()) throw new Error('Game boot error');
  result = await page.evaluate(async () => {
    const { G } = await import(new URL('src/core/ctx.js',document.baseURI).href);
    const build = await fetch(new URL('inkwave-build.json',location.href)).then(r => r.json());
    if (!document.baseURI.includes(build.build.revision)) throw new Error('Active asset revision mismatch');
    return { baseURI:document.baseURI, mode: G.mode, patch: G.s3, contentHash: build.contentHash, clockTicks: G.game.s3Clock?.ticks, sourceEntry: [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src')) };
  });
  // Exercise the native menu interval that previously pinned an unused LobbySet.
  await page.waitForFunction(() => !!globalThis.s3ProbeG?.game?.timer, null, { timeout:30000 });
  await page.waitForTimeout(2800);
  result.idleLobby = await page.evaluate(() => ({ mode:globalThis.s3ProbeG.mode, allocated:!!globalThis.s3ProbeG.game.showcase.lob }));
  if (result.idleLobby.mode !== 'menu' || result.idleLobby.allocated) throw new Error('Idle menu allocated unused Online LobbySet');
  await page.evaluate(async () => { const { G } = await import(new URL('src/core/ctx.js',document.baseURI).href); G.game.debug.freeze(); G.game.menus.wipe.cancel(); G.game.menus.show('loadout', {wipe:false,light:false}); for(let i=0;i<90;i++)G.game.menus.update(1/60); });
  await page.waitForSelector('.s3-gear');
  // Wait for the real current screen, then use trusted browser pointer input.
  // DOM presence alone can include an old leaving screen and unopened panels.
  await page.waitForFunction(()=>{
    const m=globalThis.s3ProbeG.game.menus,el=m._scr?.el;
    return m.current==='loadout'&&el?.isConnected&&!el.classList.contains('is-leaving')&&!m._modal;
  });
  result.weaponAppearancePicker = await checkWeaponAppearancePicker({page,evidence});
  console.error('active browser: appearance picker passed');
  result.acceptedDefaultConsumption = await checkAcceptedDefaultConsumption({page,evidence,manifest});
  result.savedFiveReopening=await checkSavedFiveReopening({page,evidence,manifest,binding:savedFiveBinding,verifiedResponses:savedFiveExactResponses,settleResponses:settleSavedFiveResponses});
  await settleSavedFiveResponses();
  if(result.acceptedDefaultConsumption.rows.length!==42||result.savedFiveReopening.status!=='passed'||result.savedFiveReopening.phases.length!==15)throw Error('Incomplete42+15 acceptance');
  result.status='passed';
} catch(error){result={...(result||{}),status:'failed',error:String(error)};process.exitCode=1;}
finally{
 result.scope='focused saved-model42 default draws plus15 fresh reloads';result.fullAcceptance=false;result.provenance='diagnostic-production-build';result.head=officialBinding.head;result.buildReceiptSHA256=officialBinding.buildReceiptSHA256;result.verifiedResponses=savedFiveExactResponses;result.errors=errors;result.requestFailures=failures;result.consoleErrors=consoleErrors;
 if(errors.length||failures.length||consoleErrors.length){result.status='failed';process.exitCode=1;}
 fs.writeFileSync(path.join(evidence,'browser-result.json'),JSON.stringify(result,null,2));
}
} finally { await browser?.close().catch(()=>{}); await new Promise(resolve=>server.close(resolve)); }
