import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { awaitExplosherSceneSources, explosherSceneCensus, compareExplosherCaptures } from '../../../scripts/lib/inkwave-explosher-scene-census.mjs';
const wrapper=fs.readFileSync(new URL('../../../scripts/check-inkwave-explosher-flight-glitter.mjs',import.meta.url),'utf8');
const nativeResetSource=fs.readFileSync(new URL('../../../scripts/check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8');
const driver=fs.readFileSync(new URL('../../../scripts/render-inkwave-projectile-shapes.mjs',import.meta.url),'utf8');
function diagnostic(){
 const saved={},sha='a'.repeat(40);
 const fakeFs={mkdirSync(){},readFileSync(p){if(p.endsWith('check-inkwave-projectile-visuals.mjs'))return nativeResetSource;if(p.endsWith('render-inkwave-projectile-shapes.mjs'))return driver;if(p.endsWith('inkwave-build.json'))return JSON.stringify({artifacts:{'patches/splatoon3/runtime/s3-projectile-shapes.mjs':'hash'},contentHash:'hash'});if(p.endsWith('manifest.json'))return '[]';return 'source';},writeFileSync(p,v){saved[p]=v;}};
 const path={resolve:x=>x,join:(...a)=>a.join('/')},crypto={createHash(){return {update(){return this;},digest(){return 'hash';}}}};
 const process={argv:['node','wrapper','site','out',sha,'root'],execPath:'node',env:{},exit(){}};
 const spawn=(bin,args)=>bin==='git'?{status:0,stdout:args.includes('rev-parse')?sha:'source'}:{status:0};
 const code=wrapper.replace(/^#!.*\n/,'').replace(/^import .*;\n/gm,'').replace(/import\.meta\.url/g,"'file:///tmp/x'").replace(/import\.meta\.resolve\('playwright'\)/g,"'playwright'");
 assert.throws(()=>new Function('fs','path','crypto','spawnSync','fileURLToPath','process','awaitExplosherSceneSources','explosherSceneCensus',code)(fakeFs,path,crypto,spawn,()=>'/root/',process,awaitExplosherSceneSources,explosherSceneCensus),/Wrong native capture count/);
 return saved['out/native-capture-driver.mjs'];
}
test('capture admission guards reject incomplete or invalid evidence (no browser claim)',()=>{
 const generated=diagnostic();assert(generated);
 const bindStart=generated.indexOf('if(tick===0&&expectedFrame){');
 const bindEnd=generated.indexOf("if(pageErrors.length)throw Error('Native page errors: '",bindStart);
 assert(bindStart>=0&&bindEnd>bindStart);
 const bind=new Function('tick','view','expectedFrame','measurement',generated.slice(bindStart,bindEnd));
 const m={camera:{position:[0,1,2]},palette:{colorblind:true,local:0xffd21a},physical:[{seed:.5}],preShot:{aimPoint:[0,1,10]}};
 assert.doesNotThrow(()=>bind(0,'behind',{view:'behind',measurement:m},m));
 assert.throws(()=>bind(0,'behind',{view:'behind',measurement:m},{...m,palette:{colorblind:false,local:123}}),/palette/);
 assert.throws(()=>bind(0,'behind',{view:'behind',measurement:m},{...m,physical:[{seed:.6}]}),/physical/);
 assert.throws(()=>bind(0,'behind',{view:'behind',measurement:m},{...m,camera:{position:[1,2,3]}}),/camera/);
 assert.doesNotThrow(()=>bind(0,'tele-side',{view:'behind',measurement:m},{...m,camera:{position:[1,2,3]}}));
 assert.throws(()=>bind(0,'tele-side',{view:'behind',measurement:m},{...m,physical:[{seed:.6}]}),/physical/);
 assert.throws(()=>bind(0,'tele-side',{view:'behind',measurement:m},{...m,palette:{colorblind:false,local:123}}),/palette/);
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 assert.doesNotThrow(()=>new AsyncFunction(generated.replace(/^import .*;\n/gm,'')));
 const validate=new Function('captures','preflight',wrapper.slice(wrapper.indexOf('const expected=new Set')));
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
 assert.equal(result.checked.length,18*16);
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
