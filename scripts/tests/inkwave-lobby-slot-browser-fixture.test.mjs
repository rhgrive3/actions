import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {adaptBuildSource} from '../inkwave-source-composition.mjs';
const raw=fs.readFileSync(new URL('../../inkwave-public/src/ui/menus.js',import.meta.url),'utf8');
const checker=fs.readFileSync(new URL('../check-inkwave-lobby-slot-browser.mjs',import.meta.url),'utf8');
function blocks(text=checker,adapt=adaptBuildSource){
 const start=text.indexOf('function updateBlock('),end=text.indexOf('const dir=',start);
 assert(start>=0&&end>start);
 return vm.runInNewContext(text.slice(start,end)+';({before,after,cached,unconditional})',{assert,raw,adaptBuildSource:adapt});
}
function documentFixture(){
 class Element{
  constructor(){this.style={};this.dataset={};this.children=[];this.className='';this.textContent='';this.innerHTML='';this.classes=new Set();this.classList={toggle:(k,on)=>{on?this.classes.add(k):this.classes.delete(k);this.className=[...this.classes].join(' ');},contains:k=>this.classes.has(k)};}
  append(x){this.children.push(x);x.parent=this;}
  querySelector(){return this.children[0];}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
 }
 return{createElement:()=>new Element(),body:new Element()};
}
function run(text=checker){
 const data=blocks(text),start=text.indexOf('await page.evaluate(')+'await page.evaluate('.length,end=text.indexOf(',{before,after});',start);
 assert(start>0&&end>start);const document=documentFixture();const callback=vm.runInNewContext('('+text.slice(start,end)+')',{document});
 return {result:callback(data),document};
}
test('actual checker callback preserves 301 frames, counts, external repair and nonempty localized transitions',()=>{
 const {result:r,document}=run();assert.equal(r.frames,301);assert.equal(r.stable.baselineWrites,1440);assert.equal(r.stable.candidateWrites,8);assert.equal(r.sameDOM,true);assert.equal(r.externalRestored,true);assert.equal(r.anchors.baseline,2408);assert.equal(r.anchors.candidate,2408);assert.ok(r.localization.calls>8);assert.deepEqual(Array.from(r.localization.keys),['BOT','OPEN']);assert.equal(document.body.children.length,0);
});
test('baseline reverses exactly one cache and retains all other composed adaptations',()=>{
 const b=blocks();assert.equal(b.after.split(b.cached).length,2);assert.equal(b.before.replace(b.unconditional,b.cached),b.after);assert.ok(b.before.includes("tu('BOT')"));assert.ok(b.before.includes("tu('OPEN')"));
});
test('missing and duplicated production cache anchors reject',()=>{
 const b=blocks();for(const modify of[s=>s.replace(b.cached,b.unconditional),s=>s.replace(b.cached,b.cached+b.cached)])assert.throws(()=>blocks(checker,(p,s)=>modify(adaptBuildSource(p,s))),/exactly one production transform cache/);
});
test('missing translation injection is rejected by the actual callback',()=>{
 assert.throws(()=>run(checker.replace("'GLYPHS','tu',code)","'GLYPHS',code)")),/tu is not defined/);
});
test('empty localization cannot pass equality-only DOM comparison',()=>{
 assert.throws(()=>run(checker.replace('return `localized:${value}`','return \'\'')),/localized state mismatch/);
});
test('raw baseline is rejected rather than compared against unrelated composed localization',()=>{
 assert.throws(()=>run(checker.replace('const before=after.replace(cached,unconditional);','const before=updateBlock(raw);')),/DOM divergence|translation call divergence|localized state mismatch/);
});
