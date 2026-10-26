import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {actualModule} from '../../network-replication/tests/added-actual-module.mjs';

const before=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-remaining-ui-network-before.json',import.meta.url)));
const read=p=>fs.readFileSync(new URL('../../../'+p,import.meta.url),'utf8');
const composed=rel=>adaptBuildSource(rel,read('inkwave-public/'+rel));
function between(s,a,b){const at=s.indexOf(a),end=s.indexOf(b,at);assert(at>=0&&end>at,a);return s.slice(at,end);}
const plain=x=>structuredClone(x);
let seed=0xa39fc1;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);

test('production diorama snap preserves strict nearest/tie/NaN selection while skipping out-of-radius hypot',()=>{
  const source=composed('src/ui/diorama.js');
  const after=between(source,'    let best = -1, bd = 72;','    if (padChoice) best');
  let calls=0;const math=Object.create(Math);math.hypot=(...v)=>{calls++;return Math.hypot(...v);};
  const make=s=>vm.runInNewContext('(function(padChoice,selfIndex,W,H){'+s+'return {best,bd};})',{Math:math});
  const a=make(before.diorama),b=make(after);
  const edges=[NaN,Infinity,-Infinity,-0,0,72,-72,71.999,34];
  for(let i=0;i<12000;i++){
    const owner={cx:random(),cy:random(),pins:Array.from({length:6},()=>({x:random()*1200,y:random()*900,vis:random()>.2}))};
    if(i%3===0)owner.pins[0].x=edges[i%edges.length];
    const args=[i%10===0,6,1200,900];
    calls=0;const expected=a.apply(owner,args),oldCalls=calls;calls=0;
    assert.deepEqual(plain(b.apply(owner,args)),plain(expected));assert(calls<=oldCalls);
  }
});

test('real adoption sampler matches full scan for monotonic buffers at 30/60/120 Hz and equality boundaries',()=>{
  const source=composed('src/net/netmatch.js');
  const after=between(source,'function sampleAdoptionState(','function superJumpActorState(');
  const make=s=>vm.runInNewContext(before.adoptionCopy+s+'\nsampleAdoptionState',{clampAdoptionAge:n=>Math.max(0,Math.min(90,n))});
  const a=make(before.adoption),b=make(after);
  for(const hz of [30,60,120])for(let count=1;count<=64;count++){
    const buf=Array.from({length:count},(_,i)=>({t:10+i/20,adoption:{life:Math.floor(i/15),sequence:i,tick:i*3,recoveryAge:i/20,cooldown:i/40,jump:i%2?{phase:'flight',elapsed:i/60,duration:1,from:[0,0,0],to:[1,2,3],target:[4,5,6]}:null}}));
    for(const t of [9,NaN,Infinity,buf.at(-1).t,...buf.map(x=>x.t),...Array.from({length:100},(_,i)=>10+i/hz)])
      assert.deepEqual(plain(b(buf,t,'remote',200)),plain(a(buf,t,'remote',200)));
  }
});

test('real authority metadata accepts exactly the same all-or-none four fields',()=>{
  const after=between(composed('src/net/netmatch.js'),'  _validHitAuthorityMetadata(d) {','  _hitHandoffParentEntries(');
  const env={HIT_AUTHORITY_FIELDS:['hp','hr','ht','la'],hitSafe:Number.isSafeInteger,hitFinite:Number.isFinite,PLAYER:{hp:100}};
  const make=s=>vm.runInNewContext('({'+s+'})._validHitAuthorityMetadata',env);
  const a=make(before.hitMetadata),b=make(after),owner={_readHitHandoffPacket:v=>v===false?false:null};
  const values=[undefined,null,0,1,-1,100,Infinity,NaN,'1'];
  for(let mask=0;mask<16;mask++)for(const value of values){
    const d={h:1,v:1,a:2,vl:0,d:25,kld:0,hp:75,hr:1,ht:0,la:1};
    for(let i=0;i<4;i++)if(!(mask&(1<<i)))delete d[env.HIT_AUTHORITY_FIELDS[i]];
    for(const key of ['hp','hr','ht','la','he']){const p={...d,[key]:value};assert.equal(b.call(owner,p),a.call(owner,p));}
  }
  for(const value of [null,undefined,{},false])assert.equal(b.call(owner,value),a.call(owner,value));
});

