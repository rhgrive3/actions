import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {adaptCameraFovCache} from '../camera-fov-cache-adapter.mjs';
const root=process.env.CAMERA_REPOSITORY_ROOT?pathToFileURL(process.env.CAMERA_REPOSITORY_ROOT+'/'):new URL('../../../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8'),data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const three=new URL('inkwave-public/vendor/three/build/three.module.js',root).href;
const THREE=await import(three);
const {adaptBuildSource}=await import(new URL('scripts/inkwave-source-composition.mjs',root));
const raw=read('inkwave-public/src/game/cameraRig.js'),composed=adaptBuildSource('src/game/cameraRig.js',raw);
const original='    const vBase = 2 * Math.atan(Math.tan((this.baseFov * Math.PI) / 360) / (16 / 9)) * (180 / Math.PI);';
const replacement=adaptCameraFovCache('src/game/cameraRig.js',original);
const baselineSource=composed.includes(replacement)?composed.replace(replacement,original):composed;
const candidateSource=adaptCameraFovCache('src/game/cameraRig.js',baselineSource);
const physics=data(read('inkwave-public/src/game/physics.js').replace("'three'",JSON.stringify(three)));
const controls=data(read('patches/splatoon3/runtime/camera-aim-controls.mjs').replace("'three'",JSON.stringify(three)));
async function load(source){return import(data(source.replace("'three'",JSON.stringify(three)).replace("'../core/ctx.js'",JSON.stringify(new URL('inkwave-public/src/core/ctx.js',root).href)).replace("'./physics.js'",JSON.stringify(physics)).replace("'./chargerTuning.js'",JSON.stringify(new URL('inkwave-public/src/game/chargerTuning.js',root).href)).replace("'../../patches/splatoon3/runtime/camera-aim-controls.mjs'",JSON.stringify(controls)).replace("'../../patches/splatoon3/runtime/battle-framing.mjs'",JSON.stringify(new URL('patches/splatoon3/runtime/battle-framing.mjs',root).href))+'\nexport {G};'));}
const baseline=await load(baselineSource),candidate=await load(candidateSource);
function run(module,{vary=true,frames=600,edge=false}={}){
 const counts={tan:0,atan:0,random:0},original={};for(const key of Object.keys(counts)){original[key]=Math[key];Math[key]=(...args)=>{counts[key]++;if(key==='random')calls.push(['random']);return key==='random'?.123456789:original[key](...args);};}
 const output=[],calls=[];
 try{
  const {G,CameraRig}=module;G.settings={fov:82,cameraShake:1};G.match={attract:false};
  let frame=0;G.physics={cameraProbe(p,d,w,r,out){calls.push(['probe',frame,...p.toArray(),...d.toArray(),w,r]);Object.assign(out,{hard:frame%100<20?1.5:5,soft:frame%100<20?1.2:4.5,floor:frame%80===0});},raycast(p,d,w,out){calls.push(['ray',frame,...p.toArray(),...d.toArray(),w]);out.hit=frame%2===0;out.dist=.4;return out;},segment(a,b,out){calls.push(['segment',frame,...a.toArray(),...b.toArray()]);out.hit=false;return out;}};
  G.level={layout:'test',bounds:{minX:-30,maxX:30,minZ:-50,maxZ:50},groundHeight(x,z,y){calls.push(['ground',frame,x,z,y]);return 0;}};
  const camera=new THREE.PerspectiveCamera(60,16/9,.15,6500),rig=new CameraRig(camera),actor={pos:new THREE.Vector3(),vel:new THREE.Vector3(),form:'kid',anim:{form:'move'},grounded:true,landT:99,landSpeed:0,weaponRunner:{charging:false,charge:0},visualPos(out){calls.push(['visual',frame]);return out.copy(this.pos);}};
  rig.follow(actor,true);
  for(frame=0;frame<frames;frame++){
   if(vary){actor.pos.set(Math.sin(frame*.03)*2,Math.max(0,Math.sin(frame*.1)),frame*.01);actor.vel.set(Math.cos(frame*.03),Math.cos(frame*.1),.6);actor.grounded=actor.pos.y===0;actor.landT=frame%40/60;actor.landSpeed=frame%40===0?8:0;actor.form=frame%90<30?'squid':'kid';actor.anim.form=actor.form==='squid'?'swim':'move';actor.weaponRunner.charging=frame%75<40;actor.weaponRunner.charge=(frame%75)/75;rig.yaw=frame*.014;rig.pitch=Math.sin(frame*.02)*.3;rig.setMap(frame%150>100);if(frame%37===0){rig.recoil(.01);rig.addShake(.2);}G.settings.fov=[82,90,65][Math.floor(frame/50)%3];camera.aspect=frame%120<60?16/9:4/3;
    if(frame===200){rig.mode='spectate';rig.spectate={pos:actor.pos.clone(),from:new THREE.Vector3(2,2,2),actor:{alive:true,pos:new THREE.Vector3(1,1,1)}};}if(frame===250)rig.orbit(new THREE.Vector3(),10,4);if(frame===300)rig.cinematic(new THREE.Vector3(1,2,3),new THREE.Vector3(5,6,7),new THREE.Vector3(),new THREE.Vector3(0,1,0),.5,()=>calls.push(['done',frame]));if(frame===350)rig.overview();if(frame===400)rig.follow(actor);if(frame===480)G.level.layout='changed';
   }
   if(edge)G.settings.fov=[0,-0,NaN,Infinity,-Infinity,82,null,undefined,90][frame%9];
   rig.update(vary?[1/60,1/30,1/120,0,.1][frame%5]:1/60);
   const snap=c=>({position:c.position.toArray(),quaternion:c.quaternion.toArray(),projection:c.projectionMatrix.toArray(),inverseProjection:c.projectionMatrixInverse.toArray(),world:c.matrixWorld.toArray(),inverseWorld:c.matrixWorldInverse.toArray(),fov:c.fov,aspect:c.aspect,userData:{...c.userData}});
   output.push({camera:snap(camera),game:snap(rig.gameCam),yaw:rig.yaw,pitch:rig.pitch,mapK:rig.mapK,curDist:rig.curDist,pivot:rig.pivot.toArray(),clearance:rig.cameraClearanceCorrection,aimFrame:rig._s3AimFrame?{pivot:rig._s3AimFrame.pivot.toArray(),actorPos:rig._s3AimFrame.actorPos.toArray(),inverseBase:rig._s3AimFrame.inverseBase.toArray()}:null});
  }
  return {output,calls,counts};
 }finally{for(const key in original)Math[key]=original[key];}
}

