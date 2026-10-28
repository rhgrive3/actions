// Diagnostic only: observe the pinned production helper's ordinary menu route.
// Never substitute input, mutate live game state, or treat this as acceptance.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Do not pass Chromium security-bypass or unsafe renderer flags. If secure
// Chromium cannot start or render WebGL, preserve that failure as evidence.
export const secureLaunchOptions = Object.freeze({headless:true,chromiumSandbox:true,viewport:{width:1280,height:720},serviceWorkers:'block'});

// Called only for this owned capture page. Read-only: no focus, scrolling or input.
export function menuSnapshot() {
  const root=document.querySelector('.iw-modesel'),row=root?.querySelector('.iw-modesel__row');
  const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  const style=e=>{if(!e)return null;const s=getComputedStyle(e);return {display:s.display,visibility:s.visibility,opacity:s.opacity,position:s.position,overflowX:s.overflowX,overflowY:s.overflowY,gridTemplateColumns:s.gridTemplateColumns,gridTemplateRows:s.gridTemplateRows,minHeight:s.minHeight,height:s.height,width:s.width,transform:s.transform,scale:s.scale,translate:s.translate,zIndex:s.zIndex,pointerEvents:s.pointerEvents,animationName:s.animationName,animationPlayState:s.animationPlayState};};
  const describe=e=>e?{tag:e.tagName,id:e.id||null,dataId:e.dataset?.id||null,classes:e.getAttribute('class'),inert:'inert' in e?e.inert:null,rect:rect(e),clientRects:[...e.getClientRects()].map(r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height})),style:style(e)}:null;
  const cards=[...(row?.querySelectorAll('.iw-mode')||[])],turf=cards.find(e=>e.dataset.id==='mode-turf');
  const b=rect(turf),left=Math.max(0,b?.left??0),top=Math.max(0,b?.top??0),right=Math.min(innerWidth,b?.right??0),bottom=Math.min(innerHeight,b?.bottom??0);
  const point=b&&right>left&&bottom>top?{x:(left+right)/2,y:(top+bottom)/2}:null;
  return {at:new Date().toISOString(),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},media:{coarse:matchMedia('(pointer: coarse)').matches,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,maxTouchPoints:navigator.maxTouchPoints},htmlClasses:document.documentElement.className,uiClasses:document.querySelector('.iw-ui')?.className??null,screen:window.__inkwave?.menus?.current??null,screenName:window.__inkwave?.menus?._scr?.name??null,focus:window.__inkwave?.menus?._focus?.dataset?.id??null,selected:root?.dataset?.mode??null,ui:describe(document.querySelector('.iw-ui')),layer:describe(root?.parentElement),root:describe(root),row:{...describe(row),scrollTop:row?.scrollTop??null,scrollLeft:row?.scrollLeft??null,clientHeight:row?.clientHeight??null,scrollHeight:row?.scrollHeight??null},cards:cards.map(describe),point,pointMethod:'estimated viewport-clipped bounding-box center, not Playwright clickable-quad center',hitStack:point?document.elementsFromPoint(point.x,point.y).slice(0,12).map(describe):[]};
}
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const gitHead=cwd=>execFileSync('git',['rev-parse','HEAD'],{cwd,encoding:'utf8'}).trim();
async function main() {
  const source=path.resolve(process.env.GAME_SOURCE||'game'),site=path.resolve(process.env.MENU_SITE||''),evidence=path.resolve(process.env.MENU_EVIDENCE||'');
  if(!process.env.MENU_SITE||!process.env.MENU_EVIDENCE) throw Error('MENU_SITE and MENU_EVIDENCE required');
  fs.mkdirSync(evidence,{recursive:true});
  const report={schema:1,kind:'diagnostic-only-not-acceptance',sourceHead:gitHead(source),probeHead:gitHead(process.cwd()),probeSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),events:[],snapshots:[],observerErrors:[],startedAt:new Date().toISOString()};
  report.launch={runnerOs:process.env.RUNNER_OS??null,runnerImageOs:process.env.ImageOS??null,workflowRunner:'ubuntu-22.04',options:secureLaunchOptions,explicitArgs:[],interpretation:'Diagnostic only: secure sandboxed fresh context omits capture harness settings/RNG bootstrap; not gameplay or acceptance testing.'};
  let server,browser,persistent,context,page,originalError,profile;
  try {
    if(report.sourceHead!==process.env.EXPECTED_SOURCE) throw Error('unexpected source head');
    if(process.env.GITHUB_SHA && report.probeHead!==process.env.GITHUB_SHA) throw Error('unexpected diagnostic head');
    const helper=path.join(source,'scripts/lib/inkwave-projectile-menu-start.mjs');
    report.helperSha256=hash(fs.readFileSync(helper));
    report.workflowSha256=hash(fs.readFileSync(path.join(process.cwd(),'.github/workflows/inkwave-touch-layout-diagnostic.yml')));
    if(execFileSync('git',['status','--porcelain'],{cwd:source,encoding:'utf8'}).trim())throw Error('game checkout is not clean');
    const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
    if(hash(JSON.stringify(manifest.files))!==manifest.inputHash)throw Error('manifest input hash mismatch');
    if(hash(JSON.stringify(manifest.artifacts))!==manifest.contentHash)throw Error('manifest content hash mismatch');
    for(const [name,expected] of Object.entries(manifest.artifacts))if(hash(fs.readFileSync(path.join(site,name)))!==expected)throw Error('built artifact mismatch: '+name);
    report.build={inputHash:manifest.inputHash,contentHash:manifest.contentHash,revision:manifest.build?.revision};
    const {serveProjectileCaptureFile}=await import(pathToFileURL(path.join(source,'scripts/lib/inkwave-projectile-http-file.mjs')).href);
    const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.glb':'model/gltf-binary','.bin':'application/octet-stream'};
    server=http.createServer((req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname),rel=pathname==='/'?'index.html':pathname.replace(/^\/+/,''),file=path.resolve(site,rel);if(file!==site&&!file.startsWith(site+path.sep))throw Error('outside site');if(!fs.statSync(file).isFile())throw Error('not file');serveProjectileCaptureFile(req,res,file,mime);}catch{res.writeHead(404);res.end('Not found');}});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=`http://127.0.0.1:${server.address().port}/`;
    const {chromium}=createRequire(import.meta.url)('playwright');
    profile=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-menu-profile-'));
    persistent=await chromium.launchPersistentContext(profile,secureLaunchOptions);
    browser=persistent.browser();
    const cases={landscape:{width:844,height:390,touch:true,dpr:3},portrait:{width:390,height:844,touch:true,dpr:3},desktop:{width:1280,height:720,touch:false,dpr:1}};
    const dimensions=cases[process.env.MENU_CASE];if(!dimensions)throw Error('invalid MENU_CASE');
    context=await browser.newContext({viewport:{width:dimensions.width,height:dimensions.height},deviceScaleFactor:dimensions.dpr,isMobile:dimensions.touch,hasTouch:dimensions.touch,serviceWorkers:'block',reducedMotion:'reduce'});
    page=await context.newPage();page.setDefaultTimeout(30000);
    // Same native URL and phase budget; do not inject settings, RNG, input or game state.
    await page.goto(address+'?map=tidewater&difficulty=normal&skipTitle',{waitUntil:'domcontentloaded',timeout:60000});
    const started=Date.now(),deadline=started+180000;report.phaseStartedAtMs=started;report.phaseDeadlineAtMs=deadline;
    report.environment=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,coarse:matchMedia('(pointer: coarse)').matches,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,maxTouchPoints:navigator.maxTouchPoints}));
    const env=report.environment;
    if(env.width!==dimensions.width||env.height!==dimensions.height||env.dpr!==dimensions.dpr||env.coarse!==dimensions.touch||!env.reduced||(env.maxTouchPoints>0)!==dimensions.touch)throw Error('viewport/input environment not admitted');
    const waitForPhase=async(predicate,label)=>{let lastFailure=null;while(Date.now()<deadline){let timer;try{const v=await Promise.race([page.evaluate(predicate),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('native phase evaluation budget exceeded')),Math.max(1,deadline-Date.now()));})]);if(v&&Date.now()<=deadline)return;}catch(error){lastFailure=String(error);if(page.isClosed())break;}finally{clearTimeout(timer);}const left=deadline-Date.now();if(left>0)await new Promise(resolve=>setTimeout(resolve,Math.min(250,left)));}throw Error(label+' did not meet the native menu phase within 180000ms'+(lastFailure?': '+lastFailure:''));};
    const observe=async stage=>{const began=Date.now();try{let timer;try{const data=await Promise.race([page.evaluate(menuSnapshot),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('snapshot timed out')),5000);})]);report.snapshots.push({stage,elapsedMs:Date.now()-began,data});
      try { await page.screenshot({path:path.join(evidence,stage+'.png'),timeout:8000}); } catch(error) { report.observerErrors.push({stage:stage+'-screenshot',error:String(error)}); }}finally{clearTimeout(timer);}}catch(error){report.observerErrors.push({stage,error:String(error),elapsedMs:Date.now()-began});}};
    const activate=async locator=> dimensions.touch ? locator.tap({timeout:15000}) : locator.click({timeout:15000});
    await waitForPhase(()=>{const g=window.__inkwave,G=window.__G;return !!(g?.debug&&Number.isFinite(g.bootMs)&&G?.mode==='menu'&&g.match?.attract&&g.menus?.current==='main'&&g.menus?._scr?.name==='main');},'native main menu readiness');
    await activate(page.locator('.iw-main [data-id="play"]'));
    await waitForPhase(()=>window.__inkwave?.menus?.current==='mode','native mode menu');
    await page.mouse.move(1,1);
    await observe('before-tap');
    report.cardHits=[];
    const ids=['turf','zones','tower','rainmaker','clams','boss','range'];
    for(const id of ids) {
      const card=page.locator(`.iw-modesel [data-id="mode-${id}"]`);
      await card.scrollIntoViewIfNeeded({timeout:15000});
      const hit=await card.evaluate(el=>{const r=el.getBoundingClientRect(),row=el.closest('.iw-modesel__row').getBoundingClientRect(),x=(Math.max(r.left,row.left,0)+Math.min(r.right,row.right,innerWidth))/2,y=(Math.max(r.top,row.top,0)+Math.min(r.bottom,row.bottom,innerHeight))/2; const stack=document.elementsFromPoint(x,y).map(e=>e.closest('[data-id]')?.dataset.id||e.className||e.tagName);return {id:el.dataset.id,rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom},point:{x,y},stack,hit:document.elementFromPoint(x,y)?.closest('[data-id]')?.dataset.id||null};});
      report.cardHits.push(hit);
    }
    const turf=page.locator('.iw-modesel [data-id="mode-turf"]');
    await turf.scrollIntoViewIfNeeded({timeout:15000});
    await observe('turf-after-scroll');
    await activate(turf);
    await waitForPhase(()=>window.__inkwave?.menus?.current==='setup','native setup menu');
    report.events.push({event:'setup-after-turf',at:new Date().toISOString()});
    await observe('setup');
    await activate(page.locator('.iw-setup .iw-backbtn'));
    await waitForPhase(()=>window.__inkwave?.menus?.current==='mode','native return to mode');
    report.events.push({event:'returned-to-mode',at:new Date().toISOString()});
    await turf.scrollIntoViewIfNeeded({timeout:15000});
    await activate(turf);
    await waitForPhase(()=>window.__inkwave?.menus?.current==='setup','native setup after revisit');
    report.events.push({event:'setup-after-revisit',at:new Date().toISOString()});
    if(process.env.MENU_SIDE==='after' && report.cardHits.some(v=>v.hit!==v.id))throw Error('one or more mode-card center hit tests failed');
    report.routeOutcome='native-menu-completed';
  }catch(error){originalError=error;report.routeOutcome='failed';report.error=String(error?.stack||error);}
  finally {
    if(page&&!page.isClosed())try{await page.screenshot({path:path.join(evidence,'menu-final.png'),timeout:10000});}catch(error){report.observerErrors.push({stage:'final-screenshot',error:String(error)});}
    for(const resource of [context,persistent,browser])try{await resource?.close();}catch(error){report.observerErrors.push({stage:'cleanup',error:String(error)});}
    if(server)await new Promise(resolve=>server.close(resolve));
    if(profile)try{fs.rmSync(profile,{recursive:true,force:true});}catch(error){report.observerErrors.push({stage:'profile-cleanup',error:String(error)});}
    report.side=process.env.MENU_SIDE;report.case=process.env.MENU_CASE;report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(evidence,'menu-diagnostic.json'),JSON.stringify(report,null,2)+'\n');
  }
  if(originalError)throw originalError;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{console.error(error);process.exitCode=1;});
