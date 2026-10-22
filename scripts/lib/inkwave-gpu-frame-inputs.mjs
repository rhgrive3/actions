// Diagnostic only. Install before the first Renderer/module creates WebGL
// storage, then observe one unchanged native frame. No upload/draw is replaced.
export function installGpuUploadTracker() {
  const proto=WebGL2RenderingContext.prototype,contexts=new WeakMap(),knownContexts=new Set(),saved=new Map();
  const context=gl=>{
    if(!contexts.has(gl)){contexts.set(gl,{textures:new Map(),bufferVersions:new Map(),attachments:new Map(),attachmentVersions:new Map(),renderbufferEpoch:0,auxiliary:false,capture:null});knownContexts.add(new WeakRef(gl));}
    return contexts.get(gl);
  };
  const binding=(gl,target)=>target>=gl.TEXTURE_CUBE_MAP_POSITIVE_X&&target<=gl.TEXTURE_CUBE_MAP_NEGATIVE_Z?gl.TEXTURE_BINDING_CUBE_MAP:target===gl.TEXTURE_CUBE_MAP?gl.TEXTURE_BINDING_CUBE_MAP:target===gl.TEXTURE_3D?gl.TEXTURE_BINDING_3D:target===gl.TEXTURE_2D_ARRAY?gl.TEXTURE_BINDING_2D_ARRAY:gl.TEXTURE_BINDING_2D;
  const texture=(gl,target)=>{
    const s=context(gl),object=gl.getParameter(binding(gl,target));if(!object)return null;
    if(!s.textures.has(object))s.textures.set(object,{object,target:target>=gl.TEXTURE_CUBE_MAP_POSITIVE_X&&target<=gl.TEXTURE_CUBE_MAP_NEGATIVE_Z?gl.TEXTURE_CUBE_MAP:target,levels:new Map(),version:0});
    return s.textures.get(object);
  };
  const framebuffer=(gl,target)=>gl.getParameter(target===gl.READ_FRAMEBUFFER?gl.READ_FRAMEBUFFER_BINDING:gl.DRAW_FRAMEBUFFER_BINDING);
  const markWrites=gl=>{
    const s=context(gl),fb=framebuffer(gl,gl.DRAW_FRAMEBUFFER);
    for(const object of new Set(s.attachments.get(fb)?.values()||[])){const t=s.textures.get(object);if(t)t.version++;}
  };
  const wrappers={
    texImage2D(gl,a){const t=texture(gl,a[0]);if(!t)return;const image=a[5],numeric=typeof a[3]==='number'&&a.length>=9,w=numeric?a[3]:image?.videoWidth||image?.naturalWidth||image?.width,h=numeric?a[4]:image?.videoHeight||image?.naturalHeight||image?.height;t.levels.set(a[0]+'/'+a[1],{face:a[0],level:a[1],width:w,height:h,depth:1,internalFormat:a[2],format:numeric?a[6]:a[3],type:numeric?a[7]:a[4]});t.version++;},
    texImage3D(gl,a){const t=texture(gl,a[0]);if(!t)return;t.levels.set(a[0]+'/'+a[1],{face:a[0],level:a[1],width:a[3],height:a[4],depth:a[5],internalFormat:a[2],format:a[7],type:a[8]});t.version++;},
    texStorage2D(gl,a){const t=texture(gl,a[0]);if(!t)return;t.immutableLevels=a[1];const faces=a[0]===gl.TEXTURE_CUBE_MAP?Array.from({length:6},(_,i)=>gl.TEXTURE_CUBE_MAP_POSITIVE_X+i):[a[0]];for(const face of faces)for(let l=0;l<a[1];l++)t.levels.set(face+'/'+l,{face,level:l,width:Math.max(1,a[3]>>l),height:Math.max(1,a[4]>>l),depth:1,internalFormat:a[2]});t.version++;},
    texStorage3D(gl,a){const t=texture(gl,a[0]);if(!t)return;t.immutableLevels=a[1];for(let l=0;l<a[1];l++)t.levels.set(a[0]+'/'+l,{face:a[0],level:l,width:Math.max(1,a[3]>>l),height:Math.max(1,a[4]>>l),depth:a[0]===gl.TEXTURE_3D?Math.max(1,a[5]>>l):a[5],internalFormat:a[2]});t.version++;},
    generateMipmap(gl,a){const t=texture(gl,a[0]);if(!t)return;for(const base of [...t.levels.values()].filter(v=>v.level===0)){const count=Math.min(t.immutableLevels??Infinity,1+Math.floor(Math.log2(Math.max(base.width,base.height,t.target===gl.TEXTURE_3D?base.depth:1))));for(let l=1;l<count;l++)t.levels.set(base.face+'/'+l,{...base,level:l,width:Math.max(1,base.width>>l),height:Math.max(1,base.height>>l),depth:t.target===gl.TEXTURE_3D?Math.max(1,base.depth>>l):base.depth,generated:true});}t.version++;},
    framebufferTexture2D(gl,a){const s=context(gl),fb=framebuffer(gl,a[0]);if(!s.attachments.has(fb))s.attachments.set(fb,new Map());s.attachments.get(fb).set(a[1],a[3]);s.attachmentVersions.set(fb,(s.attachmentVersions.get(fb)||0)+1);},
    framebufferTextureLayer(gl,a){const s=context(gl),fb=framebuffer(gl,a[0]);if(!s.attachments.has(fb))s.attachments.set(fb,new Map());s.attachments.get(fb).set(a[1],a[2]);s.attachmentVersions.set(fb,(s.attachmentVersions.get(fb)||0)+1);},
    framebufferRenderbuffer(gl,a){const s=context(gl),fb=framebuffer(gl,a[0]);if(!s.attachments.has(fb))s.attachments.set(fb,new Map());s.attachments.get(fb).set(a[1],a[3]);s.attachmentVersions.set(fb,(s.attachmentVersions.get(fb)||0)+1);},
  };
  const imageUpdates=['texSubImage2D','texSubImage3D','copyTexImage2D','copyTexSubImage2D','copyTexSubImage3D','compressedTexImage2D','compressedTexImage3D','compressedTexSubImage2D','compressedTexSubImage3D'];
  const bufferBinding=(gl,target)=>new Map([[gl.ARRAY_BUFFER,gl.ARRAY_BUFFER_BINDING],[gl.ELEMENT_ARRAY_BUFFER,gl.ELEMENT_ARRAY_BUFFER_BINDING],[gl.COPY_READ_BUFFER,gl.COPY_READ_BUFFER_BINDING],[gl.COPY_WRITE_BUFFER,gl.COPY_WRITE_BUFFER_BINDING],[gl.UNIFORM_BUFFER,gl.UNIFORM_BUFFER_BINDING],[gl.PIXEL_PACK_BUFFER,gl.PIXEL_PACK_BUFFER_BINDING],[gl.PIXEL_UNPACK_BUFFER,gl.PIXEL_UNPACK_BUFFER_BINDING]]).get(target);
  const draws=['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced'];
  const clears=['clear','clearBufferfv','clearBufferiv','clearBufferuiv','clearBufferfi'];
  const events=['bindFramebuffer','framebufferTexture2D','framebufferTextureLayer','framebufferRenderbuffer','renderbufferStorage','renderbufferStorageMultisample','invalidateFramebuffer','invalidateSubFramebuffer'];
  for(const name of new Set([...Object.keys(wrappers),...imageUpdates,'bufferData','bufferSubData','copyBufferSubData',...draws,...clears,...events,'blitFramebuffer'])){
    const original=proto[name];if(typeof original!=='function')continue;
    saved.set(name,{original,own:Object.hasOwn(proto,name)});
    proto[name]=function(...args){
      const s=context(this);
      if(!s.auxiliary){if(draws.includes(name))s.capture?.beforeDraw(name,args);else if(clears.includes(name))s.capture?.beforeClear(name,args);else if(name==='blitFramebuffer')s.capture?.beforeBlit(name,args);else if(events.includes(name))s.capture?.event(name,args);}
      const out=original.apply(this,args);
      if(!s.auxiliary){
        wrappers[name]?.(this,args);
        if(name==='renderbufferStorage'||name==='renderbufferStorageMultisample')s.renderbufferEpoch++;
        if(imageUpdates.includes(name)){const t=texture(this,args[0]);if(t){t.version++;if(name.startsWith('compressedTexImage'))t.unobserved='Compressed allocation dimensions not collected';if(name==='copyTexImage2D')t.unobserved='Copy allocation dimensions not collected';}}
        if(name==='bufferData'||name==='bufferSubData'||name==='copyBufferSubData'){const target=name==='copyBufferSubData'?args[1]:args[0],key=bufferBinding(this,target),b=key===undefined?null:this.getParameter(key);if(b)s.bufferVersions.set(b,(s.bufferVersions.get(b)||0)+1);}
        if(draws.includes(name)||clears.includes(name)||name==='blitFramebuffer')markWrites(this);
      }
      return out;
    };saved.get(name).wrapper=proto[name];
  }
  const tracker={context,raw:Object.fromEntries([...saved].map(([k,v])=>[k,v.original])),uninstall(){for(const ref of knownContexts){const gl=ref.deref();if(gl)for(const [name,row]of saved)if(Object.hasOwn(gl,name)&&gl[name]===row.wrapper)delete gl[name];}for(const [name,row]of saved)if(row.own)proto[name]=row.original;else delete proto[name];knownContexts.clear();}};
  globalThis.__inkwaveGpuUploadTracker=tracker;
  return tracker;
}