test('composed bomb sender snapshots local admission metadata once without changing the emitted birth',()=>{
  const body=between(composed('src/net/netmatch.js'),'  recBomb(b) {','  _onLocalEvent(');
  for(const metadata of [null,['birth','match',2]]){
    let calls=0,wire,recorded;
    const send=vm.runInNewContext('({'+body+'}).recBomb',{kitBombPacket:()=>['bomb',.5],kitBombBirthMetadata:()=>{calls++;return metadata;},r2:n=>Math.round(n*100)/100,recordKitBombBirth:(_nm,b,e)=>{recorded={b,e};}});
    const b={owner:{nid:7},kind:'bomb',pos:{x:1,y:2,z:3},vel:{x:4,y:5,z:6}};
    send.call({_rec:e=>(wire=e)},b);assert.equal(calls,1);
    assert.deepEqual(plain(wire),['b',7,'bomb',1,2,3,4,5,6,null,'bomb',.5,...(metadata?[metadata]:[])]);
    assert.equal(recorded.b,b);assert.equal(recorded.e,wire);
  }
});

test('actual combat proof owner preserves sparse pose fallback, proof caps/expiry and mixed paint envelopes',async()=>{
  const path='patches/network-replication/combat-provenance.mjs',extra='export {record};';
  const a=await actualModule(path,{extra,transform:s=>s.replace(between(s,'function record(','// Pair a fire event'),before.record)});
  const b=await actualModule(path,{extra});
  const make=()=>({byNid:new Map([[1,{nid:1,owner:'peer',remote:true,alive:true,pos:{x:0,y:0,z:0},weapon:{id:'shot',kind:'shooter',range:30,fireInterval:.1}}]])});
  const left=make(),right=make();
  for(let i=0;i<1200;i++){
    const t=i/60,ts=t+1,pose=[1,0,0,0];
    if(i%17===0)delete pose[2];if(i%19===0)pose[3]=NaN;
    const shot=[ts,'p',1,0,'shot',0,0,0,0,1,0],paint=[ts,'s',0,0,0,1];
    const events=i%4===0?[paint]:i%4===1?[paint,shot]:i%4===2?Array.from({length:257},(_,j)=>j===255?shot:paint):[];
    const packet={ts,e:events,a:[pose]};
    assert.equal(a.api.record(left,'peer',packet,t),b.api.record(right,'peer',packet,t));
    for(const key of ['proofs','pending','contacts'])assert.deepEqual(plain([...right._combatProvenance[key]]),plain([...left._combatProvenance[key]]));
  }
});

test('real bounded boss validator matches Set implementation including duplicates, malformed rows and signed zero',async()=>{
  const path='patches/network-replication/snapshot-guard.mjs';
  const a=await actualModule(path,{transform:s=>s.replace(between(s,'export function validBossSnapshotRow(','// BossBrain serializes'),before.boss)});
  const b=await actualModule(path);
  const ids=[0,-0,1,2,16,Number.MAX_SAFE_INTEGER,NaN,Infinity,null,'1',undefined];
  for(let n=0;n<19;n++)for(let i=0;i<1000;i++){
    const crabs=Array.from({length:n},(_,j)=>[j,1,2,3,4,5]);
    if(n&&i%3===0)crabs[i%n][0]=ids[i%ids.length];
    if(n&&i%11===0)crabs[i%n]=null;
    if(n&&i%13===0)delete crabs[i%n];
    const row=[1,0,0,0,0,0,0,1,1,0,-1,0,0,0,0,-1,crabs,100];
    assert.equal(b.api.validBossSnapshotRow(row,1),a.api.validBossSnapshotRow(row,1));
  }
});

