import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {adaptBuildSource} from './inkwave-source-composition.mjs';
// Isolated character and native weapon-material A/B review. No stage is loaded.
// Usage: node scripts/compare-inkwave-character-visual-stability.mjs --site _site --out /tmp/character-review
// Optional: --chromium /path/to/chrome, --timing. Timings are diagnostic, never an iPad FPS estimate.
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const repo=fileURLToPath(new URL('..',import.meta.url)),fallback=path.resolve(arg('--site',path.join(repo,'_site'))),out=path.resolve(arg('--out','/tmp/inkwave-character-visual-evidence'));
const executablePath=arg('--chromium',process.env.CHROMIUM_PATH),timing=process.argv.includes('--timing');
fs.mkdirSync(out,{recursive:true});
assert.ok(fs.existsSync(path.join(fallback,'vendor/three/build/three.module.js')),'--site must contain a built Three vendor bundle');
const materialRel='src/game/character-mats.js',raw=fs.readFileSync(path.join(repo,'inkwave-public',materialRel),'utf8');
const materialSources={baseline:adaptBuildSource(materialRel,raw,{characterVisualStability:false}),candidate:adaptBuildSource(materialRel,raw)};
assert.notEqual(materialSources.baseline,materialSources.candidate,'baseline must bypass only the visual-stability adapter');
const sha=text=>createHash('sha256').update(text).digest('hex');
const sourceHashes={raw:sha(raw),baseline:sha(materialSources.baseline),candidate:sha(materialSources.candidate)};
for(const[variant,source]of Object.entries(materialSources))fs.writeFileSync(path.join(out,variant+'-material.js'),source);
const body=new Map(),errors=[];
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/favicon.ico'){res.statusCode=204;res.end();return;}
 if(pathname.startsWith('/review')){res.setHeader('Content-Type','text/html');res.end('<html><head><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script></head><body style="margin:0"></body></html>');return;}
 let rel=decodeURIComponent(pathname).replace(/^\//,''),variant=null;
 const match=rel.match(/^(baseline|candidate)\/(.+)$/);if(match){variant=match[1];rel=match[2];}
 if(rel.includes('..')||rel.split('/').some(p=>p.startsWith('.'))||! /^(?:src|patches|assets|vendor)\//.test(rel)){res.statusCode=400;res.end();return;}
 try{
  let data;
  if(variant&&rel==='src/game/character-mats.js')data=materialSources[variant];
  else if(variant&&/\.m?js$/.test(rel)&&!rel.startsWith('vendor/')){
   if(!body.has(rel)){const p=path.join(repo,rel.startsWith('patches/')?rel:'inkwave-public/'+rel);body.set(rel,fs.existsSync(p)?adaptBuildSource(rel,fs.readFileSync(p,'utf8')):fs.readFileSync(path.join(fallback,rel),'utf8'));}
   data=body.get(rel);
  }else{const p=path.join(repo,'inkwave-public',rel),p2=path.join(repo,rel);data=fs.readFileSync(fs.existsSync(p)?p:fs.existsSync(p2)?p2:path.join(fallback,rel));}
  res.setHeader('Content-Type',/\.m?js$/.test(rel)?'text/javascript':rel.endsWith('.json')?'application/json':'application/octet-stream');res.end(data);
 }catch(e){errors.push({rel,error:String(e)});res.statusCode=404;res.end();}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;const buffers={},shots={},stats={};
const difference=(a,b)=>{let max=0,total=0,count=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);total+=d;if(d)count++;}return{maxChannelByte:max,meanAbsoluteByte:total/a.length,changedChannels:count,totalChannels:a.length};};
try{
 browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const variant of ['baseline','candidate']){
  const page=await browser.newPage({viewport:{width:640,height:640}});page.on('pageerror',e=>errors.push({variant,error:String(e)}));page.on('console',m=>{if(m.type()==='error')errors.push({variant,error:m.text()});});
  await page.goto('http://127.0.0.1:'+server.address().port+'/review');
  await page.evaluate(async variant=>{
   let seed=0x51a7c0de;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
   const prefix='/'+variant+'/',T=await import('three'),{install}=await import(prefix+'patches/splatoon3/runtime/install.mjs'),profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json());install(profile);
   const M=await import(prefix+'src/game/character-mats.js'),{Character}=await import(prefix+'src/game/character.js');
   const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(640,640);renderer.setClearColor(0x202733,1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;document.body.append(renderer.domElement);
   const scene=new T.Scene();scene.add(new T.HemisphereLight(0xffffff,0x60718d,2.1));const light=new T.DirectionalLight(0xffffff,3);light.position.set(-3,4,2);scene.add(light);
   const width=256,height=128,px=new Uint8Array(width*height*4);for(let i=0;i<width*height;i++)px.set([190,190,200,255],i*4);const sky=new T.DataTexture(px,width,height);sky.mapping=T.EquirectangularReflectionMapping;sky.colorSpace=T.SRGBColorSpace;sky.needsUpdate=true;const pmrem=new T.PMREMGenerator(renderer),env=pmrem.fromEquirectangular(sky);scene.environment=env.texture;sky.dispose();
   const char=new Character({name:'Visual-A',color:'#ff8825',style:{hair:0,skin:2,outfit:0,eyes:0},weapon:'shooter'});char.setLod('hero');scene.add(char.root);
   for(let i=0;i<5;i++)char.update(1/60,{grounded:true,ink:1,form:'kid',weapon:'shooter'});
   const camera=new T.PerspectiveCamera(36,1,.01,100);
   window.review={T,M,renderer,scene,char,camera,light};
   window.programKeys=Object.fromEntries(['skin','cloth','hair','eye','squid','squidGhost'].map(k=>[k,char.mats[k].customProgramCacheKey()]));window.programKeys.plastic=M.getPlasticMaterial().customProgramCacheKey();
  },variant);
  stats[variant+'/identity']=await page.evaluate(()=>({contextIsolation:'Separate browser page and WebGLRenderer for this variant',programKeys:window.programKeys}));
  const capture=async(name,request)=>{
   const result=await page.evaluate(async({name,request})=>{
    const {T,M,renderer,scene,char,camera}=window.review;
    let cam=camera;
    if(request.kind==='character'){
     renderer.setSize(640,640);char.root.visible=true;if(window.review.plate)window.review.plate.visible=false;
     camera.position.set(...request.position);camera.lookAt(0,request.lookY??.7,0);
    }else{
     char.root.visible=false;renderer.setSize(320,320);
     if(!window.review.plate){const geo=new T.PlaneGeometry(4,4);geo.setAttribute('aMat',new T.Float32BufferAttribute(new Float32Array(geo.attributes.position.count).fill(3),1));geo.setAttribute('color',new T.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*3).fill(.35),3));const plate=new T.Mesh(geo,M.getPlasticMaterial());scene.add(plate);window.review.plate=plate;}
     window.review.plate.visible=true;const span=request.span,shift=span/320*(request.shift||0);cam=new T.OrthographicCamera(-span/2,span/2,span/2,-span/2,.01,20);cam.position.set(shift,0,2);cam.lookAt(shift,0,0);
    }
    renderer.render(scene,cam);const gl=renderer.getContext(),w=renderer.domElement.width,h=renderer.domElement.height,rgba=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
    const row={name,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometryCount:renderer.info.memory.geometries,textureCount:renderer.info.memory.textures,rgba:Array.from(rgba),image:renderer.domElement.toDataURL('image/png').split(',')[1]};
    if(request.perf){const values=[],pixel=new Uint8Array(4);for(let i=0;i<24;i++){const t=performance.now();renderer.render(scene,cam);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);if(i>=8)values.push(performance.now()-t);}values.sort((a,b)=>a-b);row.timing={samples:values.length,median:values[Math.floor(values.length/2)],p95:values[Math.floor(values.length*.95)]};}
    return row;
   },{name,request});
   buffers[variant+'/'+name]=Buffer.from(result.rgba);delete result.rgba;
   if(!request.noImage){fs.writeFileSync(path.join(out,variant+'-'+name+'.png'),Buffer.from(result.image,'base64'));shots[variant+'/'+name]=variant+'-'+name+'.png';}delete result.image;
   stats[variant+'/'+name]=result;
  };
  await capture('character-front',{kind:'character',position:[0,1.1,3.3]});
  await capture('character-oblique',{kind:'character',position:[1.8,1.4,3]});
  await capture('character-close',{kind:'character',position:[.3,1.15,.93],lookY:1.08});
  for(const [label,span]of [['close',.02],['medium',.4]]){
   for(let i=0;i<5;i++)await capture('metal-'+label+'-'+i,{kind:'metal',span,shift:i*.125,perf:timing&&i===0,noImage:i>0});
  }
  stats[variant+'/compiled']=await page.evaluate(()=>{
   const {renderer,char,scene,camera,M,T}=window.review;if(window.review.plate)window.review.plate.visible=false;char.root.visible=true;renderer.setSize(320,320);camera.position.set(1.8,1.4,3);camera.lookAt(0,.7,0);
   for(let i=0;i<50;i++)char.update(1/60,{grounded:true,ink:1,form:'squid',weapon:'shooter'});
   char.squid.ghost.visible=true;renderer.render(scene,camera);char.setColor('#484ce8');renderer.render(scene,camera);
   const glow=new T.Mesh(new T.SphereGeometry(.1,8,6),M.makeGlowMaterial());glow.position.set(0,.7,0);scene.add(glow);renderer.render(scene,camera);
   const gl=renderer.getContext(),pixel=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
   return{programs:renderer.info.programs.map(p=>({name:p.name,runnable:p.diagnostics?.runnable??true})),glError:gl.getError()};
  });
  await page.close();
 }
 const diffs={};for(const name of Object.keys(stats).filter(k=>k.startsWith('baseline/')&&buffers[k]).map(k=>k.slice(9)))diffs[name]=difference(buffers['baseline/'+name],buffers['candidate/'+name]);
 const temporal={};for(const variant of ['baseline','candidate'])for(const label of ['close','medium']){const rows=[];for(let i=1;i<5;i++)rows.push(difference(buffers[variant+'/metal-'+label+'-'+(i-1)],buffers[variant+'/metal-'+label+'-'+i]));temporal[variant+'/'+label]={averageMeanAbsoluteByte:rows.reduce((s,r)=>s+r.meanAbsoluteByte,0)/rows.length,maxChannelByte:Math.max(...rows.map(r=>r.maxChannelByte))};}
 const summary={renderer:'Chromium/ANGLE SwiftShader',sourceHashes,scope:'latest source composed modules; character-only isolated scene, no stage or postprocessing',stats,diffs,temporal,shots,errors};
 fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({diffs,temporal,errors,timings:Object.fromEntries(Object.entries(stats).filter(([k,v])=>v.timing).map(([k,v])=>[k,v.timing]))}));
 for(const name of ['skin','cloth','hair','eye','squid','squidGhost','plastic'])assert.notEqual(stats['baseline/identity'].programKeys[name],stats['candidate/identity'].programKeys[name],'distinct material key: '+name);
 for(const name of ['character-front','character-oblique','character-close'])assert.ok(diffs[name].maxChannelByte<=2&&diffs[name].meanAbsoluteByte<.01,'character preservation: '+name);
 for(let i=0;i<5;i++)assert.ok(diffs['metal-close-'+i].maxChannelByte<=1,'resolved brushing remains unchanged');
 for(const variant of ['baseline','candidate'])assert.ok(!stats[variant+'/compiled'].glError&&stats[variant+'/compiled'].programs.every(p=>p.runnable),'all character/squid/ghost material programs compile');
 if(errors.length)process.exitCode=1;
}finally{await browser?.close();await new Promise(r=>server.close(r));}
