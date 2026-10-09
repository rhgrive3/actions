import {configDependency} from './config-fixture.mjs';
// Actual complete ScreenFX, native Three math/lens state, and composed Game
// pause/quit methods. GPU draw and menu/attract construction are fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {adaptSource} from '../../splatoon3/adapter.mjs';
import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';
import {adaptReliability} from '../../reliability/adapter.mjs';
import {adaptQualitySource,replaceOnce,qualityIdentity} from '../adapter.mjs';
import {adaptScreenfxDamageReset} from '../screenfx-damage-reset-adapter.mjs';
const ROOT=new URL('../../../',import.meta.url),read=rel=>fs.readFileSync(new URL('inkwave-public/'+rel,ROOT),'utf8');
const site=process.env.INKWAVE_SCREENFX_RESET_SITE,minify=process.env.INKWAVE_SCREENFX_RESET_MINIFY==='1';
const transform=minify?(await import(process.env.ESBUILD_MODULE?pathToFileURL(process.env.ESBUILD_MODULE).href:'esbuild')).transformSync:null;
function source(rel,{baseline=false}={}){
 let code=baseline?read(rel):site?fs.readFileSync(path.join(site,rel),'utf8'):adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,read(rel)))));
 return minify?transform(code,{loader:'js',format:'esm',minify:true}).code:code;
}
function klass(ast,name){const list=ast.body.flatMap(n=>n.type==='ExportNamedDeclaration'?[n.declaration]:[n]);return list.find(n=>n?.type==='ClassDeclaration'&&(n.id?.name===name||n.body.body.some(m=>m.key?.name==='quitToMenu')));}
async function fixture({baseline=false}={}){
 const listeners=new Map(),on=(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);return()=>{};},emit=(name,event)=>{for(const fn of listeners.get(name)||[])fn(event);};
 const G={mode:'match',settings:{quality:'low',cameraShake:1},mobile:{touch:false},teamColors:[new THREE.Color('#f80'),new THREE.Color('#08f')],net:null,netm:null,audio:{duck(){}}};
 G.camera=new THREE.PerspectiveCamera(60,1,.1,100);G.camera.updateMatrixWorld();
 const math=Object.create(Math);math.random=()=>.5;
 const context=vm.createContext({console,Math:math,clearTimeout(){}});
 const config=new vm.SourceTextModule(read('src/config.js'),{context});await config.link(spec=>configDependency(spec,context));await config.evaluate();
 const values={G,on,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),damp:(a,b,k,dt)=>a+(b-a)*(1-Math.exp(-k*dt)),lerp:(a,b,t)=>a+(b-a)*t};
 const synthetic=v=>new vm.SyntheticModule(Object.keys(v),function(){for(const [k,x]of Object.entries(v))this.setExport(k,x);},{context});
 const fxCode=source('src/fx/screenfx.js',{baseline}),mod=new vm.SourceTextModule(fxCode,{context});
 await mod.link(spec=>spec==='three'?synthetic(THREE):spec.includes('ShaderPass')?synthetic({ShaderPass:class{constructor(material){this.material=material;}}}):spec.endsWith('ctx.js')?synthetic(values):config);await mod.evaluate();
 const R={renderer:{getDrawingBufferSize:o=>o.set(1280,720)},setExtraPass(pass){this.pass=pass;}},fx=new mod.namespace.ScreenFX(R,G);
 const make=(team,isLocal=false)=>({team,enemyTeam:1-team,isLocal,alive:true,pos:new THREE.Vector3(team?5:0,0,-10),vel:new THREE.Vector3(),anim:{form:'kid'},hp:100,invuln:0,weaponRunner:{}});
 const local=make(0,true),attacker=make(1),m={attract:false,state:'playing',paused:false,local,actors:[local,attacker],time:120,dispose(){for(const a of this.actors)a.disposed=true;this.actors=[];this.local=null;}};
 G.match=m;G.local=local;
 const main=source('src/main.js'),ast=parse(main,{ecmaVersion:'latest',sourceType:'module'}),gameClass=klass(ast,'Game');
 const methods=['_beginMatchFlow','pause','quitToMenu'].map(name=>{const n=gameClass.body.body.find(m=>m.key?.name===name);assert(n,name);return main.slice(n.start,n.end);}).join('\n');
 const binding=ast.body.flatMap(n=>n.type==='ImportDeclaration'?n.specifiers:[]).find(n=>n.imported?.name==='G').local.name;context[binding]=G;
 const Game=vm.runInContext('class Game{'+methods+'};Game',context),game=new Game();
 Object.assign(game,{match:m,_skipRender:true,input:{exitLock(){}},menus:{show(){}},hud:{setVisible(){},hideSplatted(){}},showcase:{hide(){}},_fade:()=>Promise.resolve(),_setPalette(){},_pickPalette(){},_playMusic(){},_startAttract(){this.match.dispose();this.match=G.match={attract:true,state:'playing',local:null,actors:[]};this._matchFlow=null;}});
 fx.update(0,game);
 return{G,fx,game,m,local,attacker,emit,make,damage(a=this.attacker,amount=10){emit('damage',{victim:local,attacker:a,amount,source:'audit'});},tick:dt=>fx.update(dt,game)};
}

