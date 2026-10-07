import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { compose } from '../../splatoon3/tests/clothing-gear-fixture.mjs';
import { installMenuQuality } from '../menu.mjs';
import { clearContinuation, continuationNavigation } from '../result-continuation.mjs';
const raw=fs.readFileSync(new URL('../../../inkwave-public/src/ui/menus.js',import.meta.url),'utf8');
const composed=compose('src/ui/menus.js',raw);
function section(source,start,end){const i=source.indexOf(start),j=source.indexOf(end,i);assert(i>=0&&j>i);assert.equal(source.indexOf(start,i+start.length),-1);return source.slice(i,j);}
function node(){return {style:{},classList:{add(){},remove(){},toggle(){}},querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},remove(){this.removed=true;}};}
function fixture({legacy=false}={}){
 let now=1000,serial=0;const timers=new Map(),calls=[],sounds=[],mounts=[],wipes=[];
 const env={performance:{now:()=>now},setTimeout(fn,ms){timers.set(++serial,{fn,ms,due:now+ms});return serial;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:()=>0,cancelAnimationFrame(){},addEventListener(){},removeEventListener(){},document:{fonts:{removeEventListener(){}}}};
 const consts=['SCREENS','WIPES','LIGHT'].map(k=>composed.match(new RegExp('const '+k+' = [^\\n]+'))[0]).join('\n');
 const show=section(composed,'  show(name = null, opts = {}) {','\n  setLoading(');
 const title=section(legacy?raw:composed,'  _titleGo() {','\n  // ================================================================ focus');
 const dispose=section(composed,'  dispose() {','\n  // ================================================================ internals');
 // Counterfactual reinstates only the old delayed callback and retired-show
 // admission. All other current quality/runtime owners remain installed.
 const methods=[legacy?show.replace('    if (this._qualityDisposed) return;\n',''):show,title,dispose].join('\n');
 const Menus=vm.runInNewContext(consts+'\nclass Menus{'+methods+'\n_swap(name){this.mounts.push(name);this._scr=name?{name,el:this.makeNode()}:null;}\nupdate(){}\n_loop(){}\n};Menus',{...env,window:env,document:env.document,clearContinuation,continuationNavigation,safeCall:fn=>fn(),prefersReducedMotion:()=>false,console});
 installMenuQuality(Menus,env);
 const m=new Menus();Object.assign(m,{current:'title',_scr:{name:'title',el:node()},_shownAt:0,_swapToken:1,_stack:['title'],_focusMem:{},_focus:null,_cur:{},_raf:0,_fitQ:0,_platformDriven:true,el:node(),mounts,makeNode:node,_sfx:name=>sounds.push(name),wipe:{busy:false,cancel(){wipes.length=0;}},api:{onScreenChange:name=>calls.push(name)},_runWipe:fn=>wipes.push(fn)});
 return {m,timers,calls,sounds,mounts,wipes,
  titleTimer(){const t=[...timers.values()].find(t=>t.ms===200);assert(t,'a title timer exists');return t;},
  advance(ms){now+=ms;for(const[id,t]of [...timers])if(t.due<=now&&timers.delete(id))t.fn();},
  flushWipe(){const fn=wipes.shift();fn?.();},
 };
}

test('#950 old callback overrides newer navigation and revives a disposed menu',()=>{
 const next=fixture({legacy:true});next.m._titleGo();next.m.show('settings',{wipe:false});next.advance(200);next.flushWipe();assert.deepEqual(next.calls,['settings','main']);assert.equal(next.m.current,'main');
 const dead=fixture({legacy:true});dead.m._titleGo();dead.m.dispose();dead.advance(200);dead.flushWipe();assert.equal(dead.m._qualityDisposed,true);assert.deepEqual(dead.calls,['main']);assert.equal(dead.m._scr.name,'main');
});

test('#950 normal title confirmation preserves 200ms delay, sounds and native wipe ownership',()=>{
 const f=fixture();f.m._titleGo();f.m._titleGo();assert.equal(f.timers.size,1);assert.deepEqual(f.sounds,['ui_confirm','splat_small']);
 f.advance(199);assert.equal(f.m.current,'title');assert.deepEqual(f.calls,[]);f.advance(1);assert.equal(f.m.current,'main');assert.equal(f.m._scr.name,'title');assert.deepEqual(f.calls,[]);
 f.flushWipe();assert.deepEqual(f.calls,['main']);assert.equal(f.m._scr.name,'main');assert.equal(f.m._leavingTitle,false);assert.equal(f.m._titleTimer,null);assert.equal(f.m._titleTicket,null);
});

test('#950 newer screen retires both scheduled and already queued title callbacks',()=>{
 const f=fixture();f.m._titleGo();const stale=f.titleTimer().fn;f.m.show('settings',{wipe:false});assert.equal(f.timers.size,0);f.advance(200);stale();f.flushWipe();
 assert.equal(f.m.current,'settings');assert.equal(f.m._scr.name,'settings');assert.deepEqual(f.calls,['settings']);assert.equal(f.m._leavingTitle,false);
});

test('#950 title re-entry cannot revive the earlier generation or cancel its new confirmation',()=>{
 const f=fixture();f.m._titleGo();const stale=f.titleTimer().fn;f.m.show('settings',{wipe:false});f.m.show('title',{wipe:false});f.advance(350);f.m._titleGo();const current=f.titleTimer().fn;
 stale();assert.equal(f.m.current,'title');assert.equal(f.m._leavingTitle,true);assert.equal(f.timers.size,1);
 f.advance(200);current();f.flushWipe();stale();assert.deepEqual(f.calls,['settings','title','main']);assert.equal(f.m.current,'main');
});

test('#950 no-op show retains confirmation; a forced title rebuild retires it',()=>{
 const f=fixture();f.m._titleGo();const id=f.m._titleTimer;f.m.show('title');assert.equal(f.m._titleTimer,id);assert.equal(f.timers.size,1);
 f.m.show('title',{force:true,wipe:false});assert.equal(f.timers.size,0);assert.equal(f.m._leavingTitle,false);f.advance(200);assert.equal(f.m.current,'title');assert.deepEqual(f.calls,['title']);
});

test('#950 disposal clears the timer and rejects stale or fresh navigation without side effects',()=>{
 const f=fixture();f.m._titleGo();const stale=f.titleTimer().fn;f.m.dispose();assert.equal(f.timers.size,0);assert.equal(f.m._scr,null);assert.equal(f.m.el.removed,true);
 const sounds=f.sounds.length;stale();f.m.show('main');f.m._titleGo();f.advance(200);assert.deepEqual(f.calls,[]);assert.deepEqual(f.mounts,[]);assert.equal(f.sounds.length,sounds);assert.equal(f.timers.size,0);assert.equal(f.m._scr,null);
});

test('#950 a newer screen still invalidates a pending native wipe midpoint',()=>{
 const f=fixture();f.m._titleGo();f.advance(200);const staleMid=f.wipes.shift();assert(staleMid);f.m.show('settings',{wipe:false});staleMid();assert.equal(f.m.current,'settings');assert.equal(f.m._scr.name,'settings');assert.deepEqual(f.calls,['settings']);
});

test('#950 repeated disposed owners cannot affect a fresh menu instance',()=>{
 const live=fixture();for(let i=0;i<20;i++){const old=fixture();old.m._titleGo();const callback=old.titleTimer().fn;old.m.dispose();callback();assert.equal(old.timers.size,0);assert.deepEqual(old.calls,[]);}
 live.m._titleGo();live.advance(200);live.flushWipe();assert.deepEqual(live.calls,['main']);
});
