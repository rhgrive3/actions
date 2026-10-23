// Normal range bootstrap/native Q and sub-release; controlled position/gauge.
// Screenshots marked inspection use a temporary visibility diagnostic.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://local').pathname;if(p==='/favicon.ico'){res.writeHead(204);res.end();return;}const file=path.resolve(site,'.'+(p==='/'?'/index.html':p));if(!file.startsWith(site+'/')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const report={scope:'Normal game range, native Storm input, controlled starting position/gauge; software WebGL2. Simulation frame labels are not reference recording frames.',errors:[],identity:JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))).contentHash};
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:960,height:640},serviceWorkers:'block'});page.on('pageerror',e=>report.errors.push(String(e)));
 await page.addInitScript(()=>{localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,musicVolume:0}));let seed=1134;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);});
 await page.goto('http://127.0.0.1:'+server.address().port+'/?range&skipTitle',{waitUntil:'commit'});
 await page.waitForFunction(()=>window.__G?.match?.range&&window.__G.match.state==='playing',null,{timeout:240000});
 await page.evaluate(()=>{const g=window.__inkwave;g.debug.freeze();g.debug.freezeBots();});
 await page.screenshot({path:path.join(out,'normal-boot.png')});
 await page.evaluate(async()=>{await window.__G.local.character.sourceMotion?.ready;});
 report.units='WU';report.fixture='Normally booted Game with native Q/Sub input and actual Actor/Projectiles/Physics; controlled long flat collision floor (and optional 1 WU wall), matching Level render geometry; not an unmodified range screenshot. Gravity, launch parameters and lock times unchanged.';report.simulationStep=1/60;report.flightRendering='Each delivered Game._frame renders the inspection world; 30/60/120 delivery Hz and fixed 60Hz simulation.';report.throws=[];
 report.throws=await page.evaluate(async()=>{
  const G=window.__G,g=window.__inkwave,{WEAPONS}=await import(new URL('src/config.js',document.baseURI)),a=G.local,p=G.projectiles,weapon=Object.values(WEAPONS).find(w=>w.special==='storm');
  const {Level}=await import(new URL('src/world/level.js',document.baseURI)),{Physics}=await import(new URL('src/game/physics.js',document.baseURI)),{PaintSystem}=await import(new URL('src/world/paint.js',document.baseURI)),{createLevelMaterial}=await import(new URL('src/world/levelMaterial.js',document.baseURI));
  const flat={id:'storm-measurement',bounds:{minX:-20,maxX:20,minZ:-20,maxZ:300},spawnPads:[[0,0,0],[10,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-20,-1,-20],max:[20,0,300]}]};
  const base=new Level(flat),physics=new Physics(base);G.level=base;G.physics=physics;
  for(const child of G.scene.children)if(!child.isLight&&child!==a.character.root)child.visible=false;
  const rows=[],cases=[['flat-forward',[0,0,0],0,0],['flat-up-30',[0,0,0],0,Math.PI/6],['flat-down-30',[0,0,0],0,-Math.PI/6],['wall-1-WU',[0,0,0],0,0],['height-3-WU',[0,3,0],0,0]];
  // Fixture geometry only; native Actor/input/projectile integration is unchanged.
  let fixturePaint=null,fixtureMesh=null;

  const originalThrow=p.throwStorm,originalSpawn=p._spawnCloud,originalBombs=p._updateBombs,originalRelease=p._releaseBomb,originalSegment=G.physics.segment;
  let record=null,insideBombs=false;
  p.throwStorm=function(actor,...args){const result=originalThrow.call(this,actor,...args),b=this.bombs.at(-1);if(record&&actor===a&&b?.kind==='storm'){record.launch={actorPosition:a.pos.toArray(),origin:b.pos.toArray(),velocity:b.vel.toArray(),aimPitch:a.aimPitch,aimYaw:a.aimYaw,aimDirection:a.aimDir.toArray(),simulationTick:g.s3Clock.ticks,simulationTime:G.time,snapshot:{...a.s3?.stormPowerSnapshot}};}return result;};
  p._updateBombs=function(...args){insideBombs=true;try{const result=originalBombs.apply(this,args);if(record?.launch&&!record.cloud){const b=this.bombs.find(b=>b.kind==='storm');if(b)record.path.push({age:b.age,position:b.pos.toArray(),velocity:b.vel.toArray()});}return result;}finally{insideBombs=false;}};
  G.physics.segment=function(...args){const result=originalSegment.apply(this,args);if(record?.launch&&insideBombs&&result.hit)record.contacts.push({tick:g.s3Clock.ticks,point:result.point.toArray(),normal:result.normal.toArray(),block:result.block,face:result.face});return result;};
  p._releaseBomb=function(b,...args){if(record?.launch&&b.kind==='storm'&&b.owner===a&&!record.cloud)record.terminal={deviceAge:b.age,position:b.pos.toArray(),velocity:b.vel.toArray(),simulationTick:g.s3Clock.ticks,simulationTime:G.time,horizontalDistance:Math.hypot(b.pos.x-record.launch.origin[0],b.pos.z-record.launch.origin[2]),reason:'released-without-cloud'};return originalRelease.call(this,b,...args);};
  p._spawnCloud=function(b,...args){const spawnInput=b.pos.toArray(),result=originalSpawn.call(this,b,...args);if(record?.launch&&b.owner===a){const c=this.clouds.at(-1),o=record.launch.origin;record.cloud={spawnInput,deviceAge:b.age,simulationTick:g.s3Clock.ticks,simulationTime:G.time,devicePosition:b.pos.toArray(),deviceVelocity:b.vel.toArray(),cloudPosition:c.group.position.toArray(),groundY:c.groundY,horizontalDistance:Math.hypot(b.pos.x-o[0],b.pos.z-o[2]),cloudHorizontalDistance:Math.hypot(c.group.position.x-o[0],c.group.position.z-o[2]),reason:record.contacts.length?'collision':'age-or-other-production-condition'};}return result;};
  try{for(const hz of [30,60,120])for(const [name,position,yaw,pitch] of cases){
   record=null;p.clear();const single=[...flat.single];if(name==='wall-1-WU')single.push({kind:'box',min:[-10,0,1],max:[10,10,1.2]});if(name==='height-3-WU')single.push({kind:'box',min:[-2,0,-2],max:[2,3,.1]});const level=new Level({...flat,single});G.level=level;physics.level=level;fixturePaint?.dispose();fixturePaint=new PaintSystem(G.renderer,level,{atlasSize:1024,maxDensity:2,cell:.5});G.paint=fixturePaint;if(fixtureMesh){fixtureMesh.removeFromParent();fixtureMesh.geometry.dispose();fixtureMesh.material.dispose();}fixtureMesh=new (await import(new URL('vendor/three/build/three.module.js',document.baseURI))).Mesh(level.buildGeometry(fixturePaint.size),createLevelMaterial(fixturePaint.texture,fixturePaint.size));G.scene.add(fixtureMesh);g.levelMesh=fixtureMesh;g.levelMat=fixtureMesh.material;a.spawnAt(a.pos.clone().fromArray(position),yaw);a.setWeapon(weapon.id);g.rig.follow(a,true);g.rig.yaw=yaw;g.rig.pitch=pitch;g._skipRender=true;
   g.debug.key('KeyQ',false);g.debug.key('KeyE',false);for(let i=0;i<90;i++)g._frame(1/60);a.stormGaugeLock=0;a.special=weapon.specialCost;
   record={name,hz,simulationStep:1/60,requestedPosition:position,requestedPitch:pitch,requestedYaw:yaw,path:[],contacts:[]};
   g._skipRender=false;g.debug.key('KeyQ',true);g._frame(1/60);g.debug.key('KeyQ',false);g.debug.key('KeyE',true);g._frame(1/60);g.debug.key('KeyE',false);g._frame(1/60);
   g._skipRender=false;for(let frame=0;frame<hz*10&&!record.cloud&&!record.terminal;frame++)g._frame(1/hz);g._skipRender=true;
   if(!record.launch)throw Error('No launch '+name+'/'+hz);
   const terminal=record.cloud||record.terminal;
   record.elapsedSimulationTime=terminal?terminal.simulationTime-record.launch.simulationTime:null;
   record.elapsedTickDifference=terminal?terminal.simulationTick-record.launch.simulationTick:null;record.outcome=record.cloud?'cloud':record.terminal?'released-without-cloud':'still-flying-at-10s';rows.push(record);
  }}finally{p.throwStorm=originalThrow;p._spawnCloud=originalSpawn;p._updateBombs=originalBombs;p._releaseBomb=originalRelease;G.physics.segment=originalSegment;g._skipRender=false;}
  return rows;
 });
 console.log(JSON.stringify(report));

} catch(e){report.error=String(e.stack||e);throw e;}finally{fs.writeFileSync(path.join(out,'probe.json'),JSON.stringify(report,null,2));if(browser)await browser.close();await new Promise(r=>server.close(r));}
