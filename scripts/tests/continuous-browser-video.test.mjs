import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {sha256,verifyBuild,validateProgress,validateDecodedVideo,validatePair} from '../lib/continuous-browser-video.mjs';
const samples=()=>[{wallMs:0,renderedFrames:0,simulationTicks:0,activity:false},{wallMs:4000,renderedFrames:120,simulationTicks:240,activity:true},{wallMs:8000,renderedFrames:240,simulationTicks:480,activity:true}].map(s=>({...s,gameTime:s.wallMs/1000,playing:true,paused:false,alive:true,camera:'fixed',lights:'fixed',world:String(s.wallMs)}));
const decoded=()=>({stream:'continuous-playwright-webm',originalSpeed:true,interpolated:false,durationSeconds:10,decodedFrames:300,distinctFrameHashes:200,blackFraction:0,longestFreezeSeconds:1,actionStartSeconds:1});
const row=head=>({errors:[],status:'recorded-not-delivery-verified',identity:{head},samples:samples(),decoded:decoded(),rawSha256:'a'.repeat(64),scenarioHash:'b'.repeat(64),cameraHash:'c'.repeat(64),lightingHash:'d'.repeat(64),inputScheduleHash:'e'.repeat(64),viewportHash:'f'.repeat(64),seed:19,simulationClock:'fixed-60Hz-from-wall-RAF'});
test('live renderer and source clock observations pass without claiming delivery',()=>{assert.equal(validateProgress(samples()).observedRenderHz,30);assert.equal(validatePair(row('1'.repeat(40)),row('2'.repeat(40))).deliveryVerified,false);});
test('stalled renderer rejected even when simulation counter advances',()=>{const s=samples();s.forEach(x=>x.renderedFrames=0);assert.throws(()=>validateProgress(s),/stalled|frozen/);});
test('rendered frames cannot substitute for absent simulation progress',()=>{const s=samples();s.forEach(x=>x.simulationTicks=0);assert.throws(()=>validateProgress(s),/stalled|frozen/);});
test('static idle scene is rejected despite live frame/tick counters',()=>{const s=samples();s.forEach(x=>x.activity=false);assert.throws(()=>validateProgress(s),/activity/);});
test('counter reset and bad clocks rejected',()=>{const s=samples();s[2].renderedFrames=1;assert.throws(()=>validateProgress(s),/regression/);});
test('blank or mostly frozen decoded video rejected',()=>{assert.throws(()=>validateDecodedVideo({...decoded(),blackFraction:1}),/blank/);assert.throws(()=>validateDecodedVideo({...decoded(),longestFreezeSeconds:9}),/stalled|frozen/);});
test('stills/interpolation/absent media marker rejected',()=>{assert.throws(()=>validateDecodedVideo({...decoded(),stream:'png-sequence'}));assert.throws(()=>validateDecodedVideo({...decoded(),interpolated:true}));assert.throws(()=>validateDecodedVideo({...decoded(),actionStartSeconds:undefined}));});
test('camera/light/seed drift and same heads reject pairing',()=>{for(const key of ['cameraHash','lightingHash','seed']){const a=row('1'.repeat(40)),b=row('2'.repeat(40));b[key]=key==='seed'?7:'0'.repeat(64);assert.throws(()=>validatePair(a,b),/unpaired/);}assert.throws(()=>validatePair(row('1'.repeat(40)),row('1'.repeat(40))),/same before/);});
test('verify actual artifact bytes before recording, not merely the manifest',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'video-guard-'));try{await fs.writeFile(path.join(root,'a.js'),'original');const artifacts={'a.js':sha256('original')},files={'source/a.js':sha256('source')},pin={head:'1'.repeat(40),proofSha256:'2'.repeat(64),inputHash:sha256(JSON.stringify(files)),contentHash:sha256(JSON.stringify(artifacts))};await fs.writeFile(path.join(root,'inkwave-build.json'),JSON.stringify({...pin,files,artifacts}));assert.equal((await verifyBuild(root,pin)).artifactCount,1);await fs.writeFile(path.join(root,'a.js'),'changed');await assert.rejects(verifyBuild(root,pin),/artifact bytes drift/);}finally{await fs.rm(root,{recursive:true,force:true});}});
test('fewer than5 observed render frames per second rejected',()=>{const s=samples();s[1].renderedFrames=15;s[2].renderedFrames=30;assert.throws(()=>validateProgress(s),/stalled|frozen/);});

