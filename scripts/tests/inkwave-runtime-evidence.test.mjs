import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {hash,verifyRuntimeBuild,persistentDirectory,persistentBrowserTemp,invalidWindows,sampleStats,primeRuntimeMenuRows} from '../lib/inkwave-runtime-evidence.mjs';
const root=persistentDirectory('/mnt/workspace/.dev-state/agent-work/scratch/inkwave-runtime-performance-ui-evidence-tests/'+process.pid);
test('benchmark rejects empty/undersampled live windows and incomplete fixed transactions',()=>{
 const scenarios=[{scenario:'battle',runs:[{repeat:0,frames:{n:0},counts:{frame:0}},{repeat:1,frames:{n:1},counts:{frame:29}},{repeat:2,frames:{n:30},counts:{frame:30}}]}];
 assert.equal(invalidWindows(scenarios,false).length,2);assert.equal(invalidWindows(scenarios,true).length,2);
});
test('physical persistent destination is verified before creation',()=>{assert.throws(()=>persistentDirectory('/tmp/inkwave-forbidden'),/Persistent workspace required/);});
test('valid artifacts cannot forge their source SHA by changing a build input',()=>{
 const repo=path.join(root,'repo'),site=path.join(root,'site');fs.mkdirSync(repo,{recursive:true});fs.mkdirSync(site,{recursive:true});
 fs.mkdirSync(path.join(repo,'inkwave-public'),{recursive:true});fs.mkdirSync(path.join(repo,'scripts'),{recursive:true});
 fs.writeFileSync(path.join(repo,'inkwave-public/source.js'),'export const source=1;');fs.writeFileSync(path.join(repo,'scripts/build-inkwave.mjs'),'// builder');
 const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();git('init','--quiet');git('add','.');git('-c','user.name=Runtime test','-c','user.email=runtime-test@example.invalid','commit','--quiet','-m','fixture');const sha=git('rev-parse','HEAD');
 fs.writeFileSync(path.join(site,'source.js'),'export const source=1;');
 const artifacts={'source.js':hash(fs.readFileSync(path.join(site,'source.js')))};
 const m={artifacts,contentHash:hash(JSON.stringify(artifacts)),files:{'upstream/source.js':artifacts['source.js']},build:{script:hash('// builder')}};
 const save=()=>fs.writeFileSync(path.join(site,'inkwave-build.json'),JSON.stringify(m));save();assert.equal(verifyRuntimeBuild(site,repo,sha).contentHash,m.contentHash);
 m.files['upstream/source.js']=hash('forged source');save();assert.throws(()=>verifyRuntimeBuild(site,repo,sha),/Build differs from source SHA/);
});
test('comparison cannot pass empty scenarios despite superficially passing reports',()=>{
 const before={status:'passed',sourceSha:'a'.repeat(40),verifiedRuntimeFiles:['src/core/renderer.js'],environment:{},scenarios:[],input:[]};
 const after={...before,inputStatus:'synchronous',input:Array.from({length:36},()=>({targetError:0})),inputErrors:[]};
 const a=path.join(root,'before.json'),b=path.join(root,'after.json'),out=path.join(root,'compare.json');fs.writeFileSync(a,JSON.stringify(before));fs.writeFileSync(b,JSON.stringify(after));
 assert.throws(()=>execFileSync(process.execPath,[new URL('../compare-inkwave-runtime-performance.mjs',import.meta.url).pathname,'--before',a,'--after',b,'--out',out],{stdio:'pipe'}));
 const report=JSON.parse(fs.readFileSync(out));assert.equal(report.status,'failed');assert(report.errors.some(x=>x.includes('incomplete scenario set')));
});
test('complete comparison rejects replay, different browser/seed, wrong windows, changed renderer and hidden work',()=>{
 const run=()=>({fixedSteps:30,probedOwners:['menuTick','cursor','match','character','projectiles','paint','render'],counts:{frame:30,match:30,sceneMatrices:60,cursor:30,menuTick:30,character:240,projectiles:30,paint:30,render:30},timings:{frame:{n:30,median:2,p95:3,max:4},sceneMatrices:{n:60,median:.1}},quality:'medium',scale:1,matchState:'playing',gameplay:{time:179,actors:Array.from({length:8},()=>({pos:[0,0,0],hp:100,ink:100,alive:true,weapon:'shooter'})),coverage:[.01,0],projectiles:2},renderInfo:{calls:10,triangles:100}});
 const b={status:'passed',audioRngFixtureEnabled:true,sourceSha:'5e28dbd16f7829aebd88052ff5f7fdf71f39fdad',verifiedRuntimeFiles:['src/core/renderer.js'],rendererArtifactHash:'a'.repeat(64),environment:{quality:'medium',browser:'test-chromium',seed:1,seedMode:'reset-each-fixed-step',audioRngMode:'independent-seeded-audio',fixtureClockMode:'canonical-battle-zero-phase'},scenarios:['title','settings','battle'].map(scenario=>({scenario,fixtureStart:{gameTime:0,cameraTime:0,shakeSeed:1},warmup:{simulationOnlySteps:scenario==='battle'?270:30,renderedSteps:30,drainMs:0},runs:Array.from({length:3},run)})),input:Array.from({length:36},()=>({targetError:4}))};
 const a=structuredClone(b);a.modeSwitchInput=[['pad','kbm'],['kbm','pad'],['touch','kbm'],['touch','pad']].map(([from,to])=>({from,to,primedPaint:true,primedOpacity:[1,1],beforeOn:from!=='touch',state:true,targetOwnerCorrect:true,targetError:0,ringOn:true,ringVisibility:'visible',visualStarted:true,firstAppearanceError:0}));a.sourceSha='b'.repeat(40);a.inputStatus='synchronous';a.inputErrors=[];a.input.forEach((r,i)=>{r.mode=['kbm','pad','touch'][Math.floor(i/12)];r.state=true;r.targetOwnerCorrect=true;r.targetError=0;r.ringOn=false;r.ringVisibility='hidden';});a.scenarios.find(s=>s.scenario==='battle').runs.forEach(r=>{r.counts.menuTick=0;r.counts.cursor=0;});a.ringRetirement=Array.from({length:3},()=>({beforeOpacity:1,stateChanged:true,ringOn:false,ghost:false,visibility:'hidden'}));a.menuLifecycle={hidden:Array.from({length:3},()=>({ticks:0,raf:0})),resumedTicks:1,hiddenDocument:Array.from({length:3},()=>({ticks:0,raf:0})),documentResumedTicks:1};a.menuLifetime=Array.from({length:3},()=>({fontListeners:0,observedOwners:0}));
 const check=(before,after,expect)=>{const pa=path.join(root,'valid-before.json'),pb=path.join(root,'valid-after.json'),out=path.join(root,'valid-compare.json');fs.writeFileSync(pa,JSON.stringify(before));fs.writeFileSync(pb,JSON.stringify(after));let passed=true;try{execFileSync(process.execPath,[new URL('../compare-inkwave-runtime-performance.mjs',import.meta.url).pathname,'--before',pa,'--after',pb,'--out',out],{stdio:'pipe'});}catch{passed=false;}assert.equal(passed,expect);assert.equal(JSON.parse(fs.readFileSync(out)).status,expect?'passed':'failed');};
 check(b,a,true);
 for(const mutate of [x=>delete x.modeSwitchInput[0].primedPaint,x=>x.modeSwitchInput[0].primedPaint=false,x=>delete x.modeSwitchInput[0].primedOpacity,x=>x.modeSwitchInput[0].primedOpacity=[0,1],x=>x.modeSwitchInput[0].primedOpacity=[null,1],x=>delete x.modeSwitchInput,x=>x.modeSwitchInput[0].visualStarted=false,x=>x.modeSwitchInput[2].firstAppearanceError=1,x=>delete x.modeSwitchInput[2].beforeOn,x=>x.modeSwitchInput[0].targetOwnerCorrect=false,x=>delete x.environment.fixtureClockMode,x=>delete x.scenarios[2].fixtureStart,x=>x.scenarios[2].fixtureStart.gameTime=1,x=>x.scenarios[2].fixtureStart.shakeSeed=2,x=>x.audioRngFixtureEnabled=false,x=>delete x.environment.audioRngMode,x=>delete x.scenarios[2].runs[0].probedOwners,x=>x.scenarios[2].runs[0].counts.character=0,x=>x.input[0].targetError=null,x=>x.input[0].targetError=1,x=>delete x.input[0].state,x=>x.input[0].targetOwnerCorrect=false,x=>x.input[0].mode='pad',x=>x.sourceSha='not-a-sha',x=>x.sourceSha=b.sourceSha,x=>x.environment.browser='another',x=>x.environment.seed=2,x=>x.environment.seedMode='uncontrolled',x=>delete x.environment.seedMode,x=>delete x.scenarios[2].runs[0].gameplay,x=>x.scenarios[2].runs[0].gameplay.coverage[0]=.02,x=>x.scenarios[2].runs[0].gameplay.actors[0].hp=99,x=>x.scenarios[2].runs[0].counts.frame=29,x=>x.scenarios[2].runs[0].matchState='intro',x=>x.scenarios[2].runs[0].scale=.75,x=>delete x.scenarios[2].warmup,x=>x.scenarios[2].warmup.renderedSteps=0,x=>delete x.rendererArtifactHash,x=>x.rendererArtifactHash='c'.repeat(64),x=>x.scenarios[2].runs[0].counts.menuTick=1,x=>x.scenarios[2].runs[0].counts.cursor=1,x=>x.scenarios[2].runs[0].counts.sceneMatrices=30,x=>x.scenarios[2].runs[0].counts.character=1,x=>x.menuLifecycle.hidden[0].ticks=1,x=>x.menuLifetime[0].fontListeners=20,x=>x.input[0].ringVisibility='visible',x=>delete x.input[0].ringOn,x=>x.menuLifecycle.hiddenDocument[0].ticks=1,x=>delete x.menuLifecycle.hiddenDocument,x=>x.ringRetirement[0].ghost=true,x=>x.ringRetirement[0].beforeOpacity=0,x=>delete x.ringRetirement,x=>delete x.ringRetirement[0].beforeOpacity,x=>x.ringRetirement[0].stateChanged=false,x=>x.input[0].ringOn=true]){const changed=structuredClone(a);mutate(changed);check(b,changed,false);}
});


