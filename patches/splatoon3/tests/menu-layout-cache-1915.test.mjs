import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
// Execute both actual modules with native Menus lifecycle/focus/graph methods.
// This DOM fixture is a source semantic check, not a browser rendering claim.
const current=fs.readFileSync(new URL('../runtime/menu-layout.mjs',import.meta.url),'utf8');
const before=fs.readFileSync(new URL('./fixtures/menu-layout-cache-1915-before.mjs.txt',import.meta.url),'utf8');
assert.equal(createHash('sha256').update(before).digest('hex'),'f694cc7e2cecfc612c054faad7a60e2656bdac18c743977c17c35f5ec40bb55d');
const native=fs.readFileSync(new URL('../../../inkwave-public/src/ui/menus.js',import.meta.url),'utf8');
const methods=['_setFocus','_moveFocus','_graphNav','_swap'].map(name=>{
 const start=native.indexOf('  '+name+'('),end=native.indexOf('\n  }',start);
 assert.ok(start>=0&&end>start,'actual native '+name+' method');return native.slice(start,end+4);
}).join('\n');
function element(){
 const classes=new Set(),style=new Map();let hidden=false;
 const el={dataset:{},children:[],handlers:{},parentNode:null,hiddenWrites:0,
  classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),contains:x=>classes.has(x),toggle(x,on=!classes.has(x)){on?classes.add(x):classes.delete(x);return on;}},
  style:{getPropertyValue:k=>style.get(k)||'',setProperty:(k,v)=>style.set(k,v)},
  querySelector(){return null;},querySelectorAll(){return [];},closest(){return null;},
  append(...xs){for(const x of xs){x.remove();x.parentNode=this;this.children.push(x);}},appendChild(x){this.append(x);},
  remove(){if(this.parentNode){const a=this.parentNode.children,i=a.indexOf(this);if(i>=0)a.splice(i,1);this.parentNode=null;}},
  before(){},setAttribute(k,v){this[k]=v;},addEventListener(k,f){this.handlers[k]=f;},scrollIntoView(){},
  getBoundingClientRect(){return {top:0,bottom:20,height:20};},
 };
 Object.defineProperties(el,{parentElement:{get(){return this.parentNode;}},isConnected:{get(){return this.connected===true||this.parentNode?.isConnected===true;}},hidden:{get(){return hidden;},set(v){hidden=v;this.hiddenWrites++;}}});
 return el;
}
async function fixture(source){
 const state={cols:3,rowReads:0,cardReads:0};
 const context=vm.createContext({console,document:{createElement:element},getComputedStyle:el=>({borderTopLeftRadius:'0',gridTemplateColumns:Array(state.cols).fill('100px').join(' ')}),setTimeout:()=>0,CSS:{escape:x=>x},safeCall:f=>f()});
 const mod=new vm.SourceTextModule(source,{context});
 await mod.link(spec=>new vm.SyntheticModule(spec.includes('i18n')?['isJa','t']:['GLYPHS'],function(){if(spec.includes('i18n')){this.setExport('isJa',false);this.setExport('t',x=>x);}else this.setExport('GLYPHS',{});},{context}));
 await mod.evaluate();
 const Menus=vm.runInContext('(class Menus {'+methods+'})',context),screens=[];
 Menus.prototype._scr_mode=function(){
  const menus=this,el=element(),row=element(),cards=Array.from({length:6},(_,i)=>Object.assign(element(),{_mode:'mode'+i}));
  row.append(...cards);el.append(row);
  row.querySelectorAll=()=>{state.cardReads++;return cards.filter(c=>c.parentNode===row);};
  el.querySelector=s=>{if(s==='.iw-modesel__row'){state.rowReads++;return row;}return null;};
  const graph=new Map(cards.map((c,i)=>[c,{left:cards[i-1]||null,right:cards[i+1]||null}]));
  const scr={el,row,cards,initial:cards[0],delegated:[],calls:[],destroyed:false,onNav(dir){scr.delegated.push(dir);return menus._graphNav(graph,dir);},onFocus(card){assert.equal(scr.destroyed,false,'no focus on disposed screen');assert.equal(menus._scr,scr,'native screen owns focus');scr.calls.push(card);},destroy(){scr.destroyed=true;}};
  screens.push(scr);return scr;
 };
 Menus.prototype._scr_loadout=function(){
  const menus=this,el=element(),grid=element(),cards=Array.from({length:12},(_,i)=>Object.assign(element(),{_wid:'w'+i,querySelector:s=>s==='.s3-wkit'?{}:null}));
  cards[0].classList.add('is-equipped');grid.append(...cards);el.append(grid);grid.querySelectorAll=()=>cards;
  let bar;grid.before=x=>{bar=x;el.append(x);};el.querySelector=s=>s==='.iw-wgrid'?grid:null;
  const scr={el,grid,cards,initial:cards[0],calls:[],destroyed:false,get bar(){return bar;},onFocus(card){assert.equal(scr.destroyed,false);assert.equal(menus._scr,scr);scr.calls.push(card);},destroy(){scr.destroyed=true;}};
  screens.push(scr);return scr;
 };
 const api={Menus,WEAPONS:Object.fromEntries(Array.from({length:12},(_,i)=>['w'+i,{class:i%2?'roller':'shooter',name:'w'+i}]))};
 assert.equal(mod.namespace.installMenuLayout(api),true);
 const menus=new Menus();Object.assign(menus,{_scr:null,_input:'touch',_focus:null,_cur:{on:false},el:element(),layer:Object.assign(element(),{connected:true}),_stack:[],_focusMem:{},_sfx(){},_bump(){}});
 return {menus,state,screens};
}

