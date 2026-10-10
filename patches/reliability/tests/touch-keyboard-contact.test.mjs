import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './controls-fixture.mjs';
import {resetPlatformInput} from '../../local-quality/platform-input.mjs';
const event=(id,x=700,y=400,type='pointerdown')=>({pointerType:'touch',pointerId:id,clientX:x,clientY:y,type,target:{closest(){return null;}},cancelable:true,preventDefault(){},stopPropagation(){}});
async function setup(){const f=await fixture(),input=new f.Input({}),m=input.mobile,classes={toggle(){},add(){},remove(){},contains:n=>n==='is-active'};Object.assign(m,{active:true,visible:true,root:{classList:classes,setPointerCapture(){},querySelectorAll:()=>[]},els:{fire:{classList:classes}},_stickHome:{x:100,y:400,d:100},_stickR:50,_H:700});const a=f.make(),camera={yaw:0,pitch:0,mapK:0},c=new f.PlayerController(a,camera,input);c.computeAim=()=>{};f.G.rig=camera;f.G.settings={...f.DEFAULT_SETTINGS,aimAssist:0};f.G.actors=[a];
 const key=(code,repeat=false)=>f.event('keydown',{code,repeat,preventDefault(){}});
 const down=(kind,id=7)=>{input.lastDevice='touch';m._hitButton=()=>kind==='fire'?'fire':null;m._down(event(id,kind==='stick'?100:700));if(kind==='stick')m._move(event(id,130,400,'pointermove'));};
 return {...f,input,m,a,c,camera,key,down};}
for(const kind of ['fire','stick','look'])for(const code of ['KeyW','F13'])test(`#567 ${kind} contact survives fresh ${code} and still drives native controls`,async()=>{
 const h=await setup();h.down(kind);const fire=h.m.down('fire'),ptr=h.m._ptr.get(7),stick=h.m._stick.id;h.key(code);assert.equal(h.input.lastDevice,'touch');assert.equal(h.input.navigationDevice,'touch');assert.ok(h.input.keys.has(code));assert.ok(h.input.pressed.has(code));assert.equal(h.m._ptr.get(7),ptr);assert.equal(h.m._stick.id,stick);assert.equal(h.m.down('fire'),fire);
 h.m._move(event(7,kind==='stick'?140:730,415,'pointermove'));h.c.update(1/60);if(kind==='fire')assert.equal(h.a.intent.fire,true);if(kind==='look')assert.notEqual(h.camera.yaw,0);if(kind==='stick'||code==='KeyW')assert.ok(h.a.intent.move.length()>0);
 h.m._up(event(7,700,400,'pointerup'));h.key('KeyD');assert.equal(h.input.lastDevice,'kbm');assert.equal(h.m._ptr.size,0);assert.equal(h.m._stick.id,-1);assert.equal(h.m.down('fire'),false);
});
test('#567 keyboard-first and touch-first yield the same simultaneous movement/fire state',async()=>{
 const rows=[];for(const keyboardFirst of [false,true]){const h=await setup();if(keyboardFirst)h.key('KeyW');h.down('fire');if(!keyboardFirst)h.key('KeyW');h.c.update(1/60);rows.push([h.input.lastDevice,h.a.intent.fire,...h.a.intent.move.toArray()]);}assert.deepEqual(rows[0],rows[1]);
});
for(const type of ['pointercancel','lostpointercapture'])test(`#567 ${type} only releases its contact and permits later keyboard takeover`,async()=>{
 const h=await setup();h.down('fire',1);h.down('fire',2);h.m._up(event(1,700,400,type));h.key('KeyW');assert.equal(h.input.lastDevice,'touch');assert.equal(h.m.down('fire'),true);h.m._up(event(2,700,400,type));h.key('KeyD');assert.equal(h.input.lastDevice,'kbm');assert.equal(h.m.down('fire'),false);assert.equal(h.m._pendingEdges.size,0);
});
test('#567 consumed menu keys still reach onKey and platform reset still neutralizes held input',async()=>{
 const h=await setup();h.down('fire');const calls=[];h.input.onKey=(e,repeat)=>{calls.push([e.code,repeat]);return true;};h.key('Escape');assert.deepEqual(calls,[['Escape',false]]);assert.equal(h.input.keys.has('Escape'),false);assert.equal(h.m.down('fire'),true);
 h.input.onKey=null;h.key('KeyW');h.event('blur',{});resetPlatformInput(h.input,h.c);assert.equal(h.input.keys.size,0);assert.equal(h.input.pressed.size,0);assert.equal(h.m._ptr.size,0);assert.equal(h.m.down('fire'),false);h.key('KeyD');assert.equal(h.input.lastDevice,'kbm');
});