test('browser temporary storage is a short physical persistent task cache',()=>{
 const directory=persistentBrowserTemp('/mnt/workspace/.dev-state/agent-work/cache/iwrui');
 assert.equal(directory,fs.realpathSync(directory));assert(directory.startsWith('/mnt/workspace/'));assert(Buffer.byteLength(directory)+48<108);
});
test('browser storage cannot fall back to OS temporary or an oversized Unix socket path',()=>{
 assert.throws(()=>persistentBrowserTemp('/tmp/forbidden-browser-tmp'),/Persistent workspace required/);
 assert.throws(()=>persistentBrowserTemp(path.join(root,'browser-tmp')),/Unix socket budget/);
});


test('native wall-clock audio voice drops cannot change the benchmark gameplay RNG',()=>{
 const raw=fs.readFileSync(new URL('../../inkwave-public/src/audio/audio.js',import.meta.url),'utf8');
 const constructor=raw.slice(raw.indexOf('  constructor(opts = {}) {'),raw.indexOf('\n  init() {'));
 const play=raw.slice(raw.indexOf('  play(name, o = {}) {'),raw.indexOf('\n  loop(name, o = {}) {'));
 const harness=fs.readFileSync(new URL('../check-inkwave-runtime-performance.mjs',import.meta.url),'utf8');
 const start=harness.indexOf('await page.evaluate(()=>{if(probeG.audio)');
 assert(start>=0,'audio RNG setup must run in the actual harness');
 const setup=harness.slice(start+'await page.evaluate('.length,harness.indexOf(');\n result.environment.audioRngMode',start));
 function sample(gap,isolated){
  let seed=20261004;const math=Object.create(Math);math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const context={Math:math,DEFAULT_SETTINGS:{},musicSingleton:null,MAX_VOICES:64};
  const Audio=vm.runInNewContext('class Audio{'+constructor+play+'};Audio',context),audio=new Audio();
  audio.ctx={currentTime:1};audio._def=()=>({minGap:.018});audio._voice=()=>({v:{finish(){}}});
  if(isolated)vm.runInNewContext('('+setup+')()', {...context,probeG:{audio}});
  audio.play('probe');audio.ctx.currentTime+=gap;audio.play('probe');
  return {nextGameplayRandom:math.random(),played:audio.counts.played,dropped:audio.counts.dropped};
 }
 const fast=sample(.001,false),slow=sample(.1,false);
 assert.equal(fast.played,1);assert.equal(fast.dropped,1);assert.equal(slow.played,2);
 assert.notEqual(fast.nextGameplayRandom,slow.nextGameplayRandom,'negative control: shared stream is wall-clock dependent');
 const isolatedFast=sample(.001,true),isolatedSlow=sample(.1,true);
 assert.equal(isolatedFast.played,1);assert.equal(isolatedSlow.played,2,'actual audio work is retained');
 assert.equal(isolatedFast.nextGameplayRandom,isolatedSlow.nextGameplayRandom);
});


