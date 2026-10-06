import test from 'node:test';
import assert from 'node:assert/strict';
const built=process.env.INKWAVE_INPUT_POLICY_SITE;
const module=built?await import('./input-policy-emitted-fixture.mjs'):null;
const cls=()=>({add(){},remove(){},toggle(){}}),STEP=1/60;
async function rig(){
 const f=await module.fixture(),input=new f.Input({}),a=f.make(),camera={yaw:0,pitch:0,mode:'follow',target:a},c=new f.PlayerController(a,camera,input);
 c.computeAim=()=>{};f.G.settings={...f.DEFAULT_SETTINGS,aimAssist:0};f.G.rig=camera;f.G.actors=[a];
 const env=input.constructor.constructor('return globalThis')();
 return {...f,input,a,c,camera,env};
}
const pad=(index,buttons=[],axes=[0,0,0,0])=>({index,id:'controller'+index,connected:true,mapping:'standard',axes,buttons:Array.from({length:17},(_,i)=>({pressed:buttons.includes(i),value:buttons.includes(i)?1:0}))});

for(const hz of [30,60,120])test(`${hz}Hz emitted page focus gates gamepad authority`,{skip:!built},async()=>{
 const h=await rig(),owner=h.getPlatformLifecycle(),poll=()=>{h.input.pollPad();h.c.update(1/hz);};
 try{
  h.setPads([pad(0)]);poll();h.input.endFrame();h.input.lastDevice='touch';h.event('blur',{});poll();
  h.setPads([pad(0,[0,3,5,6,7,11],[.8,0,.9,.6])]);
  const neutral=()=>{assert.equal(h.camera.yaw,0);assert.equal(h.camera.pitch,0);assert.equal(h.a.intent.move.length(),0);for(const k of ['fire','jump','squid','sub','special'])assert.equal(h.a.intent[k],false);};
  for(let i=0;i<hz;i++){poll();neutral();}
  assert.equal(owner.focused,false);assert.equal(owner.state,'ACTIVE');assert.equal(h.input.lastDevice,'touch');
  h.event('focus',{});for(let i=0;i<3;i++){poll();neutral();assert.equal(h.input.padPressed.size,0);}
  h.setPads([pad(0)]);poll();h.setPads([pad(0,[0,7],[.8,0,.9,.6])]);poll();
  assert.notEqual(h.camera.yaw,0);assert.ok(h.a.intent.move.length()>0);assert.equal(h.a.intent.fire,true);assert.equal(h.input.lastDevice,'pad');
 }finally{owner.dispose();}
});

test('actual emitted input policy boundaries', {skip:!built},async()=>{
 for(const device of ['kbm','pad']){
  const h=await rig(),m=h.input.mobile,g=m.gyro;Object.assign(m,{active:true,visible:true,root:{classList:cls(),querySelectorAll:()=>[]},_gyroWanted:true});m.s.gyro=true;g.enabled=true;h.input.lastDevice='touch';
  if(device==='kbm')h.event('keydown',{code:'KeyW',preventDefault(){}});else{h.setPads([pad(0,[0])]);h.input.pollPad();}
  g.dYaw=.25;g.dPitch=.1;h.c.update(STEP);assert.equal(h.camera.yaw,0);assert.equal(h.camera.pitch,0);assert.equal(g.dYaw,0);
  h.input.locked=true;h.env.document.pointerLockElement=h.input.canvas;
  let exits=0,unlocks=0;h.env.document.exitPointerLock=()=>{exits++;};h.input.onUnlock=()=>{unlocks++;};
  h.event('pointerdown',{pointerType:'touch'});assert.equal(h.input.locked,false);assert.equal(exits,1);
  g.dYaw=.2;g.dPitch=.15;h.event('mousemove',{movementX:100,movementY:50});h.c.update(STEP);
  assert.equal(h.camera.yaw,.2);assert.equal(h.camera.pitch,.15);assert.equal(m._gyroWanted,true);
  h.env.document.pointerLockElement=null;h.event('pointerlockchange',{});h.event('pointerlockchange',{});
  assert.equal(h.input._touchUnlockPending,false);assert.equal(unlocks,0);
 }
 for(const denied of ['accelerometer','gyroscope']){
  const h=await rig(),m=h.input.mobile;h.env.DeviceOrientationEvent={};h.env.DeviceMotionEvent={};h.env.document.permissionsPolicy={allowsFeature:name=>name!==denied};
  assert.equal(await m.setGyro(true),false);assert.equal(m.gyro.enabled,false);assert.equal(m._gyroWanted,false);assert.equal(m.gyro.platformStatus.reason,'permissions-policy');
 }
 {
  const h=await rig(),a=pad(0),b=pad(1,[0,3,5,6,7,11],[0,0,.8,.4]);h.setPads([a,b]);h.input.pollPad();h.setPads([null,b]);h.input.pollPad();h.c.update(STEP);
  assert.equal(h.input.padPressed.size,0);assert.equal(h.input.padMenuPressed.size,0);assert.equal(h.a.intent.special,false);assert.equal(h.a.intent.fire,false);assert.equal(h.camera.yaw,0);
  b.buttons.forEach(x=>{x.pressed=false;x.value=0;});b.axes.fill(0);h.input.pollPad();b.buttons[11]={pressed:true,value:1};h.input.pollPad();assert.equal(h.input.padPressed.has(11),true);
 }
 {
  const h=await rig();h.installClock(h);h.G.projectiles.update=()=>{};
  const game={input:h.input,rig:h.camera,_padMenus(){},match:{paused:false,updateController:()=>h.c.update(STEP),update:()=>{}}};
  h.setPads([pad(0,[11])]);h.input.pollPad();h.c.padLook.x=.9;
  h.env.navigator.getGamepads=()=>{const e=new Error('blocked');e.name='SecurityError';throw e;};
  h.input.keys.add('KeyW');for(let i=0;i<300;i++)h.runSimulation(game,STEP);
  assert.equal(game.s3Clock.ticks,300);assert.equal(h.input.pad,null);assert.equal(h.a.intent.special,false);assert.equal(h.c.padLook.x,0);assert.ok(h.a.intent.move.length()>0);
 }
});
