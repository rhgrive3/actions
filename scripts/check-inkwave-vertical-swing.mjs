#!/usr/bin/env node
// Frame-by-frame emitted Actor/Runner/rig probe; controlled flight isolates the swing.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {chromium} from 'playwright';
const site=path.resolve(process.argv[2]||'_site'),out=path.resolve(process.argv[3]||'.browser-evidence/vertical');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const p=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.resolve(site,'.'+(p==='/'?'/index.html':p));if(!file.startsWith(site+'/')||!fs.existsSync(file)){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:800,height:600}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false})));
 await page.goto('http://127.0.0.1:'+server.address().port+'/?range&skipTitle');await page.waitForFunction(()=>window.__G?.match?.range&&__G.match.state==='playing',null,{timeout:180000});
 await page.evaluate(async()=>{const G=window.__G,g=G.game,a=G.local;g.debug.freeze();g.debug.freezeBots();a.setWeapon('roller');await a.character._sourceMotionLoader;G.projectiles.clear();G.fx.clear();a.form='kid';a.submerged=a.climbing=false;a.specialActive=null;a.superJumpState=null;a.invuln=0;a.vel.set(0,0,0);a.grounded=true;a.weaponRunner.reset();
  for(let i=0;i<120;i++){G.time+=1/60;a._finishFrame(1/60);}window.swingOrigin=a.pos.clone();window.swingFrames=[];
  const T=await import('three');window.swingT=T;const {recordMovementLaunch}=await import(new URL('patches/splatoon3/runtime/roller-freefall.mjs',document.baseURI).href);recordMovementLaunch(a);
  window.captureSwing=(frame,held)=>{const dt=1/60,c=a.character;a.pos.copy(swingOrigin);a.grounded=frame>=40;a.pos.y+=frame<40?1.2*Math.sin(Math.PI*frame/40):0;a.vel.set(0,frame<40?1.2*Math.PI/.6667*Math.cos(Math.PI*frame/40):0,0);a.intent.fire=held||frame===0;
    a.weaponRunner.update(dt,{firePressed:frame===0,fire:a.intent.fire});G.time+=dt;a._finishFrame(dt);G.projectiles.update(dt);G.fx.update(dt,G.camera);c.root.updateMatrixWorld(true);c.skeleton.update();
    const drum=c.weapon.drum;drum.updateWorldMatrix(true,false);const box=new T.Box3().setFromObject(drum),centre=new T.Vector3();box.getCenter(centre);centre.sub(a.pos);const ends=[new T.Vector3(-.5,0,0).applyMatrix4(drum.matrixWorld).sub(a.pos),new T.Vector3(.5,0,0).applyMatrix4(drum.matrixWorld).sub(a.pos)];
    const attack=a.weaponRunner.s3RollerAttack;const row={frame,elapsed:attack?.elapsed??null,windup:attack?.windup??null,released:attack?.released??null,vertical:attack?.vertical??null,centre:centre.toArray(),axis:ends[1].sub(ends[0]).normalize().toArray(),lowest:box.min.y-a.pos.y,grips:c.ikErr.slice(0,2),rolling:a.weaponRunner.rolling};swingFrames.push(row);
    const cam=G.camera;cam.position.copy(a.pos).add(new T.Vector3(3,1.8,4));cam.lookAt(a.pos.x,a.pos.y+1,a.pos.z);G.projectiles._draw();G.renderer.render(G.scene,cam);return row;
  };
 });
 const shots=new Set([0,4,8,12,16,20,22,24,25,26,28,32,36,40,44,47,52,60]);
 for(let frame=0;frame<=65;frame++){await page.evaluate(frame=>captureSwing(frame,false),frame);if(shots.has(frame))await page.screenshot({path:path.join(out,'frame-'+String(frame).padStart(2,'0')+'.png')});}
 const frames=await page.evaluate(()=>swingFrames);assert(frames.some(x=>x.vertical));assert.deepEqual(errors,[]);
 const report={status:'passed',contentHash:JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))).contentHash,browser:browser.version(),scope:'Actual emitted Actor/Runner/Character/IK. Controlled 40-frame airborne path, horizontal aim, release fire, fixed camera relative to root. Not retail jump timing or pixel identity.',frames,errors};fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,frames:frames.length,release:frames.find(x=>x.released)?.frame,errors}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
