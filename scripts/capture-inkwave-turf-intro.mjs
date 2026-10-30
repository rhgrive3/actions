#!/usr/bin/env node
// Observe the real emitted Game/Match/CameraRig, without replacing their methods.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {sandboxBrowserOptions} from './lib/inkwave-sandbox-browser.mjs';
const option=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const site=path.resolve(option('--site','_site')),out=path.resolve(option('--evidence-dir','.browser-evidence/turf-intro'));
const map=option('--map','tidewater'),frames=[0,100,208,209,300,398,399,420,436,456,500,577,578,610,650,720];
if(['/tmp','/var/tmp','/dev/shm'].some(p=>out===p||out.startsWith(p+'/')))throw Error('Use persistent evidence storage');
fs.mkdirSync(out,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(hash(JSON.stringify(manifest.artifacts))!==manifest.contentHash)throw Error('Invalid build identity');
for(const [file,digest] of Object.entries(manifest.artifacts))if(hash(fs.readFileSync(path.join(site,file)))!==digest)throw Error('Artifact mismatch: '+file);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{try{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(site,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(site+path.sep)||!fs.statSync(file).isFile())throw Error('Missing');
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let context;
const receipt={sourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 dirty:!!execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim(),
 contentHash:manifest.contentHash,map,viewport:[1280,720],seed:112358,renderer:'Chromium SwiftShader',frames,errors:[],rows:[]};
try{
 context=await chromium.launchPersistentContext(path.join(out,'profile'),{...sandboxBrowserOptions(),viewport:{width:1280,height:720}});
 const page=await context.newPage();
 page.on('pageerror',e=>receipt.errors.push(e.message));
 await page.addInitScript(()=>{let seed=112358;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
  localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:true}));});
 await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>window.__inkwave?.menus&&window.__G?.s3?.installed&&window.__G.mode!=='boot',null,{timeout:180000});
 await page.evaluate(async map=>{const g=window.__inkwave;g.debug.freeze();g.menus.wipe.cancel();
  await g.startMatch({mapId:map,difficulty:'easy',duration:180,mode:'turf'});g.menus.wipe.cancel();
  if(g.match?.state!=='intro'||g.match.paused||g.match!==window.__G.match)throw Error('Native intro not admitted');
  g.__introCaptureStart=g.s3Clock.ticks;
 },map);
 // Let the ordinary loading/menu CSS complete while the real simulation is frozen.
 await page.waitForTimeout(800);
 for(const frame of frames){
  const row=await page.evaluate(frame=>{const g=window.__inkwave,G=window.__G;
   g._skipRender=true;while(g.s3Clock.ticks-g.__introCaptureStart<frame)g._frame(1/60);
   g._skipRender=false;g._frame(0);
   return{frame,state:g.match.state,stateT:g.match.stateT,native:!!G.level.native,
    camera:G.camera.position.toArray(),quaternion:G.camera.quaternion.toArray(),fov:G.camera.fov,mode:g.rig.mode,
    spawn:g.match.local.s3?.squidSpawn?.phase,hud:g.hud._visible,
    actors:g.match.actors.map(a=>({team:a.team,pos:a.pos.toArray()}))};
  },frame);
  receipt.rows.push(row);await page.screenshot({path:path.join(out,`f${String(frame).padStart(4,'0')}.png`)});
  console.log(frame,row.state,row.stateT.toFixed(3),row.mode);
 }
 if(receipt.errors.length)throw Error(receipt.errors.join('\n'));
 receipt.outcome='passed';
}catch(error){receipt.outcome='failed';receipt.error=String(error.stack||error);throw error;}
finally{
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 await context?.close();await new Promise(resolve=>server.close(resolve));
}
