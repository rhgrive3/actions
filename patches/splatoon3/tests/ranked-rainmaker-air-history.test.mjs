import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
const dt=1/60,clean=x=>JSON.parse(JSON.stringify(x));
const f=await sourceLoadedActorFixture({random:()=>.5,extraExports: `export {RainmakerRule} from './patches/splatoon3/runtime/ranked/rainmaker.mjs';`}),{G,THREE,RainmakerRule}=f;
const environment={physics:G.physics,level:G.level,projectiles:G.projectiles};
for(const weapon of ['shooter','roller','dualies'])test(weapon+' source-air overlay restores legacy source history before real ordinary bomb release',async t=>{
 for(const boundary of ['quick-return','same-frame-release','hidden-reset','source-off']){
  const pair=[];
  for(let lane=0;lane<2;lane++){
   const a=new f.Actor({team:0,isLocal:true,name:'rainmaker-qa-fixed',weapon,CharacterClass:f.Character,style:{hair:0,hat:0,skin:2,outfit:0,eyes:0}}),ch=a.character;
   a.nid='carrier';ch.actor=a;ch.onEvent=null;ch.setLod('hero');G.scene.add(ch.root);a.grounded=a.ground.hit=true;a.pos.set(0,0,0);a.aimDir.set(0,0,1);
   await ch._sourceMotionLoader;await ch.sourceMotion?.ready;assert.equal(ch.sourceMotion.status,'ready');
   const rule=new RainmakerRule({event(){}},{rainmaker:{center:[0,0,0]}});rule.state.barrier.active=false;rule.state.carrier=null;
   const m={mode:'rainmaker',ranked:{rule},playing:()=>true,canRespawn:()=>false};
   const row={a,ch,m,rule,restores:0,corrected:0,solves:0,maxFinal:0,originalState:null,target:new THREE.Vector3()};pair.push(row);
   const solve=ch._solveLimb,apply=ch._applyPose,restore=ch._restoreRainmakerSupport;
   ch._solveLimb=function(limb,...args){const r=solve.call(this,limb,...args);if(limb===this.limbs.armL&&this._rainmakerPose){row.solves++;row.target.copy(args[0]);
    // Omit only the new post-solve display branch for the control. All native
    // source/body work and the actual legacy support solve have already run.
    if(lane===0&&this.sourceMotion.state==='air'){row.originalState=this.sourceMotion.state;this.sourceMotion.state='test-control-after-legacy-solve';}
   }return r;};
   ch._applyPose=function(...args){try{const r=apply.apply(this,args);if(this.s3RainmakerSupportPending)row.corrected++;if(this._rainmakerPose){const target=this.kid.localToWorld(row.target.clone()),hand=this.bones.handL.getWorldPosition(new THREE.Vector3());row.maxFinal=Math.max(row.maxFinal,target.distanceTo(hand));}return r;}finally{if(row.originalState!==null){this.sourceMotion.state=row.originalState;row.originalState=null;}}};
   ch._restoreRainmakerSupport=function(){row.restores++;return restore.call(this);};
  }
  G.actors=pair.map(p=>p.a);G.time=0;
  G.level={blocks:[],groundHeight:()=>0};G.physics={los:()=>true,raycast:(_a,_b,_c,hit)=>{hit.hit=false;return hit;}};
  G.projectiles=Object.fromEntries(['fireShooter','fireDualies','fireCharger','fireSplatling','fireBlaster','fireSlosh','throwBomb','fireFlick'].map(n=>[n,()=>{}]));
  const step=(n,fire=false,advance=true)=>{for(let i=0;i<n;i++){G.time+=dt;for(const p of pair){G.match=p.m;p.a._finishFrame(dt);if(advance&&p.rule.state.carrier)p.rule._updateShot(dt,{id:'carrier',team:0,pos:p.a.pos.toArray(),aim:p.a.aimDir.toArray(),swimming:false},{fire});}}};
  const pitch=value=>{for(const {a}of pair){a.aimPitch=value;a.aimDir.set(0,Math.sin(value),Math.cos(value));}};
  const extremes=()=>{if(weapon!=='shooter')return;for(const x of [-1.05,1.15]){pitch(x);step(12,false,false);}pitch(0);step(12,false,false);};
  step(60,false,false);for(const p of pair)p.rule.state.carrier='carrier';step(12);extremes();step(62,true);extremes();step(3);extremes();step(39);
  for(const {ch}of pair)ch.trigger(weapon==='roller'?'flick':'throw');step(15,false,false);for(const x of [-1.05,1.15]){pitch(x);step(8,false,false);}pitch(0);
  for(const {a}of pair){a.grounded=a.ground.hit=false;a.vel.set(0,2,0);}step(8,false,false);
  assert.ok(pair[1].maxFinal<.001,'final world-space hand reaches existing target: '+pair[1].maxFinal);assert.equal(pair[0].solves,pair[1].solves,'one legacy solve per active frame');
  if(weapon!=='roller')assert.ok(pair[1].corrected>0,'the regression actually exercises the air correction');
  Object.assign(G,environment);for(const {a,rule}of pair){rule.state.carrier=null;a.grounded=a.ground.hit=true;a.vel.set(0,0,0);delete a.s3.squidSpawn;}
  if(boundary==='hidden-reset')for(const {ch}of pair){ch.setVisible(false);assert.equal(!!ch.s3RainmakerSupportPending,false);ch.setVisible(true);}
  const born=[],previous=G.projectiles.throwBomb;G.projectiles.throwBomb=function(a){const before=this.bombs.length,result=previous.call(this,a);for(const b of this.bombs.slice(before))born.push({actor:a,kind:b.kind,pos:b.pos.toArray(),vel:b.vel.toArray()});return result;};
  if(boundary==='source-off')for(const {ch}of pair)ch.sourceMotion.setEnabled(false);
  if(boundary==='same-frame-release')for(const p of pair){G.match=p.m;p.ch.trigger('throw');G.projectiles.throwBomb(p.a);assert.equal(!!p.ch.s3RainmakerSupportPending,false,'real release sampler restores before same-frame birth');}
  let sawDive=false,sawReturn=false;
  for(let i=0;i<45;i++){
   G.time+=dt;for(const p of pair){const {a}=p;G.match=p.m;a.intent.squid=boundary==='quick-return'&&i<2;a.intent.sub=boundary!=='same-frame-release'&&i>=3&&i<6;a.intent.fire=false;a.update(dt);}
   sawDive||=pair[1].a.form==='squid';sawReturn||=i>=2&&pair[1].a.form==='kid';
   const snapshot=p=>({pos:p.a.pos.toArray(),vel:p.a.vel.toArray(),P:Array.from(p.ch.P),ink:p.a.ink,hp:p.a.hp,form:p.a.form,sp:Array.from(p.ch.sp),muzzle:p.ch.getMuzzle(new THREE.Vector3()).toArray()});
   assert.deepEqual(snapshot(pair[0]),snapshot(pair[1]),boundary+' actual actor/native state after drop at '+i);
   assert.equal(!!pair[1].ch.s3RainmakerSupportPending,false,'drop cannot leave an overlay pending');
  }
  const by=a=>born.filter(b=>b.actor===a).map(({actor,...b})=>b);
  assert.equal(by(pair[1].a).length,1);assert.deepEqual(by(pair[0].a),by(pair[1].a),'actual Projectiles.throwBomb origin/velocity exact');
  if(boundary==='quick-return')assert.ok(sawDive&&sawReturn);
  t.diagnostic(JSON.stringify({weapon,boundary,source:'ready',emitted:!!process.env.INKWAVE_BUILT_SITE,corrected:pair[1].corrected,restores:pair[1].restores,maxFinal:pair[1].maxFinal,bomb:by(pair[1].a),solves:pair.map(p=>p.solves)}));
  G.projectiles.throwBomb=previous;for(const p of pair){G.scene.remove(p.ch.root);p.ch.dispose();}G.actors=[];G.projectiles.clear();
 }
});

