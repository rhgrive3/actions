// Endpoint-only WebGL2 observation. Install after warmup, wrap one real frame,
// then stop. No shader, uniform, draw, or production renderer is substituted.
export function installActualDrawReceipts(G) {
  const r=G.renderer,gl=r.getContext(),draws=[],programs=[],targets=[],unknownTextures=[];
  const programRows=new Map(),textureNames=new Map(),targetNames=new Map(),unknownNames=new Map();
  const saved=new Map();
  const scalar=v=>typeof v==='number'?Object.is(v,-0)?{negativeZero:true}:Number.isFinite(v)?v:{nonfinite:String(v)}:ArrayBuffer.isView(v)||Array.isArray(v)?Array.from(v,scalar):v;
  const objectPath=o=>{const parts=[];for(let p=o;p;p=p.parent)parts.push((p.name||p.type)+':'+(p.parent?p.parent.children.indexOf(p):0));return parts.reverse().join('/');};
  const nameTexture=(owner,t)=>{
    if(!t?.isTexture)return;
    const gpu=r.properties.get(t).__webglTexture;if(!gpu)return;
    if(!textureNames.has(gpu))textureNames.set(gpu,[]);
    if(!textureNames.get(gpu).includes(owner))textureNames.get(gpu).push(owner);
  };
  const nameTarget=(owner,t)=>{
    if(!t?.isWebGLRenderTarget)return;
    const p=r.properties.get(t);
    for(const key of ['__webglFramebuffer','__webglMultisampledFramebuffer']){
      const frames=Array.isArray(p[key])?p[key]:[p[key]];
      frames.forEach((fb,i)=>{if(fb){if(!targetNames.has(fb))targetNames.set(fb,[]);targetNames.get(fb).push(owner+'/'+key+'/'+i);}});
    }
    nameTexture(owner+'/texture',t.texture);nameTexture(owner+'/depthTexture',t.depthTexture);
  };
  const scan=(owner,o,depth=0)=>{
    if(!o||depth>6)return;
    if(o.isTexture){nameTexture(owner,o);return;}
    if(o.isWebGLRenderTarget){nameTarget(owner,o);return;}
    if(Array.isArray(o)){o.forEach((v,i)=>scan(owner+'/'+i,v,depth+1));return;}
    if(typeof o==='object')for(const [k,v]of Object.entries(o)){
      if(v?.isTexture||v?.isWebGLRenderTarget||k==='uniforms'||k==='userData'||k==='value'||owner.endsWith('/uniforms')||Array.isArray(v))scan(owner+'/'+k,v,depth+1);
    }
  };
  G.scene.traverse(o=>{
    const owner=objectPath(o);
    scan(owner+'/material',o.material);scan(owner+'/customDepthMaterial',o.customDepthMaterial);
    nameTexture(owner+'/boneTexture',o.skeleton?.boneTexture);
    nameTexture(owner+'/morphTexture',o.morphTexture);
    nameTarget(owner+'/shadowMap',o.shadow?.map);nameTarget(owner+'/shadowMapPass',o.shadow?.mapPass);
  });
  nameTexture('scene/environment',G.scene.environment);nameTexture('scene/background',G.scene.background);
  scan('environment',G.env);scan('composer',G.game?.R?.composer);
  for(const [key,u]of Object.entries(G.env?.U||{}))scan('environment/uniforms/'+key,u);
  for(const [i,p]of (G.game?.R?.composer?.passes||[]).entries())scan('composer/pass/'+i,p);
  for(const a of textureNames.values())a.sort();for(const a of targetNames.values())a.sort();
  const textureIdentity=t=>{
    if(!t)return null;
    if(textureNames.has(t))return {owners:textureNames.get(t)};
    if(!unknownNames.has(t)){unknownNames.set(t,unknownNames.size);unknownTextures.push({ordinal:unknownNames.get(t),unobserved:'GPU texture has no mapped production Texture owner'});}
    return {unknownTexture:unknownNames.get(t)};
  };
  const samplerTarget=type=>{
    if([gl.SAMPLER_2D,gl.SAMPLER_2D_SHADOW,gl.INT_SAMPLER_2D,gl.UNSIGNED_INT_SAMPLER_2D].includes(type))return [gl.TEXTURE_2D,gl.TEXTURE_BINDING_2D];
    if([gl.SAMPLER_CUBE,gl.SAMPLER_CUBE_SHADOW,gl.INT_SAMPLER_CUBE,gl.UNSIGNED_INT_SAMPLER_CUBE].includes(type))return [gl.TEXTURE_CUBE_MAP,gl.TEXTURE_BINDING_CUBE_MAP];
    if([gl.SAMPLER_3D,gl.INT_SAMPLER_3D,gl.UNSIGNED_INT_SAMPLER_3D].includes(type))return [gl.TEXTURE_3D,gl.TEXTURE_BINDING_3D];
    if([gl.SAMPLER_2D_ARRAY,gl.SAMPLER_2D_ARRAY_SHADOW,gl.INT_SAMPLER_2D_ARRAY,gl.UNSIGNED_INT_SAMPLER_2D_ARRAY].includes(type))return [gl.TEXTURE_2D_ARRAY,gl.TEXTURE_BINDING_2D_ARRAY];
    return null;
  };
  const program=()=>{
    const p=gl.getParameter(gl.CURRENT_PROGRAM);
    if(!programRows.has(p)){
      const info=r.info.programs.find(row=>row.program===p),ordinal=programs.length;
      const uniforms=[];
      for(let i=0;i<gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i++){
        const u=gl.getActiveUniform(p,i),location=gl.getUniformLocation(p,u.name);
        uniforms.push({name:u.name,size:u.size,type:u.type,location,samplerTarget:samplerTarget(u.type)});
      }
      uniforms.sort((a,b)=>a.name.localeCompare(b.name));
      const shaders=gl.getAttachedShaders(p).map(s=>({type:gl.getShaderParameter(s,gl.SHADER_TYPE),source:gl.getShaderSource(s)})).sort((a,b)=>a.type-b.type);
      const row={ordinal,cacheKey:info?.cacheKey??null,shaders,uniforms:uniforms.map(({location,samplerTarget,...u})=>u)};
      programs.push(row);programRows.set(p,{row,uniforms});
    }
    return {p,...programRows.get(p)};
  };
  const stateParameters=['VIEWPORT','SCISSOR_BOX','SCISSOR_TEST','DEPTH_TEST','DEPTH_FUNC','DEPTH_WRITEMASK','DEPTH_RANGE','BLEND','BLEND_SRC_RGB','BLEND_DST_RGB','BLEND_SRC_ALPHA','BLEND_DST_ALPHA','BLEND_EQUATION_RGB','BLEND_EQUATION_ALPHA','BLEND_COLOR','COLOR_WRITEMASK','CULL_FACE','CULL_FACE_MODE','FRONT_FACE','POLYGON_OFFSET_FILL','POLYGON_OFFSET_FACTOR','POLYGON_OFFSET_UNITS','STENCIL_TEST','STENCIL_FUNC','STENCIL_REF','STENCIL_VALUE_MASK','STENCIL_WRITEMASK','STENCIL_FAIL','STENCIL_PASS_DEPTH_FAIL','STENCIL_PASS_DEPTH_PASS','STENCIL_BACK_FUNC','STENCIL_BACK_REF','STENCIL_BACK_VALUE_MASK','STENCIL_BACK_WRITEMASK','STENCIL_BACK_FAIL','STENCIL_BACK_PASS_DEPTH_FAIL','STENCIL_BACK_PASS_DEPTH_PASS','DITHER','SAMPLE_ALPHA_TO_COVERAGE','SAMPLE_COVERAGE','SAMPLE_COVERAGE_VALUE','SAMPLE_COVERAGE_INVERT','RASTERIZER_DISCARD','SAMPLES','SAMPLE_BUFFERS'];
  const observe=(method,args)=>{
    const {p,row,uniforms}=program(),values={},samplers=[],activeTexture=gl.getParameter(gl.ACTIVE_TEXTURE);
    try{for(const u of uniforms){
      const value=gl.getUniform(p,u.location);values[u.name]=scalar(value);
      if(u.samplerTarget){
        const [target,binding]=u.samplerTarget,units=ArrayBuffer.isView(value)?Array.from(value):[value];
        for(const [index,unit]of units.entries()){
          gl.activeTexture(gl.TEXTURE0+unit);const bound=gl.getParameter(binding),parameters={};
          if(bound)for(const name of ['TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER','TEXTURE_WRAP_S','TEXTURE_WRAP_T','TEXTURE_WRAP_R','TEXTURE_BASE_LEVEL','TEXTURE_MAX_LEVEL','TEXTURE_COMPARE_MODE','TEXTURE_COMPARE_FUNC'])parameters[name]=scalar(gl.getTexParameter(target,gl[name]));
          samplers.push({uniform:u.name,index,unit,target,texture:textureIdentity(bound),parameters,samplerObjectPresent:!!gl.getParameter(gl.SAMPLER_BINDING)});
        }
      }
    }}finally{gl.activeTexture(activeTexture);}
    const fb=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
    let target=fb===null?{defaultFramebuffer:true}:targetNames.has(fb)?{owners:targetNames.get(fb)}:null;
    if(target===null){if(!targets.includes(fb))targets.push(fb);target={unknownFramebuffer:targets.indexOf(fb)};}
    const state=Object.fromEntries(stateParameters.map(name=>[name,scalar(gl.getParameter(gl[name]))]));
    draws.push({ordinal:draws.length,method,args:Array.from(args,scalar),program:row.ordinal,target,state,uniforms:values,samplers});
  };
  for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){
    const original=gl[name];saved.set(name,original);
    gl[name]=function(...args){observe(name,args);return original.apply(this,args);};
  }
  return {
    stop(){for(const [name,original]of saved)gl[name]=original;return {draws,programs,unknownTextures,unknownFramebufferCount:targets.length,limits:['GL uniform reflection and sampler bindings are captured immediately before the real draw, after production onBeforeRender and Three uniform setup.','No production draw is replaced; the observer adds synchronous query overhead and cannot support timing claims.','Actual GPU vertex-buffer bytes, sampler-object parameters, GPU texture contents and shadow/depth contents are unobserved.']};},
  };
}