import {parseMarker,parseDecode} from '../lib/continuous-browser-video.mjs';
const marker='frame:0 pts:0 pts_time:1\nlavfi.signalstats.YAVG=105\nlavfi.signalstats.UAVG=202\nlavfi.signalstats.VAVG=222\nframe:1 pts:1 pts_time:2\nlavfi.signalstats.YAVG=145\nlavfi.signalstats.UAVG=54\nlavfi.signalstats.VAVG=34';
test('encoded marker requires actual armed magenta then green',()=>{assert.equal(parseMarker(marker),2);assert.throws(()=>parseMarker(marker.split('frame:1')[1]));assert.throws(()=>parseMarker(marker.replace('VAVG=34','VAVG=222')));});
test('motion parser excludes HUD/bootstrap by supplied eight-second action decode',()=>{const d=parseDecode({duration:20,frames:30,hashes:Array.from({length:30},(_,i)=>`0,${i},0,0,0,hash${i}`).join('\n'),diagnostics:'black_duration:0.1\nfreeze_start: 1\nfreeze_duration: 0.5',marker});assert.equal(d.blackFraction,.0125);assert.equal(d.actionStartSeconds,2);assert.equal(d.analysisSeconds,8);});
test('unterminated freeze uses action window not long bootstrap to fail closed',()=>{assert.throws(()=>parseDecode({duration:200,frames:30,hashes:Array.from({length:30},(_,i)=>'0,'+i).join('\n'),diagnostics:'freeze_start: 0.1',marker}),/stalled|frozen/);});
import {parseMarkers} from '../lib/continuous-browser-video.mjs';
import {supervise} from '../lib/video-process-supervisor.mjs';
test('paused/stale world cannot pass nominal clock and renderer counts',()=>{for(const key of ['paused','playing','alive','gameTime','world']){const s=samples();s.forEach(x=>x[key]=({paused:true,playing:false,alive:false,gameTime:0,world:'stale'})[key]);assert.throws(()=>validateProgress(s));}});
test('camera/light drift is rejected during observation',()=>{for(const k of ['camera','lights']){const s=samples();s[1][k]='changed';assert.throws(()=>validateProgress(s),/drift/);}});
test('encoded stop marker distinguishes missing end from valid action interval',()=>{assert.equal(parseMarkers(marker).end,null);const end='\nframe:2 pts:2 pts_time:10\nlavfi.signalstats.YAVG=41\nlavfi.signalstats.UAVG=240\nlavfi.signalstats.VAVG=110';assert.deepEqual(parseMarkers(marker+end),{start:2,end:10});});
test('late browser errors prevent pair acceptance',()=>{const a=row('1'.repeat(40));a.errors=['late pageerror'];assert.throws(()=>validatePair(a,row('2'.repeat(40))),/late browser/);});
test('owned process timeout kills an ignoring process and its detached descendant',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'video-supervisor-')),pidfile=path.join(dir,'pid');try{const code=`const {spawn}=require('node:child_process');const fs=require('node:fs');process.on('SIGTERM',()=>{});const c=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{stdio:'ignore',detached:true});fs.writeFileSync(${JSON.stringify(pidfile)},String(c.pid));setInterval(()=>{},1000);`;await assert.rejects(supervise(process.execPath,['--max-old-space-size=64','-e',code],{ms:500}),e=>e.result?.timedOut===true);const pid=Number(await fs.readFile(pidfile,'utf8'));let stopped=false;for(let i=0;i<20;i++){try{const stat=await fs.readFile('/proc/'+pid+'/stat','utf8');if(stat.split(' ')[2]==='Z'){stopped=true;break;}}catch(e){if(e.code==='ENOENT'){stopped=true;break;}throw e;}await new Promise(r=>setTimeout(r,20));}assert(stopped,'descendant still executing');}finally{await fs.rm(dir,{recursive:true,force:true});}});
test('supervisor rejects output overflow and spawn failure',async()=>{await assert.rejects(supervise(process.execPath,['-e','process.stdout.write("x".repeat(2048));setInterval(()=>{},1000)'],{ms:1000,maxOutput:100}),e=>e.result?.overflow===true);await assert.rejects(supervise('/nonexistent-video-test-binary',[],{ms:100}));});

