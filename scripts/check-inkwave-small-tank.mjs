#!/usr/bin/env node
// Actual emitted game, normal PlayerController/HUD frames, then responsive
// resize and ink-level changes. This is browser emulation, not device/S3 parity.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium, webkit } from 'playwright';
const [siteArg,outArg]=process.argv.slice(2);
if(!outArg)throw Error('Usage: node scripts/check-inkwave-small-tank.mjs <built-site> <evidence> [--webkit]');
const site=path.resolve(siteArg),out=path.resolve(outArg),useWebkit=process.argv.includes('--webkit');
fs.mkdirSync(out,{recursive:true});
const types={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://x').pathname;
 if(u==='/favicon.ico'){res.writeHead(204);res.end();return;}
 const file=path.resolve(site,u==='/'?'index.html':u.slice(1));
 if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const identity=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),errors=[];
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.match(sourceCommit,/^[0-9a-f]{40}$/);
const result={sourceCommit,buildIdentity:{contentHash:identity.contentHash,inputHash:identity.inputHash},environment:useWebkit?'WebKit Linux emulated touch':'Chromium Linux SwiftShader',physicalDevice:false,startups:[],cases:[]};
let browser,page;
const save=()=>fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({...result,errors},null,2));
try {
 browser=useWebkit?await webkit.launch({headless:true}):await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 for(const dpr of [1,2]) {
  page=await browser.newPage({viewport:{width:320,height:568},deviceScaleFactor:dpr,hasTouch:useWebkit,isMobile:useWebkit});
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const bootStarted=Date.now();
  await page.goto('http://127.0.0.1:'+server.address().port+'/?range&skipTitle');
  await page.waitForFunction(()=>window.__G?.match?.range&&window.__G.match.state==='playing',null,{timeout:240000});
  await page.evaluate(()=>{window.__inkwave.debug.freeze();window.__inkwave.debug.freezeBots();});
  result.startups.push({dpr,elapsedMs:Date.now()-bootStarted});save();console.log('startup',JSON.stringify(result.startups.at(-1)));
  for(const [width,height] of [[320,568],[360,800],[390,844],[960,640],[320,200],[844,390],[960,640]]) {
   await page.setViewportSize({width,height});
   const caseStarted=Date.now();
   const row=await page.evaluate(async()=>{
    const G=window.__G,g=window.__inkwave,h=G.hud,cv=h.tankCanvas,a=G.local;
    const snapshots=[];
    for(const ink of [100,0,50]) {
     // Let real input, actor, HUD interpolation/throttle and renderer execute.
     // No tank visibility, dimensions, method or controller replacement.
     // Six 30Hz frames settle the HUD exponential within 6.1% of the target.
     // Yield each real render to the browser instead of queuing 72 GPU frames
     // synchronously before asking its compositor for a screenshot.
     for(let i=0;i<6;i++){a.ink=ink;g._frame(1/30);await new Promise(resolve=>requestAnimationFrame(resolve));}
     const pixels=h.tankCtx.getImageData(0,0,cv.width,cv.height).data;
     let opaque=0,coloured=0,checksum=0;
     for(let i=0;i<pixels.length;i+=4){if(pixels[i+3])opaque++;if(pixels[i+3]&&Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2])>20)coloured++;for(let j=0;j<4;j++)checksum=(Math.imul(checksum,31)+pixels[i+j])>>>0;}
     snapshots.push({ink,level:h._tank.level,opaque,coloured,checksum});
    }
    const c=h._tankCache,style=getComputedStyle(h.tank),canvasStyle=getComputedStyle(cv);
    return {viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,canvas:[cv.clientWidth,cv.clientHeight,cv.width,cv.height],well:{x:c.wx,y:c.wy,width:c.ww,height:c.wh},form:a.form,hudVisible:getComputedStyle(h.el).display!=='none',tankDisplay:style.display,tankVisibility:style.visibility,tankOpacity:style.opacity,canvasDisplay:canvasStyle.display,snapshots};
   });
   row.elapsedMs=Date.now()-caseStarted;row.framesPerInkState=6;row.frameDt=1/30;
   result.cases.push(row);save();console.log(JSON.stringify(row));
   assert.deepEqual(row.viewport,[width,height]);assert.equal(row.dpr,dpr);assert.equal(row.form,'kid');
   assert(row.hudVisible&&row.tankDisplay!=='none'&&row.tankVisibility!=='hidden'&&Number(row.tankOpacity)>0&&row.canvasDisplay!=='none','tank remains visible');
   const u=Math.min(width*.01,height*.017778),cw=Math.round(u*1.7),ch=Math.round(u*5.2),scale=Math.min(2,dpr);
   assert.deepEqual(row.canvas,[cw,ch,Math.round(cw*scale),Math.round(ch*scale)],'real responsive CSS and backing dimensions');
   assert(row.well.width>0&&row.well.height>0);
   // Raster smoke only: the canvas also contains the outline and subcost line.
   // These counts/checksums are not an isolated ink-coverage or visual-parity metric.
   assert(row.snapshots.every(s=>s.opaque>0));assert(row.snapshots[0].coloured>0&&row.snapshots[2].coloured>0,'canvas retains nonneutral pixels');
   assert(row.snapshots[0].level>.9&&row.snapshots[1].level<.1&&row.snapshots[2].level>.4&&row.snapshots[2].level<.6);
   assert.notEqual(row.snapshots[0].checksum,row.snapshots[1].checksum,'full/empty states change the visible canvas');
   assert.deepEqual(errors,[]);
   await page.screenshot({path:path.join(out,`${width}x${height}-dpr${dpr}-${result.cases.length}.png`),timeout:120000});
  }
  await page.close();page=null;
 }
 save();assert.deepEqual(errors,[]);
} catch(error) {
 result.failure=String(error);save();if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
