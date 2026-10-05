import {adoptCanvasTouch} from '../../local-quality/first-touch-adapter.mjs';
import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture} from './controls-fixture.mjs';
const pad=v=>[{index:0,id:'hybrid',mapping:'standard',connected:true,axes:[v,0,v,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))}];
const event=(id,x,y,type='pointerdown')=>({pointerType:'touch',pointerId:id,clientX:x,clientY:y,type,target:{closest(){return null;}},cancelable:true,preventDefault(){},stopPropagation(){}});
async function setup(){const f=await fixture(),canvas={ownerDocument:{hidden:false}},input=new f.Input(canvas),mobile=input.mobile,classes={toggle(){},add(){},remove(){},contains(n){return n==='is-active';}};Object.assign(mobile,{active:true,visible:true,root:{classList:classes,setPointerCapture(){},querySelectorAll(){return[];}},els:{fire:{classList:classes}},_stickHome:{x:100,y:400,d:100},_stickR:50,_H:700});return {...f,canvas,input,mobile,poll(v=.5){f.setPads(pad(v));input.pollPad();}};}
for(const kind of ['fire','stick','look'])test(`#497 native ${kind} contact survives300 held-axis polls and releases ownership once`,async()=>{
 const f=await setup();f.poll();assert.equal(f.input.lastDevice,'pad');f.mobile._hitButton=()=>kind==='fire'?'fire':null;const e=event(7,kind==='stick'?100:700,400);e.target=f.canvas;f.event('pointerdown',e);assert.equal(adoptCanvasTouch(f.mobile,e),true);assert.equal(adoptCanvasTouch(f.mobile,e),false);if(kind==='stick')f.mobile._move(event(7,130,400,'pointermove'));assert.equal(f.input.lastDevice,'touch');
 for(let i=0;i<300;i++){f.poll();assert.equal(f.input.lastDevice,'touch');if(kind==='fire')assert.equal(f.mobile.down('fire'),true);if(kind==='stick'){assert.equal(f.mobile._stick.id,7);assert.ok(f.mobile.moveX>0);}if(kind==='look')assert.ok(f.mobile._ptr.has(7));}
 if(kind==='look'){f.mobile._move(event(7,730,415,'pointermove'));assert.ok(f.mobile.lookDX>0);}
 f.mobile._up(event(7,700,400,'pointerup'));f.poll();assert.equal(f.input.lastDevice,'pad');assert.equal(f.mobile._ptr.size,0);assert.equal(f.mobile._stick.id,-1);assert.equal(f.input.padPressed.size,0);
});
test('#497 cancel/lost-capture ends final-contact ownership, while another live finger still protects it',async()=>{
 for(const type of ['pointercancel','lostpointercapture']){const f=await setup();f.poll();f.mobile._hitButton=()=> 'fire';f.mobile._down(event(1,700,400));f.mobile._down(event(2,700,400));f.mobile._up(event(1,700,400,type));f.poll();assert.equal(f.input.lastDevice,'touch');assert.equal(f.mobile.down('fire'),true);f.mobile._up(event(2,700,400,type));f.poll();assert.equal(f.input.lastDevice,'pad');assert.equal(f.mobile.down('fire'),false);assert.equal(f.mobile.pressed.has('fire'),false);}
});
test('#497 untouched polling threshold and #475 gameplay exclusion stay independent',async()=>{
 const f=await setup();f.mobile._hitButton=()=>null;f.mobile._down(event(1,700,400));for(const v of [.2,.5,1]){f.poll(v);assert.equal(f.input.lastDevice,'touch');const out={};f.input.padStick(0,1,out,.14,.95);assert.equal(out.mag,0);assert.equal(f.input.padAxis(2),0);}f.mobile._up(event(1,700,400,'pointerup'));f.poll(.2);assert.equal(f.input.lastDevice,'touch');f.poll(.5);assert.equal(f.input.lastDevice,'pad');
});
test('#497 twenty repeated touch/pad transitions retain release cleanup without owner thrash',async()=>{
 const f=await setup();f.mobile._hitButton=()=> 'fire';for(let n=0;n<20;n++){f.poll();f.mobile._down(event(n,700,400));for(let i=0;i<10;i++)f.poll();assert.equal(f.mobile.down('fire'),true);f.mobile._up(event(n,700,400,'pointercancel'));f.poll();assert.equal(f.input.lastDevice,'pad');assert.equal(f.mobile.down('fire'),false);assert.equal(f.mobile._pendingEdges.size,0);}
});
