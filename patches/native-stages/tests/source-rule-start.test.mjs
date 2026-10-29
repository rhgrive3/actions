import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {nativeStageRuleStatus} from '../runtime/rule-availability.mjs';
import {isRankedMode} from '../../splatoon3/runtime/ranked/engine.mjs';
const code=rel=>adaptBuildSource(rel,fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8'));
const section=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i,a);return s.slice(i,j);};
const context=()=>{
 const timers={nextId:1,pending:new Map(),cancelled:[],flush(){for(const [id,task]of [...this.pending])if(this.pending.delete(id))task.callback(...task.args);}};
 return vm.createContext({nativeStageEnabled:true,nativeStageRuleStatus,isRankedMode,UNAVAILABLE_NATIVE_STAGES:[],
  setTimeout(callback,delay,...args){const id=timers.nextId++;timers.pending.set(id,{callback,delay,args});return id;},
  clearTimeout(id){timers.cancelled.push(id);timers.pending.delete(id);},timers});
};
function observeResultsTimer(sandbox,game){
 const fired=[];
 const retired=game._resultsMusicTimer=sandbox.setTimeout(()=>fired.push('retired results music'),2600);
 const survivor=sandbox.setTimeout(()=>fired.push('unrelated timer'),2600);
 assert.notEqual(retired,survivor);
 return()=>{
  assert.equal(game._resultsMusicTimer,null,'actual startup clears its timer owner');
  assert.ok(sandbox.timers.cancelled.includes(retired),'actual startup invokes cancellation for its exact timer ID');
  assert.equal(sandbox.timers.pending.has(retired),false,'retired callback is removed from the queue');
  assert.equal(sandbox.timers.pending.has(survivor),true,'unrelated pending timer is retained');
  sandbox.timers.flush();assert.deepEqual(fired,['unrelated timer'],'cancelled results callback never fires');
 };
}

const main=code('src/main.js'),session=code('src/net/session.js'),menus=code('src/ui/menus.js');
test('offline and public API unsupported rule guards preserve the current match before creating a flow',async()=>{
 const methods=section(main,'  _beginMatchFlow() {','\n  // ---- online (src/net/session.js');const sandbox=context(),Game=vm.runInContext(`class Game {${methods}};Game`,sandbox);
 const game=new Game(),assertTimerRetired=observeResultsTimer(sandbox,game),calls=[],match={dispose(){throw Error('Disposed current match');}},world={id:'live'};
 Object.assign(game,{mapDef:{id:'tidewater'},world,match,menus:{toast:m=>calls.push(m)}});
 assert.equal(await game.startMatch({mapId:'hagglefish',mode:'tower'}),false);assertTimerRetired();assert.equal(await game._startMenuMatch({mapId:'hagglefish',mode:'tower'}),false);
 assert.equal(game._matchFlow,undefined);assert.equal(game.world,world);assert.equal(game.match,match);assert.equal(calls.length,2);assert(calls.every(m=>m.includes('ガチヤグラ')));
});
test('online direct startup rejects before disposing current state',async()=>{
 const method=section(main,'  async startNetMatch(cfg, nm) {','\n  // Compile every shader variant');const sandbox=context(),Game=vm.runInContext(`class Game {${method}};Game`,sandbox),game=new Game(),assertTimerRetired=observeResultsTimer(sandbox,game);
 game.match={dispose(){throw Error('Disposed live online match');}};await assert.rejects(game.startNetMatch({map:'hagglefish',mode:'tower'},{}),e=>e.name==='RangeError'&&e.message.includes('ガチヤグラ'));assertTimerRetired();assert.equal(game._matchFlow,undefined);
});
test('online host and incoming start reject without transport close, broadcast or match replacement',async()=>{
 const methods=[section(session,'  canStart() {','\n  emote(name) {'),section(session,'  start() {','\n  _markReady(id) {')].join('\n');const Net=vm.runInContext(`class Net {${methods}};Net`,context()),net=new Net(),events=[];
 const match={dispose(){throw Error('Disposed live match');}};Object.assign(net,{isHost:true,state:'lobby',lobby:{map:'hagglefish',mode:'tower',bots:true,players:[{id:'host',ready:true},{id:'guest',ready:true}]},match,tr:{close(){throw Error('Closed existing transport');},lock(){throw Error('Locked room');},broadcast(){throw Error('Broadcast unsupported rule');}},_emit:(kind,event)=>events.push({kind,...event})});
 assert.match(net.startBlock(),/ガチヤグラ/);assert.equal(net.canStart(),false);assert.equal(net.start(),false);assert.equal(await net._begin({map:'hagglefish',mode:'tower'}),false);
 assert.equal(net.match,match);assert.equal(net.state,'lobby');assert.equal(net._startCfg,undefined);assert.equal(events.length,1);assert.equal(events[0].kind,'error');
});
test('menu explains unsupported rule before permission requests or transition',()=>{
 const method=section(menus,'  _startMatch() {','\n  /** Put a live 3D portrait');const Menu=vm.runInContext(`class Menu {${method}};Menu`,context()),menu=new Menu(),calls=[];
 Object.assign(menu,{_setup:{mapId:'hagglefish',mode:'tower'},toast:m=>calls.push(m)});menu._startMatch();assert.equal(menu._starting,undefined);assert.equal(calls.length,1);assert.match(calls[0],/ガチヤグラ/);
});