test('negative: pending damage -> pause -> menu strands attacker after timer reset in baseline',async()=>{
 const h=await fixture({baseline:true});h.damage();h.game.pause();h.tick(1);assert.equal(h.fx.s.dmgT,.06);await h.game.quitToMenu();h.tick(1/60);assert.equal(h.fx.s.dmgT,0);assert.equal(h.fx.s.dmgAcc,0);assert.equal(h.fx.s.dmgAtk,h.attacker);assert.equal(h.attacker.disposed,true);
});
for(const hz of [30,60,120])test(`#772 ${hz}Hz pause freezes the burst; native quit resets the only attacker reference`,async()=>{
 const h=await fixture();h.damage();h.fx.s.dmgAng=.8;const time=h.fx.time;h.game.pause();for(let i=0;i<hz;i++)h.tick(1/hz);assert.equal(h.fx.time,time);assert.equal(h.fx.s.dmgT,.06);assert.equal(h.fx.s.dmgAtk,h.attacker);
 await h.game.quitToMenu();h.tick(1/hz);assert.equal(h.attacker.disposed,true);assert.equal(h.G.mode,'menu');assert.equal(h.fx.s.dmgT,0);assert.equal(h.fx.s.dmgAcc,0);assert.equal(h.fx.s.dmgAtk,null);assert.equal(h.fx.s.dmgAng,null);for(let i=0;i<hz;i++)h.tick(1/hz);assert.equal(h.fx.s.dmgAtk,null);
});
test('normal 60ms coalescing and current-attacker lens direction remain native',async()=>{
 const snapshots=[];for(const baseline of [true,false]){const h=await fixture({baseline});h.damage(h.attacker,10);h.tick(.03);h.damage(null,8);assert.equal(h.fx.s.dmgAcc,18);assert.equal(h.fx.s.dmgAtk,h.attacker);h.tick(.03);assert.equal(h.fx.s.dmgAtk,null);assert(h.fx.lens.parts.length>0);assert(h.fx.lens.parts[0].x>.5);snapshots.push(Array.from(h.fx.lens.parts,p=>[p.x,p.y,p.r,p.life]));}
 assert.deepEqual(snapshots[0],snapshots[1]);
});
test('intro/reset and results-to-menu clear stale damage without requiring another hit',async()=>{
 for(const path of ['intro','reset','results']){const h=await fixture();h.damage();if(path==='intro')h.emit('match:state',{state:'intro',match:h.m});else if(path==='reset')h.fx.reset();else{h.m.state='results';h.emit('match:state',{state:'results',match:h.m});await h.game.quitToMenu();h.tick(1/60);}assert.equal(h.fx.s.dmgAtk,null,path);assert.equal(h.fx.s.dmgT,0,path);assert.equal(h.fx.s.dmgAng,null,path);}
});
test('repeated reset never replays old bursts and admits a fresh current attacker',async()=>{
 const h=await fixture();for(let i=0;i<30;i++){h.damage();h.fx.reset();h.fx.reset();assert.equal(h.fx.s.dmgAtk,null);assert.equal(h.fx.lens.parts.length,0);}const current=h.make(1);current.pos.x=-5;h.damage(current);h.tick(.061);assert.equal(h.fx.s.dmgAtk,null);assert(h.fx.lens.parts.length>0);assert(h.fx.lens.parts[0].x<.5);
});
test('adapter is identity-bound, rejects drift/reapply, and changes only reset fields',()=>{
 const raw=read('src/fx/screenfx.js'),out=adaptScreenfxDamageReset('src/fx/screenfx.js',raw,replaceOnce);assert.equal(out.replace('dmgT: 0, dmgAng: null, dmgAtk: null });','dmgT: 0 });'),raw);assert(qualityIdentity()['screenfx-damage-reset-adapter.mjs']);for(const code of ['',raw+raw,out])assert.throws(()=>adaptScreenfxDamageReset('src/fx/screenfx.js',code,replaceOnce),/conflict/);assert.equal(adaptScreenfxDamageReset('src/game/match.js','unchanged',replaceOnce),'unchanged');
});


test('isolated forced GC releases the old attacker after reset; baseline retains it', {skip:typeof globalThis.gc!=='function'},async()=>{
 for(const baseline of [true,false]){
  const h=await fixture({baseline}),weak=new WeakRef(h.attacker);h.damage();h.game.pause();await h.game.quitToMenu();h.tick(1/60);h.attacker=null;
  for(let i=0;i<10;i++){await new Promise(resolve=>setImmediate(resolve));globalThis.gc();}
  assert.equal(weak.deref()!==undefined,baseline,baseline?'negative retains via ScreenFX.s.dmgAtk':'reset releases this isolated retainer');assert.equal(h.fx.s.dmgT,0);
 }
});
