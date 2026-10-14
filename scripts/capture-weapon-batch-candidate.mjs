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
const ids=['s3-stringer-normal-02','s3-maneuver-short-02','s3-charger-quick-01','s3-slosher-double-02','shooter-01','s3-stringer-short-02'];
const modelSourcePaths=['patches/splatoon3/runtime/weapon-models/variants-bulbz-followup.mjs','patches/splatoon3/runtime/weapon-models/variants-dapple-noct-followup.mjs','patches/splatoon3/runtime/weapon-models/variants-squiffer-v4-followup.mjs','patches/splatoon3/runtime/weapon-models/hornz-dread-wringer.mjs','patches/splatoon3/runtime/weapon-models/tentatek-shell.mjs','patches/splatoon3/runtime/weapon-models/stringers.mjs'];
const modelInputs={};
for(const relative of modelSourcePaths){const digest=hash(fs.readFileSync(path.resolve(relative)));assert.equal(manifest.files['patch/'+relative.slice('patches/splatoon3/'.length)],digest,relative);modelInputs[relative]=digest;}
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.bin':'application/octet-stream'};
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/review'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><script type="importmap">'+JSON.stringify({imports:{three:prefix+'vendor/three/build/three.module.js','three/addons/':prefix+'vendor/three/jsm/'}})+'</script><body style="margin:0;background:#e6eaf2"></body>');return;}
 const file=path.resolve(site,'.'+decodeURIComponent(pathname));
 if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
