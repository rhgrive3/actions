import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {installRankedUi, objectiveText} from '../runtime/ranked/ui.mjs';
import {rankedText} from '../runtime/ranked/strings.mjs';
import {createPresentationClock} from '../../local-quality/presentation-clock.mjs';
import {getPlatformLifecycle} from '../../local-quality/platform-lifecycle.mjs';

const original = fs.readFileSync(new URL('./fixtures/queue-ranked-ui-031426fc.mjs.txt', import.meta.url), 'utf8');
const functionText = (source, name) => {
  for (const row of parse(source, {ecmaVersion:'latest', sourceType:'module'}).body) {
    const node = row.type === 'ExportNamedDeclaration' ? row.declaration : row;
    if (node?.type === 'FunctionDeclaration' && node.id.name === name) return source.slice(node.start, node.end);
  }
  throw Error('Missing real function ' + name);
};
const oldObjective = new Function('rankedText', 'clamp01', 'finite', 'teamName',
  'return (' + functionText(original, 'objectiveText') + ')')(rankedText,
  n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0)),
  (n,fallback=0)=>Number.isFinite(n)?n:fallback,
  (team,names)=>names?.[team]||(team===0?'ALPHA':team===1?'BRAVO':'NEUTRAL'));

test('tower objective remains identical to the independently frozen Drive baseline', () => {
  assert.equal(crypto.createHash('sha256').update(original).digest('hex'), '6662b227342181d760eb0c92fb6317adaa32f8df7ccba8d9479e13356ce986c7');
  const engine={mode:'tower',rule:{state:{progress:0,controllingTeam:0,checkpointIndex:[0,0]}},stage:{tower:{checkpoints:[[],[]]}}};
  const G={palette:{names:['ALPHA','BRAVO']}},api={LANG:'en'};
  let seed=29;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  for(let i=0;i<60000;i++){
    if(i%11===0){
      const state=engine.rule.state;state.progress=i%97===0?[NaN,Infinity,-Infinity,-0][i%4]:(random()*1.6-.3);
      state.controllingTeam=[-1,0,1][i%3];state.checkpointIndex=[Math.floor(random()*7),Math.floor(random()*5)];
      engine.stage.tower.checkpoints=[Array(i%5),Array(i%7)];api.LANG=i%2?'ja':'en';
      G.palette.names[i%2]=i%13?'ALPHA|BRAVO':'オレンジ';
    }
    assert.equal(objectiveText(engine,G,api),oldObjective(engine,G,api),'frame '+i);
  }
  for(const value of [0,-0,NaN,Infinity,-Infinity]){
    engine.rule.state.checkpointIndex=[value,value];engine.rule.state.progress=value;
    assert.equal(objectiveText(engine,G,api),oldObjective(engine,G,api));
  }
  // Snapshot replacement, same-engine reuse and in-place palette/locale edits.
  engine.rule={state:{progress:.91,controllingTeam:1,checkpointIndex:[1,2]}};
  for(const lang of ['ja','en',undefined]){api.LANG=lang;G.palette.names[1]='NEW';assert.equal(objectiveText(engine,G,api),oldObjective(engine,G,api));}
});

test('tower formatter retains custom coercion and accessor locale evaluation order', () => {
  const run=fn=>{
    const reads=[],name={toString(){reads.push('name');return 'CUSTOM';}};
    const api={get LANG(){reads.push('language');return reads.length%2?'ja':'en';}};
    const engine={mode:'tower',rule:{state:{progress:.4,controllingTeam:0,checkpointIndex:[1,0]}},stage:{tower:{checkpoints:[Array(3),[]]}}};
    const G={palette:{names:[name,'BRAVO']}};
    return {text:[fn(engine,G,api),fn(engine,G,api)],reads};
  };
  assert.deepEqual(run(objectiveText),run(oldObjective));
});

