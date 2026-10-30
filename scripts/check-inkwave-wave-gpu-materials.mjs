#!/usr/bin/env node
// Link actual emitted material factories in a real WebGL2 context.
// This complements gameplay images; it does not measure physical-device FPS.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
const option=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];};
const site=fs.realpathSync(option('--site','_site')),out=path.resolve(option('--out','.browser-evidence/wave-materials'));
assert.ok(!['/tmp','/var/tmp','/dev/shm'].some(p=>out===p||out.startsWith(p+'/')));fs.mkdirSync(out,{recursive:true});
const scratch=path.resolve('.ci-scratch/wave-material-tmp');fs.mkdirSync(scratch,{recursive:true});
for(const name of ['TMPDIR','TMP','TEMP'])process.env[name]=scratch;
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(hash(JSON.stringify(build.artifacts)),build.contentHash);
for(const [file,digest] of Object.entries(build.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,file))),digest,file);
const root=Object.keys(build.artifacts).find(p=>p.startsWith('_versions/')&&p.endsWith('/src/boss/bossMats.js'))?.replace(/src\/boss\/bossMats\.js$/,'');assert.ok(root);
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname),file=path.resolve(site,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error('Missing');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const engine=option('--browser','chromium');assert.ok(['chromium','webkit'].includes(engine));
const result={schema:1,status:'running',contentHash:build.contentHash,engine,errors:[],scope:'Shader link check of actual emitted boss, character, lobby and special VFX factories. Synthetic geometry is used only to select program defines. Gameplay images and physical-device behavior are separate checks.'};
const browser=await(engine==='webkit'?webkit.launch({headless:true}):chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']}));
try{
 const page=await browser.newPage({viewport:{width:640,height:480},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'});page.setDefaultTimeout(300000);
 page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/THREE\.WebGLProgram|GL_INVALID|VALIDATE_STATUS|shader error/i.test(m.text()))result.errors.push(m.text());});
 await page.addInitScript(()=>{Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});localStorage.setItem('inkwave.settings',JSON.stringify({quality:'high',musicVolume:0,audioVolume:0}));});
 await page.goto('http://127.0.0.1:'+server.address().port+'/?map=robo',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__G?.game?.menus&&__G.mode!=='boot');
 result.probe=await page.evaluate(async root=>{
  const G=__G,g=G.game;g.debug.freeze();g._skipRender=true;g.menus.wipe.cancel();
  await g.startMatch({mapId:'robo',mode:'turf',difficulty:'normal',duration:180});
  const [T,B,C,L,V]=await Promise.all(['vendor/three/build/three.module.js','src/boss/bossMats.js','src/game/character-mats.js','src/game/lobbySet-mats.js','patches/splatoon3/runtime/special-vfx-kit.mjs'].map(p=>import('/'+root+p)));
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(45,1,.1,100);scene.environment=G.scene.environment;camera.position.set(0,0,18);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  G.scene.traverse(object=>{if(object.isLight){const light=object.clone();if(light.shadow)light.shadow.mapSize.set(128,128);scene.add(light);}});
  const bossU=B.makeUniforms(),charU=C.makeCharUniforms(),lobbyU=L.makeUniforms();bossU.uCrack.value=1;bossU.uGlowL.value=1;
  if(charU.uFreckle)charU.uFreckle.value=1;
  const tex=new T.DataTexture(new Uint8Array([255,255,255,255]),1,1);tex.needsUpdate=true;
  const materials=[...Object.entries(B.makeBossMaterials(bossU)).map(([n,m])=>['boss-'+n,m]),['boss-crablet',B.makeCrabletMaterial(bossU)],
   ['skin',C.makeSkinMaterial(charU,'#edbda0')],['cloth',C.makeClothMaterial(charU)],['hair',C.makeHairMaterial(charU)],['eye',C.makeEyeMaterial(charU)],['glass',C.getGlassMaterial()],['squid',C.makeSquidMaterial(charU)],['squid-ghost',C.makeSquidMaterial(charU,true)],['plastic',C.getPlasticMaterial()],
   ['lobby-surface',L.surfaceMaterial(lobbyU,g.texlib,tex,scene.environment)],['lobby-ground',L.groundMaterial(lobbyU,g.texlib,tex,new T.Vector4(0,0,1,1),scene.environment)],['lobby-neon',L.neonMaterial(lobbyU)],['lobby-glow',L.glowMaterial(lobbyU)],['lobby-sky',L.skyMaterial(lobbyU)],['lobby-steam',L.steamMaterial(lobbyU)]];
  const meshes=[];let captured=0;
  for(let index=0;index<materials.length;index++){
   const [name,mat]=materials[index],geometry=new T.SphereGeometry(.7,16,12),original=mat.onBeforeCompile,key=mat.customProgramCacheKey();mat.customProgramCacheKey=()=>key+':wave-corpus-'+index;
   mat.onBeforeCompile=function(shader,...args){original.call(this,shader,...args);captured++;};mat.needsUpdate=true;
   const mesh=name==='lobby-glow'?new T.InstancedMesh(geometry,mat,1):new T.Mesh(geometry,mat);
   if(mesh.isInstancedMesh){mesh.setMatrixAt(0,new T.Matrix4());mesh.setColorAt(0,new T.Color(1,1,1));}
   mesh.name=name;mesh.position.set((index%5-2)*1.9,(2-Math.floor(index/5))*1.9,0);mesh.receiveShadow=true;scene.add(mesh);meshes.push(mesh);
  }
  const kit=new V.SpecialVfxKit(T,scene,.35);kit.update(0,camera);
  const renderer=G.renderer,gl=renderer.getContext(),prior=renderer.getRenderTarget(),target=new T.WebGLRenderTarget(128,128,{depthBuffer:true,stencilBuffer:false});
  const beforeError=gl.getError();if(beforeError)throw Error('Startup GL error before the material check: '+beforeError);
  renderer.setRenderTarget(target);await renderer.compileAsync(scene,camera);const error=gl.getError();
  const owners=[...materials,...kit.allPools.map((p,i)=>['vfx-'+i,p.mesh.material])];
  const programs=owners.map(([name,mat])=>{const p=renderer.properties.get(mat).currentProgram;if(!p)return{name,linked:false,log:'No current linked owner'};const linked=gl.getProgramParameter(p.program,gl.LINK_STATUS);return{name,linked,log:linked?'':gl.getProgramInfoLog(p.program),shaderLogs:linked?[]:(gl.getAttachedShaders(p.program)||[]).map(s=>gl.getShaderInfoLog(s))};});
  renderer.setRenderTarget(prior);
  kit.dispose();for(const mesh of meshes){mesh.geometry.dispose();mesh.material.dispose();}target.dispose();tex.dispose();
  if(error)throw Error('Material link GL error '+error);if(programs.some(p=>!p.linked))throw Error('Unlinked programs: '+JSON.stringify(programs.filter(p=>!p.linked)));
  return{factories:materials.map(([name])=>name),captured,programs,glError:error,environment:!!scene.environment};
 },root);
 assert.equal(result.errors.length,0);assert.ok(result.probe.captured>=20);assert.equal(result.probe.factories.length,20);result.status='passed';
}catch(e){result.status='failed';result.error=e.stack;process.exitCode=1;}
finally{fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');await browser.close();await new Promise(r=>server.close(r));}
console.log(JSON.stringify({status:result.status,error:result.error,factories:result.probe?.factories.length,programs:result.probe?.programs.length}));