test('actual reviewer negative with6.3 frozen action seconds rejects',()=>{const r=decoded();r.analysisSeconds=8;r.longestFreezeSeconds=6.3;assert.throws(()=>validateDecodedVideo(r),/stalled|frozen/);});

test('nonoverlapping frozen intervals accumulate despite short individual spans',()=>{const r=decoded();r.analysisSeconds=8;r.longestFreezeSeconds=1;r.frozenFraction=.6;assert.throws(()=>validateDecodedVideo(r),/cumulative/);});

// Pilot additions below preserve every revision4 guard body above.
import{createHash}from'node:crypto';
import{admitPilot,admitResources,GAME,TREE}from'../run-native-range-video-pilot.mjs';
const admission=()=>({actions:'true',event:'workflow_dispatch',selected:'true',gameSha:GAME,qaSha:'a'.repeat(40),actualQa:'a'.repeat(40),actualGame:GAME,gameTree:TREE,qaDirty:'',gameDirty:''});
test('pilot admits only explicit manual selection and exact independent heads',()=>assert.equal(admitPilot(admission()),true));
test('pilot rejects every alternate input/event/source/dirty-worktree boundary',()=>{for(const [key,value]of [['actions','false'],['event','pull_request'],['selected','false'],['selected','True'],['gameSha','main'],['gameSha','b'.repeat(40)],['qaSha','main'],['actualQa','b'.repeat(40)],['actualGame','b'.repeat(40)],['gameTree','b'.repeat(40)],['qaDirty',' M script'],['gameDirty',' M runtime']])assert.throws(()=>admitPilot({...admission(),[key]:value}),key);});
test('128MiB disk and2GiB RAM admission is fail closed',()=>{admitResources({diskBytes:128*1024**2,memoryBytes:2*1024**3});for(const x of [{diskBytes:128*1024**2-1,memoryBytes:2*1024**3},{diskBytes:128*1024**2,memoryBytes:2*1024**3-1},{diskBytes:NaN,memoryBytes:Infinity}])assert.throws(()=>admitResources(x));});
// The only post-seal workflow delta is these two added PR trigger paths.
// Audio-readiness paths and its receipt command are already in both historical
// blobs below, so they remain byte-protected rather than normalized away.
const excludedWorkbench=['inkwave','modeler'].join('-');
const reviewedSplatlingTriggers=[
 "      - 'scripts/lib/inkwave-splatling-render-evidence.mjs'\n",
 "      - 'patches/splatoon3/runtime/splatling-cosmetics.mjs'\n",
];
function assertUnchangedDefaultVolumeJob(y){
 let old=y.slice(0,y.indexOf('  video-lifecycle-pilot:\n'));old=old.replace(/  workflow_dispatch:\n[\s\S]*?permissions:\n/,'  workflow_dispatch:\npermissions:\n').replace("    if: ${{ github.event_name != 'workflow_dispatch' || !inputs.video_lifecycle_pilot }}\n",'');const buildTrigger="      - 'scripts/build-inkwave.mjs'\n";
 const compositionTrigger="      - 'scripts/inkwave-source-composition.mjs'\n";
 // These exact source/build triggers broaden CI coverage; they do not change
 // the default volume job or grant permission to alter any of its assertions.
 for(const trigger of [buildTrigger,compositionTrigger])assert.equal(old.split(trigger).length-1,1,'Exactly one reviewed source/build trigger is required');
 const triggerPrefix='on:\n  pull_request:\n    paths:\n'+buildTrigger+compositionTrigger;
 assert.ok(old.includes(triggerPrefix),'Reviewed triggers must remain first in pull_request.paths');
 old=old.replace(triggerPrefix,'on:\n  pull_request:\n    paths:\n');
 for(const trigger of reviewedSplatlingTriggers)assert.equal(old.split(trigger).length-1,1,'Exactly one reviewed Splatling trigger is required');
 const workflowTrigger="      - '.github/workflows/inkwave-ink-volumes.yml'\n";
 const splatlingSuffix=workflowTrigger+reviewedSplatlingTriggers.join('')+'  workflow_dispatch:\n';
 assert.ok(old.includes(splatlingSuffix),'Reviewed Splatling triggers must remain last in pull_request.paths');
 old=old.replace(splatlingSuffix,workflowTrigger+'  workflow_dispatch:\n');
 const reviewedAptPath="      - 'scripts/prepare-inkwave-ci-apt.py'\n";const reviewedAptStep="      - run: |\n          sudo python3 scripts/prepare-inkwave-ci-apt.py\n          npx playwright install --with-deps chromium webkit\n";assert.equal(old.split(reviewedAptPath).length-1,1,'Only one pinned CI apt path may be added');assert.equal(old.split(reviewedAptStep).length-1,1,'Only one approved CI apt preparation may precede native browsers');// Approved workflow-cost changes: sparse checkout preserves repository scope
 // while avoiding heavyweight modeler assets; PR evidence retention is 14d,
 // default branch remains 90d. Guard their exact contents and uniqueness.
 const sparseCheckout="          filter: blob:none\n          sparse-checkout-cone-mode: false\n          sparse-checkout: |\n            /*\n" + '            !/tools/'+excludedWorkbench+'/blender/\n' + '            !/tools/'+excludedWorkbench+'/docs/\n';
 const evidenceRetention="          retention-days: ${{ github.event_name == 'pull_request' && 14 || 90 }}\n";
 assert.equal(old.split(sparseCheckout).length-1,1,'Only the reviewed sparse checkout may change');
 assert.equal(old.split(evidenceRetention).length-1,1,'Only the reviewed retention policy may change');
 old=old.replace(sparseCheckout,'').replace(evidenceRetention,'');
 const integratedBlob=createHash('sha1').update('blob '+Buffer.byteLength(old)+'\0').update(old).digest('hex');assert.equal(integratedBlob,'29c322adaaad48c9a19431f5049c3800378ba0c9','The integrated default volume job may not drift beyond the two reviewed additions');old=old.replace(reviewedAptPath,'').replace(reviewedAptStep,'      - run: npx playwright install --with-deps chromium webkit\n');const originalBlob=createHash('sha1').update('blob '+Buffer.byteLength(old)+'\0').update(old).digest('hex');assert.equal(originalBlob,'582cc30c606d0d4963d8f172f157b6d8a2dbbf9e','All original volume assertions and native gates must be byte-exact');
}
test('existing workflow body remains byte-exact after only reviewed pilot, source/Splatling triggers and apt additions',async()=>{const y=await fs.readFile(new URL('../../.github/workflows/inkwave-ink-volumes.yml',import.meta.url),'utf8');assertUnchangedDefaultVolumeJob(y);});
test('actual workflow conditions preserve PR/default manual and select pilot-only explicitly',async()=>{const y=await fs.readFile(new URL('../../.github/workflows/inkwave-ink-volumes.yml',import.meta.url),'utf8');const expression=name=>y.match(new RegExp('  '+name+':\\n    if: \\$\\{\\{ (.*?) \\}\\}'))[1];const run=(name,event,selected)=>Function('github','inputs','return '+expression(name))({event_name:event},{video_lifecycle_pilot:selected});for(const [event,selected,normal,pilot]of [['pull_request',false,true,false],['pull_request',true,true,false],['workflow_dispatch',false,true,false],['workflow_dispatch',undefined,true,false],['workflow_dispatch',true,false,true]]){assert.equal(!!run('volume',event,selected),normal);assert.equal(!!run('video-lifecycle-pilot',event,selected),pilot);}});
test('pilot workflow enforces both failure-path upload cap and immutable build identity',async()=>{const y=await fs.readFile(new URL('../../.github/workflows/inkwave-ink-volumes.yml',import.meta.url),'utf8');assert.match(y,/id: evidence-size\n        if: always\(\)/);assert.match(y,/total <= 64\*1024\*\*2/);assert.match(y,/always\(\) && steps.evidence-size.outputs.safe == 'true'/);assert.match(y,/working-directory: game\n        env:\n          GITHUB_SHA: 26a4db4123d23162a3dbf8a12150b1b5bc6ccf64/);assert.match(y,/ref: \$\{\{ github.sha \}\}\n          path: qa/);});

