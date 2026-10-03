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
 const classes=()=>({add(){},remove(){},toggle(){}});
 const Menus=vm.runInNewContext('class Menus {'+methods+'}; Menus',{getComputedStyle:()=>({opacity:'1',borderTopLeftRadius:'4px'}),setTextMode(){}});
 Object.assign(Menus.prototype,{update(){},dispose(){}});
 if(patched)installMenuQuality(Menus,{performance:{now:()=>now}});
 const m=new Menus();Object.assign(m,{_cur:{x:new Spring(0,560,34),y:new Spring(0,560,34),w:new Spring(0,560,34),h:new Spring(0,560,34),on:false,r:''},_input:'kbm',_scr:{},el:{classList:classes()},cursorEl:{classList:classes(),style:{}},_frozen:()=>false});
 const el=(x,y,nav='button')=>({isConnected:true,dataset:{nav},classList:classes(),closest:()=>null,getBoundingClientRect:()=>({left:x,top:y,width:80,height:30,right:x+80,bottom:y+30})});
 return {m,el,time:t=>now=t,source};
}
test('negative control: native selection commits before its outline target',()=>{
 const {m,el}=fixture(false),a=el(10,20),b=el(100,120);m._setFocus(a);m._updateCursor(1/60);m._setFocus(b);
 assert.equal(m._focus,b);assert.equal(m._cur.x.target,3);
});
test('keyboard/pad/touch commit target and retire the old selection in the input task',()=>{
 for(const mode of ['kbm','pad','touch']){
  const {m,el,time}=fixture(),a=el(10,20,'row'),b=el(100,120,'row');
  m._setFocus(a);m._updateCursor(1/60);m.setInputMode(mode);time(12);m._setFocus(b);
  assert.equal(m._focus,b);assert.equal(m._cur.targetEl,b);assert.equal(m._cur.x.target,93);assert.equal(m._cur.y.target,113);
  assert.equal(m._cur.w.target,94);assert.equal(m._cur.h.target,44);
  if(mode==='touch')assert.equal(m._cur.on,false);
  else {assert(m._cur.x.x>3);assert(m._cur.x.x<93);assert(m._cur.on);}
 }
});
test('input visual advancement is deducted from the next animation tick',()=>{
 const {m,el,time}=fixture(),a=el(10,20),b=el(100,120);m._setFocus(a);m._updateCursor(1/60);time(10);m._setFocus(b);
 const x=m._cur.x.x;m._updateCursor(.010);assert.equal(m._cur.x.x,x);assert.equal(m._qualityCursorCredit,0);
 time(20);m._updateCursor(.010);assert(m._cur.x.x>x);
});
test('deselect hides immediately; a frozen UI retargets without moving',()=>{
 const {m,el,time}=fixture(),a=el(10,20),b=el(100,120);m._setFocus(a);m._updateCursor(1/60);m._frozen=()=>true;time(15);m._setFocus(b);
 assert.equal(m._cur.x.x,3);assert.equal(m._cur.x.target,93);m._setFocus(null);assert.equal(m._cur.on,false);
});
test('cursor source connections fail closed on upstream drift and double application',()=>{
 const raw=read('inkwave-public/src/ui/menus.js');assert.throws(()=>adaptQualitySource('src/ui/menus.js',raw.replace('    if (!want) {','    if (!want) /* drift */ {')),/quality patch conflict/);
 assert.throws(()=>adaptQualitySource('src/ui/menus.js',adaptQualitySource('src/ui/menus.js',raw)),/quality patch conflict/);
});
test('snap and touch-hide do not spend spring credit; frozen snap keeps native semantics',()=>{
 const {m,el,time}=fixture(),a=el(10,20,'row'),b=el(100,120,'row');m._setFocus(a);m._updateCursor(1/60);time(12);m._setFocus(b,{snap:true});assert.equal(m._qualityCursorCredit,0);
 time(24);m.setInputMode('touch');assert.equal(m._qualityCursorCredit,0);assert.equal(m._cur.on,false);
 m.setInputMode('kbm');m._frozen=()=>true;time(36);m._setFocus(a,{snap:true});assert.equal(m._cur.x.x,3);assert.equal(m._cur.x.target,3);assert.equal(m._qualityCursorCredit,0);
});
test('rapid same-clock retarget retains already spent credit without advancing twice',()=>{
 const {m,el,time}=fixture(),a=el(10,20),b=el(100,120),c=el(200,220);m._setFocus(a);m._updateCursor(1/60);time(10);m._setFocus(b);
 const x=m._cur.x.x,credit=m._qualityCursorCredit;m._setFocus(c);assert.equal(m._cur.x.x,x);assert.equal(m._cur.x.target,193);assert.equal(m._qualityCursorCredit,credit);
 m._updateCursor(.010);assert.equal(m._cur.x.x,x);assert.equal(m._qualityCursorCredit,0);
});

test('logically off ring is hidden despite its native CSS opacity fade, and reappears on mode recovery',()=>{
 const {m,el,time}=fixture(),a=el(10,20,'row'),b=el(100,120,'row');m._setFocus(a);m._updateCursor(1/60);assert.equal(m.cursorEl.style.visibility,'');
 time(12);m.setInputMode('touch');m._setFocus(b);assert.equal(m._cur.on,false);assert.equal(m.cursorEl.style.visibility,'hidden');
 time(24);m.setInputMode('pad');assert.equal(m._cur.on,true);assert.equal(m.cursorEl.style.visibility,'');
 m._setFocus(null);assert.equal(m.cursorEl.style.visibility,'hidden');
});
