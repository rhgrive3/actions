// Narrow QA evidence for the four texture roles and two lights present in b9.
// No creation, rendering, GPU readback, cache population or native mutations.
export function observeNativeIdentityResources({G,r,a,roots,materials},hashBytes) {
 const ch=a.character,out={schema:1};
 const texture=t=>{if(!t)return null;const i=t.image;return{uuid:t.uuid,sourceUuid:t.source?.uuid??null,version:t.version,sourceVersion:t.source?.version,width:i?.width,height:i?.height,type:t.type,format:t.format,mapping:t.mapping,colorSpace:t.colorSpace,minFilter:t.minFilter,magFilter:t.magFilter,wrapS:t.wrapS,wrapT:t.wrapT,generateMipmaps:t.generateMipmaps,isRenderTargetTexture:!!t.isRenderTargetTexture,sourceImageIdentity:t.source?.data===i};};
 const cpu=(t,Ctor,maxBytes)=>{const v=texture(t),d=t?.image?.data;if(!v||!(d instanceof Ctor)||d.byteLength>maxBytes)throw Error('Bounded identity CPU texture missing');return{...v,arrayType:d.constructor.name,bytes:d.byteLength,sha256:hashBytes(new Uint8Array(d.buffer,d.byteOffset,d.byteLength))};};
 if(!Array.isArray(roots)||roots.length>2048||roots[0]!==ch.root||!(materials instanceof Set)||materials.size>256)throw Error('Existing resource owner inventory missing');
 const dfg=new Map(),envBindings=[];
 for(const m of materials){
  if(!r.properties.has(m))continue;const u=r.properties.get(m).uniforms;if(!u)continue;
  if(u.dfgLUT?.value){const t=u.dfgLUT.value,owners=dfg.get(t)||[];owners.push(m.uuid);dfg.set(t,owners);if(dfg.size>1)throw Error('Native singleton LUT alias split');}
  if(u.envMap?.value)envBindings.push({materialUuid:m.uuid,textureUuid:u.envMap.value.uuid,isEnvironment:u.envMap.value===G.scene?.environment});
 }
 out.dfg=[...dfg].map(([t,materialUuids])=>({texture:cpu(t,Uint16Array,1024),name:t.name,materialUuids}));
 const env=G.env;
 out.environment=env?{texture:texture(env.envMap),rtIdentity:env.envMap===env._envRT?.texture,sceneIdentity:G.scene?.environment===env.envMap,rtWidth:env._envRT?.width,rtHeight:env._envRT?.height,bindings:envBindings}:null;
 const p=G.paint;
 out.atlas=p?{texture:texture(p.texture),rtIdentity:p.texture===p.rt?.texture,size:p.size,rtWidth:p.rt?.width,rtHeight:p.rt?.height}:null;
 const sk=ch.skeleton;
 out.skeleton=sk?.boneTexture?{texture:cpu(sk.boneTexture,Float32Array,65536),cpuIdentity:sk.boneTexture.image.data===sk.boneMatrices,boneCount:sk.bones.length,ownerMeshUuids:roots.filter(o=>o.skeleton===sk).map(o=>o.uuid)}:null;
 out.lights=env?['sun','hemi'].map(role=>{const l=env[role];return{role,uuid:l?.uuid,name:l?.name,type:l?.type,sceneIdentity:l?.parent===G.scene};}):[];
 return out;
}
