import test from 'node:test';import assert from 'node:assert/strict';import {labels,compare,verifyControlledReadiness}from'./verify.mjs';
const copy=x=>structuredClone(x);
function fixture(candidate=false){const input=labels.map((label,n)=>({label,bots:n!==124,anchors:Array.from({length:8},(_,i)=>n===120?null:{x:100+i+(n>=60&&n<120?n:0),y:200,s:1,vis:1,behind:false})}));const frames=input.map(({label,bots,anchors},n)=>({label,calls:[0,1,2,3,4,5,6,7],assignments:n===120?0:candidate&&n>0&&n<60?0:8,rows:Array.from({length:8},(_,i)=>({i,on:n!==120,classes:'iw-plate is-open'+(bots?' is-bot':''),transform:'translate3d(100px,200px,0) scale(1)',computedTransform:'matrix(1, 0, 0, 1, 100, 200)',opacity:n===120?'0':'1',display:'block',visibility:'visible',rect:[100,200,0,0],child:{rect:[70,180,60,20],opacity:'1',display:'block',visibility:'visible',color:'rgb(255, 255, 255)',background:'rgb(28, 22, 48)'},stack:{rect:[70,180,60,20],opacity:n===120?'0':'.92',scale:'1',translate:'-50% 0px'},ancestors:[{tag:'DIV',classes:'iw-plate__ghost',opacity:'1',display:'block',visibility:'visible'},{tag:'DIV',classes:'iw-plate__stack',opacity:n===120?'0':'.92',display:'flex',visibility:'visible'},{tag:'DIV',classes:'iw-plate',opacity:'1',display:'block',visibility:'visible'}],bobPhase:0,text:bots?'BOT':'OPEN',icon:'<svg></svg>'}))}));return{status:'passed',restored:true,input,natural:copy(input),naturalObservation:input.map(f=>({label:f.label,assignments:8,transforms:Array(8).fill('translate3d(100px,200px,0)'),visible:Array(8).fill(true)})),frames};}
test('complete equal native-result schema accepts measured reduction',()=>assert.equal(compare(fixture(),fixture(true)).status,'passed'));
test('symmetric missing frames/rows/styles/invisible visible slot reject',()=>{for(const mutate of[r=>r.frames.pop(),r=>r.frames[0].rows=[],r=>delete r.frames[0].rows[0].transform,r=>r.frames[0].rows[0].child.opacity='0',r=>r.frames[0].rows[0].child.rect[2]=0,r=>r.frames[0].rows[0].ancestors[2].opacity='0',r=>r.restored=false]){const a=fixture(),b=fixture(true);mutate(a);mutate(b);assert.throws(()=>compare(a,b));}});
test('wrong projection, missing real movement, false hidden/return and lost bot state reject',()=>{for(const mutate of[r=>r.input[1].anchors[0].x++,r=>{for(let i=60;i<120;i++)r.natural[i].anchors=copy(r.natural[60].anchors);},r=>r.frames[120].rows[0].on=true,r=>r.frames[124].rows[0].text='BOT']){const a=fixture(),b=fixture(true);mutate(b);assert.throws(()=>compare(a,b));}});
test('visible output mismatch and no reduction reject',()=>{const b=fixture(true);b.frames[3].rows[2].text='wrong';assert.throws(()=>compare(fixture(),b));assert.throws(()=>compare(fixture(),fixture()));});

test('intentional zero-size anchor requires positive visible child and stack',()=>{const a=fixture(),b=fixture(true);assert.equal(a.frames[0].rows[0].rect[2],0);compare(a,b);b.frames[0].rows[0].stack.rect[2]=0;assert.throws(()=>compare(a,b));});

import fs from 'node:fs';
const probeSource=fs.readFileSync(new URL('./lobby-probe.mjs',import.meta.url),'utf8');
const advanceSource=probeSource.match(/function advanceNativeLobby\(sc,width,height\)\{[^}]+\}/)?.[0];assert(advanceSource);
const advance=(0,eval)('('+advanceSource+')');
test('native camera tick follows simulation with exact viewport before capture',()=>{const calls=[],sc={update(dt){calls.push(['update',dt]);},_lobCamera(w,h){calls.push(['camera',w,h,this._fdt]);}};advance(sc,1000,800);assert.deepEqual(calls,[['update',1/60],['camera',1000,800,1/60]]);assert.match(probeSource,/advanceNativeLobby\(sc,innerWidth,innerHeight\);capture\('moving'\+i\)/);});
test('missing or failed native camera step fails closed',()=>{assert.throws(()=>advance({update(){}},1000,800));const failure=Error('camera failure');assert.throws(()=>advance({update(){},_lobCamera(){throw failure;}},1000,800),e=>e===failure);});