const buildTrigger="      - 'scripts/build-inkwave.mjs'\n";
const compositionTrigger="      - 'scripts/inkwave-source-composition.mjs'\n";
for(const [name,mutate]of [
 ['missing build trigger',s=>s.replace(buildTrigger,'')],
 ['missing composition trigger',s=>s.replace(compositionTrigger,'')],
 ['duplicate build trigger',s=>s.replace(buildTrigger,buildTrigger+buildTrigger)],
 ['duplicate composition trigger',s=>s.replace(compositionTrigger,compositionTrigger+compositionTrigger)],
 ['moved trigger',s=>s.replace(buildTrigger,'').replace(compositionTrigger,compositionTrigger+buildTrigger)],
 ['unreviewed trigger',s=>s.replace(compositionTrigger,compositionTrigger+"      - 'unreviewed/**'\n")],
 ['changed timeout',s=>s.replace('    timeout-minutes: 30','    timeout-minutes: 60')],
 ['weakened rendering assertion',s=>s.replace('--shape-only','--accept-all')],
 ['changed default checkout',s=>s.replace('ref: ${{ github.event.pull_request.head.sha || github.sha }}','ref: main')],
 ["removed sparse checkout pin",s=>s.replace("filter: blob:none","filter: blob:all")],
 ["broadened sparse checkout",s=>s.replace("!/tools/"+excludedWorkbench+"/docs/","/tools/"+excludedWorkbench+"/docs/")],
 ["unbounded PR retention",s=>s.replace("retention-days: ${{ github.event_name == 'pull_request' && 14 || 90 }}","retention-days: 90")],
])test('default volume guard rejects '+name,async()=>{
 const y=await fs.readFile(new URL('../../.github/workflows/inkwave-ink-volumes.yml',import.meta.url),'utf8');
 const changed=mutate(y);assert.notEqual(changed,y,'negative control must change the real workflow');
 assert.throws(()=>assertUnchangedDefaultVolumeJob(changed));
});

