import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture} from './controls-fixture.mjs';
const STEP=1/60;
const padState=(held=[])=>[{index:0,id:'hybrid',mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},(_,i)=>({pressed:held.includes(i),value:held.includes(i)?1:0}))}];
const event=(id,x,y,type='pointerdown')=>({pointerType:'touch',pointerId:id,clientX:x,clientY:y,type,target:{closest(){return null;}},cancelable:true,preventDefault(){},stopPropagation(){}});
async function setup(weapon){
 const f=await fixture({match:true,fidelity:true,network:true});f.installWeaponsFidelity(f,f.profile);
 const canvas={ownerDocument:{hidden:false}},input=new f.Input(canvas),mobile=input.mobile,classes={toggle(){},add(){},remove(){},contains(n){return n==='is-active';}};
 Object.assign(mobile,{active:true,visible:true,root:{classList:classes,setPointerCapture(){},querySelectorAll(){return[];}},els:{fire:{classList:classes},sub:{classList:classes}},_stickHome:{x:100,y:400,d:100},_stickR:50,_H:700});
 const a=f.make(weapon),camera={yaw:0,pitch:0},controller=new f.PlayerController(a,camera,input);controller.computeAim=()=>{};a.isLocal=true;a.nid=1;a.owner='B';
 const m=new f.Match({duration:100,mode:'turf'});Object.assign(m,{local:a,actors:[a],controller,follower:true,time:100,state:'playing'});
 Object.assign(f.G,{match:m,rig:camera,actors:[a],settings:{...f.DEFAULT_SETTINGS,aimAssist:0},mode:'match'});
 let bombs=0;Object.assign(f.G.projectiles,{throwBomb(){bombs++;},update(){},list:[],bombs:[],clouds:[],beams:[],sights:new Map()});f.G.paint.coverage=()=>[.9,.1];
 const poll=(...held)=>{f.setPads(padState(held));input.pollPad();};
 const frame=(n=1,...held)=>{for(let i=0;i<n;i++){poll(...held);f.G.time+=STEP;m.updateController(STEP);m.update(STEP);input.endFrame();}};
 const press=(button,id=7)=>{mobile._hitButton=()=>button;mobile._down(event(id,700,400));};
 return {...f,input,mobile,a,m,poll,frame,press,bombs:()=>bombs};
}

for(const button of ['fire','sub'])test(`#990 fresh pad button edge cannot take ownership while a touch ${button} finger is down`,async()=>{
 const h=await setup('shooter');h.poll();h.input.lastDevice='touch';h.press(button);
 assert.equal(h.mobile.down(button),true);
 h.poll(0);
 assert.equal(h.input.lastDevice,'touch');assert.equal(h.mobile.down(button),true,'the physical hold survives the pad press');
 assert.equal(h.input.padPressed.has(0),true,'the edge is still recorded physically');
 h.poll();h.poll(0);assert.equal(h.input.lastDevice,'touch','repeated presses keep deferring while the finger is down');
});

test('#990 after the last contact ends a fresh pad button claims ownership normally',async()=>{
 const h=await setup('shooter');h.poll();h.input.lastDevice='touch';h.press('fire',1);h.press('fire',2);
 h.poll(0);assert.equal(h.input.lastDevice,'touch');
 h.mobile._up(event(1,700,400,'pointerup'));h.poll();h.poll(0);assert.equal(h.input.lastDevice,'touch','a second finger still protects the hold');
 h.mobile._up(event(2,700,400,'pointerup'));h.poll();h.poll(0);assert.equal(h.input.lastDevice,'pad');
});

test('#990 touch-held Charger FIRE is not released as a shot by an unrelated pad button',async()=>{
 const h=await setup('charger');h.poll();h.input.lastDevice='touch';h.press('fire');
 h.frame(20);const r=h.a.weaponRunner;assert.equal(r.charging,true);assert.equal(h.shots.length,0);
 h.frame(5,0);assert.equal(h.input.lastDevice,'touch');assert.equal(r.charging,true);assert.equal(h.shots.length,0,'takeover alone fires nothing');
 h.mobile._up(event(7,700,400,'pointerup'));h.frame(3);assert.equal(h.shots.length,1,'a real finger release still fires once');
});

test('#990 touch-held SUB is not thrown by an unrelated pad button, but a real release throws once',async()=>{
 const h=await setup('shooter');h.poll();h.input.lastDevice='touch';h.press('sub');
 h.frame(10);assert.equal(h.a.weaponRunner.aimingSub,true);
 h.frame(5,0);assert.equal(h.input.lastDevice,'touch');assert.equal(h.bombs(),0);
 h.mobile._up(event(7,700,400,'pointerup'));h.frame(3);assert.equal(h.bombs(),1);
});

test('#990 with no touch contact a fresh pad button still takes ownership immediately',async()=>{
 const h=await setup('shooter');h.input.lastDevice='touch';h.poll();h.poll(0);assert.equal(h.input.lastDevice,'pad');
});
