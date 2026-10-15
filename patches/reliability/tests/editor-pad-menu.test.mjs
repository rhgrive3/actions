import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { boot as pauseBoot, pad as pausePad, STEP } from './pause-fixture.mjs';
import { fixture } from './controls-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const site=process.env.INKWAVE_CONTROLS_SITE;
const raw=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8');
const code=site?fs.readFileSync(path.join(site,'src/main.js'),'utf8'):adaptBuildSource('src/main.js',raw);
const start=code.search(/\b_padMenus\(\)\s*\{/),end=code.indexOf('_updateHud(',start);
assert.ok(start>=0&&end>start,'actual Game pad router boundaries');
const method=code.slice(start,end).trim();
const contextImport=code.match(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/core\/ctx\.js['"]/);
assert.ok(contextImport,'actual context import');
const contextName=contextImport[1].split(',').map(s=>s.trim()).find(s=>/^G(?:\s+as\s+\w+)?$/.test(s))?.split(/\s+as\s+/).pop();
assert.ok(contextName,'actual context binding');
async function rig(){
 const f=await fixture(),input=new f.Input({}),calls=[];
 const Game=vm.runInNewContext(`class Game{${method}};Game`,{[contextName]:f.G});
 const game={input,menus:{current:'settings',nav(action){calls.push(action);if(action==='back')this.current=this.current==='settings'?'pause':null;}},pause(){calls.push('pause');},resume(){calls.push('resume');},_padMenus:Game.prototype._padMenus};
 Object.assign(f.G,{mode:'match',match:{state:'playing',paused:true}});
 function frame(buttons=[],axes=[0,0,0,0]){
  f.setPads([{id:'editor-pad',index:0,connected:true,mapping:'standard',axes,buttons:Array.from({length:17},(_,i)=>({pressed:buttons.includes(i),value:buttons.includes(i)?1:0}))}]);
  input.pollPad();game._padMenus();input.endFrame();
 }
 return {input,game,calls,frame};
}
test('#1400 editor owns every menu button and the held stick',async()=>{
 const h=await rig();h.input.mobile.editing=true;
 for(const button of [0,1,2,4,5,9,12,13,14,15]){h.frame([button],[.9,-.9,0,0]);h.frame();}
 assert.deepEqual(h.calls,[]);assert.equal(h.game.menus.current,'settings');
});
test('#1400 close does not replay buttons or held stick; neutral then fresh input works',async()=>{
 const h=await rig();h.input.mobile.editing=true;h.frame([1],[.9,0,0,0]);
 h.input.mobile.editing=false;
 for(let i=0;i<40;i++)h.frame([1],[.9,0,0,0]);
 h.frame([0],[.9,0,0,0]);assert.deepEqual(h.calls,[],'even a new edge waits for the modal hold to end');
 h.frame();h.frame([1]);assert.deepEqual(h.calls,['back']);assert.equal(h.game.menus.current,'pause');
 h.frame();h.frame([9]);assert.deepEqual(h.calls,['back','resume']);
});
test('#1400 disconnect clears the retired editor hold without disabling future pads',async()=>{
 const h=await rig();h.input.mobile.editing=true;h.frame([1]);h.input.mobile.editing=false;
 h.input.pad=null;h.game._padMenus();h.frame();h.frame([1]);assert.deepEqual(h.calls,['back']);
});
test('#1400 ordinary menu navigation remains available without an editor session',async()=>{
 const h=await rig();h.frame([12]);h.frame();h.frame([0]);assert.deepEqual(h.calls,['up','accept']);
});
test('#1400 a modal closed between Game ticks still waits for physical release',async()=>{
 const h=await rig();h.input._layoutPadAwaitNeutral=true;
 h.frame([1]);assert.deepEqual(h.calls,[]);h.frame();h.frame([1]);assert.deepEqual(h.calls,['back']);
});

// Native Menus callback and pause lifecycle; DOM editor construction is a
// fixture surface which sets both native openEditor ownership fields.
for (const closeImmediately of [false,true]) {
 for (const [label,buttons,axes] of [
  ['back',[0,1],[0,0,0,0]],['back-start',[0,1,9],[0,0,0,0]],
  ['shoulder',[0,5],[0,0,0,0]],['left',[0],[-.9,0,0,0]],
  ['right',[0],[.9,0,0,0]],['up',[0],[0,-.9,0,0]],['down',[0],[0,.9,0,0]],
 ]) test(`#1400 same-poll accept→editor${closeImmediately?'→close':''} owns ${label}`,async()=>{
  const h=await pauseBoot();h.game._padMenus=vm.runInNewContext('({'+method+'})._padMenus',{[contextName]:h.G});
  h.game.pause();h.menus.show('settings',{push:true});let opened=0;
  h.menus._binds.set(h.menus._focus,{accept(){opened++;h.input.mobile.editing=true;h.input._layoutPadAwaitNeutral=true;if(closeImmediately)h.input.mobile.editing=false;}});
  const frame=(buttons,axes=[0,0,0,0])=>{const pads=pausePad(buttons);pads[0].axes=axes;h.setPads(pads);h.frame(STEP);};
  frame(buttons,axes);assert.equal(opened,1);assert.equal(h.menus.current,'settings');assert.equal(h.m.paused,true);
  assert.deepEqual(h.navCalls,['accept']);assert.equal(h.input.padMenuPressed.size,0);assert.equal(h.input.padPressed.size,0);
  h.input.mobile.editing=false;frame(buttons,axes);assert.deepEqual(h.navCalls,['accept']);
  frame([]);frame([1]);assert.equal(h.menus.current,'pause');assert.equal(h.m.paused,true);
  frame([]);frame([9]);assert.equal(h.m.paused,false);assert.equal(h.menus.current,null);
 });
}
