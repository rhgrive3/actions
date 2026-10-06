import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fixture } from './controls-fixture.mjs';
import { viabilityFixture } from '../../local-quality/tests/gyro-viability-fixture.mjs';
import { pathToFileURL } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
const STEP=1/60;
const BUILT=process.env.INKWAVE_CONTROLS_SITE;
const root=new URL('../../../',import.meta.url).pathname;
function code(rel) {
 const raw=fs.readFileSync(path.join(BUILT||path.join(root,'inkwave-public'),rel),'utf8');
 return BUILT?raw:adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,raw))));
}
function method(source,start,end){const i=source.indexOf(start),j=source.indexOf(end,i);assert.ok(i>=0&&j>i,start);return source.slice(i,j);}
const pad=(held=[],mapping='standard')=>[{connected:true,mapping,axes:[.9,-.5,.8,.7],buttons:Array.from({length:17},(_,i)=>({pressed:held.includes(i),value:held.includes(i)?1:0}))}];
async function rig() {
 const f=await fixture({diorama:true}),input=new f.Input({}),a=f.make(),camera={yaw:.2,pitch:.3},c=new f.PlayerController(a,camera,input);c.computeAim=()=>{};
 const allies=[f.make(),f.make(),f.make()];f.G.settings={...f.DEFAULT_SETTINGS,aimAssist:0};f.G.actors=[a,...allies];f.G.rig=camera;
 f.G.level.spawnPads=[new f.THREE.Vector3(0,0,0)];f.G.physics.groundProbe=(_x,_y,_z,_r,_d,_foot,hit)=>{hit.hit=false;return hit;};
 // Extract the actual composed Match method, not a replacement gating model.
 const native=code('src/game/match.js');
 // The Node fixture extracts Match from composed source; canonical browser acceptance also executes the actual emitted Match export.
 const source=BUILT?adaptQualitySource('src/game/match.js',adaptReliability('src/game/match.js',adaptTouchLayout('src/game/match.js',adaptSource('src/game/match.js',fs.readFileSync(path.join(root,'inkwave-public/src/game/match.js'),'utf8'))))):native;
 const Match=vm.runInNewContext(`class Match {${method(source,'  updateController(dt) {','\n  _judge() {')}}; Match`);
 const m={state:'playing',paused:false,attract:false,local:a,controller:c,playing:()=>m.state==='playing'&&!m.paused,canRespawn:()=>false,updateController:Match.prototype.updateController};f.G.match=m;
 function frame(held=[],mapping='standard'){f.setPads(pad(held,mapping));input.pollPad();m.updateController(STEP);input.endFrame();}
 function dead(){a.splat(null,'water');assert.equal(a.alive,false);}
 function touch(){const mob=input.mobile;Object.assign(mob,{active:true,visible:true,root:{classList:{toggle(){}},querySelectorAll:()=>[]}});input.lastDevice='touch';return mob;}
 return {...f,input,a,allies,c,camera,m,frame,dead,touch};
}

