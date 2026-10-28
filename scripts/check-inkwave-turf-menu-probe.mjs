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

const TURF = '.iw-modesel [data-id="mode-turf"]';
// Do not pass Chromium security-bypass or unsafe renderer flags. If secure
// Chromium cannot start or render WebGL, preserve that failure as evidence.
export const secureLaunchOptions = Object.freeze({headless:true,chromiumSandbox:true,viewport:{width:1280,height:720},serviceWorkers:'block'});
export function instrumentMenuPage(page, observe, onObserverError=()=>{}) {
  const record=async stage=>{try{await observe(stage);}catch(error){try{onObserverError(stage,error);}catch{}}};
  // Record before helper computes the remaining tap budget, so observation
  // can consume time but cannot extend the original 180-second deadline.
  return {
    mouse:{async move(...args) { await page.mouse.move(...args); await record('before-tap'); }},
    evaluate:(...args)=>page.evaluate(...args),
    locator(selector) {
      const target=page.locator(selector);
      if(selector!==TURF) return target;
      return {async tap(options) {
        try { await target.tap(options); }
        catch(error) { await record('tap-failed'); throw error; }
        await record('tap-succeeded');
      }};
    },
  };
}

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
  report.launch={runnerOs:process.env.RUNNER_OS??null,runnerImageOs:process.env.ImageOS??null,workflowRunner:'ubuntu-22.04',options:secureLaunchOptions,explicitArgs:[],interpretation:'Secure sandboxed runner/config differs from failed 897 capture; fresh context omits capture harness settings/RNG bootstrap. Non-reproduction cannot clear that earlier failure.'};
  let server,browser,persistent,context,page,originalError,profile;
  try {
    if(report.sourceHead!=='897bbaa4550aae24c1d710216127ff5e52a64ad6') throw Error('unexpected source head');
    if(process.env.GITHUB_SHA && report.probeHead!==process.env.GITHUB_SHA) throw Error('unexpected diagnostic head');
    const helper=path.join(source,'scripts/lib/inkwave-projectile-menu-start.mjs');
    report.helperSha256=hash(fs.readFileSync(helper));
    report.workflowSha256=hash(fs.readFileSync(path.join(process.cwd(),'.github/workflows/inkwave-menu-probe-diagnostic.yml')));
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
    browser=persistent.browser();context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});
    page=await context.newPage();page.setDefaultTimeout(30000);
    // Same native URL and phase budget; do not inject settings, RNG, input or game state.
    await page.goto(address+'?map=tidewater&difficulty=normal&skipTitle',{waitUntil:'domcontentloaded',timeout:60000});
    const started=Date.now(),deadline=started+180000;report.phaseStartedAtMs=started;report.phaseDeadlineAtMs=deadline;
    report.environment=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,coarse:matchMedia('(pointer: coarse)').matches,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,maxTouchPoints:navigator.maxTouchPoints}));
    const env=report.environment;
    if(env.width!==844||env.height!==390||env.dpr!==3||!env.coarse||!env.reduced||!(env.maxTouchPoints>0))throw Error('mobile touch/reduced-motion environment not admitted');
    const waitForPhase=async(predicate,label)=>{let lastFailure=null;while(Date.now()<deadline){let timer;try{const v=await Promise.race([page.evaluate(predicate),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('native phase evaluation budget exceeded')),Math.max(1,deadline-Date.now()));})]);if(v&&Date.now()<=deadline)return;}catch(error){lastFailure=String(error);if(page.isClosed())break;}finally{clearTimeout(timer);}const left=deadline-Date.now();if(left>0)await new Promise(resolve=>setTimeout(resolve,Math.min(250,left)));}throw Error(label+' did not meet the native menu phase within 180000ms'+(lastFailure?': '+lastFailure:''));};
    const observe=async stage=>{const began=Date.now();try{let timer;try{const data=await Promise.race([page.evaluate(menuSnapshot),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('snapshot timed out')),5000);})]);report.snapshots.push({stage,elapsedMs:Date.now()-began,data});
      try { await page.screenshot({path:path.join(evidence,stage+'.png'),timeout:8000}); } catch(error) { report.observerErrors.push({stage:stage+'-screenshot',error:String(error)}); }}finally{clearTimeout(timer);}}catch(error){report.observerErrors.push({stage,error:String(error),elapsedMs:Date.now()-began});}};
    const {startProjectileThroughMenu}=await import(pathToFileURL(helper).href);
    const menu=instrumentMenuPage(page,observe,(stage,error)=>report.observerErrors.push({stage,error:String(error)}));
    report.bootstrapNote='Fresh context without capture harness settings/RNG init; real native bootstrap and helper unchanged.';
    await startProjectileThroughMenu(menu,{waitForPhase,remainingMs:()=>deadline-Date.now(),receipt:report.events});
    report.routeOutcome='native-menu-completed';
  }catch(error){originalError=error;report.routeOutcome='failed';report.error=String(error?.stack||error);}
  finally {
    if(page&&!page.isClosed())try{await page.screenshot({path:path.join(evidence,'menu-final.png'),timeout:10000});}catch(error){report.observerErrors.push({stage:'final-screenshot',error:String(error)});}
    for(const resource of [context,persistent,browser])try{await resource?.close();}catch(error){report.observerErrors.push({stage:'cleanup',error:String(error)});}
    if(server)await new Promise(resolve=>server.close(resolve));
    if(profile)try{fs.rmSync(profile,{recursive:true,force:true});}catch(error){report.observerErrors.push({stage:'profile-cleanup',error:String(error)});}
    report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(evidence,'menu-diagnostic.json'),JSON.stringify(report,null,2)+'\n');
  }
  if(originalError)throw originalError;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{console.error(error);process.exitCode=1;});
