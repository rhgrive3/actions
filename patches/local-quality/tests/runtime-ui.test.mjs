import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {installMenuQuality} from '../menu.mjs';
import {adaptQualitySource} from '../adapter.mjs';
const root=new URL('../../../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const section=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i);return s.slice(i,j);};
function fixture(patched=true){
 let now=0;
 const raw=read('inkwave-public/src/ui/menus.js');
 const source=patched?adaptQualitySource('src/ui/menus.js',raw):raw;
 const Spring=vm.runInNewContext(section(read('inkwave-public/src/ui/ui-util.js'),'export class Spring {','\n// ---------------------------------------------------------------- colour').replace('export ', '')+'; Spring');
 const methods=[section(source,'  _setFocus(el,','\n  _candidates()'),section(source,'  _updateCursor(dt)','\n  // ================================================================ modal'),section(source,'  setInputMode(mode)','\n  dispose()')].join('\n');
 const classes=()=>{const set=new Set();return {set,add(c){set.add(c);},remove(c){set.delete(c);},toggle(c,on){if(on===undefined?!set.has(c):on)set.add(c);else set.delete(c);},contains:c=>set.has(c)};};
 const Menus=vm.runInNewContext('class Menus {'+methods+'}; Menus',{getComputedStyle:()=>({opacity:'1',borderTopLeftRadius:'4px'}),setTextMode(){}});
 Object.assign(Menus.prototype,{update(){},dispose(){}});
 if(patched)installMenuQuality(Menus,{performance:{now:()=>now}});
 const m=new Menus();Object.assign(m,{_cur:{x:new Spring(0,560,34),y:new Spring(0,560,34),w:new Spring(0,560,34),h:new Spring(0,560,34),on:false,r:''},_input:'kbm',_scr:{},el:{classList:classes()},cursorEl:{classList:classes(),style:{}},_frozen:()=>false});
 const el=(x,y,nav='button')=>({isConnected:true,dataset:{nav},classList:classes(),closest:()=>null,getBoundingClientRect:()=>({left:x,top:y,width:80,height:30,right:x+80,bottom:y+30})});
 return {m,el,time:t=>now=t,source};
}
test('negative control: native selection commits before its outline, then the outline springs behind it',()=>{
 const {m,el}=fixture(false),a=el(10,20),b=el(100,120);m._setFocus(a);m._updateCursor(1/60);m._setFocus(b);
 assert.equal(m._focus,b);assert.equal(m._cur.x.target,3,'native: target still on the old item after the input task');
 m._updateCursor(1/60);assert.equal(m._cur.x.target,93);
 assert(m._cur.x.x>3&&m._cur.x.x<93,'native: the painted ring trails the selection by spring travel');
});
test('keyboard/pad/touch: the ring is painted on the new selection in the same input task',()=>{
 for(const mode of ['kbm','pad','touch']){
  const {m,el,time}=fixture(),a=el(10,20,'row'),b=el(100,120,'row');
  m._setFocus(a);m._updateCursor(1/60);m.setInputMode(mode);time(12);m._setFocus(b);
  assert.equal(m._focus,b);assert.equal(m._cur.targetEl,b);assert.equal(m._cur.x.target,93);assert.equal(m._cur.y.target,113);
  assert.equal(m._cur.w.target,94);assert.equal(m._cur.h.target,44);
  if(mode==='touch')assert.equal(m._cur.on,false,'touch rows show their own tint');
  else {
   assert(m._cur.on);
   assert.equal(m._cur.x.x,93);assert.equal(m._cur.y.x,113);assert.equal(m._cur.w.x,94);assert.equal(m._cur.h.x,44);
   assert.equal(m.cursorEl.style.transform,'translate3d(93.0px,113.0px,0)');
   assert.equal(m.cursorEl.style.width,'94.0px');assert.equal(m.cursorEl.style.height,'44.0px');
  }
 }
});
test('rapid input within one frame never leaves the ring behind; later ticks do not move it',()=>{
 const {m,el,time}=fixture(),items=[el(10,20),el(100,120),el(200,220),el(300,320),el(400,420)];
 m._setFocus(items[0],{snap:true});m._updateCursor(1/60);
 for(let i=1;i<items.length;i++){time(i);m._setFocus(items[i]);
  assert.equal(m._cur.x.x,items[i].getBoundingClientRect().left-7,'ring follows input '+i+' immediately');}
 for(const dt of [1/240,1/60,1/30,.1]){m._updateCursor(dt);assert.equal(m._cur.x.x,393);assert.equal(m._cur.y.x,413);}
});
test('every frame interval paints the ring exactly on a moving (scrolling) selection',()=>{
 const {m,el}=fixture(),a=el(10,20);let rect={left:10,top:20,width:80,height:30};a.getBoundingClientRect=()=>({...rect,right:rect.left+rect.width,bottom:rect.top+rect.height});
 m._setFocus(a);m._updateCursor(1/60);
 for(const [dt,top] of [[1/240,40],[1/60,90],[1/20,-15]]){rect={...rect,top};m._updateCursor(dt);assert.equal(m._cur.y.x,top-7);}
});
test('deselect hides immediately; a frozen UI still shows the real selection',()=>{
 const {m,el,time}=fixture(),a=el(10,20),b=el(100,120);m._setFocus(a);m._updateCursor(1/60);m._frozen=()=>true;time(15);m._setFocus(b);
 assert.equal(m._cur.x.x,93);assert.equal(m._cur.x.target,93);m._setFocus(null);assert.equal(m._cur.on,false);
});
test('a re-opened menu shows the ring at its first selection, never flying in from the old position',()=>{
 const {m,el}=fixture(),a=el(10,20),b=el(400,420);m._setFocus(a);m._updateCursor(1/60);
 m._setFocus(null);m._updateCursor(1/60);assert.equal(m._cur.on,false);
 m._setFocus(b,{snap:true});assert.equal(m._cur.on,true);assert.equal(m._cur.x.x,393);assert.equal(m._cur.y.x,413);
 m._updateCursor(1/60);assert.equal(m._cur.x.x,393);
});
test('the ring keeps its native appearance animation: shown with is-on (CSS fade + pulse), hidden when off',()=>{
 const {m,el}=fixture(),a=el(10,20);m._setFocus(a);
 assert(m.cursorEl.classList.contains('is-on'));assert.equal(m.cursorEl.style.visibility,'');
 m._setFocus(null);assert(!m.cursorEl.classList.contains('is-on'));assert.equal(m.cursorEl.style.visibility,'hidden');
});
test('cursor source connections fail closed on upstream drift and double application',()=>{
 const raw=read('inkwave-public/src/ui/menus.js');assert.throws(()=>adaptQualitySource('src/ui/menus.js',raw.replace('    if (!want) {','    if (!want) /* drift */ {')),/quality patch conflict/);
 assert.throws(()=>adaptQualitySource('src/ui/menus.js',adaptQualitySource('src/ui/menus.js',raw)),/quality patch conflict/);
});
test('logically off ring is hidden despite its native CSS opacity fade, and reappears on mode recovery',()=>{
 const {m,el,time}=fixture(),a=el(10,20,'row'),b=el(100,120,'row');m._setFocus(a);m._updateCursor(1/60);assert.equal(m.cursorEl.style.visibility,'');
 time(12);m.setInputMode('touch');m._setFocus(b);assert.equal(m._cur.on,false);assert.equal(m.cursorEl.style.visibility,'hidden');
 time(24);m.setInputMode('pad');assert.equal(m._cur.on,true);assert.equal(m.cursorEl.style.visibility,'');assert.equal(m._cur.x.x,93);
 m._setFocus(null);assert.equal(m.cursorEl.style.visibility,'hidden');
});
test('input-mode layout change refreshes the same focused item target in the input task',()=>{
 const {m,el}=fixture(),a=el(10,20,'row');let rect={left:10,top:20,width:80,height:30};
 a.getBoundingClientRect=()=>rect;m._setFocus(a);m._updateCursor(1/60);
 m._scr.onInputMode=()=>{rect={left:100,top:120,width:120,height:50};};
 m.setInputMode('touch');assert.equal(m._focus,a);assert.equal(m._cur.targetEl,a);
 assert.equal(m._cur.x.target,93);assert.equal(m._cur.y.target,113);assert.equal(m._cur.w.target,134);assert.equal(m._cur.h.target,64);assert.equal(m._cur.on,false);
});
test('touch-to-keyboard/pad navigation first reveals the ring at the newly selected item',()=>{
 for(const mode of ['kbm','pad']){
  const {m,el,time}=fixture(),a=el(10,20,'row'),b=el(100,120,'row');
  m._setFocus(a,{snap:true});m._updateCursor(1/60);m.setInputMode('touch');assert.equal(m._cur.on,false);
  time(12);m.setInputMode(mode);m._setFocus(b);
  assert.equal(m._focus,b);assert.equal(m._cur.targetEl,b);assert.equal(m._cur.x.target,93);
  assert.equal(m._cur.x.x,93);assert.equal(m._cur.y.x,113);
 }
});
