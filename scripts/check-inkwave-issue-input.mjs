#!/usr/bin/env node
// Real Chromium, emitted Input/MobileInput/Game/HUD. Controller snapshots and
// request latency are controlled fixtures; no Switch/device-hardware claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const option=name=>{const i=process.argv.indexOf(name);assert(i>=0&&process.argv[i+1],name);return path.resolve(process.argv[i+1]);};
const site=option('--site'),out=option('--evidence-dir');fs.mkdirSync(out,{recursive:true});
const negative=process.argv.includes('--negative-control');
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const fixture=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/styles/ui.css"><link rel="stylesheet" href="/styles/mobile.css">
<style>body{margin:0;background:#10101c}#canvas{width:100vw;height:100vh}#request,#complete{position:fixed;z-index:100000;left:20px;top:20px}#complete{left:130px}</style>
<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>
<canvas id="canvas"></canvas><button id="request">Request</button><button id="complete">Complete</button>
<script type="module">
import {Input} from '/src/core/input.js';import {Game} from '/src/main.js';import {HUD} from '/src/ui/hud.js';import {G} from '/src/core/ctx.js';
const canvas=document.querySelector('#canvas');const input=new Input(canvas);window.input=input;window.G=G;window.HUD=HUD;
const calls=[];const game=Object.create(Game.prototype);game.input=input;game.menus={current:'settings',nav(a){calls.push(a);if(a==='back')this.current=this.current==='settings'?'pause':null;}};
game.pause=()=>calls.push('pause');game.resume=()=>calls.push('resume');window.game=game;window.calls=calls;
G.mode='match';G.match={state:'playing',paused:false,attract:false};G.game=game;
let pad=null;Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>pad?[pad]:[]});
window.frame=(buttons=[],axes=[0,0,0,0])=>{pad={id:'controlled-pad',index:0,connected:true,mapping:'standard',axes,buttons:Array.from({length:17},(_,i)=>({pressed:buttons.includes(i),value:buttons.includes(i)?1:0}))};input.pollPad();game._padMenus();input.endFrame();};
input.lastDevice='touch';input.mobile.setVisible(true);
const native=canvas.requestPointerLock.bind(canvas);let complete;
canvas.requestPointerLock=()=>{window.requests=(window.requests||0)+1;if(window.deferLock)return new Promise((yes,no)=>{complete=()=>native().then(yes,no);});return native();};
document.querySelector('#request').onclick=()=>input.requestLock();document.querySelector('#complete').onclick=()=>complete?.();
window.ready=true;
</script></html>`;
const types={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2','.png':'image/png'};
const receipts={};const server=http.createServer((req,res)=>{try{
 const url=new URL(req.url,'http://localhost');if(url.pathname==='/__issue-input'){res.writeHead(200,{'content-type':'text/html'});res.end(fixture);return;}
 const rel=decodeURIComponent(url.pathname).slice(1),file=path.resolve(site,rel);assert(file.startsWith(site+path.sep));let bytes=fs.readFileSync(file);
 assert.equal(hash(bytes),manifest.artifacts[rel],rel);receipts[rel]=hash(bytes);
 if(rel==='src/main.js'){
  const source=bytes.toString(),boot=/const ([\w$]+)=new ([\w$]+);\1\.boot\(\)\.catch\([\s\S]*$/;
  const hit=source.match(boot);assert(hit,'actual entrypoint export boundary');bytes=Buffer.from(source.replace(boot,`export {${hit[2]} as Game};`));
 }
 res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(bytes);
}catch(e){res.writeHead(404);res.end(e.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const runtime=process.env.PLAYWRIGHT_MODULE;assert(runtime,'PLAYWRIGHT_MODULE must identify an installed module');
const {chromium}=await import(pathToFileURL(runtime));
const bundled=process.env.CHROMIUM_PATH?null:(await import('@sparticuz/chromium')).default;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||await bundled.executablePath(),args:bundled?.args||['--no-sandbox','--disable-dev-shm-usage']});
const report={contentHash:manifest.contentHash,negativeControl:negative,physicalController:false,physicalSwitch:false,entryExportShim:true,controlledPointerLatency:true,cases:[],errors:[],receipts};
try{
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,deviceScaleFactor:1});const page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/__issue-input`);await page.waitForFunction(()=>window.ready);
 const editor=await page.evaluate(()=>{input.mobile.openEditor();frame([1]);frame();frame([1]);return {editing:input.mobile.editing,current:game.menus.current,calls:[...calls]};});
 report.cases.push({name:'editor-pad-modal',...editor,pass:editor.editing&&editor.current==='settings'&&editor.calls.length===0});
 if(!negative){assert(report.cases.at(-1).pass);await page.locator('[data-e="cancel"]').click();
  const held=await page.evaluate(()=>{for(let i=0;i<30;i++)frame([1],[.9,0,0,0]);return [...calls];});assert.deepEqual(held,[]);
  const fresh=await page.evaluate(()=>{frame();frame([1]);return [...calls];});assert.deepEqual(fresh,['back']);
  report.cases.push({name:'editor-neutral-before-fresh-navigation',pass:true});
 }
 await page.reload();await page.waitForFunction(()=>window.ready);
 await page.evaluate(()=>{input.lastDevice='kbm';game.menus.current=null;window.deferLock=true;});
 await page.locator('#request').click();await page.evaluate(()=>input.exitLock());await page.locator('#complete').click();
 await page.waitForTimeout(150);
 const lock=await page.evaluate(()=>({locked:input.locked,browserLocked:!!document.pointerLockElement,requests:window.requests}));
 report.cases.push({name:'cancelled-native-completion',...lock,pass:!lock.locked&&!lock.browserLocked&&lock.requests===1});
 if(!negative){assert(report.cases.at(-1).pass);await page.evaluate(()=>{window.deferLock=false;});await page.locator('#request').click();await page.waitForFunction(()=>input.locked&&document.pointerLockElement);
  await page.evaluate(()=>input.exitLock());await page.waitForFunction(()=>!input.locked&&!document.pointerLockElement);report.cases.push({name:'fresh-native-pointer-lock-retry',pass:true});
 }
 const tank=await page.evaluate(()=>{
  const rows=[];for(const [w,h] of [[5,17],[1,1],[16,50],[22,67]]){
   const c=document.createElement('canvas');c.style.cssText='width:'+w+'px;height:'+h+'px';document.body.append(c);
   const hud=Object.create(HUD.prototype);Object.assign(hud,{_L:{},_tank:{t:0,level:.5,bubbles:[]},tankCanvas:c,tankCtx:c.getContext('2d')});
   try{hud._drawTank(1/60,.7,false,true);rows.push({w,h,wellWidth:hud._tankCache.ww,wellHeight:hud._tankCache.wh,pass:hud._tankCache.ww>0&&hud._tankCache.wh>0});}
   catch(e){rows.push({w,h,pass:false,error:e.message});}c.remove();
  }return rows;
 });report.cases.push({name:'native-canvas-small-tank',rows:tank,pass:tank.every(x=>x.pass)});
 if(negative){assert(report.cases.filter(x=>!x.pass).length>=2,'baseline must expose independently observed failures');}
 else{assert(report.cases.every(x=>x.pass));assert.deepEqual(report.errors,[]);}
 await page.screenshot({path:path.join(out,'input-fixture.png')});await context.close();report.status='passed';
}catch(e){report.status='failed';report.failure=e.stack;throw e;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({status:report.status,cases:report.cases.length,contentHash:report.contentHash,negativeControl:negative}));
