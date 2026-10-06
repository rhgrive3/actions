import {turfExperience} from '../../splatoon3/runtime/results-scoring.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptSource} from '../../splatoon3/adapter.mjs';import {adaptReliability} from '../../reliability/adapter.mjs';import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';import {adaptQualitySource} from '../adapter.mjs';
import {restoreOfflineResultShowcase as nativeRestore} from '../result-continuation.mjs';
import {pathToFileURL} from 'node:url';
const root=path.resolve(new URL('../../../',import.meta.url).pathname),site=process.env.INKWAVE_WINNER_PODIUM_SITE;
const restoreOfflineResultShowcase=site?(await import(pathToFileURL(path.join(site,'patches/local-quality/result-continuation.mjs')).href)).restoreOfflineResultShowcase:nativeRestore;
const raw=fs.readFileSync(path.join(site||path.join(root,'inkwave-public'),'src/main.js'),'utf8');
const code=site?raw:adaptQualitySource('src/main.js',adaptReliability('src/main.js',adaptTouchLayout('src/main.js',adaptSource('src/main.js',raw))));
const ast=parse(code,{ecmaVersion:'latest',sourceType:'module'}),cls=ast.body.find(n=>n.type==='ClassDeclaration'&&n.body.body.some(m=>m.key?.name==='_judge')),method=cls.body.body.find(m=>m.key.name==='_judge');
const cfg=fs.readFileSync(path.join(root,'inkwave-public/src/config.js'),'utf8'),a=cfg.indexOf('export const PROGRESSION = {'),b=cfg.indexOf('\n};',a);
const PROGRESSION=vm.runInNewContext(cfg.slice(a,b+3).replace('export const PROGRESSION =','(').replace(/;$/,'')+ ')');
async function run({team=0,winner=1,online=false,swap=false}={}){
 const calls=[],timers=[],G={teamHex:['#f80','#05f'],teamColors:['orange','blue'],audio:{play:n=>calls.push(['audio',n])},netm:online?{}:null,net:online?{isHost:false,tr:{}}:null};
 const values={G,PROGRESSION,turfExperience,TEAM_NAMES:['A','B'],saveJSON:(key,p)=>calls.push(['saved',key,{...p}]),setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;}};
 for(const imp of ast.body.filter(n=>n.type==='ImportDeclaration'))for(const sp of imp.specifiers)if(sp.imported?.name in values)values[sp.local.name]=values[sp.imported.name];
 const saveFn=ast.body.find(n=>n.type==='FunctionDeclaration'&&code.slice(n.start,n.end).includes('localStorage.setItem'));
 if(saveFn){values.localStorage={setItem:(key,value)=>calls.push(['saved',key,JSON.parse(value)])};values[saveFn.id.name]=vm.runInNewContext('('+code.slice(saveFn.start,saveFn.end)+')',values);}
 const judge=vm.runInNewContext('({'+code.slice(method.start,method.end)+'})._judge',values);
 const actors=Array.from({length:8},(_,i)=>({team:i>>2,slot:i,name:'P'+i,weaponId:i%2?'charger':'shooter',isLocal:i===team*4,character:{style:{skin:i%4}},stats:{turf:100,splats:2,deaths:1}}));
 const match={mode:'turf',state:'judge',local:actors[team*4],actors,result:{winner,coverage:[.6,.4]},setState(s){this.state=s;}};
 const game={match,profile:{xp:0,level:1,matches:0,wins:0,totalTurf:0},palette:{names:['A','B']},mapDef:{name:'stage'},rig:{overview(){}},hud:{hideSplatted(){},setVisible(){},judge:async()=>{if(swap)game.match={};}},showcase:{showResults(...a){calls.push(['podium',...a]);}},menus:{current:'results',showResults:data=>calls.push(['results',data]),show(){}},_playMusic:n=>calls.push(['music',n])};
 await judge.call(game);for(const t of timers)if(t.ms===2600)t.fn();return{calls,game,G};
}
test('#565 actual judge selects the authoritative winning team for both local sides and online followers',async()=>{
 for(const online of [false,true])for(const team of [0,1])for(const winner of [0,1]){
  const {calls,game}=await run({team,winner,online}),p=calls.find(c=>c[0]==='podium'),result=calls.find(c=>c[0]==='results')[1],won=team===winner;
  assert.equal(p[1],winner);assert.equal(p[2],true);assert.equal(p[3],winner?'blue':'orange');assert.deepEqual(Array.from(p[4],a=>a.name),Array.from({length:4},(_,i)=>'P'+(winner*4+i)));
  assert.equal(result.win,won);assert.equal(result.online,online?true:undefined);assert.equal(result.players.length,8);assert.equal(result.players.find(p=>p.isSelf).team,team);
  assert.equal(game.profile.wins,won?1:0);assert.equal(game.profile.matches,1);assert.equal(result.xp.gained,300+100+(won?600:0));
  assert(calls.some(c=>c[0]==='audio'&&c[1]===(won?'victory_fanfare':'defeat_jingle')));assert(calls.some(c=>c[0]==='music'&&c[1]===(won?'results_win':'results_lose')));
 }
});
test('#565 cancelled judge cannot publish podium, rewards or results from the old match',async()=>{const r=await run({swap:true});assert.equal(r.calls.length,0);assert.equal(r.game.profile.matches,0);});
test('#565 offline Back from gear restores winners without changing local saved progression',async()=>{
 const r=await run({team:0,winner:1});const before=JSON.stringify(r.game.profile);r.game.showcase.mode='loadout';restoreOfflineResultShowcase(r.game,r.G,'results');const p=r.calls.filter(c=>c[0]==='podium').at(-1);assert.equal(p[1],1);assert.equal(p[2],true);assert.equal(p[4].length,4);assert(p[4].every(a=>Number(a.name.slice(1))>=4));assert.equal(JSON.stringify(r.game.profile),before);
});
