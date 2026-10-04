import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fixture } from './controls-fixture.mjs';
import { composed } from './pause-fixture.mjs';
const STEP=1/60;
const pad=(held=[],mapping='standard')=>[{connected:true,mapping,axes:[0,0,0,0],buttons:Array.from({length:17},(_,i)=>({pressed:held.includes(i),value:held.includes(i)?1:0}))}];
const node=()=>({style:{},classList:{values:new Set(),toggle(k,v){v?this.values.add(k):this.values.delete(k);},add(){},remove(){}},setAttribute(){},querySelector(){return node();}});
async function rig(){
 const f=await fixture(),input=new f.Input({}),a=f.make(),camera={yaw:0,pitch:0},c=new f.PlayerController(a,camera,input);c.computeAim=()=>{};
 const allies=[f.make(),f.make(),f.make()];f.G.settings={...f.DEFAULT_SETTINGS,aimAssist:0};f.G.actors=[a,...allies];f.G.rig=camera;f.G.match={controller:c,playing:()=>true};
 f.G.level.spawnPads=[new f.THREE.Vector3(3,0,4)];
 function frame(held=[],mapping='standard'){f.setPads(pad(held,mapping));input.pollPad();c.update(STEP);input.endFrame();}
 return {...f,input,a,allies,c,camera,frame};
}
for(const [button,index]of [[14,0],[12,1],[15,2],[13,3]])test(`#391 D-pad ${button} selects ${index}; standard right-face A alone commits`,async()=>{
 const h=await rig();h.frame([3]);h.frame([button]);assert.equal(h.c.padJumpIndex,index);assert.equal(h.a.superJumpState,null);
 h.frame([button]);assert.equal(h.a.superJumpState,null);h.frame([1]);assert.equal(h.a.superJumpState.phase,'charge');
 if(index===3)assert.deepEqual([...h.a.superJumpState.target.toArray()],[3,0,4]);else assert.equal(h.a.superJumpState.target,h.allies[index]);
 assert.equal(h.c.padJumpIndex,-1);assert.equal(h.c.mapHeld,false);
});
test('#391 held A plus fresh direction confirms once; bottom-face B does not',async()=>{
 const h=await rig();h.frame([3]);h.frame([14,0]);assert.equal(h.a.superJumpState,null);h.frame([1]);assert.ok(h.a.superJumpState);
 const q=await rig();q.frame([3,1]);assert.equal(q.a.superJumpState,null);q.frame([1,13]);assert.ok(q.a.superJumpState);
});
test('#391 close, disabled, owner switch and missing/dead targets never jump to a replacement',async()=>{
 for(const action of ['close','disable','owner','dead','removed']){
  const h=await rig();h.frame([3]);h.frame([14]);
  if(action==='close'){h.frame([3]);h.frame([1]);}
  if(action==='disable'){h.c.enabled=false;h.frame([1]);h.c.enabled=true;h.frame();h.frame([3,1]);}
  if(action==='owner'){h.input.lastDevice='touch';h.c.update(STEP);h.frame([1]);}
  if(action==='dead'){h.allies[0].alive=false;h.frame([1]);}
  if(action==='removed'){h.G.actors=[h.a,h.allies[1],h.allies[2]];h.frame([1]);}
  assert.equal(h.a.superJumpState,null,action);
 }
});
test('#391 selection tracks the same actor across roster reorder; raw/keyboard/touch direct paths remain',async()=>{
 const h=await rig();h.frame([3]);h.frame([14]);h.G.actors=[h.a,h.allies[1],h.allies[0],h.allies[2]];h.frame();assert.equal(h.c.padJumpIndex,1);h.frame([1]);assert.equal(h.a.superJumpState.target,h.allies[0]);
 const raw=await rig();raw.frame([8,14],'');assert.equal(raw.a.superJumpState.target,raw.allies[0]);
 const key=await rig();key.input.keys.add('Tab');key.input.pressed.add('Digit2');key.frame();assert.equal(key.a.superJumpState.target,key.allies[1]);
 const mobile=await rig(),m=touch(mobile);m.mapOpen=true;m.jumpTarget=2;mobile.c.update(STEP);assert.equal(mobile.a.superJumpState.target,mobile.allies[2]);
 const out=await rig();out.frame([14,1]);assert.equal(out.a.superJumpState,null);
});
test('#391 menu-owned confirm hold cannot leak into map confirmation',async()=>{
 const h=await rig();h.frame([3]);h.frame([14]);h.setPads(pad([1]));h.input.pollPad();h.input.consumePadMenuButton(1);h.c.update(STEP);assert.equal(h.a.superJumpState,null);
 h.frame([1]);assert.equal(h.a.superJumpState,null);h.frame();h.frame([1]);assert.ok(h.a.superJumpState);
});
test('#391 pending D-pad and A edges retain select/confirm ordering through 30/60/120/144Hz clock',async()=>{
 for(const hz of [30,60,120,144]){
  const h=await rig();h.installClock(h);h.camera.mode='follow';h.camera.target=h.a;const rows=[];
  const match={state:'playing',local:h.a,controller:h.c,updateController:dt=>h.c.update(dt),update(){rows.push(!!h.a.superJumpState);}};
  h.G.projectiles.update=()=>{};const game={input:h.input,rig:h.camera,match,_padMenus(){}};
  for(let f=0;f<hz;f++){const t=f/hz,held=t<1/6?[3]:t<1/3?[14]:t<.5?[]:t<2/3?[1]:[];h.setPads(pad(held));h.runSimulation(game,1/hz);}
  assert.equal(rows.findIndex(Boolean),30,`${hz}Hz confirmation tick`);
 }
});
function touch(h){
 const m=h.input.mobile;Object.assign(m,{active:true,visible:true,root:{...node(),querySelectorAll:()=>[]},els:{cameraReset:node()},_safeBox:{l:8,r:8,t:6,b:6}});h.input.lastDevice='touch';return m;
}
for(const enabled of [false,true])test(`#421 touch reset shares Y path with gyro ${enabled?'on':'off'} and discards stale samples`,async()=>{
 const h=await rig(),m=touch(h),g=m.gyro;g.enabled=enabled;h.a.yaw=1.2;h.camera.yaw=-2;h.camera.pitch=.8;m.lookDX=.4;m.lookDY=.3;g.dYaw=.4;g.dPitch=.5;
 const original=h.c.resetCamera;let calls=0;h.c.resetCamera=function(){calls++;return original.call(this);};
 m._press('cameraReset',{});h.c.update(STEP);h.input.endFrame();assert.equal(calls,1);assert.equal(h.camera.yaw,h.a.yaw);assert.equal(h.camera.pitch,0);assert.equal(g.enabled,enabled);assert.equal(m.lookDX,0);assert.equal(m.lookDY,0);
 g._orientation({alpha:170,beta:55,gamma:35,timeStamp:1000});h.c.update(STEP);assert.equal(h.camera.yaw,h.a.yaw);assert.equal(h.camera.pitch,0,'first new attitude is baseline, not a jump');
 m._press('cameraReset',{});h.c.update(STEP);h.input.endFrame();assert.equal(calls,2);
 h.frame([2]);assert.equal(calls,3,'same shared function for standard Y');
});
test('#421 disabled/reset lifecycle drops pending recenter and retains independent control layout',async()=>{
 const h=await rig(),m=touch(h);h.camera.pitch=.7;m._press('cameraReset',{});h.c.enabled=false;h.c.update(STEP);h.c.enabled=true;h.c.update(STEP);assert.equal(h.camera.pitch,.7);
 const old={...m._box('fire')};m.layout.cameraReset={ax:'l',ay:'b',dx:.5,dy:.4,s:1.3};const moved=m._box('cameraReset');assert.ok(moved.x<500);assert.ok(moved.y>350);assert.deepEqual({...m._box('fire')},old);
 m._press('cameraReset',{});m.reset();assert.equal(m.wasPressed('cameraReset'),false);
});
test('#391 actual HUD beacon/legend methods highlight the controller selection without virtual-mouse interference',async()=>{
 const h=await rig();h.frame([3]);h.frame([12]);h.input.locked=true;
 const code=composed('src/ui/hud.js',true),start=code.indexOf('  _updBeacons('),end=code.indexOf('\n  _jumpTo(',start);
 const HUD=vm.runInNewContext(`class HUD {${code.slice(start,end)}}; HUD`,{G:h.G,clamp:(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),richText:x=>x,document:{documentElement:{lang:'en'}},weaponIcon:()=>'',kindOf:x=>x,tr:x=>x});
 h.G.input=h.input;const hud=new HUD(),foot=node();
 const beacons=[0,1,2,3].map(()=>({...node(),firstChild:node()})),legendRows=[0,1,2,3].map(node);
 Object.assign(hud,{_map:{open:true,hover:-1,cx:.5,cy:.5,sx:.2,sy:.8,pressT:0},_L:{},_mapT:1,map:node(),mapCursor:node(),mapLegend:{querySelector:()=>foot},mapJumpLine:{...node(),firstChild:{...node(),firstChild:node()}},beacons,legendRows,_local:()=>h.a,_beaconTargets:()=>[0,1,2,3].map(i=>({x:.2+i*.2,y:.2,name:'ally'+i,weapon:'shooter',ok:true})),_snd(){},_restart(){}});
 hud._updBeacons(500,400,STEP);assert.equal(hud._map.hover,1);assert.ok(beacons[1].classList.values.has('is-hover'));assert.ok(legendRows[1].classList.values.has('is-hover'));assert.ok(!hud.mapCursor.classList.values.has('is-on'));assert.match(foot.innerHTML,/A confirms/);
});
