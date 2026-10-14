#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
const opt=(n,d)=>{const i=process.argv.indexOf(n);return path.resolve(i<0?d:process.argv[i+1]);};
const site=opt('--site','_site'),out=opt('--out','handed-input-gallery');
fs.mkdirSync(out,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
assert.equal(manifest.contentHash,'c5adfa2fbec305be61316d72efec4fabaf4329ceb2ffdc7f826c08e5b92398f3','Exact validated build content');
for(const [file,digest]of Object.entries(manifest.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,file))),digest,file);
const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const expectedRuntime={"runtime/main-weapon-catalog.mjs": "be0adb9585e932c834a014afac136d7086f8dd325eb628766c3223b8bf88224d", "runtime/weapon-edgecases.mjs": "904659e00a9bed10d29dec2d8c889205f065a14fac22c7328c2ea7362b60e8ba"};
for(const [file,digest] of Object.entries(expectedRuntime))assert.equal(manifest.files['patch/'+file],digest,file+' tested source binding');
const prefix='/_versions/'+manifest.build.revision+'/';
assert.equal(sourceSha,'592449c22914dd2d53ab25f62df3464e8922bbcc','Exact tested diagnostic checkout required');
const ids=['s3-maneuver-short','s3-maneuver-gallon','s3-maneuver-dual','s3-maneuver-stepper','s3-maneuver-long','s3-charger-quick','s3-stringer-normal'];
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
  const profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json());
  const api=install(profile);installMainWeaponCatalogRuntime(api,profile);
  const {Actor,Character,G,Physics,Projectiles,WEAPONS,CHARACTER_TIMERS}=api;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e6eaf2');G.scene=new THREE.Scene();
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(720,600);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
  const pixels=new Uint8Array(32*16*4);for(let y=0;y<16;y++)for(let x=0;x<32;x++){const n=(y*32+x)*4,v=y<9?235:130;pixels.set([v,v,Math.min(255,v+12),255],n);}
  const sky=new THREE.DataTexture(pixels,32,16);sky.mapping=THREE.EquirectangularReflectionMapping;sky.colorSpace=THREE.SRGBColorSpace;sky.needsUpdate=true;
  const pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromEquirectangular(sky);scene.environment=env.texture;
  scene.add(new THREE.HemisphereLight(0xffffff,0x60718d,2.1));
  const key=new THREE.DirectionalLight(0xffffff,3.3);key.position.set(-2,4,3);scene.add(key);
  const camera=new THREE.PerspectiveCamera(34,720/600,.01,50);G.camera=camera;
  G.teamColors=[new THREE.Color('#ff8825'),new THREE.Color('#484ce8')];
  const floor={id:0,solid:true,grate:false,center:new THREE.Vector3(0,-.5,0),half:new THREE.Vector3(50,.5,50),axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],aabbMin:new THREE.Vector3(-50,-1,-50),aabbMax:new THREE.Vector3(50,0,50),faces:[-1,-1,-1,-1,-1,-1]};
  G.level={blocks:[floor],faces:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,o)=>{o.length=0;o.push(0);return o;}};
  G.physics=new Physics(G.level);G.paint={sample:()=>1,splat:()=>0};G.match={playing:()=>true};G.time=0;G.projectiles=new Projectiles(G.scene);
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
  function admittedSlice(list,previous,actor,team){
   if(list.length<=previous)throw Error('Notification without a newly admitted projectile');
   const admitted=list.slice(previous);
   for(const projectile of admitted)if(projectile.owner!==actor||projectile.team!==team)throw Error('New projectile owner/team does not match notifying actor');
   return admitted;
  }
  const result=[];
  for(const id of ids)for(const team of [0,1]){
   if(!WEAPONS[id])throw Error('Missing base family '+id);
   G.projectiles.clear();G.actors=[];
   const a=new Actor({team,weapon:id,isLocal:false,name:'admitted-input-gallery',CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;
   ch.actor=a;ch.onEvent=null;G.actors=[a];
   if(ch.root.parent)throw Error('Character must remain off-scene');
   let notifiedProjectiles=0;const admitted=[],trigger=ch.trigger.bind(ch);
   ch.trigger=(name,arg)=>{if(name==='shoot'||name==='charge_release'){
    const count=G.projectiles.list.length,newProjectiles=admittedSlice(G.projectiles.list,notifiedProjectiles,a,team),p=newProjectiles.at(-1);
    const admittedProjectiles=newProjectiles.map(p=>({ownerMatchesActor:p.owner===a,team:p.team,wid:p.wid,origin:p.start.toArray(),velocity:p.vel.toArray(),damage:p.damage}));notifiedProjectiles=count;
    admitted.push({name,hand:arg?.hand??null,admittedCount:admittedProjectiles.length,admittedProjectiles,projectiles:G.projectiles.list.length,origin:p.start.toArray(),velocity:p.vel.toArray(),ink:a.ink,damage:p.damage});
   }return trigger(name,arg);};
   const step=fire=>{a.intent.fire=fire;G.time+=1/60;a.update(1/60);if(ch.root.parent)throw Error('Character attached during simulation');};
   for(let i=0;i<60;i++)step(false);
   if(!a.grounded)throw Error('Native actor failed to settle');
   const paired=a.weapon.catalogRecord.family==='dualies';let frame=0;
   function capture(row){
    ch.root.updateMatrixWorld(true);const hands=nativeHands(ch.weapon,paired);
    for(const w of hands)if(w.near!==true||w.body.visible!==true||w.bodyFar.visible!==false)throw Error('Expected actual near weapon meshes');
    const snapshots=snapshotHeld(hands),group=new THREE.Group();scene.add(group);
    try{mountHeld(snapshots,group);
     const bounds=new THREE.Box3().setFromObject(group),center=bounds.getCenter(new THREE.Vector3()),span=Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
     if(!(span>0&&Number.isFinite(span)))throw Error('Invalid weapon bounds');
     camera.position.copy(center).add(new THREE.Vector3(-1,.3,.5).normalize().multiplyScalar(span*2.5));camera.lookAt(center);
     renderer.render(scene,camera);renderer.render(scene,camera);
     if(renderer.getContext().getError()!==0||renderer.info.render.triangles<=0)throw Error('Weapon-only WebGL failure');
     const clocks=[ch.tr[CHARACTER_TIMERS.T_SHOOT],ch.tr[CHARACTER_TIMERS.T_SHOOTL]];
     if(paired&&(a.weaponRunner.hand!==row.hand||a.weaponRunner.sinceHand[row.hand]!==0||!(clocks[row.hand]<clocks[1-row.hand])))throw Error('Admitted hand/clock mismatch');
     result.push({id,team,frame,...row,runnerHand:a.weaponRunner.hand,sinceHand:Array.from(a.weaponRunner.sinceHand),characterClocks:clocks,firingT:a.weaponRunner.firingT,sinceRelease:ch._wst.sinceRelease,hands:snapshots.map(({weapon,before},hand)=>({hand,pivotMatrix:before,near:weapon.near,nearMeshVisible:weapon.body.visible,farMeshVisible:weapon.bodyFar.visible})),triangles:renderer.info.render.triangles,png:renderer.domElement.toDataURL('image/png').split(',')[1]});
    }finally{restoreHeld(snapshots,group,scene,ch);}
   }
   try{
    if(paired){while(admitted.length<2&&frame<120){const n=admitted.length;step(true);if(admitted.length>n)capture(admitted.at(-1));frame++;}if(admitted.length!==2||admitted[0].hand!==1||admitted[1].hand!==0)throw Error('Missing admitted left/right pair');}
    else{while(a.weaponRunner.charge<.999&&frame++<240)step(true);if(a.weaponRunner.charge<.999||admitted.length)throw Error('Invalid input charge path');step(false);if(admitted.length!==1||admitted[0].name!=='charge_release'||ch._wst.sinceRelease>.05)throw Error('Missing admitted release');capture(admitted[0]);}
   }finally{ch.dispose();G.projectiles.clear();}
  }
  env.dispose();sky.dispose();pmrem.dispose();renderer.dispose();return result;
 },{prefix,ids});
 assert.equal(rows.length,24);assert.deepEqual(errors,[]);assert.deepEqual(networkFailures,[]);
 for(const [i,row] of rows.entries())fs.writeFileSync(path.join(out,String(i).padStart(2,'0')+'-'+row.id+'-team'+row.team+'-'+row.name+'-'+row.hand+'.png'),Buffer.from(row.png,'base64'));
 const receipt={sourceSha,contentHash:manifest.contentHash,characterRendered:false,method:'Actual Actor input to admitted projectile and native Character event; affine-safe weapon-only rendering',coverage:'Five base dualies both hands and teams; base charger/stringer admitted release; no alternate kit claim',rows:rows.map(({png,...row})=>row),errors,networkFailures};
 fs.writeFileSync(path.join(out,'input-capture-result.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
}catch(e){fs.writeFileSync(path.join(out,'capture-error.json'),JSON.stringify({sourceSha,contentHash:manifest.contentHash,error:String(e),networkFailures},null,2));throw e;}finally{await browser?.close();await new Promise(r=>server.close(r));}
