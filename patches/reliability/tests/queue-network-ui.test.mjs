import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { usesChargerRise } from '../../splatoon3/runtime/audio/charger-charge-rise.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { utf8ByteLength } from '../../network-replication/utf8-length.mjs';
import { installClock, runSimulation } from '../../splatoon3/runtime/clock.mjs';
const root = new URL('../../../', import.meta.url), cache = new Map();
function source(rel) { if(!cache.has(rel))cache.set(rel,adaptBuildSource(rel,fs.readFileSync(new URL('inkwave-public/'+rel,root),'utf8')));return cache.get(rel); }
function method(rel, name, next, globals={}) {
  const code=source(rel), start=code.indexOf('  '+name+'('),end=code.indexOf('\n  '+next+'(',start);
  assert.ok(start>=0&&end>start,rel+': '+name);return vm.runInNewContext('({'+code.slice(start,end)+'\n})',globals)[name];
}
test('exact UTF8 byte quota matches TextEncoder for BMP, astral, isolated surrogate and randomized strings',()=>{
  const encoder=new TextEncoder(),cases=['','abc','界'.repeat(22000),'😀'.repeat(15000),'\ud800','\udc00','a\ud800b','\ud800\ud800\udc00'];
  let seed=123;for(let i=0;i<1000;i++){let value='';for(let n=0;n<50;n++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;value+=String.fromCharCode(seed&65535);}cases.push(value);}
  for(const value of cases)assert.equal(utf8ByteLength(value),encoder.encode(value).byteLength);
});
test('remote idle audio avoids distance probes but always stops a previously playing handle',()=>{
  const G={audio:{}},voices=method('src/net/netmatch.js','_voices','_voiceLoop',{G,usesChargerRise});
  let probes=0,calls=0,stops=0;const actor={remote:true,alive:true,weapon:{kind:'shooter'},weaponRunner:{},net:{loops:{}},_nearCamera(){probes++;return false;}};
  const n={byNid:new Map([[1,actor]]),_voiceLoop(a,near,key,on){calls++;if(a.net.loops[key]&&!on){a.net.loops[key].stop();a.net.loops[key]=null;}return null;}};
  voices.call(n,.016);assert.equal(probes,0);assert.equal(calls,0);
  actor.net.loops.charge={stop(){stops++;}};voices.call(n,.016);assert.equal(probes,1);assert.equal(calls,2);assert.equal(stops,1);assert.equal(actor.net.loops.charge,null);
  actor.weapon.kind='charger';actor.weaponRunner.charging=true;voices.call(n,.016);assert.equal(probes,2);assert.equal(calls,4);
});
test('remote Charger release retires its recorded phrase and rearms the next onset without idle probes',()=>{
  let probes=0,starts=0,stops=0,calls=0;
  const G={audio:{playChargerChargeRise(){starts++;return {stop(){stops++;}};}}};
  const voices=method('src/net/netmatch.js','_voices','_voiceLoop',{G,usesChargerRise});
  const a={remote:true,alive:true,weapon:{id:'charger',kind:'charger'},weaponRunner:{charging:true},net:{loops:{}},_nearCamera(){probes++;return true;}};
  const n={byNid:new Map([[1,a]]),_voiceLoop(_a,_near,key){assert.ok(key==='spin'||key==='roll','Charger cannot create a repeating click');calls++;return null;}};
  voices.call(n,.016);assert.equal(starts,1);assert.equal(probes,1);assert.equal(a.net._chargerOnsetActive,true);
  voices.call(n,.016);assert.equal(starts,1,'a held charge has one recorded phrase');
  a.weaponRunner.charging=false;voices.call(n,.016);
  assert.equal(stops,1,'release immediately stops the previously playing phrase');assert.equal(a.net._chargerRise,null);assert.equal(a.net._chargerOnsetActive,false);
  const idle=[probes,calls];voices.call(n,.016);assert.deepEqual([probes,calls],idle,'fully retired idle audio performs no probes or voice calls');
  a.weaponRunner.charging=true;voices.call(n,.016);assert.equal(starts,2,'a new charge edge is audible');
  a.weapon.kind='shooter';a.weaponRunner.charging=false;voices.call(n,.016);assert.equal(stops,2,'switching to an idle weapon retires the old phrase');
});
for(const hz of [30,60,120])test(`menu stick repeats in elapsed seconds at ${hz}Hz`,()=>{
  const padMenus=method('src/main.js','_padMenus','_updateHud',{G:{mode:'menu'}}),seen=[];
  let frame=0;const input={pad:{},padMenuPressed:new Set(),padPressed:new Set(),padAxis:i=>i===1?1:0,consumePadMenuButton(){}};
  const game={input,menus:{current:'settings',nav(){seen.push(frame/hz);}}};
  for(frame=0;frame<hz*2;frame++)padMenus.call(game,1/hz);
  assert.equal(seen[0],0);assert.ok(seen.length>=8&&seen.length<=10);
  for(let i=1;i<seen.length;i++){const gap=seen[i]-seen[i-1];assert.ok(gap>=.22-1e-10&&gap<=.22+1/hz+1e-10,gap);}
});
test('transport backpressure rejects before invoking user JSON hooks, and remains guarded during serialization',()=>{
  const broadcast=method('src/net/transport.js','broadcast','sendTo',{OUTBOUND_RECEIPT:Symbol()}),sendTo=method('src/net/transport.js','sendTo','lock',{});
  let serializations=0,sends=0;const obj={toJSON(){serializations++;return {k:'test'}}},tr={ws:{readyState:1,bufferedAmount:524289},_raw(){sends++;return true;}};
  assert.equal(broadcast.call(tr,obj),false);assert.equal(sendTo.call(tr,'p',obj),false);assert.equal(serializations,0);assert.equal(sends,0);
  tr.ws.bufferedAmount=0;assert.equal(broadcast.call(tr,obj),true);assert.equal(serializations,1);assert.equal(sends,1);
});
test('projection output slots remain independent and behind-camera behavior is unchanged',()=>{
  const project=method('src/ui/hud.js','_project','_updTimer'),id=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],cam={matrixWorldInverse:{elements:id},projectionMatrix:{elements:id}},a={},b={};
  assert.equal(project.call({},cam,1,2,3,a),a);assert.equal(project.call({},cam,4,5,6,b),b);assert.deepEqual(a,{x:1,y:2,z:3});assert.deepEqual(b,{x:4,y:5,z:6});
});
test('covered lobby freezes hidden attract paint but continues network and menu input',()=>{
  let paints=0,nets=0,menus=0,actors=0;const G={time:0,net:{update(){nets++;}},paint:{useFixedPaintClock(){},advanceSimulation(){paints++;}},projectiles:{update(){}}};installClock({G});
  const game={input:{padPressed:new Set(),pollPad(){},endFrame(){}},_padMenus(dt){assert.equal(dt,1/60);menus++;},showcase:{fullFrame:true},match:{attract:true,paused:false,update(){actors++;}},rig:{}};
  for(let i=0;i<60;i++)runSimulation(game,1/60);assert.equal(paints,0);assert.equal(actors,0);assert.equal(nets,60);assert.equal(menus,60);
  game.showcase.fullFrame=false;game.match.updateController=()=>{};game._updateAttract=()=>{};runSimulation(game,1/60);assert.equal(paints,1);
});
test('final composed transforms remain syntax-valid and reject accidental duplicate application',()=>{
  for(const rel of ['src/net/netmatch.js','src/net/transport.js','src/core/input.js','src/core/mobile.js','src/main.js','src/fx/screenfx.js','src/ui/hud.js','src/ui/hud-boss.js','src/ui/diorama.js','src/ui/menus.js','src/game/showcase.js','src/game/match.js','src/audio/audio.js'])new vm.SourceTextModule(source(rel));
});
test('explicit Input disposal retires only its global listeners and mobile owner, once',()=>{
 const G={},doc={pointerLockElement:{replacement:true},exitPointerLock(){throw Error('must not unlock another canvas');}},target=new EventTarget();
 const listen=method('src/core/input.js','_listen','dispose'),dispose=method('src/core/input.js','dispose','get lastDevice',{G,document:doc});
 let oldCalls=0,newCalls=0,destroyed=0;const input={_inputUnsubs:[],canvas:{},keys:new Set(),pressed:new Set(),padPressed:new Set(),padMenuPressed:new Set(),padMenuBlocked:new Set(),padPrev:[],mouse:{},mobile:{destroy(){destroyed++;}}};
 listen.call(input,target,'test',()=>oldCalls++);target.addEventListener('test',()=>newCalls++);G.input=input;
 target.dispatchEvent(new Event('test'));assert.equal(oldCalls,1);dispose.call(input);dispose.call(input);target.dispatchEvent(new Event('test'));
 assert.equal(oldCalls,1);assert.equal(newCalls,2);assert.equal(destroyed,1);assert.equal(G.input,null);assert.equal(input._inputUnsubs.length,0);
});
test('stream starvation arithmetic lands on the same bar, step, note times and RNG consumption as iterative advance',()=>{
 const pump=method('src/audio/music.js','pump','pumpDuck');
 function reference(until,now){if(this.disposed)return;while(this.t0+this.n*this.stepDur<now-.03&&this.t0+this.n*this.stepDur<this.stopAt)this.advance();for(;;){const t=this.t0+this.n*this.stepDur;if(t>=until||t>=this.stopAt)break;const tt=t+(this.step&1?(this.song.swing||0)*this.stepDur:0);for(const e of this.song.bars[this.bar].ev[this.step])this.fire(e,tt);this.advance();}}
 function make(n,step,bar,sd,stopAt){const notes=[];return {notes,t0:.157,n,step,bar,stepDur:sd,stopAt,song:{loopFrom:2,swing:.17,bars:Array.from({length:7},(_,bar)=>({ev:Array.from({length:16},(_,step)=>[{bar,step}])}))},advance(){this.n++;if(++this.step>=16){this.step=0;if(++this.bar>=this.song.bars.length)this.bar=this.song.loopFrom;}},fire(e,t){notes.push([e.bar,e.step,t]);}};}
 for(const sd of [.07,.13,.1875])for(const gap of [0,.03,.1,1,5,70,3600])for(const stopAt of [Infinity,1.34,50.7]){
  const a=make(7,7,3,sd,stopAt),b=make(7,7,3,sd,stopAt);const now=.157+7*sd+gap;reference.call(a,now+.14,now);pump.call(b,now+.14,now);
  assert.deepEqual([b.n,b.step,b.bar,b.notes],[a.n,a.step,a.bar,a.notes]);
 }
});
test('Boss successor lookup and interpolated crab rows reuse storage without mutating accepted history',()=>{
 const code=source('src/net/netmatch.js'),begin=code.indexOf('function queueBossPath('),end=code.indexOf('const ascending',begin),globals={};
 class V {constructor(){this.x=this.y=this.z=0;}set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z;}}
 const angle=(a,b)=>{let d=(b-a)%(Math.PI*2);if(d>Math.PI)d-=Math.PI*2;if(d< -Math.PI)d+=Math.PI*2;return d;};
 const env=vm.createContext({THREE:{Vector3:V},angDiff:angle});vm.runInContext(code.slice(begin,end),env);
 const s0={t:0,x:0,y:0,z:0,vx:1,vz:1,yaw:0,bt:0,crabs:[[1,0,1,2,0,3]]},s1={t:1,x:1,y:0,z:1,vx:1,vz:1,yaw:0,bt:1,crabs:[[1,2,3,4,.5,5]]};
 const original=JSON.stringify([s0,s1]);let clears=0;class CountMap extends Map {clear(){clears++;return super.clear();}}
 const n={buf:[s0,s1],err:new V(),errV:new V(),crabLookup:new CountMap()},peer={tr:.5},net={match:{boss:{sim:false,net:n}},s:{hostId:'host'},peers:new Map([['host',peer]])};
 const start=code.indexOf('  _sampleBoss(dt)'),stop=code.indexOf('\n  _trigSideEffects(',start);const sample=vm.runInContext('({'+code.slice(start,stop)+'\n})',env)._sampleBoss;
 sample.call(net,1/60);const row=n.cur.crabs[0];assert.deepEqual(Array.from(row),[1,1,2,3,.25,5]);assert.equal(clears,1);assert.notEqual(row,s0.crabs[0]);assert.notEqual(row,s1.crabs[0]);
 peer.tr=.6;sample.call(net,1/60);assert.equal(n.cur.crabs[0],row);assert.equal(clears,1);assert.equal(JSON.stringify([s0,s1]),original);
 s1.crabs=[[1,4,5,6,1,7]];sample.call(net,1/60);assert.equal(clears,2);assert.equal(row[5],7);
});
test('lobby glows keep animated matrices live but upload unchanged colors only once',()=>{
 const code=source('src/game/lobbySet.js'),start=code.indexOf('  _placeGlows(t)'),end=code.indexOf('\n  // Faint light',start);
 const chain={identity(){return this;},compose(){return this;},setScalar(){return this;},copy(){return this;}};
 const place=vm.runInNewContext('({'+code.slice(start,end)+'\n})',{_q:chain,_m:chain,_p:chain,_s:chain})._placeGlows;
 let matrices=0,colors=0,uploads=0;const attribute={set needsUpdate(v){if(v)uploads++;}},glows={setMatrixAt(){matrices++;},setColorAt(){colors++;},instanceMatrix:{},instanceColor:attribute};
 const owner={_glowList:[{pos:{},r:1,color:{r:1,g:.5,b:0}},{pos:{},r:2,color:{r:0,g:1,b:0}}],glows,bulbs:{instanceMatrix:{},setMatrixAt(){}}};
 place.call(owner,0);assert.equal(colors,2);assert.equal(uploads,1);place.call(owner,1);assert.equal(colors,2);assert.equal(uploads,1);assert.equal(matrices,4);
 owner._glowList[1].color.r=.75;place.call(owner,2);assert.equal(colors,3);assert.equal(uploads,2);assert.equal(matrices,6);
});
test('lobby slot occupancy is sampled once for eight anchors and direct callers retain live fallback',()=>{
 const occupied=method('src/game/showcase.js','lobbySlotOccupancy','lobbySlotAnchor');
 let reads=0;const members=new Map([['a',{mark:0,dest:4}],['b',{mark:2,dest:7,dead:true}],['c',{mark:1,leaving:true}],['d',{mark:'3',dest:6}]]),native=members.values.bind(members);members.values=()=>{reads++;return native();};
 const sc={lob:{members,ready:true,k:1,room:true,launchT:-1},mode:'lobby',_lobSpot:()=>({pos:{x:0,y:0,z:0}}),_lobProject:(_p,out,vis)=>Object.assign(out,{vis})};
 const vector={set(){return this;}},anchor=method('src/game/showcase.js','lobbySlotAnchor','_lobProject',{_v:vector,PLATE_H:2});
 const mask=occupied.call(sc);assert.equal(mask,81);
 for(let i=0;i<8;i++){const out={};anchor.call(sc,i>>2,i&3,out,mask);assert.equal(out.vis,(mask&(1<<i))?0:1);}
 assert.equal(reads,1);anchor.call(sc,0,0,{});assert.equal(reads,2);
});
test('stick guards compare authored and serialized styles and repair external edits or replacement nodes',()=>{
 const draw=method('src/core/mobile.js','_drawStick','openEditor');
 const canonical=v=>v.replace(/-?\d+(?:\.\d+)?/g,n=>String(+n)).replace(/,0\)/,',0px)').replace(/,/g,', ');
 const node=()=>{const values={},writes={transform:0,opacity:0},classes=new Set();return {writes,classList:{contains:name=>classes.has(name),toggle(name,force){const on=force===undefined?!classes.has(name):!!force;if(on)classes.add(name);else classes.delete(name);return on;}},style:{get transform(){return values.transform||'';},set transform(v){writes.transform++;values.transform=canonical(v);},get opacity(){return values.opacity||'';},set opacity(v){writes.opacity++;values.opacity=String(+Number(v).toFixed(6));}}};};
 const owner={stickEl:node(),knob:node(),dirEl:node(),_stick:{ox:20,oy:20},_stickHome:{x:20,y:20,d:40}};
 const run=()=>draw.call(owner,true,12,0,.123456789);
 for(let i=0;i<120;i++)run();
 assert.equal(owner.stickEl.classList.contains('is-on'),true);assert.equal(owner.stickEl.classList.contains('is-run'),false);
 owner.stickEl.classList.toggle('is-on',false);owner.stickEl.classList.toggle('is-run',true);run();
 assert.equal(owner.stickEl.classList.contains('is-on'),true,'repair an externally removed active class');assert.equal(owner.stickEl.classList.contains('is-run'),false,'repair an externally added run class');
 assert.deepEqual(owner.knob.writes,{transform:1,opacity:0});assert.deepEqual(owner.dirEl.writes,{transform:1,opacity:1});
 owner.knob.style.transform='scale(2)';owner.dirEl.style.transform='scale(2)';owner.dirEl.style.opacity='0';run();
 assert.equal(owner.knob.writes.transform,3);assert.deepEqual(owner.dirEl.writes,{transform:3,opacity:3});run();assert.equal(owner.dirEl.writes.opacity,3);
 draw.call(owner,false);draw.call(owner,false);assert.equal(owner.dirEl.style.opacity,'0');run();assert.notEqual(owner.dirEl.style.opacity,'0');
 draw.call(owner,true,12,0,1);assert.equal(owner.stickEl.classList.contains('is-run'),true);draw.call(owner,false);assert.equal(owner.stickEl.classList.contains('is-on'),false);assert.equal(owner.stickEl.classList.contains('is-run'),false);
 owner.knob=node();owner.dirEl=node();run();assert.equal(owner.knob.writes.transform,1);assert.deepEqual(owner.dirEl.writes,{transform:1,opacity:1});
});

