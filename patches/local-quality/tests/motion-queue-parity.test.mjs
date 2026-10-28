import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {replaceOnce} from '../adapter.mjs';

const oldFoot=fs.readFileSync(new URL('./fixtures/run-foot-path-before-queue.mjs.txt',import.meta.url),'utf8');
const oldBuilder=fs.readFileSync(new URL('./fixtures/character-builder-before-queue.mjs.txt',import.meta.url),'utf8').trimEnd();
// Later queue work packs profile tracks. Keep this older vector-scratch
// counterfactual anchored to its authentic pre-packing production source.
const beforeWorld=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-remaining-world-before.json',import.meta.url),'utf8'));
const yaw="if(form!=='swim'&&!(form==='climb'&&wallNormal)&&!(form==='squid'&&!c.sourceMotion?.manual))";
function baseline(rel,raw){
 let code=rel==='src/game/motion/source-bank.js'?beforeWorld.modules[rel].source:adaptBuildSource(rel,raw);
 const undo=(a,b)=>{code=replaceOnce(code,a,b,'motion queue baseline '+rel);};
 if(rel==='src/game/motion/run-foot-path.js')return oldFoot;
 if(rel==='src/game/motion/source-controller.js'){
  undo('  let cosYaw,sinYaw;\n','');
  for(const name of ['cos','sin']){const term=`(${name}Yaw??=Math.${name}(yaw))`;assert.equal(code.split(term).length,3);code=code.replaceAll(term,`Math.${name}(yaw)`);}
  undo('    const normalizedFrame=mod(frame/clip.frames,1);\n','');
  undo('this.gaitTargets.add(this.tmp,item.weight,p,normalizedFrame);','this.gaitTargets.add(this.tmp,item.weight,p,mod(frame/clip.frames,1));');
  undo('    const contactSamples=sampleContactPair(p,normalizedFrame,','    const normalizedFrame=mod(frame/clip.frames,1);\n    const contactSamples=sampleContactPair(p,normalizedFrame,');
 }
 if(rel==='src/game/motion/gait-targets.js'){
  undo('sampleRunFoot,prepareRunFootBasis','sampleRunFoot');undo('this.runBasis={};','');undo('  const shared=prepareRunFootBasis(profile,framePhase,this.runBasis);\n','');undo('this.filtered,shared?this.runBasis:null)','this.filtered)');
  undo('this.footSide=this.indices.map(i=>i===bank.index.foot_L?0:i===bank.index.foot_R?1:-1);','');
  undo('  for(let j=0;j<this.indices.length;j++){\n   const i=this.indices[j],side=this.footSide[j];','  for(const i of this.indices){\n   const side=i===this.bank.index.foot_L?0:i===this.bank.index.foot_R?1:-1;');
 }
 if(rel==='src/game/motion/body-balance.js'){
  undo('  if(!this._soleCenter)this.center.fk(this._centerFk??=this.bank.fkCount?.([...this.rotationGain.keys()])??true);const mean=this._soleCenter||this.center;','  this.center.fk(this._centerFk??=this.bank.fkCount?.([...this.rotationGain.keys()])??true);const mean=this.center;');
  undo('  this.legIndices=balanceIndices;\n','');
  undo('for(const i of this.legIndices){if(!this.total)','for(const n of [\'leg1_L\',\'leg1_R\']){const i=this.bank.index[n];if(!this.total)');
  undo('for(const i of this.legIndices){const p=this.targets.wp[i]','for(const n of [\'leg1_L\',\'leg1_R\']){const i=this.bank.index[n],p=this.targets.wp[i]');
 }
 if(rel==='src/game/motion/retarget.js'){
  undo('  const hairSourceLengths=new Map();\n','');
  undo('let sourceLength=hairSourceLengths.get(side);if(sourceLength===undefined){sourceLength=0;for(let j=1;j<4;j++){const a=ix[`Hair${j}_${side}`],b=ix[`Hair${j+1}_${side}`];if(a!==undefined&&b!==undefined)sourceLength+=R.wp[a].distanceTo(R.wp[b]);}hairSourceLengths.set(side,sourceLength);}','let sourceLength=0;for(let j=1;j<4;j++){const a=ix[`Hair${j}_${side}`],b=ix[`Hair${j+1}_${side}`];if(a!==undefined&&b!==undefined)sourceLength+=R.wp[a].distanceTo(R.wp[b]);}');
  undo('   for(let pass=0;pass<2;pass++){\n    const joint=pass===0?f.limb.lo:f.limb.up;','   for(const joint of [f.limb.lo,f.limb.up]){');
  undo('  let walkBase,runBase,soleFactor,decay26,decay32,run22,run50;','  let walkBase,runBase;');
  undo('soleFactor??=-Math.expm1(-HOST_RETARGET.soleResponse*dt)','-Math.expm1(-HOST_RETARGET.soleResponse*dt)');
  undo('omega===32?(decay32??=Math.exp(-omega*h)):(decay26??=Math.exp(-omega*h))','Math.exp(-omega*h)');
  undo('runResponse===50?(run50??=-Math.expm1(-runResponse*h)):(run22??=-Math.expm1(-runResponse*h))','-Math.expm1(-runResponse*h)');
  undo('  const walkMix=clamp((3.5-speed)/1,0,1),walkEase=walkMix*walkMix*(3-2*walkMix);\n  // Lazy bases preserve the per-foot locomotion gate, including callbacks.\n  let walkBase,runBase;\n','');
  undo('(walkBase??=Math.min(.052,.008+speed*.013+.003*Math.abs(lateral)))','Math.min(.052,.008+speed*.013+.003*Math.abs(lateral))');
  undo('(runBase??=Math.min(.048,.004+speed*.007))','Math.min(.048,.004+speed*.007)');
  undo('   f.airLift=f.airLiftWalk*walkEase+f.airLiftRun*(1-walkEase);','   const walkMix=clamp((3.5-speed)/1,0,1),walkEase=walkMix*walkMix*(3-2*walkMix);\n   f.airLift=f.airLiftWalk*walkEase+f.airLiftRun*(1-walkEase);');
 }
 if(rel==='src/game/motion/hair-targets.js')undo('this.q=new Array(bank.bones.length);for(const i of this.indices)this.q[i]=new THREE.Quaternion();','this.q=bank.bones.map(()=>new THREE.Quaternion());');
 if(rel==='src/game/motion/source-bank.js'){
  const start=code.indexOf('      const b = this.bank.bones[i],s=b.scale'),end=code.indexOf('\n      this.flags[i] = b.flags;',start);assert.ok(start>0&&end>start);code=code.slice(0,start)+'      const b = this.bank.bones[i]; this.raw.set([...b.scale, ...b.translation, ...b.rotation], i * STRIDE);'+code.slice(end);
  undo('    const velocityScratch=new THREE.Vector3();\n','');undo('velocityScratch.copy(p[j]).sub(p[i]).dot(axis)*n','p[j].clone().sub(p[i]).dot(axis)*n');
 }
 if(rel==='src/game/character-geo.js'){const start=code.indexOf('class Builder {'),end=code.indexOf('\n}\n',start)+2;assert.ok(start>0&&end>start);code=code.slice(0,start)+oldBuilder+code.slice(end);}
 if(rel==='src/game/motion/squid-rig.js'){
  undo(yaw+'sq.pivot.quaternion.setFromAxisAngle(this.up,yaw);','sq.pivot.quaternion.setFromAxisAngle(this.up,yaw);');
  const start=code.indexOf("  const headIds=['Sqd_head0'"),end=code.indexOf('\n  for(let i=0;i<n;i++){',start);assert.ok(start>0&&end>start);
  code=code.slice(0,start)+"  const headY=['Sqd_head0','Sqd_head1','Sqd_head2'].map(name=>this.map.clone().multiply(this.bank.rest.world[id(name)]).elements[13]);"+code.slice(end);
  undo('if(y<middle){a=headIds[0];b=headIds[1];t=clamp((y-first)/(middle-first),0,1);}else{a=headIds[1];b=headIds[2];t=clamp((y-middle)/(last-middle),0,1);}',"if(y<middle){a=id('Sqd_head0');b=id('Sqd_head1');t=clamp((y-first)/(middle-first),0,1);}else{a=id('Sqd_head1');b=id('Sqd_head2');t=clamp((y-middle)/(last-middle),0,1);}");
  undo('a=chainIds[k]?.[segment-1]??id(`Sqd_arm${segment}_${chain}`);b=chainIds[k]?.[segment]??id(`Sqd_arm${segment+1}_${chain}`);','a=id(`Sqd_arm${segment}_${chain}`);b=id(`Sqd_arm${segment+1}_${chain}`);');
  undo('a=chainIds[k]?.[0]??id(`Sqd_leg${chain}1`);b=chainIds[k]?.[1]??id(`Sqd_leg${chain}2`);','a=id(`Sqd_leg${chain}1`);b=id(`Sqd_leg${chain}2`);');
  undo("indices[i*4+2]=waistId??id('Sqd_waist');","indices[i*4+2]=id('Sqd_waist');");
 }
 return code;
}
const values=v=>v.toArray();
function snapshot(ch){
 const m=ch.sourceMotion,r=m.squidRig;
 return structuredClone({bones:ch.boneList.map(b=>[...values(b.position),...values(b.quaternion),...values(b.scale),...b.matrixWorld.elements]),
  skeleton:Array.from(ch.skeleton.boneMatrices),gait:m.gaitTargets.indices.map(i=>[...values(m.gaitTargets.wp[i]),...values(m.gaitTargets.wq[i])]),
  contact:m.contact,lift:m.lift,debug:m.debug,muzzle:values(ch.getMuzzle(new ch.root.position.constructor())),
  ground:m.retarget.contacts.map(f=>({locked:f.locked,anchor:values(f.anchor),support:values(f.support),lift:f.airLift})),
  squid:{pivot:[...values(ch.squid.pivot.position),...values(ch.squid.pivot.quaternion),...values(ch.squid.pivot.scale),...ch.squid.pivot.rotation.toArray()],
   bones:r.bones.map(b=>[...b.matrix.elements,...b.matrixWorld.elements]),eye:Array.from(r.eyeGeometry.attributes.position.array),normals:Array.from(r.eyeGeometry.attributes.normal.array)}});
}

