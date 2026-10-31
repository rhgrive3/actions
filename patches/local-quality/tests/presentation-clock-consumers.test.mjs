import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {createPresentationClock} from '../presentation-clock.mjs';
import {getPlatformLifecycle} from '../platform-lifecycle.mjs';
const before=JSON.parse(fs.readFileSync(new URL('./fixtures/presentation-clock-before-e67c636b.json',import.meta.url),'utf8')).files;
const current={};for(const[rel,entry]of Object.entries(before)){
 const source=adaptBuildSource(rel,fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8'));
 const body=parse(source,{ecmaVersion:'latest',sourceType:'module'}).body;
 const cls=body.map(x=>x.declaration||x).find(x=>x.type==='ClassDeclaration'&&x.id.name===entry.name);
 // The selected methods call these module-owned helpers after composition.
 // Compile their real declarations so transform writes retain the same guards.
 const locals=body.filter(x=>x.type==='FunctionDeclaration'&&x.id.name==='writeQueueTransform'||x.type==='VariableDeclaration'&&x.declarations.some(d=>d.id.name==='QUEUE_TRANSFORMS')).map(x=>source.slice(x.start,x.end)).join('\n');
 current[rel]={locals,methods:Object.fromEntries(cls.body.body.filter(x=>Object.hasOwn(entry.methods,x.key.name)).map(x=>[x.key.name,source.slice(x.start,x.end)]))};
}
const compile=(data,rel,deps)=>new Function(...Object.keys(deps),(data[rel].locals||'')+'\nreturn ({'+Object.values(data[rel].methods).join(',\n')+'})')(...Object.values(deps));
function env(){let time=0,serial=0;const rafs=new Map(),timers=new Map();
 const target=()=>{const events=new Map();return {addEventListener(k,fn){if(!events.has(k))events.set(k,new Set());events.get(k).add(fn);},removeEventListener(k,fn){events.get(k)?.delete(fn);},emit(k){for(const fn of [...events.get(k)||[]])fn({});}};};
 const e={...target(),document:{...target(),hidden:false},performance:{now:()=>time},console};
 const deps={performance:e.performance,requestAnimationFrame:fn=>{rafs.set(++serial,fn);return serial;},cancelAnimationFrame:id=>rafs.delete(id),setTimeout:(fn,ms)=>{timers.set(++serial,{fn,at:time+ms});return serial;},clearTimeout:id=>timers.delete(id),createPresentationClock:()=>createPresentationClock(e)};
 return {e,deps,rafs,timers,advance(ms,{frames=true,tickTimers=false}={}){time+=ms;if(frames){const pending=[...rafs.values()];rafs.clear();for(const fn of pending)fn(time);}if(tickTimers)for(const[id,row]of [...timers])if(time>=row.at){timers.delete(id);row.fn();}return time;},now:()=>time};
}
class Element{constructor(){this.children=[];this.style={};this.dataset={};this.offsetWidth=100;this.classList={add(){},remove(){},toggle(){}};}appendChild(x){if(x&&typeof x==='object'){this.children.push(x);x.parentNode=this;}return x;}remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);}}
const h=(_tag,props,...children)=>{const e=new Element();e.props=props;for(const c of children)e.appendChild(c);return e;};
function hud(data=current){const f=env(),G={};const deps={...f.deps,G,h,TEAM_NAMES:['ALPHA','BRAVO'],pct:(a,b)=>[a,b],toHex:x=>x,tr:x=>x,tu:x=>x,splatSVG:()=>'',colorVars(){},clamp:x=>Math.max(0,Math.min(1,x)),easeOutCubic:x=>1-(1-x)**3,easeOutBack:x=>x,lerp:(a,b,t)=>a+(b-a)*t};
 const x=Object.assign({el:new Element(),overLayer:new Element(),_fxMap:new Map(),_fxTime:0,timeScale:1,_snd(){}},compile(data,'src/ui/hud.js',deps));x._fxLoop=x._fxLoop.bind(x);return {...f,x};}
function wipe(data=current){const f=env();const deps={...f.deps,innerWidth:640,innerHeight:360,devicePixelRatio:1,rng:()=>()=>.5,shade:x=>x,TAU:Math.PI*2,WIPE:{mid:380,total:1000},safeCall:fn=>fn?.(),console};
 const x=Object.assign({host:new Element(),mark:new Element(),cv:{width:640,height:360},ctx:{setTransform(){},clearRect(){}},timeScale:1,isFrozen:()=>false,_setupFull(){},_setupLight(){},_drawFull(){},_drawLight(){},_drawFade(){}},compile(data,'src/ui/menu-art.js',deps));x._frame=x._frame.bind(x);return {...f,x};}
