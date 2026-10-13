# Native bomb authority under bounded replay allocation

## Scope and reproduced defects

Correction of held PR #1321 at `d7e902c9a130ed3ec86173fa958564a1424a1057`. The original branch remains the aggregate for #1311/#1313. A private composition on main `ee9fbbab5883f20d1968e36a4b6b2faeb1f748fe` applies cleanly and retains its newer special controls and Curling defense.

1. Native remote bombs and Storm canisters are not merely visual: their receiver simulation owns victim-local damage. The old 24/48/96 admission dropped a different roster actor's first bomb after four actors filled 96 slots, while consuming its event identity. A valid Storm token could likewise be spent without creating its canister/cloud.
2. A delayed native producer trace can exceed a smaller live quota without violating ink or throw rules. In a controlled elevated launch, actual Actor → WeaponRunner → Projectiles → NetMatch recording produces 17/23/23 bomb births over 60 seconds with no gear / 57 AP Ink Saver (Sub) / 57 AP Ink Recovery. Live peaks are 2/3/2. Therefore a quota alone still discards valid delayed attacks.
3. Native owned Sprinklers replace the previous device. Replica attachment did not, leaving persistent old Sprinklers occupying the cap. A genuine repeated-Sprinkler trace left 11 events permanently waiting in the initial correction until owner death.
4. Full installation exposed a separate existing defect (isolated in independently reviewed Draft #1364, head `95075e718b2bcb36a27bda9b5ebb8f122401e327`): `installKitDefense` returned for every ghost explosion before the native victim-authority guard. Thus even the unsaturated real installed bomb dealt no victim-local damage. This line also exists on main ee9. Earlier partial-installer probes are historical diagnosis only; they are not completion evidence.

## Correction

- Keep hard ceilings at 24 per actor, 48 per owner and 96 total remote bomb objects. Partition shares by the locally bound roster and ownership, with two slots reserved for Storm canisters. Local-authority objects do not consume these quotas. Count actual live records, not detached counters.
- A quota-full attack stays at the head of the existing bounded 512-event owner FIFO. Neither sequence nor Storm token is consumed. Normal owner-time native physics retires capacity; no new queue, parallel damage simulation or unbounded catch-up loop is added. Other peers continue independently.
- Validate finite fields, sequence, actor ownership and Storm proof before waiting. Invalid/replayed events cannot hold the FIFO head. Existing disposal/removal/adoption retire native objects before ownership changes.
- Before allocating an authenticated Sprinkler replacement, retire only that actor's previous ghost Sprinkler. Direct native replica attachment follows the same replacement rule. Other actors, local devices and other deployed attacks survive; foreign owners and stale sequences cannot retire a replacement.
- Only ghost **bomb** explosions may reach the existing native victim/life authority lane. Other ghost main/special blast authority is unchanged. Bombs query native Bubbler shielding read-only; they neither mutate canopy/emitter HP nor submit an object-damage proposal.

## Verification and boundaries

The new regression explicitly invokes the complete production build composition **and `installS3`**. Its emitted mode loads actual minified build modules, without running source adapters again.

- Full source authority/cap regressions include real native bomb/cloud consequences, eight-roster quotas, host-owned bots and turnover, waiting Storm tokens, malformed/foreign events, and disposal.
- Native delayed producer traces replay every accepted birth once at 30/60/120 Hz receiver updates. Seven-host-actor cases exercise the smaller four-ordinary-slot share with Suction, Curling and Autobomb. Sprinkler replacement reproduces the original permanent wait and now matches the owner's single-device lifecycle.
- The native Bubbler positive/negative control checks outside shielding, inside-origin damage, remote victim rejection, recipient combat-life rejection, LOS, unchanged object HP and zero proposal traffic. Removing the native shield admits damage at the identical geometry.
- Three isolated negative controls remove FIFO backpressure, replica Sprinkler replacement, or fair actor shares. Each is rejected by the new native regression; the quota-only destructive FIFO loses all waiting births, unreplaced Sprinklers leave 11 pending, and borrowed shares erase the other actor’s bomb/Storm.
- Source composition on ee9: 28/28 focused cases. Actual minified authority/network cases: 19/19. Native Kit/Sprinkler/Bubbler neighbors: 107/107. Final original-branch complete network suite: 487/487 (including the permanent full-installer 11-case test and unchanged browser-diagnostics acceptance test).
- Current-main emitted content hash: `0e83c850c5a29e36f556ceedd6e683e24d590fccc4c1fe734ef8a37123e34bff`; input hash: `74ee24c93f2e5c4725526a539277f4f402064d62e29dae417fd4647c73af4d7c`.

A native-VM execution of the exact added browser release snippet confirms a recorded bomb and native ink payment (100 → 30); this is only setup validation. The existing real WebSocket/production-relay browser gate now includes paid native bomb release in both host→guest and guest→host directions, at its existing zero/100 ms delay settings. The installed receiver must take damage while the sender's remote victim at the identical in-range position does not; both actual local/remote flags are asserted. It retains the authenticated replica clock and writes a separate JSON record. New browser execution and exact published-head CI remain pending; Node/emitted results are not browser evidence.

These are INKWAVE authority/lifecycle consistency fixes. They do not change Nintendo frame values, ink costs, blast bands, throws or resource coefficients, and do not establish retail S3 equivalence or hardware performance. The producer's actor locomotion and rendering are constrained; its resource admission, recording and bomb physics are native. The explosion-kernel tests explicitly control terminal position/age. The 512-entry FIFO remains finite: this is not a promise to preserve arbitrarily long malicious floods or an unbounded network backlog. Quota pressure can delay subsequent events from the same owner until native retirement. Ordinary source/owner-clock/life admission and existing snapshot expiry rules remain in force.

## Reproduction

```sh
node --experimental-vm-modules --test patches/network-replication/tests/issue-1321-bomb-authority-budget.test.mjs
INKWAVE_BUILT_SITE=/path/to/actual/site node --experimental-vm-modules --test patches/network-replication/tests/issue-1321-bomb-authority-budget.test.mjs
node --experimental-vm-modules --test --test-concurrency=2 patches/network-replication/tests/*.test.mjs
```

## Bounded density cost diagnostic (not a performance acceptance)

The diagnostic compares original #1321 `d7e902c9` with corrected runtime `12335915`, using complete production composition and `installS3`, actual Actor/WeaponRunner/NetMatch records, THREE scene graphs, Level/Physics and native bomb integration. It is not a BotBrain, rendered browser or whole-game benchmark. A real 60-second, 57 AP Ink Saver (Sub) producer trace is copied to seven authenticated host-owned roster actors (one host plus six bots); the eighth actor is the local guest. Only actor IDs and the monotonically increasing owner event sequence are reassigned. The synthetic **burst** delivers all 161 Splat Bomb or 175 Sprinkler records at once, within the existing packet/FIFO limits. **Steady** delivers the same rows at their original owner ticks. The producer stays at height 12, pitch 0.9; an 800-by-800 native flat floor keeps throws from retiring early over a map edge. No victim is in the blast lane. Three fresh Node v24.19.0 processes per variant/condition alternate execution order; fixture compilation is excluded. The wide-floor raw result SHA-256 is `d4b773c55dd5faea16df4022a90191c33edde101826568ef9ec3607aa159f438`.

| Scenario | Old → corrected births / dropped | Peak live | Total CPU median (ms) | Maximum processing frame across 3 trials (ms) | All-frame p95 median (ms) |
| --- | --- | --- | --- | --- | --- |
| Splat Bomb burst | 48 / 113 → 161 / 0 | 48 → 28 | 425.3 → 798.9 | 224.3 → 153.1 | 0.074 → 0.315 |
| Splat Bomb steady | 161 / 0 → 161 / 0 | 21 → 21 | 1038.8 → 1086.7 | 74.1 → 81.6 | 0.389 → 0.385 |
| Sprinkler burst | 48 / 127 → 175 / 0 | 48 → 7 | 675.5 → 254.5 | 202.6 → 111.2 | 0.381 → 0.230 |
| Sprinkler steady | 132 / 43 → 175 / 0 | 48 → 7 | 1550.2 → 791.1 | 62.0 → 73.9 | 0.548 → 0.227 |

These numbers **do not establish harmless loading or a frame-rate improvement**. In the bomb burst, preserving the 113 previously discarded attacks roughly doubles measured CPU and extends work across more consecutive frames. The last saved trial has 2 old versus 11 corrected consecutive processing frames above 16.67 ms; its first 20 frames total 219 versus 580 ms. The existing 180-physics-step-per-bomb catch-up remains in force. A smaller worst frame does not eliminate the longer stall sequence. Whole-window p95 includes idle frames and must not conceal that sequence. The corrected burst's active-frame p95 median is 16.94 ms.

The burst initially retains 133 bomb events in the existing FIFO; all are consumed exactly once and the queue drains. Maximum and p95 additional waiting are 11 owner ticks (183.3 ms) in this synthetic clock. This is **not a wall-clock latency bound**: a real browser can take longer while processing stalls, and the original delayed transport time is additional. Later same-owner events wait behind the bomb; the native bomb/cloud retains its original birth time and recipient-life check, so delay is not hidden by changing attack identity or treating an old attack as new. Steady delivery and both Sprinkler conditions have zero additional admission wait in this diagnostic.

The bomb burst creates/releases 48/48 old versus 161/161 corrected objects. Peak scene nodes fall 340 → 200, but median peak heap rises 73.1 → 105.7 MB (decimal) and post-forced-GC growth rises 1.580 → 1.828 MB. For steady bombs, post-GC growth is 2.486 → 2.497 MB. Sprinkler replacement performs more allocations/releases in the burst (48/28 → 175/172) while reducing peak scene nodes 340 → 53; its post-GC growth is 2.199 → 1.629 MB. Steady Sprinkler post-GC growth is 3.628 → 2.445 MB. Every released record is marked released and detached from its native scene. Heap totals include VM/JIT/cache and instrumentation activity, are not GPU memory, and do not prove absence of a long-term leak. Timing is noisy on a shared host; CPU totals include measurement overhead, whereas frame figures sum measured ingress/replay/native physics and include first-burst ingress. GPU rendering, audio, actor AI and ordinary character simulation are absent.

The correctness correction therefore retains an explicit adoption constraint: the catch-up burst still needs real-browser stall/latency review. A separate experiment may remove duplicate calculations without skipping physics steps or moving damage/life/order boundaries; no such experimental optimization is included in the runtime measured above.

### Reproduce the local diagnostic

Save the following diagnostic as `measure-bomb-budget-density.mjs`. For each source checkout, run with `node --experimental-vm-modules --expose-gc measure-bomb-budget-density.mjs /absolute/checkout produce bomb` and then `produce sprinkler` to record native input. Use the same recorded inputs for the original and corrected checkouts; replace `produce` with `measure` and append `burst` or `steady`. Run each condition three times in fresh processes, alternating old/new order. It writes per-frame/admission records under the temporary directory. It is a diagnostic, with no timing threshold added to CI.

```js
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
const [root,task,sub='bomb',mode='burst']=process.argv.slice(2);
let seconds=1000;
const {fixture}=await import(pathToFileURL(path.join(root,'patches/splatoon3/tests/source-fixture.mjs')));
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmPerformance:{now:()=>seconds*1000},vmMathRandom:()=>.5});
f.G.scene=new f.THREE.Scene();f.G.camera={position:new f.THREE.Vector3(0,12,10)};f.G.projectiles=new f.Projectiles(f.G.scene);
f.G.level=new f.Level({bounds:{minX:-400,maxX:400,minZ:-400,maxZ:400},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-400,-.5,-400],max:[400,0,400]}]});f.G.physics=new f.Physics(f.G.level);
const P=f.G.projectiles;
const session=(myId,hostId)=>({myId,hostId,isHost:myId===hostId,_members:new Map([['host','Host'],['me','Guest']]),tr:{broadcast(){},sendTo(){}}});
if(task==='produce'){
 const a=f.make('shooter');Object.assign(a,{nid:37,owner:'host',remote:false});a.weapon={...a.weapon,sub};a.pos.set(0,12,0);a.aimPitch=.9;a.aimYaw=0;a.aimDir.set(0,Math.sin(.9),Math.cos(.9));a.s3.loadout=f.emptyLoadout();for(const piece of a.s3.loadout){piece.main='inkSaverSub';piece.subs.fill('inkSaverSub');}a.s3RefreshGear();
 const sender=new f.NetMatch(session('host','host'),{id:'native-cost-trace',map:'map',difficulty:'normal'});f.G.netm=sender;sender.byNid.set(a.nid,a);sender._setupActor(a);
 let peak=0,minInk=100;
 for(let i=0;i<3600;i++){seconds=1000+(i+1)/60;a.intent.sub=i%30<6;a.intent.squid=i%30>8;f.tick(a);P.update(1/60);peak=Math.max(peak,P.bombs.length);minInk=Math.min(minInk,a.ink);}
 const trace={sub,peak,minInk,events:JSON.parse(JSON.stringify(sender.out.filter(e=>e[1]==='b')))};assert(trace.events.length>12);assert(minInk>=0);fs.writeFileSync('/tmp/native-cost-wide-'+sub+'.json',JSON.stringify(trace));console.log(JSON.stringify({task,sub,peak,minInk,births:trace.events.length}));sender.dispose();P.clear();process.exit(0);
}
const trace=JSON.parse(fs.readFileSync('/tmp/native-cost-wide-'+sub+'.json','utf8'));
const actors=Array.from({length:8},(_,i)=>{const a=f.make('shooter');Object.assign(a,{nid:i+1,owner:i<7?'host':'me',remote:i<7,team:i<4?0:1});a.weapon={...a.weapon,sub};a.pos.set(80,0,80);a._netLifeStartedAt=999;return a;});
const nm=new f.NetMatch(session('me','host'),{id:'native-cost-receiver',map:'map'});f.G.netm=nm;f.G.match={actors,state:'playing',playing:()=>true,canRespawn:()=>false};nm.bind(f.G.match);
const events=trace.events.flatMap(e=>actors.slice(0,7).map(a=>{const next=[...e];next[2]=a.nid;return next;})).sort((a,b)=>a[0]-b[0]||a[2]-b[2]);events.forEach((e,i)=>e[e.length-1]=i+1);
const admissions=[],arrivals=new Map(),frameCosts=[],activeFrameCosts=[],framesLog=[];let currentFrame=0,currentOwnerTime=1000;
let created=0,released=0,releaseFailures=0,peakBombs=0,peakPending=0,peakPendingAfterReplay=0,queueAfterFirstDrain=null,peakSceneChildren=0,peakSceneNodes=0,totalCreatedMeshNodes=0,heapPeak=0;
const create=P.ghostBomb,release=P._releaseBomb;
P.ghostBomb=function(...args){const b=create.apply(this,args);if(b){created++;b.mesh?.traverse(()=>totalCreatedMeshNodes++);}return b;};
P._releaseBomb=function(b){released++;const out=release.call(this,b);if(!b._released||b.mesh.parent)releaseFailures++;return out;};
const play=nm._play;nm._play=function(from,e){const before=created;const out=play.call(this,from,e);if(created>before)admissions.push({frame:currentFrame,eventTime:e[0],ownerTime:currentOwnerTime,extraQueueSeconds:currentOwnerTime-arrivals.get(e._netSeq),sequence:e._netSeq});return out;};
const peer=nm._peer('host');
function sample(){peakBombs=Math.max(peakBombs,P.bombs.length);peakPending=Math.max(peakPending,peer.events.length);peakSceneChildren=Math.max(peakSceneChildren,f.G.scene.children.length);let count=0;f.G.scene.traverse(()=>count++);peakSceneNodes=Math.max(peakSceneNodes,count);heapPeak=Math.max(heapPeak,process.memoryUsage().heapUsed);}
function deliver(ts,tick,rows){currentOwnerTime=ts;for(const row of rows)arrivals.set(row.at(-1),ts);seconds=ts+.2;nm.onMessage('host',JSON.parse(JSON.stringify({k:'t',ts,r:2,u:tick,l:Object.fromEntries(actors.map(a=>[a.nid,0])),...(rows.length?{e:rows}:{})})));Object.assign(peer,{tr:ts,lastTs:ts,sim:tick,off:0});}
if(global.gc)global.gc();const heapStart=process.memoryUsage().heapUsed;heapPeak=heapStart;const cpuStart=process.cpuUsage(),wallStart=performance.now();let ingestMs=0,replayMs=0,physicsMs=0,maxFrameMs=0,nonEmptyFrames=0,initialMs=0;
const t=(fn)=>{const before=performance.now();fn();return performance.now()-before;};
if(mode==='burst'){const ingress=t(()=>deliver(1060,3600,events));ingestMs+=ingress;sample();const replay=t(()=>nm._playEvents());replayMs+=replay;initialMs=ingress+replay;queueAfterFirstDrain=peer.events.length;peakPendingAfterReplay=peer.events.length;sample();}
const frames=mode==='burst'?600:4200;let cursor=0;
for(let frame=0;frame<frames;frame++){currentFrame=frame;const beforeCreated=created,activeBefore=P.bombs.length||peer.events.length;
 const tick=mode==='burst'?3601+frame:frame+1,ts=1000+tick/60;const rows=[];
 if(mode==='steady'){while(cursor<events.length&&events[cursor].at(-2)<=tick)rows.push(events[cursor++]);}
 const ingress=t(()=>deliver(ts,tick,rows));ingestMs+=ingress;
 const replay=t(()=>nm._playEvents());replayMs+=replay;peakPendingAfterReplay=Math.max(peakPendingAfterReplay,peer.events.length);sample();
 const physics=t(()=>P._updateBombs(1/60));physicsMs+=physics;sample();
 const processingMs=ingress+replay+physics+(frame===0?initialMs:0);frameCosts.push(processingMs);if(activeBefore||P.bombs.length||peer.events.length||created!==beforeCreated)activeFrameCosts.push(processingMs);maxFrameMs=Math.max(maxFrameMs,processingMs);if(P.bombs.length||peer.events.length)nonEmptyFrames++;framesLog.push({frame,processingMs,ingress,replay,physics,born:created-beforeCreated,live:P.bombs.length,pending:peer.events.length});
}
const wallMs=performance.now()-wallStart,cpu=process.cpuUsage(cpuStart),heapEnd=process.memoryUsage().heapUsed;
if(global.gc)global.gc();const heapAfterGC=process.memoryUsage().heapUsed;
const p95=xs=>[...xs].sort((a,b)=>a-b)[Math.max(0,Math.ceil(xs.length*.95)-1)]??0;const wait=admissions.map(x=>x.extraQueueSeconds);
const result={root,sub,mode,input:events.length,producerPeak:trace.peak,created,released,releaseFailures,remaining:P.bombs.length,pending:peer.events.length,lost:events.length-created-peer.events.length,peakBombs,peakPending,queueAfterFirstDrain,peakPendingAfterReplay,peakSceneChildren,peakSceneNodes,totalCreatedMeshNodes,frames,nonEmptyFrames,ingestMs,replayMs,physicsMs,maxFrameMs,p95FrameMs:p95(frameCosts),p95ActiveFrameMs:p95(activeFrameCosts),maxExtraQueueSeconds:Math.max(0,...wait),p95ExtraQueueSeconds:p95(wait),lastAdmissionFrame:Math.max(0,...admissions.map(x=>x.frame)),wallMs,cpuMs:(cpu.user+cpu.system)/1000,heapStart,heapEnd,heapPeak,heapAfterGC,heapGrowthAfterGC:heapAfterGC-heapStart};
assert.equal(releaseFailures,0);fs.writeFileSync('/tmp/density-'+path.basename(root)+'-'+sub+'-'+mode+'-detail.json',JSON.stringify({result,admissions,frames:framesLog},null,2));console.log(JSON.stringify(result));nm.dispose();P.clear();
```
