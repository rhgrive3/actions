import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { boot, pad, STEP } from '../../reliability/tests/pause-fixture.mjs';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const SITE=process.env.INKWAVE_LAYOUT_PAD_SITE;
const main=SITE?fs.readFileSync(path.join(SITE,'src/main.js'),'utf8'):
 adaptBuildSource('src/main.js',fs.readFileSync(path.join(ROOT,'inkwave-public/src/main.js'),'utf8'));
// Resolve the actual emitted import alias rather than assuming source name G.
const contextImport=main.match(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/core\/ctx\.js['"]/);
assert.ok(contextImport,'production context import');
const contextName=contextImport[1].split(',').map(s=>s.trim()).find(s=>/^G(?:\s+as\s+\w+)?$/.test(s))?.split(/\s+as\s+/).pop();
assert.ok(contextName,'production G binding');
const start=main.search(/_padMenus\(\)\s*\{/),end=main.indexOf('_updateHud(',start);
assert.ok(start>=0&&end>start,'actual production Game method boundaries');
async function fixture(){
 const h=await boot();
 h.game._padMenus=vm.runInNewContext('({'+main.slice(start,end).trim()+'})._padMenus',{[contextName]:h.G});
 h.game.pause();h.menus.show('settings',{push:true});
 return h;
}
function press(h,buttons,axes=[0,0,0,0]){const p=pad(buttons);p[0].axes=axes;h.setPads(p);h.frame(STEP);}

for(const button of [0,1,2,4,5,9,12,13,14,15])test(`modal layout blocks underlying menu button ${button}`,async()=>{
 const h=await fixture();h.input.mobile.editing=true;
 press(h,[button]);press(h,[]);press(h,[button]);
 assert.equal(h.menus.current,'settings');assert.equal(h.m.paused,true);
 assert.deepEqual(h.navCalls,[]);assert.equal(h.input.padMenuPressed.size,0);
 assert.equal(h.input.padPressed.size,0);assert.equal(h.input.padButton(button),false);
});

test('cancelled editor input cannot replay into the pause menu; fresh B works after release',async()=>{
 const h=await fixture();h.input.mobile.editing=true;press(h,[1]);
 h.input.mobile.editing=false;h.input._layoutPadEnded=true;
 for(let i=0;i<3;i++)press(h,[1]);
 assert.equal(h.menus.current,'settings');assert.deepEqual(h.navCalls,[]);
 press(h,[]);press(h,[1]);assert.equal(h.menus.current,'pause');assert.equal(h.m.paused,true);
 press(h,[]);press(h,[1]);assert.equal(h.m.paused,false);assert.equal(h.menus.current,null);
 assert.deepEqual(h.navCalls,['back','back']);
});

test('editor opened and closed between polls still fences the first pending pad edge',async()=>{
 const h=await fixture();h.input._layoutPadEnded=true;
 press(h,[1]);assert.equal(h.menus.current,'settings');assert.equal(h.input._layoutPadEnded,false);
 press(h,[]);press(h,[1]);assert.equal(h.menus.current,'pause');
});

for(const axes of [[0,-1,0,0],[0,1,0,0],[-1,0,0,0],[1,0,0,0]])test(`editor-held stick ${axes.slice(0,2)} rearms only at neutral`,async()=>{
 const h=await fixture();h.input.mobile.editing=true;press(h,[],axes);
 h.input.mobile.editing=false;h.input._layoutPadEnded=true;
 for(let i=0;i<30;i++)press(h,[],axes);
 assert.deepEqual(h.navCalls,[]);assert.equal(h.game._layoutPadAxesBlocked,true);
 press(h,[]);assert.equal(h.game._layoutPadAxesBlocked,false);
 press(h,[],axes);assert.equal(h.navCalls.length,1);
});

test('ordinary settings B and Start-on-pause keep their original behavior',async()=>{
 const h=await fixture();press(h,[1]);assert.equal(h.menus.current,'pause');
 press(h,[]);press(h,[9]);assert.equal(h.menus.current,null);assert.equal(h.m.paused,false);
});

test('modal pad holds cannot pause a live match through a missing underlying menu',async()=>{
 const h=await fixture();h.game.resume();h.input.mobile.editing=true;
 press(h,[9]);assert.equal(h.menus.current,null);assert.equal(h.m.paused,false);assert.equal(h.input.padButton(9),false);
});

// Exercise the actual editor save/cancel implementation with minimal DOM surfaces.
// The emitted suite above is the actual minified Game route; this close-method
// fixture is source-only and is not a native browser layout/save demonstration.
for(const save of [false,true])test(`native editor ${save?'save':'cancel'} sets one close fence`,()=>{
 const Mobile=class {};Object.assign(Mobile.prototype,{_install(){},_box(){},_layoutAll(){},_editScale(){},resetPointers(){}});
 vm.runInNewContext(fs.readFileSync(path.join(ROOT,'patches/touch-layout/mobile.js'),'utf8')+';installTouchLayout(Mobile,{});',{
  Mobile,document:{documentElement:{lang:'en'}},localStorage:{setItem(){}},clamp:Math.min,
 });
 const m=Object.assign(new Mobile(),{editing:true,owner:{},layout:{new:1},_editBackup:{old:1},pressed:new Set(),
  _stick:{},root:{querySelectorAll:()=>[]},_syncVisible(){},resetPointers(){},_layoutAll(){}});
 m._closeEditor(save);assert.equal(m.owner._layoutPadEnded,true);assert.equal(m.editing,false);
 assert.deepEqual(m.layout,save?{new:1}:{old:1});
 m.owner._layoutPadEnded=false;m._closeEditor(save);assert.equal(m.owner._layoutPadEnded,false,'duplicate close is inert');
});

test('failed native save keeps the dialog open without issuing a close fence',()=>{
 const Mobile=class {};Object.assign(Mobile.prototype,{_install(){},_box(){},_layoutAll(){},_editScale(){},resetPointers(){}});
 vm.runInNewContext(fs.readFileSync(path.join(ROOT,'patches/touch-layout/mobile.js'),'utf8')+';installTouchLayout(Mobile,{});',{
  Mobile,document:{documentElement:{lang:'en'}},localStorage:{setItem(){throw Error('quota');}},clamp:Math.min,
 });
 const error={textContent:''};const m=Object.assign(new Mobile(),{editing:true,owner:{},layout:{new:1},_editBackup:{old:1},root:{querySelector:()=>error}});
 m._closeEditor(true);assert.equal(m.editing,true);assert.equal(m.owner._layoutPadEnded,undefined);assert.match(error.textContent,/Could not save/);
});

for (const buttons of [[0,1],[0,1,9],[0,5],[0,4]]) for (const close of [false,true])
 test(`same poll ${buttons} editor open${close?' and close':''} owns remaining dispatch`,async()=>{
  const h=await fixture();
  h.menus._binds.set(h.menus._focus,{accept:()=>{
   h.input.mobile.editing=true;
   if(close){h.input.mobile.editing=false;h.input._layoutPadEnded=true;}
  }});
  press(h,buttons);
  assert.deepEqual(h.navCalls,['accept']);assert.equal(h.menus.current,'settings');assert.equal(h.m.paused,true);
  assert.equal(h.input.padPressed.size,0);assert.equal(h.input.padButton(9),false);
 });

for(const axes of [[0,-1,0,0],[0,1,0,0],[-1,0,0,0],[1,0,0,0]])
 test(`same-poll editor opening cancels the remaining stick dispatch ${axes.slice(0,2)}`,async()=>{
  const h=await fixture();h.menus._binds.set(h.menus._focus,{accept:()=>{h.input.mobile.editing=true;}});
  press(h,[0],axes);assert.deepEqual(h.navCalls,['accept']);assert.equal(h.game._layoutPadAxesBlocked,true);
  assert.equal(h.m.paused,true);assert.equal(h.menus.current,'settings');
 });
