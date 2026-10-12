// Source-composed local and emitted-build CI evidence. Both use the native modules.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {createHash}from'node:crypto';import{chromium}from'playwright';
const opt=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];};
const source=opt('--source-root',null),site=path.resolve(opt('--site','_site')),root=source&&path.resolve(source),out=path.resolve(opt('--out','.ci-scratch/dynamo-handle')),baseline=process.argv.includes('--baseline');
fs.mkdirSync(out,{recursive:true});const identity=root?null:JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),prefix=root?'/composed/':'/_versions/'+identity.build.revision+'/';
const adapt=root?(await import(path.join(root,'scripts/inkwave-source-composition.mjs'))).adaptBuildSource:null;
const errors=[],requests=[];
const server=http.createServer((req,res)=>{
 if(req.url==='/review'){res.setHeader('Content-Type','text/html');res.end(`<html><head><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body style="margin:0"></body></html>`);return;}
 const url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let p,rel;
 if(root){rel=url.startsWith(prefix)?url.slice(prefix.length):url.slice(1);p=path.join(root,rel.startsWith('patches/')?rel:'inkwave-public/'+rel);}else p=path.resolve(site,'.'+url);
 if(!p.startsWith((root||site)+'/')||!fs.existsSync(p)){res.statusCode=404;res.end();errors.push('missing '+url);return;}
 const js=/\.m?js$/.test(p);res.setHeader('Content-Type',js?'text/javascript':p.endsWith('.json')?'application/json':'application/octet-stream');requests.push(url);
 if(root&&js){let code=fs.readFileSync(p,'utf8');if(!rel.startsWith('patches/'))code=adapt(rel,code);if(baseline&&rel==='patches/splatoon3/runtime/weapon-models/rollers.mjs')code=code.replace('r = 0.19, dz = 1.13, dx = 0, hz = 0.88','r = 0.19, dz = 1.13, dx = -0.37, hz = 0.88');res.end(code);}else fs.createReadStream(p).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:600,height:600}});
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('http://127.0.0.1:'+server.address().port+'/review');
 const result=await page.evaluate(async({prefix})=>{
 const THREE=await import('three'),{install}=await import(prefix+'patches/splatoon3/runtime/install.mjs'),profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json()),api=install(profile),{G,Actor,Character,Physics}=api;
 const {installWeaponsFidelity}=await import(prefix+'patches/splatoon3/runtime/weapons-fidelity.mjs'),{installMainWeaponCatalogRuntime}=await import(prefix+'patches/splatoon3/runtime/main-weapon-catalog.mjs');installWeaponsFidelity(api,profile);installMainWeaponCatalogRuntime(api,profile);
 const W=await import(prefix+'src/game/character-weapons.js'),M=await import(prefix+'src/game/character-mats.js'),{Environment}=await import(prefix+'src/world/environment.js'),{Renderer}=await import(prefix+'src/core/renderer.js');
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(600,600);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=1;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#e6eaf2');G.scene=scene;G.teamColors=[new THREE.Color('#ff8825'),new THREE.Color('#484ce8')];G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,o)=>{o.length=0;return o;}};G.physics=new Physics(G.level);G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};G.paint={sample:()=>1,splat:()=>0};G.match={playing:()=>true};G.time=0;G.projectiles=new api.Projectiles({add(){},remove(){}});
 const pixels=new Uint8Array(1024*512*4);for(let y=0;y<512;y++)for(let x=0;x<1024;x++){const v=y/512<9/16?235:130;pixels.set([v,v,Math.min(255,v+12),255],(y*1024+x)*4);}
 const sky=new THREE.DataTexture(pixels,1024,512);sky.mapping=THREE.EquirectangularReflectionMapping;sky.colorSpace=THREE.SRGBColorSpace;sky.needsUpdate=true;const pmrem=new THREE.PMREMGenerator(renderer),envRT=pmrem.fromEquirectangular(sky);scene.environment=envRT.texture;
 const hemi=new THREE.HemisphereLight(0xffffff,0x60718d,2.1),key=new THREE.DirectionalLight(0xffffff,3);key.position.set(-3,4,2);scene.add(hemi,key);
 const d=W.getWeaponDef('s3-roller-heavy'),g=new THREE.Group();g.add(new THREE.Mesh(d.body,M.getPlasticMaterial()),new THREE.Mesh(d.ink,M.getInkMaterial(G.teamColors[0])));const drum=new THREE.Group();drum.position.copy(d.drumAt);drum.add(new THREE.Mesh(d.drum,M.getInkMaterial(G.teamColors[0])),new THREE.Mesh(d.drumCaps,M.getPlasticMaterial()));g.add(drum);scene.add(g);
 const images={},metrics={};const snap=(label,cam)=>{renderer.render(scene,cam);images[label]=renderer.domElement.toDataURL('image/png').split(',')[1];};
 const cameras={};for(const[name,pos,up]of[['front',[0,4,.6],[0,0,1]],['back',[0,-4,.6],[0,0,1]],['side',[-4,0,.6],[0,0,1]],['axle',[0,0,4],[0,1,0]],['oblique',[-3,2.8,3],[0,1,0]]]){const cam=new THREE.OrthographicCamera(-1.5,1.5,1.5,-1.5,.01,20);cam.position.set(...pos);cam.up.set(...up);cam.lookAt(0,0,.6);cameras[name]=cam;}
 for(const [k,c]of Object.entries(cameras))snap('studio.'+k,c);
 metrics.studio={input:[1024,512],cubeSize:256,pmrem:[envRT.width,envRT.height],toneMapping:'Neutral',exposure:1};
 const nativeScene=new THREE.Scene(),env=new Environment(renderer,nativeScene);scene.remove(hemi,key);scene.add(env.sun,env.hemi);scene.environment=env.envMap;scene.environmentIntensity=nativeScene.environmentIntensity;metrics.native={theme:env.theme,pmrem:[env.envMap.image.width,env.envMap.image.height],intensity:scene.environmentIntensity,sun:env.sun.intensity,hemisphere:env.hemi.intensity};
 for(const [k,c]of Object.entries(cameras))snap('native.'+k,c);scene.remove(g);
 const a=new Actor({team:0,weapon:'s3-roller-heavy',isLocal:true,CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;ch.actor=a;ch.onEvent=null;a.grounded=a.ground.hit=true;G.actors=[a];scene.add(ch.root);if(ch._sourceMotionLoader)await ch._sourceMotionLoader;if(ch.sourceMotion?.ready)await ch.sourceMotion.ready;if(ch.sourceMotion?.status!=='ready')throw Error('Dynamo source motion not ready');metrics.motion=ch.sourceMotion.status;
 const camera=new THREE.PerspectiveCamera(34,1,.05,40);camera.position.set(-2.5,1.5,3.3);camera.lookAt(0,.8,.15);let maxGrip=0,maxSpin=0,maxFold=0;
 for(let n=0;n<360;n++){const t=n/60,fire=t>=.5&&t<2.5||t>=3&&t<5;a.ink=100;a.intent.fire=fire;a.grounded=a.ground.hit=!(t>=3&&t<4.4);a.intent.move.set(0,0,fire?1:0);a.vel.set(0,0,fire?2.4:0);a.aimPitch=0;G.time+=1/60;a.weaponRunner.update(1/60,{fire,firePressed:n===30||n===180});a._finishFrame(1/60);ch.root.updateMatrixWorld(true);
 if(!Array.from(ch.P).every(Number.isFinite))throw Error('nonfinite pose');const C=api.CHARACTER_CHANNELS;if(n>20&&ch.P[C.IKL]>.99&&ch.P[C.LTW]<.001)maxGrip=Math.max(maxGrip,ch.weapon.off.localToWorld(d.handL.pos.clone()).distanceTo(ch.bones.handL.getWorldPosition(new THREE.Vector3())));maxSpin=Math.max(maxSpin,Math.abs(ch.weapon.drum?.rotation.x||0));maxFold=Math.max(maxFold,Math.abs(ch.weapon.fold?.rotation.x||0));
 if([25,72,140,211,245,330].includes(n)){
  for(const [view,offset]of [['front',[-2.5,1.5,3.3]],['back',[2.5,1.5,-3.3]],['left',[3.3,1.2,.3]],['right',[-3.3,1.2,.3]]]){camera.position.set(...offset);camera.lookAt(0,.8,.15);snap('held.'+n+'.'+view,camera);}
 }
 }
 metrics.held={maxGrip,maxSpin,maxFold};
 camera.position.set(-2.5,1.5,3.3);camera.lookAt(0,.8,.15);const post=new Renderer(document.body,{quality:'high'});
 // PMREM render targets belong to their creating WebGL renderer/context.
 // Rebuild the native environment on the production renderer; never sample
 // the offscreen studio renderer's GPU-only cubeUV target in this context.
 const postEnvScene=new THREE.Scene(),postEnv=new Environment(post.renderer,postEnvScene);
 scene.remove(env.sun,env.hemi);scene.add(postEnv.sun,postEnv.hemi);scene.environment=postEnv.envMap;scene.environmentIntensity=postEnvScene.environmentIntensity;
 post.scene=scene;post.camera=camera;post.setScene(scene,camera);G.env=postEnv;post.render();images['held.production-post']=post.renderer.domElement.toDataURL('image/png').split(',')[1];metrics.post={quality:post.q,sameRendererEnvironment:true,pmrem:[postEnv.envMap.image.width,postEnv.envMap.image.height],environmentExposure:postEnv.grade?.uExposure,gtao:!!post.gtao,bloom:!!post.bloom,grade:!!post.grade,scope:'Native production post stack in isolated Actor scene, not a complete live stage'};postEnv.dispose();post._disposeComposer();post.renderer.dispose();
 d.drum.computeBoundingBox();metrics.geometry={drumCenter:d.drumAt.toArray(),drumWidth:d.drum.boundingBox.max.x-d.drum.boundingBox.min.x,handR:d.handR.pos.toArray(),handL:d.handL.pos.toArray(),physicalGripR:d.gripR.pos.toArray(),physicalGripL:d.gripL.pos.toArray(),muzzle:d.muzzle.toArray(),fold:d.fold.pivot.toArray()};ch.dispose();env.dispose();envRT.dispose();sky.dispose();pmrem.dispose();renderer.dispose();return{images,metrics};
 },{prefix});
 for(const[k,b64]of Object.entries(result.images))fs.writeFileSync(path.join(out,k+'.png'),Buffer.from(b64,'base64'));delete result.images;
 const record={mode:root?'source-composed':'emitted-build',baseline,revision:identity?.build.revision,contentHash:identity?.contentHash,requests:requests.length,errors,...result};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(record,null,2));console.log(JSON.stringify(record));assert.deepEqual(errors,[]);assert.ok(record.metrics.held.maxGrip<.008);assert.ok(record.metrics.held.maxSpin>0);assert.ok(record.metrics.held.maxFold>0);
}finally{await browser?.close();await new Promise(r=>server.close(r));}
