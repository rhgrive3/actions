// Bounded, read-only evidence for the nine native owners actually missing in 562582 A1.
// No allocation of native objects, cache access, GPU reads, callback or renderer calls.
export function observePostprocessIdentityOwners(g, hashBytes) {
 const need=(v,m)=>{if(!v)throw Error('Postprocess owner: '+m);};
 const R=g.R,c=R?.composer,p=c?.passes,ao=R?.gtao,fx=g.screenfx;
 need(Array.isArray(p)&&p.length===6,'exact six-pass fixture');
 need(p[0]===R.renderPass&&p[1]===ao&&p[2]===R.bloom,'native leading pass order');
 need(p[3]===R.grade&&p[4]===R.extraPass&&p[4]===fx?.pass&&p[4].material===fx?.mat,'grade/screen owner order');
 need(p[5]?.isOutputPass===true&&p.filter(x=>x.isOutputPass).length===1,'unique final output owner');
 const rt1=c.renderTarget1,rt2=c.renderTarget2,nrt=ao?.normalRenderTarget,art=ao?.gtaoRenderTarget,lrt=fx?.lens?.rt;
 need(rt1&&rt2&&rt1!==rt2&&new Set([c.readBuffer,c.writeBuffer]).size===2&&[c.readBuffer,c.writeBuffer].every(x=>x===rt1||x===rt2),'distinct owned ping-pong targets');
 need(nrt&&art&&lrt&&ao.depthTexture===nrt.depthTexture&&ao.normalTexture===nrt.texture,'AO native attachments');
 const tuples=[['composer1',rt1.texture,rt1],['composer2',rt2.texture,rt2],['lens',lrt.texture,lrt],['aoDepth',nrt.depthTexture,nrt],['aoNormal',nrt.texture,nrt],['aoGtao',art.texture,art]];
 need(new Set(tuples.map(x=>x[1])).size===6,'distinct native texture owners');
 const textures=tuples.map(([role,t,rt])=>{
  need(t?.isTexture&&t.source?.data===t.image&&t.renderTarget===rt,'texture source/RT owner '+role);
  need(Number.isInteger(t.version)&&t.version>=0&&Number.isInteger(t.source.version)&&t.source.version>=0&&Number.isInteger(rt.samples)&&rt.samples>=0,'texture versions/samples '+role);
  const i=t.image;need(Number.isInteger(i?.width)&&i.width>0&&Number.isInteger(i.height)&&i.height>0&&i.width===rt.width&&i.height===rt.height,'texture/RT dimensions '+role);
  need(role==='aoDepth'?t.isDepthTexture===true:t.isRenderTargetTexture===true,'texture kind '+role);
  return{role,uuid:t.uuid,sourceUuid:t.source.uuid,sourceImageIdentity:true,renderTargetIdentity:true,version:t.version,sourceVersion:t.source.version,width:i.width,height:i.height,rtWidth:rt.width,rtHeight:rt.height,rtSamples:rt.samples,type:t.type,format:t.format,mapping:t.mapping,colorSpace:t.colorSpace,minFilter:t.minFilter,magFilter:t.magFilter,wrapS:t.wrapS,wrapT:t.wrapT,generateMipmaps:t.generateMipmaps,isDepthTexture:!!t.isDepthTexture,isRenderTargetTexture:!!t.isRenderTargetTexture};
 });
 const hash=s=>{need(typeof s==='string'&&s.length<=65536,'bounded shader source');const b=new TextEncoder().encode(s);need(b.byteLength<=262144,'bounded shader bytes');return{bytes:b.byteLength,sha256:hashBytes(b)};};
 const materials=p.slice(3).map((pass,j)=>{
  const m=pass.material;need(m?.isShaderMaterial&&pass.uniforms===m.uniforms&&pass._fsQuad?.material===m,'pass material/uniform/quad ownership');
  need(j!==2||m.isRawShaderMaterial===true,'raw output material');
  need(Number.isInteger(m.version)&&m.version>=0,'material version');
  const d=Object.entries(m.defines||{}).sort(([a],[b])=>a.localeCompare(b));need(d.length<=64&&d.every(([k,v])=>k.length<=128&&['string','number','boolean'].includes(typeof v)&&String(v).length<=1024&&(typeof v!=='number'||Number.isFinite(v))),'bounded defines');
  return{role:['grade','screen','output'][j],ordinal:j+3,uuid:m.uuid,type:m.type,name:m.name,version:m.version,vertex:hash(m.vertexShader),fragment:hash(m.fragmentShader),defines:d,transparent:m.transparent,depthTest:m.depthTest,depthWrite:m.depthWrite,blending:m.blending,side:m.side,toneMapped:m.toneMapped,uniformOwner:true,quadOwner:true};
 });
 need(new Set(p.slice(3).map(x=>x.material)).size===3,'distinct postprocess materials');
 const bindings=[];
 const bind=(owner,sampler,t,allowed)=>{const role=tuples.find(x=>x[1]===t)?.[0];need(allowed.includes(role),'foreign sampler '+owner+'.'+sampler);bindings.push({owner,sampler,role,uuid:t.uuid});};
 for(const [j,role]of ['grade','screen','output'].entries())bind(role,'tDiffuse',p[j+3].material.uniforms.tDiffuse?.value,['composer1','composer2']);
 bind('screen','tLens',fx.mat.uniforms.tLens?.value,['lens']);
 for(const [role,m]of [['gtao',ao.gtaoMaterial],['pd',ao.pdMaterial]]){bind(role,'tDepth',m?.uniforms.tDepth?.value,['aoDepth']);bind(role,'tNormal',m?.uniforms.tNormal?.value,['aoNormal']);}
 bind('pd','tDiffuse',ao.pdMaterial.uniforms.tDiffuse?.value,['aoGtao']);
 return{schema:1,sourceContract:'c093-native-six-pass',gpuContentMeasured:false,materials,textures,bindings,pingPong:{read:c.readBuffer===rt1?'composer1':'composer2',write:c.writeBuffer===rt1?'composer1':'composer2'}};
}