const browserSource=fs.readFileSync(new URL('./browser.mjs',import.meta.url),'utf8');
const readinessSource=browserSource.slice(0,browserSource.indexOf("import {verifyControlledReadiness}"));
const readiness=(0,eval)('('+readinessSource.trim()+')');
test('readiness observations preserve all original gates and expose failed condition',()=>{
 const saved={G:globalThis.COMPONENT_G,game:globalThis.__inkwave,receipt:globalThis.LOBBY_READINESS};let calls=0;
 const sc={mode:'lobby',lob:{ready:true,k:1,room:{}},lobbySlotAnchor(){calls++;return {x:1,y:2,s:1,vis:1,behind:false};}},game={showcase:sc,frozen:false},G={game,mode:'menu',menus:{_scr:{name:'lobby'}},net:{state:'lobby',isMock:true}};
 globalThis.COMPONENT_G=G;globalThis.__inkwave=game;delete globalThis.LOBBY_READINESS;
 try{assert.equal(readiness(),true);assert.equal(calls,8);assert.equal(globalThis.LOBBY_READINESS.gameIdentity,true);const original=JSON.stringify(G);
 for(const change of ['ready','fade','menu','visible']){const before=calls;if(change==='ready')sc.lob.ready=false;if(change==='fade')sc.lob.k=.99;if(change==='menu')G.menus._scr.name='main';if(change==='visible')sc.lobbySlotAnchor=()=>{calls++;return {vis:0};};assert.equal(readiness(),false);assert.equal(globalThis.LOBBY_READINESS.ready,false);assert.equal(calls-before,change==='visible'?8:0);sc.lob.ready=true;sc.lob.k=1;G.menus._scr.name='lobby';}
 assert.equal(JSON.stringify(G),original);assert.equal(globalThis.LOBBY_READINESS.polls,5);assert.match(browserSource,/waitForFunction\(observeLobbyReadiness,null,\{timeout:30000\}\)/);
 }finally{globalThis.COMPONENT_G=saved.G;globalThis.__inkwave=saved.game;globalThis.LOBBY_READINESS=saved.receipt;}
});

const runnerSource=fs.readFileSync(new URL('./run-hosted.mjs',import.meta.url),'utf8');
const select=(0,eval)('('+runnerSource.split('\n')[0]+')');
test('engine isolation requires one exact engine and keeps both workflow jobs',()=>{
 assert.equal(select('chromium'),'chromium');assert.equal(select('webkit'),'webkit');
 for(const v of [undefined,'','both','firefox','chromium webkit'])assert.throws(()=>select(v));
 const localWorkflow=new URL('./inkwave-lobby-slot-browser.yml',import.meta.url);const workflow=fs.readFileSync(fs.existsSync(localWorkflow)?localWorkflow:new URL('../../.github/workflows/inkwave-lobby-slot-browser.yml',import.meta.url),'utf8');
 assert.match(workflow,/engine: \[webkit\]/);assert.match(workflow,/fail-fast: false/);assert.match(workflow,/max-parallel: 1/);
 assert.match(workflow,/cap=4\*1024\*\*3;reserve=2\*1024\*\*3;deadline=600/);
 assert.match(runnerSource,/phase\('browser',role\)/);assert.match(runnerSource,/compare\(\.\.\.results\)/);
 assert.equal((runnerSource.match(/for\(const current of \[engine\]\)/g)||[]).length,2);
});

