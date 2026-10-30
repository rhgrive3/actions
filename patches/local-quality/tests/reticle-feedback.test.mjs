// Actual composed/emitted HUD methods; DOM/Animation doubles only. Browser acceptance is separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {applyShotGuide} from '../../splatoon3/runtime/weapons-fidelity.mjs';
import {updateSplatlingStages} from '../splatling-reticle.mjs';
import {selectedSub,selectedSubCost} from '../../splatoon3/runtime/kit-composition.mjs';
const root=new URL('../../../',import.meta.url),site=process.env.INKWAVE_RETICLE_SITE;
const read=rel=>site?fs.readFileSync(path.join(site,rel),'utf8'):adaptBuildSource(rel,fs.readFileSync(new URL('inkwave-public/'+rel,root),'utf8'));
const source=read('src/ui/hud.js'),ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
const cls=ast.body.map(n=>n.declaration||n).find(n=>n.type==='ClassDeclaration'&&n.body.body.some(m=>m.key?.name==='hitMarker'));
assert(cls,'actual HUD class including minified production output');
class El {
 constructor(n=0){this.children=Array.from({length:n},()=>new El());this.names=new Set();this.animations=[];this.style={setProperty(k,v){this[k]=v;},getPropertyValue(k){return this[k]||'';}};
 this.classList={add:(...ns)=>ns.forEach(n=>this.names.add(n)),remove:(...ns)=>ns.forEach(n=>this.names.delete(n)),toggle:(n,on)=>on?this.names.add(n):this.names.delete(n),contains:n=>this.names.has(n)};}
 set className(v){this.names=new Set(v.split(' '));} get className(){return [...this.names].join(' ');}
 set innerHTML(v){this.html=v;} get innerHTML(){return this.html;}
 querySelector(){return new El();} remove(){} insertAdjacentHTML(){} contains(){return true;} setAttribute(k,v){this[k]=v;}
 removeAttribute(k){delete this[k];}
 animate(frames,options){const a={frames,options,currentTime:0,playState:'running',plays:1,cancel(){this.playState='idle';this.currentTime=null;},play(){this.playState='running';this.plays++;}};this.animations.push(a);return a;}
}
function fixture(){
 const handlers=new Map(),local={alive:true,form:'kid',invuln:0,weaponRunner:{},weapon:{kind:'shooter'}},G={match:{local},camera:null};
 const weapons=Object.fromEntries(['shooter','blaster','slosher','roller','dualies','charger','splatling'].map(kind=>[kind,{kind,chargeTime:1,special:'slam'}]));
 const values={G,WEAPONS:weapons,SUB:{bomb:{inkCost:70}},PLAYER:{respawnTime:5},MATCH:{},clamp:(x,a=0,b=1)=>Math.min(b,Math.max(a,x)),innerWidth:1280,innerHeight:720,applyShotGuide,updateSplatlingStages,selectedSub,selectedSubCost,chargerScopeFactor:()=>0,specialIcon:()=>'',t:s=>s,on:(name,fn)=>{handlers.set(name,fn);return()=>{};},removeEventListener(){},cancelAnimationFrame(){}};
 const bindings={...values};let executable=source;
 for(const n of [...ast.body].reverse()){
  if(n.type==='ImportDeclaration'){for(const s of n.specifiers)bindings[s.local.name]=values[s.imported?.name]||(()=>{});executable=executable.slice(0,n.start)+executable.slice(n.end);}
  else if(n.type==='ExportNamedDeclaration')executable=executable.slice(0,n.start)+(n.declaration?executable.slice(n.declaration.start):executable.slice(n.end));
 }
 const HUD=Function(...Object.keys(bindings),executable+'\nreturn '+cls.id.name)(...Object.values(bindings));
 const h=Object.assign(Object.create(HUD.prototype),{_L:{},_fxTime:0,_bloom:0,_kick:0,_visible:true,ret:new El(),hitEl:new El(4),killEl:new El(),xh:new El(),spIcon:new El(),scopeMask:new El(),shield:new El(),subChip:new El(),el:new El(),overLayer:new El(),_tank:{},_kills:{dealt:new Map()},_restart(el,n){el.classList.add(n);},_live:()=>true,_local:()=>local});
 return {h,local,G,handlers};
}
test('confirmed damage uses the rendered guide, stable white ticks and no aiming-reticle punch',()=>{
 const {h}=fixture();h.ret.style.translate='37px -19px';h.hitMarker('hit',{damage:36});
 assert.equal(h.hitEl.style.translate,'37px -19px');assert.equal(h.hitEl.style['--hs'],'1.20');assert.equal(h.hitEl.style['--hn'],'0');
 assert(!h.ret.classList.contains('is-hitflash'));assert(!h.killEl.classList.contains('is-on'));
 const animations=h.hitEl.children.flatMap(n=>n.animations);assert.equal(animations.length,4);assert(animations.every(a=>a.options.duration===240));
 h.ret.style.translate='-28px 9px';assert.equal(h.hitEl.style.translate,'37px -19px','a later aim/target cannot drag a confirmed hit');
 h.hitMarker('kill',{damage:120});assert.equal(h.killEl.style.translate,'-28px 9px');assert(h.killEl.classList.contains('is-on'));assert(!h.ret.classList.contains('is-killflash'));
});
test('1000 consecutive hits reuse four animations and never grow, tint, stack or shorten the next pulse',()=>{
 const {h}=fixture();for(let n=0;n<1000;n++){h._fxTime=n/120;h.hitMarker('hit',{damage:n%2?99:12});}
 assert.equal(h.hitEl.style['--hs'],'1.20');assert.equal(h.hitEl.style['--hn'],'0');assert(!h.hitEl.classList.contains('is-heavy'));
 for(const el of h.hitEl.children){assert.equal(el.animations.length,1);assert.equal(el.animations[0].plays,1000);assert.equal(el.animations[0].currentTime,0);}
});
test('invalid/zero damage and late confirmations while dead cannot produce feedback',()=>{
 const {h,local}=fixture();for(const damage of [0,-1,NaN,Infinity,undefined])h.hitMarker('hit',{damage});
 assert.equal(h.hitEl.children.flatMap(n=>n.animations).length,0);
 local.alive=false;h.hitMarker('kill',{damage:36});assert(!h.killEl.classList.contains('is-on'));
});
test('trusted zero-damage splat confirmations retain kill feedback without a false damage pulse',()=>{
 const {h}=fixture();h.ret.style.translate='-14px 6px';h.hitMarker('kill',{damage:0});
 assert(h.killEl.classList.contains('is-on'));assert.equal(h.killEl.style.translate,'-14px 6px');
 assert.equal(h.hitEl.children.flatMap(n=>n.animations).length,0);
});
test('boss weak-point/heavy ring keeps its explicit CSS feedback path',()=>{
 const {h}=fixture();h._lastHitDmg=90;h.hitMarker('hit');
 assert(h.hitEl.classList.contains('is-heavy'));assert(h.hitEl.classList.contains('is-on'));
 assert.equal(h._lastHitDmg,0);
});
for(const hz of [30,60,120,144])test(`firing, settling, target changes and occlusion keep authoritative spread at ${hz}Hz`,()=>{
 const {h}=fixture();for(const weapon of ['shooter','blaster','dualies','splatling','slosher','roller','charger']){
  for(const spread of [0,18.3,27,12,4,0])for(const onTarget of [null,'enemy'])for(const inRange of [true,false]){
   h._bloom=1;h._kick=1;h._updCrosshair({weapon,charge:.5,crosshair:{spread,onTarget,inRange,guide:{x:672,y:343}}},1/hz);
   if(['shooter','blaster','dualies','splatling'].includes(weapon))assert.equal(Number(h.ret.style['--sp']),spread);
   assert.equal(h.xh.classList.contains('is-target'),onTarget==='enemy'&&inRange);
   assert.equal(h.hitEl.children.flatMap(n=>n.animations).length,0,'aim-on-target/occlusion/fire are not hits');
  }
 }
});
test('weapon change, hiding, death/respawn and disposal cancel stale damage and kill feedback',()=>{
 const {h,local,handlers}=fixture();h._bindBus();
 const hit=()=>h.hitMarker('kill',{damage:36});
 const clear=()=>{assert(h.hitEl.children.every(n=>n.animations.every(a=>a.playState==='idle')));assert(!h.killEl.classList.contains('is-on'));assert.equal(h._lastHitDmg,0);};
 h._updCrosshair({weapon:'shooter'},0);
 for(const weapon of ['dualies','charger','splatling','shooter']){hit();h._updCrosshair({weapon},0);clear();}
 hit();h.setVisible(false);clear();h._visible=true;
 hit();local.alive=false;h._updCrosshair({weapon:'shooter'},1/60);clear();
 local.alive=true;h._clearDamageDirs=()=>{};hit();handlers.get('respawn')({actor:local});clear();
 hit();h.dispose();clear();
});
test('a new match resets an in-flight hit/kill pulse before showing the lineup',()=>{
 const {h}=fixture();Object.assign(h,{kcards:new El(),callouts:new El(),tpops:new El(),downLayer:new El(),turfNum:new El(),boss:{setMode(){}},_clearDamageDirs(){},_lineup(){},_setTurfLead(){},clearFinishTape(){}});
 h.hitMarker('kill',{damage:36});h._startMatchHud({mode:'turf'});
 assert(!h.killEl.classList.contains('is-on'));assert.equal(h.hitEl.style.translate,'');
 assert(h.hitEl.children.every(n=>n.animations.every(a=>a.playState==='idle')));
});
test('main forwards damage from the existing trusted hit event without another hit producer',()=>{
 const main=read('src/main.js');assert.ok(/hitMarker\([^;]*damage/.test(main),'accepted damage forwarded');assert.equal((main.match(/\.hitMarker\(/g)||[]).length,1);
});
