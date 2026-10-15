import test from 'node:test';import assert from 'node:assert/strict';import {labels,compare}from'./verify.mjs';
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
const readinessSource=browserSource.slice(0,browserSource.indexOf("import fs from"));
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
