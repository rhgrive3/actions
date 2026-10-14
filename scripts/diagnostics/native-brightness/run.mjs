import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {deflateSync} from 'node:zlib';
import {initializePair,connectPair,pairBooted,verifyPairRequest} from './trusted-io.mjs';
import {installCanvasCapture} from './inkwave-canvas-capture.mjs';import {verifySavedPngCapture,decodeCapturePng} from './inkwave-png-evidence.mjs';
import {prepareLightingScene,landLightingScene} from './prepare.mjs';
import {collectMaskedLighting} from './masked-lighting.mjs';
const PIN='1c84fa1a8776f1f3b6d6bc8da807c6dba0668a94',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),binding=JSON.parse(fs.readFileSync(process.argv[4]));fs.mkdirSync(out,{recursive:true});
const manifestBytes=fs.readFileSync(path.join(site,'inkwave-build.json')),manifest=JSON.parse(manifestBytes);
assert.equal(binding.head,PIN);assert.equal(binding.dirty,false);assert.equal(binding.manifestSHA256,sha(manifestBytes));
for(const [p,h]of Object.entries(manifest.artifacts)){const file=path.resolve(site,p);assert.ok(file.startsWith(site+path.sep));assert.equal(sha(fs.readFileSync(file)),h,p);}
const report={status:'incomplete',pin:PIN,binding,scope:'Native Inkblot frozen matched-view lighting diagnostics; not photo/iPad acceptance; mask visual review required',contentHash:manifest.contentHash,inputHash:manifest.inputHash,revision:manifest.build.revision,themes:[],errors:[]};
const save=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));save();
function crc(b){let c=0xffffffff;for(const v of b){c^=v;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,b){const t=Buffer.from(type),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(b.length);sum.writeUInt32BE(crc(Buffer.concat([t,b])));return Buffer.concat([len,t,b,sum]);}
function maskPng(mask){const w=mask.width,h=mask.height,l=Buffer.from(mask.labels,'base64'),rows=Buffer.alloc(h*(1+w*4));for(let y=0;y<h;y++)for(let x=0;x<w;x++){const id=l[(h-1-y)*w+x],i=y*(1+w*4)+1+x*4;rows[i]=id===1?255:0;rows[i+1]=id===2?255:0;rows[i+3]=255;}const ih=Buffer.alloc(13);ih.writeUInt32BE(w);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;const b=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);decodeCapturePng(b);return b;}
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://local'),f=path.resolve(site,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!f.startsWith(site+path.sep)||!fs.statSync(f).isFile())throw Error('path');res.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);}catch{res.writeHead(404);res.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/';let browser;
try{
 const {chromium}=await import('playwright');browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const theme of ['day','sunset']){
  const row={theme,errors:[],loadedArtifacts:[],sourceDownloads:[],status:'incomplete'};report.themes.push(row);save();
  const context=await browser.newContext({viewport:{width:960,height:540},deviceScaleFactor:1,hasTouch:true,isMobile:true,serviceWorkers:'block'}),pending=[];
  try{
   await context.routeWebSocket('**/*',s=>{row.errors.push('Unexpected WebSocket blocked');s.close();});const page=await context.newPage();page.on('pageerror',e=>row.errors.push(String(e)));
   await page.route('**/*',route=>{const p=verifyPairRequest(route,url,manifest,row).catch(async e=>{row.errors.push(String(e));await route.abort('failed').catch(()=>{});});pending.push(p);return p;});
   await page.addInitScript(initializePair);await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'high',shadows:true,bloom:false,minimap:false,musicVolume:0})));
   await page.goto(url+'?map=inkblot',{waitUntil:'domcontentloaded',timeout:90000});await page.evaluate(connectPair);await page.waitForFunction(pairBooted,null,{timeout:180000});
   await page.evaluate(installCanvasCapture);
   const dir=path.join(out,theme);fs.mkdirSync(dir,{recursive:true});
   row.aimPreparation=await page.evaluate(prepareLightingScene,theme);
   const aim=await page.evaluate(()=>globalThis.__captureNativeCanvas('aim-reference-active-fx'));verifySavedPngCapture(aim);
   const aimBytes=Buffer.from(aim.png.slice(22),'base64');fs.writeFileSync(path.join(dir,'aim-reference-active-fx.png'),aimBytes);
   row.aimReference={file:theme+'/aim-reference-active-fx.png',sha256:sha(aimBytes),scope:'Original AIM camera and active FX; separate from landed control view',capture:aim.capture};save();
   try{row.preparation=await page.evaluate(landLightingScene);}finally{row.landingReceipt=await page.evaluate(()=>globalThis.__lightingLandingReceipt??null);save();}
   const result=await collectMaskedLighting(page,{expectedTheme:theme,expectedRevision:manifest.build.revision,verifyCapture:verifySavedPngCapture,onMask:mask=>fs.writeFileSync(path.join(dir,'mask.png'),maskPng(mask)),onOriginal:original=>{for(const frame of original.rows){verifySavedPngCapture(frame.capture);fs.writeFileSync(path.join(dir,frame.mode+'.png'),Buffer.from(frame.capture.png.slice(22),'base64'));}}});
   const mask=maskPng(result.mask);fs.writeFileSync(path.join(dir,'mask.png'),mask);result.mask.pngSha256=sha(mask);delete result.mask.labels;
   for(const frame of result.rows){const bytes=Buffer.from(frame.capture.png.slice(22),'base64');fs.writeFileSync(path.join(dir,frame.mode+'.png'),bytes);frame.capture={pngFile:frame.mode+'.png',pngSha256:sha(bytes),rawSha256:sha(Buffer.from(frame.capture.rawRGBA,'base64')),exactPngReadbackVerified:true,...frame.capture.capture};}
   fs.writeFileSync(path.join(dir,'lighting.json'),JSON.stringify(result,null,2));row.status='collected-awaiting-mask-visual-review';row.evidence=theme+'/lighting.json';
   await Promise.all(pending);assert.equal(row.errors.length,0);assert.ok(row.sourceDownloads.length>0,'Pinned native source download absent');
  }catch(e){row.errors.push(String(e.stack||e));row.status='incomplete';}
  finally{await context.close();await Promise.allSettled(pending);save();}
 }
 report.status=report.themes.every(r=>r.status==='collected-awaiting-mask-visual-review'&&!r.errors.length)?'collected-awaiting-mask-visual-review':'incomplete';
}catch(e){report.errors.push(String(e.stack||e));}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));save();}
if(report.status==='incomplete')process.exitCode=1;
