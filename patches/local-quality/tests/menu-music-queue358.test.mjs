import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {idleFixture,audioFixture} from './idle-fixture.mjs';
const read=rel=>fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');
const method=(s,start)=>{const a=s.indexOf(start),b=s.indexOf('\n  }\n',a);assert.ok(a>=0&&b>a);return s.slice(a,b+5);};
test('actual menu loading tick keeps nonfinite behavior and live cursor/screen callbacks while skipping settled exp',()=>{
 const raw=read('src/ui/menus.js'),next=adaptBuildSource('src/ui/menus.js',raw),methods=[raw,next].map(s=>method(s,'  _tick(dt) {'));
 const make=(source,shown,target)=>{let exps=0;const math=Object.create(Math);math.exp=x=>{exps++;return Math.exp(x);};const fn=vm.runInNewContext('({'+source+'})._tick',{Math:math});const calls=[],owner={timeScale:1,wipe:{},_loading:{shown,target},_frozen:()=>false,_updateCursor:dt=>calls.push(['cursor',dt]),_scr:{tick:dt=>calls.push(['screen',dt])}};return{owner,calls,run:dt=>fn.call(owner,dt),exps:()=>exps};};
 for(const hz of [30,60,120]){const a=make(methods[0],0,0),b=make(methods[1],0,0);for(let i=0;i<hz*5;i++){if(i===hz)a.owner._loading.target=b.owner._loading.target=.7;if(i===hz*3)a.owner._loading.target=b.owner._loading.target=1;a.run(1/hz);b.run(1/hz);assert.ok(Object.is(a.owner._loading.shown,b.owner._loading.shown));}assert.deepEqual(b.calls,a.calls);assert.ok(b.exps()<a.exps());}
 for(const shown of [0,-0,1,Infinity,-Infinity,NaN])for(const target of [0,-0,1,Infinity,-Infinity,NaN])for(const dt of [0,1/60,NaN,Infinity,-Infinity]){const a=make(methods[0],shown,target),b=make(methods[1],shown,target);a.run(dt);b.run(dt);assert.ok(Object.is(a.owner._loading.shown,b.owner._loading.shown));assert.deepEqual(b.calls,a.calls);}
});
test('recorded browser battle skips score compilation; explicit diagnostics and offline Player still compile',async()=>{
 const f=audioFixture();
 class Audio{addEventListener(){}removeEventListener(){}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}removeAttribute(){}load(){}}
 const code=adaptBuildSource('src/audio/music.js',read('src/audio/music.js'))+'\nexport const compiledForTest=id=>compiled.has(id);';
 const transform=(rel,s)=>rel==='src/audio/music.js'?code:s;
 const api=await idleFixture({globals:{...f.globals,Audio,window:{}},transform}),m=new api.MusicEngine();
 m._init(f.ctx,{});assert.equal(api.compiledForTest('battle'),false);m.play('battle');assert.equal(api.compiledForTest('battle'),false);assert.equal(m.current.id,'battle');assert.ok(m.current.element);assert.equal(m.dlyIn,null);m.dispose();
 const song=api.getSong('battle');assert.equal(api.compiledForTest('battle'),true);assert.ok(song.bars.length);
 const g=audioFixture(),offline=await idleFixture({globals:g.globals,transform}),p=new offline.MusicEngine();p._init(g.ctx,{}, {offline:true});assert.equal(offline.compiledForTest('battle'),false);p.play('battle',{seed:5});assert.equal(offline.compiledForTest('battle'),true);assert.equal(p.players.length,1);assert.ok(!p.current.element);p.dispose();
});
test('audio position admission keeps accessor read order and invalid-value outcomes without a triple array',()=>{
 const source=fs.readFileSync(new URL('../../splatoon3/runtime/audio/runtime.mjs',import.meta.url),'utf8'),body=source.match(/const finite3=(.*);\n/)[1],next=new Function('return ('+body+');')();
 const old=p=>!!p&&[p.x,p.y,p.z].every(Number.isFinite);
 for(const values of [[1,2,3],[NaN,1,2],[Infinity,2,3],[0,-0,1],[undefined,1,2]]){const run=fn=>{const reads=[],p={};for(let i=0;i<3;i++)Object.defineProperty(p,'xyz'[i],{get(){reads.push(i);return values[i];}});return {valid:fn(p),reads};};assert.deepEqual(run(next),run(old));}
 for(const value of [null,undefined,0,false,'',true,{},[]])assert.equal(next(value),old(value));
});
