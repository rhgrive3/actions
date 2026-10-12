import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {chromium} from 'playwright';
const site=process.argv[2],out=process.argv[3];fs.mkdirSync(out,{recursive:true});const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),prefix='/_versions/'+manifest.build.revision+'/';
const server=http.createServer((req,res)=>{if(req.url==='/review'){res.setHeader('Content-Type','text/html');res.end(`<html><head><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body style="margin:0"></body></html>`);return;}const p=path.resolve(site,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(site+'/')||!fs.existsSync(p)){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',/\.m?js$/.test(p)?'text/javascript':p.endsWith('.json')?'application/json':'application/octet-stream');fs.createReadStream(p).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const errors=[];
try{browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:640,height:480}});page.on('pageerror',e=>errors.push(String(e)));await page.goto('http://127.0.0.1:'+server.address().port+'/review');
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const result=await page.evaluate(async({prefix})=>{
 let seed=1234;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const THREE=await import('three'),{install}=await import(prefix+'patches/splatoon3/runtime/install.mjs'),profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json()),api=install(profile),{G,Actor,Character,Physics}=api;
 const {installWeaponsFidelity}=await import(prefix+'patches/splatoon3/runtime/weapons-fidelity.mjs'),{installMainWeaponCatalogRuntime}=await import(prefix+'patches/splatoon3/runtime/main-weapon-catalog.mjs');installWeaponsFidelity(api,profile);installMainWeaponCatalogRuntime(api,profile);
 const {Renderer}=await import(prefix+'src/core/renderer.js'),{Environment}=await import(prefix+'src/world/environment.js'),{DEFAULT_SETTINGS}=await import(prefix+'src/config.js');
 G.mobile={touch:true,ios:true,ipad:true};const post=new Renderer(document.body,{...DEFAULT_SETTINGS,quality:'high',bloom:true,shadows:true}),r=post.renderer,gl=r.getContext(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,640/480,.05,60);r.debug.checkShaderErrors=true;
 G.renderer=r;G.scene=scene;G.post=post;G.teamColors=[new THREE.Color('#ff8825'),new THREE.Color('#484ce8')];G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,o)=>{o.length=0;return o;}};G.physics=new Physics(G.level);G.paint={sample:()=>1,splat:()=>0};G.match={playing:()=>true};G.time=4;G.projectiles=new api.Projectiles({add(){},remove(){}});G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 camera.position.set(-5,3.5,8);camera.lookAt(0,.8,0);post.setScene(scene,camera);
 const nativeScene=new THREE.Scene(),env=new Environment(r,nativeScene,{theme:'day'});scene.environment=env.envMap;scene.environmentIntensity=nativeScene.environmentIntensity;scene.add(env.sun,env.hemi);G.env=env;scene.background=new THREE.Color('#eef3f8');
 const actors=[];for(let k=0;k<8;k++){const a=new Actor({team:k%2,weapon:'shooter',isLocal:k===0,CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;ch.actor=a;ch.onEvent=null;a.grounded=a.ground.hit=true;a.pos.set((k%4-1.5)*1.15,0,Math.floor(k/4)*1.5);scene.add(ch.root);actors.push(a);await ch._sourceMotionLoader;await ch.sourceMotion.ready;if(ch.sourceMotion.status!=='ready')throw Error('source motion unavailable');ch.setLod('game');for(let f=0;f<120;f++)a._finishFrame(1/60);}
 G.actors=actors;
 const snapshots=[],scenarios=[],cpu=[];
 const snap=()=>({actors:actors.map(a=>{const ch=a.character,nodes=[];ch.root.traverse(o=>nodes.push([o.name,o.visible,...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray(),...o.matrixWorld.elements]));return {state:ch.sourceMotion.state,form:ch.form,tier:ch.lodTier,nodes,muzzle:ch.getMuzzle(new THREE.Vector3()).toArray(),left:ch.getMuzzleHand(new THREE.Vector3(),1).toArray(),contacts:ch.sourceMotion.retarget.contacts.map(f=>[f.locked,f.slip,f.lastClearance,...f.actual.toArray()])};})});
 for(const hz of [30,60,120]){
  for(let frame=0;frame<192;frame++){
   const phase=Math.floor(frame/24);G.time+=1/hz;
   for(let k=0;k<actors.length;k++){
    const a=actors[k],ch=a.character; a.grounded=a.ground.hit=phase!==4;a.form=phase===6?'swim':'kid';a.intent.fire=phase===3;a.aimPitch=phase===3?.4:0;
    a.vel.set(phase===1?1.2:0,phase===4?.8:0,phase===2?1:0);a.pos.addScaledVector(a.vel,1/hz);if(phase===2)a.yaw+=.02;
    if(frame%24===0){if(phase===4)ch.trigger('jump');if(phase===5)ch.trigger('land');if(phase===7){ch.trigger('spawn');a.setWeapon(k%2?'roller':'dualies');}ch.setLod(['hero','game','far'][phase%3]);}
    a._finishFrame(1/hz);
   }
   if(frame%6===0){snapshots.push({hz,frame,...snap()});}
  }
  scenarios.push({hz,frames:192,actors:8});
 }
 // Warm stable ground walking; measure CPU updates without rendering or instrumentation.
 for(const [k,a]of actors.entries()){a.pos.set((k%4-1.5)*1.15,0,Math.floor(k/4)*1.5);a.grounded=a.ground.hit=true;a.form='kid';a.vel.set(0,0,0);a.character.setLod('game');}
 const tick=()=>{G.time+=1/60;for(const a of actors){a.pos.x+=.0035;a.vel.set(.21,0,0);a._finishFrame(1/60);}};
 for(let f=0;f<120;f++)tick();
 for(let batch=0;batch<6;batch++){const start=performance.now();for(let f=0;f<60;f++)tick();cpu.push(performance.now()-start);}
 const orig=THREE.Object3D.prototype.updateWorldMatrix;let calls=0;THREE.Object3D.prototype.updateWorldMatrix=function(...args){calls++;return orig.apply(this,args)};for(let f=0;f<60;f++)tick();THREE.Object3D.prototype.updateWorldMatrix=orig;
 snapshots.push({final:true,...snap()});
 const render=[];const pixel=new Uint8Array(4);for(let frame=0;frame<4;frame++){r.info.reset();const t=performance.now();post.render();const submitted=performance.now();gl.readPixels(320,240,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);const completed=performance.now();if(gl.getError()||gl.isContextLost()||pixel[3]!==255)throw Error('Invalid completed output');render.push({frame,submitMs:submitted-t,readbackMs:completed-submitted,completedMs:completed-t,calls:r.info.render.calls,triangles:r.info.render.triangles,pixel:[...pixel]});}
 const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const png=r.domElement.toDataURL('image/png').split(',')[1];const pixelHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))).map(n=>n.toString(16).padStart(2,'0')).join('');
 const ext=gl.getExtension('WEBGL_debug_renderer_info');return {cpu,render,worldUpdatesPerActorFrame:calls/480,snapshots,scenarios,pixelHash,png,source:actors.map(a=>a.character.sourceMotion.state),backend:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),q:post.q,scope:'Native Actor/source-motion rig fixture with renderer-owned native day environment and touch profile. No real iPad timing; no populated arena, AI or collision benchmark.'};
},{prefix});fs.writeFileSync(path.join(out,'crowd.png'),Buffer.from(result.png,'base64'));delete result.png;fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({contentHash:manifest.contentHash,errors,...result}));console.log(JSON.stringify({cpu:result.cpu,pixelHash:result.pixelHash,worldUpdatesPerActorFrame:result.worldUpdatesPerActorFrame,source:result.source,errors}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
