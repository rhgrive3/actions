import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from '../../patches/loading-cache/vendor/acorn.mjs';
import * as driver from '../check-inkwave-wiper-native-acceptance.mjs';
import {closeWiperCaptureOwners,launchSandboxBrowser} from '../lib/inkwave-sandbox-browser.mjs';
import {hash} from '../lib/inkwave-runtime-evidence.mjs';
import {wiperBuildReceiptBinding} from '../lib/inkwave-wiper-acceptance-contract.mjs';

const states=label=>[{present:false,label:'return'},...[
  ['null',null],['undefined',undefined],['zero',0],['false',false],['empty',''],['Error',new Error(label)],
].map(([label,value])=>({present:true,label,value}))];
async function settle(run){try{return{thrown:false,value:await run()};}catch(value){return{thrown:true,value};}}
function same(actual,state){assert.equal(actual.thrown,state.present,String(actual.value?.stack??actual.value));if(state.present)assert.equal(actual.value,state.value);}

test('context cleanup distinguishes all thrown falsy values from no failure, preserving primary then close then save',async t=>{
  let count=0;
  for(const primary of states('primary'))for(const close of states('close'))for(const save of states('save')){
    const errors=[],row={contextClosed:false};let closes=0,saves=0;
    const outcome=await settle(async()=>{
      let value,present=false;
      try{if(primary.present)throw primary.value;}
      catch(error){value=error;present=true;throw error;}
      finally{await driver.finishWiperContext({async close(){closes++;if(close.present)throw close.value;}},row,()=>{saves++;if(save.present)throw save.value;},errors,value,present);}
    });
    same(outcome,primary.present?primary:close.present?close:save);
    assert.equal(closes,1);assert.equal(saves,1);assert.equal(row.contextClosed,!close.present);
    assert.equal(errors.length,Number(close.present)+Number(save.present));count++;
  }
  t.diagnostic('343 scalar states; no browser/context object beyond close()');
  assert.equal(count,343);
});

test('legacy cleanup arities, two-argument owner return shape and five-argument truthy-primary convention remain',async()=>{
  assert.equal(driver.finishWiperContext.length,5);assert.equal(closeWiperCaptureOwners.length,2);
  const primary=new Error('legacy primary'),cleanup=new Error('legacy cleanup'),errors=[];
  await assert.doesNotReject(()=>driver.finishWiperContext({async close(){throw cleanup;}},{},()=>{},errors,primary));
  const none=await closeWiperCaptureOwners({},[]);assert.deepEqual(none,{browserClosed:false,serverClosed:false});
  const close=()=>{throw cleanup;};
  assert.deepEqual(await closeWiperCaptureOwners({browser:{close},server:{listening:true,close:cb=>cb()}},[]),{browserClosed:false,serverClosed:true});
});

test('both owner cleanups are attempted before raw diagnostics, with unchanged legacy shape and raw failure order',async t=>{
  let count=0;
  for(const browser of states('browser'))for(const server of states('server')){
    const order=[],errors=[],raw=[];
    const result=await closeWiperCaptureOwners({browser:{async close(){order.push('browser');if(browser.present)throw browser.value;}},server:{listening:true,close(cb){order.push('server');if(server.present)throw server.value;cb();}}},errors,raw);
    assert.deepEqual(order,['browser','server']);assert.deepEqual(result,{browserClosed:!browser.present,serverClosed:!server.present});
    assert.deepEqual(raw,[...(browser.present?[browser.value]:[]),...(server.present?[server.value]:[])]);
    assert.equal(errors.length,raw.length);count++;
  }
  assert.equal(count,49);t.diagnostic('49 scalar owner states; raw values never enter the returned object');
});

