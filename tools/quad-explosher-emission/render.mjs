// Fixed-source emission diagnosis. Native Projectiles and FX are actually in the rendered scene.
// Production files are unchanged. The explicit mouth arm moves the browser-only definition socket.
// Projectile and FX origins still use the native shared physical origin path.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {chromium} from 'playwright';
const arg=(n,d)=>process.argv.includes(n)?process.argv[process.argv.indexOf(n)+1]:d;
const site=path.resolve(arg('--site','_site')),out=path.resolve(arg('--out','.emission-evidence')),shape=arg('--shape','fe242'),originMode=arg('--origin','native');fs.mkdirSync(out,{recursive:true});
const identity=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),prefix='/_versions/'+identity.build.revision+'/';
const server=http.createServer((req,res)=>{if(req.url==='/review'){res.setHeader('Content-Type','text/html');res.end(`<html><head><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body style="margin:0"></body></html>`);return;}const p=path.resolve(site,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(site+'/')||!fs.existsSync(p)){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',/\.m?js$/.test(p)?'text/javascript':p.endsWith('.json')?'application/json':'application/octet-stream');fs.createReadStream(p).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const errors=[];
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const cases=[],ids=originMode==='mouth'?['s3-slosher-washtub']:['s3-maneuver-stepper','s3-slosher-washtub'];
 for(const id of ids)for(const fps of[30,60,120])cases.push({id,fps,pitch:0,wall:false,steady:true});
 for(const id of ids)cases.push({id,fps:60,pitch:0,wall:false,steady:false});
 for(const pitch of[-.3,.35])cases.push({id:'s3-slosher-washtub',fps:60,pitch,wall:false,steady:true});cases.push({id:'s3-slosher-washtub',fps:60,pitch:0,wall:true,steady:true});
 const results=[];
 for(const spec of cases){
  const page=await browser.newPage({viewport:{width:600,height:600}});page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('http://127.0.0.1:'+server.address().port+'/review');
  const result=await page.evaluate(async({prefix,spec,shape,originMode})=>{
   let seed=17291;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
   const THREE=await import('three'),{install}=await import(prefix+'patches/splatoon3/runtime/install.mjs'),profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json()),api=install(profile),{G,Actor,Character,Physics,Projectiles}=api;
   const {installWeaponsFidelity}=await import(prefix+'patches/splatoon3/runtime/weapons-fidelity.mjs'),{installMainWeaponCatalogRuntime}=await import(prefix+'patches/splatoon3/runtime/main-weapon-catalog.mjs');installWeaponsFidelity(api,profile);installMainWeaponCatalogRuntime(api,profile);
   const scene=new THREE.Scene(),renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(600,600);renderer.setClearColor(0xe8edf2,1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=1;document.body.append(renderer.domElement);
   const {Environment}=await import(prefix+'src/world/environment.js');const env=new Environment(renderer,scene);
   const camera=new THREE.PerspectiveCamera(30,1,.01,30);camera.position.set(-1.45,1.15,.65);camera.lookAt(0,.91,.30);G.camera=camera;G.scene=scene;G.time=0;G.teamColors=[new THREE.Color('#ff8825'),new THREE.Color('#484ce8')];
   const block=(id,x,y,z,hx,hy,hz)=>({id,solid:true,grate:false,center:new THREE.Vector3(x,y,z),half:new THREE.Vector3(hx,hy,hz),axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]});
   const blocks=[block(0,0,-.08,0,10,.08,10)];if(spec.wall)blocks.push(block(1,0,1,.80,2,1,.025));
   G.level={blocks,faces:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,o)=>{o.length=0;for(let i=0;i<blocks.length;i++)o.push(i);return o;}};G.physics=new Physics(G.level);const paints=[];G.paint={sample:()=>1,splat:(...x)=>{paints.push(x.slice(0,3).map(v=>v?.toArray?.()??v));return 0;}};G.match={playing:()=>true};
   for(const b of blocks){const m=new THREE.Mesh(new THREE.BoxGeometry(b.half.x*2,b.half.y*2,b.half.z*2),new THREE.MeshStandardMaterial({color:b.id?0x8290a0:0xd3d9df,roughness:.9}));m.position.copy(b.center);scene.add(m);}
   const {FX}=await import(prefix+'src/fx/fx.js');G.fx=new FX(scene,{quality:'high'});if(G.fx.inkVolumeReady)await G.fx.inkVolumeReady;if(G.fx.inkVolumeError)throw Error(G.fx.inkVolumeError);G.fx.setLighting(env.getSkyColors());G.fx.setCollider((a,b)=>{const h=G.physics.segment(a,b);return h.hit?{point:h.point.clone(),normal:h.normal.clone()}:null;});
   G.projectiles=new Projectiles(scene);
   const muzzle=new THREE.Vector3(),mouth=new THREE.Vector3();
   // Centres of the authored lip planes, derived from the published builder transforms.
   const localMouth=shape==='main80555'?null:spec.id==='s3-maneuver-stepper'?new THREE.Vector3(0,.065,.147):shape==='fe242'?new THREE.Vector3(0,.069+Math.sin(.48)*.05472,.249+Math.cos(.48)*.05472):new THREE.Vector3(0,.033-Math.sin(.08)*.05472,.273+Math.cos(.08)*.05472);
   const W=await import(prefix+'src/game/character-weapons.js'),definition=W.getWeaponDef(spec.id),originalMuzzle=definition.muzzle.toArray();if(originMode==='mouth'&&spec.id==='s3-slosher-washtub')definition.muzzle.copy(localMouth);
   const a=new Actor({team:0,weapon:spec.id,isLocal:true,name:'Emission-'+spec.id,CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;ch.actor=a;ch.onEvent=null;a.grounded=a.ground.hit=true;G.actors=[a];scene.add(ch.root);ch.setLod('game');if(ch._sourceMotionLoader)await ch._sourceMotionLoader;if(ch.sourceMotion?.ready)await ch.sourceMotion.ready;if(ch.sourceMotion?.status!=='ready')throw Error('source motion not ready');
   const points=()=>{ch.root.updateMatrixWorld(true);ch.getMuzzle(muzzle);if(localMouth){mouth.copy(localMouth);ch.weapon.off.localToWorld(mouth);}return{socket:muzzle.toArray(),mouth:localMouth?mouth.toArray():null,distance:localMouth?mouth.distanceTo(muzzle):null,aimReady:ch.aimReady()};};
   const births=[],fxCalls=[],events=[],impacts=[];api.on('weapon:impact',e=>impacts.push({time:G.time,pos:e.pos?.toArray?.(),kind:e.kind}));const push=G.projectiles._push;G.projectiles._push=function(p){if(p.wid===spec.id)births.push({time:G.time,pos:p.pos.toArray(),prev:p.prev.toArray(),start:p.start.toArray(),vel:p.vel.toArray(),delay:p.delay,points:points(),recipe:p._inkVolumeRecipe});return push.call(this,p);};
   const muzzleFX=G.fx.muzzle;G.fx.muzzle=function(p,d,c,k){fxCalls.push({time:G.time,pos:p.toArray(),dir:d.toArray(),kind:k});return muzzleFX.call(this,p,d,c,k);};api.on('weapon:fire',e=>{if(e.actor===a)events.push({time:G.time,muzzle:e.muzzle.toArray(),dir:e.dir.toArray()});});
   const originCalls=[],nativeOrigin=G.projectiles._muzzle;
   G.projectiles._muzzle=function(actor,out){
    const live=actor.character.getMuzzle(new THREE.Vector3()),aim=new THREE.Vector3(),ready=actor.character.aimReady(),hasAim=actor.character.getAimMuzzle(aim,actor.aimPitch),predicted=live.clone();
    if(ready<.98&&hasAim)predicted.lerp(aim,1-ready);
    const chest=actor.pos.clone();chest.y+=actor.form==='squid'?.4:1.05;
    const blocked=!G.physics.los(chest,predicted),fallback=!Number.isFinite(predicted.x)||predicted.distanceToSquared(chest)>2.5||blocked;
    const expected=fallback?chest.clone().addScaledVector(actor.aimDir,.3):predicted;
    const result=nativeOrigin.call(this,actor,out);originCalls.push({time:G.time,aimReady:ready,live:live.toArray(),fullAim:hasAim?aim.toArray():null,predicted:predicted.toArray(),blocked,fallback,effective:out.toArray(),nativeFormulaError:expected.distanceTo(out)});return result;
   };
   const dt=1/spec.fps,step=(fire,pressed)=>{a.ink=100;a.intent.fire=fire;a.aimPitch=spec.pitch;a.aimYaw=0;a.aimDir.set(0,Math.sin(spec.pitch),Math.cos(spec.pitch));a.aimPoint.copy(a.pos).add(new THREE.Vector3(0,1.05+Math.sin(spec.pitch)*6,Math.cos(spec.pitch)*6));G.time+=dt;a.weaponRunner.update(dt,{fire,firePressed:pressed});a._finishFrame(dt);ch.root.updateMatrixWorld(true);G.projectiles.update(dt);G.fx.update(dt,camera);};
   seed=19851123;for(let i=0;i<Math.round(spec.fps*1.2);i++)step(spec.steady,spec.steady&&i===0);
   // Preserve the real Runner and pose, clearing only preceding emission evidence.
   G.projectiles.clear();G.fx.clear();births.length=0;fxCalls.length=0;events.length=0;impacts.length=0;paints.length=0;originCalls.length=0;seed=19851123;
   const frames=[];let first=-1;
   for(let i=0;i<spec.fps*3;i++){step(first<0,!spec.steady&&i===0);if(first<0&&births.length)first=i;if(first<0)continue;const since=i-first;if(since>=16)break;
    const p=points();renderer.render(scene,camera);const images={side:renderer.domElement.toDataURL('image/png').split(',')[1]};
    if(spec.fps===60&&spec.pitch===0&&!spec.wall){camera.position.set(-.95,1.3,1.45);camera.lookAt(0,.91,.32);renderer.render(scene,camera);images.oblique=renderer.domElement.toDataURL('image/png').split(',')[1];camera.position.set(-1.45,1.15,.65);camera.lookAt(0,.91,.30);}
    frames.push({index:since,time:G.time,...p,projectiles:G.projectiles.list.filter(p=>p.wid===spec.id).map(p=>({pos:p.pos.toArray(),start:p.start.toArray(),vel:p.vel.toArray(),age:p.age,delay:p.delay})),images});
   }
   if(first<0||!frames.length)throw Error('No actual projectile birth '+spec.id);
   for(let i=0;i<Math.round(spec.fps*2.4)&&G.projectiles.list.some(p=>p.wid===spec.id);i++)step(false,false);
   // Single explicitly marked diagnostic image; never used as an unmarked firing frame.
   const marker=(p,color)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(.011,12,8),new THREE.MeshBasicMaterial({color,depthTest:false}));m.position.fromArray(p);m.renderOrder=999;scene.add(m);return m;};const pp=points(),m1=marker(pp.socket,0xff3300),m2=pp.mouth?marker(pp.mouth,0x00ccee):null;renderer.render(scene,camera);const markers=renderer.domElement.toDataURL('image/png').split(',')[1];scene.remove(m1);if(m2)scene.remove(m2);
   return{spec,shape,originMode,rngSeedAtWarmupAndCapture:19851123,originalMuzzle,impacts,originCalls,localMouth:localMouth?.toArray()??null,mouthMeaning:localMouth?'authored mouth':'not measured for main baseline',nativeMuzzle:ch.weapon.def.muzzle.toArray(),births,fxCalls,events,frames,markers,paintCalls:paints.length,nativeFX:true,nativeProjectiles:true,inkVolumeAssets:G.fx.inkVolumes?[...G.fx.inkVolumes.assets.keys()]:[],environment:{pmremWidth:scene.environment.image.width,pmremHeight:scene.environment.image.height,intensity:scene.environmentIntensity,toneMapping:renderer.toneMapping,postprocessing:false}};
  },{prefix,spec,shape,originMode});
  const key=`${spec.id}-${spec.fps}fps-p${spec.pitch}-${spec.wall?'wall':'open'}-${spec.steady?'steady':'first'}`,dir=path.join(out,key);fs.mkdirSync(dir,{recursive:true});for(const row of result.frames){for(const [view,data]of Object.entries(row.images))fs.writeFileSync(path.join(dir,`${view}-${String(row.index).padStart(3,'0')}.png`),Buffer.from(data,'base64'));delete row.images;}fs.writeFileSync(path.join(dir,'markers-red-socket-cyan-mouth.png'),Buffer.from(result.markers,'base64'));delete result.markers;fs.writeFileSync(path.join(dir,'measurements.json'),JSON.stringify(result,null,2));results.push({key,...spec,firstBirth:result.births[0],frames:result.frames.length,fxCalls:result.fxCalls.length});await page.close();
 }
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({shape,originMode,build:identity.build,inputHash:identity.inputHash,sourceFiles:identity.files,results,errors},null,2));if(errors.length)throw Error(errors.join('\n'));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
