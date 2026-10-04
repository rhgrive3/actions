import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {hash,verifyRuntimeBuild,persistentDirectory,invalidWindows} from '../lib/inkwave-runtime-evidence.mjs';
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
test('complete comparison rejects replay, different browser/seed, wrong windows, absent parity and hidden work',()=>{
 const run=()=>({fixedSteps:30,counts:{frame:30,match:30,sceneMatrices:60,cursor:30},timings:{frame:{n:30,median:2,p95:3,max:4},sceneMatrices:{n:60,median:.1}},quality:'medium',scale:1,matchState:'playing',gameplay:{time:179,actors:Array.from({length:8},()=>({pos:[0,0,0],hp:100,ink:100,alive:true,weapon:'shooter'})),coverage:[.01,0],projectiles:2},renderInfo:{calls:10,triangles:100}});
 const b={status:'passed',sourceSha:'5e28dbd16f7829aebd88052ff5f7fdf71f39fdad',verifiedRuntimeFiles:['src/core/renderer.js'],environment:{quality:'medium',browser:'test-chromium',seed:1,seedMode:'reset-each-profile-window'},scenarios:['title','settings','battle'].map(scenario=>({scenario,runs:Array.from({length:3},run)})),input:Array.from({length:36},()=>({targetError:4}))};
 const a=structuredClone(b);a.sourceSha='b'.repeat(40);a.inputStatus='synchronous';a.inputErrors=[];a.input.forEach(r=>{r.targetError=0;r.ringOn=false;r.ringVisibility='hidden';});a.scenarios.forEach(s=>s.runs.forEach(r=>r.counts.sceneMatrices=30));a.ringRetirement=Array.from({length:3},()=>({beforeOpacity:1,stateChanged:true,ringOn:false,ghost:false,visibility:'hidden'}));a.renderParity=Array.from({length:3},()=>({nonempty:true,freshTransform:true,changedChannels:0,sceneAutoRestored:true}));a.menuLifecycle={hidden:Array.from({length:3},()=>({ticks:0,raf:0})),resumedTicks:1,hiddenDocument:Array.from({length:3},()=>({ticks:0,raf:0})),documentResumedTicks:1};a.menuLifetime=Array.from({length:3},()=>({fontListeners:0,observedOwners:0}));
 const check=(before,after,expect)=>{const pa=path.join(root,'valid-before.json'),pb=path.join(root,'valid-after.json'),out=path.join(root,'valid-compare.json');fs.writeFileSync(pa,JSON.stringify(before));fs.writeFileSync(pb,JSON.stringify(after));let passed=true;try{execFileSync(process.execPath,[new URL('../compare-inkwave-runtime-performance.mjs',import.meta.url).pathname,'--before',pa,'--after',pb,'--out',out],{stdio:'pipe'});}catch{passed=false;}assert.equal(passed,expect);assert.equal(JSON.parse(fs.readFileSync(out)).status,expect?'passed':'failed');};
 check(b,a,true);
 for(const mutate of [x=>x.sourceSha=b.sourceSha,x=>x.environment.browser='another',x=>x.environment.seed=2,x=>x.environment.seedMode='uncontrolled',x=>delete x.environment.seedMode,x=>delete x.scenarios[2].runs[0].gameplay,x=>x.scenarios[2].runs[0].gameplay.coverage[0]=.02,x=>x.scenarios[2].runs[0].gameplay.actors[0].hp=99,x=>x.scenarios[2].runs[0].counts.frame=29,x=>x.scenarios[2].runs[0].matchState='intro',x=>x.scenarios[2].runs[0].scale=.75,x=>delete x.renderParity,x=>x.renderParity[0].freshTransform=false,x=>x.menuLifecycle.hidden[0].ticks=1,x=>x.menuLifetime[0].fontListeners=20,x=>x.input[0].ringVisibility='visible',x=>delete x.input[0].ringOn,x=>x.menuLifecycle.hiddenDocument[0].ticks=1,x=>delete x.menuLifecycle.hiddenDocument,x=>x.ringRetirement[0].ghost=true,x=>x.ringRetirement[0].beforeOpacity=0,x=>delete x.ringRetirement,x=>delete x.ringRetirement[0].beforeOpacity,x=>x.ringRetirement[0].stateChanged=false,x=>x.input[0].ringOn=true]){const changed=structuredClone(a);mutate(changed);check(b,changed,false);}
});