test('actual fixed-step fixture isolates next-step input from intervening cosmetic RNG draws',()=>{
 const source=fs.readFileSync(new URL('../check-inkwave-runtime-performance.mjs',import.meta.url),'utf8');
 const start=source.indexOf('await page.addInitScript('),end=source.indexOf('},quality);',start)+1;
 const init=source.slice(start+'await page.addInitScript('.length,end);
 const run=cosmeticDraws=>{
  const math=Object.create(Math),window={},context={Math:math,window,localStorage:{setItem(){}}};vm.runInNewContext('('+init+')('+JSON.stringify('high')+')',context);
  const input=[],game={_frame(dt){assert.equal(dt,1/60);input.push(math.random());for(let i=0;i<cosmeticDraws;i++)math.random();}};
  for(let i=0;i<3;i++){for(let j=0;j<cosmeticDraws;j++)math.random();window.runtimeFixedStep(game,i);}
  return input;
 };
 assert.deepEqual(run(0),run(1000));assert.notEqual(run(0)[0],run(0)[1]);
 assert(source.includes('if(fixed&&probeG.game)probeG.game.frozen=true;'));
 assert(source.includes('probeG.time=0;g.rig.time=0;'));
});


test('actual owner instrumentation retains native work but excludes callbacks outside the fixed transaction',()=>{
 const source=fs.readFileSync(new URL('../check-inkwave-runtime-performance.mjs',import.meta.url),'utf8');
 const start=source.indexOf('await page.evaluate(()=>{window.runtimeWindowActive=false;'),end=source.indexOf(');\n  const runs=',start);
 assert(start>=0&&end>start);const instrument=source.slice(start+'await page.evaluate('.length,end);
 let nativeUpdates=0,clock=0;
 const g={match:{update(){nativeUpdates++;}},menus:{update(){this._tick();},_tick(){this._updateCursor();},_updateCursor(){}},_frame(){this.match.update();this.menus.update();return nativeUpdates;}};
 const context={probeG:{game:g},performance:{now:()=>clock++},PerformanceObserver:class{observe(){}},requestAnimationFrame:()=>1};context.window=context;
 vm.runInNewContext('('+instrument+')()',context);
 assert.equal(g._frame(),1);assert.equal(Object.keys(context.counts).length,0);
 context.runtimeWindowActive=true;assert.equal(g._frame(),2);assert.equal(g._frame(),3);context.runtimeWindowActive=false;
 assert.equal(g._frame(),4);assert.equal(context.counts.frame,2);assert.equal(context.counts.match,2);assert.equal(context.counts.menuTick,2);assert.equal(context.counts.cursor,2);
 assert.equal(context.timings.frame.length,2);assert(context.runtimeOwnerNames.includes('menuTick'));
 assert(source.includes('finally{runtimeWindowActive=false;}'));
});

