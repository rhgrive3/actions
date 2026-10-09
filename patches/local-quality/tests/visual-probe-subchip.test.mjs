import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fixture} from '../../splatoon3/tests/match-hud-fixture.mjs';
const root=new URL('../../../',import.meta.url);
const probe=fs.readFileSync(new URL('scripts/check-inkwave-hud-authority.mjs',root),'utf8');
class El {
 constructor(tag='div'){this.tag=tag;this.children=[];this.style={setProperty(k,v){this[k]=v;}};this.names=new Set();this.classList={toggle:(k,v)=>v?this.names.add(k):this.names.delete(k)};this.innerHTML='';this.textContent='';}
 querySelector(tag){for(const x of this.children){if(x.tag===tag)return x;const nested=x.querySelector(tag);if(nested)return nested;}return null;}
 cloneNode(deep){const x=new El(this.tag);x.innerHTML=this.innerHTML;x.textContent=this.textContent;if(deep)x.children=this.children.map(c=>c.cloneNode(true));return x;}
}
async function rig(legacy=false){
 const f=await fixture(),holder=Object.create(f.HUD.prototype),xh=new El(),ret=new El();
 const a={alive:true,weapon:f.WEAPONS.splatling,weaponRunner:{streaming:false}};
 const raw=fs.readFileSync(new URL('inkwave-public/src/ui/hud.js',root),'utf8');
 const initializer=raw.split('\n').filter(line=>line.trimStart().startsWith('this.subChip = '));assert.equal(initializer.length,1);
 const h={};const make=(tag,attrs,...children)=>{const e=new El(tag);e.innerHTML=attrs?.html||'';e.children=children.filter(c=>c instanceof El);if(children.some(c=>typeof c==='string'))e.textContent=children.filter(c=>typeof c==='string').join('');return e;};
 // Execute the native constructor's actual markup initializer against its receiver.
 const init=vm.runInNewContext(`(function(){${initializer[0]}})`,{h:make,SUB_ICONS:{bomb:'native bomb'},SUB:f.SUB,Math});init.call(h);
 const lines=probe.split('\n').filter(line=>line.includes('Object.assign(holder,{xh,ret,'));assert.equal(lines.length,1);
 const line=legacy?lines[0].replace('subChip:h.subChip.cloneNode(true)','subChip:document.createElement(\'div\')'):lines[0];
 vm.runInNewContext(line,{holder,xh,ret,h,a,document:{createElement:tag=>new El(tag)}});
 holder._chargeEl=new El('circle');holder._chargeSecond=new El('circle');
 return {f,h,holder,a};
}
test('old empty private subChip reproduces the actual composed HUD null.innerHTML failure',async()=>{
 const r=await rig(true);assert.equal(r.holder.subChip.querySelector('i'),null);assert.throws(()=>r.holder._updCrosshair({weapon:'splatling',charge:2/3},1/60),/Cannot set properties of null.*innerHTML/);
});
test('native deep-cloned subChip supports staged reticle updates while preserving live markup and ownership',async()=>{
 const r=await rig(),live=r.h.subChip,icon=live.querySelector('i'),label=live.querySelector('b'),original=[icon.innerHTML,label.textContent];
 assert.notEqual(r.holder.subChip,live);assert.notEqual(r.holder.subChip.querySelector('i'),icon);
 for(const [charge,streaming,left,first,second]of [[2/3,false,0,1,0],[5/6,false,0,1,.5],[1,false,0,1,1],[1,true,80/60,1,0]]){
  Object.assign(r.a.weaponRunner,{streaming,burstT:left});r.holder._updCrosshair({weapon:'splatling',charge},1/60);
  assert.equal(+r.holder._chargeEl.style.strokeDashoffset,100*(1-first));assert.equal(+r.holder._chargeSecond.style.strokeDashoffset,100*(1-second));
 }
 assert.deepEqual([icon.innerHTML,label.textContent],original);assert.equal(r.h.subChip,live);
});
