// QA-only semantic identity. No mutation, UUID deletion, or runtime access.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function inventoryUUIDs(value){const out=[];let visits=0;const active=new Set();function walk(v,path){assert.ok(path.length<=64&&++visits<=1000000,'UUID inventory bound');if(typeof v==='string'&&UUID.test(v))out.push({path,uuid:v});else if(v&&typeof v==='object'){assert.ok(!active.has(v),'UUID inventory cycle');active.add(v);for(const[k,x]of Object.entries(v))walk(x,[...path,k]);active.delete(v);}}walk(value,[]);return out;}
export function semanticSnapshot(snapshot){
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
export function compareSemanticSnapshots(before,after){
 const rawEqual=JSON.stringify(before)===JSON.stringify(after),rawIdsEqual=JSON.stringify(inventoryUUIDs(before))===JSON.stringify(inventoryUUIDs(after));let a,b,error=null,semanticEqual=false;
 try{a=semanticSnapshot(before);b=semanticSnapshot(after);assert.equal(a.complete,true,'baseline uninventoried references');assert.equal(b.complete,true,'candidate uninventoried references');assert.deepEqual(b.normalized,a.normalized,'semantic content, ownership, alias or strict scalar mismatch');semanticEqual=true;}catch(e){error=e.message;}
 return{rawEqual,rawIdsEqual,semanticEqual,error,before:a,after:b};
}
