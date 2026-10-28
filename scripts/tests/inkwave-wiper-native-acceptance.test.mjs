import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {WIPER_CAPTURE_CASES as CASES,WIPER_CAPTURE_FRAMES as FRAMES,assertWiperCaptureReceipt,wiperBuildReceiptBinding} from '../lib/inkwave-wiper-acceptance-contract.mjs';
import {sandboxBrowserOptions,launchSandboxBrowser,closeWiperCaptureOwners} from '../lib/inkwave-sandbox-browser.mjs';
import {verifyWiperCaptureFiles} from '../check-inkwave-wiper-native-receipt.mjs';
import {hash} from '../lib/inkwave-runtime-evidence.mjs';
import {parseBrowserLane} from '../ci/run-circleci-browser-lane.mjs';
import {createWiperNativeShotSchedule,wrapWiperDrawCallback,assertWiperWebGLError,finishWiperContext,readWiperPixels,restoreWiperRenderState,wiperDiagnosticBrowserOptions,saveWiperFailureEvidence,validateWiperDiagnosticIdentity,settleWiperModuleObservations} from '../check-inkwave-wiper-native-acceptance.mjs';

const sourceSha='a'.repeat(40),digest='c'.repeat(64);
const revision='e'.repeat(64),modules=Object.fromEntries(['s3-projectile-shapes.mjs','s3-ink-sheets.mjs'].map(n=>[`_versions/${revision}/patches/splatoon3/runtime/${n}`,digest]));
const manifestBytes=Buffer.from(JSON.stringify({contentHash:hash(JSON.stringify(modules)),inputHash:hash('{}'),files:{},artifacts:modules,build:{revision,esbuild:'0.28.2',optimization:'esbuild-minify'}}));
const buildBinding=wiperBuildReceiptBinding(manifestBytes),{contentHash,inputHash,manifestSha256}=buildBinding;
const helperHash=file=>hash(fs.readFileSync(new URL(file,import.meta.url)));
function fixture(){
  const files=new Map(),receipt={schema:1,status:'passed',kind:'controlled-native-wiper-visual-acceptance',sourceSha,contentHash,
    sourceIdentity:{checkoutSha:sourceSha,checkoutIdentityStatus:'verified-git-head'},sandbox:true,errors:[],cleanup:{browserClosed:true,serverClosed:true},
    manifestSha256,harnessSha256:helperHash('../check-inkwave-wiper-native-acceptance.mjs'),contractSha256:helperHash('../lib/inkwave-wiper-acceptance-contract.mjs'),launcherSha256:helperHash('../lib/inkwave-sandbox-browser.mjs'),inputHash,
    modules:{...modules},consumed:{...modules},cases:[]};
  for(const c of CASES){
    const row={...c,entry:{gestures:[{trusted:true},{trusted:true}]},contextClosed:true,retired:true,
      resources:{disposed:true,wetAllocated:c.mesh==='wetSlashV'},initial:{pipeline:{ao:true,shadows:true}},firstBirth:{tick:100},frames:[]};
    for(const frame of FRAMES[c.action]){
      const images=['native-postprocessed','fixed-side-raw'].map(view=>{
        const file=`${c.key}-f${frame}-${view}.png`,bytes=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(1200,frame)]);
        files.set(file,bytes);return {view,file,bytes:bytes.length,sha256:hash(bytes),render:{calls:10,triangles:200},luminanceRange:100,
          drawReceipts:[{override:false,inspection:view==='fixed-side-raw'}]};
      });
      row.frames.push({frame,tick:99+frame,state:{projectiles:[{id:c.id,sourceActor:c.sourceActor,descriptor:c.descriptor,birthPending:false,delay:0,age:frame/60}]},
        mesh:{name:c.mesh,instances:2,trianglesPerInstance:2000,attributeBytes:50000,projectedVertices:1000,visibleProjectedVertices:900},drawPure:true,screenshotStateStable:true,images});
    }
    receipt.cases.push(row);
  }
  return {receipt,files,read(filename){if(filename.endsWith('wiper-native-result.json'))return Buffer.from(JSON.stringify(receipt));const value=files.get(filename.split('/').at(-1));if(!value)throw Error('missing PNG');return value;}};
}

