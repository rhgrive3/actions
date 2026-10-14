#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
const opt=(n,d)=>{const i=process.argv.indexOf(n);return path.resolve(i<0?d:process.argv[i+1]);};
const site=opt('--site','_site'),out=opt('--out','variant-gallery');
fs.mkdirSync(out,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
for(const [file,digest]of Object.entries(manifest.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,file))),digest,file);
const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const prefix='/_versions/'+manifest.build.revision+'/';
const ids=['shooter-01','s3-slosher-double-02','s3-stringer-short-02'];
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.bin':'application/octet-stream'};
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/review'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><script type="importmap">'+JSON.stringify({imports:{three:prefix+'vendor/three/build/three.module.js','three/addons/':prefix+'vendor/three/jsm/'}})+'</script><body style="margin:0;background:#e6eaf2"></body>');return;}
 const file=path.resolve(site,'.'+decodeURIComponent(pathname));
 if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:'+server.address().port+'/review');
 const rows=await page.evaluate(async({prefix,ids})=>{
  const THREE=await import('three');
  const {install}=await import(prefix+'patches/splatoon3/runtime/install.mjs');
  const {installMainWeaponCatalogRuntime}=await import(prefix+'patches/splatoon3/runtime/main-weapon-catalog.mjs');
  const R=await import(prefix+'patches/splatoon3/runtime/weapon-models/registry.mjs');
  const profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json());
  const api=install(profile);installMainWeaponCatalogRuntime(api,profile);
  const {Actor,Character,G,Physics,WEAPONS}=api;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e6eaf2');G.scene=scene;
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(720,600);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
  const pixels=new Uint8Array(32*16*4);for(let y=0;y<16;y++)for(let x=0;x<32;x++){const n=(y*32+x)*4,v=y<9?235:130;pixels.set([v,v,Math.min(255,v+12),255],n);}
  const sky=new THREE.DataTexture(pixels,32,16);sky.mapping=THREE.EquirectangularReflectionMapping;sky.colorSpace=THREE.SRGBColorSpace;sky.needsUpdate=true;
  const pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromEquirectangular(sky);scene.environment=env.texture;
  scene.add(new THREE.HemisphereLight(0xffffff,0x60718d,2.1));
  const key=new THREE.DirectionalLight(0xffffff,3.3);key.position.set(-2,4,3);scene.add(key);
  const camera=new THREE.PerspectiveCamera(34,720/600,.01,50);G.camera=camera;
  G.teamColors=[new THREE.Color('#ff8825'),new THREE.Color('#484ce8')];
  G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,o)=>{o.length=0;return o;}};
  G.physics=new Physics(G.level);G.paint={sample:()=>1,splat:()=>0};G.match={playing:()=>true};G.time=0;
  G.projectiles=Object.fromEntries(['fireShooter','fireDualies','fireBlaster','fireSlosh','fireFlick','fireCharger','fireSplatling','throwBomb'].map(n=>[n,()=>{}]));
  const result=[];
  for(const id of ids){
   const baseId=R.weaponBaseModelId(id),variantId=R.weaponDefaultAppearance(id),spec=R.weaponVariantSpec(variantId);
   if(!WEAPONS[id]||!spec||spec.baseId!==baseId)throw Error('Missing real variant '+id);
   const actors=[baseId,id].map(weapon=>new Actor({team:0,weapon,isLocal:false,name:'weapon-gallery',CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}}));
   for(let i=0;i<actors.length;i++){
    const a=actors[i],ch=a.character;ch.actor=a;ch.onEvent=null;
    if(ch.root.parent)throw Error('Character unexpectedly attached to scene');
    if(ch.weaponModel!==baseId||ch.weapon.def.modelId!==baseId)throw Error('Base pose identity changed '+id);
    if(i===1&&ch.weapon.def.modelVariantId!==variantId)throw Error('Variant was not selected '+id);
    if(i===0&&ch.weapon.def.modelVariantId)throw Error('Base unexpectedly has variant '+id);
   }
   // Detach the actual native instances: retain material callbacks and every part.
   // Character bodies are never added to the rendered scene.
   const models=actors.map(a=>{const g=a.character.weapon.pivot;g.removeFromParent();a.character.weapon.off.position.set(0,0,0);a.character.weapon.off.quaternion.identity();g.updateMatrixWorld(true);return g;});
   const bounds=models.map(g=>new THREE.Box3().setFromObject(g));
   const sizes=bounds.map(b=>b.getSize(new THREE.Vector3()));
   const span=Math.max(...sizes.flatMap(s=>s.toArray()));
   if(!(span>0&&Number.isFinite(span)))throw Error('Invalid geometry bounds '+id);
   const captures=[];
   for(let i=0;i<models.length;i++){
    const g=models[i],center=bounds[i].getCenter(new THREE.Vector3());scene.add(g);
    camera.position.copy(center).add(new THREE.Vector3(-1,.3,.5).normalize().multiplyScalar(span*2.5));camera.lookAt(center);
    renderer.render(scene,camera);renderer.render(scene,camera);
    if(renderer.getContext().getError()!==0)throw Error('WebGL error '+id);
    captures.push(renderer.domElement.toDataURL('image/png').split(',')[1]);scene.remove(g);
   }
   result.push({id,baseId,variantId,name:WEAPONS[id].referenceNames?.en||WEAPONS[id].name,baseName:WEAPONS[baseId].referenceNames?.en||WEAPONS[baseId].name,basePng:captures[0],variantPng:captures[1],baseSize:sizes[0].toArray(),variantSize:sizes[1].toArray()});
   for(const a of actors)a.character.dispose();
  }
  env.dispose();sky.dispose();pmrem.dispose();renderer.dispose();return result;
 },{prefix,ids});
 assert.equal(rows.length,ids.length);assert.deepEqual(errors,[]);
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const css='*{box-sizing:border-box}body{margin:0;padding:24px;background:#101922;color:#edf2f5;font:16px Arial,sans-serif}h1{font-size:26px;margin:0 0 8px}p{color:#b9c9d5;margin:0 0 20px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}.card{background:#1b2935;border:1px solid #3b4d5c;border-radius:12px;padding:16px;break-inside:avoid}h2{font-size:20px;margin:0 0 12px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}figure{margin:0}figcaption{font-size:15px;font-weight:bold;margin-bottom:8px}img{display:block;width:100%;border-radius:7px}small{display:block;color:#b9c9d5;margin-top:10px;font-size:12px}.single .grid{grid-template-columns:1fr}';
 const card=(r,data)=>'<section class="card"><h2>'+esc(r.name)+'</h2><div class="pair"><figure><figcaption>BASE · '+esc(r.baseName)+'</figcaption><img src="'+(data?'data:image/png;base64,'+r.basePng:r.id+'-base.png')+'"></figure><figure><figcaption>VARIANT · '+esc(r.name)+'</figcaption><img src="'+(data?'data:image/png;base64,'+r.variantPng:r.id+'-variant.png')+'"></figure></div><small>'+esc(r.baseId+' → '+r.variantId)+'</small></section>';
 const html=(items,data,single=false)=>'<!doctype html><meta charset="utf-8"><title>INKWAVE weapon variants</title><style>'+css+'</style><body class="'+(single?'single':'')+'"><h1>INKWAVE · Shape correction candidate</h1><p>Production shaders; model-space view; identical lighting and per-pair physical scale · Orange team ink · Build '+manifest.contentHash.slice(0,12)+'</p><main class="grid">'+items.map(r=>card(r,data)).join('')+'</main></body>';
 for(const row of rows){
  fs.writeFileSync(path.join(out,row.id+'-base.png'),Buffer.from(row.basePng,'base64'));
  fs.writeFileSync(path.join(out,row.id+'-variant.png'),Buffer.from(row.variantPng,'base64'));
  await page.setContent(html([row],true,true));await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
  await page.screenshot({path:path.join(out,row.id+'-comparison.png'),fullPage:true});
 }
 await page.setContent(html(rows,true));await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
 await page.screenshot({path:path.join(out,'weapon-variants-overview.png'),fullPage:true});
 fs.writeFileSync(path.join(out,'index.html'),html(rows,false));
 const receipt={sourceSha,contentHash:manifest.contentHash,renderer:'Chromium SwiftShader; actual native weapon.pivot instances; original production materials and callbacks',characterRendered:false,presentationTransform:'Native off group reset to identity for model-space comparison only; geometry and shaders unchanged',teamColors:['#ff8825','#484ce8'],rows:rows.map(({basePng,variantPng,...r})=>r),errors};
 fs.writeFileSync(path.join(out,'gallery-result.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