test('screen-owned mode cache preserves native focus, responsive grid reads and row edges',async()=>{
 const pairs=await Promise.all([before,current].map(fixture)),traces=[];
 for(const {menus,state} of pairs){
  menus._swap('mode',{});const scr=menus._scr,trace=[];
  assert.equal(scr.calls.length,1,'native swap owns initial focus');
  for(const [start,cols,dir] of [[0,3,'down'],[3,3,'up'],[2,3,'right'],[2,2,'up'],[1,2,'left'],[1,2,'right']]){
   state.cols=cols;menus._setFocus(scr.cards[start],{snap:true});
   trace.push([scr.onNav(dir),scr.cards.indexOf(menus._focus)]);
  }
  traces.push(trace);
 }
 assert.deepEqual(traces[1],traces[0]);assert.deepEqual(traces[1],[[true,3],[true,0],[true,2],[true,0],[true,0],[true,1]]);
 assert.equal(pairs[1].state.rowReads,1,'screen node lookup is cached');assert.equal(pairs[1].state.cardReads,1);
 assert.ok(pairs[0].state.rowReads>1,'frozen prior owner actually repeats lookup');
});

test('lost row or card ownership delegates the real native graph; replacement screens own separate caches',async()=>{
 const {menus,screens}=await fixture(current);menus._swap('mode',{});const old=menus._scr;
 old.row.remove();assert.equal(old.onNav('right'),true);assert.deepEqual(old.delegated,['right']);assert.equal(menus._focus,old.cards[0],'disconnected native target is not selected');
 old.el.append(old.row);menus._setFocus(old.cards[0],{snap:true});old.el.append(old.cards[5]);
 assert.equal(old.onNav('down'),false);assert.deepEqual(old.delegated,['right','down']);assert.equal(menus._focus,old.cards[0]);
 menus._setFocus(null);assert.equal(old.onNav('left'),false);assert.equal(old.delegated.at(-1),'left');
 for(let i=0;i<4;i++){menus._swap('mode',{});const scr=menus._scr;assert.equal(scr.calls.length,1);scr.onNav('down');assert.equal(menus._focus,scr.cards[3]);}
 assert.equal(old.destroyed,true);assert.ok(screens.slice(0,-1).every(s=>s.destroyed));assert.equal(screens.at(-1).destroyed,false);
});

test('unchanged hidden writes are avoided while actual native loadout focus and lifecycle remain equivalent',async()=>{
 const pairs=await Promise.all([before,current].map(fixture)),traces=[];
 for(const {menus} of pairs){
  menus._swap('loadout',{});const scr=menus._scr,trace=[];
  assert.equal(scr.calls.length,1);scr.cards.forEach(c=>c.hiddenWrites=0);
  for(const tab of [1,1,2,2,0]){
   scr.bar.children[tab].handlers.click();
   trace.push({hidden:scr.cards.map(c=>c.hidden),focus:scr.cards.indexOf(menus._focus),calls:scr.calls.length});
  }
  traces.push(trace);menus._swap('mode',{});assert.equal(scr.destroyed,true);
 }
 assert.deepEqual(traces[1],traces[0]);
 const repeated=await fixture(current);repeated.menus._swap('loadout',{});const scr=repeated.menus._scr;
 scr.bar.children[1].handlers.click();scr.cards.forEach(c=>c.hiddenWrites=0);const focus=repeated.menus._focus,calls=scr.calls.length;
 scr.bar.children[1].handlers.click();assert.equal(scr.cards.reduce((n,c)=>n+c.hiddenWrites,0),0);assert.equal(repeated.menus._focus,focus);assert.equal(scr.calls.length,calls);
});
