import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import {CASES,classifyTransition,installTrace,validateGestures,secureBrowserOptions,assertInputHash,finalizeDiagnostic,closeDiagnosticOwners,boundedAction,orderedFrames,harnessIdentity,run} from '../check-inkwave-charger-reticle-native.mjs';
const normal=CASES[0],scoped=CASES[1];const before=c=>({time:1,gameTime:1,matchState:'playing',paused:false,menu:null,weapon:c.source,hudWeapon:c.source,runnerCharging:true,charge:1,chargingCache:true,scopeCache:1,scopeComputedOpacity:1,scopeSemanticFamily:'charger',scopeSemanticConfigured:true,scopeExpectedFactor:1,chargingClass:true,scoped:true,chargeElement:1});const after=(c,shown)=>({time:3,gameTime:3,matchState:'playing',paused:false,menu:null,weapon:c.target,hudWeapon:c.target,runnerCharging:true,charge:1,chargingCache:true,scopeCache:1,scopeComputedOpacity:1,scopeSemanticFamily:'charger',scopeSemanticConfigured:true,scopeExpectedFactor:1,chargingClass:shown,scoped:shown,chargeElement:2});
const fullSequence=(c,shown)=>{const b=before(c),a=after(c,shown);return [b,{...b,time:2,gameTime:2},a,{...a,time:4,gameTime:4}];};
for(const c of [normal,scoped])test(c.name+' rAF results remain inconclusive about the first rebuild',()=>{
 const good=fullSequence(c,true),bad=fullSequence(c,false);assert.deepEqual([good,bad].map(x=>classifyTransition(x,c).status),['inconclusive','inconclusive']);
 assert.equal(classifyTransition(good,c).observation,'class-present');assert.equal(classifyTransition(bad,c).observation,'class-missing');
 assert.equal(classifyTransition([before(c),after(c,true)],c).observation,'insufficient');
});
test('a qualified missing class is never masked by later success or stale cache',()=>{
 for(const c of [normal,scoped]){const q=fullSequence(c,false);q[3].chargingCache=false;q[3].scopeCache=0;q.push({...after(c,true),time:5,gameTime:5});const r=classifyTransition(q,c);assert.equal(r.observation,'class-missing');assert.equal(r.missing.length,1);assert.equal(r.missing[0].time,4);}
});
test('trusted canvas fire and pause must occur in source-to-target order',()=>{const c=normal,e=[{type:'click',id:'w-'+c.source,time:1},{type:'mousedown',tag:'CANVAS',button:0,time:2},{type:'keydown',key:'KeyP',time:3},{type:'click',id:'w-'+c.target,time:4},{type:'mousedown',tag:'CANVAS',button:0,time:5},{type:'mouseup',tag:'CANVAS',button:0,time:6}].map(x=>({...x,trusted:true}));assert.equal(validateGestures(e,c),true);for(const i of [0,1,2,3,4,5]){const bad=structuredClone(e);bad[i].trusted=false;assert.equal(validateGestures(bad,c),false);}const bad=structuredClone(e);bad[4].tag='BUTTON';assert.equal(validateGestures(bad,c),false);bad[4].tag='CANVAS';bad[4].time=3;assert.equal(validateGestures(bad,c),false);});
test('trace is read-only and bounded; driver uses native controls and fail-closed gates',()=>{const trace=installTrace.toString();assert.match(trace,/frameCount%6000/);assert.doesNotMatch(trace,/\.setWeapon\(|\.startMatch\(|\.dispatchEvent\(|\.classList\.(add|remove|toggle)\(/);const s=fs.readFileSync(new URL('../check-inkwave-charger-reticle-native.mjs',import.meta.url),'utf8');for(const bit of ['verifyRuntimeBuild(site,root,sha)','chromium.launch(browserOptions)','enterRangeFromMenu','rangeMenuControlReady','validateGestures(trace.events,c)','page.mouse.down()','page.keyboard.press(\'KeyP\')','closeDiagnosticOwners({browser,server},result.errors)'])assert.ok(s.includes(bit),bit);assert.doesNotMatch(s,/force:\s*true|--no-sandbox|\.dispatchEvent\(|\.startMatch\(|\.setWeapon\(/);});
test('secure browser options never disable sandbox or enable unsafe rendering',()=>{const o=secureBrowserOptions();assert.equal(o.chromiumSandbox,true);assert.deepEqual(o.args,['--disable-dev-shm-usage']);assert.doesNotMatch(JSON.stringify(o),/no-sandbox|unsafe/);});
test('manifest input tamper fails closed',async()=>{const {hash}=await import('../lib/inkwave-runtime-evidence.mjs');const files={a:'digest'},m={files,inputHash:hash(JSON.stringify(files))};assert.doesNotThrow(()=>assertInputHash(m));m.files.b='changed';assert.throws(()=>assertInputHash(m),/manifest hash mismatch/);});
test('cleanup failures fail status and retain primary error',async()=>{for(const primary of [null,Error('primary')])for(const problem of [false,true]){const result={status:primary?'failed':'completed',error:primary?String(primary.stack):undefined,errors:[]},saves=[];const cleanup=async()=>{if(problem)result.errors.push('close failed');return {closed:!problem};};const failure=await finalizeDiagnostic(result,cleanup,primary,()=>saves.push(JSON.stringify(result)));assert.equal(saves.length,1);if(problem){assert.equal(result.status,'failed');if(primary)assert.equal(failure,primary);assert.match(result.error,primary?/primary/:/close failed/);}else assert.equal(failure,primary);}});
test('hung cleanup is bounded and still attempts independent server closure',async()=>{const errors=[];let serverCalls=0;const result=await closeDiagnosticOwners({browser:{close:()=>new Promise(()=>{})},server:{listening:true,close:cb=>{serverCalls++;cb();}}},errors,10);assert.equal(result.browserClosed,false);assert.equal(result.serverClosed,true);assert.equal(serverCalls,1);assert.match(errors[0],/Deadline exceeded/);});
test('existing evidence directory is never overwritten',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'charger-existing-'));try{await assert.rejects(run({site:dir,root:dir,sha:'a'.repeat(40),out:dir}),e=>e.code==='EEXIST');}finally{fs.rmSync(dir,{recursive:true});}});
test('workflow pins both heads and trees, bounds processes, retains evidence, and calls visual status inconclusive',()=>{const s=fs.readFileSync(new URL('../../.github/workflows/inkwave-charger-reticle-diagnostic.yml',import.meta.url),'utf8');for(const bit of ['a8877a086cc377074a07de60eba5f17c7b1213a1','66d8c5724b1fbd34b31d83880da43cb049098a7b','5ae30f11763b952df917d7b272a884e4fbc8a98e','bd322eb534e0d43a19f397c0417f69234449e854','timeout --signal=TERM --kill-after=10s 450s','if: always()','inconclusive','persist-credentials: false','timeout or kill'])assert.ok(s.includes(bit),bit);assert.doesNotMatch(s,/--no-sandbox|enable-unsafe/);});

test('screenshot and CSS classes are not called pixel visibility proof',()=>{const s=fs.readFileSync(new URL('../check-inkwave-charger-reticle-native.mjs',import.meta.url),'utf8');assert.ok(s.includes('occlusion and rendered pixels are not established'));assert.ok(s.includes('classes-present'));assert.ok(!s.includes('observed-visible'));assert.ok(s.includes('sha256:hash(afterImage)'));});

test('expired deadline never dispatches a queued native action',async()=>{let calls=0;await assert.rejects(boundedAction(()=>{calls++;},()=>{throw Error('expired');},()=>{},'input'),/expired/);await Promise.resolve();assert.equal(calls,0);let reads=0;await assert.rejects(boundedAction(()=>{calls++;},()=>{if(++reads===1)return 10;throw Error('expired');},()=>{},'input'),/expired/);assert.equal(calls,0);});

test('wrapped 6000-frame ring is sorted on a copy and uses nearest chronological source',()=>{
 const c=normal,chronological=Array.from({length:6005},(_,i)=>({...before(c),time:i,gameTime:i}));chronological[6003]={...after(c,true),time:6003,gameTime:6003};chronological[6004]={...after(c,true),time:6004,gameTime:6004};
 const wrapped=chronological.slice(6000).concat(chronological.slice(5,6000)),snapshot=JSON.stringify(wrapped),result=classifyTransition(wrapped,c);
 assert.equal(result.before.time,6002);assert.equal(result.after.time,6004);assert.equal(result.observation,'class-present');assert.equal(JSON.stringify(wrapped),snapshot);
 assert.equal(orderedFrames([{time:NaN}]),null);assert.equal(classifyTransition([{time:NaN}],c).observation,'insufficient');
});
test('receipt harness identity binds the diagnostic HEAD and committed helper bytes',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'charger-harness-'));const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 try{git('init','-q');git('config','user.email','qa@example.invalid');git('config','user.name','QA');for(const f of ['scripts/check-inkwave-charger-reticle-native.mjs','scripts/lib/inkwave-runtime-evidence.mjs','scripts/lib/inkwave-range-menu-entry.mjs']){fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});fs.writeFileSync(path.join(root,f),f);}
 git('add','scripts');git('commit','-qm','fixture');const r=harnessIdentity(root);assert.equal(r.diagnosticHead,git('rev-parse','HEAD'));assert.match(r.scriptSha256,/^[0-9a-f]{64}$/);assert.match(r.helperSha256.rangeMenuEntry,/^[0-9a-f]{64}$/);fs.appendFileSync(path.join(root,'scripts/lib/inkwave-range-menu-entry.mjs'),'tamper');assert.throws(()=>harnessIdentity(root),/Harness file differs/);
 }finally{fs.rmSync(root,{recursive:true});}
});
test('charged class missing is a nonzero diagnostic error, without acceptance-passed fields',()=>{const s=fs.readFileSync(new URL('../check-inkwave-charger-reticle-native.mjs',import.meta.url),'utf8');assert.match(s,/if\(result\.uiStatus==='classes-missing'\)throw Error/);assert.match(s,/result\.reproductionStatus='inconclusive'/);assert.doesNotMatch(s,/acceptance.passed|acceptancePassed/);});

