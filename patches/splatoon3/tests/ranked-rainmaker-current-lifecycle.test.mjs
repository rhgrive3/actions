// Current production pose; fixture selects source or INKWAVE_BUILT_SITE unchanged.
// Control disables only the display correction, retaining identical real driver input.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createHash}from'node:crypto';
import {sourceLoadedActorFixture}from'./source-loaded-actor-fixture.mjs';
const dt=1/60;
const context=vm.createContext({console,crypto,TextEncoder}),module=new vm.SourceTextModule(fs.readFileSync(new URL('../../../tools/rainmaker-form-production-qa/browser.mjs',import.meta.url),'utf8'),{context});
await module.link(spec=>{assert.equal(spec,'./shared/production-scene.mjs');return new vm.SyntheticModule(['productionScene'],function(){this.setExport('productionScene',()=>{throw Error('CPU test must not create renderer');});},{context});});await module.evaluate();
const {runFormScenario}=module.namespace,clean=x=>JSON.parse(JSON.stringify(x)),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const equalKeys=['frame','returnFrame','weapon','pitch','deliveryAt','source','kidScale','kidVisible','opacity','root','kid','pos','vel','aim','P','springs','canonicalMuzzle','canonicalSecondary','poses','rightSolves','clamArmActive','beforeSourceSha','sourceHistorySha','non12Sha','positionScaleSha','delivered','modelGeometry'];
let seed=1234,randomValues=[];const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=seed/4294967296;randomValues.push(x);return x;};
const f=await sourceLoadedActorFixture({random,extraExports:`export {createRankedEffects} from './patches/splatoon3/runtime/ranked/combat.mjs';export {createRainmakerModel,createRainmakerPresentation} from './patches/splatoon3/runtime/ranked/rainmaker-model.mjs';`});
const control=({ch})=>{ch._captureRainmakerForm=()=>{};};
const trs=b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()];
for(const weapon of['shooter','dualies'])test('current shoulder pose: '+weapon+' source history and actual ordinary bomb after lifecycle boundaries',async t=>{
 const cases=[];
 for(const boundary of['quick-return','same-frame-release','hide-show','splat-spawn']){
  const lanes=[];
  for(const lane of['warm-control','control','candidate']){
   const corrected=lane==='candidate';seed=1234;randomValues=[];const stop=Symbol('boundary measured'),out={entry:[],after:[],bombs:[]};const originalBomb=f.G.projectiles.throwBomb;
   f.G.projectiles.throwBomb=function(a){const n=this.bombs.length,r=originalBomb.call(this,a);for(const b of this.bombs.slice(n))out.bombs.push({kind:b.kind,pos:b.pos.toArray(),vel:b.vel.toArray()});return r;};
   try{
    await runFormScenario({api:f,weapon,pitch:-1.05,onSetup:corrected?null:control,onFrame:({row,a,ch,mesh})=>{
     assert.equal(row.source.status,'ready');assert.equal(row.source.active,true);assert.equal(row.poses,1);
     out.entry.push(Object.fromEntries(equalKeys.map(key=>[key,row[key]])));if(row.returnFrame!==3)return;
     if(corrected)assert.ok(row.grip<.001,'current pose reaches the support socket');
     out.before={grip:row.grip,pending:row.pending};
     if(corrected){const rendered=hash(ch.boneList.map(trs));for(const hand of[0,1]){const muzzle=hand&&ch.weapon.left?ch.weapon.left.muzzle:ch.weapon.muzzle,canonical=ch.getMuzzleHand(new f.THREE.Vector3(),hand).toArray();for(const method of ['getWorldPosition','updateWorldMatrix']){const raw=muzzle[method],error=Error('intentional canonical getter '+method+' fault');muzzle[method]=()=>{throw error;};try{assert.throws(()=>ch.getMuzzleHand(new f.THREE.Vector3(),hand),e=>e===error);}finally{muzzle[method]=raw;}assert.equal(hash(ch.boneList.map(trs)),rendered);assert.equal(ch.constructor.prototype[Symbol.for('inkwave.s3.weapon-handoff-motion.v1')].formStates.get(ch).busy,false);assert.deepEqual(ch.getMuzzleHand(new f.THREE.Vector3(),hand).toArray(),canonical,'next getter remains canonical after '+method+' fault');}}}
     const rule=f.G.match.ranked.rule;assert.notEqual(rule.state.carrier,null);rule._drop({id:'carrier',team:0,pos:a.pos.toArray(),grounded:true},'qa-drop');assert.equal(rule.state.carrier,null);a.intent.fire=a.intent.sub=a.intent.jump=false;
     if(boundary==='same-frame-release'){ch.trigger('throw');f.G.projectiles.throwBomb(a);}
     if(boundary==='hide-show'){ch.setVisible(false);assert.equal(ch.root.visible,false);ch.setVisible(true);assert.equal(ch.root.visible,true);}
     if(boundary==='splat-spawn'){a.splat(null,'qa');assert.equal(a.alive,false);a.spawnAt(a.pos.clone(),a.yaw);assert.equal(a.alive,true);}
     let sawDive=false,sawReturn=false;for(let i=0;i<45;i++){
      f.G.time+=1/60;a.intent.squid=i<2;a.intent.sub=boundary!=='same-frame-release'&&i>=3&&i<6;a.intent.fire=i>=20&&i<35;a.update(1/60);ch.root.updateMatrixWorld(true);
      sawDive||=a.form==='squid';sawReturn||=i>=2&&a.form==='kid';
      const s=ch.sourceMotion;out.after.push({i,pos:a.pos.toArray(),vel:a.vel.toArray(),form:a.form,P:Array.from(ch.P),springs:Array.from(ch.sp),root:trs(ch.root),kid:trs(ch.kid),bones:hash(ch.boneList.map(trs)),source:hash([s.renderedPose,s.airPose,s.divePose,s.diveFrom]),muzzle:ch.getMuzzle(new f.THREE.Vector3()).toArray(),secondary:ch.getMuzzleHand(new f.THREE.Vector3(),1).toArray(),main:f.G.projectiles.list.map(p=>({pos:p.pos.toArray(),vel:p.vel.toArray(),type:p.type,damage:p.damage})),globalCalls:randomValues.length,pending:!!ch.s3RainmakerSupportPending});assert.equal(!!ch.s3RainmakerFormPending,false);assert.equal(!!ch.s3RainmakerSupportPending,false);
     }
     if(boundary==='quick-return')assert.ok(sawDive&&sawReturn,'actual quick dive and return');
     assert.equal(out.bombs.length,1);assert.ok(out.bombs[0].pos.every(Number.isFinite)&&out.bombs[0].vel.every(Number.isFinite));assert.ok(Math.hypot(...out.bombs[0].vel)>0);
     assert.ok(out.after.every(r=>r.muzzle.every(Number.isFinite)&&r.secondary.every(Number.isFinite)));throw stop;
    }});assert.fail('drop boundary missing');
   }catch(e){if(e!==stop)throw e;}finally{f.G.projectiles.throwBomb=originalBomb;}
   out.globalCalls=randomValues.length;out.globalValues=hash(randomValues);if(lane!=='warm-control')lanes.push(out);
  }
  for(const key of['entry','after','bombs','globalCalls','globalValues'])assert.deepEqual(clean(lanes[0][key]),clean(lanes[1][key]),boundary+'/'+key);
  cases.push({boundary,afterFrames:45,bombs:lanes[1].bombs,globalCalls:lanes[1].globalCalls,oldGrip:lanes[0].before.grip,newGrip:lanes[1].before.grip});
 }
 t.diagnostic(JSON.stringify({weapon,pose:'current unmodified',emitted:!!process.env.INKWAVE_BUILT_SITE,cases}));
});

