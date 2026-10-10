#!/usr/bin/env node
// Actual emitted models, material shaders, fully loaded source motion and native
// Runner/Character. Images are visual review evidence, not retail parity scores.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import { chromium } from 'playwright';
const option=(name,other)=>{const n=process.argv.indexOf(name);return path.resolve(n<0?other:process.argv[n+1]);};
const site=option('--site','_site'),out=option('--evidence-dir','.ci-scratch/weapon-models');
fs.mkdirSync(out,{recursive:true});const identity=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(hash(JSON.stringify(identity.artifacts)),identity.contentHash,'build identity');
for(const [file,digest]of Object.entries(identity.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,file))),digest,file);
const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(process.env.SOURCE_SHA)assert.equal(sourceSha,process.env.SOURCE_SHA,'immutable source');
const prefix='/_versions/'+identity.build.revision+'/';
const server=http.createServer((req,res)=>{
  if(req.url==='/review'){
    res.setHeader('Content-Type','text/html');res.end(`<html><head><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body style="margin:0;background:#e6eaf2"></body></html>`);return;
  }
  const p=path.resolve(site,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!p.startsWith(site+'/')||!fs.existsSync(p)){res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',/\.m?js$/.test(p)?'text/javascript':p.endsWith('.json')?'application/json':'application/octet-stream');fs.createReadStream(p).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const errors=[];
try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:960,height:720}});page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:'+server.address().port+'/review');
  const data=await page.evaluate(async({prefix})=>{
    const THREE=await import('three'),{install}=await import(prefix+'patches/splatoon3/runtime/install.mjs');
    const profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json());
    const api=install(profile),{Actor,Character,G,Physics}=api;
    const {getWeaponDef,WEAPON_KINDS}=await import(prefix+'src/game/character-weapons.js');
    const {getPlasticMaterial,getInkMaterial}=await import(prefix+'src/game/character-mats.js');
    const scene=new THREE.Scene();scene.background=new THREE.Color('#e6eaf2');G.scene=scene;
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(960,720);
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
    // A studio environment is required to see the real physical metal surface
    // class; directional lights alone turn high-metalness tanks almost black.
    const pixels=new Uint8Array(32*16*4);for(let y=0;y<16;y++)for(let x=0;x<32;x++){
      const n=(y*32+x)*4,v=y<9?235:130;pixels.set([v,v,Math.min(255,v+12),255],n);
    }
    const sky=new THREE.DataTexture(pixels,32,16);sky.mapping=THREE.EquirectangularReflectionMapping;sky.colorSpace=THREE.SRGBColorSpace;sky.needsUpdate=true;
    const pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromEquirectangular(sky);scene.environment=env.texture;
    scene.add(new THREE.HemisphereLight(0xffffff,0x60718d,2.1));
    const key=new THREE.DirectionalLight(0xffffff,3.3);key.position.set(-2,4,3);scene.add(key);
    const camera=new THREE.PerspectiveCamera(34,960/720,.01,50);
    G.teamColors=[new THREE.Color('#ff8825'),new THREE.Color('#484ce8')];G.camera=camera;
    G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,o)=>{o.length=0;return o;}};
    G.physics=new Physics(G.level);G.paint={sample:()=>1,splat:()=>0};G.match={playing:()=>true};G.time=0;
    G.projectiles=Object.fromEntries(['fireShooter','fireDualies','fireBlaster','fireSlosh','fireFlick','fireCharger','fireSplatling','throwBomb'].map(n=>[n,()=>{}]));
    const shots=[],rows=[];for(const k of Object.keys(G.projectiles))G.projectiles[k]=()=>shots.push(k);
    const snap=()=>renderer.domElement.toDataURL('image/png').split(',')[1];
    for(const kind of WEAPON_KINDS){
      const d=getWeaponDef(kind),g=new THREE.Group(),body=new THREE.Mesh(d.body,getPlasticMaterial()),ink=new THREE.Mesh(d.ink,getInkMaterial(G.teamColors[0]));g.add(body,ink);
      if(d.drum){const drum=new THREE.Group();drum.position.copy(d.drumAt);drum.add(new THREE.Mesh(d.drum,getInkMaterial(G.teamColors[0])),new THREE.Mesh(d.drumCaps,getPlasticMaterial()));g.add(drum);}
      if(d.glow)g.add(new THREE.Mesh(d.glow,new THREE.MeshStandardMaterial({color:'#797d85',roughness:.3})));
      scene.add(g);g.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(g),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),span=Math.max(...size.toArray());
      camera.position.copy(center).add(new THREE.Vector3(-.9,.45,1.1).normalize().multiplyScalar(span*2.45));camera.lookAt(center);renderer.render(scene,camera);
      const modelImage=snap();scene.remove(g);
      const a=new Actor({team:0,weapon:kind,isLocal:true,name:kind,CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;
      ch.actor=a;ch.onEvent=null;a.grounded=a.ground.hit=true;G.actors=[a];scene.add(ch.root);
      if(ch._sourceMotionLoader)await ch._sourceMotionLoader;if(ch.sourceMotion?.ready)await ch.sourceMotion.ready;
      if(ch.sourceMotion?.status!=='ready')throw Error(kind+' source motion failed');
      const samples=[];let fireImage,carryImage,attackNativeFrames=0,maxGrip=0,maxIK=0;
      for(let frame=0;frame<270;frame++){
        const input={fire:frame>=90&&frame<190,sub:frame>=220&&frame<230};a.ink=100;a.intent.fire=input.fire;a.intent.sub=input.sub;
        a.grounded=!(frame>=130&&frame<145);a.aimPitch=frame>=130&&frame<145?.75:0;
        if(frame>=45&&frame<90){a.vel.set(0,0,3);a.pos.z+=3/60;}else a.vel.set(0,0,0);
        G.time+=1/60;a.weaponRunner.update(1/60,input);a._finishFrame(1/60);ch.root.updateMatrixWorld(true);ch.skeleton.update();
        if(![...ch.P].every(Number.isFinite))throw Error(kind+' nonfinite pose');
        const owner=ch.sourceMotion?.sourceUpper?'source':'native';if(input.fire&&owner==='native')attackNativeFrames++;
        let grip=0;
        const c=api.CHARACTER_CHANNELS;
        if(!ch.dual&&ch.P[c.IKL]>.99&&ch.P[c.LTW]<.001){grip=ch.weapon.off.localToWorld(d.handL.pos.clone()).distanceTo(ch.bones.handL.getWorldPosition(new THREE.Vector3()));maxGrip=Math.max(maxGrip,grip);}
        maxIK=Math.max(maxIK,...ch.ikErr);samples.push({frame,owner,grip,aim:ch.wAim});
        if([80,150].includes(frame)){
          camera.position.copy(a.pos).add(new THREE.Vector3(-1.8,1.25,3.25));camera.lookAt(a.pos.clone().add(new THREE.Vector3(0,.8,.12)));renderer.render(scene,camera);
          if(frame===80)carryImage=snap();else fireImage=snap();
        }
      }
      rows.push({kind,reference:d.referenceWeapon,size:size.toArray(),triangles:d.body.index.count/3+d.ink.index.count/3,
        modelImage,carryImage,fireImage,maxGrip,maxIK,attackNativeFrames,samples});
      scene.remove(ch.root);ch.dispose();body.material.dispose();ink.material.dispose();
    }
    env.dispose();sky.dispose();pmrem.dispose();renderer.dispose();return {rows,shots,renderer:'Chromium SwiftShader; emitted production shaders; source banks fully loaded'};
  },{prefix});
  assert.equal(data.rows.length,7);assert.deepEqual(errors,[]);
  for(const row of data.rows){
    assert.equal(row.attackNativeFrames,100,row.kind+' attack owner');assert.ok(row.maxGrip<.006,row.kind+' fully held support contact '+row.maxGrip);
    for(const key of ['modelImage','carryImage','fireImage']){fs.writeFileSync(path.join(out,row.kind+'-'+key+'.png'),Buffer.from(row[key],'base64'));delete row[key];}
  }
  const result={status:'passed',contentHash:identity.contentHash,sourceSha,...data};
  fs.writeFileSync(path.join(out,'weapon-models-result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(data.rows.map(({kind,maxGrip,maxIK,triangles,attackNativeFrames})=>({kind,maxGrip,maxIK,triangles,attackNativeFrames})),null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
