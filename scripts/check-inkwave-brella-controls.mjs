// Built-artifact WebGL evidence for the actual Brella runner and cloth model.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
const option=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];};
const site=fs.realpathSync(option('--site','_site')),out=path.resolve(option('--evidence-dir','.ci-scratch/brellas'));
fs.mkdirSync(out,{recursive:true});const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),prefix=`/_versions/${manifest.build.revision}/`;
const server=http.createServer((req,res)=>{
 if(req.url==='/brellas'){res.setHeader('content-type','text/html');res.end(`<html><head><link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body style="margin:0"></body></html>`);return;}
 const file=path.resolve(site,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(site+'/')||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('content-type',/\.(m?js)$/.test(file)?'text/javascript':file.endsWith('.json')?'application/json':'application/octet-stream');fs.createReadStream(file).pipe(res);
});
let browser;const errors=[];
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const {chromium}=await import('playwright');
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:960,height:720}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/brellas`);
 const result=await page.evaluate(async prefix=>{
  const THREE=await import('three'),{G}=await import(prefix+'src/core/ctx.js'),{install}=await import(prefix+'patches/splatoon3/runtime/install.mjs');
  const profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json()),api=install(profile);
  const {installMainWeaponCatalogRuntime}=await import(prefix+'patches/splatoon3/runtime/main-weapon-catalog.mjs');installMainWeaponCatalogRuntime(api,profile);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,4/3,.01,100);scene.background=new THREE.Color('#dae2e7');camera.position.set(3.4,2.7,6);camera.lookAt(0,1,0);
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(960,720);document.body.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff,0x637278,2.4));const light=new THREE.DirectionalLight(0xffffff,2.8);light.position.set(-3,4,3);scene.add(light);
  Object.assign(G,{scene,renderer,camera,mode:'match',settings:{quality:'high'},actors:[],time:0,match:{state:'playing',playing:()=>true},level:{blocks:[],groundHeight:()=>0},paint:{sample:()=>1,splat:()=>0},teamColors:[new THREE.Color('#ff7711'),new THREE.Color('#2255dd')]});
  G.physics={los:()=>true,segment:(_a,_b,h)=>{h.hit=false;return h;},raycast:(a,_b,_c,h)=>{h.hit=true;h.point.copy(a).setY(0);h.normal.set(0,1,0);h.distance=a.y;return h;}};
  G.projectiles=new api.Projectiles(scene);const rows=[],frames=[];
  const pixels=()=>{renderer.render(scene,camera);const gl=renderer.getContext(),p=new Uint8Array(960*720*4);gl.readPixels(0,0,960,720,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  const changes=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>10)n++;return n;};
  for(const id of ['s3-shelter-normal','s3-shelter-wide','s3-shelter-focus']){
   G.projectiles.clear();const a=new api.Actor({team:0,weapon:id,CharacterClass:api.Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;
   a.grounded=a.ground.hit=true;a._resolve=()=>{};ch.actor=a;ch.onEvent=null;G.actors=[a];scene.add(ch.root);
   const advance=(fire,press=false)=>{G.time+=1/60;a.intent.fire=fire;a.ink=100;a.weaponRunner.update(1/60,{fire,firePressed:press,sub:false});G.projectiles.update(1/60);a._finishFrame(1/60);ch.root.updateMatrixWorld(true);};
   for(let i=0;i<30;i++)advance(false);const folded=pixels();let held=null,openPixels=0;
   for(let i=0;i<180;i++){advance(true,i===0);const c=a.weaponRunner.catalogState.canopy;
    if(c?.open&&!c.launched){const opened=pixels();openPixels=Math.max(openPixels,changes(folded,opened));held=renderer.domElement.toDataURL('image/png');}
    if(scene.getObjectByName('brella-canopy:'+id))break;
   }
   const canopy=scene.getObjectByName('brella-canopy:'+id);if(!canopy)throw new Error(id+' has no launched cloth');
   for(let i=0;i<12;i++){G.time+=1/60;G.projectiles.update(1/60);}const pos=canopy.position.clone();
   ch.root.visible=false;const shown=pixels();canopy.visible=false;const hidden=pixels();const launchPixels=changes(shown,hidden);canopy.visible=true;pixels();
   frames.push({id,held,launched:renderer.domElement.toDataURL('image/png')});
   a.form='squid';a.weaponRunner.reset();G.time+=1/60;G.projectiles.update(1/60);const moved=canopy.position.distanceTo(pos)>0;
   G.projectiles.clear();rows.push({id,openPixels,launchPixels,moved,retired:!canopy.parent});ch.dispose();
  }
  renderer.dispose();return {rows,frames};
 },prefix);
 for(const r of result.rows){assert.ok(r.openPixels>100,r.id+' open cloth changes real pixels');assert.ok(r.launchPixels>100,r.id+' flight is visible');assert.equal(r.moved,true);assert.equal(r.retired,true);}
 for(const frame of result.frames)for(const phase of ['held','launched'])fs.writeFileSync(path.join(out,frame.id+'.'+phase+'.png'),Buffer.from(frame[phase].split(',')[1],'base64'));
 assert.deepEqual(errors,[]);const summary={status:'passed',contentHash:manifest.contentHash,rows:result.rows,errors,measurementKind:'built INKWAVE WebGL; Nintendo retail comparison not performed'};
 fs.writeFileSync(path.join(out,'brella-controls-result.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
