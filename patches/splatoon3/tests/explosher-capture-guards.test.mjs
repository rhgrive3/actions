import {requireControlledStartupPair}from'../../../scripts/lib/inkwave-explosher-volume-barrier.mjs';
import {fixture as stageFixture}from'./explosher-stage-fixture.mjs';
import { installProjectileCaptureUiGate } from '../../../scripts/lib/inkwave-projectile-capture-ui.mjs';
import { readExplosherCaptureSurface, explosherSurfaceReady } from '../../../scripts/lib/inkwave-explosher-capture-surface.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { awaitExplosherSceneSources, explosherSceneCensus, compareExplosherCaptures } from '../../../scripts/lib/inkwave-explosher-scene-census.mjs';
import { readExplosherSceneClocks, requireExplosherStyle, installExplosherEarlyFreeze, installExplosherRandom, readExplosherEffects } from '../../../scripts/lib/inkwave-explosher-startup.mjs';
const wrapper=fs.readFileSync(new URL('../../../scripts/check-inkwave-explosher-flight-glitter.mjs',import.meta.url),'utf8');
const nativeResetSource=fs.readFileSync(new URL('../../../scripts/check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8');
const driver=fs.readFileSync(new URL('../../../scripts/render-inkwave-projectile-shapes.mjs',import.meta.url),'utf8');
function diagnostic(controlledMode=false,mutate=null,shapeMode=false){
 const saved={},sha='cc0c90afe8031643e6a890974f8f44a40a30509e';
 const control={controlledInitialCondition:true,naturalBootAccepted:false,site:'site',sourceRoot:'root',file:'controlled.js',transformedEmittedSha256:'hash',originalEmittedSha256:'hash',buildContentHash:'hash',paths:['src/main.js','_versions/test/src/main.js']};if(mutate&&!shapeMode)mutate(control);
 const shape={schema:1,lane:'after',sameBuildComparison:true,fullGameTwoBuildAcceptance:false,expectedCommonSourceHead:sha,site:'site',sourceRoot:'root',file:'halo.js',baselineSourceBlob:'83a76f51f56cffdf66bca6e16c56dd18b2c06f93',candidateSourceBlob:'351427cd20c9726dd21c3cbe949078cbce23c81b',originalEmittedSha256:'hash',candidateEmittedSha256:'hash',transformedEmittedSha256:'hash',buildContentHash:'hash',paths:['patches/splatoon3/runtime/s3-projectile-shapes.mjs','_versions/test/patches/splatoon3/runtime/s3-projectile-shapes.mjs']};if(shapeMode&&mutate)mutate(shape);
 const fakeFs={mkdirSync(){},readFileSync(p){if(p==='shape.json')return JSON.stringify(shape);if(p==='control.json')return JSON.stringify(control);if(p.endsWith('check-inkwave-projectile-visuals.mjs'))return nativeResetSource;if(p.endsWith('render-inkwave-projectile-shapes.mjs'))return driver;if(p.endsWith('inkwave-build.json'))return JSON.stringify({build:{revision:'test'},artifacts:{'src/main.js':'hash','_versions/test/src/main.js':'hash','patches/splatoon3/runtime/s3-projectile-shapes.mjs':'hash','_versions/test/patches/splatoon3/runtime/s3-projectile-shapes.mjs':'hash','_versions/test/patches/practice-range/runtime/dummy.mjs':'hash'},contentHash:'hash'});if(p.endsWith('manifest.json'))return '[]';return 'source';},writeFileSync(p,v){saved[p]=v;}};
 const path={resolve:x=>x,join:(...a)=>a.join('/')},crypto={createHash(){return {update(){return this;},digest(){return 'hash';}}}};
 const process={argv:['node','wrapper','site','out',sha,'root'],execPath:'node',env:{EXPLOSHER_CONTROLLED_MAIN:'control.json',EXPLOSHER_SHAPE_OVERLAY:'shape.json',EXPLOSHER_PREFLIGHT:'1'},exit(){}};
 const spawn=(bin,args)=>bin==='git'?{status:0,stdout:args.includes('rev-parse')?sha:'source'}:{status:0};
 const code=wrapper.replace(/^#!.*\n/,'').replace(/^import .*;\n/gm,'').replace(/import\.meta\.url/g,"'file:///tmp/x'").replace(/import\.meta\.resolve\('playwright'\)/g,"'playwright'");
 assert.throws(()=>new Function('fs','path','crypto','spawnSync','fileURLToPath','process','awaitExplosherSceneSources','explosherSceneCensus','readExplosherSceneClocks','requireExplosherStyle','installExplosherEarlyFreeze','installExplosherRandom','readExplosherEffects','readExplosherCaptureSurface','explosherSurfaceReady','installProjectileCaptureUiGate','requireControlledStartupPair',code)(fakeFs,path,crypto,spawn,()=>'/root/',process,awaitExplosherSceneSources,explosherSceneCensus,readExplosherSceneClocks,requireExplosherStyle,installExplosherEarlyFreeze,installExplosherRandom,readExplosherEffects,readExplosherCaptureSurface,explosherSurfaceReady,installProjectileCaptureUiGate,requireControlledStartupPair),mutate? /controlled|Controlled|overlay/: /Wrong native capture count/);
 return saved['out/native-capture-driver.mjs'];
}
test('capture admission guards reject incomplete or invalid evidence (no browser claim)',()=>{
 const generated=diagnostic();assert(generated);
 const bindStart=generated.indexOf('if(tick===0&&expectedFrame){');
 const bindEnd=generated.indexOf("if(pageErrors.length)throw Error('Native page errors: '",bindStart);
 assert(bindStart>=0&&bindEnd>bindStart);
 const rawBind=new Function('tick','view','expectedFrame','measurement','requireControlledStartupPair',generated.slice(bindStart,bindEnd)),bind=(...args)=>rawBind(...args,requireControlledStartupPair);
 const fixed=stageFixture().frames[0].measurement;const m={...fixed,camera:{position:[0,1,2]},palette:{colorblind:true,local:0xffd21a},physical:[{seed:.5}],preShot:{...fixed.preShot,aimPoint:[0,1,10]}};
 assert.doesNotThrow(()=>bind(0,'behind',{view:'behind',measurement:m},m));
 assert.throws(()=>bind(0,'behind',{view:'behind',measurement:m},{...m,palette:{colorblind:false,local:123}}),/palette/);
 assert.throws(()=>bind(0,'behind',{view:'behind',measurement:m},{...m,physical:[{seed:.6}]}),/physical/);
 assert.throws(()=>bind(0,'behind',{view:'behind',measurement:m},{...m,camera:{position:[1,2,3]}}),/camera/);
 assert.doesNotThrow(()=>bind(0,'tele-side',{view:'behind',measurement:m},{...m,camera:{position:[1,2,3]}}));
 assert.throws(()=>bind(0,'tele-side',{view:'behind',measurement:m},{...m,physical:[{seed:.6}]}),/physical/);
 assert.throws(()=>bind(0,'tele-side',{view:'behind',measurement:m},{...m,palette:{colorblind:false,local:123}}),/palette/);
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 assert.doesNotThrow(()=>new AsyncFunction(generated.replace(/^import .*;\n/gm,'')));
 const rawValidate=new Function('captures','preflight','captureTicks','captureViews',wrapper.slice(wrapper.indexOf('const expected=new Set'))),validate=(captures,preflight=false)=>rawValidate(captures,preflight,preflight?[0]:[0,3,8,14,22,30],preflight?['behind']:['behind','tele-side','tele-oblique']);
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

test('controlled module integration retains unique native server and consumes exact response body proof',()=>{
 const generated=diagnostic(true);assert(generated);
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 assert.doesNotThrow(()=>new AsyncFunction(generated.replace(/^import .*;\n/gm,'')));
 assert(generated.includes("['not present']")===false);
 assert(generated.includes('Consumed controlled main mismatch'));assert(generated.includes('served-controlled-main.json'));
 assert(generated.includes('controlledStartup:globalThis.__inkwaveExplosherControlledStartup'));
 assert(generated.includes('controlled-startup.json'));assert(generated.includes("res.body().then(body=>servedControlledMain"));
 for(const change of [c=>c.naturalBootAccepted=true,c=>c.sourceRoot='other',c=>c.site='other',c=>c.buildContentHash='wrong',c=>c.originalEmittedSha256='wrong',c=>c.transformedEmittedSha256='wrong',c=>c.paths[1]='unrelated/main.js'])diagnostic(true,change);
});

test('common native UI gates/history remain installed and strict in the generated Explosher driver',()=>{const s=diagnostic();assert.match(s,/window.__iwProjectileCaptureUiHistory = history/);assert.match(s,/phase:'admission'/);assert.match(s,/ui.ready===true/);assert.match(s,/phase:'capture',requireReady:true/);assert.match(s,/captureUiHistory:window.__iwProjectileCaptureUiHistory/);assert.doesNotMatch(s,/body \*\{visibility:hidden/);});

test('same-build shape overlay and controlled main coexist without overriding common UI',()=>{const s=diagnostic(true,null,true);assert.match(s,/servedShapeOverlay/);assert.match(s,/Consumed shape overlay byte mismatch/);assert.match(s,/Consumed controlled main mismatch/);assert.match(s,/__iwProjectileCaptureUiGate/);});
for(const [name,change]of [['head',s=>s.expectedCommonSourceHead='0'.repeat(40)],['lane',s=>s.lane='unknown'],['runtime blob',s=>s.candidateSourceBlob='0'.repeat(40)],['served hash',s=>s.transformedEmittedSha256='bad'],['path',s=>s.paths[0]='src/main.js'],['build identity',s=>s.buildContentHash='bad']])test('same-build overlay rejects '+name,()=>diagnostic(false,change,true));
test('actual generated consumed-overlay guard rejects absent, corrupt and failed response bodies',()=>{
 const s=diagnostic(true,null,true),guard=s.match(/if\(shapeOverlayErrors.length\|\|!servedShapeOverlay.length[^\n]+/)[0];
 const check=new Function('servedShapeOverlay','shapeOverlayErrors',guard);
 check([{sha256:'hash'}],[]);for(const [rows,errors]of [[[],[]],[[{sha256:'bad'}],[]],[[{sha256:'hash'}],['read failed']]])assert.throws(()=>check(rows,errors),/Consumed shape overlay/);
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;assert.doesNotThrow(()=>new AsyncFunction(s.replace(/^import .*;\n/gm,'')));
});