test('outgoing Dualies snapshots retain startup, recovery and direction fields with one direction lookup', async () => {
  const helpers = await import('../../splatoon3/runtime/catalog-dualies-motion.mjs');
  // CPU-17b now packs sc/l/rl together. Exercise the emitted single-pass
  // source rather than searching for the superseded Object.fromEntries call.
  const code = source('src/net/netmatch.js');
  const begin = code.indexOf('    const a = [], sjEpochs = Object.create(null), sc = {}, l = {}, rl = {};');
  const end = code.indexOf('\n    const wf = packWipeoutTimeline(this);', begin);
  assert.ok(begin >= 0 && end > begin, 'single-pass tick body is emitted');
  let actions = 0, directions = 0;
  const pack = vm.runInNewContext('(function() { const publishActors = false; const G = { time: 0 }; const now = () => 0; ' +
    code.slice(begin, end) + '\nreturn rl; })', {
    dualiesNetworkAction: x => { actions++; return helpers.dualiesNetworkAction(x); },
    dualiesNetworkDirection: x => { directions++; return helpers.dualiesNetworkDirection(x); },
    r2: v => Math.round(v * 100) / 100, r3: v => Math.round(v * 1000) / 1000,
  });
  const actor = (nid, catalog, action, direction) => ({ nid, weapon: catalog ? { catalogRecord: { family: 'dualies' } } : {},
    weaponRunner: catalog ? { catalogState: { roll: { ...action, direction } } } : { dodge: action, _dodgeDir: direction }, netLife: 2, netTp: 3, specialCost() { return 180; } });
  const startup = actor(1, false, { token: 7, startup: .04, startupDur: .1, t: 0, dur: .2 }, { x: .123, z: -.789 });
  const roll = actor(2, true, { token: 8, startup: 0, startupDur: .1, t: .12, dur: .3 }, { x: -1, z: 0 });
  roll.net = { _remoteDodge: { token: 8, life: 2, tp: 3, start: 99, startupDur: .1, lockDur: .2 } };
  const invalid = actor(3, false, { token: 0, startup: 0, t: 0 }, { x: NaN, z: 1 });
  const remote = { ...startup, nid: 4, remote: true }, idle = { nid: 5, weaponRunner: {}, specialCost() { return 180; } };
  const owner = { byNid: new Map([startup, roll, invalid, remote, idle].map(x => [x.nid, x])) };
  assert.deepEqual(JSON.parse(JSON.stringify(pack.call(owner))), {
    1: { token: 7, phase: 'startup', time: .06, dur: .2, dir: [.12, -.79] },
    2: { token: 8, phase: 'roll', time: .12, dur: .3, start: 99, life: 2, tp: 3, startupDur: .1, lockDur: .2, dir: [-1, 0] },
    3: { token: 1, phase: 'roll', time: 0, dur: .2 },
  });
  assert.equal(actions, 4, 'each local actor queried once'); assert.equal(directions, 3, 'only active dualies query direction');
  startup.weaponRunner.dodge = null; roll.netLife++;
  const next = JSON.parse(JSON.stringify(pack.call(owner)));
  assert.equal(next[1], undefined); assert.equal(next[2].life, undefined); assert.equal(next[2].time, .12);
});