const element=()=>({style:{setProperty(){}},classList:{toggle(){}},children:[],setAttribute(){}});
async function setup(dead=false){
 const h=await rig();h.allies.forEach((a,i)=>a.pos.set((i-1)*4,0,-i*3));if(dead)h.dead();h.touch();h.input.mobile.gyro.enabled=true;h.G.rig=h.camera;h.camera.dioLook={x:0,y:0};
 h.G.camera=new h.THREE.PerspectiveCamera(60,1000/700,.1,100);h.G.camera.position.set(0,8,12);h.G.camera.lookAt(0,0,0);h.G.camera.updateMatrixWorld();
 const ui=Object.create(h.DioramaOverlay.prototype);Object.assign(ui,{on:true,k:1,cx:.5,cy:.62,hover:-1,_last:{},el:element(),cursor:element(),arc:element(),pins:Array.from({length:5},()=>({el:element(),icon:element(),name:element(),state:element()}))});
 h.input.keys.add('Tab');h.m.updateController(STEP);ui.update(STEP,1);
 function motion(yaw,pitch){h.input.mobile.gyro.dYaw=yaw;h.input.mobile.gyro.dPitch=pitch;h.m.updateController(STEP);}
 return {...h,ui,motion};
}
for(const dead of [false,true])test(`#533 actual Diorama ${dead?'dead':'alive'} gyro cursor moves once while battle camera is frozen`,async()=>{
 const h=await setup(dead),pose=[h.camera.yaw,h.camera.pitch],xy=[h.ui.cx,h.ui.cy];
 h.motion(.05,.03);assert.deepEqual([h.camera.yaw,h.camera.pitch],pose);h.ui.update(STEP,1);assert.ok(h.ui.cx<xy[0]);assert.ok(h.ui.cy<xy[1]);const moved=[h.ui.cx,h.ui.cy];h.ui.update(STEP,1);assert.deepEqual([h.ui.cx,h.ui.cy],moved);
});
test('#533 repeated close/open discards boundary samples and returns ownership without replay',async()=>{
 const h=await setup();for(let i=0;i<10;i++){
  h.motion(.03,.02);h.ui.update(STEP,1);h.input.keys.delete('Tab');const before=h.camera.yaw;h.motion(.4,.3);assert.equal(h.camera.yaw,before);assert.deepEqual({...h.c.consumeMapGyro()},{yaw:0,pitch:0});
  h.motion(.02,.01);assert.ok(h.camera.yaw>before);h.input.keys.add('Tab');const aim=h.camera.yaw;h.motion(.4,.3);h.ui.update(STEP,1);assert.equal(h.camera.yaw,aim);assert.deepEqual({...h.c.consumeMapGyro()},{yaw:0,pitch:0});
 }
});
test('#533 reset, gyro OFF, and pause clear undelivered motion',async()=>{
 for(const kind of ['reset','off','pause']){const h=await setup();h.motion(.04,.03);
  if(kind==='reset')h.c.resetCamera();if(kind==='off'){h.input.mobile.gyro.enabled=false;h.m.updateController(STEP);}if(kind==='pause'){h.m.paused=true;h.m.updateController(STEP);}
  assert.deepEqual({...h.c.consumeMapGyro()},{yaw:0,pitch:0});assert.equal(h.c.mapGyroTarget,null);
 }
});
test('#533 cursor projection is cadence independent for the same angular integral',async()=>{
 let expected;for(const hz of [30,60,120,144]){const h=await setup();for(let i=0;i<hz;i++){h.motion(.08/hz,.04/hz);h.ui.update(1/hz,1);}const xy=[h.ui.cx,h.ui.cy];if(expected)xy.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-12));else expected=xy;}
});
test('#533 gyro hover feeds existing standard A confirmation; D-pad can replace it',async()=>{
 const h=await setup();h.motion(.01,0);h.ui.update(STEP,1);
 const pin=h.ui.pins[1];h.ui.cx=pin.x/1000;h.ui.cy=(pin.y-34)/700;h.ui.update(STEP,1);assert.equal(h.c.mapGyroTarget.actor,h.allies[1]);
 // No launch merely from motion hover, and the existing physical A edge admits once.
 assert.equal(h.a.superJumpState,null);h.frame([1]);assert.equal(h.a.superJumpState?.target,h.allies[1]);
 const q=await setup();q.c._mapGyroCursor=true;q.c.mapGyroTarget={actor:q.allies[1]};q.input.mobile.gyro.dYaw=.02;q.frame([14]);q.ui.update(STEP,1);assert.equal(q.c._mapGyroCursor,false);assert.equal(q.c.padJumpTarget.actor,q.allies[0]);q.frame([1]);assert.equal(q.a.superJumpState?.target,q.allies[0]);
});
test('#533 dead gyro selection queues until landing through the existing A path',async()=>{
 const h=await setup(true);h.motion(.01,0);h.ui.update(STEP,1);const pin=h.ui.pins[1];h.ui.cx=pin.x/1000;h.ui.cy=(pin.y-34)/700;h.ui.update(STEP,1);
 h.frame([1]);assert.equal(h.c.pendingRespawnJump?.actor,h.allies[1]);assert.equal(h.a.superJumpState,null);h.a.respawn();h.a.grounded=true;h.m.updateController(STEP);assert.equal(h.a.superJumpState?.target,h.allies[1]);
});
test('#533 a removed or splatted gyro-selected target cannot launch',async()=>{
 for(const mode of ['removed','dead']){const h=await setup();h.c._mapGyroCursor=true;h.c.mapGyroTarget={actor:h.allies[1]};if(mode==='removed')h.G.actors=h.G.actors.filter(a=>a!==h.allies[1]);else h.allies[1].alive=false;h.frame([1]);assert.equal(h.a.superJumpState,null);}
});

