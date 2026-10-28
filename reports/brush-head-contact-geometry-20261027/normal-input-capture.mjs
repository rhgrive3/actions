import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {rangeMenuControlReady} from '../../scripts/lib/inkwave-range-menu-entry.mjs';
import { chromium } from 'playwright';
if(!process.argv[2]||!process.argv[3]||!process.argv[4])throw Error('Usage: node normal-input-capture.mjs SITE OUTPUT SOURCE_SHA');
const [site,out]=process.argv.slice(2,4).map(p=>path.resolve(p));
const sourceSha=process.argv[4];
fs.mkdirSync(out,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={sourceSha,contentHash:manifest.contentHash,status:'running',steps:[],captures:[],errors:[],requestFailures:[],badResponses:[],scope:'Normal menus, trusted keyboard/mouse and real-time production gameplay in ordinary range Level. Observers only read Actor/paint/render state. No actor/input/clock/pose/painting flag injection, no native triangle or original-game agreement claim.'};
assertIdentity();
function assertIdentity(){if(hash(JSON.stringify(manifest.artifacts))!==manifest.contentHash)throw Error('manifest contentHash mismatch');}
const save=()=>fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(report,null,2));
const step=(name,data={})=>{report.steps.push({name,at:new Date().toISOString(),...data});save();console.log(JSON.stringify(report.steps.at(-1)));};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav'};
const served={};
const server=http.createServer((req,res)=>{try{let file=path.resolve(site,'.'+decodeURIComponent(new URL(req.url,'http://x').pathname));if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!file.startsWith(site+'/'))throw Error('outside site');const bytes=fs.readFileSync(file),rel=path.relative(site,file),sha=hash(bytes);if(manifest.artifacts[rel]&&sha!==manifest.artifacts[rel])throw Error('served artifact mismatch '+rel);served[rel]=sha;res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes);}catch(e){report.badResponses.push({url:req.url,error:String(e)});res.writeHead(404).end();}});
let browser,page;
const menu=async name=>page.waitForFunction(name=>__G.game?.menus?.current===name&&performance.now()-__G.game.menus._shownAt>=500,name,{timeout:30000});
async function clickReady(selector,menuName){
 const deadline=Date.now()+30000,remaining=()=>{const t=deadline-Date.now();if(t<=0)throw Error('Native menu click deadline exceeded: '+selector);return t;};
 await page.waitForFunction(rangeMenuControlReady,{selector,menu:menuName},{timeout:remaining()});
 const before=await page.evaluate(selector=>{const m=__G.game.menus,b=document.querySelector(selector);let opacity=1;for(let e=b?.closest('[data-nav]')||b;e&&e!==m._scr.el.parentNode;e=e.parentElement){opacity*=Number(getComputedStyle(e).opacity);if(e===m._scr.el)break;}return {selector,current:m.current,screen:m._scr.name,disabled:b?.disabled,inert:m._scr.el.inert,opacity,rect:b?.getBoundingClientRect().toJSON()};},selector);
 (report.controls||=[]).push(before);save();await page.locator(selector).click({timeout:remaining()});
}
const baseState=()=>page.evaluate(()=>{const G=window.__G,a=G?.local,r=a?.weaponRunner;return {time:G?.time,menu:G?.game?.menus?.current,paused:G?.match?.paused,level:G?.level?.layout?.id,nativeTriangles:!!G?.level?.triangleWorld,weapon:a?.weaponId,pos:a?.pos.toArray(),vel:a?.vel.toArray(),normal:a?.groundN.toArray(),grounded:a?.grounded,rolling:r?.rolling,pending:!!r?.catalogState?.pending,fire:a?.intent.fire,move:a?.intent.move.toArray(),ink:a?.ink,turf:a?.stats.turf,paintVersion:G?.paint?.version,inkAtFeet:a?.ground?.face>=0?G.paint.sampleWorld(a.ground.face,a.pos):null,projectiles:G?.projectiles?.list.length,rollContact:r?.catalogState?.rollPaint?{active:r.catalogState.rollPaint.active,face:r.catalogState.rollPaint.face,to:r.catalogState.rollPaint.to?.toArray()}:null,modelVisible:a?.character?.root.visible,animationForm:a?.anim?.form,motion:a?.character?.sourceMotion?{active:a.character.sourceMotion.active,status:a.character.sourceMotion.status}:null,locked:!!document.pointerLockElement};});
async function collectWeapon(){
 const T=await import(new URL('vendor/three/build/three.module.js',document.baseURI).href),G=__G,a=G.local,c=a.character,w=c.weapon;
 const vector=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),box=new T.Box3().setFromObject(w.pivot),head=new T.Box3().setFromObject(w.parts.head);if(w.parts.headInk)head.union(new T.Box3().setFromObject(w.parts.headInk));
 let vertexNormal=Infinity,surfaceVertical=Infinity,surfaceMisses=0;const probe=vector(),down=vector(0,-1,0),hit={hit:false,dist:0,point:vector(),normal:vector(),block:-1,face:-1};for(const part of [w.parts.head,w.parts.headInk])part.traverse(o=>{const positions=o.geometry?.attributes.position;if(!positions)return;const v=vector();for(let i=0;i<positions.count;i++){v.fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld);probe.set(v.x,Math.max(a.pos.y+2,v.y+.15),v.z);const h=G.physics.raycast(probe,down,4,hit);if(h.hit&&h.normal.y>.7)surfaceVertical=Math.min(surfaceVertical,v.y-h.point.y);else surfaceMisses++;v.sub(a.pos);vertexNormal=Math.min(vertexNormal,v.dot(a.groundN));}});const axis=vector(0,0,1).transformDirection(w.off.matrixWorld),headCorners=[],screen=[];
 for(const x of [0,1])for(const y of [0,1])for(const z of [0,1]){headCorners.push(vector(x?head.max.x:head.min.x,y?head.max.y:head.min.y,z?head.max.z:head.min.z));const v=vector(x?box.max.x:box.min.x,y?box.max.y:box.min.y,z?box.max.z:box.min.z).project(G.camera);screen.push([(v.x+1)*innerWidth/2,(1-v.y)*innerHeight/2]);}
 const x=Math.max(0,Math.floor(Math.min(...screen.map(p=>p[0])))-8),y=Math.max(0,Math.floor(Math.min(...screen.map(p=>p[1])))-8),right=Math.min(innerWidth,Math.ceil(Math.max(...screen.map(p=>p[0])))+8),bottom=Math.min(innerHeight,Math.ceil(Math.max(...screen.map(p=>p[1])))+8);
 const face=G.level.faces[181],samples=face?.n.y>.9&&face.n.y<.999?[-14.75,-14,-13,-12,-11.25].map(z=>{const p=vector(a.pos.x,face.origin.y-(face.n.x*(a.pos.x-face.origin.x)+face.n.z*(z-face.origin.z))/face.n.y,z);return {position:p.toArray(),ink:G.paint.sampleWorld(face.id,p)};}):[];
 return {model:c.weaponModel,modelId:w.def.modelId,modelKind:c.weaponKind,animRolling:a.anim.rolling,wRoll:c.wRoll,heldAxisWorld:axis.toArray(),headVertexMinGroundNormalDistance:vertexNormal,headActualSurfaceVerticalMin:surfaceVertical,headSurfaceMisses:surfaceMisses,headMinGroundNormalDistance:Math.min(...headCorners.map(p=>p.clone().sub(a.pos).dot(a.groundN))),headWorldBounds:{min:head.min.toArray(),max:head.max.toArray()},weaponWorldBounds:{min:box.min.toArray(),max:box.max.toArray()},clip:right>x&&bottom>y?{x,y,width:right-x,height:bottom-y}:null,sourceUpper:c.sourceMotion.sourceUpper,rampProbeFace:face?{id:face.id,normal:face.n.toArray()}:null,rampInk:samples,paintCells:G.paint.grid.reduce((n,v)=>n+(v!==0),0)};
}
const state=async()=>({...await baseState(),weaponVisual:await page.evaluate(collectWeapon)});
async function captureWeapon(name){const snapshot=await state();(report.weaponCaptures||=[]).push({name,state:snapshot});save();if(snapshot.weaponVisual.clip){await page.screenshot({path:path.join(out,name+'.png'),clip:snapshot.weaponVisual.clip,timeout:20000});report.captures.push(name+'.png');step('weapon capture',{name});}}

