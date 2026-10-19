import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const ruleURL=process.env.INKWAVE_BUILT_SITE?pathToFileURL(path.resolve(process.env.INKWAVE_BUILT_SITE,'patches/splatoon3/runtime/ranked/rainmaker.mjs')):new URL('../runtime/ranked/rainmaker.mjs',import.meta.url);
const {RainmakerRule}=await import(ruleURL.href);
const dt=1/60,clean=x=>JSON.parse(JSON.stringify(x));
const f=await sourceLoadedActorFixture({random:()=>.5}),{G,THREE}=f;
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
