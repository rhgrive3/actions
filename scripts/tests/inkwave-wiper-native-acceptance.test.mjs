import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {WIPER_CAPTURE_CASES as CASES,WIPER_CAPTURE_FRAMES as FRAMES,assertWiperCaptureReceipt} from '../lib/inkwave-wiper-acceptance-contract.mjs';
import {sandboxBrowserOptions,launchSandboxBrowser,closeWiperCaptureOwners} from '../lib/inkwave-sandbox-browser.mjs';
import {verifyWiperCaptureFiles} from '../check-inkwave-wiper-native-receipt.mjs';
import {hash} from '../lib/inkwave-runtime-evidence.mjs';
import {parseBrowserLane} from '../ci/run-circleci-browser-lane.mjs';

const sourceSha='a'.repeat(40),contentHash='b'.repeat(64),digest='c'.repeat(64);
const helperHash=file=>hash(fs.readFileSync(new URL(file,import.meta.url)));
function fixture(){
  const files=new Map(),receipt={schema:1,status:'passed',kind:'controlled-native-wiper-visual-acceptance',sourceSha,contentHash,
    sourceIdentity:{checkoutSha:sourceSha,checkoutIdentityStatus:'verified-git-head'},sandbox:true,errors:[],cleanup:{browserClosed:true,serverClosed:true},
    manifestSha256:digest,harnessSha256:helperHash('../check-inkwave-wiper-native-acceptance.mjs'),contractSha256:helperHash('../lib/inkwave-wiper-acceptance-contract.mjs'),launcherSha256:helperHash('../lib/inkwave-sandbox-browser.mjs'),inputHash:digest,
    modules:{'exact-module.mjs':digest},consumed:{'exact-module.mjs':digest},cases:[]};
  for(const c of CASES){
    const row={...c,entry:{gestures:[{trusted:true},{trusted:true}]},contextClosed:true,retired:true,
      resources:{disposed:true,wetAllocated:c.mesh==='wetSlashV'},initial:{pipeline:{ao:true,shadows:true}},firstBirth:{tick:100},frames:[]};
    for(const frame of FRAMES){
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

test('exact mandatory six cases include Normal+Lite first active charged frame, taps and Heavy controls',()=>{
  assert.deepEqual(CASES.map(c=>c.key),['normal-charged','normal-tap','lite-charged','lite-tap','heavy-charged','heavy-tap']);
  assert.deepEqual(FRAMES,[1,3,8]);assert.equal(CASES.filter(c=>c.mesh==='wetSlashV').length,2);
  const f=fixture();assert.deepEqual(verifyWiperCaptureFiles('/evidence',{sourceSha,contentHash},f.read),f.receipt);
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
    r=>r.consumed['exact-module.mjs']='d'.repeat(64),r=>delete r.consumed['exact-module.mjs'],
  ];
  for(const mutate of mutants){const f=fixture();mutate(f.receipt);assert.throws(()=>verifyWiperCaptureFiles('/evidence',{sourceSha,contentHash},f.read),String(mutate));}
});

test('original screenshot files are mandatory, unique, non-substitutable and PNG-hash bound',()=>{
  for(const mutation of ['missing','bytes','duplicate','not-png']){
    const f=fixture(),im=f.receipt.cases[0].frames[0].images[0];
    if(mutation==='missing')f.files.delete(im.file);
    if(mutation==='bytes')f.files.get(im.file)[100]^=1;
    if(mutation==='duplicate')f.receipt.cases[0].frames[1].images[0]={...im};
    if(mutation==='not-png'){f.files.get(im.file)[0]=0;im.sha256=hash(f.files.get(im.file));}
    assert.throws(()=>verifyWiperCaptureFiles('/evidence',{sourceSha,contentHash},f.read),mutation);
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
  assert.match(driver,/live\[0\]\.catalog\.descriptor\.key!==testCase\.descriptor/);assert.match(driver,/p=>p\.owner===a&&p\.delay<=0&&!p\.catalog\?\.birthPending/);
  assert.match(driver,/mesh\.onBeforeRender=original/);assert.match(driver,/finally\{await context.close\(\)/);
  assertWiperCaptureReceipt(fixture().receipt,{sourceSha,contentHash});
});
