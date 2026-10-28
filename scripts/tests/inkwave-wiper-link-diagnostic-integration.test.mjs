import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {execFileSync} from 'node:child_process';
import {runWiperLinkProbe} from '../lib/inkwave-wiper-link-probe.mjs';
import {validateWiperLinkProof} from '../check-inkwave-wiper-link-diagnostic.mjs';
import {captureWiperPassInventory,executeWiperPassProbe,normalizeWiperDiagnosticError,persistWiperPassFailure,finishWiperContext,closeWiperOwnersSafely,finalizeWiperPassEvidence,recordWiperConsoleMessage} from '../check-inkwave-wiper-link-diagnostic-capture.mjs';
import {createWiperConsoleEvidence} from '../lib/inkwave-wiper-console-evidence.mjs';
const sha='a'.repeat(40);function receipt(linked){const error=linked?'Wiper link diagnostic completed: fixture':'Wiper link diagnostic: fixture';return {status:'failed',error,diagnosticFailure:{primaryError:error},sourceSha:sha,sourceIdentity:{checkoutSha:sha,checkoutIdentityStatus:'verified-git-head'},diagnosticOnly:true,sandbox:true,backend:{extraArgs:[]},moduleObservations:{status:'verified'},cleanup:{browserClosed:true,serverClosed:true},errors:[],passProbe:{acceptance:false,frame:1,view:'native-postprocessed',ok:linked,state:{status:linked?'completed':'exception',renderState:linked?'completed':'potentially-dirty',primary:linked?null:{kind:'link-failed'},restoreErrors:[],coverage:{passCalls:1,sceneCalls:1,colorTargetSeen:1,programCalls:1,rendererSame:true,passSame:true,composerSame:true,sceneSame:true,targetMaterialSame:true,passStillInComposer:true},observations:[{linked,nativeUseProgramCalled:linked,programLog:{text:linked?'':'ERROR: reserved word patch'},shaders:[{type:'vertex',compiled:true,log:{text:''}},{type:'fragment',compiled:linked,log:{text:linked?'':'patch reserved'}}]}]}}};}

test('proof requires actual target-specific link/compile evidence and rejects missing or wrong results',()=>{
 const before=receipt(false),after=receipt(true);assert.equal(validateWiperLinkProof(before,sha,'unlinked').acceptance,false);assert.equal(validateWiperLinkProof(after,sha,'linked').acceptance,false);
 for(const mutate of [r=>r.passProbe.state.coverage.colorTargetSeen=0,r=>r.passProbe.state.observations[0].programLog.text='',r=>r.moduleObservations.status='incomplete',r=>r.errors.push('console'),r=>{r.error='unrelated failure';r.diagnosticFailure.primaryError=r.error}]){const x=structuredClone(before);mutate(x);if(x.passProbe.state.observations[0].programLog.text==='')x.passProbe.state.observations[0].shaders[1].log.text='';assert.throws(()=>validateWiperLinkProof(x,sha,'unlinked'));}
 const missing=structuredClone(after);missing.passProbe.state.observations[0].shaders[0].compiled=false;assert.throws(()=>validateWiperLinkProof(missing,sha,'linked'));
});

test('serialized target proof preserves first failure, no native use after unlinked program',()=>{
 const program={},vertex={},fragment={},gl={NO_ERROR:0,LINK_STATUS:1,SHADER_TYPE:2,COMPILE_STATUS:3,VERTEX_SHADER:4,FRAGMENT_SHADER:5,getError:()=>0,getProgramParameter:()=>false,getProgramInfoLog:()=>"reserved word patch",getAttachedShaders:()=>[vertex,fragment],getShaderParameter:(s,k)=>k===2?(s===vertex?4:5):s===vertex,getShaderInfoLog:s=>s===fragment?'patch reserved':'',useProgram(){throw Error('must not execute')}};
 const target={material:{}},scene={},renderer={renderBufferDirect(_c,_s,_g,_m,_o){gl.useProgram(program)},render(){this.renderBufferDirect({},scene,{},target.material,target)}};
 const pass={render(r){r.render()}},composer={passes:[pass]},system={renderer,renderPass:pass,composer,scene,render(){pass.render(renderer)}};const ctx={window:{}};vm.createContext(ctx);
 vm.runInContext('window.__runWiperLinkProbe='+runWiperLinkProbe.toString()+';window.__captureWiperPassInventory='+captureWiperPassInventory.toString()+';window.__execute='+executeWiperPassProbe.toString(),ctx);
 assert.throws(()=>ctx.window.__execute(gl,system,target,1,'native-postprocessed'),/Wiper link diagnostic/);const rec=ctx.window.__wiperPassReceipt;assert.equal(rec.ok,false);assert.equal(rec.state.primary.kind,'link-failed');assert.equal(rec.state.observations[0].nativeUseProgramCalled,false);assert.equal(rec.state.renderState,'potentially-dirty');
});

