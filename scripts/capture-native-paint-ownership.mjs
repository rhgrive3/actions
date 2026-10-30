#!/usr/bin/env node
// Capture actual native bomb ownership calls and the touched-cell input/output deltas.
// Diagnostic only: observer overhead invalidates frame timing. Source geometry stays in the local gzip.
// node scripts/capture-native-paint-ownership.mjs --site _site --stage robo --frames 900 --out .ci-scratch/native-paint/capture.json.gz
import {gzipSync} from 'node:zlib';
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import { chromium, webkit } from 'playwright';
const args=process.argv.slice(2),get=(n,d)=>{const i=args.indexOf(n);return i<0?d:args[i+1];},has=n=>args.includes(n);
const site=path.resolve(get('--site','_site-native')),stage=get('--stage','scorch'),frames=Number(get('--frames',3600)),hz=Number(get('--hz',60));
const engine=get('--browser','chromium'),mobile=has('--mobile'),out=get('--out',null);
if(!out||!Number.isSafeInteger(frames)||frames<1||frames>3600||hz!==60)throw Error('Use --out, 1..3600 frames and --hz 60');
const output=path.resolve(out);if(['/tmp','/var/tmp','/dev/shm'].some(p=>output===p||output.startsWith(p+'/')))throw Error('Use a persistent evidence directory');
fs.mkdirSync(path.dirname(output),{recursive:true});
const browserTemp=path.resolve('.ci-scratch/native-paint-browser');fs.mkdirSync(browserTemp,{recursive:true});
for(const name of ['TMPDIR','TMP','TEMP'])process.env[name]=browserTemp;
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json'};
const server=http.createServer((req,res)=>{try{const rel=decodeURIComponent(new URL(req.url,'http://local').pathname),file=path.resolve(site,'.'+(rel==='/'?'/index.html':rel));if(!file.startsWith(site+path.sep)||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=engine==='webkit'?await webkit.launch({headless:true}):await chromium.launch({executablePath:process.env.CHROMIUM_PATH||chromium.executablePath(),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext(mobile?{viewport:{width:1180,height:820},hasTouch:true,isMobile:engine!=='webkit',userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'}:{viewport:{width:960,height:640}});
 const page=await context.newPage();page.on('pageerror',e=>console.error('page-error '+e.message));
 await page.addInitScript(m=>{localStorage.setItem('inkwave.settings',JSON.stringify(m?{musicVolume:0,audioVolume:0}:{quality:'low',shadows:false,bloom:false,musicVolume:0,audioVolume:0}));
  let s=987654321;Math.random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};},mobile);
 await page.goto('http://127.0.0.1:'+server.address().port+'/?map='+stage,{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__G?.mode==='menu',null,{timeout:300000});
 const report=await page.evaluate(async({stage,frames,hz})=>{
  const g=window.__inkwave,G=window.__G;let s=13579;Math.random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  // Same deterministic start as check-inkwave-native-sim-digest.mjs, so two
  // builds replay one workload (compare the printed roster and final digest).
  // Match.setup draws the roster synchronously; async menu work may draw
  // before it. Re-seed exactly there (the menu's attract match shares the class).
  const MatchProto=G.match&&Object.getPrototypeOf(G.match),setup=MatchProto?.setup;
  if(setup)MatchProto.setup=function(...args){s=11223;return setup.apply(this,args);};
  g.debug.freeze();G.time=0;g.s3Clock?.reset();g.menus.wipe.cancel();await g.startMatch({mapId:stage,mode:'turf',duration:180,difficulty:'normal'});g._skipRender=true;
  s=24680;for(const a of G.actors){const b=a.bot;if(!b)continue;b.sweep=Math.random()*10;b.strafe=Math.random()<.5?1:-1;b.bombCd=3+Math.random()*4;b.think=Math.random()*.2;b.chargeRelease=.95+Math.random()*.05;b.ph1=Math.random()*20;b.ph2=Math.random()*20;b.t=Math.random()*10;b.dodgeCd=1+Math.random()*2;}
  for(let i=0,n=(g.match.turfIntroFrames??253)+47;i<n;i++)g._frame(1/60);g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;for(let i=0;i<300;i++)g._frame(1/60);
  const targets=new Map(),all=[],maxTargets=3;
  const primitives=g=>Object.fromEntries(Object.entries(g).filter(([k,v])=>v===null||['number','boolean','string'].includes(typeof v)));
  const faceFields=f=>({atlas:f.atlas?{...f.atlas}:null,su:f.su,sv:f.sv,nu:f.nu,nv:f.nv,cu:f.cu,cv:f.cv,grid:f.grid,wall:f.wall,turf:f.turf,nativeEmpty:f.nativeEmpty});
  const P=G.paint,records=()=>P._paintOrderRecords.map(x=>x&&typeof x==='object'?{...x}:x);
  const capture=(g,phase,dripPhase,fn,args,finish)=>{
   let row=targets.get(g.paintOrder);
   if(!row&&all.length<maxTargets&&!finish&&g.kind===3&&g.age<=1/30&&g.entries.length>=256){
    const faces=[],byFace=new Map(),entries=[],set=new Set(),stride=g.entryStride===8?8:7;
    for(let at=0;at<g.entries.length;at+=stride){const f=g.entries[at];if(!byFace.has(f)){byFace.set(f,faces.length);faces.push(faceFields(f));for(let i=f.grid;i<f.grid+f.nu*f.nv;i++)set.add(i);}
      entries.push(byFace.get(f),...g.entries.slice(at+1,at+stride));}
    const indices=[...set].sort((a,b)=>a-b);
    row={id:g.paintOrder,faces,entries,entryStride:stride,indices,calls:[],length:P.grid.length,grid:new Uint8Array(indices.length),owners:new Uint32Array(indices.length),dead:new Uint8Array(indices.length)};
    targets.set(g.paintOrder,row);all.push(row);
   }
   if(!row)return fn.apply(P,args);
   const changes=[];for(let k=0;k<row.indices.length;k++){const i=row.indices[k];if(row.grid[k]!==P.grid[i]||row.owners[k]!==P._paintOwnershipOrder[i]||row.dead[k]!==P.dead[i]){row.grid[k]=P.grid[i];row.owners[k]=P._paintOwnershipOrder[i];row.dead[k]=P.dead[i];changes.push([k,row.grid[k],row.owners[k],row.dead[k]]);}}
   const td=g.dripDur?Math.min(1,g.age/g.dripDur):1;
   const call={g:primitives(g),tn:finish?3:phase===undefined?Math.min(3,Math.max(0,g.age/Math.max(g.dur,1e-6))):phase,dT:finish?1:dripPhase===undefined?(g.dripDur?1-Math.pow(1-td,2.2):1):dripPhase,
    before:changes,counts:[...P.counts],version:P.version,orders:records(),after:[]};
   const value=fn.apply(P,args);call.value=value;call.afterCounts=[...P.counts];call.afterVersion=P.version;
   for(let k=0;k<row.indices.length;k++){const i=row.indices[k];if(row.grid[k]!==P.grid[i]||row.owners[k]!==P._paintOwnershipOrder[i]||row.dead[k]!==P.dead[i]){row.grid[k]=P.grid[i];row.owners[k]=P._paintOwnershipOrder[i];row.dead[k]=P.dead[i];call.after.push([k,row.grid[k],row.owners[k],row.dead[k]]);}}
   row.calls.push(call);if(finish){row.closed=true;targets.delete(row.id);}return value;
  };
  const advance=P._advanceSplatOwnership,finish=P._finishSplatOwnership;
  P._advanceSplatOwnership=function(g,phase,dripPhase){return capture(g,phase,dripPhase,advance,arguments,false);};
  P._finishSplatOwnership=function(g){return capture(g,3,1,finish,arguments,true);};
  g.debug.key('KeyW',true);g.debug.fire(true);
  for(let i=0;i<frames;i++){g.rig.yaw+=.6/hz;g._frame(1/hz);if(all.length===maxTargets&&targets.size===0)break;}
  g.debug.key('KeyW',false);g.debug.fire(false);
  for(const row of all){delete row.grid;delete row.owners;delete row.dead;}
  return {stage,hz,requestedFrames:frames,native:!!P.level.native,scope:'Actual bomb ancillary-ownership calls with exact touched-cell inputs and outputs; preexisting mask caches are not serialized',targets:all};

 },{stage,frames,hz});
 if(!report.native||!report.targets.length||report.targets.some(row=>!row.closed))throw Error('Capture did not complete native bomb records; increase --frames');
 report.schema=1;report.browser=engine;report.mobileProfile=mobile;report.site=path.basename(site);const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));report.build={contentHash:build.contentHash,revision:build.build.revision};
 fs.writeFileSync(out,gzipSync(JSON.stringify(report)));
 console.log(JSON.stringify({out,targets:report.targets.map(r=>({id:r.id,faces:r.faces.length,cells:r.indices.length,calls:r.calls.length,closed:r.closed})),bytes:fs.statSync(out).size}));
}finally{await browser.close();server.close();}
