import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {runPassProbe} from '../lib/inkwave-wiper-pass-probe.mjs';
import {captureWiperPassInventory, executeWiperPassProbe, restoreWiperRenderState, readWiperPixels, saveWiperFailureEvidence, persistWiperPassFailure, finishWiperContext, finalizeWiperPassEvidence} from '../check-inkwave-wiper-pass-diagnostic-capture.mjs';

test('serialized capture retains first pass failure receipt, prevents later pass and preserves queued errors',()=>{
  const queue=[0,0,0,0x502,0x500], calls=[];
  const gl={NO_ERROR:0,getError(){calls.push('error');return queue.shift()??0;}};
  const a={render(){calls.push('a');}}, b={render(){calls.push('b');}};
  const composer={passes:[a,b],render(){this.passes[0].render();this.passes[1].render();}};
  const renderer={composer,renderPass:a,render(){this.composer.render();}};
  const ctx={window:{}}; vm.createContext(ctx);
  vm.runInContext('window.__runWiperPassProbe='+runPassProbe.toString()+';window.__captureWiperPassInventory='+captureWiperPassInventory.toString()+';window.__execute='+executeWiperPassProbe.toString(),ctx);
  assert.throws(()=>ctx.window.__execute(gl,renderer,1,'native-postprocessed'),/Wiper pass diagnostic/);
  const receipt=ctx.window.__wiperPassReceipt;assert.equal(receipt.ok,false);assert.equal(receipt.acceptance,false);
  assert.equal(receipt.state.failure.code,0x502);assert.equal(receipt.state.failure.boundary,'after-pass[0]');
  assert.equal(receipt.state.coverage.composerCalls,1);assert.equal(receipt.inventory.passes[0].label,'renderPass');assert.equal(receipt.inventory.passes[1].label,'unknown');assert.deepEqual(queue,[0x500]);assert.equal(calls.includes('b'),false);
});

