import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

if(!vm.SourceTextModule){
 test('posture cache lifecycle subprocess',()=>execFileSync(process.execPath,['--experimental-vm-modules','--test',fileURLToPath(import.meta.url)],{stdio:'pipe'}));
}else{
 const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),SITE=process.env.INKWAVE_BUILT_SITE;
 if(Object.hasOwn(process.env,'INKWAVE_BUILT_SITE')&&!SITE)throw Error('Emitted posture requires a nonempty INKWAVE_BUILT_SITE');
 if(process.env.INKWAVE_REQUIRE_BUILT_SITE&&!SITE)throw Error('Emitted posture requires INKWAVE_BUILT_SITE');
 const runtimeRel='patches/splatoon3/runtime/source-posture.mjs',threeRel='vendor/three/build/three.module.js';
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 const sourcePath=path.join(ROOT,runtimeRel),currentPath=SITE?path.join(path.resolve(SITE),runtimeRel):sourcePath;
 const threePath=SITE?path.join(path.resolve(SITE),threeRel):path.join(ROOT,'inkwave-public',threeRel);
 const currentBytes=fs.readFileSync(currentPath),threeBytes=fs.readFileSync(threePath);
 let binding={mode:'source',runtimeSha256:hash(currentBytes)};
 if(SITE){
  const manifestBytes=fs.readFileSync(path.join(path.resolve(SITE),'inkwave-build.json')),manifest=JSON.parse(manifestBytes);
  assert.equal(manifest.schema,1);
  assert.equal(manifest.build?.esbuild,'0.28.2');assert.equal(manifest.build?.optimization,'esbuild-minify');
  assert.equal(hash(fs.readFileSync(path.join(ROOT,'scripts/build-inkwave.mjs'))),manifest.build?.script,'canonical current build script');
  assert.equal(hash(JSON.stringify(manifest.files)),manifest.inputHash,'sealed build input manifest');
  assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash,'sealed build artifact manifest');
  assert.equal(hash(fs.readFileSync(sourcePath)),manifest.files['patch/runtime/source-posture.mjs'],'emitted posture source input must match current source');
  assert.equal(hash(currentBytes),manifest.artifacts[runtimeRel],'actual emitted posture bytes');
  assert.equal(hash(threeBytes),manifest.artifacts[threeRel],'actual emitted Three bytes');
  for(const name of['three.module.js','three.core.js'])assert.equal(hash(fs.readFileSync(path.join(ROOT,'inkwave-public/vendor/three/build',name))),manifest.files['upstream/vendor/three/build/'+name],'current Three source input '+name);
  binding={mode:'emitted',site:path.resolve(SITE),inputHash:manifest.inputHash,contentHash:manifest.contentHash,manifestSha256:hash(manifestBytes),runtimeSha256:hash(currentBytes),threeSha256:hash(threeBytes)};
 }
 const THREE=await import(pathToFileURL(threePath).href);
 const fixtures=[
  ['before','863a00703d14d7e20d505d51874d59457b6575d562cdb092242927213a3702f5'],
  ['incoming','6b21405eea7bd673e6561662d99dc9a784a8492dec09e5db2066e393a5805f07'],
 ];
 async function load(source,identifier=null){
  const context=vm.createContext({});
  const three=new vm.SyntheticModule(Object.keys(THREE),function(){for(const[k,v]of Object.entries(THREE))this.setExport(k,v);},{context});
  const module=new vm.SourceTextModule(source,{context,identifier:identifier||'frozen-posture-reference'});
  await module.link(spec=>{if(spec!=='three'){assert.ok(identifier,'only current emitted dependencies may use relative imports');assert.ok(spec.startsWith('.'),'unexpected posture dependency');assert.equal(path.resolve(path.dirname(identifier),spec),threePath,'current emitted posture must use the bound Three artifact');}return three;});await module.evaluate();return module.namespace;
 }
 async function pair(){
  const out={};
  for(const[label,pin]of fixtures){const bytes=fs.readFileSync(new URL('./fixtures/source-posture-cache-1913-'+label+'.mjs.txt',import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),pin,'immutable '+label+' source epoch');out[label]=await load(bytes.toString());}
  out.current=await load(currentBytes.toString(),currentPath);return out;
 }
 const Y=new THREE.Vector3(0,1,0);
 function rig(api){
  api.setSourcePostureEnabled(true);
  const r={character:{weaponKind:'shooter'}},c={retarget:r,state:'idle',time:0,manual:null,formKid:true,strafeBalance:1,speed:0,gaitSpeed:0,walkSpeed:1,shootBlend:0,grounded:true,formWeight:1};
  c.character=r.character;r.character.sourceMotion=c;return{r,c};
 }
 const upper=(api,r)=>{const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(.3,0,.35));api.sourcePostureBone(r,'chest',q,Y,true);return q.toArray();};
 const acquire=(api,r)=>api.sourcePostureBone(r,'hips',new THREE.Quaternion(),Y,true);
 const mutations=[
  ['same-clock lateral change',({c})=>{c.strafeBalance=0;}],
  ['controller replacement',({r,c})=>{r.character.sourceMotion={...c,strafeBalance:0};}],
  ['visible form transition',({c})=>{c.state='ToHuman';c.strafeBalance=0;}],
  ['disable switch',({api})=>api.setSourcePostureEnabled(false)],
 ];
 test('current posture executes the explicitly selected source or manifest-bound emitted module',t=>{
  assert.equal(hash(fs.readFileSync(currentPath)),binding.runtimeSha256,'runtime bytes remain frozen');
  if(SITE)assert.equal(hash(fs.readFileSync(threePath)),binding.threeSha256,'emitted dependency bytes remain frozen');
  t.diagnostic(JSON.stringify(binding));
 });
 test('incoming cached posture changes actual exported bone API behavior at lifecycle boundaries',async()=>{
  const apis=await pair();
  for(const[name,mutate]of mutations){
   const result={};
   for(const[label,api]of Object.entries(apis)){const state=rig(api);acquire(api,state.r);mutate({...state,api});result[label]=upper(api,state.r);}
   assert.notDeepEqual(result.incoming,result.before,name+' exercises stale incoming correction');
   assert.deepEqual(result.current,result.before,name+' retains the live native API');
  }
 });
 for(const hz of[30,60,120])test(`current posture retains native bone/carry outputs at ${hz}Hz through forms, replacement and clock reset`,async()=>{
  const apis=await pair(),states=Object.fromEntries(['before','current'].map(k=>[k,rig(apis[k])])),trace=[];
  for(let frame=0;frame<120;frame++){
   const outputs={};
   for(const[label,state]of Object.entries(states)){
    const api=apis[label];let c=state.r.character.sourceMotion;
    if(frame===42){c={...c,time:0};state.r.character.sourceMotion=c;}
    c.time=frame<42?(frame+1)/hz:(frame-41)/hz;
    c.state=['idle','move','air','land','ToHuman','ToSquid'][Math.floor(frame/15)%6];c.formKid=c.state!=='ToSquid';c.grounded=c.state!=='air';c.formWeight=.35;
    c.manual=frame%23===0?{frame:0}:null;c.strafeBalance=(frame%9)/8;c.speed=c.gaitSpeed=(frame%11)/5;c.shootBlend=(frame%7)/6;
    api.setSourcePostureEnabled(frame%29!==0);
    const bones=[];
    for(const target of['hips','spine','chest','neck','head']){const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(.1+frame*.001,.03,.2));api.sourcePostureBone(state.r,target,q,Y,true);bones.push(q.toArray());}
    const weapon=new THREE.Quaternion().setFromEuler(new THREE.Euler(.1,.2,.3));api.sourceCarryWeapon(c,weapon);
    outputs[label]={bones,weapon:weapon.toArray(),weight:api.sourcePostureWeight(state.r),carry:api.sourceCarryWeight(state.r),lateral:api.sourceLateralCorrection(state.r)};
   }
   assert.deepEqual(outputs.current,outputs.before,'frame '+frame);trace.push(outputs.current);
  }
  assert.equal(trace.length,120);
 });
 test('first upper-body draw and invalid controller ownership retain native fallback',async()=>{
  const apis=await pair();
  for(const mode of['fresh','absent','wrong-owner']){
   const outputs={};
   for(const label of['before','current']){const api=apis[label],state=rig(api);if(mode==='absent')state.r.character.sourceMotion=null;if(mode==='wrong-owner')state.c.retarget={};outputs[label]=upper(api,state.r);}
   assert.deepEqual(outputs.current,outputs.before,mode);
  }
 });
 test('interleaved retarget calls retain each controller live state on reentry',async()=>{
  const apis=await pair(),outputs={};
  for(const label of['before','current']){
   const api=apis[label],a=rig(api),b=rig(api);b.c.state='move';b.c.time=.5;b.c.strafeBalance=.2;
   acquire(api,a.r);acquire(api,b.r);
   a.c.state='ToHuman';a.c.strafeBalance=0;
   const first=upper(api,a.r);b.c.strafeBalance=.9;const second=upper(api,b.r);
   outputs[label]={first,second};
  }
  assert.deepEqual(outputs.current,outputs.before);
 });
 test('frozen idle-angle hoists retain exact native pelvis and sole targets',async()=>{
  const apis=await pair(),outputs={};
  for(const label of['before','current']){
   const api=apis[label],{r,c}=rig(api),V=THREE.Vector3;r.locomotion=true;
   r.character.rest={footL:new V(0,.02,0),footR:new V(0,.02,0)};
   r.character.limbs={legL:{a:.21,b:.2,up:{p:new V(.1,.42,.01)}},legR:{a:.22,b:.2,up:{p:new V(-.1,.43,-.01)}}};
   r.character._kidXform=(bone,p,q)=>{p.copy(bone.p);q.identity();};acquire(api,r);
   const rows=[];for(let frame=0;frame<30;frame++){c.time=frame/60;const hips=new V(0,.3,0);api.sourceIdleBob(r,hips);rows.push({hips:hips.toArray(),feet:JSON.parse(JSON.stringify(r.s3Posture.idleFeet))});}outputs[label]=rows;
  }
  assert.deepEqual(outputs.current,outputs.before);
 });
}
