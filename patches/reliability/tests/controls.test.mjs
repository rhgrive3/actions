import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fixture } from './controls-fixture.mjs';
import { adaptControls } from '../controls-adapter.mjs';
import { composed } from './pause-fixture.mjs';
const STEP=1/60;
function pad(held=[],axes=[0,0,0,0],mapping='standard') { return [{connected:true,mapping,axes,buttons:Array.from({length:17},(_,i)=>({pressed:held.includes(i),value:held.includes(i)?1:0}))}]; }
async function rig(weapon='shooter') {
  const f=await fixture(), input=new f.Input({}), a=f.make(weapon), camera={yaw:0,pitch:0};
  const c=new f.PlayerController(a,camera,input); c.computeAim=()=>{};
  f.G.settings={...f.DEFAULT_SETTINGS,aimAssist:0}; f.G.rig=camera; f.G.actors=[a]; a.canSuperJump=()=>false;
  a._resolve=()=>{a.grounded=true;};
  function frame({held=[],axes=[0,0,0,0],mapping='standard',simulate=false}={}) {
    f.setPads(pad(held,axes,mapping)); input.pollPad(); c.update(STEP);
    if(simulate) f.tick(a); input.endFrame();
  }
  return {...f,input,a,c,camera,frame};
}
function gyro(h,enabled=true) {
  const sensor={enabled,discard(){this.yaw=this.pitch=0;},resync(){this.resets=(this.resets||0)+1;this.discard();},consume(out){out.yaw=this.yaw||0;out.pitch=this.pitch||0;this.discard();return out;}};
  Object.assign(h.input.mobile,{active:true,root:{classList:{toggle(){},add(){},remove(){}},querySelectorAll:()=>[]},lookDX:0,lookDY:0,moveX:0,moveY:0,mapOpen:false,gyro:sensor});
  return sensor;
}

test('#197 standard top face toggles map, R-stick activates special; other control assignments and raw mapping remain separate',async()=>{
 const h=await rig();h.a.special=h.a.specialCost();
 h.frame({held:[3],simulate:true});assert.equal(h.c.mapHeld,true);assert.equal(h.a.intent.special,false);assert.equal(h.a.specialActive,null);
 h.frame({held:[3],simulate:true});assert.equal(h.c.mapHeld,true);h.frame();assert.equal(h.c.mapHeld,true,'tap keeps map open');
 h.frame({held:[3]});assert.equal(h.c.mapHeld,false);h.frame({held:[8]});assert.equal(h.c.mapHeld,false);
 h.frame({held:[11]});assert.equal(h.a.intent.special,true);assert.equal(h.c.mapHeld,false);
 h.frame({held:[0,5,6,7]});for(const key of ['jump','sub','squid','fire']) assert.equal(h.a.intent[key],true,key);
 h.frame({held:[3],mapping:''});assert.equal(h.a.intent.special,true);assert.equal(h.c.mapHeld,false,'raw layout keeps legacy behavior, no guessed mapping');
 h.frame({held:[8],mapping:''});assert.equal(h.c.mapHeld,true);
});

test('#197 camera reset consumes one standard Y edge, restores heading/neutral pitch and resyncs accumulated gyro',async()=>{
 const h=await rig(),g=gyro(h);h.a.yaw=1.4;h.camera.yaw=-2;h.camera.pitch=.7;h.c.padLook={x:.5,y:.3};g.yaw=.5;g.pitch=.2;
 h.frame({held:[2]});assert.equal(h.camera.yaw,1.4);assert.equal(h.camera.pitch,0);assert.deepEqual({...h.c.padLook},{x:0,y:0});assert.equal(g.resets,1);
 h.camera.pitch=.4;h.frame({held:[2]});assert.equal(h.camera.pitch,.4);assert.equal(g.resets,1,'hold does not repeatedly recenter');
 h.frame();h.camera.yaw=-2;h.frame({held:[2],mapping:''});assert.equal(h.camera.yaw,-2,'raw Y not assumed');
 h.c.enabled=false;h.camera.pitch=.8;h.frame({held:[2]});assert.equal(h.camera.pitch,.8,'menu-blocked controller cannot reset view');
});