test('partial, pause, menu and weapon changes break full-charge qualification',()=>{
 const c=normal,b=before(c),a=after(c,true),prefix=[b,{...b,time:2,gameTime:2},a];
 for(const mutate of [x=>{x.charge=.5;},x=>{x.paused=true;},x=>{x.menu='pause';},x=>{x.weapon='shooter';},x=>{x.hudWeapon='shooter';},x=>{x.matchState='intro';},x=>{x.runnerCharging=false;}]){
  const interruption={...a,time:4,gameTime:4};mutate(interruption);const missing={...a,time:5,gameTime:5,chargingClass:false,chargingCache:false};
  const transient=classifyTransition([...prefix,interruption,missing],c);assert.equal(transient.observation,'insufficient');assert.ok(transient.rawMissing.some(x=>x.sample.time===5&&!x.qualified&&x.reasons.length));
  assert.equal(classifyTransition([...prefix,interruption,missing,{...missing,time:6,gameTime:6}],c).observation,'class-missing');
 }
});

test('scoped expected class uses native scope semantics, not cached or eased opacity',()=>{
 const c=scoped,b=before(c),a=after(c,false),samples=[b,{...b,time:2,gameTime:2},a,{...a,time:4,gameTime:4,scopeComputedOpacity:.1,scopeCache:0}];
 const mature=classifyTransition(samples,c);assert.equal(mature.observation,'class-missing');assert.equal(mature.missing.at(-1).scopeCache,0);
 for(const mutate of [x=>{x.scopeSemanticFamily=null;},x=>{x.scopeSemanticConfigured=false;},x=>{x.scopeExpectedFactor=null;},x=>{x.scopeExpectedFactor=.5;}]){
  const copy=structuredClone(samples);mutate(copy[3]);const unknown=classifyTransition(copy,c);assert.equal(unknown.observation,'insufficient');assert.ok(unknown.rawMissing.some(x=>!x.qualified&&x.reasons.includes('scope-semantic-expectation-not-established')));
 }
 const source=installTrace.toString();assert.match(source,/chargerTuning\.js/);assert.match(source,/m\.chargerScopeFactor/);
});