// Actual pickup/jump/landing replay shared with native capture. The control
// suppresses only the new land post-solve branch after the same legacy solve.
// Source buffers and actual ordinary bomb births are compared after drop.
const landingContext=vm.createContext({console});
const landingModule=new vm.SourceTextModule(fs.readFileSync(new URL('../../../tools/rainmaker-air-production-qa/browser.mjs',import.meta.url),'utf8'),{context:landingContext});
await landingModule.link(spec=>{
 assert.equal(spec,'./shared/production-scene.mjs');
 return new vm.SyntheticModule(['productionScene'],function(){this.setExport('productionScene',()=>{throw Error('CPU history test must not start renderer');});},{context:landingContext});
});await landingModule.evaluate();
let landingSeed=1234,landingRngIndex=0,landingRandomValues=[];
const landingRandom=()=>{landingRngIndex++;landingSeed=(Math.imul(landingSeed,1664525)+1013904223)>>>0;const value=landingSeed/4294967296;landingRandomValues.push(value);return value;};
const landingFixture=await sourceLoadedActorFixture({random:landingRandom,extraExports:`export {createRankedEffects} from './patches/splatoon3/runtime/ranked/combat.mjs';export {createRainmakerModel,createRainmakerPresentation} from './patches/splatoon3/runtime/ranked/rainmaker-model.mjs';`});
const landingHash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const landingTrs=b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()];
for(const scenario of ['carry-jump','charge-jump'])for(const boundary of ['quick-return','same-frame-release'])test(scenario+' land support restores source history and real bomb at '+boundary,async t=>{
 const {G,THREE}=landingFixture,lanes=[];
 // Warm the same construction/held-prop/projectile path first. Three UUID
 // allocation shares Math.random with real bomb spin; cold-vs-warm lanes
 // cannot establish global RNG parity. Reset the same LCG for all three.
 for(const lane of ['warmup-control','control','candidate']){const corrected=lane==='candidate';
  landingSeed=1234;landingRngIndex=0;landingRandomValues=[];
  let initialized=false,tick=0,beforeDrop=null,actorRngIndex=0;const entries=[],after=[],born=[],stop=Symbol('landing boundary completed'),oldBomb=G.projectiles.throwBomb;
  G.projectiles.throwBomb=function(a){const n=this.bombs.length,r=oldBomb.call(this,a);for(const b of this.bombs.slice(n))born.push({kind:b.kind,pos:b.pos.toArray(),vel:b.vel.toArray()});return r;};
  try{
   await landingModule.namespace.runAirScenario({api:landingFixture,scenario,onFrame:({row,a,ch})=>{
    tick=row.frame;
    if(!initialized){
     initialized=true;const actorRng=ch.rng;ch.rng=()=>{actorRngIndex++;return actorRng();};const sm=ch.sourceMotion,advance=sm.advance;
     sm.advance=function(...args){entries.push({tick,bones:landingHash(ch.boneList.map(landingTrs)),source:landingHash([this.renderedPose,this.airPose,this.divePose,this.diveFrom]),pending:!!ch.s3RainmakerSupportPending});return advance.apply(this,args);};
     if(!corrected){
      const solve=ch._solveLimb,apply=ch._applyPose;let state=null;
      ch._solveLimb=function(limb,...args){const r=solve.call(this,limb,...args);if(limb===this.limbs.armL&&this._rainmakerPose&&this.sourceMotion.state==='land'){state='land';this.sourceMotion.state='test-control-after-legacy-land-solve';}return r;};
      ch._applyPose=function(...args){try{return apply.apply(this,args);}finally{if(state!==null){this.sourceMotion.state=state;state=null;}}};
     }
    }
    if(row.frame!==(scenario==='carry-jump'?113:305))return;
    beforeDrop={frame:row.frame,grip:row.grip,pending:row.pending,source:row.source};assert.equal(row.source,'land');assert.equal(row.solves,1);
    if(corrected){assert.ok(row.grip<.001);assert.equal(row.pending,true);}else{assert.ok(row.grip>.001,'the control must reproduce a real landing gap');assert.equal(row.pending,false);}
    G.match.ranked.rule._drop({id:String(a.nid),team:a.team,pos:a.pos.toArray(),grounded:true},'qa-drop');a.intent.fire=a.intent.jump=a.intent.sub=false;
    if(boundary==='same-frame-release'){ch.trigger('throw');G.projectiles.throwBomb(a);assert.equal(!!ch.s3RainmakerSupportPending,false);}
    for(let i=0;i<45;i++){
     tick++;G.time+=dt;a.intent.squid=boundary==='quick-return'&&i<2;a.intent.sub=boundary==='quick-return'&&i>=3&&i<6;a.update(dt);ch.root.updateMatrixWorld(true);
     const sm=ch.sourceMotion;after.push({i,pos:a.pos.toArray(),vel:a.vel.toArray(),form:a.form,hp:a.hp,ink:a.ink,P:Array.from(ch.P),sp:Array.from(ch.sp),root:landingTrs(ch.root),kid:landingTrs(ch.kid),allBones:landingHash(ch.boneList.map(landingTrs)),source:landingHash([sm.renderedPose,sm.airPose,sm.divePose,sm.diveFrom]),muzzle:ch.getMuzzle(new THREE.Vector3()).toArray(),pending:!!ch.s3RainmakerSupportPending,rng:actorRngIndex,globalRng:landingRngIndex});assert.equal(!!ch.s3RainmakerSupportPending,false);
    }
    assert.equal(born.length,1);throw stop;
   }});assert.fail('target landing frame was not reached');
  }catch(e){if(e!==stop)throw e;}finally{G.projectiles.throwBomb=oldBomb;}
  if(lane!=='warmup-control')lanes.push({beforeDrop,entries,after,born,globalCalls:landingRngIndex,globalValues:landingHash(landingRandomValues)});
 }
 assert.equal(lanes[0].globalCalls,lanes[1].globalCalls,'warmed global Math.random call count');
 assert.equal(lanes[0].globalValues,lanes[1].globalValues,'warmed global Math.random value sequence');
 for(const key of ['entries','after','born'])assert.deepEqual(clean(lanes[0][key]),clean(lanes[1][key]),key+' must match the old land path exactly');
 t.diagnostic(JSON.stringify({scenario,boundary,emitted:!!process.env.INKWAVE_BUILT_SITE,globalCalls:lanes.map(x=>x.globalCalls),globalValues:lanes.map(x=>x.globalValues),sourceEntryFrames:lanes[1].entries.length,afterDropFrames:45,bomb:lanes[1].born,beforeDrop:lanes.map(x=>x.beforeDrop)}));
});
