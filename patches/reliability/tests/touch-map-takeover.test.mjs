import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './controls-fixture.mjs';
const DT=1/60;
const pad=(buttons=[],axes=[0,0,0,0])=>[{index:0,id:'pad',connected:true,mapping:'standard',axes,buttons:Array.from({length:17},(_,i)=>({pressed:buttons.includes(i),value:buttons.includes(i)?1:0}))}];
async function rig(){
 const f=await fixture(),input=new f.Input({}),a=f.make(),camera={yaw:0,pitch:0,mapK:0},c=new f.PlayerController(a,camera,input);c.computeAim=()=>{};f.G.rig=camera;f.G.actors=[a];f.G.settings={...f.DEFAULT_SETTINGS,aimAssist:0};
 const m=input.mobile,classes=new Set();Object.assign(m,{active:true,visible:true,root:{querySelectorAll:()=>[],classList:{toggle(k,v){v?classes.add(k):classes.delete(k);}}}});input.lastDevice='touch';
 function update(){c.update(DT);input.endFrame();}
 function open(){input.lastDevice='touch';m.setMap(true);update();assert.equal(c.mapHeld,true);}
 function key(code,type='keydown'){f.event(type,{code,repeat:false,preventDefault(){}});}
 function poll(buttons=[],axes=[0,0,0,0]){f.setPads(pad(buttons,axes));input.pollPad();}
 return {...f,input,a,c,camera,m,classes,open,key,poll,update};
}
test('#571 keyboard takeover closes the touch latch and restores camera/fire/sub',async()=>{
 const h=await rig();h.open();h.key('KeyW');assert.equal(h.m.mapOpen,false);assert.equal(h.m.buttons.map,false);assert.equal(h.classes.has('is-map'),false);h.input.locked=true;h.input.mouse.dx=20;h.input.mouse.left=true;h.input.mouse.right=true;h.update();assert.equal(h.c.mapHeld,false);assert.notEqual(h.camera.yaw,0);assert.equal(h.a.intent.fire,true);assert.equal(h.a.intent.sub,true);
});
test('#571 deliberate pad takeover closes touch map and restores pad camera/actions',async()=>{
 const h=await rig();h.open();h.poll([5,7],[.8,0,.8,0]);h.update();assert.equal(h.input.navigationDevice,'pad');assert.equal(h.m.mapOpen,false);assert.equal(h.c.mapHeld,false);assert.notEqual(h.camera.yaw,0);assert.equal(h.a.intent.fire,true);assert.equal(h.a.intent.sub,true);
});
test('#571 keyboard map hold and standard pad toggle retain their own close controls',async()=>{
 const h=await rig();h.open();h.key('KeyM');h.update();assert.equal(h.m.mapOpen,false);assert.equal(h.c.mapHeld,true);h.key('KeyM','keyup');h.update();assert.equal(h.c.mapHeld,false);
 h.open();h.poll([3]);h.update();assert.equal(h.m.mapOpen,false);assert.equal(h.c.mapHeld,true);h.poll([]);h.update();h.poll([3]);h.update();assert.equal(h.c.mapHeld,false);
});
test('#571 unchanged held pad axes do not revoke touch map; fresh same-owner pad input does',async()=>{
 const h=await rig(),axes=[.9,-.5,.8,.7];h.poll([],axes);h.update();h.open();h.poll([],axes);h.update();assert.equal(h.input.lastDevice,'pad');assert.equal(h.input.navigationDevice,'touch');assert.equal(h.m.mapOpen,true);assert.equal(h.c.mapHeld,true);
 h.poll([0],axes);h.update();assert.equal(h.input.navigationDevice,'pad');assert.equal(h.m.mapOpen,false);assert.equal(h.c.mapHeld,false);
});
test('#571 pointer cancellation and touch-only toggles retain the same touch map owner',async()=>{
 const h=await rig();h.open();h.m.resetPointers();h.m.onDeviceChange();h.update();assert.equal(h.m.mapOpen,true);assert.equal(h.c.mapHeld,true);h.m.setMap(false);h.update();assert.equal(h.c.mapHeld,false);h.m.setMap(true);h.update();assert.equal(h.c.mapHeld,true);h.m.reset();h.update();assert.equal(h.c.mapHeld,false);
});
test('#571 closed maps have no spurious open transition on alternating input owners',async()=>{
 const h=await rig();for(const owner of ['kbm','pad','touch','pad','kbm']){h.input.lastDevice=owner;h.update();assert.equal(h.m.mapOpen,false);assert.equal(h.c.mapHeld,false);}
});
