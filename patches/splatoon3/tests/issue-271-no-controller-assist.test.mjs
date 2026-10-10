import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
const compose=(rel,s)=>adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,s))));
async function trace(device,enemy,stored,look=true,mouseAssist=false){
 const f=await fixture({adaptNative:compose}),a=f.make(),e=f.make();e.team=1;e.invuln=0;e.pos.set(.1,0,5);
 f.G.actors=enemy?[e]:[];f.G.settings={...f.DEFAULT_SETTINGS,aimAssist:stored,aimAssistMouse:mouseAssist};
 const cam=new f.THREE.PerspectiveCamera(60,16/9,.1,1000);cam.position.set(0,.95,-3);cam.lookAt(0,.95,20);cam.updateMatrixWorld();f.G.camera=cam;
 const rig={yaw:0,pitch:0,mapK:0};f.G.rig=rig;
 const touch={active:true,root:{},moveX:0,moveY:0,lookDX:0,lookDY:0,mapOpen:false,down:()=>false,wasPressed:()=>false,consumeJumpTarget:()=>-1,
  gyro:{enabled:device==='gyro',discard(){},resync(){},consume(out){out.yaw=look?.005:0;out.pitch=look?.002:0;return out;}}};
 const inp={lastDevice:device==='gyro'?'touch':device,pad:device==='pad'?{}:null,mobile:['touch','gyro'].includes(device)?touch:null,
  mouse:{dx:device==='mouse'&&look?2:0,dy:device==='mouse'&&look?1:0,left:!look},padPressed:new Set(),down:()=>false,wasPressed:()=>false,padButton:()=>false,padValue:()=>0,
  padStick(index,_other,out){out.x=index===2&&look?.25:0;out.y=index===2&&look?.1:0;out.mag=Math.hypot(out.x,out.y);return out;}};
 const c=new f.PlayerController(a,rig,inp);c.computeAim=()=>{};const rows=[];
 for(let i=0;i<12;i++){if(device==='touch'){touch.lookDX=look?.005:0;touch.lookDY=look?.002:0;}e.pos.x=.1+i*.025;c.update(1/60);rows.push([rig.yaw,rig.pitch]);}
 return rows;
}
test('#271 controller and touch defaults cannot enable S3 tracking/friction, including old stored values',async()=>{for(const device of ['pad','touch','gyro'])for(const stored of [undefined,0,1])assert.deepEqual(await trace(device,true,stored),await trace(device,false,stored));});
test('#271 firing without corresponding look never carries a strafing target into yaw/pitch',async()=>{for(const device of ['pad','touch','gyro'])assert.deepEqual(await trace(device,true,1,false),await trace(device,false,1,false));});
test('#271 mouse default response remains target-independent; explicit mouse accessibility option remains separate',async()=>{assert.deepEqual(await trace('mouse',true,1),await trace('mouse',false,1));assert.notDeepEqual(await trace('mouse',true,1,true,true),await trace('mouse',false,1,true,true));});
test('#271 composed defaults and normal UI do not advertise controller assist',async()=>{const f=await fixture({adaptNative:compose});assert.equal(f.DEFAULT_SETTINGS.aimAssist,0);const raw=fs.readFileSync(new URL('../../../inkwave-public/src/ui/menus.js',import.meta.url),'utf8');assert.doesNotMatch(compose('src/ui/menus.js',raw),/key: 'aimAssist'/);});
