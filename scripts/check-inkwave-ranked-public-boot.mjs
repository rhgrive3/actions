#!/usr/bin/env node
// Three independent public-deployment boots. No reload, retry, response
// substitution, game mutation or full Ranked gameplay acceptance is implied.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {observeRankedBoot,criticalBootRequest} from './lib/ranked-boot-diagnostics.mjs';
import {publicBuildIdentity,verifyPublishedSource,verifyPublicResponse} from './lib/inkwave-public-boot-evidence.mjs';
const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const root=path.resolve(new URL('../',import.meta.url).pathname);
const url=option('--url','https://rhgrive3.github.io/actions/');
assert.equal(new URL(url).origin,'https://rhgrive3.github.io');
const sourceSha=option('--source-sha','');
const manifestFile=path.resolve(option('--manifest',''));
const expected=JSON.parse(fs.readFileSync(manifestFile));
const identity=publicBuildIdentity(expected),source=verifyPublishedSource(expected,root,sourceSha);
const repeats=Number(option('--repeats','3'));
assert(Number.isInteger(repeats)&&repeats>=3&&repeats<=10,'Use 3..10 independent boots');
const out=path.resolve(option('--evidence-dir',''));
assert(out.startsWith(root+path.sep),'Persistent repository-owned evidence directory required');
fs.mkdirSync(out,{recursive:true});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const result={status:'running',...source,...identity,url,repeats,attempts:[],physicalDeviceVerified:false,
  scope:'independent public deployment boot only; no full Ranked gameplay, device performance or latest-main acceptance',
  responseByteScope:'HTML and JavaScript critical boot responses; optional media/source-bank bodies are not inspector-attested',
  manifestChecks:[],errors:[]};
let browser;
const checkManifest=async(label)=>{
  const response=await fetch(new URL('inkwave-build.json?bootEvidence='+Date.now(),url),{signal:AbortSignal.timeout(15000)});
  assert(response.ok,'Public manifest HTTP '+response.status);
  const actual=publicBuildIdentity(await response.json());
  assert.deepEqual(actual,identity,'Published deployment changed during independent boot acceptance');
  result.manifestChecks.push({label,at:new Date().toISOString(),...actual});
};
try{
  await checkManifest('before');
  browser=await chromium.launch({headless:true,channel:'chromium',
    args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
    ...(process.env.HTTPS_PROXY||process.env.HTTP_PROXY?{proxy:{server:process.env.HTTPS_PROXY||process.env.HTTP_PROXY}}:{})});
  result.browserVersion=browser.version();
  for(let i=0;i<repeats;i++){
    await checkManifest('before-'+(i+1));
    const context=await browser.newContext({viewport:{width:1280,height:800}});
    const attempt={repeat:i+1,...identity,sourceSha,status:'starting',freshContext:true,artifacts:[],errors:[]};
    result.attempts.push(attempt);
    try{
      await context.tracing.start({screenshots:false,snapshots:false,sources:false});
      const page=await context.newPage(),pending=new Set();
      const cdp=await context.newCDPSession(page);
      await cdp.send('Network.enable',{maxTotalBufferSize:32*1024*1024,maxResourceBufferSize:4*1024*1024});
      page.on('pageerror',error=>attempt.errors.push(error.message));
      page.on('response',response=>{
        if(!response.ok()||!criticalBootRequest(response.url(),response.request().resourceType(),url))return;
        const operation=(async()=>{
          const u=new URL(response.url()),base=new URL(url),rel=u.pathname.slice(new URL('.',base).pathname.length)||'index.html';
          if(u.origin!==base.origin)return;
          assert(Object.hasOwn(expected.artifacts,rel),'Undeclared public boot document/script: '+rel);
          const receipt=verifyPublicResponse(response.url(),await response.body(),expected,url);
          if(receipt)attempt.artifacts.push(receipt);
        })().catch(error=>attempt.errors.push(error.message)).finally(()=>pending.delete(operation));
        pending.add(operation);
      });
      await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true})));
      await observeRankedBoot(page,url,attempt,async()=>{
        await page.goto(url,{waitUntil:'domcontentloaded'});
        await page.evaluate(async()=>{globalThis.RG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
      });
      await Promise.all([...pending]);
      assert.equal(attempt.errors.length,0,'Public errors or response integrity failures');
      assert(attempt.artifacts.some(row=>row.file==='index.html'),'No verified public HTML response');
      assert(attempt.artifacts.some(row=>row.file.endsWith('/src/core/ctx.js')),'No verified published game context module');
      attempt.ready=await page.evaluate(()=>({mode:RG.mode,installed:!!RG.s3?.installed,menus:!!RG.game?.menus,
        menu:RG.game?.menus?.current,baseURI:document.baseURI,startup:globalThis.__inkwaveStartup?.snapshot?.()||null}));
      await checkManifest('after-'+(i+1));
      console.log(JSON.stringify({repeat:i+1,status:attempt.status,artifacts:attempt.artifacts.length}));
    }finally{
      await context.tracing.stop({path:path.join(out,'public-boot-'+(i+1)+'.zip')}).catch(error=>attempt.errors.push('trace: '+error.message));
      await context.close();
    }
  }
  await checkManifest('after');
  assert(result.attempts.length===repeats&&result.attempts.every(row=>row.status==='ready'&&!row.errors.length));
  result.status='passed';
}catch(error){result.status='failed';result.error=String(error.stack||error);process.exitCode=1;}
finally{
  await browser?.close();
  fs.writeFileSync(path.join(out,'public-boot-result.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,sourceSha,attempts:result.attempts.map(row=>({repeat:row.repeat,status:row.status,errors:row.errors})),error:result.error||null}));
}