test('runtime statistics use the standard even-sample median and preserve spike mean and p95',()=>{
 const stats=sampleStats;
 const r=stats([100,1,3,2]);assert.equal(r.n,4);assert.equal(r.median,2.5);assert.equal(r.mean,26.5);assert.equal(r.p95,100);assert.equal(r.max,100);
 assert.equal(stats([1,3,2]).median,2);assert.equal(stats([]).n,0);
});

test('actual menu input preparation waits for paint outside timing and rejects detached rows',async()=>{
 let painted=false,detached=false;const calls=[];
 const a={isConnected:true,dataset:{nav:'row'}},b={isConnected:true,dataset:{nav:'row'}};
 const window={},m={_candidates:()=>[a,b],setInputMode:mode=>calls.push(mode)};
 const context={window,probeG:{game:{menus:m}},getComputedStyle:()=>({opacity:painted?'1':'0'})};
 const run=(fn,arg)=>vm.runInNewContext('('+fn.toString()+')('+JSON.stringify(arg)+')',context);
 const page={evaluate:async(fn,arg)=>run(fn,arg),screenshot:async opts=>{assert.equal(opts.timeout,900000);assert(opts.path.startsWith(root));calls.push('paint');painted=true;if(detached)a.isConnected=false;},waitForFunction:async(fn,arg,opts)=>{assert.equal(opts.timeout,900000);calls.push('ready');assert.equal(run(fn,arg),true);}};
 await primeRuntimeMenuRows(page,path.join(root,'paint.png'),'pad');assert.deepEqual(calls,['pad','paint','ready']);
 // Negative control: the natural row cannot be ready before a frame presents.
 painted=false;assert.equal(run(()=>+getComputedStyle(window.runtimeModePrime.a).opacity>=.9),false);
 detached=true;await assert.rejects(primeRuntimeMenuRows(page,path.join(root,'detached.png'),'kbm'),/detached/);
});
