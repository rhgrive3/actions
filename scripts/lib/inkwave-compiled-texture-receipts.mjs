// Read only the textures actually used by compiled material uniforms in one
// diagnostic frame. In particular, onBeforeCompile textures need not occur in
// Material.uniforms. This function is self-contained for browser evaluation.
export function installCompiledTextureReceipts(G,{names=['dfgLUT','s3Ring','s3Splash','uMainInkProfiles','tLens']}={}) {
  const r=G.renderer,gl=r.getContext(),original=r.renderBufferDirect,selected=new Set(names),textures=new Map();
  const path=o=>{const parts=[];for(let p=o;p;p=p.parent)parts.push((p.name||p.type)+':'+(p.parent?p.parent.children.indexOf(p):0));return parts.reverse().join('/');};
  r.renderBufferDirect=function(camera,scene,geometry,material,object,group){
    const out=original.apply(this,arguments);
    const uniforms=r.properties.get(material).uniforms||material.uniforms||{};
    for(const [name,u]of Object.entries(uniforms))if(selected.has(name)){
      const values=Array.isArray(u?.value)?u.value:[u?.value];
      values.forEach((t,index)=>{
        if(!t?.isTexture)return;
        if(!textures.has(t))textures.set(t,[]);
        const owner={object:path(object),material:material.name||material.type,uniform:name,index};
        if(!textures.get(t).some(row=>JSON.stringify(row)===JSON.stringify(owner)))textures.get(t).push(owner);
      });
    }
    return out;
  };
  const sha=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(a.buffer,a.byteOffset,a.byteLength))),v=>v.toString(16).padStart(2,'0')).join('');
  return {
    async stop(){
      r.renderBufferDirect=original;
      const rows=[],binding=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),alignment=gl.getParameter(gl.PACK_ALIGNMENT),fb=gl.createFramebuffer();
      if(gl.getError()!==gl.NO_ERROR){gl.deleteFramebuffer(fb);throw Error('Pre-existing GL error before compiled texture read');}
      try{
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER,fb);gl.pixelStorei(gl.PACK_ALIGNMENT,1);
        for(const [texture,owners]of textures){
          owners.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
          const image=texture.image||texture.source?.data,row={owners,name:texture.name,type:texture.type,format:texture.format,internalFormat:texture.internalFormat,width:image?.width??null,height:image?.height??null,source:{},gpu:{}};rows.push(row);
          if(ArrayBuffer.isView(image?.data))row.source={kind:'typed-array',arrayType:image.data.constructor.name,byteLength:image.data.byteLength,sha256:await sha(image.data)};
          else if(image&&(image.naturalWidth||image.getContext||typeof ImageBitmap!=='undefined'&&image instanceof ImageBitmap)){
            const cv=document.createElement('canvas');cv.width=image.naturalWidth||image.width;cv.height=image.naturalHeight||image.height;
            const ctx=cv.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,cv.width,cv.height).data;
            row.source={kind:'decoded-image',byteLength:data.byteLength,sha256:await sha(data)};
          }else row.source={kind:'gpu-only-or-unavailable'};
          const gpu=r.properties.get(texture).__webglTexture;
          if(!gpu||texture.isCubeTexture||texture.isData3DTexture||texture.isDataArrayTexture){row.gpu.unobserved='Missing GPU allocation or unsupported texture dimension';continue;}
          gl.framebufferTexture2D(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,gpu,0);
          const status=gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER);
          if(status!==gl.FRAMEBUFFER_COMPLETE){row.gpu={unobserved:'Not color-renderable',status};continue;}
          gl.readBuffer(gl.COLOR_ATTACHMENT0);
          const format=gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT),type=gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
          const channels=format===gl.RED||format===gl.RED_INTEGER?1:format===gl.RG||format===gl.RG_INTEGER?2:format===gl.RGB||format===gl.RGB_INTEGER?3:4;
          const packed=[gl.UNSIGNED_INT_10F_11F_11F_REV,gl.UNSIGNED_INT_2_10_10_10_REV,gl.UNSIGNED_SHORT_5_6_5,gl.UNSIGNED_SHORT_4_4_4_4,gl.UNSIGNED_SHORT_5_5_5_1].includes(type);
          const Type=type===gl.FLOAT?Float32Array:type===gl.UNSIGNED_INT||type===gl.UNSIGNED_INT_10F_11F_11F_REV||type===gl.UNSIGNED_INT_2_10_10_10_REV?Uint32Array:type===gl.INT?Int32Array:type===gl.HALF_FLOAT||type===gl.UNSIGNED_SHORT||packed?Uint16Array:type===gl.SHORT?Int16Array:type===gl.UNSIGNED_BYTE?Uint8Array:type===gl.BYTE?Int8Array:null;
          if(!Type){row.gpu={unobserved:'Unsupported implementation read type',format,type};continue;}
          const data=new Type(image.width*image.height*(packed?1:channels));
          gl.readPixels(0,0,image.width,image.height,format,type,data);const error=gl.getError();
          row.gpu=error===gl.NO_ERROR?{format,type,arrayType:Type.name,byteLength:data.byteLength,sha256:await sha(data)}:{unobserved:'Read failed',format,type,error};
        }
      }finally{
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER,binding);gl.pixelStorei(gl.PACK_ALIGNMENT,alignment);gl.deleteFramebuffer(fb);
      }
      rows.sort((a,b)=>JSON.stringify(a.owners).localeCompare(JSON.stringify(b.owners)));
      const found=new Set(rows.flatMap(row=>row.owners.map(o=>o.uniform)));
      return {requested:[...selected].sort(),missing:[...selected].filter(n=>!found.has(n)),textures:rows,limits:['Captures selected actual compiled-uniform textures after the diagnostic frame; no shader/material/runtime module is substituted.','GPU hashes identify level-zero color values returned by the implementation read format/type; they are not upload bytes or other mip levels.','GPU vertex buffers, shadow/depth contents and other GPU textures remain unobserved.']};
    },
  };
}
