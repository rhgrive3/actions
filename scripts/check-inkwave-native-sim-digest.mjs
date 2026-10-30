#!/usr/bin/env node
// #1671: seeded whole-game equivalence of two builds (baseline vs candidate).
// Each frame hashes every actor's position, velocity, HP, ink, form and turf,
// paint counts/version/growth; the run ends with the CPU paint grid and the
// per-cell ownership order. A pair counts only when the baseline reproduces
// itself first: startMatch's async loading shares Math.random with menu rAF
// work, so a loaded machine can draw a different bot roster.
//
// node scripts/check-inkwave-native-sim-digest.mjs --base _site-native \
//   --candidate _site-native-new --stage scorch --hz 60 --frames 3600
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import { chromium } from 'playwright';
const args=process.argv.slice(2),get=(n,d)=>{const i=args.indexOf(n);return i<0?d:args[i+1];};
const base=path.resolve(get('--base','_site-native')),candidate=path.resolve(get('--candidate','_site-native-new'));
const stage=get('--stage','scorch'),hz=Number(get('--hz',60)),frames=Number(get('--frames',3600)),attempts=Number(get('--attempts',3));
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json'};
async function digest(site){
 const server=http.createServer((req,res)=>{try{const rel=decodeURIComponent(new URL(req.url,'http://local').pathname),file=path.resolve(site,'.'+(rel==='/'?'/index.html':rel));if(!file.startsWith(site+path.sep)||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  // The first boot in a browser takes another code path inside Match.setup
  // (thousands more Math.random draws) than later boots. Discard one boot.
  const warm=await browser.newContext(),warmPage=await warm.newPage();
  await warmPage.goto('http://127.0.0.1:'+server.address().port+'/?map='+stage,{waitUntil:'domcontentloaded'});
  await warmPage.waitForFunction(()=>window.__G?.mode==='menu',null,{timeout:180000});
  await warmPage.evaluate(async stage=>{const g=window.__inkwave;g.debug.freeze();g.menus.wipe.cancel();await g.startMatch({mapId:stage,mode:'turf',duration:180,difficulty:'normal'});},stage);
  await warm.close();
  const page=await (await browser.newContext({viewport:{width:960,height:640}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Boot also draws (palette, attract match): seed it before any page script.
  await page.addInitScript(()=>{localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,musicVolume:0,audioVolume:0}));
   let s=987654321;Math.random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};});
  await page.goto('http://127.0.0.1:'+server.address().port+'/?map='+stage,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__G?.mode==='menu',null,{timeout:180000});
  const result=await page.evaluate(async({stage,frames,hz})=>{
   const g=window.__inkwave,G=window.__G;let s=13579;Math.random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
   // Menu frames before the freeze differ per boot; start both builds at time 0.
   // Match.setup draws the roster synchronously; async menu work may draw
   // before it. Re-seed exactly there (the menu's attract match shares the class).
   const MatchProto=G.match&&Object.getPrototypeOf(G.match),setup=MatchProto?.setup;
   if(setup)MatchProto.setup=function(...args){s=11223;return setup.apply(this,args);};
   g.debug.freeze();G.time=0;g.s3Clock?.reset();g.menus.wipe.cancel();
   await g.startMatch({mapId:stage,mode:'turf',duration:180,difficulty:'normal'});g._skipRender=true;
   s=24680;for(const a of G.actors){const b=a.bot;if(!b)continue;b.sweep=Math.random()*10;b.strafe=Math.random()<.5?1:-1;b.bombCd=3+Math.random()*4;b.think=Math.random()*.2;b.chargeRelease=.95+Math.random()*.05;b.ph1=Math.random()*20;b.ph2=Math.random()*20;b.t=Math.random()*10;b.dodgeCd=1+Math.random()*2;}
   const f64=new Float64Array(1),u32=new Uint32Array(f64.buffer),mix=(h,x)=>Math.imul(h^x,16777619)>>>0,num=(h,v)=>{f64[0]=+v;return mix(mix(h,u32[0]),u32[1]);};
   const state=()=>{let h=2166136261;for(const a of G.actors){for(const v of [a.pos.x,a.pos.y,a.pos.z,a.vel.x,a.vel.y,a.vel.z,a.hp,a.ink,a.alive?1:0,a.grounded?1:0,a.yaw??0,a.special??0,a.turf??0])h=num(h,v);h=mix(h,(a.form||'').length);}
    const P=G.paint;for(const v of [...P.counts,P.version,P.growing.length])h=num(h,v);return h;};
   const cells=a=>{let h=2166136261;for(let i=0;i<(a?.length||0);i++)h=mix(h,a[i]);return h;};
   for(let i=0,n=(g.match.turfIntroFrames??253)+47;i<n;i++)g._frame(1/60);
   g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);g.input.mouse.left=false;
   g.debug.key('KeyW',true);g.debug.fire(true);const seq=[];
   for(let i=0;i<frames;i++){g.rig.yaw+=.5/hz;g.debug.key('Space',i%Math.round(hz*2)===0);g._frame(1/hz);seq.push(state());}
   g.debug.key('KeyW',false);g.debug.fire(false);
   return {roster:G.actors.map(a=>a.weapon?.id),ticks:g.s3Clock.ticks,seq,grid:cells(G.paint.grid),order:cells(G.paint._paintOwnershipOrder),counts:[...G.paint.counts],state:G.match.state};
  },{stage,frames,hz});
  return {...result,errors};
 }finally{await browser.close();server.close();}
}
const compare=(a,b)=>{const first=a.seq.findIndex((v,i)=>v!==b.seq[i]);return {identical:first<0&&a.seq.length===b.seq.length&&a.grid===b.grid&&a.order===b.order&&a.ticks===b.ticks,firstDivergentFrame:first,gridEqual:a.grid===b.grid,orderEqual:a.order===b.order};};
for(let attempt=1;attempt<=attempts;attempt++){
 const a=await digest(base),b=await digest(base);
 if(!compare(a,b).identical){console.log(JSON.stringify({stage,hz,frames,attempt,baselineReproducible:false}));continue;}
 // A logic change diverges on every run. A candidate run whose own startup
 // drew another roster is retried, and reported, instead of being accepted.
 const runs=[];
 for(let k=0;k<attempts;k++){
  const c=await digest(candidate),r=compare(a,c);
  runs.push({...r,sameRoster:JSON.stringify(c.roster)===JSON.stringify(a.roster),errors:c.errors.length});
  if(r.identical)break;
 }
 const ok=runs.at(-1).identical;
 console.log(JSON.stringify({stage,hz,frames,attempt,baselineReproducible:true,identical:ok,candidateRuns:runs,ticks:a.ticks,counts:a.counts,state:a.state,roster:a.roster,errors:a.errors.length}));
 process.exit(ok?0:1);
}
console.log(JSON.stringify({stage,hz,frames,error:'baseline never reproduced itself'}));process.exit(2);
