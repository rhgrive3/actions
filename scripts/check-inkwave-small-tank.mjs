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
if(!outArg)throw Error('Usage: node scripts/check-inkwave-small-tank.mjs <built-site> <evidence> [--webkit] [--dpr 1|2]');
const dprIndex=process.argv.indexOf('--dpr'),dprs=dprIndex<0?[1,2]:[Number(process.argv[dprIndex+1])];
assert(dprs.every(dpr=>dpr===1||dpr===2),'supported DPR matrix');
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
 for(const dpr of dprs) {
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
    const snapshots=[],nativePixels=[];
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
     nativePixels.push(pixels);
     snapshots.push({ink,level:h._tank.level,opaque,coloured,checksum,width:cv.width,height:cv.height,png:cv.toDataURL()});
    }
    const c=h._tankCache,style=getComputedStyle(h.tank),canvasStyle=getComputedStyle(cv);
    const roi={x0:Math.floor(c.wx),x1:Math.ceil(c.wx+c.ww),y0:Math.ceil(c.wy+c.wh*.7),y1:Math.floor(c.wy+c.wh*.85)+1};
    const distance=(a,b,box={x0:0,x1:cv.width,y0:0,y1:cv.height})=>{
     if(a.length!==b.length)throw Error('tank dimensions changed within ink-state samples');
     let pixels=0,changedPixels=0,rgbL1=0,alphaL1=0,maxRgb=0,maxAlpha=0;
     for(let y=box.y0;y<box.y1;y++)for(let x=box.x0;x<box.x1;x++){
      const i=(y*cv.width+x)*4;let changed=false;pixels++;
      for(let k=0;k<4;k++){const d=Math.abs(a[i+k]-b[i+k]);changed ||= d>0;if(k===3){alphaL1+=d;maxAlpha=Math.max(maxAlpha,d);}else{rgbL1+=d;maxRgb=Math.max(maxRgb,d);}}
      if(changed)changedPixels++;
     }
     return {pixels,changedPixels,rgbL1,alphaL1,maxRgb,maxAlpha};
    };
    // Isolate the shipped draw method on a separate canvas at the SAME client
    // and backing dimensions. Fixed outline/no subline removes mixed-pixel
    // ambiguity; the lower-well ROI excludes the full/half meniscus and foot.
    // The live game's canvas, state, method and drawing remain untouched.
    const probe=(level,suppressInk=false)=>{
     const canvas=document.createElement('canvas');canvas.style.cssText=`position:fixed;left:-10000px;top:0;width:${cv.clientWidth}px;height:${cv.clientHeight}px`;
     document.body.append(canvas);
     try {
      const ctx=canvas.getContext('2d'),p=Object.create(h);let suppressedRects=0;
      Object.assign(p,{_L:{...h._L},_tank:{...h._tank,level,bubbles:[]},tankCanvas:canvas,tankCtx:ctx,_tankCache:undefined,_s3TankElapsed:0,_s3TankDrawn:false});
      if(suppressInk){ctx.fillStyle=h._L.tankCol[1];const inkStyle=ctx.fillStyle,fill=ctx.fillRect;ctx.fillRect=function(...args){if(this.fillStyle===inkStyle){suppressedRects++;return;}return fill.apply(this,args);};}
      h._drawTank.call(p,1/30,0,false,false);
      if(canvas.width!==cv.width||canvas.height!==cv.height)throw Error('isolated probe changed tank dimensions');
      return {pixels:ctx.getImageData(0,0,canvas.width,canvas.height).data,png:canvas.toDataURL(),suppressedRects};
     } finally {canvas.remove();}
    };
    const full=probe(1),empty=probe(0),half=probe(.5),noInk=probe(1,true);
    const inkProbe={roi,fullVsEmpty:distance(full.pixels,empty.pixels,roi),halfVsEmpty:distance(half.pixels,empty.pixels,roi),suppressedFullVsEmpty:distance(noInk.pixels,empty.pixels,roi),suppressedRects:noInk.suppressedRects,images:[{name:'full',png:full.png},{name:'empty',png:empty.png},{name:'half',png:half.png},{name:'suppressed-full',png:noInk.png}]};
    return {viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,canvas:[cv.clientWidth,cv.clientHeight,cv.width,cv.height],well:{x:c.wx,y:c.wy,width:c.ww,height:c.wh},form:a.form,hudVisible:getComputedStyle(h.el).display!=='none',tankDisplay:style.display,tankVisibility:style.visibility,tankOpacity:style.opacity,canvasDisplay:canvasStyle.display,snapshots,nativeFullVsEmpty:distance(nativePixels[0],nativePixels[1]),inkProbe};
   });
   row.elapsedMs=Date.now()-caseStarted;row.framesPerInkState=6;row.frameDt=1/30;
   const prefix=`${width}x${height}-dpr${dpr}-${result.cases.length+1}`;
   for(const [name,shot] of [...row.snapshots.map(s=>['native-'+s.ink,s]),...row.inkProbe.images.map(s=>['probe-'+s.name,s])]){
    shot.image=`${prefix}-${name}.png`;fs.writeFileSync(path.join(out,shot.image),Buffer.from(shot.png.split(',')[1],'base64'));delete shot.png;
   }
   result.cases.push(row);save();console.log(JSON.stringify(row));
   assert.deepEqual(row.viewport,[width,height]);assert.equal(row.dpr,dpr);assert.equal(row.form,'kid');
   assert(row.hudVisible&&row.tankDisplay!=='none'&&row.tankVisibility!=='hidden'&&Number(row.tankOpacity)>0&&row.canvasDisplay!=='none','tank remains visible');
   const u=Math.min(width*.01,height*.017778),cw=Math.round(u*1.7),ch=Math.round(u*5.2),scale=Math.min(2,dpr);
   assert.deepEqual(row.canvas,[cw,ch,Math.round(cw*scale),Math.round(ch*scale)],'real responsive CSS and backing dimensions');
   assert(row.well.width>0&&row.well.height>0);
   // Raster smoke only: the canvas also contains the outline and subcost line.
   // These counts/checksums are not an isolated ink-coverage or visual-parity metric.
   assert(row.snapshots.every(s=>s.opaque>0));
   const requireInk=(delta)=>assert(delta.pixels>0&&delta.rgbL1+delta.alphaL1>0,'native ink fill must contribute pixels in the lower well');
   requireInk(row.inkProbe.fullVsEmpty);requireInk(row.inkProbe.halfVsEmpty);
   assert.equal(row.inkProbe.suppressedRects,1,'negative control suppresses only the isolated liquid fill');
   assert.throws(()=>requireInk(row.inkProbe.suppressedFullVsEmpty),/native ink fill/,'same pixel contract rejects the no-ink counterfactual');
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
