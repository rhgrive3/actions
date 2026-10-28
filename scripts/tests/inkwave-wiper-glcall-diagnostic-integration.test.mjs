import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {execFileSync} from 'node:child_process';
import {runDirectGlProbe} from '../lib/inkwave-wiper-scene-gl-probe.mjs';
import {createWiperConsoleEvidence} from '../lib/inkwave-wiper-console-evidence.mjs';
import {captureWiperPassInventory,captureWiperBackend,executeWiperPassProbe,normalizeWiperDiagnosticError,assertWiperWebGLError,persistWiperPassFailure,finishWiperContext,finalizeWiperPassEvidence,closeWiperOwnersSafely,recordWiperConsoleMessage} from '../check-inkwave-wiper-glcall-diagnostic-capture.mjs';

test('serialized diagnostic retains selected GL error, direct metadata and never treats falsy primary as success',()=>{
 const queue=[0,0,0,0,0,0x502,0x500],calls=[];const gl={NO_ERROR:0,getError(){return queue.shift()??0},drawArrays(){calls.push('draw')}};
 const renderer={renderBufferDirect(){gl.drawArrays()},render(){this.renderBufferDirect({},null,{attributes:{}},{},{isMesh:true,id:7},null)}};
 const pass={render(r){r.render()}},composer={passes:[pass]},system={renderer,renderPass:pass,composer,render(){pass.render(renderer)}};
 const ctx={window:{}};vm.createContext(ctx);vm.runInContext('window.__runWiperSceneGlProbe=(g,s)=>('+runDirectGlProbe.toString()+')(g,s,{methods:["drawArrays"]});window.__captureWiperPassInventory='+captureWiperPassInventory.toString()+';window.__execute='+executeWiperPassProbe.toString(),ctx);
 assert.throws(()=>ctx.window.__execute(gl,system,1,'native-postprocessed'),/Wiper pass diagnostic/);const rec=ctx.window.__wiperPassReceipt;
 assert.equal(rec.acceptance,false);assert.equal(rec.ok,false);assert.equal(rec.state.failure.boundary,'after-gl');assert.equal(rec.state.failure.method,'drawArrays');assert.equal(rec.state.failure.code,0x502);assert.equal(rec.state.failure.metadata.object.id,7);assert.equal(rec.state.renderState,'potentially-dirty');assert.deepEqual(queue,[0x500]);assert.deepEqual(calls,['draw']);
 ctx.window.__runWiperSceneGlProbe=()=>({ok:false,error:null,state:{primary:{type:'null',description:'null'}}});assert.throws(()=>ctx.window.__execute(gl,system,1,'native'),/Wiper pass diagnostic/);assert.equal(ctx.window.__wiperPassReceipt.error.type,'null');
});

test('standard backend metadata has fail-first GL checks and never claims unmasked hardware',()=>{
 let calls=0,checks=0;const gl={VERSION:1,VENDOR:2,RENDERER:3,getParameter(k){calls++;return ['','WebGL 2','vendor','renderer'][k];}};
 const info=captureWiperBackend(gl,()=>{checks++;});assert.equal(info.unmasked,false);assert.equal(info.renderer,'renderer');assert.equal(calls,3);assert.equal(checks,3);
 calls=0;checks=0;assert.throws(()=>captureWiperBackend(gl,()=>{checks++;throw Error('0x502');}),/0x502/);assert.equal(calls,1);assert.equal(checks,1);
 const bad={VERSION:1,VENDOR:2,RENDERER:3,getParameter(){throw Error('unavailable')}};assert.equal(captureWiperBackend(bad,()=>{}).renderer,'unavailable');
 assert.match(normalizeWiperDiagnosticError(null).message,/null/);
});

test('primary evidence precedes hanging cleanup and write failures cannot mask it',async()=>{
 const primary=Error('primary 0x502'),events=[],result={passProbe:{state:{renderState:'potentially-dirty'}}};
 assert.equal(persistWiperPassFailure(result,primary,()=>events.push('save')).saved,true);
 const pending=finishWiperContext({close(){events.push('close');return new Promise(()=>{});}},{},()=>events.push('after'),[],primary);
 await Promise.race([pending,new Promise(resolve=>setTimeout(resolve,20))]);assert.deepEqual(events,['save','close']);
 const errors=[];await finishWiperContext({async close(){throw Error('close');}},{},()=>{throw Error('write');},errors,primary);
 assert.equal(finalizeWiperPassEvidence({status:'failed',errors},()=>{throw Error('final-write')},primary),primary);assert.match(errors.join(' '),/final-write/);
});