test('scope semantic evidence records emitted module binding and observer failures',()=>{const s=fs.readFileSync(new URL('../check-inkwave-charger-reticle-native.mjs',import.meta.url),'utf8');for(const bit of ['scopeKey','manifest.artifacts[scopeKey]','result.scopeModule.served=true','row.scopeModuleError=trace.scopeModuleError','row.frameCount=trace.frameCount'])assert.ok(s.includes(bit),bit);});

test('truncated bounded history cannot report class-present even if retained tail looks healthy',()=>{
 const c=normal,tail=fullSequence(c,true),copy=JSON.stringify(tail),r=classifyTransition(tail,c,6004);
 assert.equal(r.observation,'insufficient');assert.equal(r.rawHistoryStatus,'raw-history-truncated');assert.equal(r.droppedFrames,6000);assert.equal(JSON.stringify(tail),copy);
 const missing=fullSequence(c,false);assert.equal(classifyTransition(missing,c,6004).observation,'class-missing');
 const invalid=classifyTransition(tail,c,1);assert.equal(invalid.rawHistoryStatus,'invalid-frame-count');assert.equal(invalid.observation,'insufficient');
});

test('target HUD readiness never gates on cached charge or scope state',()=>{
 const s=fs.readFileSync(new URL('../check-inkwave-charger-reticle-native.mjs',import.meta.url),'utf8');const at=s.indexOf("'target HUD owner'"),start=s.lastIndexOf('await bounded',at),expr=s.slice(start,at);assert.ok(at>0);assert.doesNotMatch(expr,/chargingCache|L\.charging|L\.scope|_L\?\.scope/);
 const c=scoped,q=fullSequence(c,false);q[3].chargingCache=false;q[3].scopeCache=0;assert.equal(classifyTransition(q,c).observation,'class-missing');
});