test('receipt is durable before hanging close and null cleanup cannot replace primary',async()=>{
 const primary=Error('original primary'),result={},events=[];assert.equal(persistWiperPassFailure(result,primary,()=>events.push('save')).saved,true);
 const pending=finishWiperContext({close(){events.push('close');return new Promise(()=>{});}},{},()=>{},[],primary);await Promise.race([pending,new Promise(r=>setTimeout(r,20))]);assert.deepEqual(events,['save','close']);
 const errors=[],owners=await closeWiperOwnersSafely({browser:{async close(){throw null}},server:{listening:true,close(cb){cb();}}},errors,primary);assert.equal(owners.primary,primary);assert.equal(owners.cleanup.serverClosed,true);assert.match(errors.join(' '),/null/);assert.equal(finalizeWiperPassEvidence({errors,status:'failed'},()=>{throw Error('save')},primary),primary);
 assert.match(normalizeWiperDiagnosticError(null).message,/null/);
});

test('bounded console unreadable/error stays fail-closed',()=>{const c=createWiperConsoleEvidence({maxEntries:1}),errors=[];for(let i=0;i<20;i++)recordWiperConsoleMessage(c,errors,{type:()=> 'error',text:()=> 'fatal'});recordWiperConsoleMessage(c,errors,{type(){throw null}});assert.equal(errors.length,1);assert.equal(c.receipt.errors,20);assert.equal(c.receipt.unreadable,1);});

test('link diagnostic keeps current acceptance untouched and never screenshots after abort',()=>{
 const s=fs.readFileSync(new URL('../check-inkwave-wiper-link-diagnostic-capture.mjs',import.meta.url),'utf8');assert.match(s,/window\.__wiperPassReceipt=null/);assert.match(s,/fail-closed diagnostic: no further page capture after error/);assert.match(s,/assert\.equal\(diagnosticBackend,true/);assert.match(s,/window\.__executeWiperPassProbe\(gl,g\.R,mesh,frame,view\)/);
});

test('isolated trigger guards preserve base and matrix pins exact baseline/candidate',()=>{
 const root=new URL('../../',import.meta.url),ref='refs/heads/diagnostic/wiper-link-fix-126-20261028';const read=p=>fs.readFileSync(new URL(p,root),'utf8');const parent=p=>execFileSync('git',['show',`126231d4d7d039ddde26a67eead5a4f27c73a425:${p}`],{cwd:root,encoding:'utf8'});
 const boot='.github/workflows/bootstrap-hex-worker-repos.yml',hex='.github/workflows/hex-fast-tail-known.yml',circle='.circleci/config.yml',guard=`    if: github.ref != '${ref}'\n`;
 assert.equal(read(boot).replace(guard,''),parent(boot));assert.equal(read(hex).replace(guard,'').replace(`    if: \${{ always() && github.ref != '${ref}' }}\n`,'    if: always()\n'),parent(hex));assert.equal(read(circle).replace('          filters:\n            branches:\n              ignore:\n                - diagnostic/wiper-link-fix-126-20261028\n',''),parent(circle));
 const w=read('.github/workflows/inkwave-wiper-link-fix-diagnostic.yml');for(const x of [ref,'126231d4d7d039ddde26a67eead5a4f27c73a425','e17441e069edf6d321eb65d54cd2be233aa6be74','570ebc9ad935f0f49209f370fb842b68072f200b','contents: read','ubuntu-22.04','--source-root','--harness-sha','github.workflow_sha','if-no-files-found: error','check-inkwave-wiper-native-acceptance.mjs'])assert.ok(w.includes(x),x);assert.doesNotMatch(w.split('permissions:')[0],/\bpaths:/);assert.doesNotMatch(w,/--no-sandbox|--enable-unsafe-swiftshader|continue-on-error:|fetch-depth: 0/);
});

test('secure Wiper variant changes only launcher import and recorded launcher hash',async()=>{
 const root=new URL('../../',import.meta.url);let expected=execFileSync('git',['show','e17441e069edf6d321eb65d54cd2be233aa6be74:scripts/check-inkwave-wiper-native-acceptance.mjs'],{cwd:root,encoding:'utf8'});
 const original="import {launchSandboxBrowser, closeWiperCaptureOwners} from './lib/inkwave-sandbox-browser.mjs';";
 const replacement="import {closeWiperCaptureOwners} from './lib/inkwave-sandbox-browser.mjs';\nimport {launchSandboxBrowser} from './lib/inkwave-wiper-secure-launcher.mjs';";
 assert.equal(expected.split(original).length,2);expected=expected.replace(original,replacement);
 const oldHash="launcherSha256:hash(fs.readFileSync(new URL('./lib/inkwave-sandbox-browser.mjs',import.meta.url)))";
 const newHash="launcherSha256:hash(fs.readFileSync(new URL('./lib/inkwave-wiper-secure-launcher.mjs',import.meta.url)))";assert.equal(expected.split(oldHash).length,2);expected=expected.replace(oldHash,newHash);
 assert.equal(fs.readFileSync(new URL('../check-inkwave-wiper-secure-acceptance.mjs',import.meta.url),'utf8'),expected);
 const {launchSandboxBrowser}=await import('../lib/inkwave-wiper-secure-launcher.mjs');let calls=0,options;
 const fake={launch(o){calls++;options=o;return Promise.resolve('browser')}};assert.equal(await launchSandboxBrowser(fake),'browser');assert.deepEqual(options,{headless:true,chromiumSandbox:true,args:[]});assert.equal(calls,1);
 const error=Error('denied');await assert.rejects(()=>launchSandboxBrowser({launch(){throw error}}),e=>e===error);
});