test('diagnostic collector failures cannot skip either owner or replace the first cleanup value',async()=>{
  for(const which of ['errors','raw','both']){
    const order=[],errors=[],raw=[];const other=new Error('server secondary');
    if(which!=='raw')errors.push=()=>{throw new Error('diagnostic sink');};
    if(which!=='errors')raw.push=()=>{throw new Error('raw sink');};
    const observed=await settle(()=>closeWiperCaptureOwners({browser:{async close(){order.push('browser');throw null;}},server:{listening:true,close(){order.push('server');throw other;}}},errors,raw));
    assert.deepEqual(order,['browser','server']);assert.equal(observed.thrown,true);assert.equal(observed.value,null);
  }
  let writes=0;const raw=[];raw.push=()=>{writes++;throw Error('unused sink');};
  assert.deepEqual(await closeWiperCaptureOwners({},[],raw),{browserClosed:false,serverClosed:false});assert.equal(writes,0);
  const error=new Error('context first');let saved=0;
  same(await settle(()=>driver.finishWiperContext({async close(){throw error;}},{},()=>{saved++;}, {push(){throw Error('sink');}},undefined,false)),{present:true,value:error});
  assert.equal(saved,1);
});

// Exercise the actual standalone function body, not a handwritten equivalent.
// Only import.meta and the Playwright import are replaced with scalar boundary
// bindings. Page methods never invoke browser functions; frames are empty and
// screenshot/GL/model operations are forbidden. This is bookkeeping QA only.
const harnessURL=new URL('../check-inkwave-wiper-native-acceptance.mjs',import.meta.url);
const source=fs.readFileSync(harnessURL,'utf8'),program=parse(source,{ecmaVersion:'latest',sourceType:'module',allowHashBang:true});
const declarations=program.body.map(n=>n.declaration||n);
const runNode=declarations.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='runWiperCapture');assert.ok(runNode);
const edits=[];let importCount=0;
function walk(n){if(!n||typeof n!=='object')return;
  if(n.type==='MetaProperty'&&n.meta.name==='import')edits.push({start:n.start,end:n.end,text:'({url:HARNESS_URL})'});
  if(n.type==='ImportExpression'){assert.equal(n.source.value,'playwright');edits.push({start:n.start,end:n.end,text:'loadPlaywright()'});importCount++;}
  for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v?.type)walk(v);
}
walk(runNode);assert.equal(importCount,1);
let runSource=source.slice(runNode.start,runNode.end);
for(const edit of edits.sort((a,b)=>b.start-a.start))runSource=runSource.slice(0,edit.start-runNode.start)+edit.text+runSource.slice(edit.end-runNode.start);
const formatNode=declarations.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='formatWiperError');
const actualFormat=formatNode?new Function('return ('+source.slice(formatNode.start,formatNode.end)+')')():undefined;
const sourceSha='a'.repeat(40),revision='b'.repeat(64),digest='c'.repeat(64);
const artifacts=Object.fromEntries(['s3-projectile-shapes.mjs','s3-ink-sheets.mjs'].map(n=>['_versions/'+revision+'/patches/splatoon3/runtime/'+n,digest]));
const manifest={files:{},inputHash:hash('{}'),contentHash:hash(JSON.stringify(artifacts)),artifacts,build:{revision,esbuild:'0.28.2',optimization:'esbuild-minify'}};
const manifestBytes=Buffer.from(JSON.stringify(manifest));
function controlPlane({primary={present:false},stage='capture',cleanup={present:false}}={}){
  const calls={page:0,context:0,browser:0,server:0,writes:0,playwrightBoundary:0},snapshots=[];
  const page={setDefaultTimeout(){},on(){},async addInitScript(){},async addScriptTag(){},async evaluate(){return{};},locator(){throw Error('scalar QA forbids images');}};
  const context={async newPage(){calls.page++;if(stage!=='verify'&&stage!=='receipt'&&primary.present)throw primary.value;return page;},async close(){calls.context++;if(stage==='context-close'&&cleanup.present)throw cleanup.value;}};
  const browser={version:()=> 'scalar-no-browser',async newContext(){return context;},async close(){calls.browser++;if(stage==='browser-close'&&cleanup.present)throw cleanup.value;}};
  const server={listening:true,listen(_port,_host,cb){cb();},address:()=>({port:1}),close(cb){calls.server++;if(stage==='server-close'&&cleanup.present)throw cleanup.value;this.listening=false;cb();}};
  const fakeFs={existsSync:()=>false,mkdirSync(){},readFileSync(p){return String(p).endsWith('inkwave-build.json')?manifestBytes:Buffer.from('scalar-pinned-helper');},writeFileSync(_p,data){calls.writes++;snapshots.push(JSON.parse(data));if(cleanup.present&&((stage==='context-save'&&calls.writes===3)||(stage==='final-save'&&calls.writes===4)))throw cleanup.value;}};
  const bindings={fs:fakeFs,path,http:{createServer:()=>server},assert,fileURLToPath,HARNESS_URL:harnessURL.href,
    captureSourceIdentity:()=>({checkoutSha:sourceSha}),verifyRuntimeBuild(){if(stage==='verify'&&primary.present)throw primary.value;return manifest;},hash,wiperBuildReceiptBinding,
    launchSandboxBrowser,closeWiperCaptureOwners,WIPER_CAPTURE_CASES:[{key:'scalar',action:'charged'}],WIPER_CAPTURE_FRAMES:{charged:[]},
    initializeWiperCapture:driver.initializeWiperCapture,createWiperNativeShotSchedule:driver.createWiperNativeShotSchedule,wrapWiperDrawCallback:driver.wrapWiperDrawCallback,wrapWiperComposerPasses:driver.wrapWiperComposerPasses,assertWiperWebGLError:driver.assertWiperWebGLError,
    installWiperProbe:()=>{throw Error('scalar QA forbids native probe execution');},enterRangeFromMenu:async()=>({}),finishWiperContext:driver.finishWiperContext,formatWiperError:actualFormat,
    assertWiperCaptureReceipt(result){assert.equal(result.status,'passed');if(stage==='receipt'&&primary.present)throw primary.value;},
    async loadPlaywright(){calls.playwrightBoundary++;return{chromium:{async launch(){return browser;}}};},
  };
  const run=new Function(...Object.keys(bindings),'return ('+runSource+');')(...Object.values(bindings));
  return{calls,snapshots,run:()=>run('/scalar-site','/scalar-out',sourceSha,{root:'/scalar-repo'})};
}

