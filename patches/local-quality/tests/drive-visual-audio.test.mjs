import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptDriveVisualAudio} from '../drive-visual-audio-adapter.mjs';
import {mulberry32} from '../../splatoon3/runtime/audio/reverb-impulse.mjs';
import {nonWailVfxTicks} from '../../splatoon3/runtime/nonwail-vfx-clock.mjs';
import * as T from '../../../inkwave-public/vendor/three/build/three.module.js';
const old=JSON.parse(fs.readFileSync(new URL('./fixtures/drive-visual-before-7f863ea2.json',import.meta.url),'utf8'));
const cache=new Map();
function source(file){if(!cache.has(file))cache.set(file,adaptDriveVisualAudio(file,adaptBuildSource(file,fs.readFileSync(new URL('../../../inkwave-public/'+file,import.meta.url),'utf8'))));return cache.get(file);}
function member(file,cls,key,kind='method'){
 const code=source(file),nodes=parse(code,{ecmaVersion:'latest',sourceType:'module'}).body.flatMap(n=>n.declaration?[n.declaration]:[n]);
 const node=nodes.find(n=>n.type==='ClassDeclaration'&&n.id.name===cls)?.body.body.find(n=>n.key.name===key&&n.kind===kind);
 assert.ok(node,`${cls}.${key}`);return code.slice(node.start,node.end);
}
const compile=(text,key,bindings={})=>new Function(...Object.keys(bindings),'return ({'+text+'})['+JSON.stringify(key)+']')(...Object.values(bindings));
const method=(file,cls,key,bindings={})=>compile(member(file,cls,key),key,bindings);
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const hash=pcm=>crypto.createHash('sha256').update(Buffer.from(pcm.buffer)).digest('hex');
const seeded=()=>{let n=23;return()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);};
test('all sixteen composed native modules remain parseable and the adapter composes idempotently',()=>{
 for(const file of ['src/audio/audio.js','src/audio/music.js','src/core/mobile.js','src/core/input.js','src/core/gyro.js','src/main.js','src/ui/menus.js','src/ui/menu-art.js','src/ui/hud.js','src/ui/hud-boss.js','src/ui/diorama.js','src/game/showcase.js','src/game/lobbySet.js','src/game/lobbySet-geo.js','src/game/player.js','src/fx/fx.js']){
  const code=source(file);parse(code,{ecmaVersion:'latest',sourceType:'module'});assert.equal(adaptDriveVisualAudio(file,code),code);
 }
});
test('radial stick early exit preserves exact output across neutral, boundary and non-finite inputs',()=>{
 const a=compile(old['Input.padStick'],'padStick'),b=method('src/core/input.js','Input','padStick');
 const values=[0,-0,NaN,Infinity,-Infinity,.11,.12,.14,-.14,.7,-1,1e-30,1e30],random=seeded();let compared=0;
 for(let i=0;i<4000;i++){
  const x=i<values.length*values.length?values[i%values.length]:(random()-.5)*2,y=i<values.length*values.length?values[Math.floor(i/values.length)]:(random()-.5)*2;
  for(const dz of [0,.11,.12,.14,1,-.1]){const self={pad:{axes:[x,y]}};assert.deepEqual(b.call(self,0,1,{},dz),a.call(self,0,1,{},dz));compared++;}
 }
 assert.equal(compared,24000);
 let calls=0;const math=Object.create(Math);math.hypot=(...v)=>{calls++;return Math.hypot(...v);};
 const optimized=method('src/core/input.js','Input','padStick',{Math:math});
 for(let i=0;i<1000;i++)optimized.call({pad:{axes:[.001,-.001]}},0,1,{});assert.equal(calls,0);
});
test('in-place circular noise filtering preserves all white/pink/brown PCM bytes',()=>{
 const nodes=parse(source('src/audio/music.js'),{ecmaVersion:'latest',sourceType:'module'}).body.flatMap(n=>n.declaration?[n.declaration]:[n]);
 const n=nodes.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='noiseBuffer');
 const make=code=>new Function('cache','mulberry32','return ('+code+')')((()=>{const m=new WeakMap();return c=>{if(!m.has(c))m.set(c,new Map());return m.get(c);};})(),mulberry32);
 const a=make(old['function.noiseBuffer']),b=make(source('src/audio/music.js').slice(n.start,n.end));
 for(const sampleRate of [8000,44100,48000])for(const kind of ['white','pink','brown']){
  const ctx={sampleRate,createBuffer(_channels,length){const pcm=new Float32Array(length);return{getChannelData:()=>pcm};}};
  assert.equal(hash(b(ctx,kind).getChannelData(0)),hash(a(ctx,kind).getChannelData(0)),`${kind}@${sampleRate}`);
 }
});
test('super-jump angle reuse preserves every particle argument and RNG draw',()=>{
 for(const dt of [1/30,1/60,1/120,.1])for(const k of [0,.5,1]){
  function run(before){let randoms=0,trig=0;const random=seeded(),rows=[],math=Object.create(Math);
   for(const key of ['sin','cos'])math[key]=v=>{trig++;return Math[key](v);};
   const bind={Math:math,rand:()=>{randoms++;return random();},TAU:2*Math.PI,_white:new T.Color(1,1,1),_v2:new T.Vector3(),UP:new T.Vector3(0,1,0),G_STAR:1,G_SOFT:3,R_THIN:4,F_QUIET:8};
   const fn=before?compile(old['FX.superJumpCharge'],'superJumpCharge',bind):method('src/fx/fx.js','FX','superJumpCharge',bind);
   const capture=(...args)=>rows.push(args.map(v=>v?.isColor||v?.isVector3?v.toArray():v===self.glows?'glows':v));
   const self={q:1,_dt:dt,_time:2,_col:new T.Color(),_colB:new T.Color(),_color:(c,out)=>out.copy(c),glows:{},_sprite:capture,_spawnDrop:capture,_ringRaw:capture};
   fn.call(self,new T.Vector3(1,2,3),new T.Color(.2,.4,.6),k);return{rows,randoms,trig};
  }
  const a=run(true),b=run(false);assert.deepEqual(b.rows,a.rows);assert.equal(b.randoms,a.randoms);assert.ok(b.trig<=a.trig);
 }
});
test('Sparkles and InkTrail forward spans preserve matrix uploads through expiration and idle',()=>{
 for(const cls of ['Sparkles','InkTrail'])for(const hz of [30,60,120]){
  const bind=()=>({_m4:new T.Matrix4(),ZERO_M:new T.Matrix4().makeScale(0,0,0),_q:new T.Quaternion(),_v:new T.Vector3(),_s:new T.Vector3(),UPV:new T.Vector3(0,1,0),eOut3:t=>1-(1-clamp(t))**3,eInOut:t=>{t=clamp(t);return t*t*t*(t*(t*6-15)+10);}});
  const a=compile(old[cls+'.update'],'update',bind()),b=method('src/game/showcase.js',cls,'update',bind());
  function state(){const rows=[],mesh={count:0,instanceMatrix:{needsUpdate:false},setMatrixAt(i,m){rows.push([i,...m.elements]);}};return{rows,N:8,_iwFxIdle:false,mesh,P:Float32Array.from({length:24},(_,i)=>i/7),A:Float32Array.from([0,1,0,.2,0,9,0,0]),L:Float32Array.from([.1,.5,.3,.4,.7,1,.8,1.2]),S:new Float32Array(8).fill(.4),Y:new Float32Array(8).fill(.7),W:new Float32Array(8).fill(.3),Ln:new Float32Array(8).fill(.2)};}
  const x=state(),y=state();for(let i=0;i<hz*2;i++){a.call(x,1/hz);b.call(y,1/hz);assert.equal(y.mesh.count,x.mesh.count);assert.deepEqual(y.rows,x.rows);assert.deepEqual(y.A,x.A);x.rows.length=y.rows.length=0;}
  assert.equal(y._iwFxIdle,true);
 }
});
test('jumpout retains the native per-render random trial instead of an unaccepted cadence normalization',()=>{
 const raw=fs.readFileSync(new URL('../../../inkwave-public/src/game/showcase.js',import.meta.url),'utf8'),code=source('src/game/showcase.js');
 const statement=text=>{const line=text.split('\n').find(x=>x.includes('if (this.rand() < 0.8) fx.drop('));assert.ok(line);return line.trim();};
 assert.equal(statement(code),statement(raw));
 const execute=text=>new Function('P','y','fx',statement(text));
 for(const hz of [30,60,120]){const traces=[];for(const text of [raw,code]){const rows=[],self={rand:seeded()};for(let i=0;i<hz;i++)execute(text).call(self,{x:1,y:2,z:3},4,{drop:(...a)=>rows.push(a)});traces.push(rows);}assert.deepEqual(traces[1],traces[0]);}
});
test('host role rebinding installs one listener set and dispatches only current callbacks',()=>{
 const bind=method('src/ui/menus.js','Menus','_bind',{performance:{now:()=>1}}),listeners=new Map();
 const el={dataset:{},tagName:'BUTTON',addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);}};
 const calls=[],self={_binds:new WeakMap(),_setFocus(){}};
 for(let i=0;i<25;i++)bind.call(self,el,{id:'mode',accept:()=>calls.push(i)});
 assert.deepEqual([...listeners.values()].map(v=>v.length),[1,1,1,1]);listeners.get('click')[0]({target:{closest:()=>null}});assert.deepEqual(calls,[24]);
 bind.call(self,el,{click:false,accept:()=>calls.push('wrong')});listeners.get('click')[0]({target:{closest:()=>null}});assert.deepEqual(calls,[24]);
 self._binds.delete(el);listeners.get('click')[0]({target:{closest:()=>null}});assert.deepEqual(calls,[24]);
});
test('spatial wrapping reuses the same query rectangles and still chooses the original focus',()=>{
 const before=compile(old['Menus._spatial'],'_spatial'),after=method('src/ui/menus.js','Menus','_spatial');
 for(const wrap of [false,true])for(const dir of ['up','down','left','right'])for(let selected=0;selected<9;selected++){
  let reads=0;const nodes=Array.from({length:9},(_,i)=>({id:i,getBoundingClientRect(){reads++;const left=(i%3)*50,top=Math.floor(i/3)*30;return{left,top,width:40,height:20,right:left+40,bottom:top+20};}}));
  const self={_candidates:()=>nodes,_scr:{wrap}},expected=before.call(self,nodes[selected],dir),oldReads=reads;reads=0;
  assert.equal(after.call(self,nodes[selected],dir),expected);assert.ok(reads<=oldReads);assert.equal(reads,9);
 }
});
function element(){const classes=new Map(),properties=new Map(),writes=[];return{writes,style:{setProperty(k,v){writes.push([k,v]);properties.set(k,v);},getPropertyValue:k=>properties.get(k)||''},classList:{toggle(k,v){writes.push([k,v]);classes.set(k,v);}},get classes(){return classes;},querySelector(){return this.icon||(this.icon={innerHTML:''});}};}
test('hidden mobile HUD stores the latest state, preserves ready haptics and flushes before activation',()=>{
 const bind={clamp,WEAPON_ICONS:{shooter:'shot',roller:'roll'},specialIcon:id=>'icon:'+id};
 const setHud=method('src/core/mobile.js','MobileInput','setHud',bind),sync=method('src/core/mobile.js','MobileInput','_syncVisible');
 const special=element(),segments=Array.from({length:23},element);special.querySelectorAll=()=>segments;
 const self={els:{special,fire:element(),sub:element()},visible:true,owner:{lastDevice:'mouse'},root:element(),resetPointers(){},buzz:[],_buzz(n){this.buzz.push(n);},setHud};
 setHud.call(self,{special:.1,ink:.8,weapon:'shooter',ready:false});setHud.call(self,{special:1,ink:.3,weapon:'roller',ready:true,specialId:'crabTank'});
 assert.equal(special.writes.length,0);assert.equal(self.els.fire.writes.length,0);assert.deepEqual(self.buzz,[18]);
 self.owner.lastDevice='touch';sync.call(self);assert.equal(self.root.classes.get('is-active'),true);assert.equal(self.els.fire.icon.innerHTML,'roll');assert.equal(self.els.fire.style.getPropertyValue('--ink'),'0.30');assert.ok(segments.every(e=>e.classes.get('is-filled')));assert.deepEqual(self.buzz,[18]);
 const count=special.writes.length;setHud.call(self,self._pendingHud);assert.equal(special.writes.length,count);
});
test('mobile hit testing reads layout visibility only for geometric candidates and handles newly hidden controls',()=>{
 const hit=method('src/core/mobile.js','MobileInput','_hitButton',{ORDER:['stick','a','b','c']});let reads=0,showB=true;
 const self={els:Object.fromEntries(['a','b','c'].map(id=>[id,{get offsetParent(){reads++;return id==='b'&&!showB?null:{};}}])),_hitBoxes:{a:{x:0,y:0,d:20},b:{x:100,y:100,d:20},c:{x:200,y:200,d:20}}};
 assert.equal(hit.call(self,100,100),'b');assert.equal(reads,1);showB=false;assert.equal(hit.call(self,100,100),null);assert.equal(reads,2);assert.equal(hit.call(self,900,900),null);assert.equal(reads,2);
});
test('selected mobile control layout matches full layout and invalidates on viewport or safe-area change',()=>{
 const env={innerWidth:800,innerHeight:600,layoutUnit:()=>400,ORDER:['stick','fire','sub']};
 const all=method('src/core/mobile.js','MobileInput','_layoutAll',env),one=method('src/core/mobile.js','MobileInput','_layoutOne',env),control=method('src/core/mobile.js','MobileInput','_layoutControl',env);
 const safe={l:8,r:8,t:6,b:6},boxes={stick:{x:50,y:500,d:80},fire:{x:700,y:500,d:60},sub:{x:600,y:450,d:50}};let measured=[];
 const self={root:{},els:Object.fromEntries(env.ORDER.map(id=>[id,{style:{}}])),_stick:{active:false},_safe:()=>({...safe}),_box(id){measured.push(id);return{...boxes[id]};},_drawStick(){},_layoutControl:control,_layoutAll:all};
 all.call(self);measured=[];boxes.fire.x=650;one.call(self,'fire');assert.deepEqual(measured,['fire']);assert.equal(self._hitBoxes.fire.x,650);
 const snapshot=JSON.stringify(self.els);all.call(self);assert.equal(JSON.stringify(self.els),snapshot);
 safe.l=20;measured=[];one.call(self,'fire');assert.deepEqual(measured,env.ORDER);
});
test('settings unrelated to scale and stick mode avoid touch relayout',()=>{
 const apply=method('src/core/mobile.js','MobileInput','applySettings',{clamp,touchSensMul:v=>2**v});let layouts=0;
 const self={s:{touchScale:1,stickMode:'floating'},root:element(),gyro:{configure(){},discard(){},resync(){}},_layoutAll(){layouts++;}};
 apply.call(self,{touchSens:0});for(const v of [1,2,3])apply.call(self,{touchSens:v,music:.2,aimProfile:'same'});assert.equal(layouts,1);
 apply.call(self,{touchScale:1.2});assert.equal(layouts,2);apply.call(self,{stickMode:'fixed'});assert.equal(layouts,3);apply.call(self,{touchOpacity:.5});assert.equal(layouts,3);
});
function eventSurface(){const listeners=new Map();return{listeners,addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener(type,fn){listeners.get(type)?.delete(fn);},emit(type,extra={}){for(const fn of [...(listeners.get(type)||[])])fn({type,...extra});},count(){return[...listeners.values()].reduce((s,v)=>s+v.size,0);}};}
test('recorded music rearms only on a recovery event after bounded retries and cleans all event owners',()=>{
 const window=eventSurface(),document={...eventSurface(),hidden:false},timers=[],plays=[],binding={window,globalThis:{document},FILE_TRACK_URLS:{battle:'recording.mp3'},setTimeout(fn,delay){timers.push({fn,delay});return timers.length;},clearTimeout(){},console:{warn(){}}};
 const self={offline:false,_desiredTrack:'battle',_fileFailures:new Set(),_fileRetryCount:0,_fileRetryTimer:null,ctx:{state:'running',resume(){plays.push('resume');return Promise.resolve();}},play(track,opts){plays.push([track,opts]);}};
 for(const key of ['_clearFileRecovery','_armFileRecovery','_cancelFileRetry','_retryFile'])self[key]=method('src/audio/music.js','MusicEngine',key,binding);
 const network={code:2};self._retryFile('battle',network);assert.equal(timers[0].delay,750);timers[0].fn();self._retryFile('battle',network);assert.equal(timers[1].delay,1600);timers[1].fn();self._retryFile('battle',network);
 assert.equal(timers.length,2);assert.equal(window.count()+document.count(),5);plays.length=0;
 document.hidden=true;document.emit('visibilitychange');assert.equal(plays.length,0);window.emit('online');assert.equal(plays.length,2);assert.equal(plays[1][0],'battle');assert.equal(window.count()+document.count(),0);window.emit('online');assert.equal(plays.length,2);
 self._fileRetryCount=2;self._retryFile('battle',{name:'NotAllowedError'});plays.length=0;window.emit('online');window.emit('pointerdown',{isTrusted:false});assert.equal(plays.length,0);window.emit('pointerdown',{isTrusted:true});assert.equal(plays.length,2);
 for(const code of [3,4]){self._fileRetryCount=2;self._retryFile('battle',{code});assert.equal(window.count()+document.count(),0);}
 self._fileRetryCount=2;self._retryFile('battle',network);self._cancelFileRetry();assert.equal(window.count()+document.count(),0);
});
test('game-owned ambience and movement loops recover into a free slot without full-budget churn or muted duplication',()=>{
 const audio={ctx:{state:'running'},loops:new Set(),_sfxSilent:()=>false,created:0,loop(name,opts){this.created++;const h={name,playing:true,_sfxDeferred:false,options:{...opts},set(p){Object.assign(this.options,p);},stop(){h.playing=false;audio.loops.delete(h);}};this.loops.add(h);return h;}};
 audio.canRearmLoop=method('src/audio/audio.js','AudioEngine','canRearmLoop',{MAX_LOOPS:24});
 const damp=(a,b,k,dt)=>a+(b-a)*(1-Math.exp(-k*dt)),binding={G:{audio},damp};
 for(const name of ['_updateAmbience','_updateLocalLoops']){
  audio.loops.clear();audio.created=0;const update=method('src/main.js','Game',name,binding);
  const self={_audioOn:true,showcase:{fullFrame:true},match:{local:{alive:true,anim:{form:'swim'},vel:{x:2,y:0,z:0},grounded:false}}};
  update.call(self,1/60);assert.equal(audio.created,1);const initial=name==='_updateAmbience'?self._amb:self._loops.swim;initial.stop();
  for(let i=0;i<24;i++)audio.loops.add({playing:true});for(let i=0;i<100;i++)update.call(self,1/60);assert.equal(audio.created,1);
  audio.loops.delete(audio.loops.values().next().value);update.call(self,1/60);assert.equal(audio.created,2);const replacement=name==='_updateAmbience'?self._amb:self._loops.swim;assert.notEqual(replacement,initial);assert.equal(replacement.playing,true);assert.equal(audio.loops.size,24);
  for(let i=0;i<100;i++)update.call(self,1/60);assert.equal(audio.created,2);
  replacement.playing=false;replacement._sfxDeferred=true;audio.loops.clear();for(let i=0;i<20;i++)update.call(self,1/60);assert.equal(audio.created,2);
 }
});
// Captured from the reviewed PRE-aggregate composer, not raw upstream HUD or
// the candidate adapter. The hash pins the exact accepted world/judge/reentry fixes.
const schedulingBytes=fs.readFileSync(new URL('./fixtures/reviewed-native-scheduling-e3a8c3b.json',import.meta.url));
const scheduling=JSON.parse(schedulingBytes);
// The independently pinned pre-aggregate source stays immutable. Reconstruct
// the exact newer pause-aware RAF contract rather than silently weakening the
// byte comparison or using the changed code itself as its own oracle.
const hudNow={...scheduling.hud,
 _fxLoop:scheduling.hud._fxLoop
 .replace('_fxLoop(t) {','_fxLoop(t) {\n    this._rafId = 0;')
 .replace('    if (this.paused) { this._rafId = this._fxMap.size ? requestAnimationFrame(this._fxLoop) : 0; return; }',
          '    if (this.paused) { this._rafId = 0; return; }')
 .replace('    this._rafId = this._fxMap.size ? requestAnimationFrame(this._fxLoop) : 0;',
          '    if (this._fxMap.size && !this.paused && !this._worldPaused) { if (!this._rafId) this._rafId = requestAnimationFrame(this._fxLoop); }\n    else { cancelAnimationFrame(this._rafId); this._rafId = 0; }'),
 _addFx:scheduling.hud._addFx.replace('if (!this._rafId && !this._worldPaused) {','if (!this._rafId && !this._worldPaused && !this.paused) {')};
