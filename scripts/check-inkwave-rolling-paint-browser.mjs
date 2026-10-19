// Real production Character, WeaponRunner, Physics and CPU paint in Chromium.
// Controlled floor, all eight rolling weapons at 30/60/120Hz; not Switch parity.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';
import {execFileSync} from 'node:child_process';
const site=path.resolve(process.argv[2]||'_site');
const reportPath=process.argv[3];
const procedural=process.argv.includes('--procedural');
const baselineIndex=process.argv.indexOf('--baseline-roller');
const baselineRoller=baselineIndex<0?null:execFileSync('git',['show',process.argv[baselineIndex+1]+':patches/splatoon3/runtime/roller.mjs']);
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/probe')return res.end('<!doctype html><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>');
  if(baselineRoller&&url.pathname==='/patches/splatoon3/runtime/roller.mjs'){
    res.setHeader('content-type','text/javascript');return res.end(baselineRoller);
  }
  const file=path.resolve(site,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  res.setHeader('content-type',file.endsWith('.json')?'application/json':file.endsWith('.png')?'image/png':'text/javascript');
  fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
  browser=await chromium.launch({headless:true,
    executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
    args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader']});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/probe`);
  const result=await page.evaluate(async({procedural})=>{
    const profile=await fetch('/patches/splatoon3/profile.json').then(r=>r.json());
    const {install}=await import('/patches/splatoon3/runtime/install.mjs');
    const api=install(profile);
    const {installMainWeaponCatalogRuntime}=await import('/patches/splatoon3/runtime/main-weapon-catalog.mjs');
    installMainWeaponCatalogRuntime(api,profile);
    const {G,THREE,Actor,Character,Projectiles,Physics,PaintSystem}=api;
    G.scene=new THREE.Scene();G.teamColors=[new THREE.Color('#f80'),new THREE.Color('#03f')];G.settings={};G.time=0;G.netm=null;
    G.match={playing:()=>true,canRespawn:()=>false};
    class CpuPaint extends PaintSystem {
      _initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};}
      dispose(){} _pushQuad(){} _drawQuads(){this.quads=0;this.dryMesh.visible=false;}
    }
    const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
    const floor=()=>{
      const face={origin:V(-50,0,-50),u:V(1,0,0),v:V(0,0,1),n:V(0,1,0),su:100,sv:100,wall:false,turf:true,paintable:true};
      const block={id:0,solid:true,grate:false,center:V(0,-1,0),half:V(50,1,50),axes:[V(1,0,0),V(0,1,0),V(0,0,1)],
        faces:[-1,-1,0,-1,-1,-1],aabbMin:V(-50,-2,-50),aabbMax:V(50,0,50)};
      G.level={faces:[face],blocks:[block],pointInside:()=>false,groundHeight:()=>0,
        queryBlocks(_x0,_z0,_x1,_z1,out=[]){out.length=0;out.push(0);return out;}};
      G.physics=new Physics(G.level);G.paint=new CpuPaint(null,G.level,{atlasSize:4096,maxDensity:30,cell:.25});
      G.projectiles=new Projectiles(G.scene);G.actors=[];
    };

    const {FixedClock}=await import('/patches/splatoon3/runtime/clock.mjs');
    const ids=['roller','s3-roller-compact','s3-roller-heavy','s3-roller-hunter','s3-roller-wide','s3-brush-mini','s3-brush-normal','s3-brush-heavy'];
    const rows=[];const saved=Math.random;Math.random=()=>.37;
    try{for(const id of ids)for(const movement of [{label:'forward',x:0,z:1},{label:'backward',x:0,z:-1},{label:'right',x:1,z:0},{label:'left',x:-1,z:0},{label:'diagonal-right',x:Math.SQRT1_2,z:Math.SQRT1_2},{label:'diagonal-left',x:-Math.SQRT1_2,z:Math.SQRT1_2},{label:'back-diagonal-right',x:Math.SQRT1_2,z:-Math.SQRT1_2},{label:'back-diagonal-left',x:-Math.SQRT1_2,z:-Math.SQRT1_2}]){let reference;
      for(const hz of [30,60,120]){
        G.projectiles?.clear();G.paint?.dispose();floor();
        const a=new Actor({team:0,weapon:id,isLocal:false,CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
        a.character.actor=a;await a.character.sourceMotion.ready;if(a.character.sourceMotion.status!=='ready')throw Error('source motion not ready: '+a.character.sourceMotion.status);if(procedural)a.character.sourceMotion.enabled=false;a.form='kid';a.grounded=true;a.ground.hit=true;a.ground.face=0;a.ink=100;
        a.pos.set(0,0,0);a.yaw=0;a.aimYaw=0;a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,100);
        a.intent.move.set(movement.x,0,movement.z);a.intent.fire=true;
        a.character.root.position.copy(a.pos);G.actors=[a];G.scene.add(a.character.root);
        const r=a.weaponRunner;r.rolling=true;r.flick=-1;r.cooldown=0;r.flickRecover=0;
        const clock=new FixedClock(),events=[],native=G.paint.splat;
        G.paint.splat=function(at,radius,team,opts={}){
          events.push({x:at.x,y:at.y,z:at.z,radius,kind:opts.kind,footprint:opts.footprint,stretchAmt:opts.stretchAmt,
            dir:opts.stretch?.toArray()});
          return native.call(this,at,radius,team,opts);
        };
        let headingSamples=0,elapsed=0,rollElapsed=0;const poseSamples=[];
        for(let frame=0;frame<hz*2.5;frame++)clock.advance(1/hz,dt=>{
          a.ink=100;G.time+=dt;elapsed+=dt;
          // _integrate runs before _face inside Actor.update; the swing that precedes
          // rolling keeps aim facing, so travel is checked from the second rolling tick.
          const movedYaw=a.yaw,wasRolling=r.rolling;
          // Real Actor -> real Physics -> real Character. FixedClock owns dt.
          a.update(dt);G.paint.advanceSimulation(dt);
          if(r.rolling){
            // Owner report 2026-10-19: rolling travel is never square to the drum.
            // The body turns toward the stick; velocity runs along the body heading.
            const speed=Math.hypot(a.vel.x,a.vel.z),heading=Math.atan2(movement.x,movement.z);
            if(Math.abs(a.character.root.rotation.y-a.yaw)>1e-7)throw Error(id+' character root left body yaw');
            if(wasRolling&&speed>.5&&Math.abs(a.vel.x*Math.cos(movedYaw)-a.vel.z*Math.sin(movedYaw))/speed>1e-6)throw Error(JSON.stringify({id,hz,direction:movement.label,lateralTravel:true}));
            if(wasRolling)rollElapsed+=dt;
            if(rollElapsed>=1-1e-9){const d=a.yaw-heading;if(Math.abs(Math.atan2(Math.sin(d),Math.cos(d)))>.002)throw Error(JSON.stringify({id,hz,direction:movement.label,yaw:a.yaw,heading}));}
            headingSamples++;
            if(elapsed>=2-1e-9){
              a.character.root.updateMatrixWorld(true);
              const mesh=a.character.weapon?.drum||a.character.weapon?.off;
              if(!mesh)throw Error(id+' missing live held weapon');
              const axis=V(1,0,0).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
              const centre=mesh.getWorldPosition(V()).sub(a.pos);
              const weapon=a.character.weapon;
              const gripL=weapon.off.localToWorld(weapon.def.handL.pos.clone()).distanceTo(a.character.bones.handL.getWorldPosition(V()));
              const gripR=weapon.off.localToWorld(weapon.def.handR.pos.clone()).distanceTo(a.character.bones.handR.getWorldPosition(V()));
              if(gripL>.02||gripR>.012)throw Error(JSON.stringify({id,hz,gripL,gripR,direction:movement.label}));
              let bottom=null;
              if(weapon.drum){
                if(Math.abs(axis.y)>.025)throw Error(JSON.stringify({id,hz,axisTilt:axis.y,direction:movement.label}));
                bottom=Infinity;weapon.drum.traverse(part=>{
                  const vertices=part.geometry?.attributes?.position;if(!vertices)return;
                  const point=V();for(let i=0;i<vertices.count;i++)bottom=Math.min(bottom,point.fromBufferAttribute(vertices,i).applyMatrix4(part.matrixWorld).y-a.pos.y);
                });
                if(bottom<-.02||bottom>.08)throw Error(JSON.stringify({id,hz,bottom,direction:movement.label}));
              }
              // Body-relative drum axis and lateral anchor: the rig must look the same in every direction.
              const cy=Math.cos(a.yaw),sy=Math.sin(a.yaw);
              poseSamples.push({yaw:Math.atan2(axis.z,axis.x)+a.yaw,x:centre.x*cy-centre.z*sy,gripL,gripR,bottom});
            }
          }
        });
        if(!events.length||!headingSamples||poseSamples.length<10||!G.paint.counts[0])throw Error(id+' missing grounded trail');
        // Literal calibrated contact envelope; no full source-size disk is allowed.
        const maxHalf=({roller:.84,'s3-roller-compact':.66,'s3-roller-heavy':1.02,'s3-roller-hunter':.78,
          's3-roller-wide':1.02,'s3-brush-mini':.15,'s3-brush-normal':.225,'s3-brush-heavy':.325})[id];
        if(id!=='roller'&&(!events.some(e=>e.footprint==='ink-contact')||events.filter(e=>e.footprint==='ink-contact').some(e=>e.radius>maxHalf+1e-10)))throw Error(id+' oversized contact stamp');
        // A camera-only turn must not steer the drum while the stick is held.
        const held=a.yaw;a.aimYaw=a.yaw+Math.PI/2;a.aimDir.set(Math.sin(a.aimYaw),0,Math.cos(a.aimYaw));
        for(let n=0;n<120;n++){a.ink=100;a.update(1/120);}
        if(Math.abs(Math.atan2(Math.sin(a.yaw-held),Math.cos(a.yaw-held)))>.001)throw Error(id+' camera steered the drum');
        const trace=JSON.stringify(events);
        if(reference&&reference!==trace)throw Error(id+' frame-rate dependent trajectory/paint');reference=trace;
        rows.push({id,hz,direction:movement.label,poseSamples,stamps:events.length,cells:G.paint.counts[0],headingSamples,maxHalf,sourceActive:a.character.sourceMotion.active,yaw:a.yaw});
        G.scene.remove(a.character.root);a.character.dispose();
      }
    }}finally{Math.random=saved;}
    for(const row of rows.filter(r=>!['forward','backward'].includes(r.direction))){
      const forward=rows.find(r=>r.id===row.id&&r.hz===row.hz&&r.direction===(row.direction.startsWith('back-')?'backward':'forward'));
      if(forward.poseSamples.length!==row.poseSamples.length)throw Error(row.id+' inconsistent settled pose window');
      let yawDelta=0,lateralDelta=0;
      row.poseSamples.forEach((p,i)=>{
        const q=forward.poseSamples[i],d=p.yaw-q.yaw;
        yawDelta=Math.max(yawDelta,Math.abs(Math.atan2(Math.sin(d),Math.cos(d))));
        lateralDelta=Math.max(lateralDelta,Math.abs(p.x-q.x));
      });
      row.maxYawDeltaDegrees=yawDelta*180/Math.PI;row.maxLateralDelta=lateralDelta;
      // Keep native body-balance translation (up to 5 cm in this rig); reject
      // a turned drum or large anchor displacement. Not Nintendo joint values.
      if(yawDelta>3*Math.PI/180||lateralDelta>.05)throw Error(JSON.stringify({id:row.id,hz:row.hz,yawDegrees:row.maxYawDeltaDegrees,lateralDelta}));
    }
    return {realCharacter:true,realPhysics:true,cpuPaint:true,hardwareParity:false,checks:rows.map(({poseSamples,...r})=>({...r,settledPoseSamples:poseSamples.length,maxGripL:Math.max(...poseSamples.map(p=>p.gripL)),maxGripR:Math.max(...poseSamples.map(p=>p.gripR)),minBottom:poseSamples[0].bottom==null?null:Math.min(...poseSamples.map(p=>p.bottom)),maxBottom:poseSamples[0].bottom==null?null:Math.max(...poseSamples.map(p=>p.bottom))}))};
  },{procedural});
  if(errors.length)throw Error(errors.join('\n'));
  const report={procedural,build:build.contentHash,browser:browser.version(),baselineRoller:baselineIndex<0?null:process.argv[baselineIndex+1],...result,errors};
  if(reportPath){fs.mkdirSync(path.dirname(path.resolve(reportPath)),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({cases:result.checks.length,realCharacter:true,realPhysics:true,errors}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
