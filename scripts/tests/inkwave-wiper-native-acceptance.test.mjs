import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {WIPER_CAPTURE_CASES as CASES,WIPER_CAPTURE_FRAMES as FRAMES,assertWiperCaptureReceipt,wiperBuildReceiptBinding} from '../lib/inkwave-wiper-acceptance-contract.mjs';
import {sandboxBrowserOptions,launchSandboxBrowser,closeWiperCaptureOwners} from '../lib/inkwave-sandbox-browser.mjs';
import {verifyWiperCaptureFiles} from '../check-inkwave-wiper-native-receipt.mjs';
import {hash} from '../lib/inkwave-runtime-evidence.mjs';
import {parseBrowserLane} from '../ci/run-circleci-browser-lane.mjs';
import {createWiperNativeShotSchedule,wrapWiperDrawCallback,wrapWiperComposerPasses,assertWiperWebGLError,finishWiperContext} from '../check-inkwave-wiper-native-acceptance.mjs';

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
  assert.match(driver,/window\.__assertWiperWebGLError\(gl,frame,view\+':'\+stage\)/);
  for(const stage of ['before-native-phase','after-native-phase','after-geometry-upload','after-render','after-readback'])
    assert.ok(driver.includes("glBoundary('"+stage+"')"),'missing first-error GL boundary '+stage);
  assert.match(driver,/assertWiperWebGLError\.toString\(\)/);
});

