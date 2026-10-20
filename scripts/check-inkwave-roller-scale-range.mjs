// Native Game/Range entry, then shipped deterministic debug input/60 Hz steps.
// The inspection camera changes only the evidence view. No replacement floor,
// shader, Character, Physics, paint or controller is installed.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { enterRangeFromMenu } from './lib/inkwave-range-menu-entry.mjs';
const site=path.resolve(process.argv[2]||'_site'), out=path.resolve(process.argv[3]||'.browser-evidence/roller-scale/range');
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json',
  '.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.css':'text/css','.mp3':'audio/mpeg','.woff2':'font/woff2'};
const server=http.createServer((q,r)=>{
  const u=new URL(q.url,'http://localhost'), file=path.resolve(site,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
  if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){r.writeHead(404);r.end();return;}
  r.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(r);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser,page,diagnosticTimer;
const receipt={build:JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))).contentHash,errors:[],requests:[],console:[]};
const snapshot=async()=>page?.evaluate(()=>({mode:window.__G?.mode,match:window.__G?.match?.state,
  menu:window.__inkwave?.menus?.current,layout:window.__G?.level?.layout?.id,
  range:!!window.__G?.match?.range,text:document.body.innerText.slice(-1800)})).catch(()=>null);
try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',
    ...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}}:{}),
    args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  page=await browser.newPage({viewport:{width:1280,height:840}});
  page.on('pageerror',e=>receipt.errors.push(e.message));
  page.on('requestfailed',r=>{if(receipt.requests.length<30)receipt.requests.push({url:r.url(),failure:r.failure()});});
  page.on('response',r=>{if(r.status()>=400&&receipt.requests.length<30)receipt.requests.push({url:r.url(),status:r.status()});});
  page.on('console',m=>{if(['error','warning'].includes(m.type())&&receipt.console.length<30)receipt.console.push(m.text().slice(0,1500));});
  diagnosticTimer=setInterval(async()=>{receipt.state=await snapshot();fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(receipt,null,2));},15000);
  await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',lang:'ja'})));
  receipt.entry=await enterRangeFromMenu(page,'http://127.0.0.1:'+server.address().port,{timeout:240000,
    onProgress:r=>{receipt.entry=r;fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(receipt,null,2));}});
  console.log('Native Range ready');
  receipt.measurement=await page.evaluate(async()=>{
    const G=window.__G,g=window.__inkwave,a=G.local;
    const {Vector3,OrthographicCamera}=await import('three');
    g.debug.freeze();G.match.range.setWeapon('roller');
    await G.audio?.prepareWeapon?.('roller',{urgent:true});
    await a.character.sourceMotion.ready;
    G.match.range.travel('roller');
    a.pos.set(-26.5,.04,4);a.vel.set(0,0,0);a.yaw=a.aimYaw=0;g.rig.yaw=0;g.rig.pitch=-.3;
    g.input.keys.clear();g.debug.key('KeyW',true);g.debug.fire(true);
    // Batch the shipped 60 Hz debug steps: simulate every tick and draw once,
    // instead of forcing ninety unnecessary full-world software renders.
    a.ink=100;g.debug.step(1500);
    if(!a.weaponRunner.rolling)throw Error('Native controller did not enter rolling');
    G.paint.clear();G.projectiles.clear();
    const start=a.pos.clone(), events=[],splat=G.paint.splat;
    G.paint.splat=function(at,r,team,o){if(o?.footprint==='ink-contact')events.push({at:at.toArray(),r,heading:o.stretch?.toArray(),amount:o.stretchAmt});return splat.call(this,at,r,team,o);};
    try{a.ink=100;g.debug.step(1500);}
    finally{G.paint.splat=splat;g.debug.fire(false);g.debug.key('KeyW',false);}
    const gameplayPng=G.renderer.domElement.toDataURL('image/png').split(',')[1];
    G.paint.flush(0);
    const f=G.level.faces[a.ground.face],atlas=f.atlas;
    if(!atlas)throw Error('Native roller court has no paint atlas');
    const pixels=new Uint8Array(G.paint.size**2*4);
    G.renderer.readRenderTargetPixels(G.paint.rt,0,0,G.paint.size,G.paint.size,pixels);
    const p=new Vector3(),sample=(x,z)=>{
      p.set(x,f.origin.y,z).sub(f.origin);
      const u=p.dot(f.u),v=p.dot(f.v);
      const col=Math.floor(atlas.x+atlas.pad+u*atlas.ppm),row=Math.floor(atlas.y+atlas.pad+v*atlas.ppm);
      return pixels[4*(row*G.paint.size+col)+3];
    };
    let holes=0,rows=0;const widths=[];
    for(let z=start.z+1;z<a.pos.z-.5;z+=.1){
      rows++;if(sample(a.pos.x,z)<128)holes++;
      let lo=Infinity,hi=-Infinity;
      for(let x=a.pos.x-4;x<=a.pos.x+4;x+=.025)if(sample(x,z)>=128){lo=Math.min(lo,x);hi=Math.max(hi,x);}
      if(hi>=lo)widths.push(hi-lo);
    }
    a.character.root.updateMatrixWorld(true);
    const w=a.character.weapon,box=w.def.drum.boundingBox;
    const centre=w.drum.localToWorld(box.min.clone().add(box.max).multiplyScalar(.5));
    const event=events.at(-1),front=new Vector3(...event.at).addScaledVector(new Vector3(...event.heading),.6*event.r*(1+event.amount));
    const m=w.drum.matrixWorld.elements,drumWidth=(box.max.x-box.min.x)*Math.hypot(m[0],m[2]);
    const halfHeight=7.5,halfWidth=halfHeight*G.renderer.domElement.width/G.renderer.domElement.height;
    const view=new OrthographicCamera(-halfWidth,halfWidth,halfHeight,-halfHeight,.1,100),cz=a.pos.z-3;
    view.up.set(0,0,1);view.position.set(a.pos.x,30,cz);view.lookAt(a.pos.x,0,cz);
    G.renderer.setRenderTarget(null);G.renderer.render(G.scene,view);
    G.renderer.domElement.id='roller-scale-canvas';
    return {layout:G.level.layout.id,start:start.toArray(),end:a.pos.toArray(),face:f.id,
      floorTag:G.level.blocks[f.block].tag,drumWidth,paintHalf:event.r,contactDepth:1.2*event.r*(1+event.amount),
      gpuMinWidth:Math.min(...widths),gpuMaxWidth:Math.max(...widths),rows,holes,
      contactError:Math.hypot(centre.x-front.x,centre.z-front.z),events:events.length,
      debugFixedTicks:180,controller:'shipped KeyW + held fire',inspectionCameraOnly:true,
      gameplayPng,inspectionPng:G.renderer.domElement.toDataURL('image/png').split(',')[1]};
  });
  for(const [key,name] of [['gameplayPng','gameplay.png'],['inspectionPng','scene.png']]){
    fs.writeFileSync(path.join(out,name),Buffer.from(receipt.measurement[key],'base64'));delete receipt.measurement[key];
  }
  await page.locator('#roller-scale-canvas').screenshot({path:path.join(out,'range.png'),timeout:60000});
  const m=receipt.measurement;
  assert.equal(m.layout,'range');assert.equal(m.floorTag,'floor:roller');
  assert.equal(m.holes,0);assert.ok(m.rows>40);assert.ok(m.contactError<1e-5);
  assert.ok(Math.abs(m.drumWidth-2.5712)<1e-4);assert.equal(m.paintHalf,2.8);
  assert.ok(Math.abs(m.contactDepth-1.5)<1e-10);
  assert.ok(m.gpuMaxWidth>5.2&&m.gpuMaxWidth<6);
  assert.equal(receipt.errors.length,0);
  receipt.passed=true;console.log(JSON.stringify(m));
}catch(error){receipt.passed=false;receipt.failure=String(error.stack||error);receipt.state=await snapshot();await page?.screenshot({path:path.join(out,'failure.png'),timeout:30000}).catch(()=>{});throw error;}
finally{clearInterval(diagnosticTimer);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(receipt,null,2)+'\n');await browser?.close();await new Promise(r=>server.close(r));}
