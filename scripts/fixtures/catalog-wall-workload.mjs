// Controlled paint workload using production Actor, physics, paint and level
// material. Character display and match/UI/postprocessing are excluded in BOTH
// builds. Timings are fixed-step paint-workload timings, never retail/game FPS.
export async function runWallWorkload(assetRoot) {
 const [{install},profile]=await Promise.all([import(assetRoot+'/patches/splatoon3/runtime/install.mjs'),fetch(assetRoot+'/patches/splatoon3/profile.json').then(r=>r.json())]);
 const {decodePaintEvents}=await import('/after/patches/splatoon3/runtime/paint-packet-codec.mjs');
 const api=install(profile),{THREE,G,Actor,Projectiles,Physics,PaintSystem,NetMatch}=api;
 const [{installMainWeaponCatalogRuntime},{Level},{createLevelMaterial},{DEFAULT_SETTINGS}]=await Promise.all([
  import(assetRoot+'/patches/splatoon3/runtime/main-weapon-catalog.mjs'),import(assetRoot+'/src/world/level.js'),import(assetRoot+'/src/world/levelMaterial.js'),import(assetRoot+'/src/config.js')]);
 installMainWeaponCatalogRuntime(api,profile);Math.random=()=>.37;
 const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(960,600);document.body.append(renderer.domElement);
 const gl=renderer.getContext();G.renderer=renderer;G.settings={...DEFAULT_SETTINGS,quality:'high'};G.mode='match';G.time=0;G.scene=new THREE.Scene();G.scene.background=new THREE.Color('#18202b');
 G.camera=new THREE.PerspectiveCamera(50,960/600,.1,250);G.camera.position.set(0,11,-32);G.camera.lookAt(0,5,8);
 G.teamColors=[new THREE.Color('#ff8a14'),new THREE.Color('#2f5bff')];
 const layout={bounds:{minX:-40,maxX:40,minZ:-5,maxZ:100},spawnPads:[[0,0,0],[0,0,50]],spawnBarrier:null,half:[],single:[
  {kind:'box',min:[-40,-2,-5],max:[40,0,100],noPaint:[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]},
  {kind:'box',min:[-40,0,8],max:[40,20,9],noPaint:[[1,0,0],[-1,0,0],[0,1,0],[0,0,1]]}]};
 const level=new Level(layout);G.level=level;G.physics=new Physics(level);
 const paint=new PaintSystem(renderer,level,{atlasSize:4096,maxDensity:30,cell:.25});G.paint=paint;
 const material=createLevelMaterial(paint.texture,paint.size,null,{paint,ppm:paint.ppm});
 G.scene.add(new THREE.Mesh(level.buildGeometry(paint.size),material));
 G.scene.add(new THREE.HemisphereLight(0xeaf2ff,0x46505a,2));const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-10,25,-20);G.scene.add(sun);
 G.projectiles=new Projectiles(G.scene);G.actors=[];
 class DisplayCharacter {
  constructor(o){this.weapon=o.weapon;this.root=new THREE.Group();this.owner=null;}
  _owner(){return this.owner;}_runner(){return this.owner?.weaponRunner;}trigger(){}setVisible(){}setHurt(){}setWeapon(id){this.weapon=id;}aimReady(){return 1;}
  getMuzzle(out){return out.copy(this.owner.pos).add(new THREE.Vector3(0,1.05,0));}
 }
 let expectedRows=null,compressedMessages=0;
 let active=false,current=null,totalQuads=0,totalAtlasDraws=0,totalRows=0,eventArrayBytes=0,tickJsonBytes=0,totalMessages=0,maxQueue=0,maxDrops=0;
 const transport={broadcast(msg){if(!active)return;
  const t=performance.now(),wire=JSON.stringify(msg);current.wireSerialize+=performance.now()-t;
  const r=performance.now(),received=JSON.parse(wire),rows=received.pe?decodePaintEvents(received.pe):received.e;current.receiveDecode+=performance.now()-r;
  if(JSON.stringify(rows)!==expectedRows)throw Error('Codec changed native event rows');
  if(msg.pe)compressedMessages++;totalMessages++;tickJsonBytes+=new TextEncoder().encode(wire).length;
  if(rows){totalRows+=rows.length;eventArrayBytes+=new TextEncoder().encode(JSON.stringify(rows)).length;}
 },sendTo(){}};
 const actors=[];const nm=new NetMatch({myId:'a',isHost:true,hostId:'a',_members:new Map([['a','A'],['b','B']]),tr:transport},{id:'wall-paint-load',map:'controlled-wall',difficulty:'normal'});G.netm=nm;nm.onMessage('b',{k:'t',ts:0,a:[],pc:['inkwave-paint-dictionary-v1','wall-paint-load']});
 nm.match={actors,state:'playing',time:180,follower:false,playing:()=>true};G.match=nm.match;
 for(let i=0;i<8;i++){const a=new Actor({team:0,name:'wall-'+i,weapon:'s3-shooter-short',CharacterClass:DisplayCharacter});a.character.owner=a;Object.assign(a,{owner:'a',nid:i,remote:false,team:0,isLocal:false,form:'kid',grounded:true});a.pos.set((i-3.5)*3,6,0);a.aimDir.set(0,0,1);a.aimPoint.set(a.pos.x,6,60);actors.push(a);nm.byNid.set(i,a);nm._setupActor(a);}
 const wrap=(o,key,metric)=>{if(typeof o[key]!=='function')throw Error('Missing production probe '+key);const old=o[key];o[key]=function(...args){if(!active)return old.apply(this,args);const t=performance.now();try{return old.apply(this,args);}finally{current[metric]=(current[metric]||0)+performance.now()-t;current[metric+'Calls']=(current[metric+'Calls']||0)+1;}};};
 for(const [key,metric]of[['_cpuSplat','cpuBody'],['_advanceSplatOwnership','cpuGrowth'],['splat','splatInclusive'],['advanceSimulation','paintAdvanceInclusive'],['flush','flushInclusive']])wrap(paint,key,metric);
 const push=paint._pushQuad;paint._pushQuad=function(...args){if(active)totalQuads++;return push.apply(this,args);};
 const draw=paint._drawQuads;paint._drawQuads=function(...args){const t=performance.now();if(active&&(this.quads>0||this.dryMesh.visible))totalAtlasDraws++;try{return draw.apply(this,args);}finally{if(active)current.atlasSubmit=(current.atlasSubmit||0)+performance.now()-t;}};
 function step(i,measure){current={frame:i,cpuBody:0,cpuGrowth:0,splatInclusive:0,paintAdvanceInclusive:0,flushInclusive:0,atlasSubmit:0,wireSerialize:0,receiveDecode:0,sendTickInclusive:0,stepAndWire:0};active=measure;const start=performance.now();
  for(const a of actors){a.ink=100;a.weaponRunner.update(1/60,{fire:i<180,firePressed:i===0});}
  G.time+=1/60;G.projectiles.update(1/60);paint.advanceSimulation(1/60);paint.flush(1/60);renderer.render(G.scene,G.camera);
  const end=performance.now();active=false;const drain=performance.now();gl.finish();current.finishWait=performance.now()-drain;current.stepSubmit=end-start;current.stepWithDrain=performance.now()-start;
  if(measure){maxDrops=Math.max(maxDrops,G.projectiles._s3DetachedWallDrops?.length||0);maxQueue=Math.max(maxQueue,nm.out.length);}
  if(i%3===2){active=measure;expectedRows=nm.out.length?JSON.stringify(nm.out):undefined;const wireStart=performance.now();nm._sendTick();current.sendTickInclusive=performance.now()-wireStart;active=false;}
  current.stepAndWire=current.stepWithDrain+current.sendTickInclusive;
  if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL error in native paint workload');return current;
 }
 // Out-of-band garbage collection snapshots include the whole fixture heap.
 // They are not frame timings and are not attributed solely to the cache.
 const heapBeforeWarmup=await globalThis.__probeHeap();
 // Compile native shaders and exercise populated atlas updates before sampling.
 const coldFrames=[];for(let i=0;i<60;i++)coldFrames.push(step(i,true));G.projectiles.clear();paint.clear();nm.out.splice(0);G.time=0;nm.clockT=0;for(const a of actors){a.weaponRunner.reset();a.stats.turf=0;a.special=0;a.ink=100;}gl.finish();
 active=false;compressedMessages=0;totalQuads=totalAtlasDraws=totalRows=eventArrayBytes=tickJsonBytes=totalMessages=maxQueue=maxDrops=0;
 const heapAfterWarmup=await globalThis.__probeHeap();
 const frames=[];for(let i=0;i<240;i++)frames.push(step(i,true));
 const wall=level.faces.find(f=>f.block===1&&f.n.z<-.9);const wallCells=Array.from(paint.grid.slice(wall.grid,wall.grid+wall.nu*wall.nv)).filter(Boolean).length;
 const rendererName=gl.getParameter(gl.RENDERER),ext=gl.getExtension('WEBGL_debug_renderer_info');
 const gridSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',paint.grid))).map(v=>v.toString(16).padStart(2,'0')).join('');
 const heapAfterWorkload=await globalThis.__probeHeap();
 const result={frames,coldFrames,wireNegotiation:{compressedMessages},heap:{beforeWarmup:heapBeforeWarmup,afterWarmup:heapAfterWarmup,afterWorkload:heapAfterWorkload},counts:{totalQuads,totalAtlasDraws,totalRows,eventArrayBytes,tickJsonBytes,totalMessages,maxQueue,maxDrops,wallCells,gridSha256,floorCells:paint.counts[0]},fixture:{actors:8,firingFrames:180,settlingFrames:60,warmupFrames:60,simulationHz:60,sendHz:20,atlasSize:4096,cell:.25,viewport:[960,600],seed:.37,paintFaces:level.paintFaces?.length??level.faces.filter(f=>f.paintable).length,quality:'native level material, fixed lighting; no postprocess'},renderer:{name:rendererName,unmasked:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null},limitation:'Controlled paint-workload step, not whole-game frame or hardware GPU FPS. sendTickInclusive includes wire serialization, receiving decode and exact-row verification; it is outside stepWithDrain. stepAndWire adds that isolated send transaction. Receiver is decoding only, gameplay replay correctness is covered by separate tests. cpuGrowth includes nested body work; do not sum nested timing columns.'};
 if(!wallCells||totalRows===0||maxQueue>=512)throw Error('Incomplete or queue-overflow workload '+JSON.stringify(result.counts));
 return result;
}
