import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptQualitySource} from '../adapter.mjs';
import {clearTeamWipes} from '../team-wipeout.mjs';
const root=path.resolve(new URL('../../../',import.meta.url).pathname);
const site=process.env.INKWAVE_BOSS_AUDIO_SITE;
function source(rel){const raw=fs.readFileSync(path.join(site||path.join(root,'inkwave-public'),rel),'utf8');return site?raw:adaptQualitySource(rel,raw);}
function visit(n,fn){if(!n||typeof n!=='object')return;fn(n);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(x=>visit(x,fn));else if(v&&typeof v==='object')visit(v,fn);}
async function fixture(){
 const bus=new Map(),timeouts=new Map(),intervals=new Map(),calls=[];let id=0;
 const G={audio:{play:(...a)=>calls.push(['play',...a]),duck(){},loop:(...a)=>{calls.push(['loop',...a]);return{stop:()=>calls.push(['stop']),set(){}};}},music:{play:(...a)=>calls.push(['music',...a])},scene:{remove(){}}};
 const on=(name,fn)=>{let set=bus.get(name);if(!set)bus.set(name,set=new Set());set.add(fn);return()=>set.delete(fn);};
 const emit=(name,e)=>{for(const fn of bus.get(name)||[])fn(e);};
 const ctx=vm.createContext({performance:{now:()=>10000},console,setTimeout:fn=>{timeouts.set(++id,fn);return id;},clearTimeout:i=>timeouts.delete(i),setInterval:fn=>{intervals.set(++id,fn);return id;},clearInterval:i=>intervals.delete(i)});
 let code=source('src/audio/bossAudio.js'),anchor=null;
 visit(parse(code,{ecmaVersion:'latest',sourceType:'module'}),n=>{if(n.type==='VariableDeclaration')for(const d of n.declarations){const keys=d.init?.type==='ObjectExpression'?d.init.properties.map(p=>p.key.name||p.key.value):[];if(['boss','active','loops','timers'].every(k=>keys.includes(k)))anchor={end:n.end,name:d.id.name};}});
 assert(anchor,'actual audio state object found');
 code=code.slice(0,anchor.end)+`;globalThis.__audioState=${anchor.name};`+code.slice(anchor.end);
 const mod=new vm.SourceTextModule(code,{context:ctx}),dep=new vm.SyntheticModule(['G','on'],function(){this.setExport('G',G);this.setExport('on',on);},{context:ctx});
 await mod.link(()=>dep);await mod.evaluate();mod.namespace.installBossAudio();const listeners=[...bus.values()].reduce((n,s)=>n+s.size,0);mod.namespace.installBossAudio();assert.equal([...bus.values()].reduce((n,s)=>n+s.size,0),listeners);
 const make=()=>{const boss={pos:{x:1,y:2,z:3},model:{largeGraph:true}},m={mode:'boss',state:'playing',attract:false,boss,actors:[],unsubs:[],bossMode:{dispose(){assert.equal(ctx.__audioState.boss,null,'audio graph released before model teardown');}}};return m;};
 const start=m=>{G.match=m;emit('boss:spawn',{boss:m.boss});emit('match:state',{state:'intro',match:m});emit('match:state',{state:'playing',match:m});};
 const stop=m=>{let method;visit(parse(source('src/game/match.js'),{ecmaVersion:'latest',sourceType:'module'}),n=>{if(n.type==='MethodDefinition'&&n.key.name==='dispose')method=n;});assert(method);const src=source('src/game/match.js'),text=src.slice(method.value.body.start,method.value.body.end),globals={G,emit,clearTeamWipes};for(const imp of parse(src,{ecmaVersion:'latest',sourceType:'module'}).body.filter(n=>n.type==='ImportDeclaration'))for(const sp of imp.specifiers){if(sp.imported?.name in globals)globals[sp.local.name]=globals[sp.imported.name];}vm.runInNewContext('(function()'+text+')',globals).call(m);};
 return{G,emit,calls,make,start,stop,timeouts,intervals,state:()=>ctx.__audioState};
}
test('Boss judge/results release audio graph and allow fresh phase/death state on direct rematch',async()=>{
 for(const terminal of ['judge','results']){const f=await fixture(),m=f.make();f.start(m);f.emit('boss:phase',{phase:3,boss:m.boss});f.emit('boss:defeat',{boss:m.boss});assert.equal(f.state().dead,true);f.emit('match:state',{state:terminal,match:m});assert.equal(f.state().boss,null);assert.equal(f.state().active,false);assert.equal(f.timeouts.size,0);assert.equal(f.G.music.remap,null);f.stop(m);
 const next=f.make();f.start(next);assert.equal(f.state().dead,false);assert.equal(f.state().phase,1);assert.equal(f.G.music.remap('battle'),'boss');f.emit('boss:hit',{boss:next.boss,attacker:{isLocal:true}});assert(f.calls.some(c=>c[1]==='boss_hit'));f.stop(next);}
});
test('native Match disposal immediately stops positional loops and timers, without a result screen',async()=>{
 const f=await fixture(),m=f.make();f.start(m);f.emit('boss:move',{id:'sweep',phase:'act',boss:m.boss,dur:3});assert.equal(f.intervals.size,1);assert(f.timeouts.size>0);f.stop(m);assert.equal(f.state().boss,null);assert.equal(f.state().loops.size,0);assert.equal(f.intervals.size,0);assert.equal(f.timeouts.size,0);assert(f.calls.some(c=>c[0]==='stop'));f.stop(m);
 const menu={attract:true,mode:'turf'};f.emit('match:state',{state:'intro',match:menu});const next=f.make();f.start(next);assert.equal(f.state().boss,next.boss);f.stop(next);
});
test('old Boss/Turf disposal cannot retire a newer Boss audio owner',async()=>{
 const f=await fixture(),old=f.make(),next=f.make();f.start(old);f.start(next);f.emit('match:dispose',{match:old});f.emit('match:dispose',{match:{mode:'turf',boss:null}});assert.equal(f.state().boss,next.boss);assert.equal(f.state().active,true);f.stop(next);
});
