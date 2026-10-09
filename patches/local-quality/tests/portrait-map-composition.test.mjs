import fs from 'node:fs';import vm from 'node:vm';
import test from 'node:test';import assert from 'node:assert/strict';import {fixture}from '../../reliability/tests/controls-fixture.mjs';import path from 'node:path';import{pathToFileURL}from 'node:url';
const {syncPortraitFrame}=await import(process.env.INKWAVE_PORTRAIT_SITE?pathToFileURL(path.resolve(process.env.INKWAVE_PORTRAIT_SITE,'patches/local-quality/portrait-guard.mjs')).href:new URL('../portrait-guard.mjs',import.meta.url).href);
async function rig(dead=false,online=false){
 const f=await fixture({match:true}),input=new f.Input({}),a=f.make(),camera={yaw:.2,pitch:.3},c=new f.PlayerController(a,camera,input);c.computeAim=()=>{};
 f.G.settings={...f.DEFAULT_SETTINGS,aimAssist:0};f.G.actors=[a];f.G.rig=camera;f.G.netm=online?{}:null;f.G.level.spawnPads=[new f.THREE.Vector3()];
 const m=new f.Match({});m.state='playing';m.local=a;m.controller=c;m.actors=[a];f.G.match=m;
 const mobile=input.mobile;Object.assign(mobile,{active:true,visible:true,root:{isConnected:true,classList:{contains:n=>n==='is-active',toggle(){}},querySelectorAll:()=>[]}});input.lastDevice='touch';mobile.gyro.enabled=true;
 let portrait=false;const env={document:{documentElement:{classList:{contains:n=>n==='iw-touch'}}},matchMedia:()=>({matches:portrait})};
 const game={input,match:m,s3Clock:{reset(){}}};if(dead){a.alive=false;a.hp=0;}
 const tick=()=>m.updateController(1/60);
 input.keys.add('Tab');tick();mobile.gyro.dYaw=.13;mobile.gyro.dPitch=.09;tick();assert(c._mapGyroYaw!==0);
 return{f,input,a,c,camera,m,mobile,game,env,tick,portrait:v=>{portrait=v;}};
}
for(const dead of [false,true])for(const online of [false,true])test(`portrait clears queued map motion before renderer/clock (${dead?'dead':'alive'},${online?'online':'offline'})`,async()=>{
 const h=await rig(dead,online),pose=[h.camera.yaw,h.camera.pitch];h.c.mapGyroTarget={stale:true};h.portrait(true);const state=syncPortraitFrame(h.game,h.f.G,h.env);
 assert.equal(state.blocked,true);assert.equal(state.offline,!online);assert.equal(h.c.navigationEnabled,false);assert.deepEqual({...h.c.consumeMapGyro()},{yaw:0,pitch:0});assert.equal(h.c.mapGyroTarget,null);
 if(online){h.tick();assert.equal(h.c.navigationEnabled,false);assert.equal(h.c.canRequestMapJump(),false);}
 h.mobile.gyro.dYaw=.5;h.mobile.gyro.dPitch=.4;syncPortraitFrame(h.game,h.f.G,h.env);h.portrait(false);assert.equal(syncPortraitFrame(h.game,h.f.G,h.env).released,true);h.tick();assert.deepEqual([h.camera.yaw,h.camera.pitch],pose);assert.deepEqual({...h.c.consumeMapGyro()},{yaw:0,pitch:0});
 if(!dead){h.mobile.gyro.dYaw=.02;h.mobile.gyro.dPitch=.01;h.tick();assert.notEqual(h.camera.yaw,pose[0]);}
});

test('old portrait guard leaves real controller map motion queued before a skipped offline tick',async()=>{
 const h=await rig(false,false),raw=fs.readFileSync(new URL('../portrait-guard.mjs',import.meta.url),'utf8');
 const old=vm.runInNewContext(raw.replace('if(blocked||s.released)m.controller.clearMapGyro?.();','').replace('m.controller.navigationEnabled=false;','').replaceAll('export ','')+';syncPortraitFrame');
 h.portrait(true);old(h.game,h.f.G,h.env);assert.equal(h.c.navigationEnabled,true);assert.deepEqual({...h.c.consumeMapGyro()},{yaw:.13,pitch:.09});
});
