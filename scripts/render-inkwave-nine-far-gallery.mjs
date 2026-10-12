#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import os from 'node:os';import {chromium} from 'playwright';
const arg=(key,fallback)=>{const n=process.argv.indexOf(key);return n<0?fallback:process.argv[n+1];};
const site=path.resolve(arg('--site','_site')),out=path.resolve(arg('--out','.lod-evidence')),crowd=process.argv.includes('--crowd'),size=Number(arg('--size',320));fs.mkdirSync(out,{recursive:true});
const identity=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),prefix='/_versions/'+identity.build.revision+'/',hostStart={at:new Date().toISOString(),load:os.loadavg(),cpus:os.cpus().length};
const server=http.createServer((req,res)=>{if(req.url==='/review'){res.setHeader('Content-Type','text/html');res.end(`<html><head><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body style="margin:0"></body></html>`);return;}const p=path.resolve(site,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(site+'/')||!fs.existsSync(p)){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',/\.m?js$/.test(p)?'text/javascript':p.endsWith('.json')?'application/json':'application/octet-stream');fs.createReadStream(p).pipe(res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const errors=[];
try{browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:size,height:size}});page.on('pageerror',e=>errors.push(String(e)));await page.goto('http://127.0.0.1:'+server.address().port+'/review');
await page.evaluate(async({prefix,size})=>{
 let seed=0x51a7c0de;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const THREE=await import('three'),{install}=await import(prefix+'patches/splatoon3/runtime/install.mjs'),profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json()),api=install(profile),{G,Physics}=api;
 const {installWeaponsFidelity}=await import(prefix+'patches/splatoon3/runtime/weapons-fidelity.mjs'),{installMainWeaponCatalogRuntime}=await import(prefix+'patches/splatoon3/runtime/main-weapon-catalog.mjs');installWeaponsFidelity(api,profile);installMainWeaponCatalogRuntime(api,profile);
 const W=await import(prefix+'src/game/character-weapons.js'),M=await import(prefix+'src/game/character-mats.js'),R=await import(prefix+'patches/splatoon3/runtime/weapon-models/registry.mjs'),L=await import(prefix+'src/game/character-lod.js');
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setSize(size,size);renderer.setClearColor(0xffffff,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=1;document.body.append(renderer.domElement);
 const scene=new THREE.Scene(),pmrem=new THREE.PMREMGenerator(renderer);let envRT=null;
 // CubeUV's minimum tile is 16px (mip4): width32 equirectangular inputs yield cube8 and are invalid.
 // Keep angular radiance, colour, intensity and direct lights fixed; use the production cube resolution256.
 const setEnvironment=width=>{const height=width/2,px=new Uint8Array(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const v=y/height<9/16?235:130;px.set([v,v,Math.min(255,v+12),255],(y*width+x)*4);}const sky=new THREE.DataTexture(px,width,height);sky.mapping=THREE.EquirectangularReflectionMapping;sky.colorSpace=THREE.SRGBColorSpace;sky.needsUpdate=true;const old=envRT;envRT=pmrem.fromEquirectangular(sky);scene.environment=envRT.texture;sky.dispose();old?.dispose();return{inputWidth:width,inputHeight:height,cubeSize:width/4,maxMip:Math.log2(width/4),pmremWidth:envRT.width,pmremHeight:envRT.height};};
 const environment=setEnvironment(1024);scene.add(new THREE.HemisphereLight(0xffffff,0x60718d,2.1));const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(-3,4,2);scene.add(key);
 G.scene=scene;G.teamColors=[new THREE.Color('#ff8825'),new THREE.Color('#484ce8')];G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,o)=>{o.length=0;return o;}};G.physics=new Physics(G.level);G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};G.paint={sample:()=>1,splat:()=>0};G.match={playing:()=>true};G.time=0;G.projectiles=new api.Projectiles({add(){},remove(){}});
 const snap=()=>renderer.domElement.toDataURL('image/png').split(',')[1];
 const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const indexedHash=async(g,names)=>{const ii=g.index.array,chunks=[];let size=0;for(const name of names){const a=g.attributes[name];if(!a)continue;const data=new Float32Array(ii.length*a.itemSize);for(let j=0;j<ii.length;j++)for(let k=0;k<a.itemSize;k++)data[j*a.itemSize+k]=a.getComponent(ii[j],k);chunks.push(new Uint8Array(data.buffer));size+=data.byteLength;}const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return hash(bytes);};
 const metric=async g=>{let bytes=g.index.array.byteLength;for(const a of Object.values(g.attributes))bytes+=a.array.byteLength;const ii=g.index.array,m=g.attributes.aMat,c=g.attributes.color;let mixedMat=0,mixedColor=0;for(let j=0;j<ii.length;j+=3){const ids=[ii[j],ii[j+1],ii[j+2]];if(m&&new Set(ids.map(i=>m.getX(i))).size>1)mixedMat++;if(c&&new Set(ids.map(i=>[c.getX(i),c.getY(i),c.getZ(i)].join(','))).size>1)mixedColor++;}return{triangles:ii.length/3,vertices:g.attributes.position.count,bytes,mixedMat,mixedColor,positionHash:await indexedHash(g,['position']),allAttributeHash:await indexedHash(g,Object.keys(g.attributes)),otherAttributeHash:await indexedHash(g,Object.keys(g.attributes).filter(k=>!['position','color','aMat'].includes(k))),attributes:Object.keys(g.attributes),cell:g.userData.cell};};
 window.lab={THREE,api,G,W,M,R,L,renderer,scene,snap,metric,hash,setEnvironment,environment};
},{prefix,size});
const requested=arg('--ids','s3-saber-normal,s3-saber-lite,s3-saber-heavy,s3-stringer-normal,s3-stringer-short,s3-stringer-explosion,s3-shelter-normal,s3-shelter-wide,s3-shelter-focus').split(',');
const rows=[];
for(const id of requested){const row=await page.evaluate(async id=>{
 const {THREE,W,M,L,renderer,scene,snap,metric}=window.lab,d=W.getWeaponDef(id),body=L.farGeometry(d.body,700),ink=L.farGeometry(d.ink,300);
 const bow=id.startsWith('s3-stringer-'),shelter=id.startsWith('s3-shelter-'),half=shelter?.72:bow?.57:.42,center=new THREE.Vector3(0,bow?.085:.015,bow?-.035:.155);
 const row={id,body:await metric(body),ink:await metric(ink),views:{},images:{}};
 for(let team=0;team<2;team++){
  const group=new THREE.Group();group.add(new THREE.Mesh(body,M.getPlasticMaterial()),new THREE.Mesh(ink,M.getInkMaterial(new THREE.Color(team?'#484ce8':'#ff8825'))));scene.add(group);
  for(const[view,eye]of Object.entries({front:[0,0,3],side:[-3,0,0],rear:[0,0,-3],oblique:[-.9,.65,1.1]})){
   const camera=new THREE.OrthographicCamera(-half,half,half,-half,.001,30);camera.position.copy(center).add(new THREE.Vector3(...eye).normalize().multiplyScalar(3));camera.lookAt(center);renderer.render(scene,camera);
   const key=team+'-'+view;row.images[key]=snap();row.views[key]={camera:{position:camera.position.toArray(),direction:camera.getWorldDirection(new THREE.Vector3()).toArray(),projection:camera.projectionMatrix.toArray()},drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
  }
  scene.remove(group);
 }
 return row;
},id);
for(const[name,data]of Object.entries(row.images))fs.writeFileSync(path.join(out,id+'.far.'+name+'.png'),Buffer.from(data,'base64'));delete row.images;rows.push(row);
}
fs.writeFileSync(path.join(out,'far-gallery.json'),JSON.stringify({scope:'Merged body/ink far weapon geometry only, fixed family framing shared by immutable latest main and candidate, native materials with valid cube256 studio and Neutral tone mapping. Actual full Actors are covered by the separate family and completion-crowd gates.',revision:identity.build.revision,contentHash:identity.contentHash,rows,environment:await page.evaluate(()=>window.lab.environment),errors},null,2));
if(errors.length)throw Error(errors.join('\n'));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