test('#276 active gyro owns pitch while stick X retains its exact response; transitions clear filtered Y',async()=>{
 const h=await rig(),control=await rig();const g=gyro(h,true);
 h.frame({axes:[0,0,.5,.7]});control.frame({axes:[0,0,.5,.7]});assert.equal(h.camera.pitch,0);assert.equal(h.camera.yaw,control.camera.yaw);assert.equal(h.c.padLook.y,0);
 g.pitch=.125;h.frame({axes:[0,0,0,.8]});assert.equal(h.camera.pitch,.125,'sensor still owns pitch');
 g.enabled=false;h.frame({axes:[0,0,0,.8]});assert.ok(h.camera.pitch<.125);assert.notEqual(h.c.padLook.y,0);
 g.enabled=true;const pitch=h.camera.pitch;h.frame();assert.equal(h.c.padLook.y,0);assert.equal(h.camera.pitch,pitch);
 g.enabled=false;h.frame();assert.equal(h.camera.pitch,pitch,'no stale low-pass kick when turning gyro off');
});

test('#309 horizontal inversion is independent of vertical inversion and leaves mouse/touch/gyro signs intact',async()=>{
 const normal=await rig(),inverted=await rig();inverted.G.settings.padInvertX=true;
 normal.frame({axes:[0,0,.6,.4]});inverted.frame({axes:[0,0,.6,.4]});assert.equal(inverted.camera.yaw,-normal.camera.yaw);assert.equal(inverted.camera.pitch,normal.camera.pitch);
 for(const h of [normal,inverted]) {h.camera.yaw=h.camera.pitch=0;h.c.padLook.x=h.c.padLook.y=0;h.G.settings.invertY=true;h.frame({axes:[0,0,.6,.4]});}
 assert.equal(inverted.camera.yaw,-normal.camera.yaw);assert.equal(inverted.camera.pitch,normal.camera.pitch);assert.ok(normal.camera.pitch>0);
 for(const device of ['mouse','touch','gyro']) {
  const a=await rig(),b=await rig();b.G.settings.padInvertX=true;
  for(const h of [a,b]) {if(device==='mouse'){h.input.mouse.dx=12;h.input.mouse.dy=5;}else {const g=gyro(h,device==='gyro');if(device==='gyro'){g.yaw=.2;g.pitch=.1;}else{h.input.mobile.lookDX=.2;h.input.mobile.lookDY=.1;}}h.frame();}
  assert.equal(a.camera.yaw,b.camera.yaw,device);assert.equal(a.camera.pitch,b.camera.pitch,device);
 }
});

test('#309 native defaults, setting descriptor and existing save/load retain independent inversion across reload',async()=>{
 const h=await rig();assert.equal(h.DEFAULT_SETTINGS.padInvertX,false);
 const menus=composed('src/ui/menus.js',true);assert.match(menus,/key: 'padInvertX', label: 'Invert right-stick horizontal look', type: 'toggle'/);
 const main=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8');
 const storage=new Map(),context=vm.createContext({localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});
 vm.runInContext(main.slice(main.indexOf('function loadJSON('),main.indexOf('\n',main.indexOf('function saveJSON('))),context);
 const settings={...h.DEFAULT_SETTINGS,padInvertX:true,invertY:false};context.settings=settings;context.defaults=h.DEFAULT_SETTINGS;
 vm.runInContext("saveJSON('inkwave.settings',settings)",context);const loaded=vm.runInContext("loadJSON('inkwave.settings',defaults)",context);
 assert.equal(loaded.padInvertX,true);assert.equal(loaded.invertY,false);
});

