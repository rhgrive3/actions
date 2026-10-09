import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { fixture } from './source-fixture.mjs';
const raw=rel=>fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');
const source=rel=>adaptSource(rel,raw(rel));
test('#523 fresh and partial saved settings default to no corner map; explicit custom opt-in survives',async()=>{
 const {DEFAULT_SETTINGS}=await fixture();assert.equal(DEFAULT_SETTINGS.minimap,false);
 const native=raw('src/main.js').match(/^function loadJSON\(key, def\).*$/m)[0];let saved=null;
 const load=vm.runInNewContext(native+';loadJSON',{localStorage:{getItem:()=>saved}});
 for(const s of [null,'{}','{"quality":"low"}','invalid','null']){saved=s;assert.equal(load('inkwave.settings',DEFAULT_SETTINGS).minimap,false);}
 saved='{"minimap":true}';assert.equal(load('inkwave.settings',DEFAULT_SETTINGS).minimap,true);
 saved='{"minimap":false}';assert.equal(load('inkwave.settings',DEFAULT_SETTINGS).minimap,false);
 assert.match(raw('src/main.js'),/loadJSON\('inkwave.settings', DEFAULT_SETTINGS\)/);
});
test('#523 settings label and both languages identify the non-baseline opt-in',()=>{
 assert.match(source('src/ui/menus.js'),/key: 'minimap', label: 'Corner map \(non-S3 aid\)'/);
 assert.match(source('src/ui/menus.js'),/full Turf Map remains available/);
 assert.match(source('src/i18n.js'),/画面端マップ（本家外の補助）/);
 assert.match(source('src/i18n.js'),/全体マップは引き続き使用できます/);
});
test('#523 all three connections reject missing or duplicate anchors',()=>{
 for(const [rel,anchor] of [['src/config.js','  minimap: true,'],['src/ui/menus.js',"{ key: 'minimap', label: 'Minimap'"],['src/i18n.js',"  'Minimap': 'ミニマップ',"]]){
  assert.throws(()=>adaptSource(rel,raw(rel).replace(anchor,'MISSING')));assert.throws(()=>adaptSource(rel,raw(rel)+raw(rel)));
 }
});
test('#523 emitted config preserves opt-in policy',{skip:!process.env.INKWAVE_MAP_POLICY_SITE},async()=>{
 // The unminified native config retains the real inkFlight import; do not
 // require the dependency-free shape that tree shaking happened to produce.
 const path=await import('node:path'),mods=new Map(),context=vm.createContext({console,URL});
 const load=file=>{if(mods.has(file))return mods.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file,initializeImportMeta(meta){meta.url=pathToFileURL(file).href;}});mods.set(file,m);return m;};
 const file=path.resolve(process.env.INKWAVE_MAP_POLICY_SITE,'src/config.js'),m=load(file);
 await m.link((spec,from)=>{assert.ok(spec.startsWith('.'),'only native relative config imports');return load(path.resolve(path.dirname(from.identifier),spec));});
 await m.evaluate();assert.equal(m.namespace.DEFAULT_SETTINGS.minimap,false);
});

