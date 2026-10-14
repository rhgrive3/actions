import assert from 'node:assert/strict';

export const GYRO_MOTION_DENIAL_CONTEXT=Object.freeze({userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'});

// Full built MobileInput import graph, real browser promises and event loop.
// Permission completion and sensor callbacks are synthetic; no hardware claim.
export async function checkGyroMotionDenial(page) {
 const evidence = await page.evaluate(async()=>{

  // Keep the production import graph intact. Only the optional browser permission
  // callbacks and sensor input are synthetic; DOM, event loop and modules are real.
  Object.defineProperty(window,'DeviceOrientationEvent',{configurable:true,value:class {}});
  Object.defineProperty(window,'DeviceMotionEvent',{configurable:true,value:class {}});
  if(!/Android/i.test(navigator.userAgent))throw new Error('Android stationary-evidence path is required');
  const {MobileInput}=await import('/src/core/mobile.js');
  const results=[];const assert=(value,message)=>{if(!value)throw new Error(message);};
  const origins=new WeakMap();
  const timestamp=(g,offset)=>origins.get(g)+offset-1000;
  const orientation=(g,time,alpha)=>g._orientation({timeStamp:timestamp(g,time),alpha,beta:0,gamma:90});
  const stationary=(g,time)=>g._motion({timeStamp:timestamp(g,time),rotationRate:{alpha:0,beta:0,gamma:0}});
  const magnitude=g=>Math.hypot(...Object.values(g.consume({})));
  async function fixture(){
   let ori,motion;Object.defineProperty(DeviceOrientationEvent,'requestPermission',{configurable:true,value:()=>new Promise(r=>ori=r)});Object.defineProperty(DeviceMotionEvent,'requestPermission',{configurable:true,value:()=>new Promise(r=>motion=r)});
   const m=new MobileInput(document.createElement('canvas'),{});m.active=true;m.visible=true;m.root=document.createElement('div');m.els={gyro:document.createElement('button')};m.toastEl=document.createElement('div');m.toast=()=>{};
   const enabled=m.setGyro(true);ori('granted');assert(await enabled,'enabled');assert(m.gyro.platformStatus.motionPermission==='prompt','motion pending');
   const sensorStart=m.gyro._platformSensorStart,timeOrigin=Math.max(performance.now(),sensorStart)+1;assert(Number.isFinite(timeOrigin)&&timeOrigin>sensorStart,'fresh sensor timestamp origin');origins.set(m.gyro,timeOrigin);
   return {m,g:m.gyro,sensorStart,timeOrigin,settle:async value=>{motion(value);await new Promise(r=>setTimeout(r,0));}};
  }
  async function test(name,fn){let f;try{f=await fixture();const details=await fn(f);results.push({name,pass:true,sensorStart:f.sensorStart,timeOrigin:f.timeOrigin,...details});}catch(e){results.push({name,pass:false,error:e.stack});}finally{f?.m.destroy();}}
  for(const hz of [30,60,90,120])await test(`delayed denial ${hz}Hz`,async({g,settle})=>{const dt=1000/hz;orientation(g,1000,0);stationary(g,1000+dt);orientation(g,1000+dt,.1);const before=magnitude(g);assert(before===0,'fresh stationary evidence suppresses drift');await settle('denied');assert(g.platformStatus.motionPermission==='denied','denial settled');orientation(g,1000+dt*2,1);const resumed=magnitude(g);assert(resumed>0,'orientation resumes');assert(g._qualityGyro.stationaryMotion===false,'stationary evidence cleared');assert(g._qualityGyro.motionTime===-Infinity,'motion time cleared');assert(g.enabled&&g._src==='ori','orientation remains enabled');stationary(g,1000+dt*3);orientation(g,1000+dt*3,2);const afterQueued=magnitude(g);assert(afterQueued>0,'queued denied motion cannot restore stale evidence');return{before,resumed,afterQueued};});
  await test('delayed grant preserves suppression',async({g,settle})=>{orientation(g,1000,0);stationary(g,1017);orientation(g,1017,.1);await settle('granted');orientation(g,1034,1);assert(g.platformStatus.motionPermission==='granted','grant settled');assert(magnitude(g)===0,'drift suppressed');assert(g._qualityGyro.stationaryMotion===true,'evidence retained');});
  await test('denial preserves queued real aim',async({g,settle})=>{orientation(g,1000,0);orientation(g,1017,1);const queued=[g.dYaw,g.dPitch];assert(Math.hypot(...queued)>0,'real aim queued');stationary(g,1018);await settle('denied');orientation(g,1034,1);assert(Math.abs(g.dYaw)>=Math.abs(queued[0]),'queued yaw preserved');assert(Number.isFinite(g.dYaw+g.dPitch),'finite');assert(g._qualityGyro.stationaryMotion===false,'evidence cleared');return{queued,after:[g.dYaw,g.dPitch]};});
  await test('denial without motion keeps orientation aim',async({g,settle})=>{orientation(g,1000,0);await settle('denied');orientation(g,1017,1);assert(magnitude(g)>0&&g.enabled,'orientation aim enabled');});
  await test('superseded denial preserves current evidence',async({g,settle})=>{orientation(g,1000,0);stationary(g,1017);orientation(g,1017,.1);g._platformGyroAccess.cancelRequest(false);await settle('denied');assert(g.platformStatus.motionPermission==='prompt','stale denial ignored');orientation(g,1034,1);assert(magnitude(g)===0&&g._qualityGyro.stationaryMotion===true,'current stationary evidence retained');});
  return{userAgent:navigator.userAgent,secureContext:isSecureContext,results};
 });
 assert.match(evidence.userAgent,/Android/i,'Android production path must be exercised');
 assert.equal(evidence.results.length, 8, 'All delayed-motion scenarios must run');
 for (const result of evidence.results) assert.equal(result.pass, true, JSON.stringify(result));
 return evidence;
}
