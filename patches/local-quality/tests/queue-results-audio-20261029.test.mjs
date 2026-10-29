import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const source=adaptBuildSource('src/main.js',fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8'));
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),methods=new Map();
function walk(n){if(!n||typeof n!=='object')return;if(n.type==='MethodDefinition'&&['_judge','_playMusic','startMatch','startNetMatch','netMatchEnd','quitToMenu'].includes(n.key.name)){assert(!methods.has(n.key.name));methods.set(n.key.name,source.slice(n.start,n.end));}for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}
walk(ast);assert.equal(methods.size,6);
function fixture(won=true){
 let time=0,serial=0;const timers=new Map(),calls=[];
 const clock={setTimeout(fn,delay){const id=++serial;timers.set(id,{fn,at:time+delay});return id;},clearTimeout(id){timers.delete(id);},advance(ms){time+=ms;for(const [id,item] of [...timers])if(item.at<=time){timers.delete(id);item.fn();}}};
 const G={netm:null,net:undefined,teamHex:['a','b'],teamColors:['a','b'],music:{play:(...args)=>calls.push(['music',...args])},audio:{play:(...args)=>calls.push(['cue',...args]),init(){}}};
 const globals={G,...clock,TEAM_NAMES:['a','b'],WEAPONS:[],PROGRESSION:{xpForLevel:()=>100},normalizeQueueProfile(){},turfExperience:()=>({total:0}),settleProgression(){},saveJSON(){},nativeStageEnabled:false,UNAVAILABLE_NATIVE_STAGES:[],isRankedMode:()=>false,validStartRoster:()=>true};
 const Game=vm.runInNewContext('class Game {'+[...methods.values()].join('\n')+'};Game',globals);
 const game=new Game();Object.assign(game,{profile:{level:1,xp:0,matches:0,wins:0,totalTurf:0},palette:{names:['a','b']},mapDef:{name:'fixture',id:'fixture'},settings:{difficulty:'normal'},input:{exitLock(){}},rig:{overview(){}},hud:{hideSplatted(){},setVisible(){},judge:()=>Promise.resolve()},showcase:{showResults(){}},menus:{current:null,showResults(){},show(name){this.current=name;}}});
 const match={state:'judge',local:{team:0,stats:{turf:100}},result:{coverage:[.6,.4],winner:won?0:1,mode:'turf'},actors:[],setState(state){this.state=state;}};game.match=match;
 game._beginMatchFlow=()=>game._matchFlow={match:game.match,net:G.net,current:()=>false,captureRoom(){}};
 return {game,match,G,clock,calls,timers};
}
for(const hz of [30,60,120])for(const won of [false,true])test('actual composed judge owns one 2600ms result cue at '+hz+'Hz won='+won,async()=>{
 const f=fixture(won);await f.game._judge();assert.equal(f.match.state,'results');assert.equal(f.game.menus.current,'results');assert.equal(f.timers.size,1);
 assert.equal(f.calls.filter(x=>x[0]==='cue').length,1);
 for(let t=0;t<2500;t+=1000/hz)f.clock.advance(1000/hz);
 assert.equal(f.calls.filter(x=>x[0]==='music').length,0);f.clock.advance(200);
 assert.equal(f.timers.size,0);assert.equal(f.game._resultsMusicTimer,null);assert.equal(f.calls.filter(x=>x[0]==='music').length,1);
 assert.equal(f.calls.at(-1)[1],won?'results_win':'results_lose');f.clock.advance(20000);assert.equal(f.calls.filter(x=>x[0]==='music').length,1);
});
test('old callback cannot replace a newer result generation or different music owner',async()=>{
 const f=fixture();await f.game._judge();const old=f.timers.get(f.game._resultsMusicTimer).fn;
 f.match.state='judge';await f.game._judge();const current=f.game._resultsMusicTimer;assert.equal(f.timers.size,1);old();assert.equal(f.game._resultsMusicTimer,current);assert.equal(f.calls.filter(x=>x[0]==='music').length,0);
 f.game._playMusic('menu',.4);assert.equal(f.timers.size,0);old();f.clock.advance(5000);assert.deepEqual(f.calls.filter(x=>x[0]==='music').map(x=>x[1]),['menu']);
});
for(const change of ['match','net','netm','room','flow','menu','epoch','state'])test('result callback retains its existing '+change+' fence',async()=>{
 const f=fixture();f.G.net={tr:{}};await f.game._judge();
 if(change==='match')f.game.match={};if(change==='net')f.G.net={tr:{}};if(change==='netm')f.G.netm={};if(change==='room')f.G.net.tr={};if(change==='flow')f.game._matchFlow={};if(change==='menu')f.game.menus.current='main';if(change==='epoch')f.game._s3JudgeEpoch++;if(change==='state')f.match.state='playing';
 f.clock.advance(3000);assert.equal(f.calls.filter(x=>x[0]==='music').length,0);assert.equal(f.game._resultsMusicTimer,null);
});
for(const route of ['startMatch','startNetMatch','netMatchEnd','quitToMenu'])test(route+' cancels result timer before any superseded transition can resume',async()=>{
 const f=fixture();await f.game._judge();const old=f.timers.get(f.game._resultsMusicTimer).fn;
 const nm={};f.G.net={state:route==='quitToMenu'?'offline':'room',tr:{},match:nm};
 if(route==='startNetMatch')await f.game.startNetMatch({map:'fixture',mode:'turf',roster:[]},nm);
 else await f.game[route]();
 assert.equal(f.game._resultsMusicTimer,null);assert.equal(f.timers.size,0);old();f.clock.advance(5000);assert.equal(f.calls.filter(x=>x[0]==='music').length,0);
});
