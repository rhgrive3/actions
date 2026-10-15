import assert from 'node:assert/strict';
export function validateAcceptancePlan(plan){
 assert.equal(plan.schema,1);assert.equal(plan.componentBase,'6b186c7f1ba33956b2e86a29a8ea3a58b7544e50');assert.equal(plan.candidate.head,'e183103a4b6a77a9639d99801ad6ffbdfe9e3f54');assert.equal(plan.baseline.head,'6b186c7f1ba33956b2e86a29a8ea3a58b7544e50');assert.equal(plan.candidate.tree,'8f0ea7adb8a29523086facb8de07c71fe3b497ff');
 for(const key of ['baseline','candidate']){const p=plan[key];assert.match(p.head,/^[a-f0-9]{40}$/);assert.match(p.tree,/^[a-f0-9]{40}$/);assert.match(p.manifestSHA256,/^[a-f0-9]{64}$/);assert.ok(Object.keys(p.requiredArtifacts||{}).length>=4);for(const [file,hash]of Object.entries(p.requiredArtifacts)){assert.ok(!file.startsWith('/')&&!file.split('/').includes('..'));assert.match(hash,/^[a-f0-9]{64}$/);}}
 assert.deepEqual(plan.stages.map(s=>s.id),['inkblot','tidewater'],'Exact final-head run excludes uninstalled Bluefin');
 for(const s of plan.stages.filter(s=>s.id!=='tidewater')){assert.match(s.sourceSha256,/^[a-f0-9]{64}$/);const u=new URL(s.url);assert.equal(u.hostname,'media.githubusercontent.com');assert.ok(u.pathname.startsWith('/media/kirakira-dev/KiTrix/0611f51b35c9736ee986fb2218461e2585b7875e/stages/'));assert.ok(u.pathname.endsWith('.obj'));}
 assert.equal(plan.weapon,'s3-blaster-short');
 const required=['patches/native-stages/runtime/engine.mjs','patches/native-stages/runtime/registry.mjs','patches/native-stages/runtime/build-config.mjs','patches/splatoon3/runtime/main-weapon-catalog.mjs','patches/splatoon3/runtime/weapons-collision.mjs'];
 for(const variant of ['baseline','candidate'])for(const relative of required)assert.ok(Object.keys(plan[variant].requiredArtifacts).some(k=>/^_versions\/[a-f0-9]{64}\//.test(k)&&k.slice(k.indexOf('/',10)+1)===relative),'Missing exact revision-qualified runtime '+relative);
 assert.equal(plan.stages[0].sourceSha256,'bef74ead213cfc4c041820319dbac7ab702d5f0f2df86db8369b162879f8b4f3');
 assert.ok(Object.entries(plan.candidate.requiredInputs||{}).some(([k,v])=>k.endsWith('/sphere-triangle-entry.mjs')&&v==='6f0ce6a22599a7eae35e774a40f4ef48c9bd86780a6fc0ef53f2ead0ffeb58a1'),'Exact final source kernel input must be bound');
 for(const [url,hash]of Object.entries(plan.renderResources||{})){assert.equal(new URL(url).protocol,'https:');assert.match(hash,/^[a-f0-9]{64}$/);}return true;
}
// Browser-side observer. Wrappers preserve receiver, arguments, return values and
// exceptions. No replacement actor pose, muzzle, controller, collision or paint.
export function installCatalogueObservation(){
 const G=NG,g=G.game,a=G.local,P=G.projectiles,R=a.weaponRunner,W=G.level.triangleWorld,paint=G.paint;
 const original={push:P._push,step:P._step,runner:R.update,sweep:W?.sweepSphere,splat:paint.splat,raycast:G.physics?.raycast};
 const state={admissions:[],steps:[],paint:[],errors:[],runner:null,current:null,tracked:null,gridBefore:paint.grid.slice(),startTime:G.time};
 const bounded=(list,row)=>{if(list.length>=1024)throw Error('Catalogue observation cap exceeded');list.push(row);};
 R.update=function(dt,input,...rest){const before=state.runner;state.runner={dt,fire:!!input.fire,firePressed:!!input.firePressed};try{return original.runner.call(this,dt,input,...rest);}finally{state.runner=before;}};
 P._push=function(p,...rest){const result=original.push.call(this,p,...rest);if(p.owner===a&&!p.ghost){if(!state.tracked)state.tracked=p;bounded(state.admissions,{weapon:p.wid,descriptorKey:p.catalog?.descriptor?.key??null,family:p.catalog?.r?.family??null,sourceWeapon:p.catalog?.r?.sourceActor??null,controllerActor:G.match.controller?.a===a,mouseFire:!!g.input.mouse.left,intentFire:!!a.intent.fire,runner:state.runner?{...state.runner}:null,alive:a.alive,grounded:a.grounded,phase:a.s3?.squidSpawn?.phase??null,actorPosition:a.pos.toArray(),actorVelocity:a.vel.toArray(),muzzle:p.start?.toArray(),velocity:p.vel?.toArray(),aimYaw:a.aimYaw,aimPitch:a.aimPitch,aimDir:a.aimDir.toArray(),seed:p.seed??null,time:G.time,clockTick:g.s3Clock?.ticks});}return result;};
 P._step=function(p,dt,...rest){if(p!==state.tracked)return original.step.call(this,p,dt,...rest);const previous=state.current,row={dt,ageBefore:p.age,from:p.pos.toArray(),velocityBefore:p.vel.toArray(),sourceSweeps:[],rays:[],time:G.time};state.current=row;try{const dead=original.step.call(this,p,dt,...rest);row.dead=dead;row.to=p.pos.toArray();row.ageAfter=p.age;return dead;}finally{state.current=previous;bounded(state.steps,row);}};
 if(W)W.sweepSphere=function(from,to,radius,opts={}){const q=this.queryCount,t=this.triangleTests,result=original.sweep.call(this,from,to,radius,opts);if(state.current)state.current.sourceSweeps.push({from:from.toArray(),to:to.toArray(),radius,endRadius:opts.endRadius??radius,ignoreGrates:!!opts.ignoreGrates,queries:this.queryCount-q,candidates:this.triangleTests-t,hit:result?{triangle:result.triangle,object:result.object,flags:result.flags,time:result.time,distance:result.distance,point:result.point.toArray(),normal:result.normal.toArray()}:null});return result;};
 if(G.physics)G.physics.raycast=function(...args){const row=state.current?{origin:args[0].toArray(),direction:args[1].toArray(),maxDist:args[2],skipGrates:!!args[4],argumentCount:args.length}:null;try{const result=Reflect.apply(original.raycast,this,args);if(row)Object.assign(row,{hit:!!result.hit,distance:result.hit?result.dist:null,point:result.hit?result.point.toArray():null,normal:result.hit?result.normal.toArray():null,face:result.face,triangle:result.triangle??null});return result;}catch(error){if(row)row.threw=String(error);throw error;}finally{if(row)bounded(state.current.rays,row);}};
 paint.splat=function(center,radius,team,opts={}){const result=original.splat.call(this,center,radius,team,opts);if(state.current&&opts.claimOwner===a)bounded(state.paint,{point:center.toArray(),radius,team,kind:opts.kind??null,face:opts.face??null,claimed:result,tracked:true,time:G.time});return result;};
 const snapshot=()=>({admissions:state.admissions,steps:state.steps,paint:state.paint,errors:state.errors,firstStepSurvived:state.steps.length>0&&!state.steps[0].dead,trackedSurvives:!!state.tracked&&P.list.includes(state.tracked),changedPaintCells:paint.grid.reduce((sum,x,i)=>sum+(x!==state.gridBefore[i]?1:0),0),startTime:state.startTime,endTime:G.time});
 globalThis.__catalogueAcceptance={state,snapshot,restore(){P._push=original.push;P._step=original.step;R.update=original.runner;if(W)W.sweepSphere=original.sweep;paint.splat=original.splat;if(G.physics)G.physics.raycast=original.raycast;return P._push===original.push&&P._step===original.step&&R.update===original.runner&&(!W||W.sweepSphere===original.sweep)&&paint.splat===original.splat&&(!G.physics||G.physics.raycast===original.raycast);}};
}
export async function launchAndLand(){
 const G=NG,g=G.game,a=G.local;if(G.match.state!=='playing')throw Error('Refusing launch input before ordinary intro completes'); a.setWeapon('s3-blaster-short');
 const sample=()=>({alive:a.alive,grounded:a.grounded,phase:a.s3?.squidSpawn?.phase??null,position:a.pos.toArray(),velocity:a.vel.toArray()});const before=sample();
 if(before.phase!=='aim')throw Error('Expected ordinary initial launch aim phase; no forced pose fallback');
 g.input.mouse.left=true;try{for(let i=0;i<3;i++)g._frame(1/60);}finally{g.input.mouse.left=false;}
 let frames=3;for(;frames<363;frames++){if(a.alive&&a.grounded&&!a.s3?.squidSpawn?.phase)break;g._frame(1/60);}
 const {GroundHit}=await import(new URL('src/game/physics.js',document.baseURI)),{PLAYER}=await import(new URL('src/config.js',document.baseURI)),h=new GroundHit();
 G.physics.groundProbe(a.pos.x,a.pos.y,a.pos.z,a.form==='squid'?PLAYER.squidStepUp:PLAYER.stepUp,PLAYER.stepDown,PLAYER.footRadius,h,a.form==='squid');
 const support={hit:h.hit,block:h.block,normal:h.normal.toArray(),height:h.y,sourceFoot:!G.level.native||(h.block>=0&&h.block<G.level.staticBlockCount)};
 if(!a.alive||!a.grounded||a.s3?.squidSpawn?.phase||!h.hit||h.normal.y<=.68||Math.abs(h.y-a.pos.y)>.16||!support.sourceFoot)throw Error('Ordinary launch did not produce supported landing');
 for(let i=0;i<15;i++)g._frame(1/60);return{before,after:sample(),frames,support,method:'three actual mouse-left fixed ticks, release, normal controller/Actor landing; no spawnAt/pose/muzzle override'};
}
export function fireOneCatalogueShot(){
 const G=NG,g=G.game,o=__catalogueAcceptance;globalThis.__resetPairRandom();g.input.mouse.left=true;
 try{for(let i=0;i<120&&!o.state.steps.length;i++)g._frame(1/60);}finally{g.input.mouse.left=false;}
 if(o.state.admissions.length!==1||!o.state.steps.length||!o.state.tracked)throw Error('Expected exactly one actual catalogue admission and first step');
 globalThis.__projectileProbe={rounds:[o.state.tracked],camera:G.camera.clone()};return o.snapshot();
}
export function finishCatalogueShot(){const G=NG,g=G.game,o=__catalogueAcceptance;g.input.mouse.left=false;let frames=0;while(G.projectiles.list.includes(o.state.tracked)&&frames++<240)g._frame(1/60);G.paint.flush(1/60);g.R.render();return{...o.snapshot(),settleFrames:frames};}
export function evaluateCatalogueCase(row){
 const a=row.shot?.admissions?.[0],temporal=row.temporal;
 return{bound:row.bound===true&&row.errors.length===0,launch:!!row.launch?.support?.hit&&!!row.launch?.support?.sourceFoot,admission:row.shot?.admissions?.length===1&&a?.weapon==='s3-blaster-short'&&typeof a.descriptorKey==='string'&&a.descriptorKey.length>0&&a.family==='blaster'&&a.controllerActor&&a.mouseFire&&a.intentFire&&a.runner?.fire&&a.runner.dt===1/60&&a.alive&&a.grounded&&!a.phase,survival:row.shot?.firstStepSurvived===true,visible:temporal?.complete===true&&temporal.hooksRestored===true&&temporal.cameraRestored===true&&temporal.frames?.length===4&&temporal.frames.every(f=>f.nativeVisibilityEstablished&&f.pngVerified),paint:row.finished?.changedPaintCells>0&&row.finished.paint.some(p=>p.tracked&&p.claimed>0),screenshots:!!row.beforeImage&&!!row.afterImage,restored:row.hooksRestored===true};
}

export async function checkEmittedTinyCases(){
 const url=new URL('patches/native-stages/runtime/engine.mjs',document.baseURI).href,{NativeLevel}=await import(url),{Vector3,Triangle}=T,V=a=>new Vector3(...a),from=[-1.1029163644181494e-7,-5.6571220169459524e-8,0],delta=[1.0537703949066705e-7,0,0],radius=6.614618108166186e-8,change=-4.199653551258003e-8,rows=[];
 for(const [label,points,expected]of[['vertex-forward',[[0,0,0],[0,1,0],[1,0,0]],Infinity],['vertex-reverse',[[0,0,0],[1,0,0],[0,1,0]],Infinity],['finite-edge',[[0,-1,0],[0,1,0],[1,0,0]],(-from[0]-(radius+1e-10))/(delta[0]+change)]]){
  const tri=new Triangle(...points.map(V)),normal=tri.getNormal(V([0,0,0])),level=new NativeLevel({manifest:{id:'isolated-emitted-tiny-control',bounds:{minX:-10,minZ:-10,maxX:10,maxZ:10},spawnPads:[[-5,0,0],[5,0,0]],spawnBarrier:0,faces:[],objects:[{collidable:true,bounds:[[0,-1,0],[1,1,0]]}]},triangles:new Float32Array(points.flat()),normals:new Float32Array(normal.toArray()),flags:new Uint32Array([1]),objectIds:new Uint32Array([0]),nodes:new Float32Array([0,-1,0,1,1,0,-1,1]),order:new Uint32Array([0]),triangleFace:new Int32Array([-1]),mask:new Uint8Array(0)});
  const hit=level.triangleWorld.sweepSphere(V(from),V(from).add(V(delta)),radius,{endRadius:radius+change}),time=hit?.time??Infinity,passed=expected===Infinity?time===Infinity:Number.isFinite(time)&&Math.abs(time-expected)<2e-12&&Math.abs(-(from[0]+delta[0]*time)-(radius+change*time+1e-10))<1e-20;rows.push({label,expected:Number.isFinite(expected)?expected:null,actual:Number.isFinite(time)?time:null,passed,candidates:level.triangleWorld.triangleTests});
 }if(rows.some(r=>!r.passed))throw Error('Emitted tiny coefficient regression: '+JSON.stringify(rows));return{url,passed:true,total:3,rows,scope:'Actual emitted engine.NativeLevel/triangleWorld.sweepSphere including bundled kernel and broadphase; isolated controls do not mutate Game level; no source fixture or skip fallback'};
}

export function waitForOrdinaryPlay(){const G=NG,g=G.game,before=G.match.state;g.input.mouse.left=false;let frames=0;while(G.match.state!=='playing'&&frames<360){g._frame(1/60);frames++;}if(G.match.state!=='playing')throw Error('Ordinary intro did not complete within bound; launch remains unpressed');return{before,after:G.match.state,frames,fireHeld:false};}

// A separately labelled ordinary look-input case. Never adapt input to results.
export function ordinaryDownwardLook(){
 const G=NG,g=G.game,a=G.local;
 if(G.match.state!=='playing'||!a.alive||!a.grounded||a.s3?.squidSpawn?.phase)throw Error('Downward look requires ordinary supported play');
 if(g.input.mouse.left||g.input.mouse.dx||g.input.mouse.dy)throw Error('Unexpected pending mouse input');
 const before={position:a.pos.toArray(),yaw:a.aimYaw,pitch:a.aimPitch};
 const inputs=[];try{for(let i=0;i<8;i++){g.input.mouse.dy=25;inputs.push({frame:i,dx:0,dy:25,fire:false});g._frame(1/60);}}finally{g.input.mouse.dx=0;g.input.mouse.dy=0;g.input.mouse.left=false;}
 if(G.match.state!=='playing'||!a.alive||!a.grounded||a.s3?.squidSpawn?.phase||!Number.isFinite(before.pitch)||!Number.isFinite(a.aimPitch)||!(a.aimPitch<before.pitch-.01))throw Error('Ordinary downward look was not consumed in supported play');
 return{before,after:{position:a.pos.toArray(),yaw:a.aimYaw,pitch:a.aimPitch},inputs,method:'Eight fixed ordinary mouse dy=25 input ticks; no pose, rig, muzzle, physics or paint assignment; same inputs for both immutable variants'};
}