test('WebGL failure retains exact first queued enum and context without a pre-drain or retry',()=>{
  // Exercise the exact function serialized into the page, not a lookalike.
  const probe=vm.runInNewContext('('+assertWiperWebGLError.toString()+')');
  for(const code of [0,0x0500,0x0502,0x0505,0x9242]){
    let reads=0,lossChecks=0;const gl={drawingBufferWidth:960,drawingBufferHeight:720,
      getError(){reads++;return code;},isContextLost(){lossChecks++;return code===0x9242;}};
    if(code===0)assert.doesNotThrow(()=>probe(gl,1,'native-postprocessed'));
    else assert.throws(()=>probe(gl,1,'native-postprocessed'),e=>e.message.includes('code=0x'+code.toString(16))&&e.message.includes('frame=1 view=native-postprocessed')&&e.message.includes('contextLost='+(code===0x9242))&&e.message.includes('drawingBuffer=960x720'));
    assert.equal(reads,1);assert.equal(lossChecks,code===0?0:1);
  }
  let errorReads=0;
  const broken={getError(){errorReads++;return 0x0502;},isContextLost(){throw Error('lost read');},
    get drawingBufferWidth(){throw Error('width read');},get drawingBufferHeight(){throw Error('height read');}};
  assert.throws(()=>probe(broken,8,'fixed-side-raw'),e=>e.message.includes('code=0x502')&&e.message.includes('frame=8 view=fixed-side-raw')&&e.message.includes('contextLost=unknown drawingBuffer=unknownxunknown'));
  assert.equal(errorReads,1,'failed optional reads never drain or replace the original error');
  const driver=fs.readFileSync(new URL('../check-inkwave-wiper-native-acceptance.mjs',import.meta.url),'utf8');
  assert.match(driver,/window\.__assertWiperWebGLError\(gl,frame,view,'final'\)/);
  assert.match(driver,/assertWiperWebGLError\.toString\(\)/);
});

test('context cleanup preserves the primary capture failure and records cleanup failure',async()=>{
  for(const primary of [null,Error('primary code=0x502')])for(const closeError of [null,Error('close rejected')]){
    const row={contextClosed:false},errors=[],snapshots=[];let closeCalls=0;
    const context={close:async()=>{closeCalls++;if(closeError)throw closeError;}};
    const execute=async()=>{let failure;try{if(primary)throw primary;}catch(e){failure=e;throw e;}
      finally{await finishWiperContext(context,row,()=>snapshots.push({closed:row.contextClosed,errors:[...errors]}),errors,failure);}};
    if(primary||closeError)await assert.rejects(execute,e=>e===(primary||closeError));else await assert.doesNotReject(execute);
    assert.equal(closeCalls,1);assert.equal(row.contextClosed,!closeError);assert.equal(snapshots.length,1);
    assert.equal(errors.length,closeError?1:0);assert.equal(snapshots[0].errors.length,closeError?1:0);
    if(closeError)assert.match(errors[0],/context cleanup:.*close rejected/s);
  }
});

test('phased GL checks fail immediately and report readPixels enum before flat image',()=>{
  const check=vm.runInNewContext('('+assertWiperWebGLError.toString()+')');
  const read=vm.runInNewContext('('+readWiperPixels.toString()+')');
  for(const code of [0x0502,0]){
    let errorCalls=0,reads=0;const gl={drawingBufferWidth:2,drawingBufferHeight:2,RGBA:1,UNSIGNED_BYTE:2,
      readPixels(_x,_y,_w,_h,_fmt,_type,bytes){reads++;bytes.fill(0);},getError(){errorCalls++;return code;},isContextLost(){return false;}};
    assert.throws(()=>read(gl,1,'native-postprocessed',check),e=>code?e.message.includes('code=0x502')&&e.message.includes('phase=post-readPixels'):e.message.includes('Flat rendered image'));
    assert.equal(reads,1);assert.equal(errorCalls,1,'one getError at read boundary, never silently drained');
  }
  const driver=fs.readFileSync(new URL('../check-inkwave-wiper-native-acceptance.mjs',import.meta.url),'utf8');
  for(const phase of ['initial-entry','post-warm','pre-advance','post-advance','pre-draw','post-draw-1','post-draw-2','pre-render','post-render','post-readPixels','post-restore','final'])assert.ok(driver.includes("'"+phase+"'"),phase);
  const pixel=readWiperPixels.toString();assert(pixel.indexOf('gl.readPixels(')<pixel.indexOf("'post-readPixels'"));assert(pixel.indexOf("'post-readPixels'")<pixel.indexOf('Flat rendered image'));
});

