import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fixture } from '../../patches/splatoon3/tests/source-fixture.mjs';
const source=fs.readFileSync(new URL('../check-inkwave-rematch-lifecycle.mjs',import.meta.url),'utf8');
const callback=source.match(/await until\((\(\) => \{ const m = window\.__G\.match;[^\n]+?\}), null, 300000, 'battle playing[^']*'/)?.[1];
assert.ok(callback,'actual lifecycle battle-start predicate');
async function rig(){
 const f=await fixture("export { Match } from './inkwave-public/src/game/match.js';");
 const m=new f.Match({duration:180,mode:'turf'});
 Object.assign(m,{state:'intro',stateT:4.2,actors:[],local:{alive:true},controller:{enabled:false,menuBlocked:false,update(){}}});f.G.match=m;
 const ready=vm.runInNewContext(callback,{window:{__G:f.G}});
 const tick=()=>{m.updateController(1/60);m.update(1/60);};
 return {m,ready,tick};
}
test('the old phase-only poll accepts the native intro transition before controller admission',async()=>{
 const h=await rig();h.tick();assert.equal(h.m.state,'playing');assert.equal(h.m.time,180);assert.equal(h.m.controller.enabled,false);
 assert.equal(h.m.state==='playing',true);assert.equal(h.ready(),false);
 h.tick();assert.equal(h.ready(),true);assert.equal(h.m.controller.enabled,true);assert.ok(h.m.time<180);
});
test('wall-clock polling cannot stand in for a completed native simulation tick',async()=>{
 const h=await rig();h.tick();for(let i=0;i<120;i++)assert.equal(h.ready(),false);
 h.tick();assert.equal(h.ready(),true);
});
test('the new readiness poll does not mask broken controller admission or a different phase',async()=>{
 const h=await rig();h.tick();h.tick();h.m.controller.enabled=false;assert.equal(h.ready(),true);
 assert.match(source,/play\.controller\?\.enabled && !play\.controller\.blocked && play\.controller\.local && play\.rigFollowsLocal/);
 assert.equal(h.m.controller.enabled,false,'unchanged later owner assertion still rejects this state');
 h.m.state='results';assert.equal(h.ready(),false);h.m.state='playing';h.m.attract=true;assert.equal(h.ready(),false);
});

const ringCallback=source.match(/const focusRingSettled = (\(\) => \{[\s\S]+?\n\});/)?.[1];
assert.ok(ringCallback,'actual lifecycle ring-settled predicate');
function ringRig(){
 const m={_cur:{on:true,x:{x:13},y:{x:23},w:{x:94}},_focus:{isConnected:true,dataset:{nav:'button'},getBoundingClientRect:()=>({left:20,top:30,width:80})},cursorEl:{}};
 const style={visibility:'visible',display:'block',opacity:'1'};
 const ready=vm.runInNewContext(ringCallback,{window:{__inkwave:{menus:m}},getComputedStyle:()=>style});
 return {m,style,ready};
}
test('rematch waits for both native cursor placement and computed visible entrance',()=>{
 const {m,style,ready}=ringRig();assert.equal(ready(),true);
 m._cur.on=false;assert.equal(ready(),false);m._cur.on=true;
 for(const [key,value] of [['visibility','hidden'],['display','none'],['opacity','0'],['opacity','0.6']]){
  const old=style[key];style[key]=value;assert.equal(ready(),false,key+' '+value);style[key]=old;
 }
 for(const axis of ['x','y','w']){const old=m._cur[axis].x;m._cur[axis].x+=1;assert.equal(ready(),false,axis);m._cur[axis].x=old;}
 m._focus.isConnected=false;assert.equal(ready(),false);
});
test('touch return and keyboard handoff retain the same strict ring acceptance',()=>{
 assert.match(source,/until\(focusRingSettled, null, 30000, 'touch button selection aligned to focus'\)/);
 assert.match(source,/until\(focusRingSettled, null, 30000, 'keyboard selection aligned to focus'\)/);
 assert.match(source,/menu\.focusConnected === true && menu\.ringOn && menu\.ringVisible && menu\.ringOnFocus === true/);
});
