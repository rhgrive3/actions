import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createHash}from'node:crypto';
import {sourceLoadedActorFixture}from'./source-loaded-actor-fixture.mjs';
const context=vm.createContext({console,crypto,TextEncoder}),module=new vm.SourceTextModule(fs.readFileSync(new URL('../../../tools/rainmaker-form-production-qa/browser.mjs',import.meta.url),'utf8'),{context});
await module.link(spec=>{assert.equal(spec,'./shared/production-scene.mjs');return new vm.SyntheticModule(['productionScene'],function(){this.setExport('productionScene',()=>{throw Error('CPU test must not create renderer');});},{context});});await module.evaluate();
const {FORM_CAPTURE_PLAN,runFormScenario,verifyFormScenario}=module.namespace,clean=x=>JSON.parse(JSON.stringify(x)),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const equalKeys=['frame','returnFrame','weapon','pitch','deliveryAt','source','kidScale','kidVisible','opacity','root','kid','pos','vel','aim','P','springs','canonicalMuzzle','canonicalSecondary','poses','rightSolves','clamArmActive','beforeSourceSha','sourceHistorySha','non12Sha','positionScaleSha','delivered','modelGeometry'];
let seed=1234,randomValues=[];const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=seed/4294967296;randomValues.push(x);return x;};
const f=await sourceLoadedActorFixture({random,extraExports:`export {createRankedEffects} from './patches/splatoon3/runtime/ranked/combat.mjs';export {createRainmakerModel,createRainmakerPresentation} from './patches/splatoon3/runtime/ranked/rainmaker-model.mjs';`});
const control=({ch})=>{ch._captureRainmakerForm=()=>{};};
test('form native plan keeps20 originals/ten pairs and required aim endpoints',()=>{
 assert.equal(FORM_CAPTURE_PLAN.reduce((n,x)=>n+Object.values(x.frames).reduce((m,v)=>m+v.length,0),0)*2,20);
 assert.deepEqual(clean(FORM_CAPTURE_PLAN.find(p=>p.name==='shooter-lower').frames[3]),['rear','side']);assert.deepEqual(clean(FORM_CAPTURE_PLAN.find(p=>p.name==='dualies-upper').frames[6]),['rear','side']);
 assert.equal(FORM_CAPTURE_PLAN.filter(p=>p.deliveryAt!==null).length,3);
});
for(const plan of FORM_CAPTURE_PLAN)test(plan.name+' actual driver preserves canonical source/getters/events and only adds one bounded display solve',async t=>{
 const pair=[];
 for(const lane of['warm-control','control','candidate']){
  seed=1234;randomValues=[];const corrected=lane==='candidate';const r=await runFormScenario({api:f,...plan,onSetup:corrected?null:control});assert(verifyFormScenario(r,{corrected}));
  if(lane!=='warm-control')pair.push({result:r,globalCalls:randomValues.length,globalValues:hash(randomValues)});
 }
 assert.equal(pair[0].globalCalls,pair[1].globalCalls,'same warmed global RNG call count');assert.equal(pair[0].globalValues,pair[1].globalValues,'same warmed global RNG column');
 const [old,now]=pair.map(p=>p.result);for(let i=0;i<10;i++){for(const key of equalKeys)assert.equal(JSON.stringify(old.rows[i][key]),JSON.stringify(now.rows[i][key]),i+'/'+key);if(i===9)assert.equal(old.rows[i].allBoneSha,now.rows[i].allBoneSha);}
 assert.deepEqual(clean(old.births),clean(now.births));assert.deepEqual(clean(old.events),clean(now.events));if(plan.name==='shooter-lower')assert(old.rows.some(r=>r.grip>=.001),'Shooter lower control must reproduce the measured former support gap');
 for(const mutate of[r=>r.rows.pop(),r=>r.rows[0].leftSolves=3,r=>r.rows[0].grip=.01,r=>r.rows[9].pending=true,r=>r.rows[0].source.active=false,r=>r.rows[0].source.active='yes',r=>delete r.rows[0].source.active,r=>r.rows[0].clamArmActive=true,r=>delete r.rows[0].clamArmActive]){const bad=clean(now);mutate(bad);assert.throws(()=>verifyFormScenario(bad),'negative contract rejected');}
 t.diagnostic(JSON.stringify({scenario:plan.name,emitted:!!process.env.INKWAVE_BUILT_SITE,frames:10,extraLeftSolves:9,sourceSha:now.rows[0].source.bankSha256,oldMaxGrip:Math.max(...old.rows.map(r=>r.grip)),newMaxGrip:Math.max(...now.rows.map(r=>r.grip)),globalCalls:pair.map(p=>p.globalCalls),networkOrigin:now.births}));
});
const trs=b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()];
for(const weapon of['shooter','dualies'])test(weapon+' display restoration precedes six lifecycle boundaries and actual ordinary bomb',async t=>{
 const cases=[];
 for(const boundary of['quick-return','same-frame-release','hide-show','source-reenable','weapon-cycle','splat-spawn']){
  const lanes=[];
  for(const lane of['warm-control','control','candidate']){
   const corrected=lane==='candidate';seed=1234;randomValues=[];const stop=Symbol('boundary measured'),out={entry:[],after:[],bombs:[]};const originalBomb=f.G.projectiles.throwBomb;
   f.G.projectiles.throwBomb=function(a){const n=this.bombs.length,r=originalBomb.call(this,a);for(const b of this.bombs.slice(n))out.bombs.push({kind:b.kind,pos:b.pos.toArray(),vel:b.vel.toArray()});return r;};
   try{
    await runFormScenario({api:f,weapon,pitch:-1.05,onSetup:corrected?null:control,onFrame:({row,a,ch,mesh})=>{
     out.entry.push({before:row.beforeSourceSha,bank:row.sourceHistorySha});if(row.returnFrame!==3)return;
     assert.equal(row.pending,corrected);out.before={grip:row.grip,pending:row.pending};const sm=ch.sourceMotion;
     if(corrected){const rendered=hash(ch.boneList.map(trs));for(const hand of[0,1]){const muzzle=hand&&ch.weapon.left?ch.weapon.left.muzzle:ch.weapon.muzzle,canonical=ch.getMuzzleHand(new f.THREE.Vector3(),hand).toArray();for(const method of ['getWorldPosition','updateWorldMatrix']){const raw=muzzle[method],error=Error('intentional canonical getter '+method+' fault');muzzle[method]=()=>{throw error;};try{assert.throws(()=>ch.getMuzzleHand(new f.THREE.Vector3(),hand),e=>e===error);}finally{muzzle[method]=raw;}assert.equal(hash(ch.boneList.map(trs)),rendered);assert.equal(ch.constructor.prototype[Symbol.for('inkwave.s3.weapon-handoff-motion.v1')].formStates.get(ch).busy,false);assert.deepEqual(ch.getMuzzleHand(new f.THREE.Vector3(),hand).toArray(),canonical,'next getter remains canonical after '+method+' fault');}}}
     f.G.match.ranked.rule._drop({id:'carrier',team:0,pos:a.pos.toArray(),grounded:true},'qa-drop');a.intent.fire=a.intent.sub=a.intent.jump=false;
     if(boundary==='same-frame-release'){ch.trigger('throw');f.G.projectiles.throwBomb(a);}
     if(boundary==='hide-show'){ch.setVisible(false);ch.setVisible(true);}
     if(boundary==='source-reenable'){sm.setEnabled(false);sm.setEnabled(true);}
     if(boundary==='weapon-cycle'){a.setWeapon('roller');a.setWeapon(weapon);}
     if(boundary==='splat-spawn'){a.splat(null,'qa');a.spawnAt(a.pos.clone(),a.yaw);}
     for(let i=0;i<45;i++){
      f.G.time+=1/60;a.intent.squid=i<2;a.intent.sub=boundary!=='same-frame-release'&&i>=3&&i<6;a.intent.fire=i>=20&&i<35;a.update(1/60);ch.root.updateMatrixWorld(true);
      const s=ch.sourceMotion;out.after.push({i,pos:a.pos.toArray(),vel:a.vel.toArray(),form:a.form,P:Array.from(ch.P),springs:Array.from(ch.sp),root:trs(ch.root),kid:trs(ch.kid),bones:hash(ch.boneList.map(trs)),source:hash([s.renderedPose,s.airPose,s.divePose,s.diveFrom]),muzzle:ch.getMuzzle(new f.THREE.Vector3()).toArray(),secondary:ch.getMuzzleHand(new f.THREE.Vector3(),1).toArray(),main:f.G.projectiles.list.map(p=>({pos:p.pos.toArray(),vel:p.vel.toArray(),type:p.type,damage:p.damage})),globalCalls:randomValues.length,pending:!!ch.s3RainmakerSupportPending});assert.equal(!!ch.s3RainmakerFormPending,false);assert.equal(!!ch.s3RainmakerSupportPending,false);
     }
     assert.equal(out.bombs.length,1);throw stop;
    }});assert.fail('drop boundary missing');
   }catch(e){if(e!==stop)throw e;}finally{f.G.projectiles.throwBomb=originalBomb;}
   out.globalCalls=randomValues.length;out.globalValues=hash(randomValues);if(lane!=='warm-control')lanes.push(out);
  }
  for(const key of['entry','after','bombs','globalCalls','globalValues'])assert.deepEqual(clean(lanes[0][key]),clean(lanes[1][key]),boundary+'/'+key);
  cases.push({boundary,afterFrames:45,bombs:lanes[1].bombs,globalCalls:lanes[1].globalCalls,oldGrip:lanes[0].before.grip,newGrip:lanes[1].before.grip});
 }
 t.diagnostic(JSON.stringify({weapon,emitted:!!process.env.INKWAVE_BUILT_SITE,cases}));
});
