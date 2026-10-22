import { productionScene } from './shared/production-scene.mjs';
const check=(v,m)=>{if(!v)throw Error(m);};
const plain=v=>JSON.parse(JSON.stringify(v));
export function verifyOriginReceipt(r,{corrected=true}={}){
 check(r.sourceReady===true,'source bank ready');check(r.shots===1,'one production release');
 check(Number.isFinite(r.muzzleError)&&Number.isFinite(r.oldOriginGap),'finite measured origins');
 if(corrected){check(r.muzzleError<1e-8,'emitted projectile starts at displayed muzzle');check(r.owner==='qa-owner'&&r.life===7,'release owner/life preserved');check(r.ownerRejected&&r.lifeRejected,'replacement owner/life rejected');check(r.bonesUnchanged,'capture does not mutate final bones');}
 else check(r.oldOriginError<1e-8&&r.oldOriginGap>.2,'8bc negative control uses old body origin');
 return true;
}
// Production Actor, source bank, buildFrame, rule and effects, with native
// Renderer/Environment. Isolated world sinks; not a full match or network.
export async function run({prefix,baselinePrefix}){
 const rows=[],metrics=[],progress=globalThis.__objectQA={suite:'rainmaker-origin',stage:'init'};
 const random=Math.random;Math.random=()=>.5;
 try{for(const [revision,path]of [['before',baselinePrefix],['after',prefix]]){
  const ctx=await productionScene(path),{api,G,THREE,scene,camera,capture}=ctx;
  const {buildFrame}=await import(path+'patches/splatoon3/runtime/ranked/install.mjs');
  const {RankedEngine}=await import(path+'patches/splatoon3/runtime/ranked/engine.mjs');
  const {createRankedEffects}=await import(path+'patches/splatoon3/runtime/ranked/combat.mjs');
  const {createRainmakerModel,createRainmakerPresentation}=await import(path+'patches/splatoon3/runtime/ranked/rainmaker-model.mjs');
  try{for(const hz of [30,60,120])for(const pitch of [-1.05,0,1.15]){
   class Selected extends api.Character{constructor(o){super({...o,sourceMotion:true});}}
   const a=new api.Actor({team:0,isLocal:true,name:'rainmaker-origin-fixed',weapon:'shooter',CharacterClass:Selected,style:{hair:0,hat:0,skin:2,outfit:0,eyes:0}}),ch=a.character;
   Object.assign(a,{nid:'carrier',owner:'qa-owner',netLife:7});ch.actor=a;ch.onEvent=null;ch.setLod('hero');scene.add(ch.root);a.grounded=a.ground.hit=true;
   G.actors=[a];G.local=a;G.netm=null;G.time=0;G.teamColors=[new THREE.Color(0xe6e900),new THREE.Color(0x6340db)];
   G.level={blocks:[],groundHeight:()=>0};G.paint={sample:()=>1,splat:()=>0};G.audio={play(){},stop(){}};G.fx={ring(){}};G.physics={los:()=>true,raycast:(_a,_b,_c,h)=>{h.hit=false;return h;},segment:(_a,_b,h)=>{h.hit=false;return h;}};
   G.projectiles={};
   const engine=new RankedEngine('rainmaker',{rainmaker:{center:[0,0,0],goals:[[0,0,100],[0,0,-100]],checkpoints:[[],[]],retreatZ:[-90,90]}}),rule=engine.rule;
   const match=G.match={mode:'rainmaker',state:'playing',actors:[a],ranked:engine,rankedBarrierHits:[],playing:()=>true,canRespawn:()=>false,rankedWorld:{zoneCoverage:()=>[],floorAt:()=>0,blocked:()=>false}};
   rule.state.barrier.active=false;rule.state.carrier='carrier';rule.state.carrierTeam=0;
   const core=createRainmakerModel(THREE),group=new THREE.Group();group.add(core);scene.add(group);const display=createRainmakerPresentation(THREE,core),fx=createRankedEffects(api,match),births=[];
   const add=scene.add;scene.add=function(o,...rest){if(o.geometry?.type==='SphereGeometry')births.push(o);return add.call(this,o,...rest);};
   try{
    await ch._sourceMotionLoader;await ch.sourceMotion?.ready;check(ch.sourceMotion?.status==='ready','same-build Player00 ready');
    a.aimPitch=pitch;a.aimYaw=a.yaw=0;a.aimDir.set(0,Math.sin(pitch),Math.cos(pitch));a.intent.fire=false;a._rankedInput={fire:false,throw:false,aim:a.aimDir.toArray(),at:G.time};
    rule.state.charge={seconds:1,value:1,firing:true,delay:0,recovery:0,pending:null,wasSwimming:false};
    for(let i=0;i<12;i++){G.time+=1/hz;a._finishFrame(1/hz);}check(ch._rainmakerPose===true,'final objective pose active');
    group.position.copy(a.pos);display.update(a,1);scene.updateMatrixWorld(true);
    const shown=core.localToWorld(new THREE.Vector3(...core.userData.rainmakerModel.muzzle)),old=a.pos.clone().add(new THREE.Vector3(0,1,0));
    const bones=JSON.stringify(ch.boneList.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()]));
    const frame=buildFrame(match,api),bonesUnchanged=bones===JSON.stringify(ch.boneList.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()]));
    const label=revision+'-source-origin-'+hz+'-'+(pitch<0?'down':pitch>0?'up':'level');
    const target=new THREE.Vector3(0,.8,.24);camera.position.copy(target).add(new THREE.Vector3(2.8,.3,.15).normalize().multiplyScalar(4.1));camera.lookAt(target);
    progress.stage=label+'-release';
    rule._updateShot(1/60,frame.actors[0],frame.inputs.carrier);const events=engine.events.filter(e=>e.kind==='rainmaker-shot');check(events.length===1,'one release from real buildFrame');const event=plain(events[0]);
    fx.event(event);check(births.length===1,'one production projectile mesh');
    const measured=births[0].position.clone(),receipt={revision,hz,pitch,sourceReady:ch.sourceMotion.status==='ready',shots:events.length,muzzle:shown.toArray(),birth:measured.toArray(),muzzleError:shown.distanceTo(measured),oldOriginGap:shown.distanceTo(old),oldOriginError:old.distanceTo(measured),owner:event.shotOrigin?.owner??null,life:event.shotOrigin?.life??null,bonesUnchanged};
    rows.push({...await capture(label+'-release'),revision,hz,pitch,phase:'release',...receipt});
    // Replay uses the frozen event after the visible actor moves; it must not
    // silently resample the current actor or accept a replacement owner/life.
    fx.dispose();births.length=0;a.pos.x+=3;ch.root.position.copy(a.pos);
    const replay=createRankedEffects(api,match);replay.event(event,true);
    if(revision==='after'){check(births.length===1&&births[0].position.distanceTo(measured)<1e-8,'follower frozen origin');replay.dispose();births.length=0;
     const rejected=createRankedEffects(api,match);a.owner='replacement';rejected.event(event);receipt.ownerRejected=births.length===0;a.owner='qa-owner';a.netLife=8;rejected.event(event);receipt.lifeRejected=births.length===0;rejected.dispose();a.netLife=7;
    }else replay.dispose();
    verifyOriginReceipt(receipt,{corrected:revision==='after'});metrics.push(receipt);
   }finally{scene.add=add;fx.dispose();display.release();scene.remove(group,ch.root);core.geometry.dispose();core.material.dispose();ch.dispose();G.actors=[];G.local=null;}
  }}finally{ctx.dispose();}
 }}finally{Math.random=random;}
 return{status:'passed',expectedFrames:18,rows,metrics,scope:'Exact 8bc ranked before overlay versus candidate emitted origin; actual source Actor/rule/effect/native render, isolated world sinks, no network or native-stage acceptance.'};
}
