#!/usr/bin/env node
// Actual production practice-range composition. Controlled flight isolates recovery.
// No Nintendo media is served or captured; retail reference acceptance is separate.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {chromium} from 'playwright';import crypto from 'node:crypto';
const site=path.resolve(process.argv[2]||'_site'),out=path.resolve(process.argv[3]||'.browser-evidence/vertical');fs.mkdirSync(out,{recursive:true});
const requested=process.argv[4]||'released-edge';
const plan=requested==='matrix'?[30,60,120].flatMap(hz=>['released-edge','landing-edge','unchanged'].map(scenario=>({scenario,hz,id:'roller'}))):[{scenario:requested,hz:Number(process.argv[5]||60),id:process.argv[6]||'roller'}];
for(const {scenario,hz} of plan){assert(['released-edge','landing-edge','unchanged'].includes(scenario));assert([30,60,120].includes(hz));}
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),served={};
assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const p=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.resolve(site,'.'+(p==='/'?'/index.html':p));if(!file.startsWith(site+'/')||!fs.existsSync(file)){res.writeHead(404).end();return;}const rel=path.relative(site,file),bytes=fs.readFileSync(file);assert.equal(hash(bytes),manifest.artifacts[rel],'served build identity: '+rel);served[rel]=hash(bytes);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:800,height:600}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{let rng=123;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false}));});
 await page.goto('http://127.0.0.1:'+server.address().port+'/?range&skipTitle');await page.waitForFunction(()=>window.__G?.match?.range&&__G.match.state==='playing',null,{timeout:180000});
 const results=[];
 for(const {scenario,hz,id} of plan){
 const caseOut=plan.length>1?path.join(out,scenario+'-'+hz):out;fs.mkdirSync(caseOut,{recursive:true});
 await page.evaluate(async({scenario,hz,id})=>{const G=window.__G,g=G.game,a=G.local;g.debug.freeze();g.debug.freezeBots();let rng=123;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};a.setWeapon(id);a.yaw=0;a.aimPitch=0;a.aimDir.set(0,0,1);a.aimPoint.copy(a.pos).add(a.aimDir.clone().multiplyScalar(20));await a.character._sourceMotionLoader;G.projectiles.clear();G.fx.clear();a.form='kid';a.submerged=a.climbing=false;a.specialActive=null;a.superJumpState=null;a.invuln=0;a.vel.set(0,0,0);a.grounded=true;a.weaponRunner.reset();
  for(let i=0;i<120;i++){G.time+=1/60;a._finishFrame(1/60);}a.character.fidget=-1;a.character.idleT=0;a.character.shufT=99;window.swingOrigin=a.pos.clone();window.swingFrames=[];
  const T=await import('three');window.swingT=T;const {recordMovementLaunch}=await import(new URL('patches/splatoon3/runtime/roller-freefall.mjs',document.baseURI).href);recordMovementLaunch(a);
  window.captureSwing=(frame,held)=>{const dt=1/60,c=a.character;a.pos.copy(swingOrigin);const landing=scenario==='landing-edge'?48:40;a.grounded=frame>=landing;a.pos.y+=frame<landing?1.2*Math.sin(Math.PI*frame/landing):0;a.vel.set(0,frame<landing?1.2*Math.PI/(landing/60)*Math.cos(Math.PI*frame/landing):0,0);a.intent.fire=held||frame===0;
    a.weaponRunner.update(dt,{firePressed:frame===0,fire:a.intent.fire});G.time+=dt;a._finishFrame(dt);G.projectiles.update(dt);G.fx.update(dt,G.camera);c.root.updateMatrixWorld(true);c.skeleton.update();
    const drum=c.weapon.drum;drum.updateWorldMatrix(true,false);const box=new T.Box3().setFromObject(drum),centre=new T.Vector3();box.getCenter(centre);centre.sub(a.pos);const ends=[new T.Vector3(-.5,0,0).applyMatrix4(drum.matrixWorld).sub(a.pos),new T.Vector3(.5,0,0).applyMatrix4(drum.matrixWorld).sub(a.pos)];
    const attack=a.weaponRunner.s3RollerAttack;const row={frame,floorSearch:{...c._s3RollerFloorSearch},pose:Array.from(c.P),ink:a.ink,cooldown:a.weaponRunner.cooldown,projectiles:G.projectiles.list.map(p=>({pos:p.pos.toArray(),vel:p.vel.toArray(),damage:p.damage,age:p.age,type:p.type})),render:{calls:G.renderer.info.render.calls,triangles:G.renderer.info.render.triangles},elapsed:attack?.elapsed??null,windup:attack?.windup??null,released:attack?.released??null,vertical:attack?.vertical??null,centre:centre.toArray(),axis:ends[1].sub(ends[0]).normalize().toArray(),lowest:box.min.y-a.pos.y,grips:c.ikErr.slice(0,2),rolling:a.weaponRunner.rolling};swingFrames.push(row);
    const cam=G.camera;cam.position.copy(a.pos).add(new T.Vector3(3,1.8,4));cam.lookAt(a.pos.x,a.pos.y+1,a.pos.z);G.projectiles._draw();G.renderer.render(G.scene,cam);return row;
  };
  const {FixedClock}=await import(new URL('patches/splatoon3/runtime/clock.mjs',document.baseURI).href);const clock=new FixedClock();window.swingTick=0;window.displayFrame=()=>clock.advance(1/hz,()=>{const tick=window.swingTick++;captureSwing(tick,scenario==='landing-edge'||scenario==='released-edge'&&tick<48);});
 },{scenario,hz,id});
 const shots=new Set([44,47,48,49,50,52,53,55,56,60]);
 for(let display=0;display<Math.ceil(hz*1.1);display++){await page.evaluate(()=>displayFrame());const tick=await page.evaluate(()=>swingTick-1);if(shots.delete(tick))await page.screenshot({path:path.join(caseOut,'tick-'+String(tick).padStart(2,'0')+'.png')});}
 const frames=await page.evaluate(()=>swingFrames);assert(frames.some(x=>x.vertical));assert.deepEqual(errors,[]);
 const report={status:'passed',scenario,hz,id,inputHash:manifest.inputHash,contentHash:manifest.contentHash,scriptSha256:hash(fs.readFileSync(new URL(import.meta.url))),served,browser:browser.version(),scope:'Actual emitted production practice range, Actor/Runner/Character/IK/projectiles and WebGL. FixedClock at selected display Hz; controlled landing and ZR edges, horizontal aim, fixed camera relative to root. Not retail jump/input timing, matched Nintendo footage, hardware GPU performance or pixel parity.',frames,errors};fs.writeFileSync(path.join(caseOut,'receipt.json'),JSON.stringify(report,null,2));results.push({scenario,hz,id,status:report.status,frames:frames.length,release:frames.find(x=>x.released)?.frame,errors});console.log(JSON.stringify(results.at(-1)));
 }
 if(plan.length>1)fs.writeFileSync(path.join(out,'matrix.json'),JSON.stringify({contentHash:manifest.contentHash,scriptSha256:hash(fs.readFileSync(new URL(import.meta.url))),results},null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