async function capture(name){try{await page.screenshot({path:path.join(out,name+'.png'),timeout:20000});report.captures.push(name+'.png');step('capture',{name});}catch(error){step('capture unavailable',{name,error:String(error)});}}
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));report.base='http://127.0.0.1:'+server.address().port+'/';
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});report.browser=browser.version();
 page=await browser.newPage({viewport:{width:480,height:270}});
 page.on('pageerror',e=>report.errors.push(String(e)));page.on('requestfailed',r=>report.requestFailures.push({url:r.url(),error:r.failure()?.errorText}));
 await page.addInitScript(()=>{window.brushAcceptance={events:[],samples:[],record:false};for(const type of ['keydown','keyup','pointerdown','mousedown','mouseup','click','pointerlockchange','pointerlockerror'])window.addEventListener(type,e=>{if(brushAcceptance.events.length>=180)return;const row={type,code:e.code,button:e.button,trusted:e.isTrusted,time:performance.now(),locked:!!document.pointerLockElement,target:e.target?.closest?.('[data-id]')?.dataset.id,x:e.clientX,y:e.clientY};brushAcceptance.events.push(row);if(type==='click')setTimeout(()=>{row.defaultPrevented=e.defaultPrevented;row.newsClosing=!!window.__G?.game?.menus?._news?.el?._closing;},0);},{capture:true});});
 await page.goto(report.base,{waitUntil:'domcontentloaded'});step('browser opened');
 await page.waitForFunction(()=>window.__G?.game?.menus?.current==='title',null,{timeout:240000});step('title ready');
 await page.waitForFunction(()=>performance.now()-__G.game.menus._shownAt>=450,null,{timeout:15000});await page.keyboard.press('Enter');await menu('main');step('main menu entered through normal Enter');
 await page.locator('[data-id="news-skip"]').waitFor({state:'visible',timeout:20000});await clickReady('[data-id="news-skip"]','main');await page.locator('.iw-news[role="dialog"]').waitFor({state:'hidden',timeout:25000});step('news dismissed through normal Skip');
 await clickReady('[data-id="settings"]','main');await menu('settings');step('settings open');await clickReady('[data-id="tab-video"]','settings');
 await page.waitForFunction(rangeMenuControlReady,{selector:'[data-id="set-quality"]',menu:'settings'},{timeout:15000});await page.locator('[data-id="set-quality"] .iw-seg__opt').nth(0).click();await page.waitForFunction(()=>__G.settings.quality==='low');await page.setViewportSize({width:960,height:540});
 await page.keyboard.press('Escape');await menu('main');
 await clickReady('[data-id="loadout"]','main');await menu('loadout');step('loadout open');
 await clickReady('[data-id="w-s3-brush-mini"]','loadout');
 step('Brush selected through loadout');
 await page.keyboard.press('Escape');await menu('main');await clickReady('[data-id="play"]','main');await menu('mode');
 await clickReady('[data-id="mode-range"]','mode');await page.waitForFunction(()=>__G.level?.layout?.id==='range'&&__G.match?.state==='playing',null,{timeout:90000});step('range active',await state());
 await page.keyboard.press('Escape');await page.waitForFunction(()=>__G.match.paused&&__G.game.menus.current,null,{timeout:20000});
 await clickReady('[data-id="resume"]','pause');await page.waitForFunction(()=>!!document.pointerLockElement,null,{timeout:15000});step('normal resume acquired pointer lock');
 await page.evaluate(()=>{brushAcceptance.record=true;const sample=()=>{if(!brushAcceptance.record)return;const G=__G,a=G.local,r=a.weaponRunner;if(brushAcceptance.samples.length<600)brushAcceptance.samples.push({wall:performance.now(),time:G.time,pos:a.pos.toArray(),vel:a.vel.toArray(),normal:a.groundN.toArray(),grounded:a.grounded,fire:a.intent.fire,move:a.intent.move.toArray(),rolling:r.rolling,pending:!!r.catalogState?.pending,projectiles:G.projectiles.list.length,rollContact:r.catalogState?.rollPaint?{active:r.catalogState.rollPaint.active,face:r.catalogState.rollPaint.face,to:r.catalogState.rollPaint.to?.toArray()}:null,ink:a.ink,turf:a.stats.turf,paintVersion:G.paint.version,inkAtFeet:a.ground.face>=0?G.paint.sampleWorld(a.ground.face,a.pos):null,animationForm:a.anim?.form,modelVisible:a.character.root.visible,rootMatrix:Array.from(a.character.root.matrixWorld.elements)});requestAnimationFrame(sample);};requestAnimationFrame(sample);});
 await captureWeapon('weapon-idle-carry');
 await page.mouse.down({button:'left'});await page.waitForFunction(()=>__G.local.intent.fire&&__G.local.weaponRunner.rolling&&__G.local.character.wRoll>.995,null,{timeout:30000});
 await page.waitForFunction(()=>__G.projectiles.list.length===0,null,{timeout:20000});report.beforeReset=await state();await captureWeapon('weapon-held-before-reset');await page.keyboard.press('KeyR');await page.waitForFunction(()=>__G.local.stats.turf===0&&__G.local.weaponRunner.rolling&&__G.projectiles.list.length===0&&!__G.paint.grid.some(x=>x),null,{timeout:20000});report.before=await state();step('normal R reset left untouched ramp while Brush held',report.before);if(report.before.weaponVisual.rampInk.length!==5||report.before.weaponVisual.rampInk.some(x=>x.ink!==0))throw Error('Ramp is not verified fresh');
 await page.keyboard.down('KeyW');try{await page.waitForFunction(()=>__G.local.pos.z>-14.9,null,{timeout:30000});}finally{await page.keyboard.up('KeyW');}
 report.mid=await state();step('downhill middle',report.mid);report.observations=await page.evaluate(()=>brushAcceptance);save();await capture('brush-downhill-mid');await captureWeapon('weapon-held-downhill-mid');
 await page.keyboard.down('KeyW');try{await page.waitForFunction(()=>__G.local.pos.z>-10.5&&__G.local.pos.y<.02,null,{timeout:30000});}finally{await page.keyboard.up('KeyW');}
 report.end=await state();step('downhill end',report.end);report.observations=await page.evaluate(()=>brushAcceptance);save();await capture('brush-downhill-end');await captureWeapon('weapon-held-downhill-end');
 await page.mouse.up({button:'left'});await page.evaluate(()=>brushAcceptance.record=false);report.observations=await page.evaluate(()=>brushAcceptance);
 report.status=report.end.rolling&&report.end.grounded&&report.end.turf>report.before.turf?'observed ordinary-terrain Brush downhill painting':'incomplete';
}catch(error){report.status='blocked or failed';report.failure=String(error);step('stopped',{error:String(error)});}
finally{
 if(page&&!page.isClosed()){
  try{await page.keyboard.up('KeyW');await page.mouse.up({button:'left'});report.finalState=await state();report.observations=await page.evaluate(()=>{if(window.brushAcceptance)brushAcceptance.record=false;return window.brushAcceptance;});}catch(error){report.finalReadError=String(error);}
 }
 if(browser){await browser.close();report.browserClosed=true;}
 await new Promise(r=>server.close(r));report.serverClosed=true;report.served=served;save();console.log(JSON.stringify({status:report.status,browserClosed:report.browserClosed,serverClosed:report.serverClosed,receipt:path.join(out,'receipt.json')}));
}
