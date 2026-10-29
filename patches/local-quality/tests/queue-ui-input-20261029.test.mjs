import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { adaptQueueUiInput20261029 } from '../queue-ui-input-20261029-adapter.mjs';
import { PlatformLifecycle, PlatformFrameDriver } from '../platform-lifecycle.mjs';
import { installInputPlatform } from '../platform-input.mjs';
import { installMenuQuality } from '../menu.mjs';
const read=p=>fs.readFileSync(new URL('../../../'+p,import.meta.url),'utf8');
const before=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-ui-input-20261029-before.json',import.meta.url))).methods;
function composed(rel){return adaptBuildSource(rel,read('inkwave-public/'+rel));}
const between=(s,a,b)=>{const start=s.indexOf(a),end=s.indexOf(b,start);assert(start>=0&&end>start,a);return s.slice(start,end);};
const method=(s,name,env={})=>vm.runInNewContext('({'+s+'}).'+name,env);
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const nop=()=>{};
function timing(){let now=0,id=0;const timers=new Map(),rafs=new Map(),clients=new Set();const owner={active:true,subscribe(c){clients.add(c);return()=>clients.delete(c);}};return {timers,rafs,clients,owner, env:{performance:{now:()=>now},setTimeout:(f,ms)=>{timers.set(++id,{f,ms});return id;},clearTimeout:i=>timers.delete(i),requestAnimationFrame:f=>{rafs.set(++id,f);return id;},cancelAnimationFrame:i=>rafs.delete(i),getPlatformLifecycle:()=>owner,safeCall:(f,...a)=>f(...a),clamp},at(t){now=t;},frame(t){now=t;for(const [i,f]of [...rafs]){rafs.delete(i);f(t);}},boundary(active,t){now=t;owner.active=active;for(const c of clients)c[active?'resume':'suspend']?.(owner);}};}
function news(source,clock){const C=vm.runInNewContext(source.replace('export class','class')+'\nWhatsNew',clock.env);return new C({timeScale:1});}
const afterNews=between(composed('src/ui/news.js'),'export class WhatsNew {','\n}')+'\n}';
test('actual news tween keeps normal 30/60/120 Hz frames and finishes low-Hz exits on elapsed time',()=>{
 for(const hz of [30,60,120,2,4,5,8])for(const scale of [0,.5,1,1.5]){
  const a=timing(),b=timing(),left=news(before.news,a),right=news(afterNews,b),al=[],bl=[];let ad=0,bd=0;
  left.M.timeScale=right.M.timeScale=scale;left._tween(.5,k=>al.push(k),()=>ad++);right._tween(.5,k=>bl.push(k),()=>bd++);
  for(let i=1;i<=hz*10;i++){a.frame(i*1000/hz);b.frame(i*1000/hz);}
  if(hz>=10)assert.deepEqual(bl,al,`${hz}/${scale}`);else assert(bl.length<=al.length);
  assert.equal(ad,bd);assert(bd<=1);if(scale)assert.equal(b.clients.size,0);
 }
 const c=timing(),n=news(afterNews,c);let done=0;n._tween(.5,nop,()=>done++);c.frame(250);c.boundary(false,300);c.frame(4000);assert.equal(done,0);c.boundary(true,8300);c.frame(8550);assert.equal(done,1);assert.equal(c.clients.size,0);
});
test('actual news exit cancels pending page replacement and releases clock on try/dispose',()=>{
 for(const how of ['later','back','skip','try']){
  const c=timing(),n=news(afterNews,c);let rendered=0,removed=0;
  n.el={_closing:false,classList:{add:nop},remove:()=>removed++};n.card={classList:{add:nop}};n.inkHost={lastElementChild:null};n.M._sfx=nop;n._tryBoss=nop;n.reduced=true;
  n._nextTimer=c.env.setTimeout(()=>rendered++,300);n._tween(.62,nop,nop);n.close(how);
  assert(!c.timers.has(n._nextTimer));for(const {f}of [...c.timers.values()])f();assert.equal(rendered,0);assert.equal(removed,1);
  if(how==='try'){assert.equal(c.rafs.size,0);assert.equal(c.clients.size,0);}
  n._cancelHeroWait=nop;n.dispose();assert.equal(c.clients.size,0);assert.equal(c.rafs.size,0);
 }
});
test('real lobby launch clears 7-second fallback for synchronous, asynchronous and timeout settlement',async()=>{
 const s=between(composed('src/ui/menus.js'),'  launchLobby() {','  /** Optional: menu accent inks');
 for(const mode of ['sync','async','timeout']){
  const c=timing();let fin;const owner={current:'lobby',_scr:{launch(f){fin=f;if(mode==='sync')f();}}};
  const launch=method(s,'launchLobby',c.env),p=launch.call(owner);assert.equal(launch.call(owner),p);
  if(mode==='async')fin();else if(mode==='timeout')[...c.timers.values()][0].f();await p;
  assert.equal(c.timers.size,0);assert.equal(owner._launchP,null);fin();
 }
});
test('real renderer settings preserve identical pipeline at density-only changes and retain shadow invalidation',()=>{
 const s=between(composed('src/core/renderer.js'),'  applySettings(settings) {','  // Dynamic resolution');
 const env={window:{innerWidth:800,innerHeight:600,devicePixelRatio:2},effectiveQuality:s=>s.q};
 const a=method(before.renderer,'applySettings',env),b=method(s,'applySettings',env);
 const q={pixelRatio:1.5,msaa:4,bloom:true,ao:true,shadowSize:4096,paintAtlas:4096,particles:1};
 function rig(prev,shadows=true){const count={build:0,traverse:0,material:0,ratio:0,compRatio:0};let pr=1;const material={set needsUpdate(v){if(v)count.material++;}};const owner={q:prev,mobile:{touch:false},dynScale:.75,_w:800,_h:600,_contextLost:false,renderer:{shadowMap:{enabled:shadows},setPixelRatio(v){pr=v;count.ratio++;}},composer:{setPixelRatio(v){count.compRatio++;owner.compPR=v;}},bloom:{enabled:true},scene:{traverse(f){count.traverse++;f({material});}},_fxaaTexel(w,h,v){owner.texel=[w,h,v];},_buildComposer(){count.build++;this.renderer.shadowMap.enabled=this.settings.shadows!==false;this.renderer.setPixelRatio(Math.min(2,this.q.pixelRatio));}};return {owner,count,get pr(){return pr;}};}
 for(const next of [{...q,pixelRatio:2},{...q,ao:false},{...q,msaa:0},{...q,newField:1}])for(const shadow of [true,false]){
  const old=rig(q),now=rig(q);a.call(old.owner,{q:next,shadows:shadow,bloom:true});b.call(now.owner,{q:next,shadows:shadow,bloom:true});
  const density=next.pixelRatio===2&&shadow;assert.equal(now.count.build,density?0:old.count.build);assert.equal(now.pr,old.pr);assert.equal(now.owner.dynScale,old.owner.dynScale);assert.equal(now.count.traverse,shadow?0:1);
  assert.equal(now.owner.renderer.shadowMap.enabled,old.owner.renderer.shadowMap.enabled);if(density){assert.equal(now.count.compRatio,1);assert.deepEqual(now.owner.texel,[800,600,2]);}
 }
 for(const exceptional of [{_contextLost:true},{_w:900},{composer:null}]){const r=rig(q);Object.assign(r.owner,exceptional);b.call(r.owner,{q:{...q,pixelRatio:2},shadows:true});assert.equal(r.count.build,1);}
});
function styled(){const values={},writes={};return {style:new Proxy(values,{set(o,k,v){writes[k]=(writes[k]||0)+1;o[k]=v;return true;},get(o,k){if(k==='setProperty')return(k,v)=>{writes[k]=(writes[k]||0)+1;o[k]=v;};if(k==='getPropertyValue')return k=>o[k]||'';return o[k];}}),writes,classList:{toggle:nop},get values(){return {...values};}};}
test('real minimap dots repaint stationary palette/team changes through both dirty gates',()=>{
 const s=between(composed('src/ui/hud.js'),'    // dots','    this._updBeacons(bw, bh, dt, u);');
 const make=source=>vm.runInNewContext('(function(m,L,M,bw,bh){'+source+'})',{clamp});
 const a=make(before.dots),b=make(s),dot=styled(),owner={mapDots:[dot],_myTeam:()=>0},L={ca:'#a',cb:'#b'},M={},m={players:[{x:.4,y:.3,team:0,isSelf:true,alive:true,yaw:0}]};
 b.call(owner,m,L,M,200,100);assert.equal(dot.style.getPropertyValue('--c'),'#a');L.ca='#new';b.call(owner,m,L,M,200,100);assert.equal(dot.style.getPropertyValue('--c'),'#new');owner._myTeam=()=>1;b.call(owner,m,L,M,200,100);assert.equal(dot.style.getPropertyValue('--c'),'#b');assert(dot.className.includes('is-enemy'));
 const oldDot=styled(),oldOwner={mapDots:[oldDot],_myTeam:()=>0},oldL={ca:'#a',cb:'#b'};a.call(oldOwner,m,oldL,{},200,100);oldL.ca='#new';a.call(oldOwner,m,oldL,{},200,100);assert.equal(oldDot.style.getPropertyValue('--c'),'#a','negative control reproduces stale color');
 const writes={...dot.writes};b.call(owner,m,L,M,200,100);assert.deepEqual(dot.writes,writes);
});
test('actual stationary superjump beacon updates weapon and kind without position change',()=>{
 const s=between(composed('src/ui/hud.js'),'    for (let i = 0; i < tg.length; i++) {\n      const el = this.beacons[i]','    // dashed jump arc');
 const make=source=>vm.runInNewContext('(function(tg,P,M,canJump){'+source+'})',{weaponIcon:k=>'icon:'+k,kindOf:k=>k,BUBBLER_ICON:'bubbler'});
 function rig(){const nodes={},e={...styled(),firstChild:styled(),querySelector:s=>nodes[s]||=(styled())};return {nodes,owner:{beacons:[e],_updLegendRow:nop}};}
 const t={x:.5,y:.5,ok:true,name:'ally',weapon:'shooter',kind:'ally'},P=[{x:20,y:20,ox:20,oy:20}],M={hover:-1},a=rig(),b=rig();
 for(const [fn,r]of [[make(before.beacons),a],[make(s),b]]){fn.call(r.owner,[t],P,M,true);fn.call(r.owner,[{...t,weapon:'roller'}],P,M,true);}
 assert.equal(a.nodes['.iw-bcn__icon'].innerHTML,'icon:shooter');assert.equal(b.nodes['.iw-bcn__icon'].innerHTML,'icon:roller');
});
test('actual jump arc updates size once independently from animated d and detects replacement SVG',()=>{
 const source=composed('src/ui/hud.js');const s=between(source,'    // dashed jump arc','\n  _updLegendRow(').replace(/\n  }\s*$/,'');const make=x=>vm.runInNewContext('(function(tg,M,canJump,bw,bh,L){'+x+'})',{});const fn=make(s);
 function svg(){const attrs={},writes={};return {firstChild:{setAttribute(k,v){attrs.d=v;writes.d=(writes.d||0)+1;}},getAttribute:k=>attrs[k],setAttribute(k,v){attrs[k]=v;writes[k]=(writes[k]||0)+1;},writes,attrs};}
 const n=svg(),owner={mapJumpLine:{firstChild:n,classList:{toggle:nop}}},L={},tg=[{ok:true,x:.4,y:.5}],M={hover:0,sx:.2,sy:.3};
 for(let i=0;i<120;i++){tg[0].x=.4+i*.001;fn.call(owner,tg,M,true,200,100,L);}assert.equal(n.writes.width,1);assert.equal(n.writes.height,1);assert(n.writes.d>1);
 fn.call(owner,tg,M,true,300,100,L);assert.equal(n.writes.width,2);assert.equal(n.writes.height,1);
});
test('actual ally markers preserve final CSS while avoiding unchanged distance property writes',()=>{
 const s=between(composed('src/ui/hud.js'),'  _updMarkers(ms) {','  _updPrompt(p) {');const env={clamp,toHex:x=>String(x),colorVars:nop,weaponIcon:x=>x,kindOf:x=>x};const a=method(before.markers,'_updMarkers',env),b=method(s,'_updMarkers',env);
 function rig(){const e=styled();Object.assign(e,{querySelector:()=>({}),lastChild:styled()});return {_L:{},markers:[e]};}const l=rig(),r=rig();
 for(let i=0;i<120;i++){const ms=[{x:i,y:10,dist:20,name:'A',color:1,weapon:'a',specialReady:false,onScreen:true}];a.call(l,ms);b.call(r,ms);assert.deepEqual(r.markers[0].values,l.markers[0].values);}
 assert.equal(l.markers[0].writes['--far'],120);assert.equal(r.markers[0].writes['--far'],1);
});

