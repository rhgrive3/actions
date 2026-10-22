#!/usr/bin/env node
// Fixed-step full native practice-range pilot. No whole-device/GPU acceptance.
import {createHash} from 'node:crypto';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const [site,source,overlay,rootArg,mode]=process.argv.slice(2),root=path.resolve(rootArg);
fs.mkdirSync(root,{recursive:true});
const print=x=>{const bytes=Buffer.from(JSON.stringify(x)+'\n');let p=0;while(p<bytes.length)p+=fs.writeSync(1,bytes,p,bytes.length-p);};

// QA-only semantic identity. No mutation, UUID deletion, or runtime access.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function inventoryUUIDs(value){const out=[];let visits=0;const active=new Set();function walk(v,path){assert.ok(path.length<=64&&++visits<=1000000,'UUID inventory bound');if(typeof v==='string'&&UUID.test(v))out.push({path,uuid:v});else if(v&&typeof v==='object'){assert.ok(!active.has(v),'UUID inventory cycle');active.add(v);for(const[k,x]of Object.entries(v))walk(x,[...path,k]);active.delete(v);}}walk(value,[]);return out;}
function semanticSnapshot(snapshot){
 const s=structuredClone(snapshot),e=s.entryObservation;
 assert.equal(e?.truncated,false);assert.equal(s.character?.nodesTruncated,false);assert.equal(s.character?.materialsTruncated,false);
 const raw=new Map(),keys=new Map(),definitions=[];
 const register=(uuid,key,kind)=>{assert.match(uuid,UUID);assert.ok(!raw.has(uuid)||raw.get(uuid).key===key,'UUID reused across distinct semantic owners');assert.ok(!keys.has(key)||keys.get(key)===uuid,'semantic owner split across raw objects');if(!raw.has(uuid)){raw.set(uuid,{key,kind});keys.set(key,uuid);definitions.push({uuid,key,kind});}};
 const nodes=s.character.nodes,nodeById=new Map();for(const n of nodes){assert.ok(!nodeById.has(n.uuid),'duplicate native node UUID');nodeById.set(n.uuid,n);}
 const bindNode=(uuid,path,name,type)=>{assert.match(path,/^root(?:\/\d+)*$/);const n=nodeById.get(uuid);assert.ok(n,'node owner missing');assert.equal(n.name,name);if(type!==undefined)assert.equal(n.type,type);register(uuid,'node:'+path,'node');};
 if(e.nodeGraph){
  assert.equal(e.nodeGraph.length,nodes.length);const byPath=new Map(e.nodeGraph.map(n=>[n.path,n]));assert.equal(byPath.size,nodes.length);
  for(const [i,n]of e.nodeGraph.entries()){
   assert.equal(n.uuid,nodes[i].uuid,'native traversal identity');bindNode(n.uuid,n.path,n.name,n.type);
   assert.equal(n.parentPath,n.path==='root'?null:n.path.slice(0,n.path.lastIndexOf('/')));
   if(n.parentPath!==null){assert.ok(byPath.has(n.parentPath),'parent missing');assert.ok(byPath.get(n.parentPath).children.includes(n.path),'parent does not own child');}
   assert.deepEqual(n.children,Array.from({length:n.children.length},(_,j)=>n.path+'/'+j));
   for(const child of n.children)assert.equal(byPath.get(child)?.parentPath,n.path);
  }
 }else if(nodes[0])bindNode(nodes[0].uuid,'root',nodes[0].name,nodes[0].type);
 const paths=new Set(),geometryOwners=new Map(),materialOwners=new Map();
 for(const o of e.owners){
  assert.ok(!paths.has(o.path),'duplicate draw-owner path');paths.add(o.path);bindNode(o.uuid,o.path,o.name,o.type);
  assert.ok(Number.isInteger(o.geometryAlias)&&o.geometryAlias>=0&&o.geometryAlias<e.geometries.length);
  const owners=geometryOwners.get(o.geometryAlias)||[];owners.push(o.path);geometryOwners.set(o.geometryAlias,owners);
  for(const [slot,id]of o.materialUuids.entries()){const owners=materialOwners.get(id)||[];owners.push(o.path+'#'+slot);materialOwners.set(id,owners);}
  for(const b of o.bones||[])bindNode(b.uuid,b.path,b.name,'Bone');
 }
 for(const[i,g]of e.geometries.entries()){
  assert.equal(g.alias,i);assert.ok(geometryOwners.has(i),'geometry has no owner');assert.equal(g.contentSha256,sha(g.content),'CPU content receipt hash mismatch');
  register(g.uuid,'geometry:'+JSON.stringify(geometryOwners.get(i).sort()),'geometry');
 }
 assert.equal(nodes.filter(n=>n.geometry).length,e.owners.length,'draw-owner coverage incomplete');
 const publicM=new Map(s.character.materials.map(m=>[m.uuid,m]));assert.equal(publicM.size,s.character.materials.length);assert.equal(publicM.size,e.materials.length,'public/private material coverage differs');
 assert.equal(e.materials.length,materialOwners.size,'uninventoried material owner');
 for(const m of e.materials){const owners=materialOwners.get(m.uuid);assert.ok(owners?.length&&owners.some(x=>x.startsWith(m.owner+'#')),'material owner missing');assert.ok(publicM.has(m.uuid),'public material missing');register(m.uuid,'material:'+JSON.stringify(owners.sort()),'material');}
 // Cross-check duplicate geometry references; no independent UUID normalizing here.
 for(const o of e.owners){const n=nodeById.get(o.uuid);assert.equal(n.geometry?.uuid,e.geometries[o.geometryAlias].uuid,'node geometry binding differs');}
 // New local observer may supply two complete bounded CPU noise resources.
 if(e.postprocess?.ao){const p=e.postprocess.ao;for(const[field,role,size]of [['gtaoNoise','gtao',5],['pdNoise','pd',64]]){
  const x=p[field];assert.ok(x?.sourceImageIdentity,'noise source identity missing');assert.equal(x.width,size);assert.equal(x.height,size);assert.equal(x.bytes,size*size*4);assert.match(x.sha256,/^[a-f0-9]{64}$/);
  register(x.uuid,'texture:ao-'+role,'texture');register(x.sourceUuid,'source:ao-'+role,'source');
  const mat=p[role];assert.ok(mat);register(mat.uuid,'material:ao-'+role,'material');assert.equal(mat.uniforms.tNoise.uuid,x.uuid,'AO texture binding mismatch');
 }assert.equal(p.gtaoBinding,true);assert.equal(p.pdBinding,true);}
 // Only the explicit resource roles actually referenced in the saved b9 snapshot.
 if(e.nativeResources){
  const z=e.nativeResources;assert.equal(z.schema,1);
  const texture=(t,role)=>{assert.ok(t);assert.equal(t.sourceImageIdentity,true);assert.ok(Number.isInteger(t.width)&&t.width>0&&Number.isInteger(t.height)&&t.height>0);register(t.uuid,'texture:'+role,'texture');register(t.sourceUuid,'source:'+role,'source');};
  assert.equal(z.dfg.length,1);const d=z.dfg[0];texture(d.texture,'dfg');assert.equal(d.name,'DFG_LUT');assert.equal(d.texture.width,16);assert.equal(d.texture.height,16);assert.equal(d.texture.arrayType,'Uint16Array');assert.equal(d.texture.bytes,1024);assert.equal(d.texture.type,1016);assert.equal(d.texture.format,1030);assert.equal(d.texture.sha256,'b41ba8e2bd29fa007dfbf034d4d58b853f378062183847846b1f6d228f2c7e79');
  const dm=e.materials.filter(m=>m.privateUniforms?.dfgLUT?.uuid);assert.ok(dm.length>0);assert.deepEqual([...d.materialUuids].sort(),dm.map(m=>m.uuid).sort());for(const m of dm)assert.equal(m.privateUniforms.dfgLUT.uuid,d.texture.uuid);
  const env=z.environment;assert.ok(env);assert.equal(env.rtIdentity,true);assert.equal(env.sceneIdentity,true);texture(env.texture,'environment');assert.equal(env.texture.isRenderTargetTexture,true);assert.equal(env.rtWidth,env.texture.width);assert.equal(env.rtHeight,env.texture.height);assert.equal(s.presentation.environment.uuid,env.texture.uuid);
  const em=e.materials.filter(m=>m.privateUniforms?.envMap?.uuid);assert.deepEqual(env.bindings.map(b=>b.materialUuid).sort(),em.map(m=>m.uuid).sort());for(const b of env.bindings){assert.equal(b.isEnvironment,true);assert.equal(b.textureUuid,env.texture.uuid);assert.equal(e.materials.find(m=>m.uuid===b.materialUuid).privateUniforms.envMap.uuid,b.textureUuid);}
  const atlas=z.atlas;assert.ok(atlas);texture(atlas.texture,'paint-atlas');assert.equal(atlas.rtIdentity,true);assert.equal(atlas.size,4096);assert.equal(atlas.rtWidth,4096);assert.equal(atlas.rtHeight,4096);assert.equal(atlas.texture.width,4096);assert.equal(atlas.texture.height,4096);assert.equal(atlas.texture.isRenderTargetTexture,true);assert.equal(s.atlasTexture.uuid,atlas.texture.uuid);
  const bone=z.skeleton;assert.ok(bone);texture(bone.texture,'character-bone-palette');assert.equal(bone.cpuIdentity,true);assert.equal(bone.texture.arrayType,'Float32Array');assert.equal(bone.texture.type,1015);assert.equal(bone.texture.format,1023);assert.equal(bone.texture.bytes,bone.texture.width*bone.texture.height*16);assert.ok(bone.texture.bytes<=65536);assert.match(bone.texture.sha256,/^[a-f0-9]{64}$/);assert.equal(s.character.boneTexture.uuid,bone.texture.uuid);assert.ok(bone.ownerMeshUuids.length>0);for(const id of bone.ownerMeshUuids){const owner=e.owners.find(o=>o.uuid===id);assert.ok(owner);assert.equal(owner.bones?.length,bone.boneCount);}
  assert.deepEqual(z.lights.map(l=>l.role),['sun','hemi']);assert.equal(s.presentation.lightsTruncated,false);assert.equal(s.presentation.lights.length,2);for(const l of z.lights){assert.equal(l.sceneIdentity,true);assert.equal(l.name,l.role==='sun'?'Sun':'SkyFill');assert.equal(l.type,l.role==='sun'?'DirectionalLight':'HemisphereLight');const observed=s.presentation.lights.find(x=>x.uuid===l.uuid);assert.ok(observed);assert.equal(observed.name,l.name);assert.equal(observed.type,l.type);register(l.uuid,'light:environment-'+l.role,'light');}
 }
 const rules=[
  [/^entryObservation\.geometries\.\d+\.uuid$/,'geometry'],
  [/^entryObservation\.owners\.\d+\.uuid$/,'node'],
  [/^entryObservation\.owners\.\d+\.bones\.\d+\.uuid$/,'node'],
  [/^entryObservation\.owners\.\d+\.materialUuids\.\d+$/,'material'],
  [/^entryObservation\.nodeGraph\.\d+\.uuid$/,'node'],
  [/^entryObservation\.materials\.\d+\.uuid$/,'material'],
  [/^character\.nodes\.\d+\.uuid$/,'node'],
  [/^character\.nodes\.\d+\.geometry\.uuid$/,'geometry'],
  [/^character\.materials\.\d+\.uuid$/,'material'],
  [/^entryObservation\.postprocess\.ao\.(gtao|pd)Noise\.uuid$/,'texture'],
  [/^entryObservation\.postprocess\.ao\.(gtao|pd)Noise\.sourceUuid$/,'source'],
  [/^entryObservation\.postprocess\.ao\.(gtao|pd)\.uuid$/,'material'],
  [/^entryObservation\.postprocess\.ao\.(gtao|pd)\.uniforms\.tNoise\.uuid$/,'texture']
 ];
 if(e.nativeResources)rules.push(
 [/^entryObservation\.nativeResources\.(?:dfg\.0|environment|atlas|skeleton)\.texture\.uuid$/,'texture'],
 [/^entryObservation\.nativeResources\.(?:dfg\.0|environment|atlas|skeleton)\.texture\.sourceUuid$/,'source'],
 [/^entryObservation\.nativeResources\.dfg\.0\.materialUuids\.\d+$/,'material'],
 [/^entryObservation\.nativeResources\.environment\.bindings\.\d+\.materialUuid$/,'material'],
 [/^entryObservation\.nativeResources\.environment\.bindings\.\d+\.textureUuid$/,'texture'],
 [/^entryObservation\.nativeResources\.skeleton\.ownerMeshUuids\.\d+$/,'node'],
 [/^entryObservation\.nativeResources\.lights\.\d+\.uuid$/,'light'],
 [/^entryObservation\.materials\.\d+\.privateUniforms\.(dfgLUT|envMap)\.uuid$/,'texture'],
 [/^presentation\.environment\.uuid$/,'texture'],[/^presentation\.lights\.\d+\.uuid$/,'light'],
 [/^character\.boneTexture\.uuid$/,'texture'],[/^atlasTexture\.uuid$/,'texture']);
 const unknown=[],references=inventoryUUIDs(s);
 for(const ref of references){const path=ref.path.join('.'),rule=rules.find(([r])=>r.test(path)),def=raw.get(ref.uuid);
  if(!rule||!def||rule[1]!==def.kind){unknown.push({...ref,reason:!rule?'uninventoried reference':!def?'resource lacks owner/content evidence':'resource kind mismatch'});continue;}
  let at=s;for(const key of ref.path.slice(0,-1))at=at[key];at[ref.path.at(-1)]={$semanticIdentity:def.key};
 }
 return{complete:unknown.length===0,unknown,definitions,rawReferences:references,normalized:s};
}
function compareSemanticSnapshots(before,after){
 const rawEqual=JSON.stringify(before)===JSON.stringify(after),rawIdsEqual=JSON.stringify(inventoryUUIDs(before))===JSON.stringify(inventoryUUIDs(after));let a,b,error=null,semanticEqual=false;
 try{a=semanticSnapshot(before);b=semanticSnapshot(after);assert.equal(a.complete,true,'baseline uninventoried references');assert.equal(b.complete,true,'candidate uninventoried references');assert.deepEqual(b.normalized,a.normalized,'semantic content, ownership, alias or strict scalar mismatch');semanticEqual=true;}catch(e){error=e.message;}
 return{rawEqual,rawIdsEqual,semanticEqual,error,before:a,after:b};
}
// Preserve the old whole-condition result; only explicitly inventoried snapshot UUIDs
// receive semantic identities. All loaded resources, gameplay and other state stay strict.
function compareReplaySemanticCondition(actual,expected){
 let rawEqual=true;try{assert.deepEqual(actual,expected);}catch{rawEqual=false;}
 const observations=[];try{
 const a=structuredClone(actual),b=structuredClone(expected);
 assert.equal(a.renderStates.length,4);assert.equal(b.renderStates.length,4);
 for(let i=0;i<4;i++)for(const phase of ['before','afterRender','after']){
  const q=compareSemanticSnapshots(a.renderStates[i][phase],b.renderStates[i][phase]);
  observations.push({ordinal:i,phase,rawEqual:q.rawEqual,rawIdsEqual:q.rawIdsEqual,semanticEqual:q.semanticEqual,error:q.error?.slice(0,2048)??null});
  assert.equal(q.semanticEqual,true,JSON.stringify(observations.at(-1)));
  a.renderStates[i][phase]=q.before.normalized;b.renderStates[i][phase]=q.after.normalized;
 }
 assert.deepEqual(a,b,'strict non-identity replay history/provenance changed');
 return{rawEqual,rawIdsEqual:observations.every(x=>x.rawIdsEqual),semanticEqual:true,observations};
 }catch(e){return{rawEqual,rawIdsEqual:observations.length===12&&observations.every(x=>x.rawIdsEqual),semanticEqual:false,error:e.message.slice(0,2048),observations};}
}
function requireReplayIdentityCoverage(e){
 assert.equal(e.renderStates.length,4);const rows=[];
 for(const c of e.renderStates)for(const phase of ['before','afterRender','after']){
  const s=c[phase];assert.equal(s.entryObservation.nativeResources?.schema,1,'native resource provenance missing');
  assert.ok(Array.isArray(s.entryObservation.nodeGraph),'native node graph missing');
  const m=semanticSnapshot(s);rows.push({ordinal:c.captureOrdinal,phase,complete:m.complete,definitions:m.definitions.length,unknown:m.unknown});
 }
 return{complete:rows.every(x=>x.complete),rows};
}
function requireSameReplay(actual,expected){assert.deepEqual(actual,expected,'same observed native render history and provenance; no counter/seed alignment');}
function requireReplayPixels(actual,expected){assert.ok(Buffer.isBuffer(actual)&&Buffer.isBuffer(expected));assert.ok(actual.equals(expected),'same capture ordinal whole-frame PNG bytes');}
function requireSettledMaterialEntry(observation, actualOrdinal, expectedOrdinal) {
 if(!Number.isInteger(expectedOrdinal)||expectedOrdinal<1||actualOrdinal!==expectedOrdinal)throw Error('Native frame ordinal mismatch');
 const {rig,input,jobs}=observation;
 if(rig.mode!=='follow'||!rig.target?.local||rig.blend?.active)throw Error('Native camera transition incomplete');
 if(input.mouse&&(input.mouse.dx!==0||input.mouse.dy!==0||input.mouse.left||input.mouse.right||input.mouse.leftPressed||input.mouse.rightPressed)||input.keys.length||input.pressed.length)throw Error('Non-neutral native input');
 if(jobs.lobby&&(!jobs.lobby.ready||jobs.lobby.failed))throw Error('Existing native lobby job incomplete');
 if(['hasJob','hasTask','hasActiveCharacter','hasPreparedCharacter'].some(k=>jobs.portrait[k]!==false)||jobs.portrait.inFlight!==0||jobs.portrait.queued!==0||jobs.portrait.warmState!=='done')throw Error('Existing native presentation work incomplete');
 return true;
}

