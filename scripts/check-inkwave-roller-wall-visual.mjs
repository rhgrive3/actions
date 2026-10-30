#!/usr/bin/env node
// Actual built renderers, using a real practice-range wall contact. Wall paint
// simulation remains live; this check isolates the contacted flight body.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
const site=path.resolve(process.argv[2]||'_site'),out=path.resolve(process.argv[3]||'.browser-evidence/roller-wall');
fs.mkdirSync(out,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),served={};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const rel=decodeURIComponent(new URL(req.url,'http://local').pathname),file=path.resolve(site,'.'+(rel==='/'?'/index.html':rel));
 if(!file.startsWith(site+'/')||!fs.existsSync(file)){res.writeHead(404).end();return;}
 const bytes=fs.readFileSync(file),key=path.relative(site,file);assert.equal(hash(bytes),manifest.artifacts[key]);served[key]=hash(bytes);
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'}).end(bytes);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let context;
try {
 context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,
  executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',viewport:{width:960,height:640},
  args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{let seed=123;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false}));});
 await page.goto('http://127.0.0.1:'+server.address().port+'/?range&skipTitle');
 await page.waitForFunction(()=>window.__G?.match?.range&&__G.match.state==='playing',null,{timeout:180000});
 const rows=[];
 for(const volume of [true,false]) for(const vertical of [false,true]) {
  const id=(vertical?'vertical':'horizontal')+'-'+(volume?'volume':'fallback');
  const row=await page.evaluate(async({volume,vertical})=>{
   const G=window.__G,g=G.game,a=G.local,T=await import('three'),{Hit}=await import(new URL('src/game/physics.js',document.baseURI).href);
   const {beginFidelityWallDrop}=await import(new URL('patches/splatoon3/runtime/weapons-fidelity.mjs',document.baseURI).href);
   g.debug.freeze();g.debug.freezeBots();a.setWeapon('roller');await a.character._sourceMotionLoader;
   const ps=G.projectiles;ps.clear();G.fx.clear();
   const origin=a.pos.clone().add(new T.Vector3(0,2,0)),direction=new T.Vector3(),hit=new Hit();let found=false;
   for(let i=0;i<32;i++){const angle=i*Math.PI/16;direction.set(Math.sin(angle),0,Math.cos(angle));G.physics.raycast(origin,direction,50,hit,true);const face=G.level.faces?.[hit.face],block=G.level.blocks?.[hit.block];if(hit.hit&&Math.abs(hit.normal.y)<.5&&face?.paintable!==false&&!block?.grate&&block?.solid!==false){found=true;break;}}
   if(!found)throw Error('No practice-range wall found');
   a.weaponRunner.s3FlickVertical=vertical;ps.fireFlick(a,a.weapon);
   const p=ps.list.find(p=>p.fidelityRollerUnit);if(!p)throw Error('No sourced Roller glob');
   ps.list=[p];p.pos.copy(hit.point).addScaledVector(hit.normal,.4);p.prev.copy(p.pos);p.age=.2;
   const volumes=G.fx.inkVolumes;if(volume&&!volumes?.assets.has('roller'))throw Error('Source pack unavailable');
   if(!volume)G.fx.inkVolumes=null;
   const camera=G.camera;camera.position.copy(hit.point).addScaledVector(hit.normal,4).add(new T.Vector3(1,1,0));camera.lookAt(hit.point);
   let airborne=-1;const draw=ps.inkFlight.draw;ps.inkFlight.draw=function(B,s,n,...args){airborne=n;return draw.call(this,B,s,n,...args);};
   const render=()=>{ps._draw();ps.syncVisuals(1);G.renderer.render(G.scene,camera);G.renderer.getContext().finish();return{airborneBlobs:airborne,proceduralTriangles:ps.projectileVisuals.stats.triangles,volumeInstances:G.fx.inkVolumes?.metrics.active||0};};
   const before=render();
   if(!beginFidelityWallDrop(ps,p,hit))throw Error('Wall contact rejected');
   const state={pos:p.pos.toArray(),age:p.age,frame:p.fidelityWallDrop.frame};
   const after=render();if(JSON.stringify(state)!==JSON.stringify({pos:p.pos.toArray(),age:p.age,frame:p.fidelityWallDrop.frame}))throw Error('Render mutated wall simulation');
   window.__rollerWallRestore=()=>{ps.inkFlight.draw=draw;G.fx.inkVolumes=volumes;};
   return{volume,vertical,before,after,contact:{point:hit.point.toArray(),normal:hit.normal.toArray()},retainedWallDrop:!!p.fidelityWallDrop};
  },{volume,vertical});
  assert(row.before.airborneBlobs+row.before.proceduralTriangles+row.before.volumeInstances>0,'body visible before impact');
  assert.deepEqual(row.after,{airborneBlobs:0,proceduralTriangles:0,volumeInstances:0},'no flight body on contact');
  await page.screenshot({path:path.join(out,id+'-impact.png')});await page.evaluate(()=>__rollerWallRestore());rows.push(row);
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({status:'passed',contentHash:manifest.contentHash,served,browser:context.browser().version(),rows,errors,
  scope:'Built practice-range WebGL renderers; explicit WallDrop admission on an actual raycast wall. Real swept collision and subsequent wall paint are covered separately by CPU tests.'},null,2));
 console.log(JSON.stringify({status:'passed',cases:rows.length,contentHash:manifest.contentHash}));
} finally {await context?.close();await new Promise(r=>server.close(r));}
