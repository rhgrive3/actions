import assert from 'node:assert/strict';
export function registerPostprocessOwners(e,register){
 const p=e.postprocess,z=p?.identityOwners;if(!z)return[];
 assert.equal(z.schema,1);assert.equal(z.sourceContract,'c093-native-six-pass');assert.equal(z.gpuContentMeasured,false);
 assert.equal(p.passes.length,6);assert.equal(p.aoPassOrdinal,1);
 const roles=['composer1','composer2','lens','aoDepth','aoNormal','aoGtao'];
 assert.deepEqual(z.textures.map(t=>t.role),roles);const textures=new Map(z.textures.map(t=>[t.role,t]));
 for(const t of z.textures){
  assert.equal(t.sourceImageIdentity,true);assert.equal(t.renderTargetIdentity,true);assert.ok(Number.isInteger(t.width)&&t.width>0&&Number.isInteger(t.height)&&t.height>0);assert.equal(t.width,t.rtWidth);assert.equal(t.height,t.rtHeight);assert.ok(Number.isInteger(t.rtSamples)&&t.rtSamples>=0);
  assert.ok(Number.isInteger(t.version)&&t.version>=0&&Number.isInteger(t.sourceVersion)&&t.sourceVersion>=0);
  if(t.role==='aoDepth')assert.equal(t.isDepthTexture,true);else assert.equal(t.isRenderTargetTexture,true);
  register(t.uuid,'texture:postprocess-'+t.role,'texture');register(t.sourceUuid,'source:postprocess-'+t.role,'source');
 }
 assert.deepEqual(z.materials.map(m=>m.role),['grade','screen','output']);
 for(const [i,m]of z.materials.entries()){
  assert.equal(m.ordinal,i+3);assert.equal(m.uuid,p.passes[m.ordinal].material.uuid);assert.equal(m.uniformOwner,true);assert.equal(m.quadOwner,true);assert.ok(Number.isInteger(m.version)&&m.version>=0);
  assert.equal(m.type,i===2?'RawShaderMaterial':'ShaderMaterial');
  for(const h of [m.vertex,m.fragment]){assert.ok(Number.isInteger(h.bytes)&&h.bytes>0&&h.bytes<=262144);assert.match(h.sha256,/^[a-f0-9]{64}$/);}
  assert.ok(Array.isArray(m.defines)&&m.defines.length<=64);register(m.uuid,'material:postprocess-'+m.role,'material');
 }
 const expected=[['grade','tDiffuse'],['screen','tDiffuse'],['output','tDiffuse'],['screen','tLens'],['gtao','tDepth'],['gtao','tNormal'],['pd','tDepth'],['pd','tNormal'],['pd','tDiffuse']];
 assert.deepEqual(z.bindings.map(b=>[b.owner,b.sampler]),expected);
 for(const b of z.bindings){
  const mat=['grade','screen','output'].includes(b.owner)?p.passes[['grade','screen','output'].indexOf(b.owner)+3].material:p.ao[b.owner];
  const t=textures.get(b.role);assert.ok(t);assert.equal(b.uuid,t.uuid);assert.equal(mat.uniforms[b.sampler].uuid,t.uuid,'postprocess sampler owner mismatch');
  assert.equal(mat.uniforms[b.sampler].version,t.version);assert.equal(mat.uniforms[b.sampler].sourceVersion,t.sourceVersion);
  const expectedRole=b.sampler==='tLens'?'lens':b.sampler==='tDepth'?'aoDepth':b.sampler==='tNormal'?'aoNormal':b.owner==='pd'?'aoGtao':null;
  if(expectedRole)assert.equal(b.role,expectedRole);else assert.ok(['composer1','composer2'].includes(b.role));
 }
 assert.ok(['composer1','composer2'].includes(z.pingPong.read)&&['composer1','composer2'].includes(z.pingPong.write));assert.notEqual(z.pingPong.read,z.pingPong.write);
 return[
 [/^entryObservation\.postprocess\.identityOwners\.textures\.[0-5]\.uuid$/,'texture'],
 [/^entryObservation\.postprocess\.identityOwners\.textures\.[0-5]\.sourceUuid$/,'source'],
 [/^entryObservation\.postprocess\.identityOwners\.materials\.[0-2]\.uuid$/,'material'],
 [/^entryObservation\.postprocess\.identityOwners\.bindings\.[0-8]\.uuid$/,'texture'],
 [/^entryObservation\.postprocess\.passes\.[3-5]\.material\.uuid$/,'material'],
 [/^entryObservation\.postprocess\.passes\.[3-5]\.material\.uniforms\.tDiffuse\.uuid$/,'texture'],
 [/^entryObservation\.postprocess\.passes\.4\.material\.uniforms\.tLens\.uuid$/,'texture'],
 [/^entryObservation\.postprocess\.ao\.(gtao|pd)\.uniforms\.(tDepth|tNormal)\.uuid$/,'texture'],
 [/^entryObservation\.postprocess\.ao\.pd\.uniforms\.tDiffuse\.uuid$/,'texture']];
}
