import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {compose} from '../../splatoon3/tests/clothing-gear-fixture.mjs';
import {adaptTeamSpecialSignal} from '../team-special-signal-adapter.mjs';
import {replaceOnce,qualityIdentity} from '../adapter.mjs';
const read=rel=>fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');
const raw=read('src/ui/hud.js'),code=compose('src/ui/hud.js',raw);
function platform(){
 class Node{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.parentNode=null;this.dataset={};this.names=new Set();this.textContent='';this.innerHTML='';this.style={setProperty:(k,v)=>this.style[k]=v};this.offsetHeight=24;this.animations=[];this.classList={add:(...ns)=>ns.forEach(n=>this.names.add(n)),remove:(...ns)=>ns.forEach(n=>this.names.delete(n)),contains:n=>this.names.has(n),toggle:(n,on)=>on?this.names.add(n):this.names.delete(n)};}
  set className(v){this.names=new Set(v.split(/\s+/).filter(Boolean));}get className(){return [...this.names].join(' ');}
  appendChild(n){n.remove();n.parentNode=this;this.children.push(n);return n;}append(...ns){for(const n of ns)this.appendChild(n);}prepend(n){n.remove();n.parentNode=this;this.children.unshift(n);}
  remove(){if(this.parentNode){const p=this.parentNode;p.children.splice(p.children.indexOf(this),1);this.parentNode=null;}}
  setAttribute(k,v){this[k]=v;}addEventListener(){}
  animate(){const a={};this.animations.push(a);return a;}
  querySelectorAll(sel){const match=n=>sel==='[data-team-special]'?n.dataset.teamSpecial!==undefined:sel==='.iw-feed__item:not(.is-out)'?n.names.has('iw-feed__item')&&!n.names.has('is-out'):sel.startsWith('.')?n.names.has(sel.slice(1)):false;return this.children.flatMap(n=>[...(match(n)?[n]:[]),...n.querySelectorAll(sel)]);}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
 }
 return{Node,document:{documentElement:new Node('html'),body:new Node('body'),createElement:t=>new Node(t),createTextNode:v=>Object.assign(new Node('#text'),{textContent:v})}};
}
async function production({baseline=false}={}){
 const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),SRC=path.join(ROOT,'inkwave-public');
 const {Node,document}=platform(),timers=new Map();let tid=0;
 const context=vm.createContext({console,performance,URL,Math,setTimeout:(fn,ms)=>{const id=++tid;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),removeEventListener(){},cancelAnimationFrame(){},getComputedStyle:()=>({marginBottom:'0px'})}),modules=new Map();
 const load=requested=>{let file=requested.startsWith(path.join(SRC,'patches')+path.sep)?path.join(ROOT,path.relative(SRC,requested)):requested;if(file.startsWith(path.join(ROOT,'src')+path.sep))file=path.join(SRC,path.relative(ROOT,file));if(modules.has(file))return modules.get(file);
  const rel=path.relative(file.startsWith(SRC+path.sep)?SRC:ROOT,file);let code=compose(rel,fs.readFileSync(file,'utf8'));
  if(baseline&&rel==='src/ui/hud.js'){const listener="      on('special:use', ({ actor, id }) => this._teamSpecialUse(actor, id)),\n";assert(code.includes(listener));code=code.replace(listener,'');}
  const m=new vm.SourceTextModule(code,{context,identifier:file,initializeImportMeta:meta=>meta.url=pathToFileURL(file).href});modules.set(file,m);return m;};
 const root=new vm.SourceTextModule("export {install} from './patches/splatoon3/runtime/install.mjs';",{context,identifier:path.join(ROOT,'team-special-entry.mjs')});
 await root.link((spec,from)=>load(spec==='three'?path.join(SRC,'vendor/three/build/three.module.js'):spec.startsWith('three/addons/')?path.join(SRC,'vendor/three/jsm',spec.slice(13)):path.resolve(path.dirname(from.identifier),spec)));await root.evaluate();
 const profile=JSON.parse(fs.readFileSync(path.join(ROOT,'patches/splatoon3/profile.json'),'utf8')),f=root.namespace.install(profile),{G,THREE}=f;
 Object.assign(G,{teamHex:['#ff8a14','#2f5bff'],teamColors:[new THREE.Color('orange'),new THREE.Color('blue')],scene:new THREE.Scene(),time:0,level:{blocks:[],groundHeight:()=>0},physics:{los:()=>true,raycast:(_a,_b,_c,h)=>{h.hit=false;return h;}},paint:{sample:()=>1,splat:()=>0},actors:[],camera:new THREE.PerspectiveCamera()});G.projectiles=new f.Projectiles(G.scene);
 const make=(weapon='shooter')=>new f.Actor({weapon,team:0,name:'fixture',CharacterClass:f.Character});
 const hudRig=()=>{context.document=document;const hud=Object.create(f.HUD.prototype);Object.assign(hud,{_visible:true,_L:{},squads:[new Node(),new Node()],feedEl:new Node(),el:new Node(),overLayer:new Node(),boss:{dispose(){}},_clearDamageDirs(){},_startMatchHud(){},_onSplatted(){},_restart(){},_cancelJudge(){},_cancelLineup(){}});hud._bindBus();return{hud,timers,rows:()=>hud.feedEl.querySelectorAll('[data-team-special]'),icon:id=>f.SPECIAL_ICONS[id],expire(){for(const[id,t]of [...timers]){timers.delete(id);t.fn();}for(const el of [...hud.feedEl.children])for(const a of el.animations)a.onfinish?.();}};};
 return{...f,make,hudRig};
}
async function localRig(options){
 const f=await production(options),me=f.make('shooter'),ally=f.make('roller'),enemy=f.make('charger');me.isLocal=true;ally.isLocal=enemy.isLocal=false;me.team=ally.team=0;enemy.team=1;ally.name='Ally';enemy.name='Enemy';
 f.G.mode='match';f.G.match={state:'playing',mode:'turf',local:me,actors:[me,ally,enemy],attract:false,playing:()=>f.G.match.state==='playing'};f.G.actors=f.G.match.actors;
 const r=f.hudRig();return{...f,...r,me,ally,enemy};
}
test('#919 missing consumer drops the native teammate activation; current HUD shows its actual icon and excludes self',async()=>{
 for(const baseline of [true,false]){
  const f=await localRig({baseline});f.ally.weapon={...f.ally.weapon,special:'storm'};f.ally.special=f.ally.specialCost();let events=0;const off=f.on('special:use',e=>{if(e.actor===f.ally)events++;});
  f.ally._startSpecial();assert.equal(events,1,'real Actor producer');assert.equal(f.rows().length,baseline?0:1);
  if(!baseline){assert.equal(f.rows()[0].dataset.teamSpecial,'storm');assert.equal(f.rows()[0].querySelector('.iw-feed__icon').innerHTML,f.icon('storm'));assert.equal(f.ally.special,0);}
  f.emit('special:use',{actor:f.me,id:'slam'});assert.equal(f.rows().length,baseline?0:1);off();f.hud.dispose();
 }
});
test('#919 enemy, retired actors, unknown ids and non-live states never disclose or queue a signal',async()=>{
 const f=await localRig(),use=(actor=f.ally,id='storm')=>f.emit('special:use',{actor,id});
 use(f.enemy);use({...f.ally});use(f.ally,'__proto__');use(f.ally,'missing');assert.equal(f.rows().length,0);
 f.me.team=f.ally.team=1;f.enemy.team=0;use();assert.equal(f.rows().length,1,'team1 viewer also receives its own ally');use(f.enemy);assert.equal(f.rows().length,1);f.hud._clearTeamSpecialSignals();
 for(const state of ['intro','finish','judge','results']){f.G.match.state=state;use();}f.G.match.state='playing';f.G.match.attract=true;use();f.G.match.attract=false;f.G.match.paused=true;use();f.G.match.paused=false;f.G.mode='menu';use();f.G.mode='match';f.hud.setVisible(false);use();assert.equal(f.rows().length,0);assert.equal(f.timers.size,0);f.hud.dispose();
});
test('#919 simultaneous teammate activations retain distinct special icons and native feed expiry',async()=>{
 const f=await localRig();for(const id of ['trizooka','inkVac','bubbler'])f.emit('special:use',{actor:f.ally,id});
 assert.equal(f.rows().length,3);for(const el of f.rows())assert.equal(el.querySelector('.iw-feed__icon').innerHTML,f.icon(el.dataset.teamSpecial));
 assert.equal(new Set(f.rows().map(el=>el.querySelector('.iw-feed__icon').innerHTML)).size,3);const mobile=compose('styles/mobile.css',read('styles/mobile.css'));assert.match(mobile,/html\.iw-touch-ui \.iw-hud \.iw-feed \.iw-feed__item\[data-team-special\] \{ display: flex; \}/,'special-only selector overrides the native third-feed-item hide rule');assert.equal(f.timers.size,3);assert([...f.timers.values()].every(t=>t.ms===4200),'existing INKWAVE feed expiry is retained, not an S3 calibration');
 f.expire();assert.equal(f.rows().length,0);assert.equal(f.timers.size,0);f.hud.dispose();
});
test('#919 current match and HUD retirement clear signal timers; stale match disposal cannot clear the current signal',async()=>{
 const f=await localRig(),use=()=>f.emit('special:use',{actor:f.ally,id:'storm'});use();f.emit('match:dispose',{match:{actors:[f.ally]}});assert.equal(f.rows().length,1);
 f.G.match.state='finish';f.emit('match:state',{match:f.G.match,state:'finish'});assert.equal(f.rows().length,0);assert.equal(f.timers.size,0);
 f.G.match.state='playing';use();f.hud.setVisible(false);assert.equal(f.rows().length,0);assert.equal(f.timers.size,0);f.hud._visible=true;use();f.hud.dispose();assert.equal(f.rows().length,0);assert.equal(f.timers.size,0);use();assert.equal(f.rows().length,0);
});
test('#919 accepted NetMatch replay feeds the same HUD once; forged sender and duplicate birth stay rejected',async()=>{
 const f=await production(),session=id=>({myId:id,isHost:id==='me',hostId:'me',_members:new Map([['me','Me'],['p2','Mate'],['p3','Other']]),tr:{broadcast(){},sendTo(){}}}),nm=new f.NetMatch(session('me'));
 const me=f.make('shooter'),ally=f.make('roller');Object.assign(me,{nid:0,owner:'me',isLocal:true,remote:false});Object.assign(ally,{nid:1,owner:'p2',isLocal:false,remote:true,name:'Mate'});
 for(const a of[me,ally]){nm.byNid.set(a.nid,a);nm._setupActor(a);}nm.match={actors:[me,ally],local:me,state:'playing',attract:false,removeActor(){}};Object.assign(f.G,{match:nm.match,netm:nm,actors:nm.match.actors,mode:'match'});const r=f.hudRig();
 // Produce an owner event using the real recorder, then round-trip through JSON.
 const sender=await production(),owned=sender.make('roller');Object.assign(owned,{nid:1,owner:'p2',isLocal:true,remote:false});const sn=new sender.NetMatch(session('p2'));sn.byNid.set(1,owned);sn._setupActor(owned);sn.match={actors:[owned],local:owned,state:'playing',attract:false,removeActor(){}};sender.G.match=sn.match;sender.G.netm=sn;
 sn._onLocalEvent('special:use',{actor:owned,id:'bubbler'});let packet;sn.s.tr.broadcast=m=>{packet=JSON.parse(JSON.stringify(m));};sn._sendTick();assert(packet?.e?.some(e=>e[1]==='ev'&&e[2]==='special:use'));assert.equal(packet.r,2);
 const receive=(from,message)=>{nm.onMessage(from,JSON.parse(JSON.stringify(message)));const peer=nm.peers.get(from);if(peer){peer.tr=message.ts;peer.sim=message.u;}nm._playEvents(0);};
 receive('p3',packet);assert.equal(r.rows().length,0);receive('p2',packet);assert.equal(r.rows().length,1);receive('p2',packet);receive('p2',{...packet,ts:packet.ts+1});assert.equal(r.rows().length,1);assert.equal(r.rows()[0].dataset.teamSpecial,'bubbler');r.hud.dispose();nm.dispose();sn.dispose();
});
test('#919 adapter is registered and fails closed without changing NetMatch or other paths',()=>{
 assert(qualityIdentity()['team-special-signal-adapter.mjs']);assert.equal(adaptTeamSpecialSignal('src/net/netmatch.js','same',replaceOnce),'same');for(const s of ['',raw+raw,code])assert.throws(()=>adaptTeamSpecialSignal('src/ui/hud.js',s,replaceOnce),/conflict/);
});