test('phased checker stops at first queued GL error without consuming later errors',()=>{
  const check=vm.runInNewContext('('+assertWiperWebGLError.toString()+')');
  for(const row of [
    {queue:[0x0502,0x0500],expectedReads:1,phase:'pre-draw',remaining:[0x0500]},
    {queue:[0,0x0502],expectedReads:2,phase:'post-draw',remaining:[]},
  ]){
    const queue=[...row.queue],called=[];const gl={drawingBufferWidth:1,drawingBufferHeight:1,isContextLost:()=>false,getError(){called.push('getError');return queue.shift();}};
    assert.throws(()=>{for(const phase of ['pre-draw','post-draw'])check(gl,1,'native-postprocessed',phase);},e=>e.message.includes('code=0x502')&&e.message.includes('phase='+row.phase));
    assert.equal(called.length,row.expectedReads);assert.deepEqual(queue,row.remaining);
  }
});

test('render restoration attempts every owner and preserves primary phase error',()=>{
  const restore=vm.runInNewContext('('+restoreWiperRenderState.toString()+')');
  for(const primary of [null,Error('code=0x502 phase=post-render')])for(const fail of [false,true]){
    let calls=[];const renderer={setRenderTarget(){calls.push('target');if(fail)throw Error('target restore');},set autoClear(v){calls.push('auto:'+v);},info:{set autoReset(v){calls.push('info:'+v);}}};
    const execute=()=>restore(()=>{calls.push('draw');if(fail)throw Error('draw restore')},renderer,null,true,true,primary);
    if(fail)assert.throws(execute,e=>(!primary||e.message.includes('code=0x502 phase=post-render'))&&e.message.includes('draw restore')&&e.message.includes('target restore'));
    else assert.doesNotThrow(execute);
    assert.deepEqual(calls,['draw','target','auto:true','info:true']);
  }
});

test('diagnostic launcher remains sandboxed, contains no unsafe flags and cannot be acceptance',()=>{
  const opts=wiperDiagnosticBrowserOptions();assert.equal(opts.chromiumSandbox,true);assert.deepEqual(opts.args,[]);
  const runner=fs.readFileSync(new URL('../check-inkwave-wiper-gl-phase-diagnostic.mjs',import.meta.url),'utf8');
  assert.match(runner,/diagnosticBackend:true/);assert.doesNotMatch(runner,/--no-sandbox|--enable-unsafe-swiftshader/);
  const f=fixture();f.receipt.kind='controlled-native-wiper-gl-diagnostic';f.receipt.status='diagnostic-complete';assert.throws(()=>assertWiperCaptureReceipt(f.receipt,{sourceSha,...buildBinding}));
});

test('diagnostic harness and game source identities are independently pinned',()=>{
  const source='a'.repeat(40),harness='b'.repeat(40),identity={checkoutIdentityStatus:'verified-git-head',checkoutSha:harness};
  assert.doesNotThrow(()=>validateWiperDiagnosticIdentity('/immutable/game',source,harness,identity));
  for(const [root,src,hs,id] of [['relative',source,harness,identity],['/game','bad',harness,identity],['/game',source,'bad',identity],['/game',source,harness,{...identity,checkoutSha:source}],['/game',source,harness,{...identity,checkoutIdentityStatus:'unavailable'}]])
    assert.throws(()=>validateWiperDiagnosticIdentity(root,src,hs,id));
  const runner=fs.readFileSync(new URL('../check-inkwave-wiper-gl-phase-diagnostic.mjs',import.meta.url),'utf8');
  assert.match(runner,/--source-root/);assert.match(runner,/--harness-sha/);assert.match(runner,/root:sourceRoot/);
});

