import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const {chromium}=createRequire(import.meta.url)('playwright');
const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const out=path.resolve(option('--out','.browser-evidence/roll-hissen'));fs.mkdirSync(out,{recursive:true});
const reviewURL=new URL('review.html',option('--url','http://127.0.0.1:8000/')).href;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:960,height:720}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('**/review.html',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><style>body{margin:0;background:#263344}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>`}));
await page.addInitScript(()=>{let seed=0x1029;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};});
await page.goto(reviewURL);
await page.exposeFunction('saveFrame',(name,data)=>fs.writeFileSync(out+'/'+name+'.png',Buffer.from(data.split(',')[1],'base64')));
const result=await page.evaluate(async()=>{
 const T=await import('three'),{install}=await import('/patches/splatoon3/runtime/install.mjs');
 const profile=await fetch('/patches/splatoon3/profile.json').then(r=>r.json());
 const api=install(profile),{G,Actor,Character,FX,Projectiles}=api;
 const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(960,720);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NeutralToneMapping;renderer.toneMappingExposure=1;
 document.body.append(renderer.domElement);const scene=new T.Scene();scene.background=new T.Color('#263344');
 const camera=new T.PerspectiveCamera(35,960/720,.01,100);camera.position.set(3,2.3,4);camera.lookAt(0,.5,0);camera.updateMatrixWorld();
 Object.assign(G,{scene,camera,renderer,settings:{quality:'high',shadows:false},mode:'match',actors:[],time:0,
 teamColors:[new T.Color('#e8d62b'),new T.Color('#6a33ef')],level:{blocks:[],groundHeight:()=>0},paint:{sample:()=>1,splat:()=>0},
 physics:{raycast:(_a,_b,_c,h)=>{h.hit=false;return h;},segment:(_a,_b,h)=>{h.hit=false;return h;},los:()=>true},match:{playing:()=>true,canRespawn:()=>false}});
 scene.add(new T.HemisphereLight(0xeef5ff,0x394a67,2));const sun=new T.DirectionalLight(0xffffff,3);sun.position.set(3,5,2);scene.add(sun);
 const floor=new T.Mesh(new T.PlaneGeometry(100,100),new T.MeshStandardMaterial({color:'#48566a',roughness:.65}));floor.rotation.x=-Math.PI/2;floor.position.y=-.03;scene.add(floor);
 class NativeCharacter extends Character{constructor(o){super({...o,sourceMotion:false});}}
 const a=new Actor({team:0,name:'roll-effect-review',weapon:'shooter',CharacterClass:NativeCharacter,isLocal:true,style:{hair:0,hat:0,skin:2,outfit:0,eyes:0}});
 a.character.actor=a;a.character.onEvent=null;a.character.setLod('hero');scene.add(a.character.root);G.actors=[a];
 a.form='squid';a.submerged=false;a.grounded=false;a.pos.set(0,.3,0);a.vel.set(0,0,4);
 for(let i=0;i<60;i++){G.time+=1/60;a._finishFrame(1/60);}
 const fx=G.fx=new FX(scene,{quality:.7});await fx.inkVolumeReady;
 a.s3.actions={roll:{time:.25,armorTime:.3,armorHP:30,vx:0,vz:4}};
 a.character.trigger('squidroll',{duration:.25});
 const rows=[];
 for(let i=0;i<14;i++){
  G.time+=1/60;a.s3.actions.roll.time=.25-i/60;a.pos.y=.3+Math.sin(i/14*Math.PI)*.35;a._finishFrame(1/60);scene.updateMatrixWorld(true);
  const pose=()=>JSON.stringify({q:a.character.squid.pivot.quaternion,s:a.character.squid.pivot.scale,pos:a.pos,vel:a.vel,roll:a.s3.actions.roll});const before=pose();
  fx.update(1/60,camera);if(pose()!==before)throw Error('FX edited body/gameplay');
  if([0,3,6,10].includes(i)){
   fx.root.visible=false;renderer.render(scene,camera);await window.saveFrame('roll-'+i+'-before',renderer.domElement.toDataURL());
   fx.root.visible=true;renderer.render(scene,camera);await window.saveFrame('roll-'+i+'-after',renderer.domElement.toDataURL());
   rows.push({frame:i,glows:fx.glows.n,drops:fx.dN,poseUnchanged:true});
  }
 }
 a.s3.actions.roll=null;scene.remove(a.character.root);a.character.dispose();fx.dispose();G.actors=[];G.fx=null;
 const b=new Actor({team:0,name:'hissen-review',weapon:'s3-slosher-diffusion',CharacterClass:NativeCharacter,isLocal:true});b.character.actor=b;b.character.onEvent=null;
 b.pos.set(0,1,0);b.form='kid';b.grounded=true;b.aimDir.set(0,.05,1).normalize();b.aimPoint.set(0,2,50);
 const ps=G.projectiles=new Projectiles(scene);G.actors=[b];
 const ink=G.fx=new FX(scene,{quality:1});await ink.inkVolumeReady;await ink.requestHissenFallback();
 const {submitInkVolume}=await import('/patches/local-quality/ink-volume/recipes.mjs');
 b._integrate=()=>{};b._finishFrame=()=>{};b._spawnBarrier=()=>{};b.intent.fire=true;
 let fired=false;
 for(let i=0;i<100;i++){G.time+=1/60;b.update(1/60);ps.update(1/60);if(ps.list.some(p=>p.age>0)){fired=true;break;}}
 if(!fired)throw Error('Hissen native admission failed');b.intent.fire=false;
 for(let i=0;i<5;i++){G.time+=1/60;b.update(1/60);ps.update(1/60);}
 ps.projectileVisuals.mesh.visible=false;ps.blobs.visible=false;
 const live=ps.list.filter(p=>p.delay<=0),snapshot=JSON.stringify(live.map(p=>({pos:p.pos,vel:p.vel,age:p.age,damage:p.damage,size:p.size,vis:p.vis})));
 camera.position.set(7,5,8);camera.lookAt(0,1.7,2.7);camera.updateMatrixWorld();
 const hissen=[];
 for(const factor of [1,1.5]){
  ink.inkVolumes.begin(camera);
  for(const p of live){
   const engine=ink.inkVolumes;
   const proxy={assets:engine.assets,metrics:engine.metrics,submitComposite:(owner,parts)=>{
    const part=parts[0],ratio=factor/1.5;part.stretch.multiplyScalar(ratio);part.position.sub(owner.pos).multiplyScalar(ratio).add(owner.pos);
    return engine.submitComposite(owner,parts);
   }};
   submitInkVolume(proxy,p);
  }
  ink.inkVolumes.end();renderer.render(scene,camera);await window.saveFrame('hissen-'+factor,renderer.domElement.toDataURL());
  hissen.push({factor,active:ink.inkVolumes.metrics.active,triangles:ink.inkVolumes.metrics.triangles});
 }
 if(JSON.stringify(live.map(p=>({pos:p.pos,vel:p.vel,age:p.age,damage:p.damage,size:p.size,vis:p.vis})))!==snapshot)throw Error('Hissen draw mutated gameplay');
 return {rows,hissen,renderer:renderer.info.render,build:await fetch('/inkwave-build.json').then(r=>r.json()).then(m=>({contentHash:m.contentHash,source:m.source})),note:'Driven native Character pose and native admitted Hissen volley, controlled render comparison; not a full live match or Switch comparison.'};
});
fs.writeFileSync(out+'/receipt.json',JSON.stringify({...result,seed:'0x1029',errors},null,2)+'\n');console.log(JSON.stringify({...result,errors},null,2));await browser.close();if(errors.length)throw Error(errors.join('\n'));