const {resetPlatformInput}=await import(BUILT?pathToFileURL(path.resolve(BUILT,'patches/local-quality/platform-input.mjs')).href:new URL('../../local-quality/platform-input.mjs',import.meta.url).href);
for(const dead of [false,true])test(`#533 platform reset clears ${dead?'dead':'alive'} map motion before any resumed render`,async()=>{
 const h=await setup(dead);h.motion(.04,.03);assert.ok(h.c._mapGyroYaw);h.c._mapGyroCursor=true;h.c.mapGyroTarget={actor:h.allies[1]};
 resetPlatformInput(h.input,h.c);assert.deepEqual({...h.c.consumeMapGyro()},{yaw:0,pitch:0});assert.equal(h.c._mapGyroOpen,false);assert.equal(h.c._mapGyroCursor,false);assert.equal(h.c.mapGyroTarget,null);
 const xy=[h.ui.cx,h.ui.cy];h.ui.update(STEP,1);assert.deepEqual([h.ui.cx,h.ui.cy],xy);h.m.updateController(STEP);assert.equal(h.c.mapHeld,false);assert.deepEqual({...h.c.consumeMapGyro()},{yaw:0,pitch:0});
});
test('#533 composed pending startup and real gyro resync preserve one consumer across map boundaries',async t=>{
 const h=await setup(),sensor=await viabilityFixture({permission:'deferred'});t.after(sensor.close);h.input.mobile.gyro=sensor.m.gyro;
 const game={input:{mobile:sensor.m},settings:{gyro:true},match:h.m,menus:{current:null}},G={mode:'match'};
 const prepared=sensor.prepare(game,G),started=sensor.start(game,G);h.m.updateController(STEP);assert.equal(sensor.listenerCount('deviceorientation'),0);
 sensor.answers.shift()('granted');await prepared;assert.equal(await started,true);assert.equal(sensor.prompts.length,1);
 const gyro=sensor.m.gyro,consume=gyro.consume;let consumes=0;gyro.consume=function(...args){consumes++;return consume.apply(this,args);};
 h.m.updateController(STEP);assert.equal(consumes,0,'opening discards the boundary sample');
 sensor.orientation({alpha:0,beta:0,gamma:90});sensor.orientation({alpha:1,beta:0,gamma:90});const pose=[h.camera.yaw,h.camera.pitch],xy=[h.ui.cx,h.ui.cy];
 h.m.updateController(STEP);assert.equal(consumes,1);assert.deepEqual([h.camera.yaw,h.camera.pitch],pose);h.ui.update(STEP,1);assert.notDeepEqual([h.ui.cx,h.ui.cy],xy);const moved=[h.ui.cx,h.ui.cy];h.ui.update(STEP,1);assert.deepEqual([h.ui.cx,h.ui.cy],moved);assert.equal(consumes,1);
 resetPlatformInput(h.input,h.c);assert.deepEqual({...h.c.consumeMapGyro()},{yaw:0,pitch:0});sensor.orientation({alpha:20,beta:0,gamma:90});h.m.updateController(STEP);assert.deepEqual([h.camera.yaw,h.camera.pitch],pose,'resync accepts a new baseline without replay');
 sensor.orientation({alpha:21,beta:0,gamma:90});h.m.updateController(STEP);assert.notDeepEqual([h.camera.yaw,h.camera.pitch],pose);assert.equal(consumes,3,'one sample consume per live controller update after reset');
 h.input.keys.add('Tab');sensor.orientation({alpha:22,beta:0,gamma:90});h.m.updateController(STEP);assert.equal(consumes,3,'reopening discards rather than consumes into aim');assert.deepEqual({...h.c.consumeMapGyro()},{yaw:0,pitch:0});
});

