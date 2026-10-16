import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {clickNativeKitCard} from './inkwave-canonical-kit-input.mjs';
let browser;
test.before(async()=>{browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});});
test.after(async()=>{await browser?.close();});
async function fixture(){
 const page=await browser.newPage();await page.setContent(`<style>body{margin:0}#root{padding:40px}button{width:160px;height:80px;animation:move 1s linear infinite alternate}@keyframes move{from{transform:translateX(-15px)}to{transform:translateX(15px)}}</style><div id="root"><button data-id="w-kit">Kit</button></div>`);
 await page.evaluate(()=>{
  const root=document.querySelector('#root'),card=root.querySelector('button');
  globalThis.s3ProbeG={game:{menus:{current:'loadout',_scr:{name:'loadout',el:root},_binds:new Map([[card,{}]])}}};
  globalThis.s3KitInputTrace=[];
  for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,e=>s3KitInputTrace.push({type,id:e.target.closest('[data-id]')?.dataset.id,trust:e.isTrusted}),true);
  card.addEventListener('click',()=>globalThis.selectedKit='kit');
 });return page;
}
test('a continuously moving visible card receives native pointer input and trusted receipts',async()=>{
 const page=await fixture();try{
  await assert.rejects(page.locator('button').click({timeout:250}),/Timeout/);
  const receipt=await clickNativeKitCard(page,'kit');assert.deepEqual(receipt.trustedEvents,['pointerdown','pointerup','click']);
  assert.equal(await page.evaluate(()=>globalThis.selectedKit),'kit');
 }finally{await page.close();}
});
for(const [fault,expected]of [['covered',/covered/],['inert',/not admitted/],['dim',/entrance/],['unbound',/not admitted/]])test('reject '+fault+' before dispatching pointer input',async()=>{
 const page=await fixture();try{
  await page.evaluate(fault=>{const m=s3ProbeG.game.menus,card=document.querySelector('button');
   if(fault==='covered'){const cover=document.createElement('div');cover.style.cssText='position:fixed;inset:0;z-index:1000';document.body.append(cover);}
   if(fault==='inert')m._scr.el.inert=true;
   if(fault==='dim')card.style.opacity='.5';
   if(fault==='unbound')m._binds.delete(card);
  },fault);
  await assert.rejects(clickNativeKitCard(page,'kit'),expected);assert.equal(await page.evaluate(()=>s3KitInputTrace.length),0);
 }finally{await page.close();}
});