// Actual pickup/jump/landing replay shared with native capture. The control
// suppresses only the land post-solve branch after the same native solve.
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
for(const [scenario,boundary] of [['carry-jump','quick-return'],['charge-jump','same-frame-release']])test('current shoulder pose: '+scenario+' landing restores source history and real bomb at '+boundary,async t=>{
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
    beforeDrop={frame:row.frame,grip:row.grip,pending:row.pending,source:row.source};assert.equal(row.source,'land');assert.equal(row.grounded,true);assert.ok(row.jumpSerial>=1,'actual jump was admitted');assert.ok(entries.length>0,'source advance was observed');assert.equal(row.solves,1);
    if(corrected)assert.ok(row.grip<.001,'current landing reaches support socket');
    const rule=G.match.ranked.rule;assert.notEqual(rule.state.carrier,null);rule._drop({id:String(a.nid),team:a.team,pos:a.pos.toArray(),grounded:true},'qa-drop');assert.equal(rule.state.carrier,null);a.intent.fire=a.intent.jump=a.intent.sub=false;
    if(boundary==='same-frame-release'){ch.trigger('throw');G.projectiles.throwBomb(a);assert.equal(!!ch.s3RainmakerSupportPending,false);}
    let sawDive=false,sawReturn=false;for(let i=0;i<45;i++){
     tick++;G.time+=dt;a.intent.squid=boundary==='quick-return'&&i<2;a.intent.sub=boundary==='quick-return'&&i>=3&&i<6;a.update(dt);ch.root.updateMatrixWorld(true);
     sawDive||=a.form==='squid';sawReturn||=i>=2&&a.form==='kid';
     const sm=ch.sourceMotion;after.push({i,pos:a.pos.toArray(),vel:a.vel.toArray(),form:a.form,hp:a.hp,ink:a.ink,P:Array.from(ch.P),sp:Array.from(ch.sp),root:landingTrs(ch.root),kid:landingTrs(ch.kid),allBones:landingHash(ch.boneList.map(landingTrs)),source:landingHash([sm.renderedPose,sm.airPose,sm.divePose,sm.diveFrom]),muzzle:ch.getMuzzle(new THREE.Vector3()).toArray(),pending:!!ch.s3RainmakerSupportPending,rng:actorRngIndex,globalRng:landingRngIndex});assert.equal(!!ch.s3RainmakerSupportPending,false);
    }
    if(boundary==='quick-return')assert.ok(sawDive&&sawReturn,'actual landing dive and return');
    assert.equal(born.length,1);assert.ok(born[0].pos.every(Number.isFinite)&&born[0].vel.every(Number.isFinite));assert.ok(Math.hypot(...born[0].vel)>0);assert.ok(after.every(r=>r.muzzle.every(Number.isFinite)));throw stop;
   }});assert.fail('target landing frame was not reached');
  }catch(e){if(e!==stop)throw e;}finally{G.projectiles.throwBomb=oldBomb;}
  if(lane!=='warmup-control')lanes.push({beforeDrop,entries,after,born,globalCalls:landingRngIndex,globalValues:landingHash(landingRandomValues)});
 }
 assert.equal(lanes[0].globalCalls,lanes[1].globalCalls,'warmed global Math.random call count');
 assert.equal(lanes[0].globalValues,lanes[1].globalValues,'warmed global Math.random value sequence');
 for(const key of ['entries','after','born'])assert.deepEqual(clean(lanes[0][key]),clean(lanes[1][key]),key+' must match the old land path exactly');
 t.diagnostic(JSON.stringify({scenario,boundary,pose:'current unmodified',emitted:!!process.env.INKWAVE_BUILT_SITE,globalCalls:lanes.map(x=>x.globalCalls),globalValues:lanes.map(x=>x.globalValues),sourceEntryFrames:lanes[1].entries.length,afterDropFrames:45,bomb:lanes[1].born,beforeDrop:lanes.map(x=>x.beforeDrop)}));
});
