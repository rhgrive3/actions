// Controlled emitted CameraRig comparison. No gameplay or camera-policy changes.
export async function cameraProbe() {
 const base=document.baseURI;
 const urls={ctx:new URL('src/core/ctx.js',base).href,rig:new URL('src/game/cameraRig.js',base).href,three:new URL('vendor/three/build/three.module.js',base).href};
 const [{G},{CameraRig},THREE]=await Promise.all([import(urls.ctx),import(urls.rig),import(urls.three)]);
 if(G!==globalThis.COMPONENT_G||G.game!==globalThis.__inkwave||!(G.game.rig instanceof CameraRig))throw Error('Camera probe: split emitted module instance');
 const savedG=Object.fromEntries(['settings','match','physics','level'].map(k=>[k,G[k]]));
 const savedMath={tan:Math.tan,atan:Math.atan,random:Math.random};
 function encode(value,allowNonfinite=false){
  if(typeof value==='number'){
   if(!Number.isFinite(value)){if(!allowNonfinite)throw Error('Camera probe: nonfinite positive trace');return {$number:Number.isNaN(value)?'NaN':value>0?'Infinity':'-Infinity'};}
   return Object.is(value,-0)?{$number:'-0'}:value;
  }
  if(Array.isArray(value))return value.map(v=>encode(v,allowNonfinite));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v,allowNonfinite)]));
  return value;
 }
 const digest=async value=>{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return [...new Uint8Array(b)].map(v=>v.toString(16).padStart(2,'0')).join('');};
function run(module,{vary=true,frames=600,edge=false}={}){
 const savedG=Object.fromEntries(['settings','match','physics','level'].map(k=>[k,G[k]]));
 const counts={tan:0,atan:0,random:0},original={};for(const key of Object.keys(counts)){original[key]=Math[key];Math[key]=(...args)=>{counts[key]++;if(key==='random')calls.push(['random']);return key==='random'?.123456789:original[key](...args);};}
 const output=[],calls=[];
 try{
  const {CameraRig}=module;G.settings={fov:82,cameraShake:1};G.match={attract:false};
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
 }finally{for(const key in original)Math[key]=original[key];Object.assign(G,savedG);}
}


 const traces=[];
 for(const[name,options]of [['dynamic',{vary:true}],['stable',{vary:false}]]){
  const r=run({G,CameraRig},options);
  const output=encode(r.output),calls=encode(r.calls);
  traces.push({name,frames:r.output.length,outputSHA256:await digest(output),callsSHA256:await digest(calls),counts:r.counts,finite:true});
 }
 // Explicit nonfinite controls preserve tags instead of silently JSON-serializing NaN as null.
 const edge=[],edgeSavedG=Object.fromEntries(['settings','match','physics','level'].map(k=>[k,G[k]])),edgeRandom=Math.random;let edgeRandomCalls=0;
 try {
  G.settings={};G.match={attract:false};G.physics=null;G.level=null;
  Math.random=()=>{edgeRandomCalls++;return .123456789;};
  const edgeCamera=new THREE.PerspectiveCamera(60,16/9,.15,6500),edgeRig=new CameraRig(edgeCamera);
  let forced=82;Object.defineProperty(edgeRig,'baseFov',{configurable:true,get:()=>forced,set:()=>{}});
  for(const value of [0,-0,NaN,Infinity,-Infinity,82,82]){forced=value;edgeRig.update(1/60);edge.push({input:encode(value,true),fov:encode(edgeCamera.fov,true),projection:encode(edgeCamera.projectionMatrix.toArray(),true),gameFov:encode(edgeRig.gameCam.fov,true)});}
 }finally{Object.assign(G,edgeSavedG);Math.random=edgeRandom;}
 let nonfiniteRejected=false;try{encode([NaN]);}catch{nonfiniteRejected=true;}
 const restored=Object.entries(savedG).every(([k,v])=>G[k]===v)&&Object.entries(savedMath).every(([k,v])=>Math[k]===v);
 if(!restored||!nonfiniteRejected)throw Error('Camera probe restoration/finite guard failed');
 return {status:'passed',moduleIdentity:true,moduleURLs:urls,traces,edge:{count:edge.length,randomCalls:edgeRandomCalls,outputSHA256:await digest(edge),nonfiniteRejected:true},restored:true,scope:'Controlled actual emitted CameraRig/native helpers. Exact-output and conversion-call comparison only; no FPS/device claim.'};
}
