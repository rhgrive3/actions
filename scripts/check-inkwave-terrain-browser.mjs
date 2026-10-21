#!/usr/bin/env node
// Geometry-only WebGL coverage against an independent collision-triangle draw.
// No source textures/screenshots are published. Full game/material/hardware
// qualification is separate from this deterministic raster/culling check.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {build} from 'esbuild';import {chromium} from 'playwright';
import {nativeStageCatalog} from './lib/inkwave-native-stages.mjs';
import {convertSource} from '../patches/native-stages/runtime/source-convert.mjs';
const [siteArg,assetsArg,outArg]=process.argv.slice(2);assert(siteArg&&assetsArg&&outArg,'Usage: check-inkwave-terrain-browser.mjs <built-site> <private-derived-assets|--synthetic> <evidence-dir>');
const site=path.resolve(siteArg),out=path.resolve(outArg),synthetic=assetsArg==='--synthetic',assets=synthetic?null:path.resolve(assetsArg),catalog=nativeStageCatalog();fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync('patches/native-stages/runtime/native-render.mjs');
await build({stdin:{contents:"export {nativeDisplay} from './patches/native-stages/runtime/native-render.mjs';",resolveDir:process.cwd()},bundle:true,format:'esm',outfile:path.join(out,'probe.mjs'),external:['three'],plugins:[{name:'emitted-level-material',setup(b){b.onResolve({filter:/\/src\/world\/levelMaterial\.js$/},()=>({path:'/src/world/levelMaterial.js',external:true}));}}]});
const names={vertices:Float32Array,indices:Uint32Array,triangles:Float32Array,normals:Float32Array,flags:Uint32Array,objectIds:Uint32Array,nodes:Float32Array,order:Uint32Array,triangleFace:Int32Array,mask:Uint8Array},files={triangles:'collision',objectIds:'objects',nodes:'bvh'},synthetics=new Map();
if(synthetic)for(const stage of catalog.stages){
 const ps=[[-3,0,-2],[-3,0,2],[-1,0,2],[-1,0,-2],[1,0,-2],[1,0,2],[3,0,2],[3,0,-2],[-3,2,-2],[-1,2,-2],[1,1,0],[3,1,0]];
 const obj='o Fld_Probe__GroundGrassMoss\nusemtl GroundGrassMoss\n'+ps.map(p=>'v '+p.join(' ')).join('\n')+'\n'+ps.map(()=>'vn 0 1 0').join('\n')+'\n'+[[1,2,3],[1,3,4],[5,6,7],[5,7,8],[1,4,10],[1,10,9],[5,11,12],[5,12,8]].map(t=>'f '+t.map(i=>`${i}//${i}`).join(' ')).join('\n')+'\n';
 synthetics.set(stage.id,convertSource({...stage,bounds:{minX:-4,maxX:4,minZ:-4,maxZ:4},spawnPads:[[-2,0,1],[2,0,1]]},obj,'newmtl GroundGrassMoss\nKd 1 1 1\n',{}));
}
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{try{
 const url=new URL(req.url,'http://local'),p=decodeURIComponent(url.pathname);
 if(p==='/'){res.setHeader('content-type','text/html');res.end('<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js"}}</script>');return;}
 const match=p.match(/^\/terrain\/([-a-z0-9]+)\/([-a-zA-Z0-9.]+)$/);
 if(match&&synthetic){const data=synthetics.get(match[1]);assert(data);if(match[2]==='manifest.json'){res.setHeader('content-type','application/json');res.end(JSON.stringify(data.manifest));return;}const key=Object.keys(names).find(k=>(files[k]||k)+'.bin'===match[2]);assert(key);res.end(new Uint8Array(data[key].buffer));return;}
 const root=match?assets:p==='/probe.mjs'?out:site,relative=match?match[1]+'/'+match[2]:p.slice(1),file=path.resolve(root,relative);assert(file.startsWith(root+'/'));
 res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).on('error',()=>{res.statusCode=404;res.end();}).pipe(res);
 }catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const result={status:'running',scope:synthetic?'synthetic terrain under every playable native stage definition':'all pinned native source geometry; no authentic texture/material or whole-game FPS claim',renderSourceSha256:crypto.createHash('sha256').update(source).digest('hex'),stages:[],errors:[]},save=()=>fs.writeFileSync(path.join(out,'terrain-browser.json'),JSON.stringify(result,null,2)+'\n');