test('original fail-closed phase checks retained, dirty abort has no further page capture',()=>{
 const s=fs.readFileSync(new URL('../check-inkwave-wiper-glcall-diagnostic-capture.mjs',import.meta.url),'utf8');
 for(const phase of ['before-native-phase','after-native-phase','after-geometry-upload','after-render','after-readback','post-restore','post-readPixels'])assert.ok(s.includes(`'${phase}'`),phase);
 assert.match(s,/assert\.equal\(diagnosticBackend,true/);assert.match(s,/consoleEvidenceSha256:hash/);assert.match(s,/reason:'fail-closed diagnostic: no further page capture after error'/);
 assert.ok(s.indexOf("reason:'fail-closed diagnostic")<s.indexOf('persistWiperPassFailure(result,error,save)'));assert.ok(s.indexOf('persistWiperPassFailure(result,error,save)')<s.indexOf('await finishWiperContext(context,row,save,result.errors,primaryError)'));
 assert.match(s,/window\.__wiperPassReceipt\|\|null/);
});

test('isolated exact branch guards, current source pin and nonhidden evidence fail closed',()=>{
 const root=new URL('../../',import.meta.url),ref='refs/heads/diagnostic/wiper-glcall-126-20261028';const read=p=>fs.readFileSync(new URL(p,root),'utf8');
 const parent=p=>execFileSync('git',['show',`126231d4d7d039ddde26a67eead5a4f27c73a425:${p}`],{cwd:root,encoding:'utf8'});
 const boot='.github/workflows/bootstrap-hex-worker-repos.yml',hex='.github/workflows/hex-fast-tail-known.yml',circle='.circleci/config.yml',guard=`    if: github.ref != '${ref}'\n`;
 assert.equal(read(boot).replace(guard,''),parent(boot));assert.equal(read(hex).replace(guard,'').replace(`    if: \${{ always() && github.ref != '${ref}' }}\n`,'    if: always()\n'),parent(hex));
 assert.equal(read(circle).replace('          filters:\n            branches:\n              ignore:\n                - diagnostic/wiper-glcall-126-20261028\n',''),parent(circle));
 const w=read('.github/workflows/inkwave-wiper-glcall-diagnostic.yml');for(const x of [ref,'126231d4d7d039ddde26a67eead5a4f27c73a425','34ab34c0890cebf9d638429d585cc6f2328072aa','contents: read','ubuntu-22.04','--source-root','--harness-sha','github.workflow_sha','path: diagnostic-evidence/','if-no-files-found: error'])assert.ok(w.includes(x),x);
 assert.doesNotMatch(w.split('permissions:')[0],/\bpaths:/);assert.doesNotMatch(w,/--no-sandbox|--enable-unsafe-swiftshader|continue-on-error:|fetch-depth: 0/);
});

test('actual capture clears a stale pass receipt before any first GL failure',()=>{
 const s=fs.readFileSync(new URL('../check-inkwave-wiper-glcall-diagnostic-capture.mjs',import.meta.url),'utf8');
 const a=s.indexOf('    capture(frame,view){'),b=s.indexOf('\n    finish(){',a);assert.ok(a>=0&&b>a);
 const body=s.slice(a,b).trim().replace(/,$/,'');const win={__wiperPassReceipt:{ok:true,frame:1},__assertWiperWebGLError(){throw Error('first GL failure')}};
 const fn=vm.runInNewContext('({'+body+'}).capture',{window:win,gl:{}});assert.throws(()=>fn(2,'fixed-side-raw'),/first GL failure/);assert.equal(win.__wiperPassReceipt,null);
});

test('null browser cleanup rejection preserves original failure and still attempts server close',async()=>{
 const errors=[],primary=Error('primary 0x502');let serverCalls=0;
 const owners={browser:{async close(){throw null}},server:{listening:true,close(cb){serverCalls++;cb();}}};
 const value=await closeWiperOwnersSafely(owners,errors,primary);assert.equal(value.primary,primary);assert.equal(serverCalls,1);assert.equal(value.cleanup.serverClosed,true);assert.equal(value.cleanup.browserClosed,false);assert.match(errors.join(' '),/Non-Error thrown: null/);
 const noPrimary=await closeWiperOwnersSafely(owners,[],null);assert.match(noPrimary.primary.message,/null/);
});

test('console errors and unreadable console types cannot pass or grow errors unbounded',()=>{
 const c=createWiperConsoleEvidence({maxEntries:1}),errors=[];
 for(let i=0;i<100;i++)recordWiperConsoleMessage(c,errors,{type:()=> 'error',text:()=> 'fatal'});
 assert.equal(errors.length,1);assert.equal(c.receipt.errors,100);assert.equal(c.receipt.dropped,99);
 recordWiperConsoleMessage(c,errors,{type(){throw null}});assert.equal(errors.length,1);assert.equal(c.receipt.unreadable,1);
});
