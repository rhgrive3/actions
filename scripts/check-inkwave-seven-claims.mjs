#!/usr/bin/env node
// Browser evidence for the emitted gameplay and real Canvas/WebGL atlas lifetime.
// Physics/display fixtures are controlled; no retail or mobile-driver parity claim.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { transformSync } from 'esbuild';
const originalMural=transformSync(fs.readFileSync('inkwave-public/src/world/murals.js','utf8'),{loader:'js',minify:true,charset:'utf8',legalComments:'inline'}).code;
const site=path.resolve(process.argv[2]||'_site');
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
for(const [file,digest] of Object.entries(manifest.artifacts))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(site,file))).digest('hex'),digest,file);
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/probe') {res.setHeader('content-type','text/html');res.end('<!doctype html><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>');return;}
  const original=url.pathname==='/src/world/original-murals.js';
  if(original){res.setHeader('content-type','text/javascript');res.end(originalMural);return;}
  const file=path.resolve(site,'.'+url.pathname);
  if(!original&&!file.startsWith(site+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('content-type',file.endsWith('.json')?'application/json':'text/javascript');fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try {
  const results=[];
  for(const engine of process.argv.includes('--webkit')?['chromium','webkit']:['chromium']){
    browser=await ({chromium,webkit}[engine]).launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader']}: {})});
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/probe`);
    const result=await page.evaluate(async()=>{
      const check=(v,msg)=>{if(!v)throw Error(msg);}, near=(a,b)=>check(Math.abs(a-b)<1e-8,`${a} != ${b}`);
      const THREE=await import('three'),{G}=await import('/src/core/ctx.js'),{Actor}=await import('/src/game/actor.js'),{Projectiles}=await import('/src/game/weapons.js');
      const profile=await fetch('/patches/splatoon3/profile.json').then(r=>r.json());(await import('/patches/splatoon3/runtime/install.mjs')).install(profile);
      const {FixedClock}=await import('/patches/splatoon3/runtime/clock.mjs');
      const fidelity=await import('/patches/splatoon3/runtime/weapons-fidelity.mjs');
      G.time=0;G.scene=new THREE.Scene();G.teamColors=[new THREE.Color('#f80'),new THREE.Color('#03f')];G.actors=[];
      G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};
      G.physics={los:()=>true,segment:(_a,_b,h)=>{h.hit=false;return h;},raycast:(_a,_b,_c,h)=>{h.hit=false;return h;}};
      G.paint={sample:()=>0,splat:()=>0};G.match={playing:()=>true,canRespawn:()=>false};G.projectiles=new Projectiles(G.scene);
      class Display {constructor(a){this.actor=a;this.root=new THREE.Group();}_owner(){return this.actor;}_runner(){return this.actor.weaponRunner;}trigger(){}setVisible(){}setHurt(){}setWeapon(){}getMuzzle(out){return out.copy(this.actor.pos).add(new THREE.Vector3(0,1.05,0));}}
      const make=weapon=>{const a=new Actor({team:0,name:'probe',weapon,CharacterClass:Display});a.character.actor=a;a.isLocal=true;a.grounded=true;a.ink=100;a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,100);return a;};
      const traces=[];
      for(const hz of [30,60,120]){
        const a=make('charger'),r=a.weaponRunner,clock=new FixedClock(),rows=[];a.intent.fire=true;a.grounded=false;r.s3ChargerRepeat=true;
        for(let i=0;i<hz*3;i++)clock.advance(1/hz,dt=>{G.time+=dt;r._charger(dt,{fire:true},a.weapon);rows.push([r.charge,r.chargeT,a.ink]);});
        near(rows[7][0],8/60);near(rows[7][2],97.75);check(rows[162][0]<1&&rows[163][0]===1,'air completion boundary');check(rows.every(x=>x[0]===x[1]),'linear charge');traces.push(rows);
      }
      check(JSON.stringify(traces[0])===JSON.stringify(traces[1])&&JSON.stringify(traces[1])===JSON.stringify(traces[2]),'cadence');
      const spin=make('splatling');spin.grounded=false;const oldRandom=Math.random,draws=[.5,1-1e-12,.25,.5];Math.random=()=>draws.shift()??.5;
      try{G.projectiles.fireSplatling(spin,spin.weapon,7);}finally{Math.random=oldRandom;}
      const round=G.projectiles.list.at(-1);near(Math.atan2(Math.abs(round.vel.y),Math.hypot(round.vel.x,round.vel.z))*180/Math.PI,1.6);G.projectiles.clear();
      const slosh=make('slosher');slosh.pos.y=20;slosh.aimDir.set(0,-Math.sqrt(3)/2,.5);G.projectiles.fireSlosh(slosh,slosh.weapon);const p=G.projectiles.list[0];
      fidelity.advanceFidelityProjectile(p,1/60);fidelity.advanceFidelityProjectile(p,1/60);check(p.start.y-p.pos.y>2,'straight descent');near(fidelity.fidelityDamage(p,p.pos),70);G.projectiles.clear();
      const body=make('shooter');body.team=1;body.invuln=0;G.actors=[body];
      const q={prev:new THREE.Vector3(-2,.675,.5),pos:new THREE.Vector3(2,.675,.5),owner:slosh,team:0,wid:'shooter',size:0,age:.1};
      body.form='kid';check(fidelity.fidelityProjectileTargets(G.projectiles,q).length===0,'humanoid graze');body.form='squid';check(fidelity.fidelityProjectileTargets(G.projectiles,q).length===1,'swim graze');
      // Use one software canvas backend for the pixel oracle. Readback can
      // otherwise switch only one context from GPU rasterization mid-test.
      const getContext=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(kind,opts){return getContext.call(this,kind,kind==='2d'?{...opts,willReadFrequently:true}:opts);};
      const {createMuralTexture}=await import('/src/world/murals.js'),{createMuralTexture:original}=await import('/src/world/original-murals.js');
      const atlas=await createMuralTexture('tidewater'),baseline=await original('tidewater');
      const hash=(canvas,height=canvas.height)=>{const data=canvas.getContext('2d').getImageData(0,0,canvas.width,height).data;let h=2166136261;for(const byte of data)h=Math.imul(h^byte,16777619);return h>>>0;};
      const pixelDiff=(a,b,height)=>{
        const x=a.getContext('2d').getImageData(0,0,a.width,height).data,y=b.getContext('2d').getImageData(0,0,b.width,height).data;
        let pixels=0;for(let i=0;i<x.length;i+=4)if(x[i]!==y[i]||x[i+1]!==y[i+1]||x[i+2]!==y[i+2]||x[i+3]!==y[i+3])pixels++;
        return pixels;
      };
      check(atlas.image.width===2048&&atlas.image.height===1024,'shared-only cold boot');
      const sharedPixelDifference=pixelDiff(atlas.image,baseline.image,1024);
      check(sharedPixelDifference===0,'original shared pixels '+sharedPixelDifference);
      const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(64,64);renderer.initTexture(atlas);check(renderer.info.memory.textures===1,'one texture');
      const sharedHash=hash(atlas.image,1024),stages=[];
      for(const stage of ['halyard','tidewater','cargo','kelpline','range','tidewater','halyard','cargo','tidewater']){
        atlas.userData.setStage(stage);baseline.userData.setStage(stage);renderer.initTexture(atlas);
        check(renderer.info.memory.textures===1,'no retained GPU allocation '+stage);check(hash(atlas.image,1024)===sharedHash,'shared pixels survived '+stage);
        if(['halyard','cargo','range'].includes(stage)){check(atlas.image.height===2048,'stage allocation '+stage);check(pixelDiff(atlas.image,baseline.image,2048)===0,'full stage pixels '+stage);check(JSON.stringify(atlas.userData.murals)===JSON.stringify(baseline.userData.murals),'stage UV placement '+stage);}
        else {check(atlas.image.height===1024,'unused stage rows '+stage);check(atlas.userData.murals.length===4,'no fallback decals '+stage);}
        stages.push([stage,atlas.image.height,renderer.info.memory.textures]);
      }
      atlas.dispose();check(renderer.info.memory.textures===0,'final GPU release');renderer.dispose();baseline.dispose();
      return {cadences:[30,60,120],airChargeFrames:164,minimumInk:2.25,pitchDegrees:1.6,straightSlosherDamage:70,swimGraze:true,stages,sharedPixelDifference,canvasBytesBefore:2048*2048*4,canvasBytesAfter:2048*1024*4};
    });
    assert.deepEqual(errors,[]);results.push({engine,...result});await browser.close();browser=null;
  }
  console.log(JSON.stringify({source:process.env.SOURCE_SHA||null,build:manifest.build.revision,results},null,2));
} finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
