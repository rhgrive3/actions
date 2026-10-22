#!/usr/bin/env node
// Emitted Chromium/WebGL lifecycle checks; this is not a physical-device FPS benchmark.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const site=path.resolve(process.argv[2] || '_site');
const evidence=path.resolve(process.argv[3] || '.browser-evidence/issue-batch.json');
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
for(const [file,expected] of Object.entries(manifest.artifacts)){
 const actual=createHash('sha256').update(fs.readFileSync(path.join(site,file))).digest('hex');
 if(actual!==expected)throw Error('Artifact mismatch: '+file);
}
const server=http.createServer((req,res)=>{
 if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
 if(new URL(req.url,'http://localhost').pathname==='/probe'){res.setHeader('content-type','text/html');res.end('<!doctype html><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>');return;}
 const file=path.resolve(site,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(site+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('content-type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.json')?'application/json':'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:320,height:240}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.goto(`http://127.0.0.1:${server.address().port}/probe?shadercheck`);
 const result=await page.evaluate(async()=>{
  const check=(value,message)=>{if(!value)throw Error(message);};
  const THREE=await import('three'),{G}=await import('/src/core/ctx.js');
  G.mobile={touch:false,ios:false};
  const {Renderer}=await import('/src/core/renderer.js');
  const settings={quality:'low',shadows:true,bloom:false};
  const owner=new Renderer(document.body,settings),r=owner.renderer;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,4/3,.1,50);
  scene.background=new THREE.Color(.2,.3,.4);camera.position.set(0,2,5);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:0x90a0b0})));
  owner.setScene(scene,camera);owner.render();owner.setDynamicScale(.8);
  const comp=owner.composer,scale=owner.dynScale;
  for(let i=0;i<20;i++){
   owner.applySettings({...settings,shadows:i%2===1});owner.render();
   check(owner.composer===comp,'shadow toggle replaced composer');check(owner.dynScale===scale,'shadow toggle changed dynamic scale');
  }
  const {LobbySet}=await import('/src/game/lobbySet.js');
  const h=Object.create(LobbySet.prototype);
  h.Q={refl:.5};h.quality='high';
  h.ground=new THREE.Object3D();h.steam=new THREE.Object3D();h.curbs=new THREE.Object3D();
  const refl={tex:{value:null},on:{value:0},mat:{value:new THREE.Matrix4()},res:{value:new THREE.Vector2()}};
  h.mats={ground:{userData:{refl}}};
  h.lights={key:{shadow:{mapSize:new THREE.Vector2(2048,2048),map:null}},vend:{},sweep:{}};
  h._reflection();
  const baseTextures=r.info.memory.textures;
  let maxTextures=0;
  for(let i=0;i<20;i++){
   const target=h._rRT;
   h.ground.onBeforeRender(r,scene,camera);
   check(refl.on.value===1,'reflection never completed');check(r.getRenderTarget()===null,'reflection did not restore default target');
   check(target.texture.type===THREE.HalfFloatType,'reflection lost HDR');
   maxTextures=Math.max(maxTextures,r.info.memory.textures);
   h.setQuality('low');
   check(h._rRT===null&&refl.tex.value===null&&refl.on.value===0,'LOW retains reflection target');
   check(r.info.memory.textures===baseTextures,'LOW leaked GPU texture');
   h.setQuality(i%2?'medium':'high');check(h._rRT!==target,'higher quality revived disposed target');
  }
  h.setQuality('low');
  const {Input}=await import('/src/core/input.js');
  const targets=[window,document],native=targets.map(t=>({add:t.addEventListener,remove:t.removeEventListener}));
  const live=new Set();let adds=0,removes=0;
  targets.forEach((target,i)=>{
   target.addEventListener=function(type,cb,options){adds++;live.add(cb);return native[i].add.call(this,type,cb,options);};
   target.removeEventListener=function(type,cb,options){if(live.delete(cb))removes++;return native[i].remove.call(this,type,cb,options);};
  });
  try{
   for(let i=0;i<10;i++){
    const input=new Input(r.domElement),before=adds;
    const event=new KeyboardEvent('keydown',{code:'KeyW',bubbles:true});window.dispatchEvent(event);
    check(input.down('KeyW'),'live Input lost keyboard event');
    input.disposePlatform();input.disposePlatform();
    const old=input.down('KeyW');window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',bubbles:true}));
    check(input.down('KeyW')===old,'retired Input still receives events');
    check(before===adds,'dispose unexpectedly adds listeners');
   }
  }finally{targets.forEach((t,i)=>{t.addEventListener=native[i].add;t.removeEventListener=native[i].remove;});}
  check(adds===100&&removes===100&&live.size===0,'Input listener imbalance '+JSON.stringify({adds,removes,live:live.size}));
  owner._disposeComposer();r.dispose();
  return {shadowToggles:20,reflectionCycles:20,baseTextures,maxTextures,inputReplacements:10,listenerAdds:adds,listenerRemoves:removes};
 });
 if(errors.length)throw Error(errors.join('\n'));
 fs.mkdirSync(path.dirname(evidence),{recursive:true});
 fs.writeFileSync(evidence,JSON.stringify({browser:browser.version(),contentHash:manifest.contentHash,result,errors},null,2)+'\n');
 console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