test('actual outer catch and receipt validation retain exact falsy throws rather than throwing from error formatting',async()=>{
  for(const stage of ['verify','receipt'])for(const primary of states(stage)){
    const h=controlPlane({stage,primary}),out=await settle(h.run);same(out,primary);
    if(stage==='verify'&&primary.present){assert.equal(h.calls.context,0);assert.equal(h.calls.playwrightBoundary,0);}
    else{assert.equal(h.calls.context,1);assert.equal(h.calls.browser,1);assert.equal(h.calls.server,1);}
    const result=h.snapshots.at(-1);assert.equal(result.status,primary.present?'failed':'passed');
    if(primary.present)assert.equal(typeof result.error,'string');
  }
});

test('actual capture primary precedes context, owner and final-save cleanup; no-throw remains distinct',async t=>{
  let count=0;
  for(const stage of ['context-close','context-save','browser-close','server-close','final-save'])for(const primary of states('capture'))for(const cleanup of states(stage)){
    const h=controlPlane({primary,stage,cleanup});
    // Inject the primary at the actual newPage boundary even when the selected
    // secondary failure is a different cleanup stage.
    const out=await settle(h.run);same(out,primary.present?primary:cleanup);
    assert.equal(h.calls.context,1);assert.equal(h.calls.browser,1);assert.equal(h.calls.server,1);assert.equal(h.calls.writes,4);count++;
  }
  assert.equal(count,245);t.diagnostic('245 scalar state combinations, no actual Playwright/GL/Character operation');
});
