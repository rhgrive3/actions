import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {chromium} from '/workspace/actions/node_modules/playwright/index.mjs';
const site='/workspace/actions/_site-final', out='/workspace/inkwave-validation-354f1c5/mobile-native-events';
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
assert.equal(sha(JSON.stringify(manifest.artifacts)),manifest.contentHash);
const receipts={},requests=[],report={status:'running',contentHash:manifest.contentHash,inputHash:manifest.inputHash,cases:[],scope:'Emitted Input/MobileInput in Chromium touch emulation. CDP touches and viewport resize are browser-generated; unchanged resize and orientationchange are synthetic events. No physical device or Game rendering claim.'};
const fixture=`<!doctype html><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles/ui.css"><link rel="stylesheet" href="/styles/mobile.css"><style>body{margin:0;background:#10101c}#canvas{width:100vw;height:100vh}</style><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script><canvas id="canvas"></canvas><script type="module">
import {Input} from '/src/core/input.js';
const input=window.input=new Input(document.querySelector('#canvas'));
input.lastDevice='touch';input.mobile.setVisible(true);
window.events=[];window.state=()=>({fire:input.mobile.down('fire'),pointers:input.mobile._ptr.size,width:innerWidth,height:innerHeight,connected:input.mobile.root.isConnected,angle:screen.orientation.angle,orientation:screen.orientation.type});
for(const name of ['pointerdown','pointerup','pointercancel','resize','orientationchange'])window.addEventListener(name,e=>events.push({type:e.type,isTrusted:e.isTrusted,pointerType:e.pointerType,pointerId:e.pointerId,time:performance.now(),...state()}), name.startsWith('pointer'));
window.ready=true;</script>`;
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((q,r)=>{try{const rel=new URL(q.url,'http://x').pathname.slice(1);if(rel==='probe'){r.writeHead(200,{'content-type':'text/html'});r.end(fixture);return;}const file=path.resolve(site,rel);assert(file.startsWith(site+'/'));const bytes=fs.readFileSync(file);assert.equal(sha(bytes),manifest.artifacts[rel],rel);receipts[rel]=sha(bytes);r.writeHead(200,{'content-type':mime[path.extname(rel)]||'application/octet-stream'});r.end(bytes);}catch(e){requests.push(String(e));r.writeHead(404);r.end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser,page;
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});report.browser=browser.version();
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true});page=await context.newPage();
 page.on('pageerror',e=>requests.push(String(e)));await page.goto('http://127.0.0.1:'+server.address().port+'/probe');await page.waitForFunction(()=>window.ready);
 const cdp=await context.newCDPSession(page);
 const start=async()=>{const b=await page.locator('[data-c="fire"]').boundingBox();assert(b);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]});await page.waitForFunction(()=>input.mobile.down('fire'));};
 const end=()=>cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await start();let s=await page.evaluate(()=>{window.dispatchEvent(new Event('resize'));return state();});assert.equal(s.fire,true);assert.equal(s.pointers,1);report.cases.push({name:'unchanged resize preserves trusted touch hold',...s});
 await page.setViewportSize({width:900,height:420});await page.waitForFunction(()=>events.some(e=>e.type==='resize'&&e.isTrusted&&e.width===900));s=await page.evaluate(()=>state());
 const resize=await page.evaluate(()=>events.filter(e=>e.type==='resize'&&e.isTrusted&&e.width===900).at(-1));report.cases.push({name:'native same-orientation viewport resize preserves live hold',pass:s.fire===true&&s.pointers===1&&resize.fire===true&&resize.pointers===1,event:resize,...s});await end();
 await start();s=await page.evaluate(()=>state());assert.equal(s.fire,true);report.cases.push({name:'new trusted touch works after resize',...s});
 s=await page.evaluate(()=>{window.dispatchEvent(new Event('orientationchange'));return state();});report.cases.push({name:'same-angle orientation event preserves live hold',pass:s.fire===true&&s.pointers===1,...s});await end();
 await start();await cdp.send('Emulation.setDeviceMetricsOverride',{width:900,height:420,deviceScaleFactor:1,mobile:true,screenOrientation:{type:'portraitPrimary',angle:0}});await page.waitForFunction(()=>!input.mobile.down('fire'));s=await page.evaluate(()=>state());assert.equal(s.pointers,0);report.cases.push({name:'native physical orientation angle change at same dimensions cancels',...s});await end();
 await start();await page.screenshot({path:path.join(out,'held-fire.png')});s=await page.evaluate(()=>{input.mobile.destroy();return state();});assert.equal(s.connected,false);assert.equal(s.fire,false);assert.equal(s.pointers,0);report.cases.push({name:'destroy detaches DOM and cancels hold',...s});await end();
 report.events=await page.evaluate(()=>events);assert(report.events.filter(e=>e.type==='pointerdown').length>=3);assert(report.events.filter(e=>e.type==='pointerdown').every(e=>e.isTrusted&&e.pointerType==='touch'));assert(report.events.some(e=>e.type==='resize'&&!e.isTrusted));assert(report.events.some(e=>e.type==='orientationchange'&&!e.isTrusted));assert.equal(requests.length,0);await page.screenshot({path:path.join(out,'destroyed.png')});report.status=report.cases.some(c=>c.pass===false)?'failed':'passed';if(report.status==='failed')process.exitCode=1;
}catch(error){report.status='failed';report.error=error.stack;if(page){report.events=await page.evaluate(()=>window.events).catch(()=>null);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}process.exitCode=1;}
finally{report.requests=requests;report.receipts=receipts;fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser?.close();await new Promise(r=>server.close(r));}