const networkFailures=[];
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('requestfailed',r=>networkFailures.push({url:r.url(),error:r.failure()}));
 page.on('response',r=>{if(r.status()>=400)networkFailures.push({url:r.url(),status:r.status()});});
 await page.goto('http://127.0.0.1:'+server.address().port+'/review');
 const rows=await page.evaluate(async({prefix,ids})=>{
  const THREE=await import('three');
  const {install}=await import(prefix+'patches/splatoon3/runtime/install.mjs');
  const {installMainWeaponCatalogRuntime}=await import(prefix+'patches/splatoon3/runtime/main-weapon-catalog.mjs');
  const R=await import(prefix+'patches/splatoon3/runtime/weapon-models/registry.mjs');
  if(R.registeredWeaponVariants().length!==93||new Set(R.registeredWeaponVariants()).size!==93)throw Error('Expected 93 unique inherited variant registrations');
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
  function captureModes(baseId){
   const chargeFamily=baseId==='s3-stringer-normal'||baseId==='s3-stringer-short'||baseId==='s3-charger-quick',pairedFamily=baseId==='s3-maneuver-short';
   return {chargeFamily,pairedFamily,poseStates:chargeFamily?['rest','charge','release']:['rest'],groundStates:chargeFamily?[true,false]:[true]};
  }
  function nativeHands(w,paired){
   const hands=[],seen=new Set();
   for(let current=w;current;current=current.left){if(seen.has(current)||hands.length>=2)throw Error('Invalid native weapon chain');seen.add(current);hands.push(current);}
   if(hands.length!==(paired?2:1))throw Error('Unexpected native hand count');
   return hands;
  }
  function snapshotHeld(weapons){
   return weapons.map(weapon=>{const pivot=weapon.pivot,parent=pivot.parent;return {weapon,pivot,parent,sibling:parent.children.indexOf(pivot),before:pivot.matrixWorld.elements.slice(),local:pivot.matrix.clone(),world:pivot.matrixWorld.clone(),position:pivot.position.clone(),quaternion:pivot.quaternion.clone(),scale:pivot.scale.clone(),matrixAutoUpdate:pivot.matrixAutoUpdate,matrixWorldAutoUpdate:pivot.matrixWorldAutoUpdate,matrixWorldNeedsUpdate:pivot.matrixWorldNeedsUpdate};});
  }
  function mountHeld(snapshots,group){
   group.updateWorldMatrix(true,false);
   const inverse=group.matrixWorld.clone().invert();
   for(const s of snapshots){group.add(s.pivot);s.pivot.matrixAutoUpdate=false;s.pivot.matrixWorldAutoUpdate=true;s.pivot.matrix.copy(inverse).multiply(s.world);s.pivot.matrixWorldNeedsUpdate=true;}
   group.updateMatrixWorld(true);
   for(const {pivot,before} of snapshots)if(pivot.matrixWorld.elements.some((v,k)=>!Number.isFinite(v)||Math.abs(v-before[k])>1e-8))throw Error('Held capture changed rendered native pivot');
  }
  function restoreHeld(snapshots,group,scene,ch){
   for(const s of snapshots){
    s.parent.add(s.pivot);
    s.pivot.position.copy(s.position);s.pivot.quaternion.copy(s.quaternion);s.pivot.scale.copy(s.scale);
    s.pivot.matrix.copy(s.local);s.pivot.matrixWorld.copy(s.world);s.pivot.matrixAutoUpdate=s.matrixAutoUpdate;s.pivot.matrixWorldAutoUpdate=s.matrixWorldAutoUpdate;s.pivot.matrixWorldNeedsUpdate=s.matrixWorldNeedsUpdate;
   }
   for(const s of [...snapshots].sort((a,b)=>a.sibling-b.sibling)){const children=s.parent.children;children.splice(children.indexOf(s.pivot),1);children.splice(s.sibling,0,s.pivot);}
   scene.remove(group);ch.root.updateMatrixWorld(true);
   for(const {pivot,parent,before,local} of snapshots)if(pivot.parent!==parent||pivot.matrix.elements.some((v,k)=>!Number.isFinite(v)||Math.abs(v-local.elements[k])>1e-8)||pivot.matrixWorld.elements.some((v,k)=>!Number.isFinite(v)||Math.abs(v-before[k])>1e-8))throw Error('Held capture changed native pivot');
   for(const s of snapshots)s.pivot.matrixWorldNeedsUpdate=s.matrixWorldNeedsUpdate;
  }
  const result=[];
  for(const id of ids)for(const team of [0,1]){
   const baseId=R.weaponBaseModelId(id),variantId=R.weaponDefaultAppearance(id),spec=R.weaponVariantSpec(variantId);
   if(!WEAPONS[id]||!spec||spec.baseId!==baseId)throw Error('Missing real variant '+id);
   const actors=[baseId,id].map(weapon=>new Actor({team,weapon,isLocal:false,name:'weapon-gallery',CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}}));
   for(let i=0;i<actors.length;i++){
    const a=actors[i],ch=a.character;ch.actor=a;ch.onEvent=null;
    if(ch.root.parent)throw Error('Character unexpectedly attached to scene');
    if(ch.weaponModel!==baseId||ch.weapon.def.modelId!==baseId)throw Error('Base pose identity changed '+id);
    if(i===1&&ch.weapon.def.modelVariantId!==variantId)throw Error('Variant was not selected '+id);
    if(i===0&&ch.weapon.def.modelVariantId)throw Error('Base unexpectedly has variant '+id);
   }
   const heldViews=[],heldReceipts=[];
   const {chargeFamily,pairedFamily,poseStates,groundStates}=captureModes(baseId);
   G.actors=actors;
   // Render only the native weapon pivot in its settled world transform.
   // Character body stays off-scene; reattachment must preserve the transform.
   for(let i=0;i<actors.length;i++)for(const grounded of groundStates)for(const state of poseStates){
    const a=actors[i],ch=a.character,w=ch.weapon;
    a.form='kid';a.kidT=10;a.grounded=grounded;a.ground.hit=grounded;a.intent.fire=false;a.vel.set(0,0,0);
    // Controlled presentation input, not a gameplay firing/ballistics test.
    // Use the native Actor presentation path and native release event.
    a.weaponRunner.charge=state==='rest'?0:1;a.weaponRunner.charging=state!=='rest';
    ch.lastRelease=99;
    for(let frame=0;frame<60;frame++){G.time+=1/60;a._finishFrame(1/60);}
    if(state==='release'){a.weaponRunner.charge=0;a.weaponRunner.charging=false;ch.trigger('charge_release');G.time+=1/60;a._finishFrame(1/60);}
    if(state==='charge'&&!(ch._wst.charge>.99))throw Error('Native charge state missing');
    if(state==='release'&&!(ch._wst.sinceRelease<.05))throw Error('Native release state missing');
    ch.root.updateMatrixWorld(true);
    const weapons=nativeHands(w,pairedFamily);
    const snapshots=snapshotHeld(weapons);
    const group=new THREE.Group();scene.add(group);
    try{
    mountHeld(snapshots,group);
    const bounds=new THREE.Box3().setFromObject(group),center=bounds.getCenter(new THREE.Vector3()),span=Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
    if(!(span>0&&Number.isFinite(span)))throw Error('Invalid native held bounds');
    camera.position.copy(center).add(new THREE.Vector3(-1,.3,.5).normalize().multiplyScalar(span*2.5));camera.lookAt(center);
    renderer.render(scene,camera);renderer.render(scene,camera);
    if(renderer.getContext().getError()!==0||renderer.info.render.triangles<=0)throw Error('WebGL native held');
    const view='native-'+(i?'variant':'base')+'-'+(grounded?'ground':'air')+'-'+state;
    heldViews.push({view,png:renderer.domElement.toDataURL('image/png').split(',')[1]});
    heldReceipts.push({view,grounded,state,charge:ch._wst.charge,sinceRelease:ch._wst.sinceRelease,hands:snapshots.map(({weapon,before},hand)=>({hand,muzzle:weapon.muzzle.getWorldPosition(new THREE.Vector3()).toArray(),pivotMatrix:before})),triangles:renderer.info.render.triangles});
    }finally{restoreHeld(snapshots,group,scene,ch);}
   }
   // Reset through the same presentation path before static model-space views.
   for(const a of actors){a.grounded=true;a.ground.hit=true;a.weaponRunner.charge=0;a.weaponRunner.charging=false;a.character.lastRelease=99;for(let frame=0;frame<60;frame++){G.time+=1/60;a._finishFrame(1/60);}}
   // Detach the actual native instances: retain material callbacks and every part.
   // Character bodies are never added to the rendered scene.
   const models=actors.map(a=>{const g=a.character.weapon.pivot;g.removeFromParent();a.character.weapon.off.position.set(0,0,0);a.character.weapon.off.quaternion.identity();g.updateMatrixWorld(true);return g;});
   // Static model-space frames show one native weapon; paired NOC-T acceptance
   // is the separate held capture above and includes both actual instances.
   const bounds=models.map(g=>new THREE.Box3().setFromObject(g));
   const sizes=bounds.map(b=>b.getSize(new THREE.Vector3()));
   const span=Math.max(...sizes.flatMap(s=>s.toArray()));
   if(!(span>0&&Number.isFinite(span)))throw Error('Invalid geometry bounds '+id);
   const captures=[],extraViews=[...heldViews];
   for(let i=0;i<models.length;i++){
    const g=models[i],center=bounds[i].getCenter(new THREE.Vector3());scene.add(g);
    camera.position.copy(center).add(new THREE.Vector3(-1,.3,.5).normalize().multiplyScalar(span*2.5));camera.lookAt(center);
    renderer.render(scene,camera);renderer.render(scene,camera);
    if(renderer.getContext().getError()!==0)throw Error('WebGL error '+id);
    captures.push(renderer.domElement.toDataURL('image/png').split(',')[1]);
    if(i===1){for(const [view,dir] of [['front',[0,.15,1]],['opposite',[1,.3,.5]],['rear',[0,.15,-1]],['upper',[-.6,1,.6]]]){camera.position.copy(center).add(new THREE.Vector3(...dir).normalize().multiplyScalar(span*2.5));camera.lookAt(center);renderer.render(scene,camera);renderer.render(scene,camera);if(renderer.getContext().getError()!==0)throw Error('WebGL '+view);extraViews.push({view,png:renderer.domElement.toDataURL('image/png').split(',')[1]});}}
    scene.remove(g);
   }
   result.push({id:team?id+'-blue':id,sourceId:id,team,baseId,variantId,name:WEAPONS[id].referenceNames?.en||WEAPONS[id].name,baseName:WEAPONS[baseId].referenceNames?.en||WEAPONS[baseId].name,basePng:captures[0],variantPng:captures[1],extraViews,heldReceipts,chargeFamily,pairedFamily,baseSize:sizes[0].toArray(),variantSize:sizes[1].toArray()});
   for(const a of actors)a.character.dispose();
  }
  env.dispose();sky.dispose();pmrem.dispose();renderer.dispose();return result;
 },{prefix,ids});
 assert.equal(rows.length,ids.length*2);assert.deepEqual(errors,[]);assert.deepEqual(networkFailures,[]);
 for(const row of rows){const held=row.chargeFamily?12:2;assert.equal(row.heldReceipts.length,held);assert.equal(row.extraViews.length,held+4);for(const receipt of row.heldReceipts)assert.equal(receipt.hands.length,row.pairedFamily?2:1);}
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const css='*{box-sizing:border-box}body{margin:0;padding:24px;background:#101922;color:#edf2f5;font:16px Arial,sans-serif}h1{font-size:26px;margin:0 0 8px}p{color:#b9c9d5;margin:0 0 20px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}.card{background:#1b2935;border:1px solid #3b4d5c;border-radius:12px;padding:16px;break-inside:avoid}h2{font-size:20px;margin:0 0 12px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}figure{margin:0}figcaption{font-size:15px;font-weight:bold;margin-bottom:8px}img{display:block;width:100%;border-radius:7px}small{display:block;color:#b9c9d5;margin-top:10px;font-size:12px}.single .grid{grid-template-columns:1fr}';
 const card=(r,data)=>'<section class="card"><h2>'+esc(r.name)+'</h2><div class="pair"><figure><figcaption>BASE · '+esc(r.baseName)+'</figcaption><img src="'+(data?'data:image/png;base64,'+r.basePng:r.id+'-base.png')+'"></figure><figure><figcaption>VARIANT · '+esc(r.name)+'</figcaption><img src="'+(data?'data:image/png;base64,'+r.variantPng:r.id+'-variant.png')+'"></figure></div><small>'+esc(r.baseId+' → '+r.variantId)+'</small></section>';
 const html=(items,data,single=false)=>'<!doctype html><meta charset="utf-8"><title>INKWAVE weapon variants</title><style>'+css+'</style><body class="'+(single?'single':'')+'"><h1>INKWAVE · Multi-family diagnostic candidates</h1><p>Production shaders; model-space view; identical lighting and per-pair physical scale · Orange / blue team ink · Build '+manifest.contentHash.slice(0,12)+'</p><main class="grid">'+items.map(r=>card(r,data)).join('')+'</main></body>';
 for(const row of rows){
  for(const v of row.extraViews)fs.writeFileSync(path.join(out,row.id+'-'+v.view+'.png'),Buffer.from(v.png,'base64'));
  fs.writeFileSync(path.join(out,row.id+'-base.png'),Buffer.from(row.basePng,'base64'));
  fs.writeFileSync(path.join(out,row.id+'-variant.png'),Buffer.from(row.variantPng,'base64'));
  await page.setContent(html([row],true,true));await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
  await page.screenshot({path:path.join(out,row.id+'-comparison.png'),fullPage:true});
 }
 await page.setContent(html(rows,true));await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
 await page.screenshot({path:path.join(out,'weapon-variants-overview.png'),fullPage:true});
 fs.writeFileSync(path.join(out,'index.html'),html(rows,false));
 const receipt={sourceSha,modelInputs,contentHash:manifest.contentHash,renderer:'Chromium SwiftShader; actual native weapon.pivot instances; original production materials and callbacks',characterRendered:false,presentationTransform:'Native off group reset to identity for model-space comparison only; geometry and shaders unchanged',teamColors:['#ff8825','#484ce8'],heldMethod:'Controlled runner charge plus native Actor._finishFrame and Character charge_release event; not gameplay/ballistics acceptance',retailFiringColorVerified:false,rows:rows.map(({basePng,variantPng,extraViews,...r})=>({...r,extraViews:extraViews.map(x=>x.view)})),errors};
 fs.writeFileSync(path.join(out,'gallery-result.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
}catch(e){fs.writeFileSync(path.join(out,'capture-error.json'),JSON.stringify({sourceSha,contentHash:manifest.contentHash,error:String(e),networkFailures},null,2));throw e;}finally{await browser?.close();await new Promise(r=>server.close(r));}