test('diagnostic copy retains exact 9abb phase gates and nonmasking screenshot/cleanup',()=>{
  const s=fs.readFileSync(new URL('../check-inkwave-wiper-pass-diagnostic-capture.mjs',import.meta.url),'utf8');
  for(const phase of ['before-native-phase','after-native-phase','after-geometry-upload','after-render','after-readback'])assert.ok(s.includes(`glBoundary('${phase}')`),phase);
  for(const phase of ['pre-advance','post-advance','post-draw-1','post-draw-2','pre-render','post-render','post-restore','post-readPixels'])assert.ok(s.includes(`'${phase}'`),phase);
  assert.match(s,/assert\.equal\(diagnosticBackend,true/);assert.match(s,/page\.evaluate\(\(\)=>window\.__wiperPassReceipt\|\|null\)/);
  assert.match(s,/saveWiperFailureEvidence\(page,out,error\)/);assert.match(s,/setTimeout\(\(\)=>resolve\(\{status:'unavailable',reason:'receipt timeout'\}\),3000\)/);
  const e=Error('primary phase error');assert.throws(()=>restoreWiperRenderState(()=>{throw Error('cleanup');},{setRenderTarget(){},info:{}},null,true,true,e),x=>x.message.includes('primary phase error')&&x.message.includes('cleanup'));
  let codeReads=0;const gl={drawingBufferWidth:1,drawingBufferHeight:1,RGBA:1,UNSIGNED_BYTE:2,readPixels(){},getError(){codeReads++;return 0x502;}};
  assert.throws(()=>readWiperPixels(gl,1,'native',()=>{if(gl.getError())throw Error('0x502');}),/0x502/);assert.equal(codeReads,1);
});

test('failure screenshot is bounded and never masks primary',async()=>{
  const primary=Error('phase primary');const info=await saveWiperFailureEvidence({screenshot:()=>Promise.reject(Error('screenshot'))},'/tmp/unused',primary,{timeoutMs:20,write(){}});
  assert.match(info.primaryError,/phase primary/);assert.equal(info.screenshot.status,'unavailable');assert.equal(info.acceptance,false);
});

test('isolated trigger guards exclude only diagnostic branch and keep evidence path uploadable',()=>{
  const root=new URL('../../',import.meta.url),ref='refs/heads/diagnostic/wiper-pass-9abb-20261028';
  const read=p=>fs.readFileSync(new URL(p,root),'utf8');
  const parent=p=>execFileSync('git',['show',`9abb36a4b378fc690527e4372cb7da8beef0cbb4:${p}`],{cwd:root,encoding:'utf8'});
  const boot='.github/workflows/bootstrap-hex-worker-repos.yml',hex='.github/workflows/hex-fast-tail-known.yml',circle='.circleci/config.yml';
  const guard=`    if: github.ref != '${ref}'\n`;
  assert.equal(read(boot).replace(guard,''),parent(boot));
  assert.equal(read(hex).replace(guard,'').replace(`    if: \${{ always() && github.ref != '${ref}' }}\n`,'    if: always()\n'),parent(hex));
  assert.equal(read(circle).replace('          filters:\n            branches:\n              ignore:\n                - diagnostic/wiper-pass-9abb-20261028\n',''),parent(circle));
  const w=read('.github/workflows/inkwave-wiper-pass-diagnostic.yml');
  for(const token of [ref,'9abb36a4b378fc690527e4372cb7da8beef0cbb4','f45baa460f703517fb175a837e71de0f888f4b1e','contents: read','ubuntu-22.04','--source-root','--harness-sha','github.workflow_sha','path: diagnostic-evidence/'])assert.ok(w.includes(token),token);
  assert.doesNotMatch(w.split('permissions:')[0],/\bpaths:/);assert.doesNotMatch(w,/--no-sandbox|--enable-unsafe-swiftshader|continue-on-error:|fetch-depth: 0/);
});

test('primary pass receipt is saved before a hanging cleanup and save failure cannot replace primary',async()=>{
  const primary=Error('primary-pass-0x502'),events=[];
  const result={passProbe:{state:{failure:{code:0x502}}}};
  const persisted=persistWiperPassFailure(result,primary,()=>events.push('save'));
  assert.equal(persisted.saved,true);assert.equal(result.status,'failed');assert.match(result.error,/primary-pass-0x502/);
  const pending=finishWiperContext({close(){events.push('close');return new Promise(()=>{});}}, {},()=>events.push('post-close-save'),[],primary);
  await Promise.race([pending,new Promise(resolve=>setTimeout(resolve,20))]);assert.deepEqual(events,['save','close']);
  const failed={};assert.equal(persistWiperPassFailure(failed,primary,()=>{throw Error('disk');}).saved,false);
  assert.match(failed.error,/primary-pass-0x502/);assert.match(failed.passPersistenceError,/disk/);
  const s=fs.readFileSync(new URL('../check-inkwave-wiper-pass-diagnostic-capture.mjs',import.meta.url),'utf8');
  assert.ok(s.indexOf('persistWiperPassFailure(result,error,save)')<s.indexOf('saveWiperFailureEvidence(page,out,error)'));
});

test('pass inventory is passive, bounded and incomplete getters cannot mask probe',()=>{
  const a={enabled:true},b={enabled:false};const renderer={composer:{passes:[a,b]},renderPass:a,get gtao(){throw Error('inaccessible');}};
  const inv=captureWiperPassInventory(renderer);assert.deepEqual(inv.passes,[{index:0,label:'renderPass',enabled:true},{index:1,label:'unknown',enabled:false}]);
  assert.equal(captureWiperPassInventory({composer:{passes:Array(33)}}).status,'incomplete');
  assert.equal(captureWiperPassInventory({get composer(){throw Error('bad');}}).status,'incomplete');
});

test('composed cleanup and final evidence save errors preserve an existing pass primary',async()=>{
  const primary=Error('pass-primary-0x502'),errors=[],row={};let saves=0;
  const result={status:'failed',errors,passProbe:{code:0x502}};
  assert.equal(persistWiperPassFailure(result,primary,()=>{throw Error('early-write');}).saved,false);
  await finishWiperContext({async close(){throw Error('context-close');}},row,()=>{saves++;throw Error('context-write');},errors,primary);
  const selected=finalizeWiperPassEvidence(result,()=>{saves++;throw Error('final-write');},primary);
  assert.equal(selected,primary);assert.equal(saves,2);assert.match(result.error,/pass-primary-0x502/);
  assert.match(errors.join(' '),/context-close/);assert.match(errors.join(' '),/context-write/);assert.match(errors.join(' '),/final-write/);
  const other={status:'diagnostic-complete',errors:[]};const only=finalizeWiperPassEvidence(other,()=>{throw Error('only-write');},null);
  assert.match(only.message,/only-write/);assert.equal(other.status,'failed');
  await assert.rejects(()=>finishWiperContext({async close(){}},{},()=>{throw Error('only-context-write');},[],null),/only-context-write/);
});
