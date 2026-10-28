import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {adaptBuildSource} from '../inkwave-source-composition.mjs';
import {startProjectileThroughMenu} from '../lib/inkwave-projectile-menu-start.mjs';

function fakePage(overrides={}, {touch=false,width=720,graphWidth=width,visualCols=2,initial=6,blockedFocus=false,keyReject=false,hangKey=false,hangFocus=false,hangMouse=false,hangConfig=false,hangCapability=false,hangClick=false,delayKey=false,delayStart=false,hangAt=0,useComposedGraph=false,afterNavigate=()=>{}}={}){
  const clicks=[],taps=[],keys=[],phases=[],events=[],cols=graphWidth<=360?1:graphWidth<=900?2:3;
  const g={debug:{},bootMs:94000,match:{attract:true},profile:{weapon:'shooter'},menus:{current:'main',_scr:{name:'main'},_setup:{mode:'turf',mapId:'tidewater',difficulty:'normal',duration:180,...overrides},_stageTime:()=> 'day'}};
  const ids=['mode-turf','mode-zones','mode-tower','mode-rainmaker','mode-clams','mode-boss','mode-range'];
  const root={inert:false,parentNode:null},cards=ids.map(id=>({dataset:{id},isConnected:true,disabled:false,parentElement:root,closest:()=>null})),control=cards[0];
  const row={querySelectorAll:()=>cards};root.contains=el=>cards.includes(el);root.querySelector=()=>row;
  let graph=null;if(useComposedGraph){
    const raw=fs.readFileSync(new URL('../../inkwave-public/src/ui/menus.js',import.meta.url),'utf8');
    const source=adaptBuildSource('src/ui/menus.js',raw),mode=source.indexOf('_scr_mode('),start=source.indexOf('const graph = new Map();',mode),end=source.indexOf('    return {',start);
    assert(mode>=0&&start>mode&&end>start);
    graph=vm.runInNewContext('(function(cards){'+source.slice(start,end)+';return graph})(cards)',{cards:cards.slice(0,6),globalThis:{innerWidth:graphWidth}});
  }

  g.menus._focus=cards[initial];g.menus._scr.el=root;
  const context={navigator:{maxTouchPoints:touch?1:0},matchMedia:()=>({matches:touch}),window:{__inkwave:g,__G:{mode:'menu'},innerWidth:width},document:{querySelectorAll:()=>[control]},getComputedStyle:e=>e===row?{gridTemplateColumns:Array(visualCols).fill('100px').join(' ')}:{opacity:e.opacity??'1'}};
  const evaluate=fn=>vm.runInNewContext('('+fn.toString()+')()',context);
  const pointerMoves=[];let closeCalls=0;
  const page={close:async()=>{closeCalls++;},mouse:{move:async(x,y)=>{pointerMoves.push([x,y]);if(hangMouse)return new Promise(()=>{});}},evaluate:async fn=>{const src=fn.toString();if((hangFocus&&src.includes('gridTemplateColumns'))||(hangConfig&&src.includes('g.menus?._setup'))||(hangCapability&&src.includes('navigator.maxTouchPoints')))return new Promise(()=>{});return evaluate(fn);},keyboard:{press:async key=>{
    keys.push(key);if(delayKey)return new Promise(resolve=>setTimeout(resolve,70));if(hangKey||keys.length===hangAt)return new Promise(()=>{});if(keyReject)throw Error('keyboard blocked');
    if(key==='Enter'){if(g.menus._focus===control)g.menus.current='setup';return;}
    const i=cards.indexOf(g.menus._focus);let next=i;
    if(!blockedFocus){
      if(i===6){if(key==='ArrowLeft')next=5;}
      else if(graph){const target=graph.get(cards[i])?.[key==='ArrowLeft'?'left':'up'];if(target)next=cards.indexOf(target);}
      else if(key==='ArrowLeft')next=i%cols===0?i:i-1;else if(key==='ArrowUp'&&i>=cols)next=i-cols;
    }

    if(next>=0)g.menus._focus=cards[next];afterNavigate({g,root,control,context,cards,row});
  }},locator:selector=>({click:async options=>{assert(options.timeout>0);clicks.push(selector);if(delayStart&&selector.includes('\"start\"'))return new Promise(resolve=>setTimeout(resolve,70));if(hangClick)return new Promise(()=>{});if(selector.includes('"play"')){g.menus.current='mode';g.menus._scr.name='mode';}else if(selector.includes('mode-turf'))g.menus.current='setup';else if(selector.includes('"start"'))g.menus.current=null;},tap:async()=>{taps.push(selector);throw Error('touch tap is not a performance admission');},press:async()=>{throw Error('locator Enter is not used');}})};
  return {page,clicks,taps,keys,pointerMoves,phases,events,evaluate,context,g,root,control,get closeCalls(){return closeCalls;},options:{receipt:events,remainingMs:()=>1234,waitForPhase:async(fn,label)=>{phases.push(label);assert.equal(evaluate(fn),true);}}};
}
test('mobile reduced-motion mode entries do not retain scale entrance hit-box obstruction',()=>{
  const css=fs.readFileSync(new URL('../../patches/splatoon3/ui.css',import.meta.url),'utf8');
  const rule=/@media \(prefers-reduced-motion: reduce\) \{\s*:is\(html\.iw-touch \.iw-ui, \.iw-ui\.is-touch\) \.iw-modesel \.iw-mode\.iw-in \{([^}]*)\}/.exec(css);
  assert.ok(rule,'real touch mode-card selector remains present under reduced motion');
  assert.match(rule[1],/animation:\s*none\s*!important\s*;/);
  assert.match(rule[1],/translate:\s*none\s*;/);
  assert.match(rule[1],/scale:\s*1\s*;/);
  assert.match(rule[1],/transition:\s*none\s*;/);
  // The native Playwright path must still use the card's normal click handler,
  // never evaluate _accept()/show()/startMatch() or force a hidden click.
  const route=fs.readFileSync(new URL('../lib/inkwave-projectile-menu-start.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(route,/page\.locator\(turfSelector\)\.press\(/);
  assert.match(route,/await click\(turfSelector\)/);
  assert.match(route,/page\.keyboard\.press\(key\)/);
  assert.match(route,/page\.keyboard\.press\('Enter'\)/);
  assert.doesNotMatch(route,/\.tap\(/);
  assert.doesNotMatch(route,/force:\s*true|\.dispatchEvent\(|_startMatch\(|startMatch\(/);
});
test('normal menu navigation issues one real START after verifying exact scenario',async()=>{
  const h=fakePage();await startProjectileThroughMenu(h.page,h.options);
  assert.deepEqual(h.clicks,['.iw-main [data-id="play"]','.iw-modesel [data-id="mode-turf"]','.iw-setup [data-id="map-tidewater"]','.iw-setup [data-id="start"].iw-btn--start']);
  assert.deepEqual(h.keys,[]);assert.deepEqual(h.taps,[]);
  assert.deepEqual(h.pointerMoves,[[1,1]],'clear the previous card hover without force-clicking');
  assert.equal(h.events.at(-1).event,'native-start-clicked');assert.equal(h.events.at(-1).attempt,1);
  assert.equal(h.events.find(e=>e.event==='native-setup-verified').config.map,'tidewater');
});
for(const [width,visualCols] of [[320,1],[480,1],[720,2],[1000,3]])test('touch-sized performance route observes all seven initial focuses at width '+width,async()=>{
  for(let initial=0;initial<7;initial++){
    const h=fakePage({}, {touch:true,width,visualCols,initial});await startProjectileThroughMenu(h.page,h.options);
    if(initial===6)assert.equal(h.keys[0],'ArrowLeft');assert.equal(h.keys.at(-1),'Enter');assert.deepEqual(h.taps,[]);
    assert.equal(h.events.filter(e=>e.event==='native-focus-step').length,h.keys.length-1);
    assert.equal(h.clicks.some(s=>s.includes('mode-turf')),false);
    const focus=h.events.find(e=>e.event==='native-turf-focused');assert.equal(focus.focus.focused,focus.focus.target);assert.equal(focus.focus.ready,true);
    assert.equal(h.events.filter(e=>e.event==='keyboard-activate-on-touch').length,1);
    assert.equal(h.events.filter(e=>e.event==='native-start-clicked').length,1);
  }
});
test('touch route follows observed focus when graph was built at another viewport',async()=>{
  const h=fakePage({}, {touch:true,width:844,graphWidth:1000,visualCols:2,initial:6,useComposedGraph:true});
  await startProjectileThroughMenu(h.page,h.options);
  assert.deepEqual(h.keys.slice(0,4),['ArrowLeft','ArrowUp','ArrowUp','ArrowLeft']);
  assert.equal(h.keys.at(-1),'Enter');assert.equal(h.events.find(e=>e.event==='native-turf-focused').focus.button,'mode-turf');
});
test('composed graph remains navigable after different viewport sizes from every initial owner',async()=>{
  for(const [width,graphWidth,visualCols] of [[320,1000,1],[1000,320,3],[844,480,2]])for(let initial=0;initial<7;initial++){
    const h=fakePage({}, {touch:true,width,graphWidth,visualCols,initial,useComposedGraph:true});
    await startProjectileThroughMenu(h.page,h.options);
    assert.equal(h.keys.at(-1),'Enter',`${width}/${graphWidth}/${initial}`);
    assert.equal(h.events.find(e=>e.event==='native-turf-focused').focus.button,'mode-turf');
    assert.equal(h.clicks.some(s=>s.includes('mode-turf')),false);
  }
});
test('deadline closes the page if the post-bump native key hangs',async()=>{
  const h=fakePage({}, {touch:true,width:844,graphWidth:1000,visualCols:2,initial:6,useComposedGraph:true,hangAt:4});h.options.remainingMs=()=>20;
  await assert.rejects(startProjectileThroughMenu(h.page,h.options),/deadline exceeded/);
  assert.deepEqual(h.keys,['ArrowLeft','ArrowUp','ArrowUp','ArrowLeft']);
  assert.equal(h.closeCalls,1);assert.equal(h.keys.includes('Enter'),false);
  assert.equal(h.clicks.some(s=>s.includes('mode-turf')||s.includes('"start"')),false);
  assert.equal(h.events.filter(e=>e.event==='native-action-timeout'&&e.pageCloseRequested).length,1);
});
test('touch-sized route refuses Enter or START on blocked, spoofed, stale or no-longer-ready focus',async()=>{
  const cases=[{blockedFocus:true},{afterNavigate:({g})=>{g.menus._focus={dataset:{id:'mode-turf'}};}},{afterNavigate:({g})=>{g.menus._scr.name='stale';}},{afterNavigate:({root})=>{root.inert=true;}},{afterNavigate:({control})=>{control.isConnected=false;}},{afterNavigate:({control})=>{control.opacity='0.6';}},{afterNavigate:({context,control})=>{context.document.querySelectorAll=()=>[control,control];}}];
  for(const options of cases){
    const h=fakePage({}, {touch:true,...options});await assert.rejects(startProjectileThroughMenu(h.page,h.options),/focus (?:unavailable|navigation stalled)/);
    assert.equal(h.keys.includes('Enter'),false);assert.deepEqual(h.taps,[]);
    assert.equal(h.clicks.some(s=>s.includes('mode-turf')||s.includes('"start"')),false);
  }
});
test('native keyboard failure propagates without synthetic or pointer fallback',async()=>{
  const h=fakePage({}, {touch:true,keyReject:true});await assert.rejects(startProjectileThroughMenu(h.page,h.options),/keyboard blocked/);
  assert.deepEqual(h.keys,['ArrowLeft']);assert.deepEqual(h.taps,[]);assert.equal(h.clicks.some(s=>s.includes('mode-turf')||s.includes('"start"')),false);
});
test('navigation deadline expiry rejects before Enter or START',async()=>{
  const h=fakePage({}, {touch:true});let calls=0;h.options.remainingMs=()=>++calls<5?1234:0;
  await assert.rejects(startProjectileThroughMenu(h.page,h.options),/deadline exceeded/);
  assert.equal(h.keys.includes('Enter'),false);assert.equal(h.clicks.some(s=>s.includes('"start"')),false);
});
test('actual composed focus graph reaches Turf across native breakpoints including CSS mismatch',()=>{
  const raw=fs.readFileSync(new URL('../../inkwave-public/src/ui/menus.js',import.meta.url),'utf8');
  const source=adaptBuildSource('src/ui/menus.js',raw),mode=source.indexOf('_scr_mode('),start=source.indexOf('const graph = new Map();',mode),end=source.indexOf('    return {',start);
  assert(mode>=0&&start>mode&&end>start);const body=source.slice(start,end);
  const range=fs.readFileSync(new URL('../../patches/practice-range/runtime/menu.mjs',import.meta.url),'utf8');
  assert.match(range,/if \(f === card\)[\s\S]*?if \(dir === 'left'\) \{ menus\._moveFocus\(boss, dir\); return true; \}/);
  for(const width of [320,480,720,1000]){
    const cards=Array.from({length:6},(_,i)=>({i})),graph=vm.runInNewContext('(function(cards){'+body+';return graph})(cards)',{cards,globalThis:{innerWidth:width}});
    const cols=width<=360?1:width<=900?2:3;
    for(let initial=0;initial<6;initial++){let i=initial;
      for(let step=0;step<12&&i!==0;step++){
        const dir=i-cols>=0?'up':'left',next=graph.get(cards[i])[dir];assert(next,'real graph must move at '+width+':'+i);i=cards.indexOf(next);
      }
      assert.equal(i,0,'real graph reaches Turf at '+width+' from '+initial);
    }
  }
});
test('hung native input, focus read, setup read or readiness cannot exceed the shared budget or trigger START',async()=>{
  for(const mode of ['key','focus','mouse','config','capability','click','phase']){
    const h=fakePage({}, {touch:true,hangKey:mode==='key',hangFocus:mode==='focus',hangMouse:mode==='mouse',hangConfig:mode==='config',hangCapability:mode==='capability',hangClick:mode==='click'});
    h.options.remainingMs=()=>20;if(mode==='phase')h.options.waitForPhase=()=>new Promise(()=>{});
    await assert.rejects(startProjectileThroughMenu(h.page,h.options),/deadline exceeded/);
    assert.equal(h.clicks.some(s=>s.includes('"start"')),false,mode);if(mode!=='config')assert.equal(h.keys.includes('Enter'),false,mode);
  }
});
test('timeout initiates page closure and never issues later Enter or claims START after delayed input',async()=>{
  for(const mode of ['key','start']){
    const h=fakePage({}, {touch:mode==='key',delayKey:mode==='key',delayStart:mode==='start'});h.options.remainingMs=()=>15;
    await assert.rejects(startProjectileThroughMenu(h.page,h.options),/deadline exceeded/);
    assert.equal(h.closeCalls,1);await new Promise(resolve=>setTimeout(resolve,90));
    assert.equal(h.events.filter(e=>e.event==='native-action-timeout'&&e.pageCloseRequested).length,1);
    assert(h.events.some(e=>e.event==='native-action-attempt'&&(mode==='key'?e.kind==='key':e.selector?.includes('\"start\"'))));
    if(mode==='key')assert.equal(h.keys.includes('Enter'),false);
    assert.equal(h.events.some(e=>e.event==='native-start-clicked'),false);
  }
});
test('turf pointer readiness rejects stale, inert, hidden and ambiguous controls before a normal click',async()=>{
  for(const touch of [false,true])for(const mode of ['stale','inert','low-parent-opacity','at-threshold','disabled','leaving','duplicate','detached','disconnected']){
    const h=fakePage({}, {touch});h.options.waitForPhase=async(fn,label)=>{
      if(label!=='native turf pointer readiness'){assert.equal(h.evaluate(fn),true);return;}
      if(mode==='stale')h.g.menus._scr.name='other';
      if(mode==='inert')h.root.inert=true;
      if(mode==='low-parent-opacity'){h.root.opacity='0.7';h.control.opacity='0.8';}
      if(mode==='at-threshold')h.control.opacity='0.6';
      if(mode==='disabled')h.control.disabled=true;
      if(mode==='leaving')h.control.closest=selector=>selector==='.is-leaving'?{}:null;
      if(mode==='duplicate')h.context.document.querySelectorAll=()=>[h.control,h.control];
      if(mode==='detached')h.root.contains=()=>false;
      if(mode==='disconnected')h.control.isConnected=false;
      assert.equal(h.evaluate(fn),false,mode);throw Error('not ready');
    };
    await assert.rejects(startProjectileThroughMenu(h.page,h.options),/not ready/);
    assert.deepEqual(h.clicks,['.iw-main [data-id="play"]'],mode);assert.deepEqual(h.taps,[],mode);
  }
});
test('wrong configuration fails before START rather than mutating game settings or retrying',async()=>{
  for(const touch of [false,true]){
    const h=fakePage({duration:90}, {touch});await assert.rejects(startProjectileThroughMenu(h.page,h.options),/configuration mismatch/);
    assert.equal(h.clicks.some(s=>s.includes('"start"')),false);
  }
});
test('failed readiness propagates without a hidden start or retry',async()=>{
  const h=fakePage();h.options.waitForPhase=async()=>{throw new Error('boot not ready');};
  await assert.rejects(startProjectileThroughMenu(h.page,h.options),/boot not ready/);assert.deepEqual(h.clicks,[]);
});
test('production START handler prepares synchronously, then wipes, then admits the same configuration',()=>{
  const source=fs.readFileSync(new URL('../../inkwave-public/src/ui/menus.js',import.meta.url),'utf8');
  for(const anchor of ["id: 'play'","id: 'mode-' + m.id","id: 'map-' + m.id","id: 'start', label: 'START!'",'el.dataset.id = opts.id'])assert.ok(source.includes(anchor),anchor);
  const lo=source.indexOf('  _startMatch() {'),hi=source.indexOf('\n  /**',lo);
  assert.ok(lo>0&&hi>lo);const Menu=vm.runInNewContext('class Menu{'+source.slice(lo,hi)+'};Menu',{safeCall:fn=>fn()});
  const calls=[],m=new Menu();let wipe;
  Object.assign(m,{_setup:{mode:'turf',mapId:'tidewater',difficulty:'normal',duration:180},_stageTime:()=> 'day',api:{prepareMatch:()=>calls.push('prepare'),setSettings:()=>{},startMatch:cfg=>calls.push(cfg)},_runWipe:fn=>{calls.push('wipe');wipe=fn;}});
  m._startMatch();assert.deepEqual(calls,['prepare','wipe']);wipe();assert.equal(calls[2].duration,180);assert.equal(calls[2].mapId,'tidewater');
});
test('harness keeps one admission budget and strict predicate, with retained failure evidence',()=>{
  const s=fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8');
  assert.ok(!s.includes('&autostart=180'));assert.equal((s.match(/const deadline = Date.now\(\) \+ NATIVE_BOOT_TIMEOUT_MS/g)||[]).length,1);
  assert.ok(s.includes('const NATIVE_BOOT_TIMEOUT_MS = 180000;'));
  for(const bit of ["G?.mode === 'match'","m === G.match","!m.attract && m.local?.isLocal && m.controller && g.debug","G.projectiles && G.renderer",'prior failure retained separately',"await snapshotAudio('native-startup-timeout')"])assert.ok(s.includes(bit),bit);
});