try{
 const page=await browser.newPage();page.on('pageerror',e=>result.errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
 for(const stage of catalog.stages){
  const proof=await page.evaluate(async({id,synthetic})=>{
   const T=await import('three'),{nativeDisplay}=await import('/probe.mjs'),{NativeLevel,NativePhysics}=await import('/patches/native-stages/runtime/engine.mjs');
   const manifest=await(await fetch('/terrain/'+id+'/manifest.json')).json(),data={manifest},specs={vertices:Float32Array,indices:Uint32Array,triangles:Float32Array,normals:Float32Array,flags:Uint32Array,objectIds:Uint32Array,nodes:Float32Array,order:Uint32Array,triangleFace:Int32Array,mask:Uint8Array},files={triangles:'collision',objectIds:'objects',nodes:'bvh'};
   for(const [key,Type] of Object.entries(specs))data[key]=new Type(await(await fetch('/terrain/'+id+'/'+(files[key]||key)+'.bin')).arrayBuffer());
   const level=new NativeLevel(data),physics=new NativePhysics(level),r=new T.WebGLRenderer({antialias:false});r.setSize(256,160);r.setClearColor(0);const target=new T.WebGLRenderTarget(256,160),camera=new T.PerspectiveCamera(55,256/160,.01,2000),scene=new T.Scene();r.setRenderTarget(target);
   const check=(ok,message)=>{if(!ok)throw Error(id+': '+message);},origin=new T.Vector3(),dir=new T.Vector3();
   let raySamples=0;const categories={floor:0,wall:0,slope:0};
   for(let i=0;i<data.flags.length;i++){
    const y=Math.abs(data.normals[i*3+1]),category=y>.7?'floor':y<.3?'wall':'slope';if(categories[category]>=32)continue;
    const a=new T.Vector3().fromArray(data.triangles,i*9),b=new T.Vector3().fromArray(data.triangles,i*9+3),c=new T.Vector3().fromArray(data.triangles,i*9+6);
    if(b.sub(a).cross(c.sub(a)).length()<.01)continue;
    dir.fromArray(data.normals,i*3);origin.set(0,0,0);for(let j=0;j<3;j++)origin.add(new T.Vector3().fromArray(data.triangles,i*9+j*3));origin.multiplyScalar(1/3).addScaledVector(dir,.05);dir.negate();
    const hit=physics.raycast(origin,dir,.1);check(hit.hit,'source '+category+' ray missed');categories[category]++;raySamples++;
   }
   if(synthetic)check(!physics.raycast(new T.Vector3(0,.5,1),new T.Vector3(0,-1,0),1).hit,'intentional polygon gap filled');
   const central=[];if(id==='bluefin'&&!synthetic)for(const [x,z] of [[12,6],[-12,-6],[18,6],[-18,-6]]){const h=physics.raycast(new T.Vector3(x,3.2,z),new T.Vector3(0,-1,0),.4);check(h.hit&&Math.abs(h.point.y-3)<1e-6,'central floor missing');central.push({x,z,y:h.point.y});}
   // Use opaque untextured geometry for both rasterizations. This isolates
   // missing triangles/culling from unverified retail material semantics.
   const geometryManifest={...manifest,objects:manifest.objects.map(o=>({...o,glass:false})),materials:Object.fromEntries(Object.keys(manifest.materials).map(k=>[k,{maps:{}}]))};
   const refGeometry=new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(data.triangles,3)),refMaterial=new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide}),reference=new T.Mesh(refGeometry,refMaterial);reference.frustumCulled=false;scene.add(reference);scene.overrideMaterial=refMaterial;
   const pixels=()=>{const b=new Uint8Array(256*160*4);r.readRenderTargetPixels(target,0,0,256,160,b);return b;},B=manifest.bounds,cx=(B.minX+B.maxX)/2,cz=(B.minZ+B.maxZ)/2,span=Math.max(B.maxX-B.minX,B.maxZ-B.minZ),h=synthetic?0:3;
   const views=[[[cx,h+span*.7,cz+.01],[cx,h,cz]],[[cx,h+span*.2,cz+span*.25],[cx,h,cz]],[[B.minX-2,h+4,cz],[cx,h,cz]],[[B.maxX+2,h+4,cz],[cx,h,cz]],[[cx,h+2,B.minZ],[cx,h,cz]],[[cx,h+2,B.maxZ],[cx,h,cz]],[[10000,10000,10000],[10001,10000,10000]],[[cx,h+span*.2,cz+span*.25],[cx,h,cz]]];
   const frames=[];let visiblePixels=0;
   for(let reload=0;reload<2;reload++){
    const display=nativeDisplay({...data,manifest:geometryManifest},new Map(),'low');scene.add(display.group);
    for(const object of [display.group,reference]){object.position.set(reload*.25,0,reload*-.25);object.rotation.y=reload*.11;object.scale.setScalar(reload?.8:1);}
    for(const mesh of display.group.children){mesh.visible=mesh.userData.nativeObject.collidable;mesh.material.color.setRGB(0,0,0);mesh.material.emissive.setRGB(1,1,1);}
    for(let index=0;index<views.length;index++){
     if(index===2)display.updateTextures(new Map(),'balanced');if(index===4)display.updateTextures(new Map(),'high');
     const [position,look]=views[index];camera.position.set(...position);camera.lookAt(...look);camera.updateMatrixWorld();display.group.visible=true;reference.visible=false;r.render(scene,camera);const actual=pixels(),draws=r.info.render.calls;
     display.group.visible=false;reference.visible=true;r.render(scene,camera);const expected=pixels();let changed=0,visible=0;for(let i=0;i<actual.length;i+=4){const a=actual[i]+actual[i+1]+actual[i+2]>0,b=expected[i]+expected[i+1]+expected[i+2]>0;if(a!==b)changed++;if(a)visible++;}check(changed===0,'render/collision raster mismatch '+JSON.stringify({reload,index,changed}));visiblePixels+=visible;frames.push({reload,index,changedPixels:changed,visiblePixels:visible,draws});
    }
    display.dispose();
   }
   check(visiblePixels>0,'vacuous blank frames');refGeometry.dispose();refMaterial.dispose();target.dispose();r.renderLists.dispose();check(r.info.memory.geometries===0,'geometry leak after reload');const gl=r.getContext();check(gl.getError()===gl.NO_ERROR,'WebGL error');const memory={...r.info.memory};r.dispose();r.forceContextLoss();
   return {id,raySamples,categories,central,frames,memoryAfterDispose:memory,geometryOnly:true};
  },{id:stage.id,synthetic});result.stages.push(proof);save();console.log(stage.id+' WebGL coverage/reload passed');
 }
 assert.equal(result.stages.length,catalog.stages.length);
 result.procedural=[];
 for(const id of ['tidewater','kelpline','halyard','cargo']){
  const proof=await page.evaluate(async id=>{
   const T=await import('three'),{Level}=await import('/src/world/level.js'),{MAP_LAYOUTS}=await import('/src/world/maps.js'),level=new Level(MAP_LAYOUTS[id]);
   const geometry=level.buildGeometry(1024),material=new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide}),mesh=new T.Mesh(geometry,material),scene=new T.Scene();scene.add(mesh);
   const r=new T.WebGLRenderer({antialias:false});r.setSize(256,160);r.setClearColor(0);const target=new T.WebGLRenderTarget(256,160);r.setRenderTarget(target);const camera=new T.PerspectiveCamera(55,1.6,.01,2000),B=level.bounds,x=(B.minX+B.maxX)/2,z=(B.minZ+B.maxZ)/2,span=B.maxZ-B.minZ,frames=[];
   const pixels=()=>{const p=new Uint8Array(256*160*4);r.readRenderTargetPixels(target,0,0,256,160,p);return p;};
   for(const [position,look] of [[[x,span*.7,z+.01],[x,0,z]],[[x,10,z+15],[x,0,z]],[[B.minX-2,6,z],[x,0,z]],[[B.maxX+2,6,z],[x,0,z]],[[x,6,B.minZ],[x,0,z]],[[x,6,B.maxZ],[x,0,z]],[[10000,10000,10000],[10001,10000,10000]],[[x,10,z+15],[x,0,z]]]){
    camera.position.set(...position);camera.lookAt(...look);camera.updateMatrixWorld();mesh.frustumCulled=true;r.render(scene,camera);const a=pixels();mesh.frustumCulled=false;r.render(scene,camera);const b=pixels();let changed=0,visible=0;for(let i=0;i<a.length;i+=4){if(a[i]!==b[i])changed++;if(a[i])visible++;}if(changed)throw Error(id+' procedural culling mismatch');frames.push({changedPixels:changed,visiblePixels:visible});
   }
   if(!frames.some(f=>f.visiblePixels>0))throw Error(id+' blank procedural frames');geometry.dispose();material.dispose();target.dispose();if(r.info.memory.geometries!==0)throw Error(id+' geometry leak');r.dispose();r.forceContextLoss();return {id,frames};
  },id);result.procedural.push(proof);save();console.log(id+' procedural WebGL coverage passed');
 }
 assert.equal(result.errors.length,0,JSON.stringify(result.errors));result.status='passed';
}catch(error){result.status='failed';result.error=error.stack;throw error;}finally{save();await browser.close();await new Promise(r=>server.close(r));}