function requireNativeMaterialPostprocess(p) {
 if(!p?.present||!p.ao||p.aoPassOrdinal<0||p.passes[p.aoPassOrdinal]?.enabled!==true)throw Error('Native high-quality AO pass missing');
 if(!p.ao.gtaoBinding||!p.ao.pdBinding)throw Error('Native noise uniform binding mismatch');
 for(const [name,size] of [['gtaoNoise',5],['pdNoise',64]]){
  const x=p.ao[name];if(!x||x.width!==size||x.height!==size||x.bytes!==size*size*4||!x.sourceImageIdentity||!x.uuid||!x.sourceUuid||!Number.isInteger(x.version)||x.version<1||!/^[0-9a-f]{64}$/.test(x.sha256))throw Error('Native CPU noise evidence incomplete');
 }
 if(p.ao.gtaoNoise.uuid===p.ao.pdNoise.uuid)throw Error('Native distinct noise resources aliased');
 return true;
}

function requireConditioningRecord(c){
 assert.equal(c?.status,'ready');assert.equal(c.diagnosticOnly,true);assert.equal(c.performanceAccepted,false);
 assert.equal(c.frames,28);assert.equal(c.actualFrames,28);assert.equal(c.dt,1/60);assert.equal(c.duration,.45);
 assert.deepEqual(c.trace.map(x=>x.ordinal),Array.from({length:29},(_,i)=>i));
 requireSettledMaterialEntry(c.after,28,28);return true;
}
function runReplayDiagnostic(){
 const sourceSha='cc0c90afe8031643e6a890974f8f44a40a30509e';assert.match(sourceSha,/^[0-9a-f]{40}$/,'reviewed common runtime head must be fixed before execution');const labels=['unpainted','painted','repeat','repeat2'];
 const sha=x=>createHash('sha256').update(x).digest('hex'),rows=[],checks=[];
 const check=(name,fn)=>{try{fn();checks.push({name,passed:true});}catch(e){checks.push({name,passed:false,error:e.message.slice(0,2048),errorTruncated:e.message.length>2048});}};
 const negative={rendererFrame:123,captureOrdinal:1,rngState:7,clocks:{game:.05},atlasHash:'atlas',sourceSha,style:{hair:0}};
 requireSameReplay(structuredClone(negative),negative);
 for(const bad of [{...negative,rendererFrame:124},{...negative,captureOrdinal:2},{...negative,rngState:8},
  {...negative,clocks:{game:.06}},{...negative,atlasHash:'other'},{...negative,sourceSha:'other'},{...negative,style:{hair:1}}])
  assert.throws(()=>requireSameReplay(bad,negative),assert.AssertionError);
 requireReplayPixels(Buffer.from([1,2,3]),Buffer.from([1,2,3]));
 assert.throws(()=>requireReplayPixels(Buffer.from([1,2,4]),Buffer.from([1,2,3])),assert.AssertionError);
 print({phase:'replay-negative-controls',status:'passed',diagnosticOnly:true,rejected:['renderer frame','capture ordinal','RNG state','clock','atlas','source','style','one-byte image difference']});
 // Three fresh browsers only. Save B even when the inherited sequential zero-repeat gate rejects A.
 // Each short diagnostic is bounded to five minutes; no 120-frame measurement or timeout extension.
 for(const [lane,variant]of [['A1','A'],['A2','A'],['B1','B']]){
  const out=path.join(root,lane);let childError=null;
  try{execFileSync(process.execPath,['scripts/check-inkwave-material-native-frame.mjs',site,source,overlay,out,variant,settledDiagnostic?'--settled-diagnostic':'--diagnostic'],{stdio:'inherit',timeout:300000});}
  catch(e){childError={message:e.message,status:e.status,signal:e.signal,code:e.code};}
  const row={lane,variant,out,childError};rows.push(row);
  if(settledDiagnostic){
   try{const c=JSON.parse(fs.readFileSync(path.join(out,'entry-conditioning.json'),'utf8'));requireConditioningRecord(c);row.conditioning=c;}
   catch(e){row.conditioningError=e.message;checks.push({name:lane+' entry conditioning',passed:false,error:e.message});print({phase:'entry-conditioning-incomplete',lane,error:e.message,diagnosticOnly:true,performanceAccepted:false});break;}
  }
  check(lane+' evidence integrity',()=>{
   const receipt=JSON.parse(fs.readFileSync(path.join(out,'receipt.json'),'utf8')),e=JSON.parse(fs.readFileSync(path.join(out,'pixel-diagnostic.json'),'utf8'));
   row.receipt=receipt;row.evidence=e;
   assert.equal(receipt.sourceSha,sourceSha);assert.equal(receipt.variant,variant);assert.equal(receipt.diagnosticOnly,true);assert.equal(receipt.performanceAccepted,false);
   assert.deepEqual(receipt.errors,[]);assert.ok(['passed','failed'].includes(receipt.status));
   if(receipt.status==='passed')assert.equal(childError,null,'passed receipt requires successful child completion');
   else{if(/Native entry readiness failed:/.test(receipt.error)){assert.equal(e.entryReadiness?.passed,false);assert.ok(receipt.error.includes('Native entry readiness failed: '+e.entryReadiness.error));}else assert.match(receipt.error,/Paint visibility or frozen-repeat gate failed:/);assert.equal(childError?.status,1);assert.ok(!childError.signal&&!childError.code,'expected rejection must not be a signal/timeout/launch error');}
   assert.equal(e.diagnosticOnly,true);assert.equal(e.performanceAccepted,false);assert.equal(e.width,960);assert.equal(e.height,600);assert.equal(e.glError,0);
   assert.ok(e.paintSignal.changed>1000);assert.match(e.atlasHash,/^[a-f0-9]{64}$/);
   assert.deepEqual(e.renderStates.map(x=>[x.label,x.captureOrdinal]),labels.map((x,i)=>[x,i]));
   for(const capture of e.renderStates)for(const key of ['before','afterRender','after']){
    const state=capture[key];assert.equal(state.entryObservation?.truncated,false);assert.ok(state.entryObservation.geometries.length>0);assert.ok(state.entryObservation.owners.length>0);assert.ok(state.entryObservation.geometries.every(x=>/^[a-f0-9]{64}$/.test(x.contentSha256)));assert.ok(Number.isInteger(state.rendererFrame));assert.ok(Number.isInteger(state.rngState));
    if(settledDiagnostic)requireNativeMaterialPostprocess(state.entryObservation.postprocess);
    assert.equal(state.character.nodesTruncated,false);assert.equal(state.character.materialsTruncated,false);
    assert.equal(state.character.boneMatrices.truncated,false);assert.equal(state.presentation.lightsTruncated,false);
    assert.ok(state.character.materials.every(m=>m.uniformCount<=128));
   }
   assert.deepEqual(e.images.map(x=>x.file),labels.map(x=>x+'.png'));
   row.images=e.images.map(x=>{assert.equal(x.width,960);assert.equal(x.height,600);const bytes=fs.readFileSync(path.join(out,x.file));
    assert.equal(sha(bytes),x.sha256);assert.ok(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
    assert.equal(bytes.toString('ascii',12,16),'IHDR');assert.equal(bytes.readUInt32BE(16),960);assert.equal(bytes.readUInt32BE(20),600);return bytes;});
   const bound=receipt.overlay,target='_versions/'+bound.revision+'/src/world/inkShading.js';
   assert.equal(bound.sourceSha,sourceSha);assert.equal(bound.sourceTree,'de64f6d82cdf518b9acbc4ce3ae7c897509b406c');assert.equal(bound.commonVariant,'A');assert.equal(bound.overlayVariant,'B');assert.equal(bound.inputHash,receipt.inputHash);assert.equal(bound.contentHash,receipt.contentHash);
   const loaded=new Map(receipt.loaded);assert.equal(loaded.get(target),variant==='A'?bound.baselineEmittedSha256:bound.candidateEmittedSha256);
   row.condition={sourceSha,inputHash:receipt.inputHash,contentHash:receipt.contentHash,overlay:bound,environment:receipt.environment,
    loadedExceptMaterial:[...loaded].filter(([k])=>k!==target).sort((a,b)=>a[0].localeCompare(b[0])),
    ...(settledDiagnostic?{conditioning:{frames:e.conditioning.frames,actualFrames:e.conditioning.actualFrames,dt:e.conditioning.dt,duration:e.conditioning.duration,before:e.conditioning.before,afterFrames:e.conditioning.afterFrames,after:e.conditioning.after}}:{}),
    entryConditionTrace:e.entryConditionTrace,entryReadiness:e.entryReadiness,initial:e.initial,atlasHash:e.atlasHash,atlasConditions:e.atlasConditions,fixture:e.fixture,state:e.state,placements:e.placements,renderStates:e.renderStates};
   assert.ok(row.condition.initial&&row.condition.fixture&&row.condition.renderStates.length===4);
   row.integrity=true;
  });
  if(settledDiagnostic){
   try{assert.ok(row.integrity,'evidence integrity required');row.identityCoverage=requireReplayIdentityCoverage(row.evidence);assert.equal(row.identityCoverage.complete,true,'unknown semantic identity references');}
   catch(e){row.identityError=e.message.slice(0,2048);checks.push({name:lane+' semantic identity inventory',passed:false,error:row.identityError});print({phase:'identity-inventory-incomplete',lane,coverage:row.identityCoverage,error:row.identityError,diagnosticOnly:true,performanceAccepted:false});break;}
  }
  check(lane+' native entry settled',()=>{assert.ok(row.integrity);const e=row.evidence;const expected=settledDiagnostic?28:3;assert.deepEqual(e.entryConditionTrace.map(x=>x.ordinal),Array.from({length:expected+1},(_,i)=>i));if(settledDiagnostic){assert.equal(e.conditioning.frames,28);assert.equal(e.conditioning.actualFrames,28);assert.equal(e.conditioning.dt,1/60);assert.equal(e.conditioning.duration,.45);assert.deepEqual(row.conditioning.trace,e.entryConditionTrace);assert.deepEqual(row.conditioning.after,e.conditioning.after);}requireSettledMaterialEntry(settledDiagnostic?e.conditioning.after:e.entryConditionTrace.at(-1).state,e.entryReadiness.actualNativeFrames,e.entryReadiness.expectedNativeFrames);assert.equal(e.entryReadiness.expectedNativeFrames,expected);assert.equal(e.entryReadiness.passed,true);assert.equal(e.entryReadiness.error,null);});
  print({phase:'replay-lane-recorded',lane,variant,integrity:!!row.integrity,childError,sequentialStatus:row.receipt?.status,
   sequentialError:row.receipt?.error,paintSignal:row.evidence?.paintSignal,repeatSignal:row.evidence?.repeatSignal,repeat2Signal:row.evidence?.repeat2Signal,
   entryReadiness:row.evidence?.entryReadiness,imageHashes:row.evidence?.images,diagnosticOnly:true,performanceAccepted:false});
  if(childError?.code==='ETIMEDOUT'){checks.push({name:'bounded child completion',passed:false,error:lane+' timed out; stop instead of launching more browsers after an uncertain shutdown'});break;}
 }
 const [a1,a2,b1]=rows;
 const semanticReplay={};
 check('A1/A2 observed history and provenance',()=>{assert.ok(a1?.integrity&&a2?.integrity);if(settledDiagnostic){semanticReplay.AA=compareReplaySemanticCondition(a2.condition,a1.condition);assert.equal(semanticReplay.AA.semanticEqual,true,semanticReplay.AA.error);}else requireSameReplay(a2.condition,a1.condition);});
 check('A1/A2 all four exact capture ordinals',()=>{assert.ok(a1?.integrity&&a2?.integrity);for(let i=0;i<4;i++)requireReplayPixels(a2.images[i],a1.images[i]);});
 check('B1 observed history and provenance',()=>{assert.ok(a1?.integrity&&b1?.integrity);if(settledDiagnostic){semanticReplay.AB=compareReplaySemanticCondition(b1.condition,a1.condition);assert.equal(semanticReplay.AB.semanticEqual,true,semanticReplay.AB.error);}else requireSameReplay(b1.condition,a1.condition);});
 const aaChecks=checks.filter(x=>x.name.startsWith('A1/A2'));
 const sequentialZeroRepeatAccepted=rows.length===3&&rows.every(x=>x.integrity&&x.receipt.status==='passed'&&x.evidence.repeatSignal.changed===0);
 const report={status:checks.every(x=>x.passed)&&sequentialZeroRepeatAccepted?'diagnostic-recorded':'failed',
  sourceSha,diagnosticOnly:true,performanceAccepted:false,observedHistoryAAReplayEqual:aaChecks.length===2&&aaChecks.every(x=>x.passed),
  sequentialZeroRepeatAccepted,candidateBBReplayMeasured:false,checks,semanticReplay,
  lanes:rows.map(x=>({lane:x.lane,variant:x.variant,directory:x.out,integrity:!!x.integrity,status:x.receipt?.status,error:x.receipt?.error,
   entryReadiness:x.evidence?.entryReadiness,identityCoverage:x.identityCoverage,identityError:x.identityError,childError:x.childError,paintSignal:x.evidence?.paintSignal,repeatSignal:x.evidence?.repeatSignal,repeat2Signal:x.evidence?.repeat2Signal,imageHashes:x.evidence?.images})),
  limitations:['B1 is an observation, not a B/B reproducibility proof or accepted improvement.',
   'Bounded CPU state includes cached private uniforms, not complete shader/GPU state; no cause is inferred.',
   'Existing spawn barrier remains visible; not a pure retail floor-lighting comparison.',
   'No performance samples, physical GPU/iPad measurements, or few-percent budget acceptance.']};
 fs.writeFileSync(path.join(root,'replay-diagnostic.json'),JSON.stringify(report,null,2));print({phase:'replay-diagnostic-summary',...report});
 if(report.status==='failed')process.exitCode=1;
}
const settledDiagnostic=mode==='--settled-replay-diagnostic';assert.ok(mode===undefined||mode==='--replay-diagnostic'||settledDiagnostic);
if(mode==='--replay-diagnostic'||settledDiagnostic){runReplayDiagnostic();process.exit(process.exitCode||0);}

const median=a=>{const s=[...a].sort((x,y)=>x-y);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
const stats=a=>{assert.ok(a.length&&a.every(Number.isFinite));const m=median(a);return{n:a.length,mean:a.reduce((x,y)=>x+y,0)/a.length,median:m,mad:median(a.map(x=>Math.abs(x-m))),min:Math.min(...a),max:Math.max(...a),p95:[...a].sort((x,y)=>x-y)[Math.ceil(.95*a.length)-1]};};
const requireSameCondition=(actual,expected)=>assert.deepEqual(actual,expected,'same native world/camera/paint/clocks/workload across all lanes');
const requireMaterialSignal=(before,after)=>assert.notEqual(before,after,'actual painted material sensitivity');
// Negative controls exercise the exact acceptance predicates before launching browsers.
const control={clocks:{game:3,paint:3},atlasHash:'painted-atlas',camera:[0,1,2]};
requireSameCondition(structuredClone(control),control);
for(const bad of [{...control,clocks:{game:4,paint:3}},{...control,atlasHash:'wrong-atlas'},{...control,camera:[0,1,3]}])
 assert.throws(()=>requireSameCondition(bad,control),assert.AssertionError);
requireMaterialSignal('original-painted','candidate-painted');
assert.throws(()=>requireMaterialSignal('same-painted','same-painted'),assert.AssertionError);
print({phase:'condition-negative-controls',status:'passed',rejected:['clock drift','atlas mismatch','camera mismatch','zero material signal']});
const blocks=[];let reference=null;
for(let block=0;block<3;block++){
 const rows=[];
 for(const [order,variant]of ['A','B','B','A'].entries()){
  const out=path.join(root,block+'-'+order+'-'+variant);
  execFileSync(process.execPath,['scripts/check-inkwave-material-native-frame.mjs',site,source,overlay,out,variant],{stdio:'inherit',timeout:900000});
  const row=JSON.parse(fs.readFileSync(path.join(out,'receipt.json'),'utf8'));assert.equal(row.status,'passed');assert.equal(row.variant,variant);
  assert.equal(row.sourceSha,'cc0c90afe8031643e6a890974f8f44a40a30509e');assert.equal(row.result.samples.length,120);
  const r=row.result,condition={inputHash:row.inputHash,contentHash:row.contentHash,environment:row.environment,initial:r.initial,placements:r.placements,atlasHash:r.atlasHash,beforeWarm:r.beforeWarm,before:r.before,after:r.after,conditions:r.conditions,gpu:r.gpu};
  if(!reference)reference=condition;else requireSameCondition(condition,reference);
  const cost=r.samples.map(({frame,renderCalls,webglPasses,drawCalls,triangles,resources})=>({frame,renderCalls,webglPasses,drawCalls,triangles,resources}));
  if(rows.length)assert.deepEqual(cost,rows[0].cost,'same per-frame render burden');
  const metrics=Object.fromEntries(['frameCpuMs','renderCpuMs','webglSubmitMs'].map(k=>[k,stats(r.samples.map(s=>s[k]))]));
  metrics.completedTransactionMsPerFrame={mean:r.completedTransactionMsPerFrame,n:1,scope:'whole 120-frame transaction plus final completion wait, normalized per frame; not GPU time'};
  rows.push({variant,order,directory:out,metrics,cost,pixels:r.pixels,completionDrainMs:r.completionDrainMs});
  print({phase:'native-observation',block,order,variant,sourceSha:row.sourceSha,conditions:r.conditions,initial:r.initial,before:r.before,after:r.after,paint:{samples:r.placements.length,atlasHash:r.atlasHash,pixels:r.pixels},metrics,completionDrainMs:r.completionDrainMs,gpu:r.gpu,allocations:r.allocations,scope:r.scope});
 }
 assert.equal(rows[0].pixels.unpainted,rows[1].pixels.unpainted,'unpainted original/candidate must match');
 assert.equal(rows[0].pixels.painted,rows[3].pixels.painted,'A repeat pixels');assert.equal(rows[1].pixels.painted,rows[2].pixels.painted,'B repeat pixels');
 requireMaterialSignal(rows[0].pixels.painted,rows[1].pixels.painted);
 const paired=Object.fromEntries(['frameCpuMs','renderCpuMs','webglSubmitMs','completedTransactionMsPerFrame'].map(k=>{
  const before=(rows[0].metrics[k].mean+rows[3].metrics[k].mean)/2,after=(rows[1].metrics[k].mean+rows[2].metrics[k].mean)/2;
  assert.ok(before>0&&after>0&&Number.isFinite(before)&&Number.isFinite(after));
  return[k,{beforeMeanMs:before,afterMeanMs:after,deltaMs:after-before,deltaPercent:(after/before-1)*100}];
 }));
 blocks.push({block,rows,paired});print({phase:'paired-native-block',block,paired});
}
const summary=Object.fromEntries(['frameCpuMs','renderCpuMs','webglSubmitMs','completedTransactionMsPerFrame'].map(k=>[k,{beforeMeanMs:stats(blocks.map(b=>b.paired[k].beforeMeanMs)),afterMeanMs:stats(blocks.map(b=>b.paired[k].afterMeanMs)),deltaMs:stats(blocks.map(b=>b.paired[k].deltaMs)),deltaPercent:stats(blocks.map(b=>b.paired[k].deltaPercent))}]));
const report={status:'passed',sourceSha:'cc0c90afe8031643e6a890974f8f44a40a30509e',scenario:'native practice range',blocks,summary,
 performanceAccepted:false,scope:'3 ABBA blocks; 12 observations x120 full native fixed frames, not independent 1440 benchmark repeats',
 rangeObservedWithinThreePercent:summary.frameCpuMs.deltaPercent.max<=3&&summary.completedTransactionMsPerFrame.deltaPercent.max<=3,
 limitations:['Object-stage scenario still required.','Three paired blocks describe observed spread, not a device-level confidence bound.','SwiftShader CPU submission is not physical GPU time or iPad performance.','Live presented FPS and allocation rate are unmeasured.','Frame/readback sensitivity validates workload, not retail fidelity.']};
fs.writeFileSync(path.join(root,'paired-result.json'),JSON.stringify(report,null,2));print({status:report.status,sourceSha:report.sourceSha,summary,performanceAccepted:false,rangeObservedWithinThreePercent:report.rangeObservedWithinThreePercent,limitations:report.limitations});
