import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
const read=p=>fs.readFileSync(new URL('../../../'+p,import.meta.url),'utf8');
const before=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-ui-input-20261029-before.json',import.meta.url))).methods;
const between=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
const comp=rel=>adaptBuildSource(rel,read('inkwave-public/'+rel));
test('Chromium real DOM: lazy range weapons, reusable slider WAAPI and boss CSSAnimation retain outputs',async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});
 try{const page=await browser.newPage();await page.setContent(`<style>:root{--spring2:cubic-bezier(.34,1.56,.64,1)}.iw-bnum.is-bump b{animation:iw-bnum-bump .22s var(--spring2)}@keyframes iw-bnum-bump{0%{scale:1.35}}</style>`);
 const inputs={h:between(read('inkwave-public/src/ui/ui-util.js'),"const TR_ATTRS",'/**').replace('export function','function'),before,
 slider:between(comp('src/ui/menus.js'),'  _slider(row, value) {','  _toggle(row, value) {'),
 boss:between(comp('src/ui/hud-boss.js'),'  _addNum(w, dmg, weak, now) {','  _crit(w,'),
 range:read('patches/practice-range/runtime/menu.mjs')};
 const result=await page.evaluate(async ({h,before,slider,boss,range})=>{
  const makeH=new Function('tx',h+'\nreturn h;')(x=>x);
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  const method=(s,name,bindings)=>new Function(...Object.keys(bindings),'return ({'+s+'}).'+name)(...Object.values(bindings));
  const restartAnim=(el,cls)=>{el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);};
  async function sliders(source){let created=0,plays=0,cancels=0;const values=[];const native=Element.prototype.animate;Element.prototype.animate=function(...args){created++;const anim=native.apply(this,args);const play=anim.play.bind(anim),cancel=anim.cancel.bind(anim);anim.play=()=>{plays++;return play();};anim.cancel=()=>{cancels++;return cancel();};return anim;};
   let reduced=false;const fn=method(source,'_slider',{h:makeH,clamp,DEFAULT_SETTINGS:{x:50},prefersReducedMotion:()=>reduced,restartAnim});const owner={_setSetting:(_,v)=>values.push(v),_sfx(){}};const control=fn.call(owner,{key:'x',min:0,max:100,step:1,fmt:String},0);document.body.appendChild(control.el);
   for(let i=0;i<30;i++)control.adjust(1);const val=control.el.querySelector('.iw-slider__val');let animations=val.getAnimations();const latest=animations.at(-1);latest.pause();latest.currentTime=130;const style={scale:getComputedStyle(val).scale,translate:getComputedStyle(val).translate};const count=animations.length;
   reduced=true;control.adjust(-1);const createdReduced=created;control.destroy();control.el.remove();for(const animation of animations)animation.cancel();Element.prototype.animate=native;
   return{created,plays,values,style,count,createdReduced,cancels};
  }
  const oldSlider=await sliders(before.slider),newSlider=await sliders(slider);
  async function bossRun(source){let reads=0;const descriptor=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'offsetWidth');Object.defineProperty(HTMLElement.prototype,'offsetWidth',{configurable:true,get(){reads++;return descriptor.get.call(this);}});
   const fn=method(source,'_addNum',{h:makeH,clamp,fmtInt:String,restartAnim});const layer=makeH('div');document.body.appendChild(layer);const owner={S:{combo:null,nums:[]},numLayer:layer};
   for(let i=0;i<15;i++)fn.call(owner,{x:1,y:2,z:3},3,i%2===0,i*.01);const c=owner.S.combo,animation=c.txt.getAnimations().at(-1);animation.pause();animation.currentTime=110;const result={reads,text:c.txt.textContent,scale:getComputedStyle(c.txt).scale,sum:c.sum,nums:owner.S.nums.length,weak:c.weak};layer.remove();Object.defineProperty(HTMLElement.prototype,'offsetWidth',descriptor);return result;
  }
  const oldBoss=await bossRun(before.bossNum),newBoss=await bossRun(boss);
  function rangeRun(source){let icons=0;const bindings=new Map();const weapons=Object.fromEntries(Array.from({length:160},(_,i)=>['w'+i,{name:'Weapon '+i,class:i%2?'Shooter':'Roller',kind:'shooter'}]));const weaponOrder=Object.keys(weapons);const session={local:{weaponId:'w20'},setWeapon:id=>{session.selected=id;}};const G={match:{range:session}};
   const env={G,WEAPONS:weapons,WEAPON_ORDER:weaponOrder,SUB:{},SPECIALS:{},h:makeH,GLYPHS:{},SUB_ICONS:{},weaponIcon:id=>{icons++;return '<svg data-weapon="'+id+'"></svg>';},specialIcon:()=>'',padGlyph:()=>'',ZONE_ORDER:[],ZONES:{},L:x=>x,SUB_TEXT:{spawn:'spawn'},safeCall:f=>f()};
   const start=source.indexOf("const TABS ="),end=source.indexOf('export function installRangeMenus',start);const create=new Function(...Object.keys(env),source.slice(start,end)+'\nreturn rangePause;')(...Object.values(env));
   const menus={_btn:o=>makeH('button',null,o.label),_fx(){},_bind(el,o){el.dataset.nav=o.id;bindings.set(o.id,o);},_panel:(cls,...kids)=>makeH('div',{class:cls},kids),_header:()=>makeH('div'),_prompts:()=>makeH('div',{class:'iw-prompts'},makeH('span'),makeH('span')),_sfx(){},_resume(){},_setFocus(){},_input:'kbm'};
   const scr=create(menus);document.body.appendChild(scr.el);const initial=scr.el.querySelectorAll('.iwr-wchip').length,initialIcons=icons;scr.onNav('tab_next');const weapon=scr.el.querySelector('[data-tab="weapon"].iwr-pause__sec'),html=weapon.innerHTML;const firstCount=weapon.querySelectorAll('.iwr-wchip').length,firstIcons=icons;scr.onNav('tab_prev');scr.onNav('tab_next');const repeatIcons=icons;bindings.get('w-w42').accept();const selected=session.selected;scr.el.remove();const remembered=create(menus);const rememberedCount=remembered.el.querySelectorAll('.iwr-wchip').length;return{initial,initialIcons,firstCount,firstIcons,repeatIcons,html,selected,rememberedCount};
  }
  return{oldSlider,newSlider,oldBoss,newBoss,oldRange:rangeRun(before.rangeMenu),newRange:rangeRun(range)};
 },inputs);
 assert.deepEqual(result.newSlider.values,result.oldSlider.values);assert.deepEqual(result.newSlider.style,result.oldSlider.style);assert.equal(result.newSlider.created,1);assert(result.oldSlider.created>1);assert.equal(result.newSlider.createdReduced,1);
 const {reads:oldReads,...oldBoss}=result.oldBoss,{reads:newReads,...newBoss}=result.newBoss;assert.deepEqual(newBoss,oldBoss);assert.equal(oldReads,15);assert.equal(newReads,0);
 assert.equal(result.oldRange.initial,160);assert.equal(result.newRange.initial,0);assert.equal(result.newRange.firstCount,160);assert.equal(result.newRange.firstIcons,result.newRange.repeatIcons);assert.equal(result.newRange.html,result.oldRange.html);assert.equal(result.newRange.selected,'w42');assert.equal(result.newRange.rememberedCount,160);
 console.log(JSON.stringify({browser:'Chromium desktop headless; physical devices unmeasured',sliderAnimations:[result.oldSlider.created,result.newSlider.created],bossOffsetWidthReads:[oldReads,newReads],initialRangeCards:[result.oldRange.initial,result.newRange.initial],firstWeaponTabCards:result.newRange.firstCount}));
 }finally{await browser.close();}
});
