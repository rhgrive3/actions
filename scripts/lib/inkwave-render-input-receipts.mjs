// Read-only endpoint observation for the strict same-build renderer diagnostic.
// Hash the exact CPU bytes supplied to WebGL, including typed-view offsets.
// GPU-only texture contents are explicitly unobserved by this helper.
export async function collectRenderInputReceipts(G,{gpuColors=false}={}) {
  const buffers = [], textures = [],meshStates=[],lightStates=[],materialStates=[],materialRows=new Map(),pendingTextures = new Map(), byteHashes = new Map(),targets=new Map();
  const path = object => {
    const parts=[];
    for(let p=object;p;p=p.parent)parts.push((p.name||p.type)+':'+(p.parent?p.parent.children.indexOf(p):0));
    return parts.reverse().join('/');
  };
  const bytes = array => new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
  const digest = async array => {
    if(!byteHashes.has(array))byteHashes.set(array,crypto.subtle.digest('SHA-256',bytes(array)).then(b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('')));
    return byteHashes.get(array);
  };
  const attribute = (owner,name,a) => {
    if(!a)return;
    const array=a.array||a.data?.array;
    if(!ArrayBuffer.isView(array))return;
    buffers.push({owner,name,arrayType:array.constructor.name,byteLength:array.byteLength,itemSize:a.itemSize,count:a.count,normalized:a.normalized===true,stride:a.data?.stride??null,offset:a.offset??null,version:a.version??a.data?.version??null,array});
  };
  const texture = (owner,value) => {
    if(!value?.isTexture)return;
    const owners=pendingTextures.get(value);
    if(owners)owners.push(owner);else pendingTextures.set(value,[owner]);
  };
  const target=(owner,value)=>{if(value?.isWebGLRenderTarget){const owners=targets.get(value);if(owners)owners.push(owner);else targets.set(value,[owner]);}};
  const uniforms = (owner,values) => {
    for(const [key,u]of Object.entries(values||{})){
      const value=u?.value;
      if(Array.isArray(value))value.forEach((t,i)=>texture(owner+'/'+key+'/'+i,t));
      else texture(owner+'/'+key,value);
    }
  };
  const scalar=value=>{
    if(typeof value==='number')return Object.is(value,-0)?{negativeZero:true}:Number.isFinite(value)?value:{nonfinite:String(value)};
    if(value===null||['boolean','string'].includes(typeof value))return value;
    if(ArrayBuffer.isView(value))return Array.from(value,scalar);
    if(Array.isArray(value))return value.map(scalar);
    if(value?.isTexture)return {texture:true};
    if(typeof value?.toArray==='function')return value.toArray().map(scalar);
    return undefined;
  };
  const material = (owner,m) => {
    if(!m)return;
    const existing=materialRows.get(m);
    if(existing)existing.owners.push(owner);
    else{
      const values={};
      for(const [key,value]of Object.entries(m))if(!['id','uuid','version'].includes(key)&&!value?.isTexture){const v=scalar(value);if(v!==undefined)values[key]=v;}
      const scalarUniforms=u=>Object.fromEntries(Object.entries(u||{}).map(([k,v])=>[k,scalar(v?.value)]));
      const row={owners:[owner],values,uniforms:scalarUniforms(m.uniforms),userUniforms:scalarUniforms(m.userData?.uniforms)};
      materialRows.set(m,row);materialStates.push(row);
    }
    for(const [key,value]of Object.entries(m))texture(owner+'/'+key,value);
    uniforms(owner+'/uniforms',m.uniforms);
    uniforms(owner+'/userUniforms',m.userData?.uniforms);
  };
  G.scene.traverse(o=>{
    const owner=path(o),g=o.geometry;
    if(o.isMesh)meshStates.push({owner,world:scalar(o.matrixWorld),modelView:scalar(o.modelViewMatrix),normalMatrix:scalar(o.normalMatrix),bindMode:o.bindMode,bindMatrix:scalar(o.bindMatrix),bindMatrixInverse:scalar(o.bindMatrixInverse),morphTargetInfluences:scalar(o.morphTargetInfluences),count:o.count});
    if(o.isLight)lightStates.push({owner,color:scalar(o.color),intensity:scalar(o.intensity),distance:scalar(o.distance),decay:scalar(o.decay),angle:scalar(o.angle),penumbra:scalar(o.penumbra),world:scalar(o.matrixWorld),target:scalar(o.target?.matrixWorld),shadow:o.shadow?{bias:scalar(o.shadow.bias),normalBias:scalar(o.shadow.normalBias),radius:scalar(o.shadow.radius),matrix:scalar(o.shadow.matrix),mapSize:scalar(o.shadow.mapSize),cameraWorld:scalar(o.shadow.camera.matrixWorld),cameraInverse:scalar(o.shadow.camera.matrixWorldInverse),cameraProjection:scalar(o.shadow.camera.projectionMatrix)}:null});
    if(g){
      attribute(owner,'index',g.index);
      for(const [name,a]of Object.entries(g.attributes||{}))attribute(owner,name,a);
      for(const [name,list]of Object.entries(g.morphAttributes||{}))list.forEach((a,i)=>attribute(owner,'morph/'+name+'/'+i,a));
    }
    attribute(owner,'instanceMatrix',o.instanceMatrix);attribute(owner,'instanceColor',o.instanceColor);
    texture(owner+'/boneTexture',o.skeleton?.boneTexture);texture(owner+'/morphTexture',o.morphTexture);
    (Array.isArray(o.material)?o.material:[o.material]).forEach((m,i)=>material(owner+'/material/'+i,m));
    material(owner+'/customDepthMaterial',o.customDepthMaterial);
  });
  texture('scene/environment',G.scene.environment);texture('scene/background',G.scene.background);
  uniforms('environment',G.env?.U);
  for(const [key,value]of Object.entries(G.env||{}))target('environment/'+key,value);
  const composer=G.game?.R?.composer;
  target('composer/renderTarget1',composer?.renderTarget1);target('composer/renderTarget2',composer?.renderTarget2);
  for(const [i,pass]of (G.game?.R?.composer?.passes||[]).entries()){
    const owner='composer/'+i+'/'+pass.constructor.name;
    uniforms(owner,pass.uniforms);
    for(const [key,value]of Object.entries(pass)){
      texture(owner+'/'+key,value);
      target(owner+'/'+key,value);
      if(value?.isMaterial)material(owner+'/'+key,value);
      else if(Array.isArray(value))value.forEach((m,j)=>{target(owner+'/'+key+'/'+j,m);if(m?.isMaterial)material(owner+'/'+key+'/'+j,m);});
    }
  }
  for(const row of buffers){row.sha256=await digest(row.array);delete row.array;}
  for(const [t,owners]of pendingTextures){
    const images=Array.isArray(t.image)?t.image:[t.image||t.source?.data];
    const sources=[];
    for(const image of images){
      const source={width:image?.width??null,height:image?.height??null,depth:image?.depth??null};
      if(ArrayBuffer.isView(image?.data)){
        Object.assign(source,{kind:'typed-array',arrayType:image.data.constructor.name,byteLength:image.data.byteLength,sha256:await digest(image.data)});
      }else if(image&&typeof document!=='undefined'&&(image.naturalWidth||image.getContext||typeof ImageBitmap!=='undefined'&&image instanceof ImageBitmap)){
        const canvas=document.createElement('canvas');canvas.width=image.naturalWidth||image.width;canvas.height=image.naturalHeight||image.height;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
        const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        Object.assign(source,{kind:'decoded-image',width:canvas.width,height:canvas.height,byteLength:data.byteLength,sha256:await digest(data)});
      }else source.kind='gpu-only-or-unavailable';
      sources.push(source);
    }
    const mipmaps=[];
    for(const mip of t.mipmaps||[])if(ArrayBuffer.isView(mip.data))mipmaps.push({width:mip.width,height:mip.height,byteLength:mip.data.byteLength,sha256:await digest(mip.data)});
    textures.push({owners:owners.sort(),textureKind:t.isCubeTexture?'cube':t.isData3DTexture?'3d':t.isDataArrayTexture?'array':'2d',type:t.type,format:t.format,internalFormat:t.internalFormat,colorSpace:t.colorSpace,flipY:t.flipY,premultiplyAlpha:t.premultiplyAlpha,unpackAlignment:t.unpackAlignment,minFilter:t.minFilter,magFilter:t.magFilter,wrapS:t.wrapS,wrapT:t.wrapT,wrapR:t.wrapR,compareFunction:t.compareFunction,mapping:t.mapping,anisotropy:t.anisotropy,generateMipmaps:t.generateMipmaps,channel:t.channel,version:t.version,sourceVersion:t.source?.version,matrix:scalar(t.matrix),sources,mipmaps});
  }
  buffers.sort((a,b)=>(a.owner+'/'+a.name).localeCompare(b.owner+'/'+b.name));
  textures.sort((a,b)=>a.owners[0].localeCompare(b.owners[0]));
  meshStates.sort((a,b)=>a.owner.localeCompare(b.owner));lightStates.sort((a,b)=>a.owner.localeCompare(b.owner));materialStates.forEach(m=>m.owners.sort());materialStates.sort((a,b)=>a.owners[0].localeCompare(b.owners[0]));
  const shaderSources=[];
  if(G.renderer){
    const gl=G.renderer.getContext();
    for(const p of G.renderer.info.programs){
      const vertex=gl.getShaderSource(p.vertexShader),fragment=gl.getShaderSource(p.fragmentShader);
      shaderSources.push({cacheKey:p.cacheKey,vertexBytes:vertex?.length??null,fragmentBytes:fragment?.length??null,vertexSha256:vertex===null?null:await digest(new TextEncoder().encode(vertex)),fragmentSha256:fragment===null?null:await digest(new TextEncoder().encode(fragment))});
    }
    shaderSources.sort((a,b)=>a.cacheKey.localeCompare(b.cacheKey));
  }
  const gpuColorTargets=[];
  if(gpuColors){
    const r=G.renderer,gl=r.getContext(),binding=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),alignment=gl.getParameter(gl.PACK_ALIGNMENT);
    if(gl.getError()!==gl.NO_ERROR)throw Error('Pre-existing GL error before endpoint target observation');
    try{
      gl.pixelStorei(gl.PACK_ALIGNMENT,1);
      for(const [rt,owners]of targets){
        const fb=r.properties.get(rt).__webglFramebuffer,frames=rt.isWebGLCubeRenderTarget?fb:[fb];
        const row={owners:owners.sort(),width:rt.width,height:rt.height,attachment:'color0 only; depth unobserved',faces:[]};gpuColorTargets.push(row);
        if(!frames){row.unobserved='unallocated';continue;}
        for(const [face,f]of frames.entries()){
          if(!f){row.faces.push({face,unobserved:'unallocated'});continue;}
          gl.bindFramebuffer(gl.READ_FRAMEBUFFER,f);
          const format=gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT),type=gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
          const channels=format===gl.RED||format===gl.RED_INTEGER?1:format===gl.RG||format===gl.RG_INTEGER?2:format===gl.RGB||format===gl.RGB_INTEGER?3:4;
          const packed=[gl.UNSIGNED_INT_10F_11F_11F_REV,gl.UNSIGNED_INT_2_10_10_10_REV,gl.UNSIGNED_SHORT_5_6_5,gl.UNSIGNED_SHORT_4_4_4_4,gl.UNSIGNED_SHORT_5_5_5_1].includes(type);
          const Type=type===gl.FLOAT?Float32Array:type===gl.UNSIGNED_INT||type===gl.UNSIGNED_INT_10F_11F_11F_REV||type===gl.UNSIGNED_INT_2_10_10_10_REV?Uint32Array:type===gl.INT?Int32Array:type===gl.HALF_FLOAT||type===gl.UNSIGNED_SHORT||packed?Uint16Array:type===gl.SHORT?Int16Array:type===gl.UNSIGNED_BYTE?Uint8Array:type===gl.BYTE?Int8Array:null;
          if(!Type){row.faces.push({face,format,type,unobserved:'unsupported implementation read type'});continue;}
          const data=new Type(rt.width*rt.height*(packed?1:channels));gl.readPixels(0,0,rt.width,rt.height,format,type,data);
          const error=gl.getError();
          row.faces.push(error===gl.NO_ERROR?{face,format,type,byteLength:data.byteLength,sha256:await digest(data)}:{face,format,type,error,unobserved:'read failed'});
        }
      }
    }finally{gl.bindFramebuffer(gl.READ_FRAMEBUFFER,binding);gl.pixelStorei(gl.PACK_ALIGNMENT,alignment);}
  }
  const camera=G.camera,cameraState=camera?{world:scalar(camera.matrixWorld),inverse:scalar(camera.matrixWorldInverse),projection:scalar(camera.projectionMatrix)}:null;
  return {buffers,textures,meshStates,lightStates,cameraState,materialStates,shaderSources,gpuColorTargets,limits:['CPU hashes identify upload-source bytes and sampler settings, not current GPU buffer contents.','Render-target/cubemap sources without CPU bytes are explicitly gpu-only-or-unavailable.','Optional GPU target receipts read color attachment zero only; depth/shadow contents remain unobserved.']};
}