test('real platform deadline loop matches previous IEEE additions at terminal slots and exponent boundaries',()=>{
 const s=read('patches/local-quality/platform-lifecycle.mjs');const extract=x=>between(x,'  _scheduleNext(frameTime) {','  reset(reason) {');
 let logs=0;const math=Object.create(Math);math.log2=x=>{logs++;return Math.log2(x);};const a=method(extract(before.platform),'_scheduleNext',{Math:math}),b=method(extract(s),'_scheduleNext',{Math:math});
 for(const fps of [30,45,48,55,60,120,144])for(const now of [0,16,100,1000,65535,65536,65537,86400000,2**40])for(const lag of [0,1,5,5000]){
  const make=()=>({running:true,owner:{active:true},disposed:false,frameRate:()=>fps,_now:()=>now,nextDeadline:now-lag,frameInterval:1000/fps,_queueTimer(t){this.delay=t;}});
  const l=make(),r=make();logs=0;a.call(l,now);const oldLogs=logs;logs=0;b.call(r,now);assert.equal(r.nextDeadline,l.nextDeadline);assert.equal(r.delay,l.delay);assert(logs<=oldLogs);
 }
});
test('unfocused real platform input retires dirty pad authority and reuses the empty array until refocus',()=>{
 const env={document:{hidden:false,hasFocus:()=>false},performance:{now:()=>0}};class Input{pollPad(){throw Error('unfocused input polled');}padAxis(){}padStick(){}padValue(){}padButton(){}}
 installInputPlatform(Input,env);const i=new Input();Object.assign(i,{pad:{},padPrev:[true],padPressed:new Set([1]),padMenuPressed:new Set([2]),padMenuBlocked:new Set([2])});const prev=i.padPrev;
 for(let n=0;n<500;n++){i.padPressed.add(1);i.padMenuPressed.add(2);i.pollPad();assert.equal(i.padPrev,prev);assert.equal(i.padPrev.length,0);assert.equal(i.padPressed.size,0);assert.equal(i.padMenuPressed.size,0);assert.equal(i.pad,null);}
});
test('real composed Joy-Con selection retains priority, duplicate-side ambiguity and pair identity',()=>{
 const src=composed('src/core/input.js'),helpers=between(src,'const INKWAVE_JOYCON_BUTTON_COUNT','export class Input {');
 const next=between(src,'    let firstPad = null','    const previous = this._padIdentity;');
 const make=s=>vm.runInNewContext(helpers+'\n(function(pads){'+s+'return pad;})',{});const a=make(before.selection),b=make(next);
 const buttons=Array.from({length:17},()=>({pressed:false,value:0,touched:false}));
 const pad=(id,index,mapping='standard',connected=true)=>({id,index,mapping,connected,buttons,axes:[0,0]});
 const pool=[null,pad('Normal',0),pad('Normal',1,''),pad('Joy-Con (L) (Vendor: 057e Product: 2006)',2),pad('Joy-Con (R) (Vendor: 057e Product: 2007)',3),pad('Joy-Con (L) (Vendor: 057e Product: 2006)',4),pad('Normal',5,'standard',false)];
 let seed=1707;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 for(let n=0;n<12000;n++){const pads=Array.from({length:Math.floor(random()*8)},()=>pool[Math.floor(random()*pool.length)]);const l=a.call({},pads),r=b.call({},pads);assert.deepEqual(structuredClone(r),structuredClone(l));}
});