test('new motion kernels preserve real Character poses, gait, contacts, weapon, squid and run profiles at 30/60/120Hz',async()=>{
 const extraExports="export {locomotionProfile} from './src/game/motion/locomotion-profile.js'; export {prepareRunFootPaths} from './src/game/motion/run-foot-path.js';";
 const apis=await Promise.all([sourceLoadedActorFixture({sourceOnly:true,transform:baseline,random:()=>.4,extraExports}),sourceLoadedActorFixture({sourceOnly:true,random:()=>.4,extraExports})]);
 let compared=0,profiles=0,baseYaw=0,nextYaw=0,uncachedProfiles=0;const centerFK=[0,0];
 for(const variant of ['Player00','Player01'])for(const hz of [30,60,120]){
  const actors=await Promise.all(apis.map(a=>a.make())),chars=actors.map(a=>a.character);
  for(const ch of chars){if(variant==='Player01')await ch.sourceMotion.setVariant(variant);ch.onEvent=null;}
  chars.forEach((ch,k)=>{const center=ch.sourceMotion.bodyBalance.center,old=center.fk;center.fk=function(...args){centerFK[k]++;return old.apply(this,args);};});
  const phases=[['shooter',0,0,1,false],['shooter',.25,0,1,false],['shooter',6,0,1,true],['charger',2.8,1,0,true],['slosher',5,-1,0,true],['splatling',3,0,-1,false],['shooter',2,1,1,false]];
  for(let phase=0;phase<phases.length;phase++)for(let frame=0;frame<12;frame++){
   const [weapon,speed,x,z,firing]=phases[phase],dt=frame===3?0:frame===5?.1:1/hz;
   chars.forEach((ch,k)=>{if(frame===0){ch.setWeapon(weapon);ch.setLod(phase<2?'hero':phase<4?'game':phase<6?'far':'hero');}ch.root.position.x+=x*speed*dt;ch.root.position.z+=z*speed*dt;
    if(phase===3)ch.root.rotation.y+=dt*.8;
    const air=phase===5&&frame<6;if(phase===5&&frame===0)ch.trigger('jump');if(phase===5&&frame===6)ch.trigger('land');
    apis[k].G.time+=dt;ch.update(dt,{form:phase===6?'squid':'kid',grounded:!air,speed,localMove:{x,z},firing,ink:1,hp:1,vy:air?2:0});ch.root.updateMatrixWorld(true);ch.skeleton.update();
   });
   assert.deepEqual(snapshot(chars[1]),snapshot(chars[0]),`${variant} ${hz}Hz ${phase}/${frame}`);compared++;
   if(frame===0){const skin=ch=>Array.from(ch.sourceMotion.squidRig.ownedMeshes,m=>['skinIndex','skinWeight'].map(key=>{const a=m.geometry.attributes[key].array;return Buffer.from(a.buffer,a.byteOffset,a.byteLength);}));assert.deepEqual(skin(chars[1]),skin(chars[0]),'skin buffers across LOD '+phase);
    const host=ch=>{const out=[];ch.kid.traverse(o=>{if(!o.geometry)return;const rows=Object.entries(o.geometry.attributes).map(([name,a])=>[name,a.itemSize,a.normalized,a.array.constructor.name,Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)]);const i=o.geometry.index;if(i)rows.push(['index',i.array.constructor.name,Buffer.from(i.array.buffer,i.array.byteOffset,i.array.byteLength)]);out.push([o.name,rows]);});return out;};assert.deepEqual(host(chars[1]),host(chars[0]),'actual human mesh bytes across LOD '+phase);
   }
  }
  if(hz===30)for(const name of chars[0].sourceMotion.bank.clips.keys())if(name.startsWith('Run')){
   const paths=chars.map((ch,k)=>apis[k].locomotionProfile(ch.sourceMotion.bank,name).runFootPaths);
   assert.deepEqual(structuredClone(paths[1].map(a=>a.map(values))),structuredClone(paths[0].map(a=>a.map(values))),name);profiles++;
  }
  if(hz===30){const banks=chars.map(ch=>ch.sourceMotion.bank),names=Array.from(banks[0].clips.keys()).filter(name=>!banks[0].profiles.has(name)).slice(0,3);for(const name of names){const profile=banks.map(b=>b.profile(name));assert.deepEqual(structuredClone(profile[1]),structuredClone(profile[0]),'actual uncached profile '+name);assert.equal(banks[1].profile(name),profile[1]);uncachedProfiles++;}}
  const counts=[0,0];chars.forEach((ch,k)=>{const q=ch.squid.pivot.quaternion,old=q.setFromAxisAngle;q.setFromAxisAngle=function(...a){counts[k]++;return old.apply(this,a);};});
  for(const form of ['swim','squid','climb','kid'])for(const normal of [null,[1,0,0],[0,1,0],[0,0,0]])for(const manual of [false,true]){
   chars.forEach((ch,k)=>{ch.grounded=!manual;ch.sourceMotion.manual=manual?{squid:true}:null;const r=ch.sourceMotion.squidRig;
    r.apply(ch.sourceMotion.squidPose,{form,wallNormal:normal?new apis[k].THREE.Vector3(...normal):null,velocityY:-2,speed:6,yaw:.83,scale:1});ch.root.updateMatrixWorld(true);r.skeleton.update();
   });assert.deepEqual(snapshot(chars[1]),snapshot(chars[0]),`${form} ${normal} ${manual}`);compared++;
  }
  baseYaw+=counts[0];nextYaw+=counts[1];
  apis.forEach(a=>a.reset());
 }
 assert.ok(nextYaw<baseYaw);assert.ok(compared>600);assert.ok(profiles>20);assert.ok(centerFK[1]<centerFK[0]);assert.equal(uncachedProfiles,6);
 console.log(JSON.stringify({scope:'real source-loaded Character, exact numeric parity; no renderer/device FPS',compared,profiles,baseYaw,nextYaw,centerFK,uncachedProfiles}));
});

test('bank swap releases stale lookup roots and pooled tail profiles without changing timing state',()=>{
 const raw=fs.readFileSync(new URL('../../../inkwave-public/src/game/motion/source-controller.js',import.meta.url),'utf8');
 const start=raw.indexOf(' clearBankCaches(){'),end=raw.indexOf('\n }',start),body=raw.slice(start,end+3);
 assert.ok(raw.includes('if(this.bank!==bank)this.clearBankCaches();'));
 const method=new Function('return function '+body.trim())(),oldBank={},names=['_famTables','_famTablesBank','_dirClipsCache','_dirClipsBank','_iwDanceClips','_iwDanceBank','_sampleFkBank','_locoList','_locoPool'];
 const controller={time:7,phase:.8,...Object.fromEntries(names.map(name=>[name,{bank:oldBank}]))};
 method.call(controller);for(const name of names)assert.equal(controller[name],undefined);assert.equal(controller.time,7);assert.equal(controller.phase,.8);
});
