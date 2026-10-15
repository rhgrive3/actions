import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import{execFileSync}from'node:child_process';import{chromium}from'playwright';
import{makeSite,resolveRequest,pins,sha256,observePage,assertNoErrors}from'./binding.mjs';import{probeWorldCancellation}from'./probe.mjs';import{validate as validateResults,cases as scenarios}from'./gate.mjs';
const [root,output]=process.argv.slice(2);assert.ok(root&&output);const plan=JSON.parse(fs.readFileSync(new URL('./plan.json',import.meta.url)));
assert.match(plan.sourceHead||'',/^[a-f0-9]{40}$/);assert.match(plan.sourceTree||'',/^[a-f0-9]{40}$/);
assert.equal(execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),plan.sourceHead);
assert.equal(execFileSync('git',['-C',root,'rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),plan.sourceTree);
assert.equal(execFileSync('git',['-C',root,'status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim(),'');
const input={candidate:fs.readFileSync(path.join(root,'patches/native-stages/runtime/native-world.mjs')),baseline:fs.readFileSync(new URL('./baseline.mjs',import.meta.url)),fixture:fs.readFileSync(new URL('./fixture.mjs',import.meta.url)),three:fs.readFileSync(path.join(root,'inkwave-public/vendor/three/build/three.module.js')),threeCore:fs.readFileSync(path.join(root,'inkwave-public/vendor/three/build/three.core.js'))};
const site=makeSite(input),served=new Map(),unknown=[];fs.mkdirSync(path.dirname(output),{recursive:true});
const server=http.createServer((req,res)=>{try{const b=resolveRequest(site,req.url);served.set(req.url,{sha256:sha256(b),bytes:b.length});res.writeHead(200,{'content-type':req.url==='/'?'text/html':req.url==='/manifest.json'?'application/json':'text/javascript','cache-control':'no-store'});res.end(b);}catch(e){unknown.push(req.url);res.writeHead(404);res.end('denied');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,rows=[],pageErrors=[];let browser,active,primaryError;
const bounded=async(promise)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('30s browser case deadline')),30000);})]);}finally{clearTimeout(timer);}};
const save=status=>fs.writeFileSync(output,JSON.stringify({status,sourceHead:plan.sourceHead,sourceTree:plan.sourceTree,sourceSHA256:pins,manifest:site.manifest,browserVersion:browser?.version(),active,rows,pageErrors,served:Object.fromEntries(served),unknown,scope:plan.scope,error:primaryError?String(primaryError.stack||primaryError):undefined},null,2)+'\n');
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const variant of ['baseline','candidate'])for(const scenario of scenarios){
  active={variant,scenario};const casePageErrors=[];pageErrors.push({variant,scenario,errors:casePageErrors});const context=await browser.newContext();let caseError;
  try{
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin&&site.resources.has(u.pathname)&&!u.search&&!u.hash)return route.continue();unknown.push(u.href);return route.abort();});
   await context.routeWebSocket('**/*',route=>{unknown.push('WebSocket');route.close();});
   const page=await context.newPage();observePage(page,casePageErrors);await page.goto(origin,{waitUntil:'load'});
   const r=await bounded(page.evaluate(async({code,args})=>{try{return{ok:true,result:await (0,eval)('('+code+')')(args)};}catch(e){return{ok:false,error:String(e.stack||e),partial:e.capturePartial||null};}},{code:probeWorldCancellation.toString(),args:{variant,scenario,worldURL:site.prefix+variant+'/patches/native-stages/runtime/native-world.mjs',fixtureURL:site.prefix+'fixture.mjs',threeURL:site.prefix+'vendor/three.module.js'}}));
   if(r.ok){r.result.pageErrors=casePageErrors;rows.push(r.result);}else{rows.push({variant,scenario,failed:true,partial:r.partial,error:r.error});throw Error(r.error);}
   assertNoErrors(casePageErrors);save('running');
  }catch(e){caseError=e;primaryError=e;save('failed');}finally{try{await context.close();}catch(e){if(!caseError)caseError=e;else caseError=new AggregateError([caseError,e],'Case and context cleanup failed',{cause:caseError});}}
  if(caseError)throw caseError;
  assertNoErrors(casePageErrors);
 }
 validateResults(rows);assert.deepEqual(unknown,[],'No unexpected fetches');
 for(const file of Object.keys(site.manifest.artifacts))assert.ok(served.has(site.prefix+file),'All source/stub/Three resources served: '+file);
}catch(e){primaryError=e;}finally{
 if(browser)try{await browser.close();}catch(e){primaryError=primaryError?new AggregateError([primaryError,e],'Acceptance and browser cleanup failed',{cause:primaryError}):e;}
 await new Promise(r=>server.close(r));save(primaryError?'failed':'passed');
}
if(primaryError)throw primaryError;