test('actual menu cursor plus quality owner emits final anchored geometry once and preserves viewport fallback',()=>{
 const afterCursor=between(composed('src/ui/menus.js'),'  _updateCursor(dt) {','  // ================================================================ modal');
 function rig(native,runtime){
  const node=(name)=>Object.assign(styled(),{name,children:[],parentElement:null,parentNode:null,isConnected:true,dataset:{},appendChild(c){c.parentNode=this;return c;},insertBefore(c){return this.appendChild(c);},classList:{add:nop,remove:nop,contains:()=>false},contains:()=>true,getBoundingClientRect(){return this.rect;},rect:{left:40,top:30,width:280,height:100,right:320,bottom:130},clientLeft:1,clientTop:1,scrollLeft:14,scrollTop:7,clientWidth:280,clientHeight:100,scrollWidth:280,scrollHeight:500});
  const ui=node('ui'),root=node('root'),host=node('host'),row=node('row'),ring=node('ring');root.parentElement=ui;host.parentElement=root;row.parentElement=host;row.rect={left:180,top:100,width:160,height:30,right:340,bottom:130};row.closest=s=>s==='.iw-rows, .iw-ss__list'?host:null;ui.appendChild(ring);
  const env={innerWidth:1024,innerHeight:768,performance:{now:()=>0},getComputedStyle:e=>({overflowY:e===host?'auto':'visible',position:'static',opacity:'1'}),getPlatformLifecycle:()=>({active:true,subscribe:()=>nop})};
  const install=runtime?vm.runInNewContext(runtime.replace(/^import .*;$/gm,'').replace('export function installMenuQuality','function installMenuQuality')+'\ninstallMenuQuality',env):installMenuQuality;
  function Menus(){}Menus.prototype._updateCursor=method(native,'_updateCursor',{menuLayoutSample:()=>({rect:e=>e.rect,opacity:()=>1})});Menus.prototype.update=nop;Menus.prototype.show=nop;Menus.prototype.dispose=nop;install(Menus,env);
  const spring=()=>({x:0,target:0,snap(n){this.x=n;},step(){this.x=this.target;}});const m=new Menus();Object.assign(m,{el:ui,cursorEl:ring,_focus:row,_input:'kbm',_scr:{el:root},_cur:{on:false,x:spring(),y:spring(),w:spring(),h:spring(),r:'4'}});
  return {m,host,row,ring,env,ui};
 }
 const a=rig(before.cursor,before.menuRuntime),b=rig(afterCursor,null);
 for(let i=0;i<120;i++){a.m._updateCursor(1/60);b.m._updateCursor(1/60);assert.deepEqual(b.ring.values,a.ring.values);}
 assert.equal(a.ring.writes.transform,240);assert.equal(b.ring.writes.transform,1);assert.equal(b.ring.writes.width,1);assert.equal(b.ring.writes.height,1);
 for(const r of [a,b]){r.host.scrollHeight=100;r.env.innerWidth=800;r.m._updateCursor(1/60);assert.equal(r.ring.parentNode,r.ui);}assert.deepEqual(b.ring.values,a.ring.values);
});

