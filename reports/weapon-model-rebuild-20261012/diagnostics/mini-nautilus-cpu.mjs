#!/usr/bin/env node
// Bounded no-render control. This does not replace the preserved render-coupled ABBA.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import os from 'node:os';import {chromium} from 'playwright';
const arg=(k,d)=>process.argv.includes(k)?process.argv[process.argv.indexOf(k)+1]:d;
const site=path.resolve(arg('--site','_site')),out=path.resolve(arg('--out','cpu-control.json'));
const identity=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),prefix='/_versions/'+identity.build.revision+'/';
const host=()=>({at:new Date().toISOString(),load:os.loadavg(),cpuCount:os.cpus().length,cpuTimes:os.cpus().map(c=>c.times),freeMemory:os.freemem()});const start=host();
const server=http.createServer((req,res)=>{if(req.url==='/control'){res.setHeader('Content-Type','text/html');res.end(`<script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script>`);return;}const p=path.resolve(site,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(site+'/')||!fs.existsSync(p)){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',/\.m?js$/.test(p)?'text/javascript':p.endsWith('.json')?'application/json':'application/octet-stream');fs.createReadStream(p).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const errors=[];
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{let x=0x129ac8;Math.random=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};});
 await page.goto('http://127.0.0.1:'+server.address().port+'/control');
 const result=await page.evaluate(async({prefix})=>{
  const THREE=await import('three'),{install}=await import(prefix+'patches/splatoon3/runtime/install.mjs'),profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json());const api=install(profile),{G,Physics,Actor,Character}=api;
  const{installWeaponsFidelity}=await import(prefix+'patches/splatoon3/runtime/weapons-fidelity.mjs'),{installMainWeaponCatalogRuntime}=await import(prefix+'patches/splatoon3/runtime/main-weapon-catalog.mjs');installWeaponsFidelity(api,profile);installMainWeaponCatalogRuntime(api,profile);
  const scene=new THREE.Scene();G.scene=scene;G.teamColors=[new THREE.Color('#ff8825'),new THREE.Color('#484ce8')];G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,o)=>{o.length=0;return o;}};G.physics=new Physics(G.level);G.paint={sample:()=>1,splat:()=>0};G.match={playing:()=>true};G.time=0;G.projectiles=new api.Projectiles({add(){},remove(){}});G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  const ids=['s3-spinner-quick','s3-spinner-serein'],actors=[];
  for(let k=0;k<8;k++){const a=new Actor({team:k%2,weapon:ids[k%2],isLocal:k===0,CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),c=a.character;c.actor=a;c.onEvent=null;a.grounded=a.ground.hit=true;scene.add(c.root);if(c._sourceMotionLoader)await c._sourceMotionLoader;if(c.sourceMotion?.ready)await c.sourceMotion.ready;actors.push(a);}
  G.actors=actors;
  // Reproduce first actor's recovered charge state from the existing gallery. Others stay idle.
  const first=actors[0];for(let f=0;f<440;f++){const fire=f>=70&&f<200;first.ink=100;first.intent.fire=fire;G.time+=1/60;first.weaponRunner.update(1/60,{fire,firePressed:f===70});first._finishFrame(1/60);}
  if(first.weaponRunner.charging||first.weaponRunner.streaming)throw Error('Unrecovered first actor');
  const quant=a=>{const b=[...a].sort((x,y)=>x-y);return{p50:b[Math.floor(b.length*.5)],p95:b[Math.floor(b.length*.95)]};};
  const state=()=>actors.map(a=>{const c=a.character,meshes=[];c.root.traverseVisible(m=>{if(m.isMesh)meshes.push({geometry:m.geometry.uuid,vertices:m.geometry.attributes.position.count});});return{id:c.weaponModel,visible:c.root.visible,parentVisible:c.root.parent?.visible!==false,lod:c.lodTier,sourceActive:c.sourceMotion?.active,sourceReady:!!c.sourceMotion?.ready,meshes};});
  const tiers={};for(const tier of['game','far']){
   actors.forEach((a,k)=>{a.pos.set((k%4-1.5)*1.15,0,Math.floor(k/4)*1.5);a.intent.fire=false;a.character.setLod(tier);for(let f=0;f<25;f++)a._finishFrame(1/60);});const before=state(),raw=[];
   for(let f=0;f<260;f++){const t=performance.now();for(const a of actors)a._finishFrame(1/60);if(f>=60)raw.push(performance.now()-t);}
   const after=state();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('No-render control changed mesh state');
   const restore=[],methods={},counts={};let totals={};const wrap=(obj,key,label)=>{const fn=obj?.[key];if(typeof fn!=='function')return;const own=Object.hasOwn(obj,key);obj[key]=function(...args){const t=performance.now();try{return fn.apply(this,args);}finally{totals[label]=(totals[label]||0)+performance.now()-t;counts[label]=(counts[label]||0)+1;}};restore.push(()=>{if(own)obj[key]=fn;else delete obj[key];});};
   for(const a of actors){const c=a.character,id=c.weaponModel;wrap(a,'_finishFrame',id+'/_finishFrame');for(const k of['update','_buildPose','_applyPose','_animWeapon','_updateMaterials','_updateLod'])wrap(c,k,id+'/'+k);for(const k of['advance','applyBody','applyForm'])wrap(c.sourceMotion,k,id+'/sourceMotion.'+k);}
   try{for(let f=0;f<160;f++){totals={};for(const a of actors)a._finishFrame(1/60);if(f>=40)for(const[k,v]of Object.entries(totals))(methods[k]||=[]).push(v);}}finally{restore.forEach(fn=>fn());}
   tiers[tier]={actors:8,ids:actors.map(a=>a.character.weaponModel),rawNoRenderMs:raw,noRenderMs:quant(raw),rawInclusiveMethodMs:methods,inclusiveMethodMs:Object.fromEntries(Object.entries(methods).map(([k,v])=>[k,quant(v)])),methodCalls:counts,geometryStable:true,state:after,heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null};
  }
  for(const a of actors){a.weaponRunner.reset();a.character.dispose();}
  return{tiers,notes:['No renderer, WebGL context or PMREM is created.','Plain measurements precede separate inclusive wrapper measurements; do not add parent and child timings.','Same eight target Actors, seed, loaded source motions and forced LOD; no stage, network or rendered projectiles.']};
 },{prefix});
 const output={sourceRevision:identity.build.revision,host:{start,end:host()},errors,...result};fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(output,null,2));console.log(JSON.stringify({revision:output.sourceRevision,host:output.host,tiers:Object.fromEntries(Object.entries(result.tiers).map(([k,v])=>[k,v.noRenderMs])),errors}));if(errors.length)throw Error(errors.join('\n'));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