function environment(t, {fallback=false}={}) {
  let serial=0,time=0;
  const timers=new Map(),rafs=new Map();
  class Element {
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.nodes=new Map();this.dataset={};this.className='';this.textContent='';this.style={setProperty(){}};this.ownerDocument=doc;
      const classes=new Set();this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)};
    }
    appendChild(child){child.parent=this;this.children.push(child);return child;}
    append(...children){children.forEach(x=>this.appendChild(x));}
    remove(){if(this.parent){this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}}
    getRootNode(){let node=this;while(node.parent)node=node.parent;return node;}
    hasAttribute(name){return name==='data-iw-ranked-runtime'&&this.dataset.iwRankedRuntime==='1';}
    querySelector(key){if(!this.nodes.has(key))this.nodes.set(key,new Element());return this.nodes.get(key);}
    querySelectorAll(key){return this.children.filter(x=>key==='.iw-ranked-judge'&&x.className==='iw-ranked-judge');}
  }
  const doc={createElement:tag=>new Element(tag),querySelector:()=>doc.head.children.find(x=>x.tagName==='STYLE')||null};
  doc.head=new Element('head');doc.head.parent=doc;doc.body=new Element('body');doc.body.parent=doc;
  const globals={document:doc,requestAnimationFrame:fn=>{const id=++serial;rafs.set(id,fn);return id;},cancelAnimationFrame:id=>rafs.delete(id),
    setTimeout:(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:time+ms});return id;},clearTimeout:id=>timers.delete(id),
    performance:{now:()=>time},removeEventListener(){}};
  const descriptors=new Map(Object.keys(globals).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const [k,v]of Object.entries(globals))Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});
  t.after(()=>{for(const [k,d]of descriptors){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
  const composed=adaptBuildSource('src/ui/hud.js',fs.readFileSync(new URL('../../../inkwave-public/src/ui/hud.js',import.meta.url),'utf8'));
  const cls=parse(composed,{ecmaVersion:'latest',sourceType:'module'}).body.find(x=>x.type==='ExportNamedDeclaration'&&x.declaration?.id?.name==='HUD').declaration;
  const methods=cls.body.body.filter(x=>['_addFx','_fxLoop','setWorldPaused','setVisible','dispose'].includes(x.key.name)).map(x=>composed.slice(x.start,x.end));
  const clockEnvironment={document:doc,performance:globals.performance};
  const real=new Function('resetTeamWipeHud','restartAnim','createPresentationClock','return ({'+methods.join(',\n')+'})')(()=>{},()=>{},()=>createPresentationClock(clockEnvironment));
  class HUD {
    constructor(){this.el=new Element();this.overLayer=new Element();doc.body.append(this.el,this.overLayer);this._fxMap=new Map();this._fxTime=0;this.timeScale=1;this._fxLoop=this._fxLoop.bind(this);}
    update(){} judge(){return Promise.resolve({winner:-1});}
    _clearReticleFeedback(){} setWorldPaused(v){this._worldPaused=v;}
  }
  Object.assign(HUD.prototype,real);
  if(fallback)HUD.prototype._addFx=undefined;
  const engine={mode:'tower',winner:1,counts:[20,0],penalties:[2,0],rule:{state:{}},stage:{}};
  const match={ranked:engine},net={tr:{}},G={match,net,netm:{}};
  installRankedUi({G,HUD,LANG:'en'});const hud=new HUD();
  const advance=ms=>{
    const previous=time;
    time+=ms;
    const pending=[...rafs];rafs.clear();for(const [,fn]of pending)fn(time);
    for(const [id,row]of [...timers])if(row.at<=time){timers.delete(id);row.fn();}
    return Math.min(.25,Math.max(0,(time-previous)/1000));
  };
  return {G,match,engine,hud,timers,rafs,advance,lifecycle:getPlatformLifecycle(clockEnvironment),overlays:()=>hud.overLayer.querySelectorAll('.iw-ranked-judge')};
}

for(const hz of [30,60,120])test('actual composed HUD keeps 3.25 s judgment and 550 ms outgoing fade at '+hz+' Hz',async t=>{
  const f=environment(t);let result=null;const promise=f.hud.judge({isCurrent:()=>true}).then(x=>result=x);
  let elapsed=0;
  while(result===null){
    elapsed+=f.advance(1000/hz);await Promise.resolve();
    assert.equal(result!==null,elapsed>=3.25,'same elapsed-time threshold as the original FX callback');
    assert.ok(elapsed<3.25+2/hz);
  }
  await promise;assert.deepEqual(result,{winner:1});assert.equal(f.overlays().length,1);
  const outgoing=f.overlays()[0];assert.equal(outgoing.classList.contains('is-out'),true);
  f.advance(549);assert.equal(f.overlays().length,1);f.advance(1);
  assert.equal(f.overlays().length,0);assert.equal(f.hud._fxMap.size,0);assert.equal(f.timers.size,0);assert.equal(f.rafs.size,0);assert.equal(f.lifecycle.clients.size,0,'retired Ranked judge releases its presentation clock');
});

for(const reason of ['callback','throw','match','engine','net','netm','transport','dispose'])test('abandoned Ranked judge clears its exact owner: '+reason,async t=>{
  const f=environment(t);let current=true;
  const promise=f.hud.judge({isCurrent:()=>{if(current==='throw')throw Error('owner gone');return current;}});
  f.advance(100);const oldTick=f.hud._fxMap.get('ranked-judge');
  if(reason==='callback')current=false;
  else if(reason==='throw')current='throw';
  else if(reason==='match')f.G.match={ranked:f.engine};
  else if(reason==='engine')f.G.match.ranked={...f.engine};
  else if(reason==='net')f.G.net={tr:{}};
  else if(reason==='netm')f.G.netm={};
  else if(reason==='transport')f.G.net.tr={};
  else f.hud.dispose();
  f.advance(17);assert.deepEqual(await promise,{cancelled:true});
  assert.equal(f.overlays().length,0);assert.equal(f.hud._fxMap.size,0);assert.equal(f.timers.size,0);assert.equal(f.rafs.size,0);
  assert.equal(oldTick(.2),false);assert.equal(f.hud._judgeOwner,null);
});

test('old callbacks cannot delete a replacement judge or unrelated HUD FX',async t=>{
  const f=environment(t);const first=f.hud.judge();const stale=f.hud._fxMap.get('ranked-judge'),oldOwner=f.hud._judgeOwner;
  const second=f.hud.judge(),newOwner=f.hud._judgeOwner,newTick=f.hud._fxMap.get('ranked-judge');
  f.hud._fxMap.set('unrelated',()=>true);
  assert.deepEqual(await first,{cancelled:true});oldOwner.cancel();assert.equal(stale(10),false);
  assert.equal(f.hud._judgeOwner,newOwner);assert.equal(f.hud._fxMap.get('ranked-judge'),newTick);assert.equal(f.overlays().length,1);
  newOwner.cancel();assert.deepEqual(await second,{cancelled:true});assert.equal(f.hud._fxMap.size,1);
  assert.equal(f.hud._fxMap.has('unrelated'),true);
});

test('fallback timeout and pending show RAF are owned, and hidden abandoned HUD cancels without another frame',async t=>{
  const f=environment(t,{fallback:true});const promise=f.hud.judge();const staleTimers=[...f.timers.values()];
  assert.equal(f.timers.size,1);assert.equal(f.rafs.size,1);f.G.match={};f.hud.setVisible(false);
  assert.deepEqual(await promise,{cancelled:true});assert.equal(f.timers.size,0);assert.equal(f.rafs.size,0);assert.equal(f.overlays().length,0);
  staleTimers.forEach(x=>x.fn());assert.equal(f.timers.size,0);
});

test('invalid start creates no DOM/FX/timer and composed Game transitions cancel Ranked ownership before awaiting',async t=>{
  const f=environment(t);assert.deepEqual(await f.hud.judge({isCurrent:()=>false}),{cancelled:true});
  assert.equal(f.overlays().length,0);assert.equal(f.timers.size,0);assert.equal(f.rafs.size,0);
  const code=adaptBuildSource('src/main.js',fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8'));
  const cls=parse(code,{ecmaVersion:'latest',sourceType:'module'}).body.find(x=>(x.declaration||x).type==='ClassDeclaration'&&(x.declaration||x).id.name==='Game');
  for(const name of ['startMatch','startNetMatch','quitToMenu','netMatchEnd','_judge']){
    const m=(cls.declaration||cls).body.body.find(x=>x.key.name===name);
    const statements=m.value.body.body;const cancel=statements.find(x=>x.type==='IfStatement'&&code.slice(x.start,x.end).includes("_judgeOwner?.kind === 'ranked'"));
    assert.ok(cancel,name);assert.ok(statements.indexOf(cancel)<=3,name+' cancels before asynchronous admission');
    let cancellations=0;const run=new Function(code.slice(cancel.start,cancel.end));
    run.call({hud:{_judgeOwner:{kind:'ranked',cancel(){cancellations++;}}}});assert.equal(cancellations,1);
    run.call({hud:{_judgeOwner:{kind:'turf',cancel(){throw Error('unrelated owner');}}}});
  }
});

test('existing static-label cache avoids repeat translation while repairing outside DOM writes',()=>{
  const source=fs.readFileSync(new URL('../runtime/ranked/ui.mjs',import.meta.url),'utf8');let calls=0;
  const write=new Function('rankedText','writeHudText','return ('+functionText(source,'writeRankedLabel')+')')(
    (...args)=>{calls++;return rankedText(...args);},(node,text)=>{if(node.textContent!==text)node.textContent=text;});
  const node={textContent:''};for(let i=0;i<3600;i++)write(node,'en','PEN {n}',3);assert.equal(calls,1);assert.equal(node.textContent,'PEN 3');
  node.textContent='outside writer';write(node,'en','PEN {n}',3);assert.equal(calls,1);assert.equal(node.textContent,'PEN 3');
  write(node,'ja','PEN {n}',3);write(node,'ja','PEN {n}',0);assert.equal(calls,3);
});

for(const frames of [[1000,1000,1000,249,2],[3250],[500,750,2000]])test('actual composed Ranked judge preserves 3.25 s foreground deadline across '+frames.join('/')+' ms frames',async t=>{
 const f=environment(t);let result;f.hud.judge().then(x=>result=x);let elapsed=0;
 for(const ms of frames){elapsed+=ms;f.advance(ms);await Promise.resolve();assert.equal(!!result,elapsed>=3250);}
 assert.deepEqual(result,{winner:1});f.advance(550);assert.equal(f.overlays().length,0);assert.equal(f.lifecycle.clients.size,0);assert.equal(f.rafs.size,0);
});
test('Ranked deadline ignores paused and zero-scale intervals then resumes exact visible time',async t=>{
 const f=environment(t);let result;f.hud.judge().then(x=>result=x);f.advance(1000);f.hud.timeScale=0;f.advance(10000);await Promise.resolve();assert.equal(result,undefined);
 f.hud.timeScale=1;f.hud.setWorldPaused(true);f.advance(10000);await Promise.resolve();assert.equal(result,undefined);f.hud.setWorldPaused(false);f.advance(2249);await Promise.resolve();assert.equal(result,undefined);f.advance(2);await Promise.resolve();assert.deepEqual(result,{winner:1});f.advance(550);assert.equal(f.lifecycle.clients.size,0);
});
test('custom HUD one-argument FX callbacks retain dt accumulation without a native clock',async t=>{
 const f=environment(t);let tick,result;f.hud._addFx=(_name,fn)=>{tick=fn;};f.hud.judge().then(x=>result=x);
 tick(1);tick(2);await Promise.resolve();assert.equal(result,undefined);tick(.25);await Promise.resolve();assert.deepEqual(result,{winner:1});f.advance(550);assert.equal(f.overlays().length,0);
});

for(const mode of ['rainmaker','clams'])test(mode+' labels retain independent baseline text through mutable state, rounding and locale changes',()=>{
 const G={match:{actors:[{nid:'local',name:'A|B',team:0}],local:{nid:'local',team:0}}},api={LANG:'en'},engine={mode,rule:{state:{}}};
 let seed=515;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 for(let i=0;i<20000;i++){
  if(i%9===0){api.LANG=i%2?'ja':'en';G.match.actors[0].name=i%6?'A|B':`Player ${i}`;G.match.actors[0].team=i%2;G.match.local.team=i%3-1;
   const state=engine.rule.state,phase=i%7;
   if(mode==='rainmaker')Object.assign(state,{goalHold:phase===0,respawnRemaining:phase===1?random()*5:0,barrier:{active:phase===2,max:i%11?100:NaN,balance:random()*300-150},carrier:phase===3?'local':phase===4?'unknown':null,holderRemaining:random()*60,charge:{value:random()*1.2-.1},retreatRate:random()*2,lastCarrierTeam:i%3-1});
   else Object.assign(state,{inventories:i%5?{local:{team:0,small:random()*12,power:i%4===0},other:{team:1,small:random()*7,power:i%9===0}}:{},scoredPoints:[random()*100,i%11?random()*100:NaN],baskets:i%13?[{barrierOpen:phase===2,openTimer:random()*7,cooldown:phase===1?random()*5:0},{barrierOpen:phase===3,openTimer:random()*8,cooldown:random()*2}]:[]});
  }
  assert.equal(objectiveText(engine,G,api),oldObjective(engine,G,api),mode+' frame '+i);
 }
 const run=fn=>{let count=0;const reads=[],api={get LANG(){reads.push(++count);return count%2?'ja':'en';}};return {text:[fn(engine,G,api),fn(engine,G,api)],reads};};assert.deepEqual(run(objectiveText),run(oldObjective));
});
test('ranked objective formatting sleeps at stable display values and clock cache repairs replaced or externally modified DOM',()=>{
 const source=fs.readFileSync(new URL('../runtime/ranked/ui.mjs',import.meta.url),'utf8');let translations=0;
 const fast=new Function('rankedText','clamp01','finite','teamName','const rainmakerTextCache=new WeakMap(),clamsTextCache=new WeakMap();'+['displayTextEntry','storeDisplayText','objectiveText'].map(name=>functionText(source,name)).join('\n')+';return objectiveText;')((...args)=>{translations++;return rankedText(...args);},n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0)),n=>Number.isFinite(n)?n:0,team=>team===0?'ALPHA':team===1?'BRAVO':'NEUTRAL');
 const engine={mode:'rainmaker',rule:{state:{respawnRemaining:4.8}}};for(let i=0;i<3600;i++)fast(engine,{}, {LANG:'en'});assert.equal(translations,1);engine.rule.state.respawnRemaining=3.9;fast(engine,{}, {LANG:'en'});assert.equal(translations,2);fast(engine,{}, {LANG:'ja'});assert.equal(translations,3);
 const begin=source.indexOf("  const locale = Object.getOwnPropertyDescriptor(api, 'LANG');"),end=source.indexOf('  writeHudText(refs.objective',begin),block=source.slice(begin,end);assert(begin>0&&end>begin);
 let formatted=0;const fmt=n=>{formatted++;const s=Math.max(0,Math.ceil(Number.isFinite(n)?n:0));return`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
 const tick=new Function('refs','engine','api','fmtClock','finite','writeHudText','rankedText','const t=(text,vars)=>rankedText(api.LANG,text,vars);'+block),refs={clock:{textContent:''}},e={time:61.3,overtime:false},api={LANG:'en'},run=()=>tick(refs,e,api,fmt,n=>Number.isFinite(n)?n:0,(node,text)=>{if(node.textContent!==text)node.textContent=text;},rankedText);
 for(let i=0;i<3600;i++)run();assert.equal(formatted,1);assert.equal(refs.clock.textContent,'1:02');refs.clock.textContent='external';run();assert.equal(formatted,1);assert.equal(refs.clock.textContent,'1:02');
 refs.clock={textContent:''};run();assert.equal(formatted,2);e.time=60;run();assert.equal(refs.clock.textContent,'1:00');e.overtime=true;e.overtimeElapsed=2.3;run();assert.equal(refs.clock.textContent,'OT 0:03');api.LANG='ja';run();assert.equal(refs.clock.textContent,rankedText('ja','OT {time}',{time:'0:03'}));
 for(const value of [NaN,Infinity,-Infinity,-1,-0,0,1.000001]){e.overtimeElapsed=value;run();assert.equal(refs.clock.textContent,rankedText('ja','OT {time}',{time:fmt(value)}));}
});
