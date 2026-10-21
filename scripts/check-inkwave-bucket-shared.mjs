#!/usr/bin/env node
// Actual native-input volleys in a built range; inspect their shipped volume meshes.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]||'_site'),out=path.resolve(process.argv[3]||'.browser-evidence/bucket-shared');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const p=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.resolve(site,'.'+(p==='/'?'/index.html':p));if(!file.startsWith(site+'/')||!fs.existsSync(file)){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:800,height:600}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false})));
 await page.goto('http://127.0.0.1:'+server.address().port+'/?range&skipTitle');await page.waitForFunction(()=>window.__G?.match?.range&&__G.match.state==='playing',null,{timeout:180000});
 await page.evaluate(async()=>{const G=window.__G;G.game.debug.freeze();G.game.debug.freezeBots();await G.fx.inkVolumeReady;window.bucketOrigin=G.local.pos.clone();});
 const cases=[];
 for(const id of ['slosher','s3-slosher-diffusion','s3-slosher-double']){
  const data=await page.evaluate(async id=>{
   const G=window.__G,g=G.game,a=G.local,e=G.fx.inkVolumes;G.projectiles.clear();G.fx.clear();a.pos.copy(bucketOrigin);a.vel.set(0,0,0);a.setWeapon(id);a.ink=100;a.weaponRunner.reset();g.debug.fire(false);g._skipRender=true;
   for(let i=0;i<8;i++)g._frame(1/60);g.debug.fire(true);let ticks=0;
   while(ticks++<180&&!G.projectiles.list.some(p=>p._inkVolumeRecipe==='slosher'&&p.delay<=0))g._frame(1/60);
   g.debug.fire(false);for(let i=0;i<10;i++)g._frame(1/60);g._skipRender=false;
   const eligible=G.projectiles.list.filter(p=>p._inkVolumeRecipe==='slosher'&&!p._qualityDead&&p.delay<=0);
   G.projectiles._draw();const productionMetrics={...e.metrics};
   const heads=eligible.filter(p=>p.head||p.catalog?.descriptor?.index===0).slice(0,4);
   const snap=()=>JSON.stringify(heads.map(p=>({pos:p.pos,vel:p.vel,age:p.age,damage:p.damage,meta:p.inkMeta,delay:p.delay}))),before=snap();
   const T=await import('three'),{submitInkVolume}=await import(new URL('patches/local-quality/ink-volume/recipes.mjs',document.baseURI).href);
   const parent=e.root.parent,scene=new T.Scene();scene.background=new T.Color(0x161c2a);scene.add(e.root);e.begin();for(const p of heads)submitInkVolume(e,p);e.end();
   const box=new T.Box3();for(const p of heads)box.expandByPoint(p.pos);box.expandByScalar(1.5);
   const centre=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3()),camera=new T.PerspectiveCamera(40,800/600,.01,300);
   camera.position.copy(centre).add(new T.Vector3(1,.7,-1).normalize().multiplyScalar(Math.max(2,size.length()*1.6)));camera.lookAt(centre);G.renderer.render(scene,camera);parent.add(e.root);
   return {id,ticks,totalHeads:eligible.length,diagnosticSampleHeads:heads.length,productionMetrics,heads:heads.length,assets:[...new Set(heads.map(p=>p._inkVolumeAssetName))],active:e.metrics.active,overflow:e.metrics.overflow,authorityUnchanged:before===snap(),historyOwned:heads.filter(p=>G.projectiles.projectileVisuals.handles(p)).length};
  },id);
  fs.writeFileSync(path.join(out,id+'-receipt.json'),JSON.stringify(data,null,2));
  assert(data.heads>0);assert(data.active>0);assert.equal(data.overflow,0);assert.equal(data.historyOwned,0);assert(data.authorityUnchanged);assert.deepEqual(data.assets,['projectile:slosher:slosher']);cases.push(data);
  await page.screenshot({path:path.join(out,id+'.png')});
 }
 assert.deepEqual(errors,[]);const report={status:'passed',contentHash:JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))).contentHash,browser:browser.version(),cases,errors};fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
