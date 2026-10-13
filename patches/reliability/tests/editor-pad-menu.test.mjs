import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fixture } from './controls-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const site=process.env.INKWAVE_CONTROLS_SITE;
const raw=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8');
const code=site?fs.readFileSync(path.join(site,'src/main.js'),'utf8'):adaptBuildSource('src/main.js',raw);
const start=code.search(/\b_padMenus\(\)\s*\{/),end=code.indexOf('_updateHud(',start);
assert.ok(start>=0&&end>start,'actual Game pad router boundaries');
const method=code.slice(start,end).trim();
async function rig(){
 const f=await fixture(),input=new f.Input({}),calls=[];
 const Game=vm.runInNewContext(`class Game{${method}};Game`,{G:f.G});
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