// Execute the published Game/Match HUD transport alongside the actual input/Diorama path.
for(const dead of [false,true])test(`#523 + #533 emitted defaults hide corner map while ${dead?'dead':'alive'} gyro projection and A confirmation work`,{skip:!BUILT},async()=>{
 const {pathToFileURL}=await import('node:url'),site=path.resolve(BUILT),mods=new Map(),context=vm.createContext({console,performance,URL,URLSearchParams,location:{search:''},innerWidth:1000,innerHeight:700});
 function load(file){if(mods.has(file))return mods.get(file);let source=fs.readFileSync(file,'utf8');if(file===path.join(site,'src/main.js')){const boot=/const ([\w$]+)=new ([\w$]+);\1\.boot\(\)\.catch\([\s\S]*$/,hit=source.match(boot);assert.ok(hit,'production bootstrap export');source=source.replace(boot,`export { ${hit[2]} as Game };`);}const m=new vm.SourceTextModule(source,{context,identifier:file,initializeImportMeta(meta){meta.url=pathToFileURL(file).href;}});mods.set(file,m);return m;}
 const main=load(path.join(site,'src/main.js'));await main.link((s,m)=>load(s==='three'?path.join(site,'vendor/three/build/three.module.js'):s.startsWith('three/addons/')?path.join(site,'vendor/three/jsm',s.slice('three/addons/'.length)):path.resolve(path.dirname(m.identifier),s)));await main.evaluate();
 const h=await setup(dead),G=mods.get(path.join(site,'src/core/ctx.js')).namespace.G,defaults=mods.get(path.join(site,'src/config.js')).namespace.DEFAULT_SETTINGS;
 assert.equal(defaults.minimap,false);h.G.settings={...defaults,aimAssist:0};G.camera=h.G.camera;G.teamHex=h.G.teamHex;
 Object.assign(h.m,{actors:h.G.actors,time:100,duration:180,teamSummary:mods.get(path.join(site,'src/game/match.js')).namespace.Match.prototype.teamSummary,updateController:mods.get(path.join(site,'src/game/match.js')).namespace.Match.prototype.updateController});
 let frame,hidden=0,shown=0;const game={match:h.m,settings:h.G.settings,fps:60,_hintT:0,_hints:{shot:true},_lowInkFlash:0,minimap:{canvas:{},w:100,h:100,flip:false,update(){shown++;},tickHidden(){hidden++;}},hud:{update(_dt,value){frame=value;}},input:{mobile:{setHud(){}}}};
 function hud(){main.namespace.Game.prototype._updateHud.call(game,STEP);assert.equal(frame.map,null);}
 hud();const pose=[h.camera.yaw,h.camera.pitch],pin=h.ui.pins[1],e=h.G.camera.projectionMatrix.elements;
 const delta=(from,to,focal)=>Math.atan((from-.5)*2/focal)-Math.atan((to-.5)*2/focal);
 h.motion(delta(h.ui.cx,pin.x/1000,e[0]),delta(h.ui.cy,(pin.y-34)/700,e[5]));h.ui.update(STEP,1);hud();
 assert.deepEqual([h.camera.yaw,h.camera.pitch],pose);assert.equal(h.c.mapGyroTarget.actor,h.allies[1]);assert.equal(h.a.superJumpState,null);
 h.frame([1]);if(dead){assert.equal(h.c.pendingRespawnJump?.actor,h.allies[1]);h.a.respawn();h.a.grounded=true;h.m.updateController(STEP);}
 assert.equal(h.a.superJumpState?.target,h.allies[1]);hud();assert.equal(hidden,3);assert.equal(shown,0);
});
