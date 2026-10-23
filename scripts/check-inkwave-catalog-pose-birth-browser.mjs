#!/usr/bin/env node
// Actual source-loaded Character/Actor/Projectiles and WebGL proof for #1431.
// Reads an immutable production build; no runtime or reference-asset overlay.
// This measures INKWAVE's presentation/physics relationship, not S3 retail parity.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const site=path.resolve(option('--site','.built-site/issue-resolution-final'));
const out=path.resolve(option('--evidence-dir','.browser-evidence/catalog-pose-birth'));
const plan={ids:option('--ids','s3-maneuver-stepper,s3-slosher-washtub').split(','),rates:option('--rates','30,60,120').split(',').map(Number),pitches:option('--pitches','-45,0,40').split(',').map(Number),walls:option('--walls','open,wall').split(','),swing:option('--swing','horizontal'),reticle:option('--reticle','aligned'),renderPolicy:option('--render-policy','full'),stage:option('--stage','synthetic')};
const allowedIds=['s3-maneuver-stepper','s3-slosher-washtub','roller','s3-roller-compact','s3-roller-heavy','s3-roller-hunter','s3-roller-wide','s3-brush-mini','s3-brush-normal','s3-brush-heavy'];
for(const [key,allowed]of Object.entries({ids:allowedIds,rates:[30,60,120],pitches:[-45,0,40],walls:['open','wall']}))assert(plan[key].length&&plan[key].every(v=>allowed.includes(v)),'unsupported '+key);
assert(['horizontal','vertical'].includes(plan.swing),'unsupported swing');
assert(['aligned','stale','close-ground'].includes(plan.reticle),'unsupported reticle');
assert(['full','diagnostic'].includes(plan.renderPolicy),'unsupported render policy');
assert(['synthetic','tidewater'].includes(plan.stage),'unsupported stage');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const manifestBytes=fs.readFileSync(path.join(site,'inkwave-build.json'));
const manifest=JSON.parse(manifestBytes);
assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
assert.equal(hash(JSON.stringify(manifest.files)),manifest.inputHash);
fs.mkdirSync(out,{recursive:true});
const served={},errors=[],requestsFailed=[];
const server=http.createServer((req,res)=>{
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/probe'){
      res.writeHead(200,{'content-type':'text/html'});
      res.end('<!doctype html><style>body{margin:0;background:#ddd}</style><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>');return;
    }
    const relative=decodeURIComponent(pathname).slice(1),file=path.resolve(site,relative);
    assert(file.startsWith(site+path.sep));
    const bytes=fs.readFileSync(file),actual=hash(bytes);
    assert.equal(actual,manifest.artifacts[relative],'unbound build artifact '+relative);
    served[relative]=actual;
    res.writeHead(200,{'content-type':/\.m?js$/.test(file)?'text/javascript':file.endsWith('.json')?'application/json':'application/octet-stream','cache-control':'no-store'});res.end(bytes);
  }catch(error){res.writeHead(404);res.end(String(error.message));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const result={status:'running',scriptSha256:hash(fs.readFileSync(new URL(import.meta.url))),contentHash:manifest.contentHash,inputHash:manifest.inputHash,manifestSha256:hash(manifestBytes),served,errors,requestsFailed,
  plan,
  scope:'real source-loaded Character, actual Actor.update/WeaponRunner/Projectiles/Physics and WebGL; terrain='+plan.stage,
  limits:['Diagnostic render policy draws only initial/first/steady/final images; it does not establish every-frame WebGL cadence or performance.','Chromium uses ANGLE SwiftShader software rendering; no hardware GPU performance is claimed.','Existing shipped source-motion bank is not a verified S3 11.3.0 animation bank.','Tidewater uses unchanged published MAP_LAYOUTS collision and Level.buildGeometry, with a plain diagnostic material; synthetic mode uses a controlled floor/OBB. Neither is a native Nintendo stage.','Controlled lighting has no production sky/postprocessing; this is not material fidelity acceptance.','Paint sample/splat are sinks; actual Actor, projectile physics, source animation, FX and WebGL are retained.','The physical birth is intentionally not relocated; a remaining physical-versus-drawn socket gap is reported.','Samples are captured at each fixed-tick birth; later render frames may contain legitimate detached projectiles.','No hardware/iPad/Safari or Nintendo comparison is claimed.'],cases:[]};
try{
  const temp=path.resolve('.browser-cache/catalog-pose-tmp');fs.mkdirSync(temp,{recursive:true});
  browser=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,env:{...process.env,TMPDIR:temp},...(process.env.INKWAVE_CHROMIUM?{executablePath:process.env.INKWAVE_CHROMIUM}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:512,height:512}});
  const cdp=await browser.newCDPSession(page);result.browser=(await cdp.send('Browser.getVersion')).product;await cdp.detach();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('requestfailed',req=>requestsFailed.push({url:req.url(),failure:req.failure()?.errorText}));
  await page.goto(`http://127.0.0.1:${server.address().port}/probe`);
  await page.evaluate(async()=>{
    const THREE=await import('three'),{install}=await import('/patches/splatoon3/runtime/install.mjs');
    const profile=await fetch('/patches/splatoon3/profile.json').then(r=>r.json()),api=install(profile);
    const {installMainWeaponCatalogRuntime}=await import('/patches/splatoon3/runtime/main-weapon-catalog.mjs');
    const {installWeaponsFidelity,shotTailFrames}=await import('/patches/splatoon3/runtime/weapons-fidelity.mjs');
    const {FixedClock}=await import('/patches/splatoon3/runtime/clock.mjs');
    const {Level}=await import('/src/world/level.js');
    installWeaponsFidelity(api,profile);installMainWeaponCatalogRuntime(api,profile);
    const {DEFAULT_SETTINGS}=await import('/src/config.js');
    const {G}=api,renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.setSize(512,512);renderer.setClearColor(0xe5e6ec);document.body.append(renderer.domElement);
    const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x556677,2));
    const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-3,4,2);scene.add(sun);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshStandardMaterial({color:0xb9bdc8,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.002;scene.add(floor);
    const camera=new THREE.PerspectiveCamera(38,1,.01,100);camera.position.set(-2.7,1.5,-.7);camera.lookAt(0,.8,.2);
    G.scene=scene;G.camera=camera;G.settings={...DEFAULT_SETTINGS};G.teamColors=[new THREE.Color('#ff8725'),new THREE.Color('#4048db')];
    G.paint={sample:()=>0,splat:()=>0};G.netm=null;G.match={playing:()=>true,canRespawn:()=>false,state:'playing',opts:{range:true}};
    G.fx=new api.FX(scene,{quality:'low'});
    if(!await G.fx.inkVolumeReady||G.fx.inkVolumes?.isInkVolumes!==true)throw Error('shipped source volume packs must be ready, as on ordinary boot');
    const volumeFrame={submissions:[],checked:0,allPartsVisible:0,maxBackError:0,maxRodError:0},engine=G.fx.inkVolumes;
    const nativeBegin=engine.begin,nativeSubmit=engine.submitComposite;
    engine.begin=function(...args){volumeFrame.submissions.length=0;return nativeBegin.apply(this,args);};
    engine.submitComposite=function(p,parts){
      const accepted=nativeSubmit.call(this,p,parts);
      if(!accepted||p.owner!==G.match.local||p.catalog?.r.id!=='s3-maneuver-stepper'||parts.length!==3)return accepted;
      // Read the actual shared native-volume instance buffers after submission.
      // Head/back share a batch; calculate each write's real instance index.
      const counts=new Map();for(let i=0;i<parts.length;i++){const plan=this.plans[i];if(!plan.culled)counts.set(plan.batch,(counts.get(plan.batch)||0)+1);}
      const seen=new Map(),matrices=[];
      for(let i=0;i<parts.length;i++){
        const plan=this.plans[i];if(plan.culled){matrices.push(null);continue;}
        const n=seen.get(plan.batch)||0,index=plan.batch.n-counts.get(plan.batch)+n,m=new THREE.Matrix4();seen.set(plan.batch,n+1);
        plan.batch.mesh.getMatrixAt(index,m);matrices.push(Array.from(m.elements));
      }
      const o=p._s3PoseBirthOffset,sourceFrames=p.catalog.r.parameters.spl__BulletShooterTailLengthParam?.MaxLengthFrame;
      const frames=Number.isFinite(sourceFrames)&&sourceFrames>0?sourceFrames:shotTailFrames(p);
      const attached=!!o&&o.seed===p.seed&&p.start.distanceTo(p.pos)<=p.vel.length()*frames/60;
      const visibility=matrices.map(Boolean);let backError=null,rodError=null,headError=null,connection=null;
      if(visibility.every(Boolean))volumeFrame.allPartsVisible++;
      if(attached&&matrices[1]&&matrices[2]){
        connection=[p.start.x+o.x,p.start.y+o.y,p.start.z+o.z];
        const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
        backError=distance(matrices[1].slice(12,15),connection);
        const rod=matrices[2],half=this.assets.get(parts[2].name).patterns[0].aspect/2;
        const endpoints=[-1,1].map(sign=>rod.slice(12,15).map((v,i)=>v+sign*rod[i]*half));
        rodError=Math.min(...endpoints.map(x=>distance(x,connection)));
        if(matrices[0]){headError=distance(matrices[0].slice(12,15),p.pos.toArray());if(headError>2e-5)throw Error('native Quad visible head left its physical centre');}
        if(backError>2e-5||rodError>2e-5)throw Error('native Quad volume misses its posed birth '+JSON.stringify({backError,rodError,age:p.age}));
        volumeFrame.checked++;volumeFrame.maxBackError=Math.max(volumeFrame.maxBackError,backError);volumeFrame.maxRodError=Math.max(volumeFrame.maxRodError,rodError);
      }
      volumeFrame.submissions.push({age:p.age,seed:p.seed,physical:p.pos.toArray(),physicalBirth:p.start.toArray(),attached,connection,visibility,headError,backError,rodError,matrices});
      return accepted;
    };
    const muzzle=[];const nativeMuzzle=G.fx.muzzle;G.fx.muzzle=function(pos,dir,...args){muzzle.push({pos:pos.toArray(),dir:dir.toArray(),time:G.time});return nativeMuzzle.call(this,pos,dir,...args);};
    G.projectiles=new api.Projectiles(scene);
    const acquired=[],nativeNew=G.projectiles._new;G.projectiles._new=function(...args){const p=nativeNew.apply(this,args);acquired.push(p);return p;};
    const gl=renderer.getContext();
    window.probe={THREE,api,FixedClock,Level,G,renderer,scene,camera,muzzle,acquired,volumeFrame,volumeAssets:Array.from(engine.assets.keys()),webgl:{version:gl.getParameter(gl.VERSION),renderer:gl.getParameter(gl.RENDERER)}};
  });
  result.webgl=await page.evaluate(()=>window.probe.webgl);
  result.volumeAssets=await page.evaluate(()=>window.probe.volumeAssets);
  for(const id of plan.ids)for(const hz of plan.rates)for(const pitch of plan.pitches)for(const wallMode of plan.walls){
    const wall=wallMode==='wall';
    const row=await page.evaluate(async({id,hz,pitch,wall,swing,reticle,renderPolicy,stage})=>{
      const {THREE,api,FixedClock,Level,G,renderer,scene,camera,muzzle,acquired,volumeFrame}=window.probe;
      const {Actor,Character,Physics}=api,caseStart=performance.now(),nativeRandom=Math.random;
      // Separate pose/camera ownership from stochastic fan-speed/spread noise.
      // No statistical spread equivalence is claimed by this diagnostic.
      Math.random=()=>.5;
      const timing={};
      let actorOrigin=[0,0,0];
      if(stage==='tidewater'){
        if(!window.probe.tidewater){
          const {MAP_LAYOUTS}=await import('/src/world/maps.js'),level=new Level(MAP_LAYOUTS.tidewater);
          const mesh=new THREE.Mesh(level.buildGeometry(1024),new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));scene.add(mesh);
          window.probe.tidewater={level,mesh};
        }
        G.level=window.probe.tidewater.level;
        // Open main deck, or 0.72 WU in front of the existing central tower.
        // Stage layout and collider geometry are never translated or edited.
        actorOrigin=[0,0,wall?-5.72:-20];
        const ground=G.level.groundHeight(actorOrigin[0],actorOrigin[2],.1);
        if(Math.abs(ground)>1e-8)throw Error('Tidewater diagnostic origin lacks actual deck support: '+ground);
      }else G.level=new Level({bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},spawnPads:[[-15,0,-15],[15,0,15]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-20,-1,-20],max:[20,0,20]},...(wall?[{kind:'box',min:[-4,0,.72],max:[4,2,.88]}]:[])]});
      const stageMesh=window.probe.tidewater?.mesh;if(stageMesh)stageMesh.visible=stage==='tidewater';
      const floor=scene.children.find(x=>x.geometry?.type==='PlaneGeometry');if(floor)floor.visible=stage!=='tidewater';
      camera.position.set(actorOrigin[0]-2.7,actorOrigin[1]+1.5,actorOrigin[2]-.7);camera.lookAt(actorOrigin[0],actorOrigin[1]+.8,actorOrigin[2]+.2);
      const wallMesh=wall&&stage==='synthetic'?new THREE.Mesh(new THREE.BoxGeometry(8,2,.16),new THREE.MeshStandardMaterial({color:0x737b89,roughness:1})):null;
      if(wallMesh){wallMesh.position.set(0,1,.8);scene.add(wallMesh);}
      G.physics=new Physics(G.level);G.projectiles.clear();G.fx.clear();G.time=0;muzzle.length=0;
      volumeFrame.checked=0;volumeFrame.allPartsVisible=0;volumeFrame.maxBackError=0;volumeFrame.maxRodError=0;
      const a=new Actor({team:0,weapon:id,isLocal:true,CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;
      timing.characterConstructMs=performance.now()-caseStart;
      const family=a.weapon.catalogRecord?.family??a.weapon.kind,flick=family==='roller'||family==='brush';
      const expectedMode=family==='roller'?swing:family==='brush'?'brush':null;
      ch.actor=a;ch.onEvent=null;scene.add(ch.root);G.actors=[a];G.match.local=a;
      if(ch._sourceMotionLoader)await ch._sourceMotionLoader;if(ch.sourceMotion?.ready)await ch.sourceMotion.ready;
      timing.sourceReadyMs=performance.now()-caseStart;
      if(ch.sourceMotion?.status!=='ready')throw Error(id+' source motion not ready: '+ch.sourceMotion?.status);
      a.pos.fromArray(actorOrigin);a.aimPitch=pitch*Math.PI/180;a.aimYaw=0;a.yaw=0;a.grounded=a.ground.hit=true;a.ground.y=actorOrigin[1];a.ground.face=-1;a.kidT=1;
      a.aimPoint.copy(a.pos).add(new THREE.Vector3(0,1.05,0)).addScaledVector(new THREE.Vector3(0,Math.sin(a.aimPitch),Math.cos(a.aimPitch)),20);
      if(reticle!=='aligned')a.aimPoint.copy(a.pos).add(new THREE.Vector3(0,reticle==='stale'?1.05:-.4,reticle==='stale'?80:4));
      const clock=new FixedClock();G.game={s3Clock:clock};
      // Authored Explosher lip centre already has a >=140-vertex witness in
      // weapon-models-quad-explosher.test.mjs. It is a model landmark, not a
      // Nintendo gameplay origin. Apply the actual scaled weapon transform.
      const mouth=()=>id==='s3-slosher-washtub'?new THREE.Vector3(0,.069+Math.sin(.48)*.05472,.249+Math.cos(.48)*.05472).multiplyScalar(ch.weapon.def.modelScale||1).applyMatrix4(ch.weapon.off.matrixWorld).toArray():null;
      const socket=hand=>ch.getMuzzleHand(new THREE.Vector3(),hand),distance=(x,y)=>Math.hypot(...x.map((v,i)=>v-y[i]));
      const births=[],renders=[];const screenshots={};let tick=0,connected=0,maxFxError=0,maxHistoryError=0,historySamplesChecked=0,nativeShapeInstancesChecked=0,maxNativeShapeError=0,presses=0,lastRenderedBirthCount=0;
      const drawFrames=[{frame:-1,tick:0,reason:'initial'}];
      renderer.render(scene,camera);timing.firstRenderMs=performance.now()-caseStart;
      for(let frame=0;frame<hz*2;frame++){
        clock.advance(1/hz,dt=>{
          const fire=flick?tick>=30&&(presses===0||family==='brush'&&presses===1&&births.length>0&&a.weaponRunner.cooldown<=1e-9):tick>=30&&tick<110;
          if(flick&&fire)presses++;
          a.intent.jump=family==='roller'&&swing==='vertical'&&tick===25;
          a.intent.fire=fire;a.ink=100;G.time+=dt;acquired.length=0;
          const pre=[socket(0).toArray(),socket(1).toArray()],preMouth=mouth(),fxStart=muzzle.length,preAimReady=ch.aimReady();
          a.update(dt);ch.root.updateMatrixWorld(true);
          const post=[socket(0).toArray(),socket(1).toArray()],postMouth=mouth();
          const born=acquired.filter(p=>p.owner===a&&(p.catalog||p.wid==='roller'));
          const rows=born.map(p=>{
            const mode=p.catalog?.descriptor.key??p.fidelityMode;
            if(expectedMode&&mode!==expectedMode)throw Error(id+' did not admit '+expectedMode+': '+mode);
            const hand=distance(p.start.toArray(),pre[1])<1e-8?1:distance(p.start.toArray(),pre[0])<1e-8?0:null;
            const selectedHand=family==='dualies'?a.weaponRunner.hand:0;
            const offset=p._s3PoseBirthOffset,drawn=p.start.toArray().map((v,i)=>v+(offset?[offset.x,offset.y,offset.z][i]:0));
            const fx=muzzle.slice(fxStart).map(x=>x.pos),fxError=hand===null?null:Math.min(...fx.map(x=>distance(x,post[hand])));
            const rawSocketMove=hand===null?0:distance(post[hand],pre[hand]);
            if(hand!==null&&rawSocketMove>1e-9&&rawSocketMove<.5&&G.physics.los(new THREE.Vector3(...pre[hand]),new THREE.Vector3(...post[hand]))&&!offset)throw Error('safe raw-socket birth lost its pose connection');
            if(hand!==null&&offset&&rawSocketMove<.5){connected++;maxFxError=Math.max(maxFxError,fxError);if(!(fxError<1e-7)||distance(drawn,post[hand])>1e-7)throw Error(JSON.stringify({id,hz,pitch,wall,tick,hand,fxError}));}
            const u=p.catalog?.descriptor.packet??p.fidelityRollerUnit;
            const sourceHeading=u?Object.fromEntries(Object.entries(u).filter(([k,v])=>typeof v==='number'&&/Rotate|SpawnSpeed|SpawnWide|BulletNum|AddSpawnSpeed/.test(k))):null;
            return{tick,hand,selectedHand,mode,swingOrdinal:presses,acceptedAimPitch:a.aimPitch,acceptedAimDir:a.aimDir.toArray(),aimPoint:a.aimPoint.toArray(),unit:p.catalog?.descriptor.unit??p.fidelityRollerUnitIndex??null,index:p.catalog?.index??p._iwVisualOrdinal??null,sourceHeading,preAimReady,postAimReady:ch.aimReady(),seed:p.seed,physical:p.start.toArray(),velocity:p.vel.toArray(),preSocket:pre,postSocket:post,preAuthoredMouth:preMouth,postAuthoredMouth:postMouth,physicalMouthGap:postMouth?distance(p.start.toArray(),postMouth):null,poseConnectionMouthGap:postMouth?distance(drawn,postMouth):null,poseConnectionPoint:drawn,poseOffset:offset?{...offset}:null,fx,fxError,physicalSocketGap:distance(p.start.toArray(),post[selectedHand]),poseConnectionSocketGap:distance(drawn,post[selectedHand]),p};
          });
          G.projectiles.update(dt);
          for(const row of rows){const h=row.p._iwVisualHistory;if(h&&h.count&&h.oldestAge===0){const sample=new Float64Array(6);h.sample(0,sample);row.historyBirth=Array.from(sample.slice(0,3));row.historyError=distance(row.historyBirth,row.poseConnectionPoint);historySamplesChecked++;maxHistoryError=Math.max(maxHistoryError,row.historyError);if(row.historyError>1e-7)throw Error(JSON.stringify({id,hz,pitch,wall,tick,historyError:row.historyError}));}delete row.p;births.push(row);}
          G.fx.update(dt,camera);tick++;
        });
        G.projectiles.syncVisuals?.(Math.min(1,clock.accumulator*60));
        // Native _muzzle/_muzzleHand predicts the aim pose below aimReady=.98
        // (src/game/weapons.js:720; catalog-pose-birth). Quad's second shot may
        // still be in that legitimate prediction phase. Its steady image is
        // the first later birth at full aim; LOS fallback is never overridden.
        const steadyReady=id!=='s3-maneuver-stepper'||births.at(-1)?.preAimReady>=.98;
        const capture=births.length>lastRenderedBirthCount&&renders.length<2&&(renders.length===0||steadyReady);
        if(renderPolicy==='full'||capture||frame===hz*2-1){
          renderer.render(scene,camera);drawFrames.push({frame,tick,reason:capture?(renders.length?'steady':'first'):frame===hz*2-1?'final':'cadence'});
        }else{
          // The actual draw hook caches this fixed lab camera for viewer/LOD.
          // Preserve that camera-state update at every simulated cadence.
          // Material uniforms and draw-range hooks still run on each real draw.
          ch._camHook?.(renderer,scene,camera);
        }
        if(capture){const phase=renders.length===0?'first':'steady';lastRenderedBirthCount=births.length;const gl=renderer.getContext();gl.finish();const pixels=new Uint8Array(512*512*4);gl.readPixels(0,0,512,512,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let inkPixels=0;for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2])>40)inkPixels++;
          const nativeInstances=[];
          for(const p of G.projectiles.list)if(p.owner===a&&p.s3Shape==='explosher'&&p.delay<=0){
            const mesh=G.projectiles.blobs,matrix=new THREE.Matrix4(),pos=new THREE.Vector3();let best=Infinity,bestIndex=-1,actual=null;
            for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);pos.setFromMatrixPosition(matrix).applyMatrix4(mesh.matrixWorld);const error=pos.distanceTo(p.pos);if(error<best){best=error;bestIndex=i;actual=pos.toArray();}}
            if(!(best<2e-5))throw Error('actual Explosher instance does not follow its physical round: '+best);
            nativeShapeInstancesChecked++;maxNativeShapeError=Math.max(maxNativeShapeError,best);
            nativeInstances.push({index:bestIndex,age:p.age,physical:p.pos.toArray(),actual,centreError:best,physicalBirth:p.start.toArray(),note:'Actual age>0 sphere is detached at the physical projectile; no age-zero history is owned.'});
          }
          const latestBirth=births.at(-1);
          renders.push({phase,frame,tick,birthCount:births.length,preAimReadyAtEmission:latestBirth.preAimReady,originEqualsPrePoseSocket:latestBirth.hand!==null,hasPoseConnection:!!latestBirth.poseOffset,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,inkPixels,glError:gl.getError(),nativeInstances,nativeVolumeSubmissions:volumeFrame.submissions.slice()});screenshots[phase]=renderer.domElement.toDataURL('image/png').split(',')[1];}
      }
      if(!births.length)throw Error(id+' did not fire');if((!flick||family==='brush')&&renders.length!==2)throw Error(id+' missing first/steady render phases');if(!renders.length||renders.some(r=>r.inkPixels<100||r.glError!==0))throw Error('Missing real WebGL character/weapon coverage');
      timing.simulationCompleteMs=performance.now()-caseStart;
      const source={status:ch.sourceMotion.status,active:ch.sourceMotion.active};
      if(flick&&presses!==(family==='brush'?2:1))throw Error(id+' missing admitted swing');
      if(id==='s3-maneuver-stepper'&&!wall&&pitch===0&&volumeFrame.checked===0)throw Error('visible native Quad back/rod acceptance observed no connection samples');
      const result={id,hz,pitch,wall,stage,actorOrigin,levelBlocks:G.level.blocks.length,levelFaces:G.level.faces.length,expectedMode,randomPolicy:'deterministic midpoint; no statistical spread claim',renderPolicy,cadenceFrames:hz*2,drawFrames,actualDraws:drawFrames.length,timing,ticks:clock.ticks,birthCount:births.length,connected,maxFxError:connected?maxFxError:null,historySamplesChecked,maxHistoryError:historySamplesChecked?maxHistoryError:null,nativeShapeInstancesChecked,maxNativeShapeError:nativeShapeInstancesChecked?maxNativeShapeError:null,nativeVolumeConnectionsChecked:volumeFrame.checked,nativeVolumeAllPartsVisible:volumeFrame.allPartsVisible,maxNativeBackError:volumeFrame.checked?volumeFrame.maxBackError:null,maxNativeRodError:volumeFrame.checked?volumeFrame.maxRodError:null,source,renders,births,screenshots};
      a.weaponRunner.reset();G.projectiles.clear();G.fx.clear();scene.remove(ch.root);
      // Keep one detached Character's compiled material programs referenced.
      // Each tested world still receives a fresh Actor and source controller;
      // the keeper is absent from scene, G.actors, physics and input updates.
      if(!window.probe.shaderKeeper)window.probe.shaderKeeper=ch;else ch.dispose();
      G.actors=[];
      if(wallMesh){scene.remove(wallMesh);wallMesh.geometry.dispose();wallMesh.material.dispose();}Math.random=nativeRandom;timing.cleanupCompleteMs=performance.now()-caseStart;return result;
    },{id,hz,pitch,wall,swing:plan.swing,reticle:plan.reticle,renderPolicy:plan.renderPolicy,stage:plan.stage});
    for(const [phase,base64]of Object.entries(row.screenshots)){const name=`${id}-${plan.swing}-${hz}-${pitch}-${wall?'wall':'open'}-${phase}.png`;fs.writeFileSync(path.join(out,name),Buffer.from(base64,'base64'));row.screenshots[phase]=name;}
    result.cases.push(row);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({id,hz,pitch,wall,births:row.birthCount,connected:row.connected,maxFxError:row.maxFxError,maxHistoryError:row.maxHistoryError,renderPolicy:row.renderPolicy,actualDraws:row.actualDraws,timing:row.timing}));
  }
  assert.equal(errors.length,0,errors.join('\n'));assert.equal(requestsFailed.length,0,JSON.stringify(requestsFailed));
  assert.equal(hash(fs.readFileSync(path.join(site,'inkwave-build.json'))),result.manifestSha256,'build changed during browser proof');
  result.status='passed';
}catch(error){result.failure=String(error.stack||error);throw error;}
finally{
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
  await browser?.close();await new Promise(resolve=>server.close(resolve));
}