assert.notEqual(hudNow._fxLoop,scheduling.hud._fxLoop,'later pause optimization is actually represented');
assert.notEqual(hudNow._addFx,scheduling.hud._addFx,'paused scheduling guard is actually represented');
test('HUD preserves the reviewed pre-aggregate RAF methods byte-for-byte',()=>{
 assert.equal(crypto.createHash('sha256').update(schedulingBytes).digest('hex'),'a177a9c1435cddbba40e32ab303736151040f5b3db629adcfe07e786ddd3b177');
 assert.equal(scheduling.provenance.publicRef,'e3a8c3b');
 for(const key of ['_fxLoop','_addFx'])assert.equal(member('src/ui/hud.js','HUD',key),hudNow[key],key);
});
test('reviewed HUD scheduling retains world pause, paused RAF, judge cancellation and same-name reentry behavior',()=>{
 function run(texts){
  let now=1000,id=0;const requests=[],errors=[],events=[],snapshots=[];
  const binding={performance:{now:()=>now},requestAnimationFrame(fn){requests.push(fn);return ++id;},cancelAnimationFrame(){},console:{error(...args){errors.push(args[0]);}}};
  const self={_fxMap:new Map(),_rafId:0,_lastFx:0,_fxTime:0,timeScale:.5,paused:false,_worldPaused:false};
  for(const key of ['_fxLoop','_addFx'])self[key]=compile(texts[key],key,binding).bind(self);
  const record=()=>snapshots.push({requests:requests.length,raf:self._rafId,last:self._lastFx,time:self._fxTime,keys:[...self._fxMap.keys()],events:[...events]});
  self._worldPaused=true;self._addFx('waiting',()=>{events.push('waiting');return false;});record();
  self._fxLoop(1100);record(); // must not advance clocks or request a frame
  self._worldPaused=false;now=1200;self._addFx('waiting',()=>{events.push('waiting');return false;});record();
  self.paused=true;self._fxLoop(1300);record(); // no new RAF is scheduled while paused
  self.paused=false;self._fxLoop(1400);record();
  self.paused=true;self._fxLoop(1500);record(); // no tasks: no paused idle loop
  self.paused=false;self._judgeOwner={current:()=>false,cancel(){events.push('judge-cancel');self._judgeOwner=null;}};
  now=1600;self._addFx('replace',()=>{events.push('original');self._addFx('replace',()=>{events.push('replacement');return false;});return false;});
  self._fxLoop(1700);record(); // stale callback may not delete its replacement
  self._fxLoop(1800);record();
  now=1900;self._addFx('throws',()=>{throw Error('expected fixture failure');});self._fxLoop(2000);record();
  assert.ok(requests.every(fn=>fn===self._fxLoop));assert.deepEqual(errors,['[hud]']);
  return snapshots;
 }
 const actual=run(Object.fromEntries(['_fxLoop','_addFx'].map(k=>[k,member('src/ui/hud.js','HUD',k)])));
 assert.deepEqual(actual,run(hudNow));
 assert.equal(actual[3].requests,actual[2].requests,'paused HUD cannot schedule an idle RAF');
 assert.equal(actual[3].raf,0,'paused owner retires its frame slot');
 assert.ok(actual[8].requests<=5,'no extra background frame churn');
 assert.deepEqual(actual[0],{requests:0,raf:0,last:0,time:0,keys:['waiting'],events:[]});
 assert.deepEqual(actual[1],actual[0]);assert.equal(actual[3].time,0);
 assert.deepEqual(actual[4].events,['waiting']);assert.equal(actual[4].time,.05);
 assert.equal(actual[5].raf,0);assert.deepEqual(actual[6].keys,['replace']);
 assert.deepEqual(actual[6].events,['waiting','judge-cancel','original']);
 assert.deepEqual(actual[7].events,['waiting','judge-cancel','original','replacement']);assert.deepEqual(actual[7].keys,[]);
 assert.deepEqual(actual[8].keys,[]);assert.equal(actual[8].raf,0);
});
test('stable ally markers preserve rounded thresholds, fallback metadata and hide/show behavior',()=>{
 const bind={clamp,weaponIcon:v=>'icon:'+v,kindOf:v=>v,toHex:(v,d)=>v||d,colorVars:(el,k,v)=>el.style.setProperty(k,v),G:{match:{}}};
 const a=compile(old['HUD._updMarkers'],'_updMarkers',bind),b=method('src/ui/hud.js','HUD','_updMarkers',bind);
 function state(){const el=element();el.lastChild={style:{}};const children={};el.querySelector=s=>children[s]||(children[s]={});return{_L:{},markers:[el],_actors:()=>[{name:'A',weaponId:'shooter',specialReady:()=>false}]};}
 const x=state(),y=state(),rows=[{x:10.1,y:20.1,onScreen:true,name:'A',color:'#fff',dist:16,weapon:'shooter',specialReady:false},{x:10.1,y:20.1,onScreen:true,name:'A',color:'#fff',dist:16,weapon:'shooter',specialReady:false},{x:10.12,y:20.12,onScreen:true,name:'A',color:'#fff',dist:16.01,weapon:'shooter',specialReady:false},null,{x:10.12,y:20.12,onScreen:true,name:'A',color:'#fff',dist:16.01,weapon:'shooter',specialReady:false},{x:-0,y:NaN,onScreen:false,angle:.02,name:'A',color:'#ddd',dist:40}];
 for(const row of rows){a.call(x,row?[row]:[]);b.call(y,row?[row]:[]);assert.deepEqual(y._L,x._L);assert.deepEqual(y.markers[0].writes,x.markers[0].writes);assert.equal(y.markers[0].style.transform,x.markers[0].style.transform);assert.equal(y.markers[0].lastChild.style.transform,x.markers[0].lastChild.style.transform);}
 y._L={};b.call(y,[rows[0]]);assert.ok(y._L.mk0);
});
test('bounded HUD ally selection retains exactly the first three allies plus independent base and Bubbler targets',()=>{
 const me={team:0},actors=[me,{team:1},{team:0,name:'a',weaponId:'w',pos:{x:1,z:2},alive:true},{team:0,name:'b',weaponId:'w',pos:{x:3,z:4},alive:false},{team:0,name:'c',weaponId:'w',pos:{x:5,z:6},alive:true}];
 actors.push({get team(){throw Error('fourth ally must not be inspected');}});
 const G={actors,level:{spawnPads:[{x:10,z:20}]},game:{minimap:{w:100,h:100,toCanvas(x,z,out){out.x=x;out.y=z;}}},bigBubblerJumpTargets:()=>[{id:'bubble',serial:1,team:0,pos:{x:7,y:0,z:8}}]};
 const fn=method('src/ui/hud.js','HUD','_beaconTargets',{G,tr:x=>x,hasCommittedSuperJumpDestination:()=>false});const self={_local:()=>me};
 const out=fn.call(self);assert.deepEqual(out.slice(0,3).map(x=>x.name),['a','b','c']);assert.equal(out[1].dead,true);assert.equal(out[3].home,true);assert.equal(out[4].kind,'bubbler');
});
test('SetBuilder consumes only merged scratch geometries and preserves singleton and non-consuming ownership',()=>{
 const build=method('src/game/lobbySet-geo.js','SetBuilder','build',{mergeGeometries:list=>({combined:list.map(x=>x.id)})});let disposed=[];const g=id=>({id,dispose(){disposed.push(id);}});
 const a=g('a'),b=g('b'),c=g('c'),self={buckets:new Map([['merged',[a,b]],['single',[c]]])};
 const retained=build.call(self);assert.deepEqual(retained.merged.combined,['a','b']);assert.equal(self.buckets.size,2);assert.deepEqual(disposed,[]);
 const consumed=build.call(self,{consume:true});assert.deepEqual(consumed.merged.combined,['a','b']);assert.equal(consumed.single,c);assert.equal(self.buckets.size,0);assert.deepEqual(disposed,['a','b']);
});

test('paused _addFx records the task without requesting RAF until unpaused',()=>{let requests=0;const self={paused:true,_worldPaused:false,_rafId:0,_fxLoop(){}};const add=compile(member('src/ui/hud.js','HUD','_addFx'),'_addFx',{performance:{now:()=>123},requestAnimationFrame(){requests++;return 1;}});const fn=()=>false;add.call(self,'pending',fn);assert.equal(self._fxMap.get('pending'),fn);assert.equal(requests,0);self.paused=false;add.call(self,'pending',fn);assert.equal(requests,1);assert.equal(self._rafId,1);});