for(const weapon of ['charger','shooter']) test(`#265 ${weapon} keeps physical ZR through map open/close and only releases on actual trigger release`,async()=>{
 const h=await rig(weapon);for(let i=0;i<30;i++)h.frame({held:[7],simulate:true});const before=h.shots.length;
 h.frame({held:[3,7],simulate:true});assert.equal(h.c.mapHeld,true);for(let i=0;i<10;i++)h.frame({held:[7],simulate:true});
 assert.equal(h.a.intent.fire,true);if(weapon==='charger')assert.equal(h.shots.length,0);else assert.ok(h.shots.length>before);
 h.frame({held:[3,7],simulate:true});assert.equal(h.c.mapHeld,false);if(weapon==='charger')assert.equal(h.shots.length,0);
 h.frame({simulate:true});if(weapon==='charger')assert.equal(h.shots.filter(x=>x.kind==='charger').length,1);
});

for(const weapon of ['charger','shooter']) test(`#265 keyboard map plus independent ZR does not synthesize a weapon release (${weapon})`,async()=>{
 const h=await rig(weapon);for(let i=0;i<30;i++)h.frame({held:[7],simulate:true});const before=h.shots.length;
 h.input.keys.add('Tab');for(let i=0;i<12;i++)h.frame({held:[7],simulate:true});
 assert.equal(h.c.mapHeld,true);assert.equal(h.a.intent.fire,true);
 if(weapon==='charger')assert.equal(h.shots.length,0);else assert.ok(h.shots.length>before);
 h.input.keys.clear();h.frame({held:[7],simulate:true});if(weapon==='charger')assert.equal(h.shots.length,0);
 h.frame({simulate:true});if(weapon==='charger')assert.equal(h.shots.length,1);
});

test('#265 map selection mouse clicks stay suppressed and normal touch/keyboard input remains admitted outside map',async()=>{
 const h=await rig();h.input.mouse.left=h.input.mouse.leftPressed=true;h.frame({held:[3]});assert.equal(h.a.intent.fire,false);
 h.frame();h.frame({held:[3,7]});assert.equal(h.a.intent.fire,true);assert.equal(h.c.mapHeld,false);
 h.input.keys.add('KeyF');h.frame();assert.equal(h.a.intent.special,true);h.input.keys.clear();
 h.input.keys.add('Tab');h.frame({held:[7]});assert.equal(h.c.mapHeld,true);assert.equal(h.a.intent.fire,true);
 h.c.enabled=false;h.frame({held:[7]});assert.equal(h.a.intent.fire,false);assert.equal(h.c.padMapOpen,false);
});

test('30/60/120Hz render input schedules preserve identical map toggles and real Charger release ticks',async()=>{
 let expected;
 for(const hz of [30,60,120]) {
  const h=await rig('charger');h.installClock(h);h.camera.mode='follow';h.camera.target=h.a;
  const rows=[],m={state:'playing',paused:false,local:h.a,controller:h.c,playing:()=>true,
    updateController:dt=>h.c.update(dt),update(dt){h.a.update(dt);rows.push([h.c.mapHeld,h.a.intent.fire,h.a.weaponRunner.charge,h.shots.length]);}};
  h.G.match=m;h.G.projectiles.update=()=>{};const game={input:h.input,rig:h.camera,match:m,_padMenus(){}};
  for(let frame=0;frame<hz*2;frame++) {const t=frame/hz,held=t<1?[7]:[];if(t<.1||t>=.5&&t<.6)held.push(3);h.setPads(pad(held));h.runSimulation(game,1/hz);}
  assert.equal(h.shots.filter(x=>x.kind==='charger').length,1);assert.equal(rows.length,120);
  if(expected)assert.deepEqual(rows,expected);else expected=rows;
 }
});

test('controls anchors fail closed rather than silently publishing an unpatched input path',()=>{
 assert.throws(()=>adaptControls('src/game/player.js','export class PlayerController {}'),/conflict/);
});