function method(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);}
async function setup(){const f=await fixture(),G=f.G;G.teamHex=['orange','blue'];G.camera=new f.THREE.PerspectiveCamera(70,1,0.1,200);G.camera.position.set(0,8,20);G.camera.lookAt(0,0,0);G.camera.updateMatrixWorld();
 const actors=Array.from({length:8},(_,i)=>{const a=f.make(i%2?'dualies':'shooter');a.team=i<4?0:1;a.name='P'+i;a.isLocal=i===0;a.pos.set(i,0,0);a.anim={form:'idle'};a.yaw=0;return a;});
 const teamCode=raw('src/game/match.js'),teamMethod=method(teamCode,'  teamSummary()', '\n}');
 const Match=vm.runInNewContext(`class Match {${teamMethod}};Match`,{G,Math});const m=Object.assign(new Match(),{actors,local:actors[0],time:100,duration:180,state:'playing',controller:{onTarget:false,inRange:true}});
 const gameCode=raw('src/main.js'),gameMethod=method(gameCode,'  _updateHud(dt) {','\n  // ---------------------------------------------------------------------------------------- touch / gyro');
 const Game=vm.runInNewContext(`class Game {${gameMethod}};Game`,{G,THREE:f.THREE,PLAYER:f.PLAYER,SUB:f.SUB,innerWidth:800,innerHeight:600,Math,t:x=>x});let latest,mobile;
 const game=Object.assign(new Game(),{match:m,settings:{...f.DEFAULT_SETTINGS,showFps:false},fps:60,_hintT:0,_hints:{shot:true},_lowInkFlash:0,minimap:{canvas:{id:'map'},w:100,h:100,flip:false,update(){},tickHidden(){},toCanvas(x,z,out){out.x=x+50;out.y=z+50;}},hud:{update(_dt,frame){latest=frame;}},input:{mobile:{setHud(frame){mobile=frame;}}}});
 return {...f,m,actors,game,step(){game._updateHud(1/60);return {frame:latest,mobile};}};
}

test('#523 actual Game HUD uses hidden-map path by default and explicit true restores corner information',async()=>{
 const f=await setup();let shown=0,hidden=0;f.game.minimap.update=()=>shown++;f.game.minimap.tickHidden=()=>hidden++;
 for(let i=0;i<120;i++){const {frame}=f.step();assert.equal(frame.map,null);}
 assert.equal(shown,0);assert.equal(hidden,120);
 f.game.settings.minimap=true;const {frame}=f.step();assert.equal(frame.map.canvas,f.game.minimap.canvas);assert.equal(shown,1);assert.equal(hidden,120);
 f.game.settings.minimap=false;assert.equal(f.step().frame.map,null);assert.equal(hidden,121);
});
test('#523 emitted Game/Match use emitted defaults for the live HUD transport',{skip:!process.env.INKWAVE_MAP_POLICY_SITE},async()=>{
 const path=await import('node:path'),site=path.resolve(process.env.INKWAVE_MAP_POLICY_SITE),mods=new Map(),context=vm.createContext({console,performance,URL,URLSearchParams,location:{search:''},innerWidth:800,innerHeight:600});
 function load(file){if(mods.has(file))return mods.get(file);let code=fs.readFileSync(file,'utf8');if(file===path.join(site,'src/main.js')){const boot=/const\s+([\w$]+)\s*=\s*new\s+([\w$]+)(?:\(\))?\s*;\s*\1\.boot\(\)\.catch\([\s\S]*$/,hit=code.match(boot);assert.ok(hit,'production bootstrap export');code=code.replace(boot,`export { ${hit[2]} as Game };`);}const m=new vm.SourceTextModule(code,{context,identifier:file,initializeImportMeta(meta){meta.url=pathToFileURL(file).href;}});mods.set(file,m);return m;}
 const main=load(path.join(site,'src/main.js'));await main.link((s,m)=>load(s==='three'?path.join(site,'vendor/three/build/three.module.js'):s.startsWith('three/addons/')?path.join(site,'vendor/three/jsm',s.slice('three/addons/'.length)):path.resolve(path.dirname(m.identifier),s)));await main.evaluate();
 const f=await setup(),G=mods.get(path.join(site,'src/core/ctx.js')).namespace.G,defaults=mods.get(path.join(site,'src/config.js')).namespace.DEFAULT_SETTINGS;G.camera=f.G.camera;G.teamHex=f.G.teamHex;f.m.teamSummary=mods.get(path.join(site,'src/game/match.js')).namespace.Match.prototype.teamSummary;f.game._updateHud=main.namespace.Game.prototype._updateHud;f.game.settings={...defaults};let shown=0,hidden=0;f.game.minimap.update=()=>shown++;f.game.minimap.tickHidden=()=>hidden++;
 assert.equal(defaults.minimap,false);for(let i=0;i<120;i++)assert.equal(f.step().frame.map,null);assert.equal(shown,0);assert.equal(hidden,120);f.game.settings.minimap=true;assert.equal(f.step().frame.map.canvas,f.game.minimap.canvas);assert.equal(shown,1);
});