for(const [index,trigger]of reviewedSplatlingTriggers.entries()){
 for(const [name,mutate]of [
  ['missing',s=>s.replace(trigger,'')],
  ['duplicate',s=>s.replace(trigger,trigger+trigger)],
  ['broadened',s=>s.replace(trigger,trigger.replace('.mjs','*.mjs'))],
  ['moved',s=>s.replace(trigger,'').replace(buildTrigger,buildTrigger+trigger)],
 ])test('default volume guard rejects '+name+' Splatling trigger '+index,async()=>{
  const y=await fs.readFile(new URL('../../.github/workflows/inkwave-ink-volumes.yml',import.meta.url),'utf8');
  const changed=mutate(y);assert.notEqual(changed,y,'negative control must change the real workflow');
  assert.throws(()=>assertUnchangedDefaultVolumeJob(changed));
 });
}
for(const [name,mutate]of [
 ['unknown Splatling trigger',s=>s.replace(reviewedSplatlingTriggers[1],reviewedSplatlingTriggers[1]+"      - 'scripts/lib/unknown-splatling-evidence.mjs'\n")],
 ['reversed Splatling triggers',s=>s.replace(reviewedSplatlingTriggers.join(''),[...reviewedSplatlingTriggers].reverse().join(''))],
 ['missing audio readiness trigger',s=>s.replace("      - 'scripts/lib/inkwave-audio-readiness-diagnostics.mjs'\n",'')],
 ['duplicate audio readiness trigger',s=>s.replace("      - 'scripts/tests/inkwave-audio-readiness-diagnostics.test.mjs'\n","      - 'scripts/tests/inkwave-audio-readiness-diagnostics.test.mjs'\n".repeat(2))],
 ['missing audio diagnostic command',s=>s.replace('        run: node --test scripts/tests/inkwave-audio-readiness-diagnostics.test.mjs\n','')],
 ['audio diagnostic command drift',s=>s.replace('run: node --test scripts/tests/inkwave-audio-readiness-diagnostics.test.mjs','run: node --test --test-name-pattern=skip scripts/tests/inkwave-audio-readiness-diagnostics.test.mjs')],
 ['native geometry command drift',s=>s.replace('run: node --experimental-vm-modules --test patches/local-quality/tests/ink-volume*.test.mjs','run: true')],
])test('default volume guard rejects '+name,async()=>{
 const y=await fs.readFile(new URL('../../.github/workflows/inkwave-ink-volumes.yml',import.meta.url),'utf8');
 const changed=mutate(y);assert.notEqual(changed,y,'negative control must change the real workflow');
 assert.throws(()=>assertUnchangedDefaultVolumeJob(changed));
});