test('actual lobby countdown conserves low-Hz foreground elapsed time and rebases platform gaps',()=>{
 const source=composed('src/ui/menus.js');const start='        // countdown → GO → super-jumps → hand over';
 const next=between(source,start,'      destroy: () => {\n        plateVis');
 const trim=s=>s.slice(0,s.lastIndexOf('      },'));
 function run(s,hz){let wall=0,finish=0;const events=[];const owner={active:true,epoch:0};const env={performance:{now:()=>wall},getPlatformLifecycle:()=>owner,S:{launching:{t:0,step:-1,done:()=>finish++,fired:false,end:0,wall:0,epoch:0}},net:{state:'starting'},sc:{lobbyLaunch:()=>1.24},cdStep:n=>events.push(n),reduced:true,safeCall:f=>f(),el:{classList:{remove:nop}},countdown:{classList:{remove:nop}}};const fn=vm.runInNewContext('(function(dt){'+trim(s)+'})',env);const m={_frozen:()=>false,timeScale:1};for(let i=1;i<=hz*6;i++){wall=i*1000/hz;fn.call(m,Math.min(.1,1/hz));}return {events,finish,fn,env,m,owner,setWall:v=>wall=v};}
 for(const hz of [30,60,120]){const a=run(before.lobbyTick,hz),b=run(next,hz);assert.equal(b.finish,a.finish);assert.deepEqual(b.events.filter((v,i,x)=>i===0||v!==x[i-1]),a.events.filter((v,i,x)=>i===0||v!==x[i-1]));}
 const low=run(next,4);assert.equal(low.finish,1);assert.equal(run(before.lobbyTick,4).finish,0);
 const gap=run(next,60);const old=gap.env.S.launching.t;gap.owner.epoch++;gap.setWall(60000);gap.fn.call(gap.m,.1);assert.equal(gap.env.S.launching.t,old);
});
test('actual mobile map and pause tap keep pointer/cancel behavior with one haptic',()=>{
 const part=s=>between(s,'  _press(id, e) {','  _release(id) {');
 const env={CONTROLS:{map:{toggle:true},pause:{press:true},cameraReset:{press:true},fire:{}},setTimeout:f=>f()};
 const create=source=>{const o=vm.runInNewContext('new (class {'+part(source)+'})()',env);o.buzz=[];o._buzz=x=>o.buzz.push(x);o.els=Object.fromEntries(['map','pause','cameraReset','fire'].map(k=>[k,{classList:{add:nop,remove:nop}}]));o._ptr=new Map();o.pressed=new Set();o._pendingEdges=new Set();o._cancelled=new Set();o.buttons={};o.setMap=x=>o.mapOpen=x;o.onPause=()=>o.pauseCount=(o.pauseCount||0)+1;return o;};
 for(const id of ['map','pause','cameraReset','fire'])for(const type of ['pointerup','pointercancel'])for(const drift of [0,24,25]){
  const a=create(before.mobile),b=create(composed('src/core/mobile.js')),e={pointerId:1,clientX:30,clientY:50};a._press(id,e);b._press(id,e);
  if(id==='map'||id==='pause'){a._tapEnd(a._ptr.get(1),{...e,type,clientX:30+drift});b._tapEnd(b._ptr.get(1),{...e,type,clientX:30+drift});assert.equal(a.buzz.length,2);}else assert.equal(a.buzz.length,1);
  assert.equal(b.buzz.length,1);assert.deepEqual([...b.pressed],[...a.pressed]);assert.equal(b.mapOpen,a.mapOpen);assert.equal(b.pauseCount,a.pauseCount);assert.equal(JSON.stringify([...b._ptr]),JSON.stringify([...a._ptr]));
 }
});
test('actual diorama pin progress reaches exact endpoint independently of opacity and caches repeated progress',()=>{
 const part=s=>between(s,'    const a = smooth(0.3, 0.95, k);','    const me = G.match?.local;');
 const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};const make=s=>vm.runInNewContext('(function(k){'+part(s)+'})',{smooth});
 const a=make(before.diorama),b=make(composed('src/ui/diorama.js')),old={el:styled(),_last:{}},now={el:styled(),_last:{}};
 for(const k of [.3,.62,.7,.9,.95,.96,.98,1]){a.call(old,k);b.call(now,k);assert.equal(now.el.style.opacity,old.el.style.opacity);assert.equal(now.el.style.getPropertyValue('--pinK'),smooth(.62,1,k).toFixed(3));}
 assert.notEqual(old.el.style.getPropertyValue('--pinK'),'1.000');assert.equal(now.el.style.getPropertyValue('--pinK'),'1.000');const writes=now.el.writes['--pinK'];for(let i=0;i<100;i++)b.call(now,1);assert.equal(now.el.writes['--pinK'],writes);
 for(const k of [.99,.95,.7,.62,.3]){a.call(old,k);b.call(now,k);assert.equal(now.el.style.opacity,old.el.style.opacity);assert.equal(now.el.style.getPropertyValue('--pinK'),smooth(.62,1,k).toFixed(3));}
});
test('actual lobby nameplate preserves DOM and authored stamps while ready/host changes retain measured width',()=>{
 const part=s=>between(s,'        const sig = `${p.name}|${p.host}','        const pingQ =');
 const make=s=>vm.runInNewContext('(function(P,p,team){'+part(s)+'})',{bossMode:()=>false,Ws:{a:{id:'a'},b:{id:'b'}},weaponIcon:k=>'svg:'+k,colorVars:nop,tagTitle:n=>'title:'+n,tagArt:n=>'art:'+n,fnv:n=>n,restartAnim:(e,c)=>e.stamps.push(c),ca:'#a',cb:'#b'});
 function plate(){return {sig:'',bw:120,name:{textContent:''},title:{},art:{},el:{classList:{toggle:nop}},w:{stamps:[]},ready:{stamps:[]},crown:{stamps:[]}};}
 const a=make(before.menus),b=make(composed('src/ui/menus.js')),old=plate(),now=plate();let writes=0,html='';Object.defineProperty(now.w,'innerHTML',{get:()=>html,set:v=>{html=v;writes++;}});
 let p={name:'Player',host:false,ready:false,weapon:'a',you:false};a(old,p,0);b(now,p,0);old.bw=now.bw=120;
 for(const update of [{ready:true},{host:true},{ready:false},{host:false}]){p={...p,...update};a(old,p,0);b(now,p,0);assert.equal(old.bw,0);assert.equal(now.bw,120);assert.equal(now.w.innerHTML,old.w.innerHTML);assert.deepEqual(now.ready.stamps,old.ready.stamps);assert.deepEqual(now.crown.stamps,old.crown.stamps);}
 assert.equal(writes,1);for(const update of [{weapon:'b'},{name:'A much longer name'},{you:true}]){p={...p,...update};b(now,p,0);assert.equal(now.bw,0);now.bw=120;}assert.equal(writes,2);
});
test('actual range pad prompt fill output remains exact through clamping and target switches',()=>{
 const part=s=>between(s,'  padPrompt(pad, k) {','  damageNumber(');const env={L:x=>x,WEAPONS:{w:{name:'Weapon'}},PAD_TEXT:{jump:'Jump'}};
 const old=method(part(before.rangeHud),'padPrompt',env),now=method(part(read('patches/practice-range/runtime/hud.mjs')),'padPrompt',env);
 function owner(){const fill=styled();let reads=0;return{_L:{},promptFill:fill,prompt:{classList:{toggle:nop},firstChild:{},querySelector(){reads++;return fill;}},reads:()=>reads};}
 const a=owner(),b=owner();for(const p of [null,{id:1,kind:'weapon',weapon:'w'},{id:2,kind:'jump'},null])for(const k of [-1,0,.33333,1,2]){old.call(a,p,k);now.call(b,p,k);assert.equal(b.promptFill.style.transform,a.promptFill.style.transform);assert.equal(b.prompt.firstChild.textContent,a.prompt.firstChild.textContent);}assert.equal(a.reads(),10);assert.equal(b.reads(),0);
});
test('actual respawn navigation skips idle bubbler rebuild while consuming all selected digit targets',()=>{
 const s=between(composed('src/game/player.js'),'  updateRespawnNavigation() {','  updatePadMapSelection(standardPad) {');
 // The frozen parent composed code differs only by the reviewed early-return guard.
 const old=s.replace(/    if \(!inp.pressed.size \|\| !\(inp.wasPressed\('Digit5'\).*?return true;\n/,'');
 const cases=[[],['KeyA'],['Digit1'],['Digit4'],['Digit5'],['Digit9'],['Digit5','Digit7','Digit9']];
 function run(source,keys){let scans=0;const requests=[];const bubblers=Array.from({length:5},(_,i)=>({id:i}));const actor={alive:false,team:0,intent:{move:{set:nop}}};const G={actors:[actor,{team:0,id:'ally'}],bigBubblerJumpTargets:()=>{scans++;return bubblers;},level:{}};const inp={lastDevice:'kbm',pressed:new Set(keys),padPressed:new Set(),wasPressed(k){return this.pressed.has(k);}};const o={a:actor,input:inp,navigationEnabled:true,menuBlocked:false,padLook:{},assist:{},respawnMapOpen:()=>true,captureMapGyro:nop,updatePadMapSelection:nop,requestMapJump:t=>requests.push(t?.id),requestMapBubblerJump:t=>requests.push(t.id)};const result=method(source,'updateRespawnNavigation',{G}).call(o);return{scans,requests,pressed:[...inp.pressed],result,intent:actor.intent};}
 for(const keys of cases){const a=run(old,keys),b=run(s,keys);assert.equal(b.scans,keys.some(k=>/^Digit[5-9]$/.test(k))?1:0);assert.equal(a.scans,1);assert.deepEqual(b.requests,a.requests);assert.deepEqual(b.pressed,a.pressed);assert.equal(b.result,a.result);}
});
test('actual accent writers refresh cached lobby signature for external and accessibility palettes',()=>{
 const s=composed('src/ui/menus.js');let reads=0;const style={values:{},getPropertyValue(k){reads++;return this.values[k]||'';}};const env={colorVars:(el,k,v)=>el.style.values['--'+k]=v,toHex:x=>x,TEAM_PALETTES:[{a:'#a',b:'#b'}],COLORBLIND_PALETTE:{a:'#c',b:'#d'}};
 const o={el:{style},_settings:()=>({colorblind:false})};o._accent=method(between(s,'  _accent() {','  /** Team names'),'_accent',env);o._applyAccent=method(between(s,'  _applyAccent() {','  _accent() {'),'_applyAccent',env);o.setAccent=method(between(s,'  setAccent(a, b) {','  /** The engine changed a setting'),'setAccent',env);
 const fragment=between(s,'{ const acc = (this._queueAccentSignature',' if (acc !== S.acc)');const tick=vm.runInNewContext('(function(){'+fragment+' return acc; }})',{bossMode:()=>false});
 o._applyAccent();assert.equal(tick.call(o),'#a,#b');const initial=reads;for(let i=0;i<500;i++)assert.equal(tick.call(o),'#a,#b');assert.equal(reads,initial);o._settings=()=>({colorblind:true});o._applyAccent();assert.equal(tick.call(o),'#c,#d');o.setAccent('#x','#y');assert.equal(tick.call(o),'#x,#y');o._applyAccent();assert.equal(tick.call(o),'#x,#y');
});
