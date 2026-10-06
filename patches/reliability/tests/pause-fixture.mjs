// Real composed input/player and extracted production Game/Match methods.
// Fixtures cover display/audio/collision surfaces, not input, actor, or clock logic.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const ROOT=new URL('../../../', import.meta.url).pathname.replace(/\/$/, ''), UP=process.env.INKWAVE_UPSTREAM_SOURCE || ROOT+'/inkwave-public';
const {adaptSource}=await import(ROOT+'/patches/splatoon3/adapter.mjs');
const {adaptTouchLayout}=await import(ROOT+'/patches/touch-layout/adapter.mjs');
const {adaptPause}=await import('../pause-adapter.mjs');
const {fixture}=await import(ROOT+'/patches/splatoon3/tests/source-fixture.mjs');
const {installClock,runSimulation}= await import(ROOT+'/patches/splatoon3/runtime/clock.mjs');
export const hashes={};
// Follow the real dispatcher order, excluding only the adapter under test. This
// also keeps the old negative control available after pause enters production.
const dispatcher=fs.readFileSync(ROOT+'/patches/reliability/adapter.mjs','utf8');
const order=dispatcher.match(/const adapters = \[([^\]]+)\]/)?.[1].split(',').map(s=>s.trim());
assert.ok(order?.length, 'production reliability dispatcher adapter order');
const imports=new Map([...dispatcher.matchAll(/import \{ (\w+) \} from '(\.\/[^']+)';/g)].map(m=>[m[1],m[2]]));
const preceding=[];
for(const name of order){
 assert.ok(imports.has(name),`actual dispatcher import ${name}`);
 const module=await import(new URL(imports.get(name),pathToFileURL(ROOT+'/patches/reliability/adapter.mjs')));
 preceding.push(module[name]);
}
function composed(rel, patched=false){let s=adaptTouchLayout(rel,adaptSource(rel,fs.readFileSync(UP+'/'+rel,'utf8')));for(const adapt of preceding){if(adapt===adaptPause&&!patched)continue;s=adapt(rel,s);}hashes[rel]=crypto.createHash('sha256').update(s).digest('hex');return s;}
function section(s,a,b){const at=s.indexOf(a),end=s.indexOf(b,at);assert.ok(at>=0&&end>at,a);return s.slice(at,end);}
function sources(patched){const main=composed('src/main.js',patched),match=composed('src/game/match.js',patched);
const methods=[section(main,'  pause() {','\n  async quitToMenu() {'),section(main,'  _padMenus() {','\n  _updateHud(dt) {'),section(main,'  _onKey(e, repeat) {','\n  _onPointerUnlock() {')].join('\n');return {main,match,methods};}
export async function boot(patched=true,{transform=(_rel,source)=>source}={}){
 const {match,methods}=sources(patched);
 const f=await fixture(), modules=new Map(),listeners=new Map();let pads=[];
 const cls=()=>({add(){},remove(){},toggle(){}});
 const context=vm.createContext({console,performance,AbortController,setTimeout,clearTimeout,screen:{width:1000,height:700,orientation:{angle:0}},innerWidth:1000,innerHeight:700,
 localStorage:{getItem:()=>null},navigator:{userAgent:'resume probe',maxTouchPoints:0,getGamepads:()=>pads},window:{addEventListener(n,fn){listeners.set(n,[...(listeners.get(n)||[]),fn]);}},document:{documentElement:{classList:cls()},addEventListener(){},pointerLockElement:null}});
 function synthetic(id,v){return new vm.SyntheticModule(Object.keys(v),function(){for(const[n,x]of Object.entries(v))this.setExport(n,x);},{context,identifier:id});}
 function load(file){if(modules.has(file))return modules.get(file);const rel=path.relative(UP,file);let m;
 if(['src/core/ctx.js','src/config.js','src/game/physics.js'].includes(rel))m=synthetic(file,f);
 else if(file==='three')m=synthetic(file,{...f.THREE});
 else m=new vm.SourceTextModule(transform(rel,file.startsWith(UP+'/')?composed(rel,patched):fs.readFileSync(file,'utf8')),{context,identifier:file});modules.set(file,m);return m;}
 const entry=new vm.SourceTextModule("export { Input } from './src/core/input.js'; export { PlayerController } from './src/game/player.js';",{context,identifier:UP+'/resume-entry.js'});
 await entry.link((s,from)=>load(s==='three'?s:path.resolve(path.dirname(from.identifier),s)));await entry.evaluate();
 const input=new entry.namespace.Input({}),a=f.make('shooter'),rig={yaw:0,pitch:0,mode:'follow',target:a};
 const controller=new entry.namespace.PlayerController(a,rig,input);controller.computeAim=()=>{};
 f.G.settings={aimAssist:0};f.G.rig=rig;f.G.actors=[a];f.G.time=0;f.G.mode='match';f.G.netm=null;
 f.G.projectiles.update=()=>{};const updates=[], ownedShots=[];
 const shoot=f.G.projectiles.fireShooter;
 f.G.projectiles.fireShooter=(actor,...args)=>{ownedShots.push(actor);shoot(actor,...args);};
 const actualMatch=vm.runInNewContext(`class Match {${section(match,'  update(dt) {','\n  _judge() {')}}; Match`,{...f,G:f.G});
 const other=f.make('shooter');other.pos.x=10;
 const m={time:180,duration:180,stateT:0,attract:false,state:'playing',paused:false,local:a,controller,actors:[a,other],
   playing:actualMatch.prototype.playing || (()=>m.state==='playing'&&!m.paused),
   updateController:actualMatch.prototype.updateController,update(dt){actualMatch.prototype.update.call(this,dt);updates.push({fire:a.intent.fire,jump:a.intent.jump,move:a.intent.move.length()});}};
 f.G.match=m;f.G.actors=m.actors;
 const Game=vm.runInNewContext(`class Game {${methods}}; Game`,{G:f.G,console});const game=new Game();
 Object.assign(game,{input,rig,match:m,_audioOn:true});
 const menusSource=composed('src/ui/menus.js',patched);
 const menusMethods=[section(menusSource,'  nav(dir) {','\n  /** main.js:'),section(menusSource,'  _nav(dir) {','\n  /** Keyboard / pad'),section(menusSource,'  _back() {','\n  _titleGo() {'),section(menusSource,'  _resume() {','\n  /** Live match snapshot')].join('\n');
 const Menus=vm.runInNewContext(`class Menus {${menusMethods}}; Menus`,{performance,document:{activeElement:null},safeCall:fn=>fn()});
 const menus=game.menus=new Menus(), focus={isConnected:true}, navCalls=[];
 Object.assign(menus,{current:null,_stack:[],_shownAt:-10000,_focus:focus,_binds:new Map([[focus,{accept:()=>menus._resume()}]]),api:{resumeMatch:()=>game.resume()},
   _scr:{},_sfx(){},_press(){},_spatial(){return null;},_bump(){},setInputMode(){},handleKey(){return false;},
   show(s,opts={}){this.current=s;this._shownAt=-10000;if(opts.pop)this._stack.pop();else if(opts.push)this._stack.push(s);else this._stack=s?[s]:[];this._scr=s==='pause'?{onBack:()=>this._resume()}:{};}});
 const actualNav=menus.nav;menus.nav=function(d){navCalls.push(d);return actualNav.call(this,d);};
 input.onKey=(e,r)=>game._onKey(e,r);installClock({G:f.G});
 return {...f,other,actor:a,ownedShots,input,rig,game,m,menus,navCalls,updates,controller,setPads(p){pads=p;},event(n,e){for(const fn of listeners.get(n)||[])fn(e);},frame(dt){runSimulation(game,dt);}};
}

export const pad=(buttons=[])=>[{connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},(_,i)=>({pressed:buttons.includes(i),value:buttons.includes(i)?1:0}))}];
export const STEP=1/60;
export {composed};
