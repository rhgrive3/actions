#!/usr/bin/env node
// Built game/Actor/Character/FX WebGL inspection. Controlled pose cases; not Switch parity or input physics QA.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const site=path.resolve(process.argv[2]||'_site'),out=path.resolve(process.argv[3]||'.browser-evidence/swim');
fs.mkdirSync(out,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(site,'.'+(p==='/'?'/index.html':p));assert(file.startsWith(site+'/'));res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false})));
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 await page.evaluate(async()=>{window.swimG=(await import(new URL('src/core/ctx.js',document.baseURI).href)).G;});
 await page.waitForFunction(()=>window.swimG?.game?.menus&&swimG.s3?.installed&&swimG.mode!=='boot',null,{timeout:180000});
 await page.evaluate(async()=>{const g=swimG.game;g.debug.freeze();g.menus.wipe.cancel();await g.startMatch({mapId:'tidewater',difficulty:'easy',duration:180,mode:'turf'});g.debug.freezeBots();g._skipRender=true;try{for(let i=0,n=(g.match.turfIntroFrames??253)+47;i<n;i++)g._frame(1/60);}finally{g._skipRender=false;}});
 const setup=await page.evaluate(async()=>{
  const G=swimG,g=G.game,a=g.match.local,c=a.character;
  await c._sourceMotionLoader;if(c.sourceMotion?.ready)await c.sourceMotion.ready;
  g.debug.freeze();G.fx.clear();
  window.swimOrigin=a.pos.clone();
  window.swimTick=(form,speed=0)=>{
   a.pos.copy(swimOrigin);a.form=form==='kid'?'kid':'squid';a.submerged=form==='swim';a.climbing=form==='climb';a.grounded=form!=='air'&&form!=='climb';a.vel.set(0,form==='climb'?4:0,speed);a.anim.wallNormal={x:0,y:0,z:1};G.time+=1/60;a._finishFrame(1/60);
  };
  // Native production meshes on a painted spawn-area patch; wall case gets its own painted prop.
  const T=await import('three');
  const floor=new T.Mesh(new T.BoxGeometry(6,.08,6),new T.MeshStandardMaterial({color:a.color,roughness:.18}));floor.position.copy(a.pos);floor.position.y-=.04;G.scene.add(floor);
  const wall=new T.Mesh(new T.BoxGeometry(5,4,.2),floor.material);wall.position.copy(a.pos);wall.position.z-=a.character.climbInset+.17;wall.position.y+=1.5;wall.visible=false;G.scene.add(wall);window.swimWall=wall;
  window.swimRender=()=>{const cam=G.camera;cam.position.copy(a.pos).add(new T.Vector3(2,2.5,4));cam.lookAt(a.pos.x,a.pos.y+.25,a.pos.z);G.renderer.render(G.scene,cam);};
  return {sourceReady:c.sourceMotion?.status,weapon:a.weapon.id,revision:document.baseURI};
 });
 const cases=[];
 for(const [name,form,speed] of [['idle','swim',0],['swim','swim',8],['wall','climb',0],['air','air',8],['dry','squid',0],['human','kid',0]]){
  const row=await page.evaluate(({name,form,speed})=>{
   const G=swimG,a=G.game.match.local,c=a.character;G.fx.clear();swimWall.visible=form==='climb';
   for(let i=0;i<60;i++){swimTick(form,speed);G.fx.update(1/60,G.camera);}
   let bodyDraws=0;const meshes=[];c.squidRoot.traverse(o=>{if(o.isMesh){const before=o.onBeforeRender;meshes.push([o,before]);o.onBeforeRender=function(...args){bodyDraws++;return before?.apply(this,args);};}});
   try{swimRender();}finally{for(const[o,before]of meshes)o.onBeforeRender=before;}
   return {name,form,bodyDraws,bodyVisible:c.squid.body.visible,ghostVisible:c.squid.ghost.visible,fx:G.fx.stats()};
  },{name,form,speed});
  if(form==='swim'||form==='climb'){assert.equal(row.bodyDraws,0);assert.equal(row.bodyVisible,false);assert.equal(row.ghostVisible,false);}
  if(form==='air'||form==='squid')assert(row.bodyDraws>0,'emerged squid draws');
  cases.push(row);await page.screenshot({path:path.join(out,name+'.png')});
 }
 assert.deepEqual(errors,[]);
 const report={status:'passed',browser:browser.version(),contentHash:manifest.contentHash,setup,cases,errors,scope:'Actual built Game in Chromium/SwiftShader, controlled Actor pose and native FX updates, painted diagnostic prop. Not input-aligned Switch or iPad verification.'};
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