test('news image wait has one deadline, responds to load/error, retains modal retry and disposes every callback',()=>{
  const source=composed('src/ui/news.js');
  const methods=between(source,'  maybeShow() {','  _render(i, first) {');
  const dispose=between(source,'  dispose() {','\n}',);
  function scenario(mode){
    let now=0,next=0,seen=0;const timers=new Map(),images=[];
    class Image {constructor(){this.complete=false;this.events=new Map();images.push(this);}addEventListener(k,f){this.events.set(k,f);}removeEventListener(k,f){if(this.events.get(k)===f)this.events.delete(k);}fire(k){this.complete=true;this.events.get(k)?.();}}
    const node=()=>({dataset:{},appendChild(){},remove(){},getBoundingClientRect:()=>({width:400,height:300})});
    const env={Image,gate:()=>true,newsSeen:()=>false,PAGES:[{img:'a',tone:'a'},{img:'b'}],art:x=>x,performance:{now:()=>now},G:{mode:'menu'},setTimeout:(f,ms)=>{const id=++next;timers.set(id,{f,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),cancelAnimationFrame(){},markSeen:()=>seen++,prefersReducedMotion:()=>false,h:node};
    const C=vm.runInNewContext('(class { '+methods+dispose+'\n})',env),o=new C();
    Object.assign(o,{M:{current:'main',_scr:{el:node()},_sfx(){},wipe:{busy:false}},_tweens:[],_render(){},_ink(){}});
    const advance=t=>{now=t;for(const [id,x]of [...timers])if(x.at<=now){timers.delete(id);x.f();}};
    o.maybeShow();advance(700);assert.equal(timers.size,1);assert.equal(images[0].events.size,2);
    if(mode==='dispose'){o.dispose();advance(5000);images[0].fire('load');assert.equal(seen,0);}
    else if(mode==='deadline'){advance(3999);assert.equal(seen,0);advance(4000);assert.equal(seen,1);}
    else {if(mode==='modal')o.M.wipe.busy=true;now=900;images[0].fire(mode==='error'?'error':'load');if(mode==='modal'){assert.equal(seen,0);o.M.wipe.busy=false;advance(1050);}assert.equal(seen,1);}
    assert.equal(images[0].events.size,0);assert.equal(timers.size,0);assert.equal(o._pre,null);
  }
  for(const mode of ['load','error','deadline','modal','dispose'])scenario(mode);
});

test('ranked HUD has no style/DOM work in unranked mode and repairs styles on ranked re-entry',async()=>{
  let created=0,queries=0,style=null;const doc={};
  const node=()=>({dataset:{},style:{setProperty(){}},classList:{toggle(){}},hidden:false,textContent:'',querySelector(){return node();},querySelectorAll(){return [];},appendChild(){},getRootNode(){return doc;},hasAttribute:()=>true,ownerDocument:doc});
  doc.querySelector=()=>{queries++;return style;};
  doc.createElement=tag=>{created++;const n=node();n.tagName=tag.toUpperCase();return n;};
  doc.head={appendChild:n=>{style=n;}};
  const f=await actualModule('patches/splatoon3/runtime/ranked/ui.mjs',{extra:'export {updateHud};',globals:{document:doc}});
  const hud={el:node()},G={match:{}};
  for(let i=0;i<100;i++)f.api.updateHud(hud,G,{});
  assert.equal(created,0);assert.equal(queries,0);assert.equal(hud._rankedHud,undefined);
  G.match.ranked={mode:'zones',rule:{state:{}},time:30};f.api.updateHud(hud,G,{});const root=hud._rankedHud;assert(root);assert.equal(created,2);
  G.match.ranked=null;f.api.updateHud(hud,G,{});assert.equal(root.hidden,true);
  style.getRootNode=()=>null;style=null;
  G.match.ranked={mode:'zones',rule:{state:{}},time:29};f.api.updateHud(hud,G,{});assert.equal(hud._rankedHud,root);assert.equal(root.hidden,false);assert.equal(created,3);
});

test('zones text cache matches original across frozen/mutable samples, owners, locales and palette edits',async()=>{
  const path='patches/splatoon3/runtime/ranked/ui.mjs';
  const a=await actualModule(path,{transform:s=>s.replace(between(s,'export function objectiveText(','function writeHudText('),before.objectiveText)});
  const b=await actualModule(path),engine={mode:'zones',rule:{state:{zones:[]}},frame:{}},G={palette:{names:['ORANGE','BLUE']}};
  for(let i=0;i<18000;i++){
    const count=1+i%3,values=Array.from({length:count},(_,j)=>[i%4?.51:random(),j%2?.49:random()]);
    if(i%7!==0){values.forEach(Object.freeze);Object.freeze(values);}
    engine.frame.zoneCoverage=values;engine.rule.state.zones=Array.from({length:count},(_,j)=>({team:(i+j)%3-1}));
    if(i%11===0)G.palette.names[0]='A'+i;
    const api={LANG:i%2?'ja':'en'};
    assert.equal(b.api.objectiveText(engine,G,api),a.api.objectiveText(engine,G,api));
    assert.equal(b.api.objectiveText(engine,G,api),a.api.objectiveText(engine,G,api));
  }
  engine.frame.zoneCoverage=Object.freeze([Object.freeze([.7,.3]),Object.freeze([.2,.8])]);b.api.objectiveText(engine,G,{});
  engine.frame.zoneCoverage=Object.freeze([Object.freeze([.1,.9]),[.2,.8]]);assert.equal(b.api.objectiveText(engine,G,{}),a.api.objectiveText(engine,G,{}));
  engine.frame.zoneCoverage=Object.freeze([Object.freeze([.1,.9]),Object.freeze([.2,.8])]);assert.equal(b.api.objectiveText(engine,G,{}),a.api.objectiveText(engine,G,{}));
});

test('HUD paused effects park RAF and resume once, including pause/resume during the callback',()=>{
  const source=composed('src/ui/hud.js');
  const setup=between(source,'    this._queueFxPaused = false;','    this._fxTime =');
  const methods=between(source,'  _addFx(name, fn) {','  _restart(');
  let now=0,id=0;const pending=new Map();
  const env={performance:{now:()=>now},requestAnimationFrame:f=>{pending.set(++id,f);return id;},cancelAnimationFrame:i=>pending.delete(i),console};
  const o=vm.runInNewContext('new (class {'+methods+'})()',env);Object.assign(o,{_fxTime:0,timeScale:1});o._fxLoop=o._fxLoop.bind(o);
  vm.runInNewContext('(function(){'+setup+'})',env).call(o);
  const deltas=[];o.paused=true;o._addFx('x',dt=>{deltas.push(dt);return true;});assert.equal(pending.size,0);
  now=30000;o.paused=false;assert.equal(pending.size,1);
  const tick=()=>{const [key,fn]=pending.entries().next().value;pending.delete(key);now+=16;fn(now);};tick();assert.equal(pending.size,1);assert.equal(deltas[0],.016);
  o.paused=true;assert.equal(pending.size,0);o.paused=false;assert.equal(pending.size,1);
  o._addFx('mid',()=>{o.paused=true;o.paused=false;return false;});tick();assert.equal(pending.size,1);
  o._addFx('park',()=>{o.paused=true;return false;});tick();assert.equal(pending.size,0);
});

test('private owner-clock unproven count retires exactly once and preserves rejoin challenges',async()=>{
  const crypto={getRandomValues:a=>{for(let i=0;i<a.length;i++)a[i]=i+1;return a;}};
  const f=await actualModule('patches/network-replication/owner-clock.mjs',{extra:'export {states};',globals:{crypto}}),sent=[];
  const nm={myId:'me',cfg:{id:'match'},match:{},peers:new Map(),s:{ownerClockVersion:1,_members:new Map([['me',1],['peer',1]]),tr:{sendTo:(to,d)=>{sent.push({to,d});return true;}}}};
  f.api.beginOwnerClock(nm,0);const s=f.api.states.get(nm);assert.equal(s.unproven,1);
  const reply={...sent[0].d,k:'oca',ts:1};f.api.handleOwnerClockMessage(nm,'peer',reply,.1);assert.equal(s.unproven,0);
  f.api.handleOwnerClockMessage(nm,'peer',reply,.1);assert.equal(s.unproven,0);
  s.peers[Symbol.iterator]=()=>{throw Error('settled peers must not be scanned');};f.api.advanceOwnerClock(nm,30);delete s.peers[Symbol.iterator];
  f.api.retireOwnerClock(nm,'peer');assert.equal(s.unproven,0);f.api.beginOwnerClock(nm,31);assert.equal(s.unproven,1);
  f.api.retireOwnerClock(nm,'peer');f.api.retireOwnerClock(nm,'peer');assert.equal(s.unproven,0);
  f.api.beginOwnerClock(nm,32);f.api.closeOwnerClock(nm);assert.equal(s.unproven,0);assert.equal(s.peers.size,0);
});
