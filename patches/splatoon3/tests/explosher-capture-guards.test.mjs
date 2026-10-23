import os from 'node:os';
import realPath from 'node:path';
import realCrypto from 'node:crypto';
import {spawnSync as realSpawn} from 'node:child_process';
import {requireRuntimeUIPreflight} from '../../../scripts/lib/inkwave-explosher-runtime-ui-preflight.mjs';
import {inspectCommonBuild, requireApprovedCommonBuild} from '../../../scripts/lib/inkwave-explosher-common-build.mjs';
import {installProjectileCaptureUiGate} from '../../../scripts/lib/inkwave-projectile-capture-ui.mjs';
import {requireControlledStartupPair} from '../../../scripts/lib/inkwave-explosher-volume-barrier.mjs';
import { readExplosherCaptureSurface, explosherSurfaceReady } from '../../../scripts/lib/inkwave-explosher-capture-surface.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { awaitExplosherSceneSources, explosherSceneCensus, compareExplosherCaptures } from '../../../scripts/lib/inkwave-explosher-scene-census.mjs';
import { readExplosherSceneClocks, requireExplosherStyle, installExplosherEarlyFreeze, installExplosherRandom, readExplosherEffects } from '../../../scripts/lib/inkwave-explosher-startup.mjs';
const wrapper=fs.readFileSync(new URL('../../../scripts/check-inkwave-explosher-flight-glitter.mjs',import.meta.url),'utf8');
const nativeResetSource=fs.readFileSync(new URL('../../../scripts/check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8');
const driver=fs.readFileSync(new URL('../../../scripts/render-inkwave-projectile-shapes.mjs',import.meta.url),'utf8');
// Synthetic inspector fixture only: never an independently approved capture build.
function inspectorFixture(){
 const dir=fs.mkdtempSync(realPath.join(os.tmpdir(),'explosher-guard-unit-'));
 const root=realPath.join(dir,'source'),site=realPath.join(dir,'site');fs.mkdirSync(root);fs.mkdirSync(site);
 const hash=b=>realCrypto.createHash('sha256').update(b).digest('hex');
 const git=(...args)=>{const r=realSpawn('git',['-C',root,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 const write=(p,s)=>{fs.mkdirSync(realPath.dirname(p),{recursive:true});fs.writeFileSync(p,s);};
 write(realPath.join(root,'scripts/build-inkwave.mjs'),'// synthetic fixture, not production\n');write(realPath.join(root,'inkwave-public/src/main.js'),'// fixture main\n');
 git('init','-q');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Local synthetic inspector test');
 write(realPath.join(site,'src/main.js'),'// fixture emitted\n');
 const build={schema:1,build:{esbuild:'0.28.2',optimization:'esbuild-minify',script:hash(fs.readFileSync(realPath.join(root,'scripts/build-inkwave.mjs')))},files:{'upstream/src/main.js':hash(fs.readFileSync(realPath.join(root,'inkwave-public/src/main.js')))},artifacts:{'src/main.js':hash(fs.readFileSync(realPath.join(site,'src/main.js')))}};
 build.inputHash=hash(JSON.stringify(build.files));build.contentHash=hash(JSON.stringify(build.artifacts));write(realPath.join(site,'inkwave-build.json'),JSON.stringify(build));
 const outputManifest=['inkwave-build.json','src/main.js'].map(p=>{const b=fs.readFileSync(realPath.join(site,p));return{path:p,bytes:b.length,sha256:hash(b)};});
 const approval={schema:1,head:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),buildIdentitySha256:hash(fs.readFileSync(realPath.join(site,'inkwave-build.json'))),inputHash:build.inputHash,contentHash:build.contentHash,outputManifest,outputManifestSha256:hash(JSON.stringify(outputManifest))};
 return {dir,root,site,approval};
}
function diagnostic({publicAdmission=false,corrupt=false,runtimeMode=false}={}){
 const fixture=inspectorFixture();
 try {
 const saved={},sha=fixture.approval.head;let admissionCalls=0,evidenceWrites=0,spawns=0;
 const admission=(root,site)=>{
  admissionCalls++;assert.equal(admissionCalls,1);assert.equal(root,fixture.root);assert.equal(site,fixture.site);assert.equal(evidenceWrites,0);assert.equal(spawns,0);
  if(publicAdmission)return requireApprovedCommonBuild(root,site);
  if(corrupt)fs.appendFileSync(realPath.join(site,'src/main.js'),'// corruption');
  const result=inspectCommonBuild({root,site,approval:fixture.approval});assert.equal(result.verifiedSourceFiles,2);assert.equal(result.verifiedOutputs,2);return result;
 };

 const fakeFs={mkdirSync(){evidenceWrites++;},readFileSync(p){if(p.endsWith('check-inkwave-projectile-visuals.mjs'))return nativeResetSource;if(p.endsWith('render-inkwave-projectile-shapes.mjs'))return driver;if(p.endsWith('inkwave-build.json'))return JSON.stringify({build:{revision:'test'},artifacts:{'patches/splatoon3/runtime/s3-projectile-shapes.mjs':'hash','_versions/test/patches/practice-range/runtime/dummy.mjs':'hash'},contentHash:'hash'});if(p.endsWith('manifest.json'))return '[]';return 'source';},writeFileSync(p,v){evidenceWrites++;saved[p]=v;}};
 const path={resolve:x=>x,join:(...a)=>a.join('/')},crypto={createHash(){return {update(){return this;},digest(){return 'hash';}}}};
 const process={argv:['node','wrapper',fixture.site,'out',sha,fixture.root],execPath:'node',env:runtimeMode?{EXPLOSHER_RUNTIME_UI_PREFLIGHT:'test-unapproved'}:{},exit(){}};
 const spawn=(bin,args)=>{spawns++;return bin==='git'?{status:0,stdout:args.includes('rev-parse')?sha:'source'}:{status:0};};
 // Exercise actual generator and result-validation code, not full capture orchestration.
 // Common/inverse production admission is separately checked below; no synthetic
 // fixture is relabeled as the immutable published source/build pair.
 const section=(start,end)=>{assert.equal(wrapper.split(start).length,2);assert.equal(wrapper.split(end).length,2);const a=wrapper.indexOf(start),b=wrapper.indexOf(end);assert(b>a);return wrapper.slice(a,b);};
 const generation=section('const rangeEntryUrl=', 'const captureProtocolSha256=');
 const validation=wrapper.slice(wrapper.indexOf('const expected=new Set'));
 const code=(
  "const [site,out,sourceSha,sourceRoot]=process.argv.slice(2);const root=sourceRoot;"+
  section('const runtimeUIRoute=', 'const preflight=')+section('const git=(args)=>', 'fs.mkdirSync(out,')+
  "const preflight=false,video=false,controlled=null,shapeOverlay=null,expectedFrame=null;"+section('const captureTicks=', 'const expectedPath=')+
  "const hash=b=>crypto.createHash('sha256').update(b).digest('hex');const once=(s,a,b)=>{if(s.split(a).length!==2)throw Error('capture anchor mismatch: '+a);return s.replace(a,b);};"+
  generation+"const captures=[];"+validation
 ).replace(/import\.meta\.url/g,"'file:///tmp/x'").replace(/import\.meta\.resolve\('playwright'\)/g,"'playwright'");

 assert.throws(()=>new Function('fs','path','crypto','spawnSync','fileURLToPath','process','awaitExplosherSceneSources','explosherSceneCensus','readExplosherSceneClocks','requireExplosherStyle','installExplosherEarlyFreeze','installExplosherRandom','readExplosherEffects','readExplosherCaptureSurface','explosherSurfaceReady','requireApprovedCommonBuild','installProjectileCaptureUiGate','requireControlledStartupPair','requireRuntimeUIPreflight',code)(fakeFs,path,crypto,spawn,()=>'/root/',process,awaitExplosherSceneSources,explosherSceneCensus,readExplosherSceneClocks,requireExplosherStyle,installExplosherEarlyFreeze,installExplosherRandom,readExplosherEffects,readExplosherCaptureSurface,explosherSurfaceReady,admission,installProjectileCaptureUiGate,requireControlledStartupPair,args=>requireRuntimeUIPreflight({...args,env:process.env})),runtimeMode?/Official event path required/:publicAdmission?/Checkout head differs/:corrupt?/Output size differs/:/Wrong native capture count/);
 assert.equal(admissionCalls,runtimeMode?0:1);if(publicAdmission||corrupt||runtimeMode){assert.equal(evidenceWrites,0);assert.equal(spawns,0);}
 return saved['out/native-capture-driver.mjs'];
 }finally{fs.rmSync(fixture.dir,{recursive:true,force:true});}
}
test('capture admission guards reject incomplete or invalid evidence (no browser claim)',()=>{
 const generated=diagnostic();assert(generated);
 const bindStart=generated.indexOf('if(tick===0&&expectedFrame){');
 const bindEnd=generated.indexOf("if(pageErrors.length)throw Error('Native page errors: '",bindStart);
 assert(bindStart>=0&&bindEnd>bindStart);
 const bindCode=new Function('requireControlledStartupPair','tick','view','expectedFrame','measurement',generated.slice(bindStart,bindEnd));
 const bind=(...args)=>bindCode(requireControlledStartupPair,...args);
 const state={gameTime:0,hookTime:0,hookStamp:0,sprayT:0,featherT:0},rng={algorithm:'xorshift32',identityPreserved:true,seed:1,word:1,draws:0,resets:0};
 const controlledStartup={controlledInitialCondition:true,naturalBootAccepted:false,ownerVerified:true,resolvedTrue:true,before:state,after:state,rngBefore:rng,rngAfter:rng,assets:['roller','shooter'].map(name=>({name,patterns:2,warmFrames:2,showAll:true}))};
 const m={controlledStartup,camera:{position:[0,1,2]},palette:{colorblind:true,local:0xffd21a},physical:[{seed:.5}],preShot:{aimPoint:[0,1,10],rig:{blend:null,superJumpLandTime:1}}};
 assert.doesNotThrow(()=>bind(0,'behind',{view:'behind',measurement:m},m));
 assert.throws(()=>bind(0,'behind',{view:'behind',measurement:m},{...m,palette:{colorblind:false,local:123}}),/palette/);
 assert.throws(()=>bind(0,'behind',{view:'behind',measurement:m},{...m,physical:[{seed:.6}]}),/physical/);
 assert.throws(()=>bind(0,'behind',{view:'behind',measurement:m},{...m,camera:{position:[1,2,3]}}),/camera/);
 assert.doesNotThrow(()=>bind(0,'tele-side',{view:'behind',measurement:m},{...m,camera:{position:[1,2,3]}}));
 assert.throws(()=>bind(0,'tele-side',{view:'behind',measurement:m},{...m,physical:[{seed:.6}]}),/physical/);
 assert.throws(()=>bind(0,'tele-side',{view:'behind',measurement:m},{...m,palette:{colorblind:false,local:123}}),/palette/);
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 assert.doesNotThrow(()=>new AsyncFunction(generated.replace(/^import .*;\n/gm,'')));
 const modeStart=wrapper.indexOf('const captureTicks='),modeEnd=wrapper.indexOf('const expectedPath=');assert(modeStart>=0&&modeEnd>modeStart);
 const validateCode=new Function('captures','preflight','video',wrapper.slice(modeStart,modeEnd)+wrapper.slice(wrapper.indexOf('const expected=new Set')));
 const validate=(captures,preflight=false)=>validateCode(captures,preflight,false);
 const captures=[0,3,8,14,22,30].flatMap(t=>['behind','tele-side','tele-oblique'].map(v=>({label:'s3-slosher-washtub',tick:t,view:v,count:1,measurement:{sparkles:28,render:{points:28}}})));
 assert.doesNotThrow(()=>validate(captures));
 const live={...captures[0],measurement:{...captures[0].measurement,physical:[{wid:'s3-slosher-washtub',seed:.5}],aimTrace:[{local:true,wid:'s3-slosher-washtub',time:0,from:[0,1,0],aimPoint:[0,1,10],aimDir:[0,0,1],result:[0,0,1]}]}};
 assert.doesNotThrow(()=>validate([live],true));
 assert.throws(()=>validate([{...live,measurement:{...live.measurement,aimTrace:[]}}],true),/aim trace/);
 assert.throws(()=>validate([{...live,count:2}],true),/shot identity/);
 assert.throws(()=>validate([{...live,measurement:{...live.measurement,physical:[{wid:'shooter',seed:.5}]}}],true),/shot identity/);
 assert.throws(()=>validate([...captures.slice(0,17),captures[0]]),/Duplicate/);
 assert.throws(()=>validate(captures.slice(1)),/count/);
 assert.throws(()=>validate(captures.map((x,i)=>i===0?{...x,tick:99}:x)),/unexpected/);
 assert.throws(()=>validate(captures.map(x=>x.tick===3?{...x,measurement:{sparkles:28,render:{points:0}}}:x)),/Missing live/);
 const pg=generated.slice(generated.indexOf("if(pageErrors.length)throw Error('Native page errors: '"));
 const pageGuard=new Function('pageErrors',pg.slice(0,pg.indexOf(';')+1));
 assert.throws(()=>pageGuard(['TypeError: render failed']),/Native page errors/);
 const ig=generated.slice(generated.indexOf('if(imageStats.width!=='));
 const imageGuard=new Function('imageStats','measurement',ig.slice(0,ig.indexOf(';')+1));
 const measurement={viewport:{width:800,height:450}};
 assert.throws(()=>imageGuard({width:800,height:450,opaque:360000,range:0},measurement),/flat/);
 assert.throws(()=>imageGuard({width:800,height:450,opaque:0,range:100},measurement),/flat/);
 assert.doesNotThrow(()=>imageGuard({width:800,height:450,opaque:360000,range:100},measurement));
 const sourceGuard=new Function('actualSourceSha','sourceSha',"if(actualSourceSha!==sourceSha)throw Error('Requested SHA does not match checkout HEAD');");
 assert(wrapper.includes("if(actualSourceSha!==sourceSha)throw Error('Requested SHA does not match checkout HEAD');"));
 assert.throws(()=>sourceGuard('a'.repeat(40),'b'.repeat(40)),/checkout HEAD/);
});

test('all frame gate keeps later physics errors after an early resource mismatch',()=>{
 const frames=Array.from({length:18},(_,tick)=>({tick,view:'behind',measurement:{physical:[tick],render:{calls:1,triangles:2,points:28,lines:0},memory:{geometries:1,textures:1}}}));
 assert.equal(compareExplosherCaptures(frames,frames).mismatches.length,0);
 const after=JSON.parse(JSON.stringify(frames));after[0].measurement.render.triangles=3;after[17].measurement.physical=[999];
 const result=compareExplosherCaptures(frames,after);
 assert.equal(result.checked.length,18*21);
 const nonfinite=JSON.parse(JSON.stringify(frames));nonfinite[1].measurement.physical=[NaN];const nullable=JSON.parse(JSON.stringify(frames));nullable[1].measurement.physical=[null];assert(compareExplosherCaptures(nullable,nonfinite).mismatches.some(m=>m.domain==='physical'));
 assert(result.mismatches.some(m=>m.tick===0&&m.domain==='render.triangles'));
 assert(result.mismatches.some(m=>m.tick===17&&m.domain==='physical'));
});

test('scene readiness accepts native completion but rejects failed or replaced owners',async()=>{
 const ch={};const a={character:ch};const owner={character:ch,status:'ready',bank:{},squidBank:{},variant:'Player00',ready:Promise.resolve()};ch.sourceMotion=owner;
 const G={actors:[a],local:a};
 assert.equal((await awaitExplosherSceneSources(G,1000))[0].status,'ready');
 owner.status='error';await assert.rejects(awaitExplosherSceneSources(G,1000),/did not become ready/);
 owner.status='ready';owner.character={};await assert.rejects(awaitExplosherSceneSources(G,1000),/did not become ready/);
 owner.character=ch;owner.ready=Promise.reject(Error('native load failure'));await assert.rejects(awaitExplosherSceneSources(G,1000),/native load failure/);
});

test('scene census is read only and classifies actual actor versus background geometry',()=>{
 const root={visible:true},geo={attributes:{position:{count:9}},index:{count:12},drawRange:{start:3,count:6}};
 const actor={character:{root,style:{skin:2},sourceMotion:{status:'ready',currentClips:[]}}};
 const local={isMesh:true,type:'Mesh',visible:true,parent:root,geometry:geo};
 const background={isMesh:true,type:'Mesh',visible:true,parent:null,geometry:geo};
 const G={actors:[actor],local:actor,projectiles:{},fx:{}},scene={traverse:fn=>[local,background].forEach(fn)};
 const before=JSON.stringify({G,local,background});
 const receipt=explosherSceneCensus(G,scene);
 assert.equal(receipt.categories.length,2);
 assert(receipt.categories.every(c=>c.drawRangeEntries===6&&c.uniqueGeometries===1));
 assert.equal(JSON.stringify({G,local,background}),before);
});

test('scene readiness rechecks early actors after later actor loading completes',async()=>{
 let finish;
 const make=()=>{const ch={};const a={character:ch};ch.sourceMotion={character:ch,status:'ready',bank:{},squidBank:{},ready:Promise.resolve()};return a;};
 const early=make(),late=make();late.character.sourceMotion.ready=new Promise(r=>finish=r);
 const pending=awaitExplosherSceneSources({actors:[early,late],local:early},1000);
 await Promise.resolve();await Promise.resolve();
 early.character={sourceMotion:{status:'loading'}};
 finish();await assert.rejects(pending,/ownership/);
});

test('existing warm rejection and stalled readiness reject without starting warmAll',async()=>{
 const ch={};const a={character:ch};ch.sourceMotion={character:ch,status:'ready',bank:{},squidBank:{},ready:Promise.resolve()};
 ch._warmed=Promise.reject(Error('native warm failure'));
 await assert.rejects(awaitExplosherSceneSources({actors:[a],local:a},1000),/native warm failure/);
 ch._warmed=new Promise(()=>{});
 await assert.rejects(awaitExplosherSceneSources({actors:[a],local:a},1),/timeout/);
});

test('known native range targets are classified, never a blanket missing-loader exemption',async()=>{
 class TargetDummyCharacter{constructor(){this.root={name:'range:dummy'};}}
 const scene={},dummy={character:new TargetDummyCharacter(),rangeTarget:{index:0}};dummy.character.actor=dummy;dummy.character.root.parent=scene;
 const ch={};const player={character:ch};ch.sourceMotion={character:ch,status:'ready',bank:{},squidBank:{},ready:Promise.resolve()};
 const G={actors:[player,dummy],local:player,scene,match:{range:{targets:[dummy]}}};
 const receipt=await awaitExplosherSceneSources(G,1000,TargetDummyCharacter);
 assert.equal(receipt[0].kind,'source-character');assert.equal(receipt[1].kind,'range-target');
 delete ch.sourceMotion;await assert.rejects(awaitExplosherSceneSources(G,1000,TargetDummyCharacter),/Missing native/);
 ch.sourceMotion={character:ch,status:'ready',bank:{},squidBank:{},ready:Promise.resolve()};
 G.match.range.targets=[];await assert.rejects(awaitExplosherSceneSources(G,1000,TargetDummyCharacter),/range target ownership/);
});


test('normal boot style is mandatory and never repaired after construction',()=>{
 const style={hair:0,skin:7,outfit:5,eyes:1,hat:0,brows:3};
 assert.deepEqual(requireExplosherStyle(style),style);
 for(const value of [null,{}, {...style,outfit:0},{...style,eyes:6},{...style,skin:5},{...style,extra:1}])assert.throws(()=>requireExplosherStyle(value),/profile style/);
 assert.match(diagnostic(),/localStorage.setItem\('inkwave.profile'/);
 assert(!diagnostic().includes('G.time=0'));
 const frames=Array.from({length:18},(_,tick)=>({tick,view:'behind',measurement:{style,sceneClocks:{game:1,fx:1},startup:{trusted:true},render:{calls:1,triangles:2,points:28,lines:0},memory:{geometries:1,textures:1}}}));
 const after=structuredClone(frames);after[4].measurement.style.skin=0;after[7].measurement.sceneClocks.fx=2;
 const result=compareExplosherCaptures(frames,after);
 assert(result.mismatches.some(m=>m.tick===4&&m.domain==='style'));
 assert(result.mismatches.some(m=>m.tick===7&&m.domain==='sceneClocks'));
});

test('publication freeze rejects late installation and pre-entry clock advancement',()=>{
 const saved={window:globalThis.window,document:globalThis.document,queueMicrotask:globalThis.queueMicrotask};
 const tasks=[];let entry;
 try{
  const game={menus:{current:'mode'},debug:{freeze(){game.frozen=true;}}};
  const G={game,time:0,env:{time:0,U:{uTime:{value:0}}},fx:{_time:0},paint:{clock:0},scene:{traverse(){}}};
  globalThis.window={__G:G,readExplosherSceneClocks};
  globalThis.document={addEventListener(type,fn,capture){assert.equal(type,'click');assert.equal(capture,true);entry=fn;},removeEventListener(){}};
  globalThis.queueMicrotask=fn=>tasks.push(fn);
  installExplosherEarlyFreeze();window.__inkwave=game;
  assert.equal(game.frozen,true);assert.equal(tasks.length,1);tasks[0]();
  const trusted={isTrusted:true,target:{closest:()=>true}};
  assert.doesNotThrow(()=>entry(trusted));assert.equal(window.explosherEntry.trusted,true);
  G.fx._time=.1;assert.throws(()=>entry(trusted),/clocks advanced/);
  assert.throws(()=>installExplosherEarlyFreeze(),/already published/);
  G.fx._time=NaN;assert.throws(()=>readExplosherSceneClocks(),/Non-finite clock/);
  delete G.fx._time;assert.throws(()=>readExplosherSceneClocks(),/Missing clock/);
 }finally{for(const [key,value]of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});

test('seed reset reaches the same RNG function captured by native modules',()=>{
 const oldWindow=globalThis.window,original=Math.random;
 try{
  globalThis.window={};installExplosherRandom();const nativeRand=Math.random;
  const first=[nativeRand(),nativeRand(),nativeRand()];window.resetExplosherRandom();
  assert.equal(nativeRand,Math.random);assert.deepEqual([nativeRand(),nativeRand(),nativeRand()],first);
  assert.equal(window.readExplosherRandom().draws,3);assert.equal(window.readExplosherRandom().identityPreserved,true);
  Math.random=original;assert.throws(()=>window.resetExplosherRandom(),/identity replaced/);
 }finally{Math.random=original;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
});

test('bounded native FX digest is read only and detects active data, not inactive tails',async()=>{
 const oldWindow=globalThis.window;
 try{
  const fx={_dt:1/60,_time:1,_sqN:0,_sq:new Float32Array(14),dN:1,dCap:2};
  for(const key of ['dP','dV','dC','dK','dA'])fx[key]=new Float32Array(key==='dA'?16:6);
  const schemas={puffs:{P:3,V:3,C:3,X:14},glows:{P:3,V:3,C:3,X:14},rings:{P:3,V:3,C:3,N:3,X:8},shells:{P:3,V:3,C:3,X:9,A:4},beams:{P:3,C:3,X:5},marks:{P:3,N:3,C:3,X:6},pillars:{P:3,C:4,X:3}};
  for(const [name,schema]of Object.entries(schemas))fx[name]={n:1,cap:2,...Object.fromEntries(Object.entries(schema).map(([k,stride])=>[k,new Float32Array(stride*2)]))};
  const env={_frameId:20,gullInst:{count:1,instanceMatrix:{array:new Float32Array(16)}}};globalThis.window={__G:{fx,env}};
  const before=JSON.stringify({fx,env}),a=await readExplosherEffects();assert.equal(JSON.stringify({fx,env}),before);
  fx.puffs.P[5]=9;assert.deepEqual(await readExplosherEffects(),a);
  fx.puffs.P[0]=9;assert.notDeepEqual(await readExplosherEffects(),a);
  fx.puffs.n=3;await assert.rejects(readExplosherEffects(),/Invalid native FX pool/);
  fx.puffs.n=1;fx.puffs.P[0]=NaN;await assert.rejects(readExplosherEffects(),/Non-finite native effect/);
  fx.puffs.P[0]=0;const saved=fx.puffs.P;delete fx.puffs.P;await assert.rejects(readExplosherEffects(),/array stride/);fx.puffs.P=new Float32Array(5);await assert.rejects(readExplosherEffects(),/array stride/);fx.puffs.P=saved;
  fx._time=NaN;await assert.rejects(readExplosherEffects(),/FX scalar/);fx._time=1;fx._dt=undefined;await assert.rejects(readExplosherEffects(),/FX scalar/);fx._dt=1/60;
  fx._sqN=.5;await assert.rejects(readExplosherEffects(),/schedule count/);fx._sqN=0;env._frameId=NaN;await assert.rejects(readExplosherEffects(),/FX scalar/);
 }finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
});

test('generated driver preserves ordinary UI and binds the renderer canvas',()=>{
 const generated=diagnostic();
 assert(!generated.includes('body *{visibility:hidden!important}'));
 assert(!generated.includes("page.locator('canvas').first()"));
 assert(generated.includes("page.locator('#game-canvas').screenshot"));
 assert(generated.includes('window.explosherSurfaceReady(window.readExplosherCaptureSurface())'));
 assert(generated.includes('Native scene clocks advanced while awaiting ordinary UI completion'));
 assert(generated.includes('normal-ui-entry.png')&&generated.includes('normal-ui-after-wait.png'));
});

test('public common admission rejects synthetic unit provenance before driver side effects',()=>{assert.equal(diagnostic({publicAdmission:true}),undefined);});
test('actual common inspector rejects corrupted output before driver side effects',()=>{assert.equal(diagnostic({corrupt:true}),undefined);});

function assertWrapperAdmissionOrder(source){
 const ordered=['const runtimeUIRoute=Boolean(process.env.EXPLOSHER_RUNTIME_UI_PREFLIGHT);','const commonBuildAdmission=runtimeUIRoute',"?requireRuntimeUIPreflight({root:sourceRoot,site,sourceSha,baseline:path.join(root,'.ci-explosher-base'),candidate:root})",':requireApprovedCommonBuild(sourceRoot,site);',"if(commonBuildAdmission.head!==sourceSha)throw Error('Admitted common source differs');","if(!runtimeUIRoute&&(!shapeOverlay||!controlled))throw Error('This LOCAL stage candidate requires the reviewed common shape and controlled-main receipts');",'const rangeEntryUrl=','if(!runtimeUIRoute){','requireInverseShapePair(...','const run=spawnSync(process.execPath,','const expected=new Set'];
 let previous=-1;
 for(const anchor of ordered){assert.equal(source.split(anchor).length,2,anchor);const at=source.indexOf(anchor);assert(at>previous,anchor);previous=at;}
 assert(source.includes('receipt.diagnosticOnly=true;receipt.fullPairAccepted=false;'));
}
test('actual wrapper retains both strict admission routes and inverse gates before captures',()=>{assertWrapperAdmissionOrder(wrapper);});
test('runtime route cannot admit synthetic fixture without official event evidence',()=>{assert.equal(diagnostic({runtimeMode:true}),undefined);});
test('admission order controls reject missing route selector, strict helper, inverse gate and diagnostic boundary',()=>{
 for(const anchor of ['const runtimeUIRoute=Boolean(process.env.EXPLOSHER_RUNTIME_UI_PREFLIGHT);',':requireApprovedCommonBuild(sourceRoot,site);','?requireRuntimeUIPreflight(',"if(!runtimeUIRoute&&(!shapeOverlay||!controlled))",'requireInverseShapePair(...','receipt.fullPairAccepted=false;']){
  assert(wrapper.includes(anchor));const mutant=wrapper.replace(anchor,'/* mutation */');assert.notEqual(mutant,wrapper);assert.throws(()=>assertWrapperAdmissionOrder(mutant));
 }
});