function showcase(data=current){const G={settings:{quality:'high'},net:{state:'offline'},menus:{current:'home',_stack:[]}},steps=[];const deps={G,OVERLAY:new Set(['loadout','locker','results']),PEDESTAL:new Set(['loadout','locker']),SET_MODES:new Set(['hub','lobby']),SET_FADE:.45,resolveLobbyQualityName:()=> 'high',c01:x=>Math.max(0,Math.min(1,x))};
 const step=dt=>steps.push(dt),x=Object.assign({mode:'results',chars:[{}],t:0,shotT:0,fadeIn:0,_warmState:true,fullFrame:true,fx:{update:step},confetti:{update:step},sparks:{update:step},contact:{instanceMatrix:{}},_updateLoadout:step,_updateResults:step,_clear(){this.cleared=true;},_lobRelease(){this.released=true;this.lob=null;},_lobStep:(_m,dt)=>step(dt),_lobContact(){}},compile(data,'src/game/showcase.js',deps));
 x.lob={ready:true,k:1,t:0,shotT:0,gone:0,quality:'high',set:{update:step},members:new Map(),contact:{},fx:[{update:step},{update:step}],sparks:{update:step},trail:{update:step}};return {x,G,steps};}
test('presentation clock pauses hidden/freeze, rebases resume, drops backward time and disposes subscriptions',()=>{
 const f=env(),clock=createPresentationClock(f.e),owner=getPlatformLifecycle(f.e);assert.equal(owner.clients.size,1);f.advance(500);assert.equal(clock.elapsed(f.now()),.5);
 f.e.document.hidden=true;f.e.document.emit('visibilitychange');f.advance(50000);assert.equal(clock.elapsed(f.now()),0);f.e.document.hidden=false;f.e.document.emit('visibilitychange');f.advance(200);assert.equal(clock.elapsed(f.now()),.2);
 f.e.document.emit('freeze');f.advance(90000);f.e.document.emit('resume');assert.equal(clock.elapsed(f.now()),0);assert.equal(clock.elapsed(f.now()-5),0);clock.rebase(f.now());clock.dispose();clock.dispose();assert.equal(owner.clients.size,0);f.advance(100);assert.equal(clock.elapsed(f.now()),0);
});
for(const hz of [30,60,120])test('normal '+hz+' FPS actual HUD/wipe/showcase match independently frozen method timelines',async()=>{
 const a=hud(),b=hud(before);let ar,br;a.x.judge({percents:[61,29]}).then(x=>ar=x);b.x.judge({percents:[61,29]}).then(x=>br=x);
 const wa=wipe(),wb=wipe(before);wa.x.run();wb.x.run();const sa=showcase(),sb=showcase(before);
 for(let i=0;i<hz*6;i++){a.advance(1000/hz);b.advance(1000/hz);wa.advance(1000/hz);wb.advance(1000/hz);sa.x.update(1/hz);sb.x.update(1/hz);await Promise.resolve();assert.deepEqual(ar,br);assert.equal(a.x._fxTime,b.x._fxTime);assert.equal(wa.x.r?.t,wb.x.r?.t);assert.equal(sa.x.t,sb.x.t);assert.equal(sa.x.lob?.gone,sb.x.lob?.gone);}
 assert.deepEqual(ar,{winner:0});assert.deepEqual(sa.steps,sb.steps);
});
for(const hz of [5,7,10,13,19])test('deadline consumers track visible elapsed at '+hz+' FPS, physical showcase stays <= .1',async()=>{
 const f=hud(),w=wipe(),s=showcase();let result;f.x.judge().then(x=>result=x);w.x.run();let wipeAt=null,judgeAt=null;
 for(let i=0;i<Math.ceil(hz*5.5);i++){const at=f.advance(1000/hz);w.advance(1000/hz);s.x.update(1/hz);await Promise.resolve();if(!w.x.r&&wipeAt===null)wipeAt=at;if(result&&judgeAt===null)judgeAt=at;}
 assert(wipeAt>=1000-1e-7&&wipeAt<=1000+1000/hz+1e-7);assert(judgeAt>5100&&judgeAt<=5100+1000/hz+1e-7);assert(s.steps.every(x=>x>=0&&x<=.1));assert(Math.abs(s.x.t-Math.ceil(hz*5.5)/hz)<1e-9);
 const old=wipe(before);old.x.run();for(let i=0;i<hz;i++)old.advance(1000/hz);assert(old.x.r,'baseline clamp misses 1 s wipe deadline');
});
test('HUD autonomous loop freezes world/timeScale/hidden intervals and preserves reentrant callback ownership',()=>{
 const f=hud();let count=0;f.x._addFx('effect',()=>{count++;return true;});f.advance(200);assert.equal(f.x._fxTime,.2);
 f.x.setWorldPaused(true);f.advance(30000);assert.equal(f.x._fxTime,.2);f.x.setWorldPaused(false);f.advance(100);assert(Math.abs(f.x._fxTime-.3)<1e-9);
 f.x.timeScale=0;f.advance(10000);assert(Math.abs(f.x._fxTime-.3)<1e-9);f.x.timeScale=1;f.e.document.hidden=true;f.e.document.emit('visibilitychange');f.advance(10000);assert(Math.abs(f.x._fxTime-.3)<1e-9);f.e.document.hidden=false;f.e.document.emit('visibilitychange');f.advance(100);assert(Math.abs(f.x._fxTime-.4)<1e-9);
 const next=()=>true;f.x._addFx('effect',()=>{f.x._addFx('effect',next);return false;});f.advance(16);assert.equal(f.x._fxMap.get('effect'),next);assert.equal(f.rafs.size,1);assert(count>0);
 f.x._fxMap.set('effect',()=>false);f.advance(16);assert.equal(getPlatformLifecycle(f.e).clients.size,0);assert.equal(f.rafs.size,0);
});
test('wipe freeze/hidden/timeScale zero resume without catch-up and nested onMid cannot finish replacement',()=>{
 const f=wipe();let frozen=false;f.x.isFrozen=()=>frozen;f.x.run();f.advance(200);frozen=true;f.advance(10000);assert.equal(f.x.r.t,200);frozen=false;f.advance(100);assert.equal(f.x.r.t,300);
 f.x.timeScale=0;f.advance(10000);assert.equal(f.x.r.t,300);f.x.timeScale=1;f.e.document.hidden=true;f.e.document.emit('visibilitychange');f.advance(10000);assert.equal(f.x.r.t,300);f.e.document.hidden=false;f.e.document.emit('visibilitychange');f.advance(100);assert.equal(f.x.r.t,400);f.x.cancel();assert.equal(getPlatformLifecycle(f.e).clients.size,0);
 let mid=0,done=0;f.x.run({onMid(){mid++;f.x.run({mode:'fade',onDone(){done++;}});}});f.advance(1200);assert.equal(mid,1);assert.equal(done,0);assert.equal(f.x.r.mode,'fade');assert.equal(f.x.r.t,0);f.advance(900);assert.equal(done,1);
});
test('showcase release and fade use elapsed while online/room/preload/menu holds preserve parked set',()=>{
 for(const hold of ['net','room','preload','stack','current','none']){const f=showcase();f.x.mode='home';f.x.lob.k=0;if(hold==='net')f.G.net.state='connected';if(hold==='room')f.x.lob.room={};if(hold==='preload')f.x.lob.preload=true;if(hold==='stack')f.G.menus._stack=['online'];if(hold==='current')f.G.menus.current='lobby';for(let i=0;i<8;i++)f.x.update(.2);assert.equal(!!f.x.released,hold==='none',hold);}
 const f=showcase();f.x.mode='home';f.x._out=.45;f.x._lastMode='results';f.x.update(.2);f.x.update(.2);assert(!f.x.cleared);f.x.update(.2);assert(f.x.cleared);assert(f.steps.every(x=>x<=.1));
});
test('native judge outgoing cleanup retires idle clock without waiting for HUD disposal',async()=>{
 const f=hud();let done=false;f.x.judge().then(()=>done=true);f.advance(5200);await Promise.resolve();assert(done);assert.equal(getPlatformLifecycle(f.e).clients.size,1);f.advance(650,{tickTimers:true});assert.equal(f.x._fxMap.size,0);assert.equal(f.rafs.size,0);assert.equal(getPlatformLifecycle(f.e).clients.size,0,'timer cleanup must retire the clock even after cancelling the final RAF');
});