export function installGpuFrameInputs(G,{maxBytes=256*1024*1024,maxResourceBytes=64*1024*1024}={}) {
  const r=G.renderer,gl=r.getContext(),tracker=globalThis.__inkwaveGpuUploadTracker;
  if(!tracker)throw Error('GPU allocation tracker must precede Renderer creation');
  const state=tracker.context(gl),draws=[],events=[],buffers=[],textures=[],framebuffers=[],bufferIds=new Map(),textureIds=new Map(),fbIds=new Map(),vaoIds=new Map(),renderbufferIds=new Map(),bufferCache=new Map(),textureCache=new Map(),fbCache=new Map();
  let capturedBytes=0,aux=null;
  const scalar=v=>typeof v==='number'?Object.is(v,-0)?{negativeZero:true}:Number.isFinite(v)?v:{nonfinite:String(v)}:Array.isArray(v)||ArrayBuffer.isView(v)?Array.from(v,scalar):v;
  const id=(map,value)=>{if(value===null)return null;if(!map.has(value))map.set(value,map.size);return map.get(value);};
  const budget=bytes=>Number.isSafeInteger(bytes)&&bytes>=0&&bytes<=maxResourceBytes&&capturedBytes+bytes<=maxBytes;
  const withAux=fn=>{const prior=state.auxiliary;state.auxiliary=true;try{return fn();}finally{state.auxiliary=prior;}};
  const buffer=object=>{
    if(!object)return null;
    const ordinal=id(bufferIds,object),version=state.bufferVersions.get(object)||0,key=ordinal+'/'+version;
    if(bufferCache.has(key))return bufferCache.get(key);
    const row={ordinal,snapshot:buffers.filter(v=>v.ordinal===ordinal).length};buffers.push(row);bufferCache.set(key,{ordinal,snapshot:row.snapshot});
    withAux(()=>{const before=gl.getParameter(gl.COPY_READ_BUFFER_BINDING);try{gl.bindBuffer(gl.COPY_READ_BUFFER,object);row.byteLength=gl.getBufferParameter(gl.COPY_READ_BUFFER,gl.BUFFER_SIZE);row.usage=gl.getBufferParameter(gl.COPY_READ_BUFFER,gl.BUFFER_USAGE);if(!budget(row.byteLength)){row.unobserved='GPU buffer snapshot byte budget';return;}row.bytes=new Uint8Array(row.byteLength);gl.getBufferSubData(gl.COPY_READ_BUFFER,0,row.bytes);capturedBytes+=row.byteLength;}finally{gl.bindBuffer(gl.COPY_READ_BUFFER,before);}});
    return {ordinal,snapshot:row.snapshot};
  };
  const framebuffer=object=>{
    if(!object)return {defaultFramebuffer:true};
    const ordinal=id(fbIds,object),version=state.attachmentVersions.get(object)||0,key=ordinal+'/'+version+'/'+state.renderbufferEpoch;
    if(fbCache.has(key))return {ordinal,snapshot:fbCache.get(key).snapshot};
    const row={ordinal,snapshot:framebuffers.filter(v=>v.ordinal===ordinal).length,attachments:[]};framebuffers.push(row);fbCache.set(key,row);
    withAux(()=>{const read=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),rb=gl.getParameter(gl.RENDERBUFFER_BINDING);try{
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,object);
      for(const attachment of [...Array.from({length:gl.getParameter(gl.MAX_COLOR_ATTACHMENTS)},(_,i)=>gl.COLOR_ATTACHMENT0+i),gl.DEPTH_ATTACHMENT,gl.STENCIL_ATTACHMENT]){
        const kind=gl.getFramebufferAttachmentParameter(gl.READ_FRAMEBUFFER,attachment,gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE);if(kind===gl.NONE)continue;
        const value=gl.getFramebufferAttachmentParameter(gl.READ_FRAMEBUFFER,attachment,gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME),a={attachment,kind};row.attachments.push(a);
        if(kind===gl.TEXTURE){a.texture=id(textureIds,value);for(const n of ['TEXTURE_LEVEL','TEXTURE_CUBE_MAP_FACE','TEXTURE_LAYER'])a[n]=gl.getFramebufferAttachmentParameter(gl.READ_FRAMEBUFFER,attachment,gl['FRAMEBUFFER_ATTACHMENT_'+n]);}
        else if(kind===gl.RENDERBUFFER){a.renderbuffer=id(renderbufferIds,value);a.contentsUnobserved='Renderbuffer storage values are not sampled or copied by this observer';gl.bindRenderbuffer(gl.RENDERBUFFER,value);for(const n of ['WIDTH','HEIGHT','INTERNAL_FORMAT','SAMPLES','RED_SIZE','GREEN_SIZE','BLUE_SIZE','ALPHA_SIZE','DEPTH_SIZE','STENCIL_SIZE'])a[n]=gl.getRenderbufferParameter(gl.RENDERBUFFER,gl['RENDERBUFFER_'+n]);}
      }
    }finally{gl.bindFramebuffer(gl.READ_FRAMEBUFFER,read);gl.bindRenderbuffer(gl.RENDERBUFFER,rb);}});
    return {ordinal,snapshot:row.snapshot};
  };
  const readPixels=(width,height)=>{
    const format=gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT),type=gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE),channels=[gl.RED,gl.RED_INTEGER].includes(format)?1:[gl.RG,gl.RG_INTEGER].includes(format)?2:[gl.RGB,gl.RGB_INTEGER].includes(format)?3:4;
    const packed=[gl.UNSIGNED_INT_10F_11F_11F_REV,gl.UNSIGNED_INT_2_10_10_10_REV,gl.UNSIGNED_SHORT_5_6_5,gl.UNSIGNED_SHORT_4_4_4_4,gl.UNSIGNED_SHORT_5_5_5_1].includes(type);
    const Type=type===gl.FLOAT?Float32Array:[gl.UNSIGNED_INT,gl.UNSIGNED_INT_10F_11F_11F_REV,gl.UNSIGNED_INT_2_10_10_10_REV].includes(type)?Uint32Array:type===gl.INT?Int32Array:[gl.HALF_FLOAT,gl.UNSIGNED_SHORT].includes(type)||packed?Uint16Array:type===gl.SHORT?Int16Array:type===gl.UNSIGNED_BYTE?Uint8Array:type===gl.BYTE?Int8Array:null;
    if(!Type)return {format,type,unobserved:'Unsupported implementation color read type'};
    const byteLength=width*height*(packed?1:channels)*Type.BYTES_PER_ELEMENT;if(!budget(byteLength))return {format,type,byteLength,unobserved:'GPU texture snapshot byte budget'};
    const data=new Type(byteLength/Type.BYTES_PER_ELEMENT);gl.readPixels(0,0,width,height,format,type,data);const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('GPU input texture read GL error '+error);capturedBytes+=byteLength;
    return {format,type,byteLength,arrayType:Type.name,bytes:new Uint8Array(data.buffer)};
  };
  const depthProgram=target=>{
    if(!aux){let vao=null,fb=null,color=null;try{vao=gl.createVertexArray();fb=gl.createFramebuffer();color=gl.createTexture();if(!vao||!fb||!color)throw Error('Depth observer resource allocation failed');aux={programs:new Map(),vao,fb,color,colorSize:null};}catch(e){if(vao)gl.deleteVertexArray(vao);if(fb)gl.deleteFramebuffer(fb);if(color)gl.deleteTexture(color);throw e;}}
    if(aux.programs.has(target))return aux.programs.get(target);
    const vertex='#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);}',array=target===gl.TEXTURE_2D_ARRAY;
    const fragment='#version 300 es\nprecision highp float;precision highp int;uniform highp '+(array?'sampler2DArray':'sampler2D')+' source;uniform int mip;uniform int layer;layout(location=0) out float value;void main(){value=texelFetch(source,'+(array?'ivec3(ivec2(gl_FragCoord.xy),layer)':'ivec2(gl_FragCoord.xy)')+',mip).r;}';
    const compile=(kind,source)=>{const s=gl.createShader(kind);try{gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Depth observer shader compile: '+gl.getShaderInfoLog(s));return s;}catch(e){gl.deleteShader(s);throw e;}};
    let vs=null,fs=null,program=null,retained=false;
    try{
      vs=compile(gl.VERTEX_SHADER,vertex);fs=compile(gl.FRAGMENT_SHADER,fragment);program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Depth observer program link: '+gl.getProgramInfoLog(program));
      const row={program,source:gl.getUniformLocation(program,'source'),mip:gl.getUniformLocation(program,'mip'),layer:gl.getUniformLocation(program,'layer')};aux.programs.set(target,row);retained=true;return row;
    }finally{if(vs)gl.deleteShader(vs);if(fs)gl.deleteShader(fs);if(program&&!retained)gl.deleteProgram(program);}
  };
  const readDepth=(object,target,level,layer,width,height)=>{
    if(target!==gl.TEXTURE_2D&&target!==gl.TEXTURE_2D_ARRAY)return {unobserved:'Depth cube/3D sampling is unsupported'};
    if(!budget(width*height*4))return {unobserved:'Depth R32F snapshot byte budget'};
    const old={program:gl.getParameter(gl.CURRENT_PROGRAM),vao:gl.getParameter(gl.VERTEX_ARRAY_BINDING),draw:gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),read:gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),active:gl.getParameter(gl.ACTIVE_TEXTURE),viewport:gl.getParameter(gl.VIEWPORT),mask:gl.getParameter(gl.COLOR_WRITEMASK),depthMask:gl.getParameter(gl.DEPTH_WRITEMASK)};
    const enables=['BLEND','DEPTH_TEST','STENCIL_TEST','SCISSOR_TEST','CULL_FACE','POLYGON_OFFSET_FILL','DITHER','SAMPLE_ALPHA_TO_COVERAGE','SAMPLE_COVERAGE','RASTERIZER_DISCARD'].map(n=>[gl[n],gl.isEnabled(gl[n])]);
    const binding=target===gl.TEXTURE_2D?gl.TEXTURE_BINDING_2D:gl.TEXTURE_BINDING_2D_ARRAY;let priorTexture=null,priorSampler=null,prior2D=null,compare=null,priorCaptured=false;
    try{
      gl.activeTexture(gl.TEXTURE0);priorTexture=gl.getParameter(binding);priorSampler=gl.getParameter(gl.SAMPLER_BINDING);prior2D=gl.getParameter(gl.TEXTURE_BINDING_2D);priorCaptured=true;
      const p=depthProgram(target);gl.bindTexture(target,object);compare=gl.getTexParameter(target,gl.TEXTURE_COMPARE_MODE);gl.texParameteri(target,gl.TEXTURE_COMPARE_MODE,gl.NONE);gl.bindSampler(0,null);
      if(aux.colorSize!==width+'x'+height){if(aux.colorSize!==null){gl.deleteTexture(aux.color);aux.color=gl.createTexture();}gl.bindTexture(gl.TEXTURE_2D,aux.color);gl.texStorage2D(gl.TEXTURE_2D,1,gl.R32F,width,height);aux.colorSize=width+'x'+height;}
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,aux.fb);gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,aux.color,0);
      if(gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)return {unobserved:'R32F depth observer target is not complete'};
      gl.bindTexture(target,object);gl.bindVertexArray(aux.vao);gl.useProgram(p.program);gl.uniform1i(p.source,0);gl.uniform1i(p.mip,level);if(p.layer)gl.uniform1i(p.layer,layer);
      for(const [cap]of enables)gl.disable(cap);gl.colorMask(true,true,true,true);gl.depthMask(false);gl.viewport(0,0,width,height);
      tracker.raw.drawArrays.call(gl,gl.TRIANGLES,0,3);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,aux.fb);gl.readBuffer(gl.COLOR_ATTACHMENT0);
      return {observation:'Depth texelFetch into R32F; not native depth storage bytes',...readPixels(width,height)};
    }finally{
      if(priorCaptured){gl.bindTexture(target,object);if(compare!==null)gl.texParameteri(target,gl.TEXTURE_COMPARE_MODE,compare);gl.bindTexture(target,priorTexture);gl.bindTexture(gl.TEXTURE_2D,prior2D);gl.bindSampler(0,priorSampler);}gl.activeTexture(old.active);
      gl.useProgram(old.program);gl.bindVertexArray(old.vao);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,old.draw);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,old.read);gl.viewport(...old.viewport);gl.colorMask(...old.mask);gl.depthMask(old.depthMask);for(const [cap,on]of enables)if(on)gl.enable(cap);else gl.disable(cap);
    }
  };
  const texture=(object,target)=>{
    if(!object)return null;
    const ordinal=id(textureIds,object),meta=state.textures.get(object),version=meta?.version||0,key=ordinal+'/'+version;
    if(textureCache.has(key))return textureCache.get(key);
    const row={ordinal,snapshot:textures.filter(v=>v.ordinal===ordinal).length,target,levels:[]};textures.push(row);const reference={ordinal,snapshot:row.snapshot};textureCache.set(key,reference);
    if(!meta||meta.unobserved){row.unobserved=meta?.unobserved||'Allocation predates tracker or unsupported allocation API';return reference;}
    withAux(()=>{const read=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),pack=gl.getParameter(gl.PACK_ALIGNMENT),packRow=gl.getParameter(gl.PACK_ROW_LENGTH),packPixels=gl.getParameter(gl.PACK_SKIP_PIXELS),packRows=gl.getParameter(gl.PACK_SKIP_ROWS),packBuffer=gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING),fb=gl.createFramebuffer();try{
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);gl.pixelStorei(gl.PACK_ALIGNMENT,1);gl.pixelStorei(gl.PACK_ROW_LENGTH,0);gl.pixelStorei(gl.PACK_SKIP_PIXELS,0);gl.pixelStorei(gl.PACK_SKIP_ROWS,0);
      for(const level of [...meta.levels.values()].sort((a,b)=>a.face-b.face||a.level-b.level)){
        const {width,height,depth,internalFormat}=level;
        if(!width||!height||!depth){row.levels.push({...level,unobserved:'Unknown allocation dimensions'});continue;}
        const isDepth=[gl.DEPTH_COMPONENT,gl.DEPTH_STENCIL,gl.DEPTH_COMPONENT16,gl.DEPTH_COMPONENT24,gl.DEPTH_COMPONENT32F,gl.DEPTH24_STENCIL8,gl.DEPTH32F_STENCIL8].includes(internalFormat);
        for(let layer=0;layer<depth;layer++){
          const out={...level,layer};row.levels.push(out);
          if(isDepth){Object.assign(out,readDepth(object,target,level.level,layer,width,height));continue;}
          gl.bindFramebuffer(gl.READ_FRAMEBUFFER,fb);
          if(target===gl.TEXTURE_2D_ARRAY||target===gl.TEXTURE_3D)gl.framebufferTextureLayer(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,object,level.level,layer);
          else gl.framebufferTexture2D(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,level.face,object,level.level);
          const status=gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER);if(status!==gl.FRAMEBUFFER_COMPLETE){out.unobserved='Texture level is not color-renderable';out.status=status;continue;}
          gl.readBuffer(gl.COLOR_ATTACHMENT0);Object.assign(out,readPixels(width,height));
        }
      }
    }finally{gl.bindFramebuffer(gl.READ_FRAMEBUFFER,read);gl.pixelStorei(gl.PACK_ALIGNMENT,pack);gl.pixelStorei(gl.PACK_ROW_LENGTH,packRow);gl.pixelStorei(gl.PACK_SKIP_PIXELS,packPixels);gl.pixelStorei(gl.PACK_SKIP_ROWS,packRows);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,packBuffer);gl.deleteFramebuffer(fb);}});
    return reference;
  };
  const samplerTarget=type=>[gl.SAMPLER_2D,gl.SAMPLER_2D_SHADOW,gl.INT_SAMPLER_2D,gl.UNSIGNED_INT_SAMPLER_2D].includes(type)?[gl.TEXTURE_2D,gl.TEXTURE_BINDING_2D]:[gl.SAMPLER_2D_ARRAY,gl.SAMPLER_2D_ARRAY_SHADOW,gl.INT_SAMPLER_2D_ARRAY,gl.UNSIGNED_INT_SAMPLER_2D_ARRAY].includes(type)?[gl.TEXTURE_2D_ARRAY,gl.TEXTURE_BINDING_2D_ARRAY]:[gl.SAMPLER_CUBE,gl.SAMPLER_CUBE_SHADOW,gl.INT_SAMPLER_CUBE,gl.UNSIGNED_INT_SAMPLER_CUBE].includes(type)?[gl.TEXTURE_CUBE_MAP,gl.TEXTURE_BINDING_CUBE_MAP]:[gl.SAMPLER_3D,gl.INT_SAMPLER_3D,gl.UNSIGNED_INT_SAMPLER_3D].includes(type)?[gl.TEXTURE_3D,gl.TEXTURE_BINDING_3D]:null;
  const programSamplers=new Map();
  const beforeDraw=(method,args)=>{
    const p=gl.getParameter(gl.CURRENT_PROGRAM),attributes=[];
    for(let i=0;i<gl.getParameter(gl.MAX_VERTEX_ATTRIBS);i++){
      const a={index:i};for(const [key,name]of [['enabled','VERTEX_ATTRIB_ARRAY_ENABLED'],['size','VERTEX_ATTRIB_ARRAY_SIZE'],['type','VERTEX_ATTRIB_ARRAY_TYPE'],['normalized','VERTEX_ATTRIB_ARRAY_NORMALIZED'],['stride','VERTEX_ATTRIB_ARRAY_STRIDE'],['integer','VERTEX_ATTRIB_ARRAY_INTEGER'],['divisor','VERTEX_ATTRIB_ARRAY_DIVISOR'],['generic','CURRENT_VERTEX_ATTRIB']])a[key]=scalar(gl.getVertexAttrib(i,gl[name]));
      a.offset=gl.getVertexAttribOffset(i,gl.VERTEX_ATTRIB_ARRAY_POINTER);a.buffer=a.enabled?buffer(gl.getVertexAttrib(i,gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING)):null;attributes.push(a);
    }
    if(!programSamplers.has(p)){const list=[];for(let i=0;i<gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i++){const u=gl.getActiveUniform(p,i),target=samplerTarget(u.type);if(target)list.push({name:u.name,target,location:gl.getUniformLocation(p,u.name)});}programSamplers.set(p,list.sort((a,b)=>a.name.localeCompare(b.name)));}
    const samplers=[],active=gl.getParameter(gl.ACTIVE_TEXTURE);
    try{for(const u of programSamplers.get(p)){
      const value=gl.getUniform(p,u.location),units=ArrayBuffer.isView(value)?Array.from(value):[value];
      for(const [index,unit]of units.entries()){
        gl.activeTexture(gl.TEXTURE0+unit);const [target,binding]=u.target,object=gl.getParameter(binding),s=gl.getParameter(gl.SAMPLER_BINDING),parameters={};
        if(s)for(const name of ['TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER','TEXTURE_WRAP_S','TEXTURE_WRAP_T','TEXTURE_WRAP_R','TEXTURE_MIN_LOD','TEXTURE_MAX_LOD','TEXTURE_COMPARE_MODE','TEXTURE_COMPARE_FUNC'])parameters[name]=scalar(gl.getSamplerParameter(s,gl[name]));
        samplers.push({uniform:u.name,index,unit,target,samplerObject:s?parameters:null,texture:texture(object,target),...(u.name==='tLens'?{knownBranch:{uniform:'uLensOn',value:gl.getUniform(p,gl.getUniformLocation(p,'uLensOn')),guard:'> 0.5'}}:{})});
      }
    }}finally{gl.activeTexture(active);}
    const row={ordinal:draws.length,method,args:Array.from(args,scalar),vao:id(vaoIds,gl.getParameter(gl.VERTEX_ARRAY_BINDING)),attributes,indexBuffer:method.includes('Elements')?buffer(gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING)):null,samplers,framebuffer:framebuffer(gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING))};draws.push(row);events.push({kind:'draw',ordinal:row.ordinal});
  };
  const serializeArg=v=>ArrayBuffer.isView(v)?{arrayType:v.constructor.name,byteLength:v.byteLength,values:scalar(v)}:Array.isArray(v)?v.map(serializeArg):v&&typeof v==='object'?{opaqueObject:true}:scalar(v);
  state.capture={beforeDraw,beforeClear(method,args){events.push({kind:'clear',method,args:args.map(serializeArg),framebuffer:framebuffer(gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING)),color:scalar(gl.getParameter(gl.COLOR_CLEAR_VALUE)),depth:scalar(gl.getParameter(gl.DEPTH_CLEAR_VALUE)),stencil:gl.getParameter(gl.STENCIL_CLEAR_VALUE),colorMask:scalar(gl.getParameter(gl.COLOR_WRITEMASK)),depthMask:gl.getParameter(gl.DEPTH_WRITEMASK),stencilMask:gl.getParameter(gl.STENCIL_WRITEMASK),scissorTest:gl.isEnabled(gl.SCISSOR_TEST),scissor:scalar(gl.getParameter(gl.SCISSOR_BOX))});},beforeBlit(method,args){events.push({kind:'blit',method,args:args.map(serializeArg),read:framebuffer(gl.getParameter(gl.READ_FRAMEBUFFER_BINDING)),draw:framebuffer(gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING)),sourceContents:'Renderbuffer and otherwise unsampled blit attachment contents remain unobserved'});},event(method,args){const values=args.map(serializeArg);if(method==='bindFramebuffer')values[1]={framebuffer:id(fbIds,args[1])};if(method==='framebufferTexture2D')values[3]={texture:id(textureIds,args[3])};if(method==='framebufferTextureLayer')values[2]={texture:id(textureIds,args[2])};if(method==='framebufferRenderbuffer')values[3]={renderbuffer:id(renderbufferIds,args[3])};events.push({kind:'state',method,args:values,...(method.startsWith('renderbufferStorage')?{renderbuffer:id(renderbufferIds,gl.getParameter(gl.RENDERBUFFER_BINDING))}:{})});}};
  return {async stop(){
    state.capture=null;
    const digest=async row=>{if(!row.bytes)return;row.sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',row.bytes)),v=>v.toString(16).padStart(2,'0')).join('');delete row.bytes;};
    try{for(const row of buffers)await digest(row);for(const row of textures)for(const level of row.levels)await digest(level);}
    finally{if(aux)withAux(()=>{for(const p of aux.programs.values())gl.deleteProgram(p.program);gl.deleteVertexArray(aux.vao);gl.deleteFramebuffer(aux.fb);gl.deleteTexture(aux.color);});}
    const errors=[];for(let e=gl.getError();e!==gl.NO_ERROR;e=gl.getError())errors.push(e);if(errors.length)throw Error('GPU frame observer left GL errors '+errors);
    return {draws,events,buffers,textures,framebuffers,capturedBytes,budget:{maxBytes,maxResourceBytes},limits:['Captures actual enabled VAO attribute and indexed GPU buffer bytes, allocated tracked sampler mip/face/layer color values, and supported depth texelFetch values.','Depth values pass through R32F shader sampling; native depth/stencil storage bits and stencil texture contents are not directly exposed.','Renderbuffer contents, including multisample blit read inputs, are unobserved; only their attachment/storage metadata and downstream sampled textures are captured.','Compressed/copy allocation metadata and unsupported/nonrenderable texture levels or budget excess remain explicitly unobserved.','Additional synchronous queries/readbacks and auxiliary depth sampling prohibit timing claims.']};
  }};
}