test('controlled readiness waits for native assets and advances only exact native ticks/camera',()=>{
 const saved=Object.fromEntries(['COMPONENT_G','__inkwave','LOBBY_READINESS','LOBBY_CONTROLLED_READINESS','innerWidth','innerHeight'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const calls=[],game={frozen:false,debug:{freeze(){calls.push(['freeze']);game.frozen=true;}}},sc={mode:'lobby',lob:{ready:false,k:0,room:{}},update(dt){calls.push(['update',dt]);this.lob.k=Math.min(1,this.lob.k+dt/.45);},_lobCamera(w,h){calls.push(['camera',w,h,this._fdt]);},lobbySlotAnchor(){return {x:1,y:2,s:1,vis:1};}};
 Object.assign(game,{showcase:sc});Object.assign(globalThis,{COMPONENT_G:{game,menus:{_scr:{name:'lobby'}},net:{state:'lobby',isMock:true}},__inkwave:game,LOBBY_CONTROLLED_READINESS:{ticks:0},innerWidth:1000,innerHeight:800});
 try{
  assert.equal(readiness(),false);assert.deepEqual(calls,[]);assert.equal(game.frozen,false);sc.lob.ready=true;
  for(let i=0;i<27;i++)assert.equal(readiness(),false);assert.equal(readiness(),true);assert.equal(globalThis.LOBBY_CONTROLLED_READINESS.ticks,28);assert.equal(calls[0][0],'freeze');for(let i=1;i<calls.length;i+=2){assert.deepEqual(calls[i],['update',1/60]);assert.deepEqual(calls[i+1],['camera',1000,800,1/60]);}
  sc.lobbySlotAnchor=()=>({vis:0});assert.equal(readiness(),false);globalThis.LOBBY_CONTROLLED_READINESS.ticks=120;const count=calls.length;assert.equal(readiness(),false);assert.equal(calls.length,count);
 }finally{for(const[k,d]of Object.entries(saved))if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}
});
test('controlled readiness refuses failed freeze or native update/camera and never assigns native ready/fade',()=>{
 assert(!/lob\.(?:ready|k)\s*=/.test(readinessSource));assert.match(browserSource,/LOBBY_CONTROLLED_READINESS=\{ticks:0\}/);assert.match(browserSource,/waitForFunction\(observeLobbyReadiness,null,\{timeout:30000\}\)/);
 const saved=Object.fromEntries(['COMPONENT_G','__inkwave','LOBBY_CONTROLLED_READINESS','innerWidth','innerHeight'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));const game={frozen:false,debug:{freeze(){}}},sc={mode:'lobby',lob:{ready:true,k:0},update(){throw Error('native update failed');}};game.showcase=sc;Object.assign(globalThis,{COMPONENT_G:{game,menus:{_scr:{name:'lobby'}}},__inkwave:game,LOBBY_CONTROLLED_READINESS:{ticks:0},innerWidth:1000,innerHeight:800});
 try{assert.throws(()=>readiness(),/native freeze/);game.frozen=true;assert.throws(()=>readiness(),/native update failed/);sc.update=()=>{};assert.throws(()=>readiness(),/_lobCamera/);}finally{for(const[k,d]of Object.entries(saved))if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}
});

test('controlled readiness receipt rejects mode, tick, native-ready/fade/frozen/identity gaps',()=>{
 const r={readinessMode:'controlled-component',controlledTicks:28,lobReady:true,ready:true,frozen:true,fade:1,gameIdentity:true};verifyControlledReadiness(r);
 for(const [key,value] of [['readinessMode','natural-render'],['controlledTicks',121],['controlledTicks',.5],['controlledTicks',-1],['lobReady',false],['ready',false],['frozen',false],['fade',.99],['fade',NaN],['gameIdentity',false]])assert.throws(()=>verifyControlledReadiness({...r,[key]:value}));
});

test('separate WebKit functional budget preserves deadline/reserve and diagnostic identity',()=>{
 const w=fs.readFileSync(new URL('./inkwave-lobby-slot-browser.yml',import.meta.url),'utf8');
 assert.match(w,/cap=4\*1024\*\*3;reserve=2\*1024\*\*3;deadline=600/);
 assert.match(w,/if rss>cap:reason=/);assert.match(w,/current\[19\]/);
 assert.match(w,/smaps_rollup/);assert.match(w,/pssError/);assert.match(w,/process identity changed/);
 assert.match(browserSource,/function setPhase/);assert.match(browserSource,/subphase:phase/);
 for(const phase of ['browser-launch','navigation','game-readiness','create-offline-lobby','lobby-readiness','fonts-and-freeze','lobby-probe'])assert(browserSource.includes("setPhase('"+phase+"')"));
});