test('production camera composition contains the cache exactly once',()=>{assert(composed===candidateSource,'production FOV cache wiring missing');assert.equal(composed.split('this._vBaseFov = this.baseFov;').length,2);});
test('target-only fail-closed unique anchor and duplicate composition',()=>{assert.equal(adaptCameraFovCache('src/other.js','untouched'),'untouched');assert.throws(()=>adaptCameraFovCache('src/game/cameraRig.js','missing'),/anchor conflict/);assert.throws(()=>adaptCameraFovCache('src/game/cameraRig.js',original+original),/anchor conflict/);assert.throws(()=>adaptCameraFovCache('src/game/cameraRig.js',candidateSource),/anchor conflict/);assert.equal(adaptCameraFovCache('src/game/cameraRig.js',original),replacement);});
for(const [name,options]of [['all modes, blends, recoil, map, collisions',{vary:true}],['stable setting',{vary:false}]])test(name,()=>{const a=run(baseline,options),b=run(candidate,options);assert.deepEqual(b.output,a.output);assert.deepEqual(b.calls,a.calls);assert.equal(b.counts.random,a.counts.random);if(name==='stable setting'){assert.equal(a.counts.tan-b.counts.tan,599);assert.equal(a.counts.atan-b.counts.atan,599);}console.log(JSON.stringify({name,baseline:a.counts,candidate:b.counts,frames:a.output.length}));});
test('changed conversion is detected',async()=>{const mutant=await load(candidateSource.replace('(16 / 9)) * (180 / Math.PI)','(16 / 10)) * (180 / Math.PI)'));assert.notDeepEqual(run(mutant,{vary:false,frames:10}).output,run(baseline,{vary:false,frames:10}).output);});
