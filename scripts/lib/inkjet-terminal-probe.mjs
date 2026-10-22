// QA-only. Imported by the existing emitted-site browser harness, not game code.
// No projectile records or terminal calls are fabricated. Walls are real Level
// geometry positioned 5 cm past each actual native birth, before _step runs, so
// even 120 Hz hits before its first rendered flight frame without stubbing Actor
// resolution. This controlled collision setup is not an ordinary-play benchmark.
export function terminalWallLayout(birth=null) {
  const single=[{kind:'box',min:[-12,-.5,-12],max:[12,0,12]}];
  if(birth)single.push({kind:'box',min:[birth.x-5,0,birth.z+.05],max:[birth.x+5,Math.max(10,birth.y+3),birth.z+1.05]});
  return {bounds:{minX:-12,maxX:12,minZ:-12,maxZ:12},spawnPads:[[-10,0,0],[10,0,0]],spawnBarrier:0,half:[],single};
}
// Match main.js FX wiring: setCollider installs the production director before
// any actor activation. Resolve G.physics on every call because the controlled
// near-wall world is rebuilt at each native projectile birth.
export function wireTerminalFxCollider(api, fx) {
  const hit = new api.Hit();
  fx.setCollider((from, to) => {
    const h = api.G.physics.segment(from, to, hit, true);
    return h.hit ? { point: h.point, normal: h.normal } : null;
  });
}
// Inkjet reserves a paid activation, then depletes its active gauge over time.
// A zero gauge at t=0 is not the current production payment contract.
export function activatePaidTerminalInkjet(actor, assert) {
  const paid=actor.specialCost(), before=actor.stats.specials;
  actor.special=paid;
  assert(actor.specialReady(), 'native Inkjet ready before paid activation');
  actor._startSpecial();
  assert(actor.specialActive?.id==='inkjet' && actor.stats.specials===before+1 &&
    actor.special===paid && !actor.specialReady(), 'native paid Inkjet activation');
  return paid;
}
export async function runInkjetTerminalProbe({api,THREE,G,scene,renderer,camera,Level,applyCatalogueChoice,hz,draw,pixels,changed,expect,cases,images}) {
  const dt=1/hz, assert=(ok,label)=>{expect(ok,label);if(!ok)throw new Error(label);};
  const equal=(a,b,label)=>assert(JSON.stringify(a)===JSON.stringify(b),label);
  let frame=0, wallMesh=null, paint=null;
  camera.position.set(8,8,-10);camera.lookAt(0,3,0);
  function world(birth=null) {
    paint?.dispose();
    if(wallMesh){scene.remove(wallMesh);wallMesh.geometry.dispose();wallMesh.material.dispose();wallMesh=null;}
    const layout=terminalWallLayout(birth);
    if(birth){
      const {min,max}=layout.single[1];
      wallMesh=new THREE.Mesh(new THREE.BoxGeometry(max[0]-min[0],max[1]-min[1],max[2]-min[2]),new THREE.MeshStandardMaterial({color:'#6b7e8e',roughness:1}));
      wallMesh.position.set((min[0]+max[0])/2,(min[1]+max[1])/2,(min[2]+max[2])/2);scene.add(wallMesh);
    }
    const level=new Level(layout);
    G.level=level;G.physics=new api.Physics(level);
    paint=G.paint=new api.PaintSystem(renderer,level,{atlasSize:1024,maxDensity:12,cell:.25});
    assert(paint.rt?.isWebGLRenderTarget,'real GPU PaintSystem render target');
  }
  async function actor(team,remote=false) {
    const a=new api.Actor({team,name:remote?'terminal ghost owner':'terminal paid owner',weapon:'shooter',CharacterClass:api.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
    scene.add(a.character.root);G.actors=[a];
    if(a.character._sourceMotionLoader)await a.character._sourceMotionLoader;
    if(a.character.sourceMotion?.ready)await a.character.sourceMotion.ready;
    assert(a.character.sourceMotion?.status==='ready','real source-loaded Character');
    a.nid=7;a.remote=remote;a.isLocal=!remote;a.form='kid';a.pos.set(0,2,0);a.vel.set(0,0,0);
    a.aimDir.set(0,-.4,1).normalize();a.aimPoint.copy(a.pos).addScaledVector(a.aimDir,40);a.aimPitch=.38;a.aimYaw=0;a.character.root.position.copy(a.pos);return a;
  }
  function setup() {
    G.time=0;G.netm=null;world();G.projectiles=new api.Projectiles(scene);G.fx=new api.FX(scene,{quality:.35});
    wireTerminalFxCollider(api,G.fx);
    assert(!!G.fx.s3SpecialVfx,'production-composed Inkjet director');
    return {system:G.projectiles,fx:G.fx,d:G.fx.s3SpecialVfx};
  }
  function observe(system,d) {
    const impacts=[],bursts=[],visuals=[],damage=[],originalImpact=system._impact,originalBurst=system._blastBurst,originalVisual=d.inkBlast,originalHit=system.applyHit;
    system._impact=function(p,hit,...args){if(p.wid==='inkjet')impacts.push({frame,at:hit.point.toArray(),normal:hit.normal.toArray(),ghost:!!p.ghost});return originalImpact.call(this,p,hit,...args);};
    system._blastBurst=function(p,at,...args){if(p.wid==='inkjet')bursts.push({frame,at:at.toArray(),native:!!p.pos,ghost:!!p.ghost,team:p.team});return originalBurst.call(this,p,at,...args);};
    d.inkBlast=function(at,color,radius,...args){if(radius===3.6)visuals.push({frame,at:at.toArray(),color:Array.from(color)});return originalVisual.call(this,at,color,radius,...args);};
    system.applyHit=function(owner,target,amount,cause){damage.push([owner.team,target.team,amount,cause]);return originalHit.apply(this,arguments);};
    return {impacts,bursts,visuals,damage};
  }
  const terminalPools=d=>[d.kit.inkShells,d.kit.inkBands,d.kit.inkDiscs];
  const clearTerminalGeometry=d=>{for(const pool of terminalPools(d))pool.clear();};
  function capture(name){draw();images.push({name:`inkjet-terminal-${hz}hz-${name}.png`,data:renderer.domElement.toDataURL('image/png')});}
  function impactPixels(d,label) {
    // Measure this terminal's ink geometry independently of additive flashes
    // and smoke, which may completely cover it on its first frame. Keep the
    // real world/Character depth and restore the complete composition afterward.
    const pools=terminalPools(d),meshes=pools.map(p=>p.mesh);
    const others=[...G.fx.root.children.filter(mesh=>mesh!==d.kit.root),
      ...d.kit.root.children.filter(mesh=>!meshes.includes(mesh))];
    const shown=[...meshes,...others].map(mesh=>[mesh,mesh.visible]);
    let count;
    try {
      others.forEach(mesh=>{mesh.visible=false;});
      const before=pixels();
      meshes.forEach(mesh=>{mesh.visible=false;});
      count=changed(before,pixels());
    } finally {shown.forEach(([mesh,visible])=>{mesh.visible=visible;});draw();}
    assert(count>10,label+' native terminal ink geometry draws pixels '+JSON.stringify({count,pools:pools.map(p=>({name:p.mesh.name,records:p.recs.length,positions:p.recs.map(r=>Array.from(r.v.slice(0,4)))}))}));return count;
  }
  function step(system,fx){system.update(dt);fx.update(dt,camera);paint.flush(dt);draw();}
  function teardown(a,system,fx){a.character.dispose();system.clear();fx.dispose();G.actors=[];G.fx=null;G.netm=null;}
  let packets;
  {
    const {system,fx,d}=setup(),a=await actor(0),nm=new api.NetMatch({myId:'owner'},{}),births=[],identities=new Set(),drawn=[];
    const observations=observe(system,d),push=system._push;
    system._push=function(p,...args){const result=push.call(this,p,...args);if(p.wid==='inkjet'){
      identities.add(p);births.push({frame,pos:p.pos.toArray(),vel:p.vel.toArray(),alreadyTracked:d.rounds.has(p)});
      assert(this.list.includes(p),'native _push admits actual Inkjet');nm.recProj(p);
      world(p.pos);clearTerminalGeometry(d); // Only QA world/presentation setup; no projectile or terminal mutation.
      if(births.length===1)capture('local-before-step');
    }return result;};
    assert(applyCatalogueChoice(a,{sub:'bomb',special:'inkjet'},api),'actual catalogue Inkjet selection');
    const paid=activatePaidTerminalInkjet(a,assert);
    assert(d.track(a)?.id==='inkjet','native activation presentation tracked before pool isolation');a.intent.fire=true;
    for(frame=0;frame<hz*6;frame++){
      G.time+=dt;a.update(dt);if(births.length===3)a.intent.fire=false;
      const before=observations.visuals.length;step(system,fx);
      if(observations.visuals.length>before)drawn.push(impactPixels(d,'local lifetime '+births.length));
      if(births.length===1 && frame<=births[0].frame+3)capture('local-f'+(frame-births[0].frame));
      if(births.length===3 && frame>=births[2].frame+3)break;
    }
    const native=observations.bursts.filter(b=>b.native),queued=observations.bursts.filter(b=>!b.native);
    assert(observations.impacts.length===3,'three actual local world contacts');
    assert(births.length===3 && native.length===3 && queued.length===3,'three actual native hits and three deferred gameplay flushes');
    assert(identities.size===1,'local native pool reused for three paid-shot lifetimes');
    assert(observations.visuals.length===3 && drawn.length===3,'exactly one real rendered terminal recipe per local lifetime');
    for(let i=0;i<3;i++){
      const contact=observations.impacts[i];
      assert(contact.frame===births[i].frame && !contact.ghost && Math.abs(contact.at[2]-births[i].pos[2]-.05)<1e-7 && contact.normal[2]<-.99,'native local wall-front contact');
      equal(native[i].at,contact.at,'local burst independently matches actual physics contact');
      assert(!births[i].alreadyTracked && native[i].frame===births[i].frame,'local terminal occurs before first flight render');
      assert(queued[i].frame===native[i].frame+1,'deferred gameplay flush executes on next native step');
      equal(queued[i].at,native[i].at,'deferred position unchanged');
      equal(observations.visuals[i],{frame:native[i].frame,at:native[i].at,color:a.color.toArray()},'native local terminal position, frame and owner color');
    }
    assert(!system.list.length && !(system.s3BlastQueue?.length) && !d.rounds.size,'local rounds and deferred queue drained');
    assert(d.errors===0,'no swallowed local special VFX errors');
    packets=JSON.parse(JSON.stringify(nm.out.filter(e=>e[1]==='p')));assert(packets.length===3,'actual NetMatch serializer produced three packets');
    cases.push({kind:'native-paid-near-wall',hz,sourceMotion:a.character.sourceMotion.status,paid,births,...observations,pooledIdentities:identities.size,terminalGeometryPixels:drawn,packets,paintCounts:Array.from(paint.counts),directorErrors:d.errors});
    teardown(a,system,fx);
  }
  {
    const {system,fx,d}=setup(),a=await actor(1,true),nm=G.netm=new api.NetMatch({myId:'viewer'},{}),identities=new Set(),births=[],drawn=[];
    const observations=observe(system,d);frame=0;
    for(let lifetime=0;lifetime<3;lifetime++){
      if(lifetime===2)a.alive=false;
      system.ghostProjectile(a,JSON.parse(JSON.stringify(packets[0])));
      const p=system.list.at(-1);assert(p?.ghost && p.wid==='inkjet' && p.s3AllSpecial===undefined,'real ghost decoder without local special metadata');
      identities.add(p);births.push({frame,pos:p.pos.toArray(),vel:p.vel.toArray(),ownerAlive:a.alive,alreadyTracked:d.rounds.has(p)});
      world(p.pos);clearTerminalGeometry(d);capture(`ghost-${lifetime+1}-before-step`);
      for(let tick=0;tick<4;tick++,frame++){
        G.time+=dt;const before=observations.visuals.length;step(system,fx);
        if(observations.visuals.length>before)drawn.push(impactPixels(d,'ghost lifetime '+(lifetime+1)));
        capture(`ghost-${lifetime+1}-f${tick}`);
      }
      assert(!system.list.length && !(system.s3BlastQueue?.length),'ghost lifetime fully retired without gameplay queue');
      assert(Array.from(paint.counts).every(n=>n===0),'remote ghost creates no turf');
    }
    assert(observations.impacts.length===3,'three actual ghost world contacts');
    assert(identities.size===1,'ghost decoder reuses real native pool');
    assert(observations.bursts.length===3 && observations.bursts.every(b=>b.native && b.ghost),'three real ghost terminals, no deferred gameplay clone');
    assert(observations.visuals.length===3 && drawn.length===3,'exactly one rendered terminal per ghost lifetime including dead owner');
    for(let i=0;i<3;i++){
      const b=observations.bursts[i],contact=observations.impacts[i];
      assert(contact.frame===births[i].frame && contact.ghost && Math.abs(contact.at[2]-births[i].pos[2]-.05)<1e-7 && contact.normal[2]<-.99,'native ghost wall-front contact');
      equal(b.at,contact.at,'ghost burst independently matches actual physics contact');
      assert(!births[i].alreadyTracked && b.frame===births[i].frame,'ghost terminal before first flight render');
      equal(observations.visuals[i],{frame:b.frame,at:b.at,color:a.color.toArray()},'ghost terminal uses actual point and owner team color');
    }
    assert(!observations.damage.length && !nm.out.length && nm.mute===0,'remote replay creates no damage or outbound packets and balances mute');
    assert(d.errors===0 && !d.rounds.size,'ghost director healthy with no stale rounds');
    cases.push({kind:'native-remote-ghost-near-wall',hz,sourceMotion:a.character.sourceMotion.status,births,...observations,pooledIdentities:identities.size,terminalGeometryPixels:drawn,paintCounts:Array.from(paint.counts),outboundPackets:nm.out,mute:nm.mute,directorErrors:d.errors});
    teardown(a,system,fx);
  }
  paint.dispose();if(wallMesh){scene.remove(wallMesh);wallMesh.geometry.dispose();wallMesh.material.dispose();}
  return {scope:'QA-only production-composed emitted runtime with real paid Actor shots, native physics/pooling, real GPU paint, actual NetMatch serialization/ghostProjectile replay and WebGL terminal-geometry pixel isolation (other FX hidden only during paired readback; full composition restored for screenshots); controlled 5 cm wall placement, not ordinary-play or performance acceptance',clock:`fixed dt=1/${hz}; actual WebGL rendering, not display-refresh measurement`,seed:'Math.random LCG 0x12345678; fresh browser page per Hz'};
}