test('failed capture records bounded actual-module observation or explicitly incomplete',async()=>{
  const modules={one:'a',two:'b'};
  const complete=await settleWiperModuleObservations([Promise.resolve(),Promise.resolve()],modules,{one:'a',two:'b'});assert.equal(complete.status,'verified');
  const missing=await settleWiperModuleObservations([Promise.resolve()],modules,{one:'a'});assert.equal(missing.status,'incomplete');assert.equal(missing.reason,'missing-or-rejected');
  const rejected=await settleWiperModuleObservations([Promise.reject(Error('body failed')),Promise.resolve()],modules,{one:'a',two:'b'});assert.equal(rejected.status,'incomplete');
  const bodyError=await settleWiperModuleObservations([Promise.resolve(),Promise.resolve()],modules,{one:'a',two:'b'},{errors:['consumed artifact: body failed']});assert.equal(bodyError.status,'incomplete');
  const timed=await settleWiperModuleObservations([new Promise(()=>{})],modules,{},{timeoutMs:10});assert.equal(timed.status,'incomplete');assert.equal(timed.reason,'timeout');
});

test('actual shallow Git checkouts retain required parent, path diff and source blobs',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wiper-shallow-contract-'));
  const repo=path.join(tmp,'repo'),harness=path.join(tmp,'harness'),source=path.join(tmp,'game');fs.mkdirSync(repo);
  const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const put=(name,data)=>{const p=path.join(repo,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,data);};
  const commit=message=>git(repo,'-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm',message);
  try{
    git(repo,'init','-q','--initial-branch=main');put('game/input.txt','initial');git(repo,'add','.');commit('initial');
    put('game/input.txt','source bytes');git(repo,'add','.');commit('source');const sourceSha=git(repo,'rev-parse','HEAD');git(repo,'branch','source',sourceSha);
    const paths=['.circleci/config.yml','.github/workflows/bootstrap-hex-worker-repos.yml','.github/workflows/hex-fast-tail-known.yml','.github/workflows/inkwave-wiper-gl-phase-diagnostic.yml','scripts/check-inkwave-wiper-gl-phase-diagnostic.mjs','scripts/check-inkwave-wiper-native-acceptance.mjs','scripts/tests/inkwave-wiper-native-acceptance.test.mjs'];
    for(const p of paths)put(p,'diagnostic '+p);git(repo,'add','.');commit('harness');const harnessSha=git(repo,'rev-parse','HEAD');
    git(tmp,'clone','-q','--depth=2','file://'+repo,harness);git(tmp,'clone','-q','--depth=1','--branch','source','file://'+repo,source);
    assert.equal(git(harness,'rev-parse','--is-shallow-repository'),'true');assert.equal(git(source,'rev-parse','--is-shallow-repository'),'true');
    assert.equal(git(harness,'rev-parse','HEAD'),harnessSha);assert.equal(git(harness,'rev-parse','HEAD^'),sourceSha);assert.equal(git(harness,'rev-list','--count','HEAD'),'2');
    assert.deepEqual(git(harness,'diff','--no-renames','--name-only',sourceSha,harnessSha).split('\n').sort(),paths.sort());
    assert.equal(git(source,'rev-parse','HEAD'),sourceSha);assert.equal(git(source,'rev-list','--count','HEAD'),'1');
    const blob=git(source,'rev-parse','HEAD:game/input.txt');assert.match(git(source,'cat-file','-t',blob),/^blob$/);assert.equal(git(source,'cat-file','blob',blob),'source bytes');assert.match(git(source,'rev-parse','HEAD^{tree}'),/^[0-9a-f]{40}$/);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('failure screenshot is bounded, diagnostic-only and never replaces the primary error',async()=>{
  for(const mode of ['success','reject','hang','write-fail']){
    let calls=0,options,writes=[];const page={screenshot:o=>{calls++;options=o;if(mode==='reject')return Promise.reject(Error('capture failed'));if(mode==='hang')return new Promise(()=>{});return Promise.resolve(Buffer.from('png'));}};
    const write=(name,data)=>{if(mode==='write-fail')throw Error('write failed');writes.push([name,data]);};
    const primary=Error('code=0x502 phase=post-render');const start=Date.now();const info=await saveWiperFailureEvidence(page,'/evidence',primary,{timeoutMs:20,write});
    assert(Date.now()-start<1000);assert.equal(calls,1);assert(options.timeout<=20);assert.equal(Object.hasOwn(options,'path'),false);
    assert.equal(info.acceptance,false);assert.match(info.primaryError,/code=0x502 phase=post-render/);
    assert.equal(info.screenshot.status,mode==='success'?'captured':'unavailable');
    if(mode==='success'){assert.equal(writes.length,2);assert.equal(info.screenshot.file,'wiper-gl-failure-current.png');}
    if(mode==='write-fail')assert.match(info.receiptWriteError,/write failed/);
  }
  const driver=fs.readFileSync(new URL('../check-inkwave-wiper-native-acceptance.mjs',import.meta.url),'utf8');
  assert.match(driver,/diagnosticBackend&&page&&frozenVerified/);assert.match(driver,/window\.__inkwave\?\.frozen===true/);
});

test('isolated Wiper diagnostic push route pins separate harness and source without unsafe flags',()=>{
  const workflow=fs.readFileSync(new URL('../../.github/workflows/inkwave-wiper-gl-phase-diagnostic.yml',import.meta.url),'utf8');
  for(const token of ['diagnostic/wiper-gl-phase-a887-20261028','a8877a086cc377074a07de60eba5f17c7b1213a1','5ae30f11763b952df917d7b272a884e4fbc8a98e','ubuntu-22.04','contents: read','--source-root','--harness-sha','github.workflow_sha'])assert.ok(workflow.includes(token),token);
  assert.match(workflow,/if: always\(\)/);assert.match(workflow,/actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow.split('permissions:')[0],/\bpaths:/); // New-branch path filtering can omit the diagnostic in a large diff.

  const harness=workflow.split('      - name: Checkout exact diagnostic harness\n')[1].split('      - name: Verify exact harness parent')[0];
  const source=workflow.split('      - name: Checkout independently pinned game source\n')[1].split('      - uses: actions/setup-node@v4')[0];
  assert.match(harness,/fetch-depth: 2/);assert.match(source,/fetch-depth: 1/);assert.doesNotMatch(workflow,/fetch-depth: 0/);
  assert.doesNotMatch(workflow,/--no-sandbox|--enable-unsafe-swiftshader|continue-on-error:/);
  const runner=fs.readFileSync(new URL('../check-inkwave-wiper-gl-phase-diagnostic.mjs',import.meta.url),'utf8');assert.match(runner,/expectedDiagnosticSha:harnessSha/);
});

test('diagnostic branch alone excludes unrelated CircleCI and side-effect workflows',()=>{
  const ref='refs/heads/diagnostic/wiper-gl-phase-a887-20261028';
  const root=new URL('../../',import.meta.url);
  const read=p=>fs.readFileSync(new URL(p,root),'utf8');
  const parent=p=>execFileSync('git',['show',`HEAD^:${p}`],{cwd:root,encoding:'utf8'});
  const bootstrap='.github/workflows/bootstrap-hex-worker-repos.yml';
  const hex='.github/workflows/hex-fast-tail-known.yml';
  const circle='.circleci/config.yml';
  const guard=`    if: github.ref != '${ref}'\n`;
  assert.equal(read(bootstrap).replace(guard,''),parent(bootstrap));
  assert.equal(read(hex).replace(guard,'').replace(`    if: \${{ always() && github.ref != '${ref}' }}\n`,'    if: always()\n'),parent(hex));
  const filter='          filters:\n            branches:\n              ignore:\n                - diagnostic/wiper-gl-phase-a887-20261028\n';
  assert.equal(read(circle).replace(filter,''),parent(circle));
  for(const other of ['refs/heads/main','refs/pull/1895/merge','refs/heads/diagnostic/other'])assert.notEqual(other,ref);
});

test('exact mandatory six cases include Normal+Lite first active charged frame, taps and Heavy controls',()=>{
  assert.deepEqual(CASES.map(c=>c.key),['normal-charged','normal-tap','lite-charged','lite-tap','heavy-charged','heavy-tap']);
  assert.deepEqual(FRAMES,{charged:[1,3,8],tap:[1,2,3]});assert.equal(CASES.filter(c=>c.mesh==='wetSlashV').length,2);
  const f=fixture();assert.deepEqual(verifyWiperCaptureFiles('/evidence',{sourceSha,manifestBytes},f.read),f.receipt);
});

test('receipt rejects omissions, wrong exact head/content, stale helper, wrong actor/action/mesh/phase, unsafe or incomplete evidence',()=>{
  const mutants=[
    r=>r.cases.pop(),r=>r.cases.splice(2,1),r=>r.cases[0].frames.shift(),r=>r.cases[1].frames.pop(),
    r=>r.sourceSha='d'.repeat(40),r=>r.sourceIdentity.checkoutSha='d'.repeat(40),r=>r.contentHash='d'.repeat(64),
    r=>r.sourceIdentity.checkoutIdentityStatus='unavailable',r=>r.harnessSha256='d'.repeat(64),r=>r.inputHash='not-a-hash',
    r=>r.sandbox=false,r=>r.cleanup.browserClosed=false,r=>r.cleanup.serverClosed=false,r=>r.errors.push('shader failure'),
    r=>r.cases[0].sourceActor='WeaponSaberHeavy',r=>r.cases[0].contextClosed=false,r=>r.cases[0].resources.disposed=false,
    r=>r.cases[0].resources.wetAllocated=false,r=>r.cases[0].retired=false,r=>r.cases[0].initial.pipeline.ao=false,
    r=>r.cases[0].frames[0].tick++,r=>r.cases[0].frames[0].state.projectiles[0].sourceActor='WeaponSaberLite',
    r=>r.cases[0].frames[0].state.projectiles[0].descriptor='saber-horizontal',r=>r.cases[0].frames[0].state.projectiles[0].birthPending=true,
    r=>r.cases[0].frames[0].state.projectiles[0].delay=1,r=>r.cases[0].frames[0].state.projectiles[0].age=NaN,
    r=>r.cases[0].frames[0].mesh.name='slashV',r=>r.cases[0].frames[0].mesh.instances=1,r=>r.cases[0].frames[0].mesh.trianglesPerInstance=20000,
    r=>r.cases[0].frames[0].mesh.attributeBytes=2000000,r=>r.cases[0].frames[0].mesh.visibleProjectedVertices=0,
    r=>r.cases[0].frames[0].drawPure=false,r=>r.cases[0].frames[0].screenshotStateStable=false,
    r=>r.cases[0].frames[0].images.pop(),r=>r.cases[0].frames[0].images[0].sha256='d'.repeat(64),
    r=>r.cases[0].frames[0].images[0].file='../escape.png',r=>r.cases[0].frames[0].images[0].luminanceRange=0,
    r=>r.cases[0].frames[0].images[0].drawReceipts=[],r=>r.cases[0].frames[0].images[0].render.calls=0,
    r=>r.consumed[Object.keys(modules)[0]]='d'.repeat(64),r=>delete r.consumed[Object.keys(modules)[0]],
    r=>{r.modules={};r.consumed={};},r=>{r.modules[Object.keys(modules)[0]]='d'.repeat(64);r.consumed[Object.keys(modules)[0]]='d'.repeat(64);},
    r=>r.inputHash='d'.repeat(64),r=>r.manifestSha256='d'.repeat(64),
  ];
  for(const mutate of mutants){const f=fixture();mutate(f.receipt);assert.throws(()=>verifyWiperCaptureFiles('/evidence',{sourceSha,manifestBytes},f.read),String(mutate));}
});

test('original screenshot files are mandatory, unique, non-substitutable and PNG-hash bound',()=>{
  for(const mutation of ['missing','bytes','duplicate','not-png']){
    const f=fixture(),im=f.receipt.cases[0].frames[0].images[0];
    if(mutation==='missing')f.files.delete(im.file);
    if(mutation==='bytes')f.files.get(im.file)[100]^=1;
    if(mutation==='duplicate')f.receipt.cases[0].frames[1].images[0]={...im};
    if(mutation==='not-png'){f.files.get(im.file)[0]=0;im.sha256=hash(f.files.get(im.file));}
    assert.throws(()=>verifyWiperCaptureFiles('/evidence',{sourceSha,manifestBytes},f.read),mutation);
  }
});

test('launch explicitly enables Chromium sandbox and never retries a denied/failed launch',async()=>{
  for(const env of [{},{CHROMIUM_EXECUTABLE_PATH:'/supported/chromium'}]){
    const options=sandboxBrowserOptions(env);assert.equal(options.chromiumSandbox,true);
    assert.ok(options.args.every(a=>!/(no-sandbox|disable.*sandbox|single-process)/.test(a)));
  }
  let calls=0;
  await assert.rejects(launchSandboxBrowser({launch:async options=>{calls++;assert.equal(options.chromiumSandbox,true);throw Error('sandbox denied');}},{}),/sandbox denied/);
  assert.equal(calls,1);
});

test('browser/server cleanup is awaited and independent even on failure',async()=>{
  let closed=0;
  for(const fails of [false,true]){
    const errors=[],owners={browser:{close:async()=>{closed++;if(fails)throw Error('browser failed');}},server:{listening:true,close:cb=>{closed++;cb();}}};
    const result=await closeWiperCaptureOwners(owners,errors);assert.equal(result.serverClosed,true);assert.equal(result.browserClosed,!fails);assert.equal(errors.length,fails?1:0);
  }
  assert.equal(closed,4);
});

test('passive draw wrapper restores inherited/nondefault-own callbacks, including rendering errors, without clobbering another owner',()=>{
  const original=function(){this.calls=(this.calls||0)+1;};
  for(const own of [false,true]){
    const mesh=Object.create({onBeforeRender:original});
    if(own)Object.defineProperty(mesh,'onBeforeRender',{value:original,writable:true,enumerable:false,configurable:false});
    const before=Object.getOwnPropertyDescriptor(mesh,'onBeforeRender');let observed=0;
    const restore=wrapWiperDrawCallback(mesh,()=>observed++);
    assert.throws(()=>{try{mesh.onBeforeRender();throw Error('renderer failed');}finally{restore();}},/renderer failed/);
    assert.equal(mesh.calls,1);assert.equal(observed,1);assert.equal(mesh.onBeforeRender,original);
    assert.deepEqual(Object.getOwnPropertyDescriptor(mesh,'onBeforeRender'),before);
  }
  const mesh=Object.create({onBeforeRender:original}),restore=wrapWiperDrawCallback(mesh,()=>{}),replacement=()=>{};
  mesh.onBeforeRender=replacement;assert.throws(restore,/unrelated owner/);assert.equal(mesh.onBeforeRender,replacement);
});

test('actual shared capture scheduler executes production Actor charge/tap admission for all six cases and rejects expired Lite tap frame8', {timeout:180000}, async t=>{
  const {sourceLoadedActorFixture}=await import('../../patches/splatoon3/tests/source-loaded-actor-fixture.mjs');
  const f=await sourceLoadedActorFixture({random:()=>.5,sourceOnly:true}),rows=[];
  try{for(const c of CASES){
    const a=await f.make();a.setWeapon(c.id);a.character.onEvent=null;
    const input={keys:new Set(),pressed:new Set(),padPressed:new Set(),mouse:{dx:0,dy:0,left:false,right:false},
      down(k){return this.keys.has(k);},wasPressed(k){return this.pressed.has(k);},padButton:()=>false,padValue:()=>0};
    const rig={yaw:0,pitch:.06,mode:'follow',target:a},controller=new f.PlayerController(a,rig,input);
    // Existing source fixture owns an isolated floor/aim, not a GPU/game rAF.
    controller.computeAim=()=>{};f.G.rig=rig;f.G.local=a;f.G.settings.aimAssist=0;
    const step=()=>{f.G.time+=1/60;controller.update(1/60);a.update(1/60);f.G.projectiles.update(1/60);input.pressed.clear();};
    for(let i=0;i<60;i++)step();assert.equal(f.G.projectiles.list.length,0);
    const active=()=>f.G.projectiles.list.filter(p=>p.owner===a&&p.delay<=0&&!p.catalog?.birthPending);
    const schedule=createWiperNativeShotSchedule(c,{setFire:on=>{input.mouse.left=on;},step,
      readActive:()=>active().map(p=>({id:p.wid,sourceActor:p.catalog.r.sourceActor,descriptor:p.catalog.descriptor.key,age:p.age,seed:p.seed,pos:p.pos.toArray()})),
      readHeld:()=>({chargeF:a.weaponRunner.catalogState.chargeF})});
    const first=active()[0];assert.ok(first);assert.ok(schedule.firstBirth.tick>c.hold);assert.equal(schedule.firstBirth.age,first.age);
    const samples=[];
    for(const frame of FRAMES[c.action]){
      schedule.advanceTo(frame);assert.equal(active().length,1);assert.equal(active()[0],first);
      assert.equal(first.catalog.r.sourceActor,c.sourceActor);assert.equal(first.catalog.descriptor.key,c.descriptor);
      assert.equal(schedule.tick-schedule.firstBirth.tick+1,frame);samples.push({frame,age:first.age,life:first.life});
    }
    if(c.key==='lite-tap')assert.throws(()=>schedule.advanceTo(8),/exact active shot phase missing/,'old global frame8 policy must fail naturally, without extending the real shot');
    rows.push({case:c.key,firstBirth:schedule.firstBirth,held:schedule.held,samples});
    f.reset();
  }}finally{f.reset();}
  assert.equal(rows.length,6);t.diagnostic(JSON.stringify({kind:'source-only actual Actor shared schedule, not native browser pixels',rows}));
});

test('additive catalog workflow retains inherited Hissen/phase52 route and binds Wiper result to same immutable build',()=>{
  const workflow=fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml',import.meta.url),'utf8');
  const lane=parseBrowserLane(workflow,'catalog');
  const capture=lane.commands.find(c=>c.name==='Capture all current-head Wiper charged and tap native views');assert.ok(capture);
  assert.match(capture.command,/timeout 30m node scripts\/check-inkwave-wiper-native-acceptance\.mjs .* --source-sha "\$SOURCE_SHA"/);
  assert.match(capture.command,/node scripts\/check-inkwave-wiper-native-receipt\.mjs/);
  assert.ok(lane.commands.some(c=>c.command.includes('check-inkwave-trislosher-native-matched.mjs')&&c.command.includes('--measure-main')));
  const binding=lane.commands.find(c=>c.name==='Bind passing browser evidence to the tested commit').command;
  assert.match(binding,/'hissen-main\/native-browser.json','wiper-native\/wiper-native-result.json'/);
  assert.match(binding,/reports\['wiper-native\/wiper-native-result.json'\]\['sourceSha'\].*os.environ\['SOURCE_SHA'\]/);
  assert.match(binding,/report\['contentHash'\]==build\['contentHash'\]/);
  const driver=fs.readFileSync(new URL('../check-inkwave-wiper-native-acceptance.mjs',import.meta.url),'utf8');
  assert.match(driver,/verifyRuntimeBuild\(site,root,sourceSha\)/);assert.match(driver,/launchSandboxBrowser\(chromium\)/);
  assert.ok(!driver.includes('--no-sandbox'));assert.ok(!driver.includes('new Projectile'));
  assert.match(driver,/p\.descriptor!==testCase\.descriptor/);assert.match(driver,/p=>p\.owner===a&&p\.delay<=0&&!p\.catalog\?\.birthPending/);
  assert.match(driver,/finally\{window\.__restoreWiperRenderState\(restoreDraw,r,previousTarget,previousAuto,previousInfoAuto,primaryRenderError\)/);assert.match(driver,/finally\{await finishWiperContext\(context,row,save,result.errors,primaryError\)/);assert.match(finishWiperContext.toString(),/await context.close\(\)/);
  assertWiperCaptureReceipt(fixture().receipt,{sourceSha,...buildBinding});
});