test('composer diagnostics preserve pass calls and restore own and inherited methods, including failures',()=>{
  class Pass {render(value){return value+1;}}
  const inherited=new Pass(),own=new Pass(),calls=[];
  Object.defineProperty(own,'render',{value(v){return v*2;},writable:true,configurable:true,enumerable:true});
  const descriptor=Object.getOwnPropertyDescriptor(own,'render');
  const restore=wrapWiperComposerPasses({passes:[inherited,own]},(index,pass)=>calls.push([index,pass]));
  assert.equal(inherited.render(2),3);assert.equal(own.render(3),6);
  assert.deepEqual(calls,[[0,inherited],[1,own]]);restore();
  assert.equal(Object.hasOwn(inherited,'render'),false);assert.deepEqual(Object.getOwnPropertyDescriptor(own,'render'),descriptor);
  const failure=Error('WebGL error');const restoreFailure=wrapWiperComposerPasses({passes:[inherited]},()=>{throw failure;});
  assert.throws(()=>inherited.render(1),e=>e===failure);restoreFailure();assert.equal(Object.hasOwn(inherited,'render'),false);
  const unsupported={};Object.defineProperty(unsupported,'render',{value(){},writable:false});
  assert.throws(()=>wrapWiperComposerPasses({passes:[inherited,unsupported]},()=>{}),/Unsupported/);
  assert.equal(Object.hasOwn(inherited,'render'),false,'failed installation restores earlier passes');
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
  assert.match(driver,/finally\s*\{[\s\S]*?\[restorePasses,restoreDraw,\(\)=>r\.setRenderTarget/);assert.match(driver,/finally\{await finishWiperContext\(context,row,save,result.errors,primaryError,hadPrimaryError\)/);assert.match(finishWiperContext.toString(),/await context.close\(\)/);
  assertWiperCaptureReceipt(fixture().receipt,{sourceSha,...buildBinding});
});


test('composer cleanup restores all unaffected passes after an ownership conflict',()=>{
  class Pass {render(){return 1;}}
  const a=new Pass(), b=new Pass(), foreign=function(){return 2};
  const restore=wrapWiperComposerPasses({passes:[a,b]},()=>{});
  b.render=foreign;
  assert.throws(()=>restore(),/replaced by unrelated owner/);
  assert.equal(b.render,foreign,'never clobber the newer owner');
  assert.equal(Object.hasOwn(a,'render'),false,'other wrapper must still be removed');
});

test('actual capture retains the primary pass GL error while restoring unaffected pass owners',()=>{
  // Exact source-bound capture body, plain objects only; no browser or game.
  const driver=fs.readFileSync(new URL('../check-inkwave-wiper-native-acceptance.mjs',import.meta.url),'utf8');
  const begin=driver.indexOf('    capture(frame,view){'),end=driver.indexOf('\n    finish(){',begin);
  assert.ok(begin>=0&&end>begin);const method=driver.slice(begin,end).trim().replace(/,$/,'');
  let queued=0, observer,drawRestored=0,targetRestored=0;const gl={getError(){let value=queued;queued=0;return value;},isContextLost(){return false;},drawingBufferWidth:960,drawingBufferHeight:720};
  class Pass {render(){}} const a=new Pass(), b=new Pass(),foreign=function(){};
  b.render=function(){queued=0x502;b.render=foreign;};
  const attr={count:0,array:new Float32Array(3)},mesh={count:2,geometry:{attributes:{position:attr},index:null,getAttribute:()=>attr},material:{},instanceMatrix:{array:new Float32Array(32)},instanceColor:{array:new Float32Array(6)},matrixWorld:{},getMatrixAt(){},updateMatrixWorld(){}};
  const r={autoClear:true,info:{autoReset:true,render:{calls:1},reset(){}},getRenderTarget:()=>({old:true}),setRenderTarget(){targetRestored++;},render(){}};
  const composer={passes:[a,b]},P={_s3Shapes:{slash:mesh},s3ShapeCounts:{},_draw(){}};
  const context={window:{__assertWiperWebGLError:assertWiperWebGLError,__wrapWiperComposerPasses:wrapWiperComposerPasses,__wrapWiperDrawCallback(_mesh,fn){observer=fn;return ()=>{drawRestored++;};}},gl,scheduler:{tick:1,advanceTo(){}},P,testCase:{mesh:'slash'},refs:null,state:()=>({stable:true}),THREE:{Matrix4:class{premultiply(){}},Vector3:class{}},camera:{},r,g:{R:{composer,render(){b.render();observer([null,{overrideMaterial:false}]);}}},G:{camera:{}},readPixels:()=>({luminanceRange:100}),camState:()=>({})};
  const capture=vm.runInNewContext('({'+method+'}).capture',context);
  assert.throws(()=>capture(1,'native-postprocessed'),e=>e.message.includes('code=0x502')&&e.message.includes('composer-pass-1'));
  assert.equal(b.render,foreign);assert.equal(Object.hasOwn(a,'render'),false);
  assert.equal(drawRestored,1);assert.equal(targetRestored,1);
  assert.equal(r.autoClear,true);assert.equal(r.info.autoReset,true);
});

test('actual Wiper capture fails closed on a WebGL error queued during renderer restoration',()=>{
  // Evaluate the exact capture method from the checked-in driver with plain stubs;
  // no game, browser, or renderer is launched. The injected error models an
  // asynchronous WebGL error queued by setRenderTarget while restoring state.
  const driver=fs.readFileSync(new URL('../check-inkwave-wiper-native-acceptance.mjs',import.meta.url),'utf8');
  const begin=driver.indexOf('    capture(frame,view){');
  const end=driver.indexOf('\n    finish(){',begin);
  assert.ok(begin>=0&&end>begin,'capture source boundaries must exist');
  const method=driver.slice(begin,end).trim().replace(/,$/,'');
  for(const view of ['native-postprocessed','fixed-side-raw'])for(const restoreError of [0x0502,0]){
    let queued=0,drawObserver,restored=0,reads=[];
    const gl={drawingBufferWidth:960,drawingBufferHeight:720,getError(){const e=queued;queued=0;reads.push(e);return e;},isContextLost(){return false;}};
    const attr={count:0,array:new Float32Array(3)};
    const mesh={count:2,geometry:{attributes:{position:attr},index:null,getAttribute:()=>attr},material:{},instanceMatrix:{array:new Float32Array(32)},instanceColor:{array:new Float32Array(6)},matrixWorld:{},getMatrixAt(){},updateMatrixWorld(){}};
    const r={autoClear:true,info:{autoReset:true,render:{calls:1},reset(){}},getRenderTarget:()=>({old:true}),setRenderTarget(target){if(target?.old){restored++;queued=restoreError;}},render(){drawObserver([null,{overrideMaterial:false}]);}};
    const P={_s3Shapes:{slash:mesh},s3ShapeCounts:{},_draw(){}};
    const G={renderer:r,camera:{}};
    const context={window:{__assertWiperWebGLError:assertWiperWebGLError,__wrapWiperComposerPasses:wrapWiperComposerPasses,__wrapWiperDrawCallback(_mesh,fn){drawObserver=fn;return ()=>{};}},gl,scheduler:{tick:1,advanceTo(){}},P,testCase:{mesh:'slash'},refs:null,state:()=>({stable:true}),THREE:{Matrix4:class{premultiply(){}},Vector3:class{}},camera:{},r,g:{R:{composer:{passes:[]},render(){drawObserver([null,{overrideMaterial:false}]);}}},G,readPixels:()=>({luminanceRange:100}),camState:()=>({})};
    const capture=vm.runInNewContext('({'+method+'}).capture',context);
    if(restoreError)assert.throws(()=>capture(1,view),e=>e.message.includes('code=0x502')&&e.message.includes('after-restore'));
    else assert.doesNotThrow(()=>capture(1,view));
    assert.equal(restored,1);assert.equal(queued,0,'restore GL error must be observed, not left queued');
    assert.equal(reads.length,6,'all five original boundaries and post-restore boundary must execute');
  }
});


test('failed composer installation preserves primary error while cleaning every owned wrapper',()=>{
  class Pass {render(){}} const a=new Pass(),b=new Pass(),foreign=function(){},unsupported={};
  Object.defineProperty(unsupported,'render',{get(){b.render=foreign;return ()=>{};}});
  assert.throws(()=>wrapWiperComposerPasses({passes:[a,b,unsupported]},()=>{}),e=>e.message.includes('Unsupported native composer pass')&&e.message.includes('replaced by unrelated owner'));
  assert.equal(Object.hasOwn(a,'render'),false);assert.equal(b.render,foreign);
});


test('actual capture reports null primary before a cleanup conflict',()=>{
  // Exact source-bound capture body, plain objects only; no browser or game.
  const driver=fs.readFileSync(new URL('../check-inkwave-wiper-native-acceptance.mjs',import.meta.url),'utf8');
  const begin=driver.indexOf('    capture(frame,view){'),end=driver.indexOf('\n    finish(){',begin);
  assert.ok(begin>=0&&end>begin);const method=driver.slice(begin,end).trim().replace(/,$/,'');
  let queued=0, observer,drawRestored=0,targetRestored=0;const gl={getError(){let value=queued;queued=0;return value;},isContextLost(){return false;},drawingBufferWidth:960,drawingBufferHeight:720};
  class Pass {render(){}} const a=new Pass(), b=new Pass(),foreign=function(){};
  b.render=function(){b.render=foreign;throw null;};
  const attr={count:0,array:new Float32Array(3)},mesh={count:2,geometry:{attributes:{position:attr},index:null,getAttribute:()=>attr},material:{},instanceMatrix:{array:new Float32Array(32)},instanceColor:{array:new Float32Array(6)},matrixWorld:{},getMatrixAt(){},updateMatrixWorld(){}};
  const r={autoClear:true,info:{autoReset:true,render:{calls:1},reset(){}},getRenderTarget:()=>({old:true}),setRenderTarget(){targetRestored++;},render(){}};
  const composer={passes:[a,b]},P={_s3Shapes:{slash:mesh},s3ShapeCounts:{},_draw(){}};
  const context={window:{__assertWiperWebGLError:assertWiperWebGLError,__wrapWiperComposerPasses:wrapWiperComposerPasses,__wrapWiperDrawCallback(_mesh,fn){observer=fn;return ()=>{drawRestored++;};}},gl,scheduler:{tick:1,advanceTo(){}},P,testCase:{mesh:'slash'},refs:null,state:()=>({stable:true}),THREE:{Matrix4:class{premultiply(){}},Vector3:class{}},camera:{},r,g:{R:{composer,render(){b.render();observer([null,{overrideMaterial:false}]);}}},G:{camera:{}},readPixels:()=>({luminanceRange:100}),camState:()=>({})};
  const capture=vm.runInNewContext('({'+method+'}).capture',context);
  assert.throws(()=>capture(1,'native-postprocessed'),e=>e.message.startsWith('null\nRender cleanup:')&&e.message.includes('replaced by unrelated owner'));
  assert.equal(b.render,foreign);assert.equal(Object.hasOwn(a,'render'),false);
  assert.equal(drawRestored,1);assert.equal(targetRestored,1);
  assert.equal(r.autoClear,true);assert.equal(r.info.autoReset,true);
});

test('composer cleanup survives a null thrown value and continues restoration',()=>{
  class Pass {render(){}} const a=new Pass(),b=new Pass();
  const restore=wrapWiperComposerPasses({passes:[a,b]},()=>{});
  Object.defineProperty(b,'render',{configurable:true,get(){throw null;}});
  assert.throws(()=>restore(),e=>e.message.includes('Composer cleanup: null'));
  assert.equal(Object.hasOwn(a,'render'),false);
});

test('null composer installation failure remains first when rollback also fails',()=>{
  class Pass {render(){}} const a=new Pass(),foreign=()=>{},bad={};
  Object.defineProperty(bad,'render',{get(){a.render=foreign;throw null;}});
  assert.throws(()=>wrapWiperComposerPasses({passes:[a,bad]},()=>{}),e=>e.message.startsWith('null\nComposer installation cleanup:')&&e.message.includes('replaced by unrelated owner'));
  assert.equal(a.render,foreign);
});

import {parse as parseCaptureInstaller} from '../../patches/loading-cache/vendor/acorn.mjs';
import {installHissenCaptureObserver} from '../lib/inkwave-hissen-capture-observer.mjs';
for(const [file,bindings,globals]of [
 ['check-inkwave-wiper-native-acceptance.mjs',{createWiperNativeShotSchedule,wrapWiperDrawCallback,wrapWiperComposerPasses,assertWiperWebGLError},['__createWiperNativeShotSchedule','__wrapWiperDrawCallback','__wrapWiperComposerPasses','__assertWiperWebGLError']],
 ['check-inkwave-trislosher-native-matched.mjs',{installHissenCaptureObserver},['installHissenCaptureObserver']]
])test('native capture installs identical trusted helpers without page-side string compilation: '+file,()=>{
 const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),ast=parseCaptureInstaller(source,{sourceType:'module',ecmaVersion:'latest'}),installers=[];
 function walk(node){if(!node||typeof node!=='object')return;if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&node.callee.object.name==='page'){
  assert.notEqual(node.callee.property.name,'addScriptTag','capture must not inject an inline script blocked by production CSP');
  if(node.callee.property.name==='evaluate'&&node.arguments[0]?.type==='NewExpression'&&node.arguments[0].callee.name==='Function')installers.push(node.arguments[0]);
 }for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}
 walk(ast);assert.equal(installers.length,1,'exactly one callable installer, compiled in Node');
 const expression=source.slice(installers[0].start,installers[0].end);
 const installer=new Function(...Object.keys(bindings),'return '+expression)(...Object.values(bindings));
 const window={},context=vm.createContext({window},{codeGeneration:{strings:false,wasm:false}});
 assert.throws(()=>vm.runInContext('(0,eval)("1")',context),/Code generation from strings disallowed/);
 new vm.Script('('+installer.toString()+')()').runInContext(context);
 assert.deepEqual(Object.keys(window),globals);
 Object.values(bindings).forEach((fn,index)=>assert.equal(window[globals[index]].toString(),fn.toString(),'serialized helper bytes and closure-free declaration preserved'));
 assert.doesNotMatch(installer.toString(),/\beval\s*\(|new\s+Function\s*\(/,'no nested page-side evaluator');
});
