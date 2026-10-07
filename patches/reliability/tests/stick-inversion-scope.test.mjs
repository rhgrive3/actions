import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './controls-fixture.mjs';
import {migrateAimProfiles,applyAimSettingsChange} from '../../local-quality/aim-profile.mjs';
async function rig(device,invertY=false){
 const f=await fixture(),input=new f.Input({}),a=f.make('shooter'),camera={yaw:0,pitch:0},controller=new f.PlayerController(a,camera,input);controller.computeAim=()=>{};
 f.G.settings={...f.DEFAULT_SETTINGS,aimAssist:0,invertY};f.G.rig=camera;f.G.actors=[a];
 const sensor={enabled:false,pitch:0,yaw:0,discard(){this.pitch=this.yaw=0;},resync(){this.discard();},consume(out){out.pitch=this.pitch;out.yaw=this.yaw;this.discard();return out;}};
 Object.assign(input.mobile,{active:true,visible:true,root:{classList:{toggle(){},add(){},remove(){},contains(){return false;}},querySelectorAll:()=>[]},gyro:sensor});
 function owner(d){input.lastDevice=d;controller.update(1/60);camera.pitch=camera.yaw=0;}
 owner(device);
 function sample(d=device){input.mouse.dx=input.mouse.dy=0;input.mobile.lookDX=input.mobile.lookDY=0;input.pad=null;controller.padLook.x=controller.padLook.y=0;camera.pitch=camera.yaw=0;
 if(d==='kbm'){input.locked=true;input.mouse.dx=12;input.mouse.dy=5;}
 else if(d==='touch'){input.mobile.lookDX=.2;input.mobile.lookDY=.1;}
 else if(d==='pad'){input.pad={mapping:'standard',axes:[0,0,.6,.8],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};}
 controller.update(1/60);return {yaw:camera.yaw,pitch:camera.pitch};}
 return {...f,input,a,camera,controller,sensor,owner,sample};
}
test('#832 inversion changes right-stick Y only; mouse and swipe retain their actual nonzero pitch',async()=>{
 for(const device of ['kbm','touch','pad']){const a=await rig(device),b=await rig(device,true),x=a.sample(),y=b.sample();assert.notEqual(x.pitch,0,device);assert.equal(y.pitch,device==='pad'?-x.pitch:x.pitch,device);assert.equal(y.yaw,x.yaw,device);}
});
test('#832 stick X remains independent of stick Y',async()=>{const a=await rig('pad'),b=await rig('pad',true);b.G.settings.padInvertX=true;const x=a.sample(),y=b.sample();assert.equal(y.pitch,-x.pitch);assert.equal(y.yaw,-x.yaw);});
test('#832 gyro still owns touch pitch and ignores stick inversion',async()=>{for(const invert of [false,true]){const h=await rig('touch',invert);h.sensor.enabled=true;h.controller.update(1/60);h.sensor.pitch=.12;h.input.mobile.lookDY=.8;h.controller.update(1/60);assert.equal(h.camera.pitch,.12);}});
test('#832 Map suppresses ordinary camera look for every input source',async()=>{for(const device of ['kbm','touch','pad']){const h=await rig(device,true);h.camera.mapK=1;const x=h.sample();assert.equal(x.pitch,0,device);assert.equal(x.yaw,0,device);}});
test('#832 existing flat inversion migrates and TV/handheld choices survive reload without affecting mouse',async()=>{const h=await rig('kbm');h.G.settings=migrateAimProfiles({...h.G.settings,invertY:true,gyro:false});assert.equal(h.G.settings.aimProfiles.tv.invertY,true);assert.equal(h.G.settings.aimProfiles.handheld.invertY,true);applyAimSettingsChange(h.G.settings,{aimProfile:'handheld',invertY:false});assert.equal(h.G.settings.invertY,false);const normal=h.sample().pitch;applyAimSettingsChange(h.G.settings,{aimProfile:'tv'});assert.equal(h.G.settings.invertY,true);assert.equal(h.sample().pitch,normal);const restored=migrateAimProfiles(JSON.parse(JSON.stringify(h.G.settings)));assert.equal(restored.aimProfiles.tv.invertY,true);assert.equal(restored.aimProfiles.handheld.invertY,false);});
test('#832 repeated owned device switches do not propagate stick inversion to later mouse/swipe samples',async()=>{const h=await rig('pad',true);for(let i=0;i<5;i++){h.owner('pad');assert.ok(h.sample('pad').pitch>0);h.owner('kbm');assert.ok(h.sample('kbm').pitch<0);h.owner('touch');assert.ok(h.sample('touch').pitch<0);}});
