import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {installCompiledTextureReceipts} from '../lib/inkwave-compiled-texture-receipts.mjs';

function fixture(){
  const prior={},fb={},gpu={},material={type:'PhysicalMaterial'},properties=new WeakMap();
  const padded=Uint8Array.of(99,1,2,3,4,88),view=new Uint8Array(padded.buffer,1,4);
  const texture={isTexture:true,name:'hidden-compiled',type:1,format:2,image:{width:1,height:1,data:view}};
  properties.set(material,{uniforms:{hidden:{value:texture}}});properties.set(texture,{__webglTexture:gpu});
  let binding=prior,alignment=8,nativeCalls=0,deleted=false,fail=false;
  const gl={READ_FRAMEBUFFER_BINDING:1,PACK_ALIGNMENT:2,READ_FRAMEBUFFER:3,COLOR_ATTACHMENT0:4,TEXTURE_2D:5,FRAMEBUFFER_COMPLETE:6,IMPLEMENTATION_COLOR_READ_FORMAT:7,IMPLEMENTATION_COLOR_READ_TYPE:8,RGBA:9,UNSIGNED_BYTE:10,NO_ERROR:0,
    getParameter(k){return k===1?binding:k===2?alignment:k===7?this.RGBA:this.UNSIGNED_BYTE;},getError(){return 0;},
    createFramebuffer(){return fb;},deleteFramebuffer(f){assert.equal(f,fb);deleted=true;},
    bindFramebuffer(_,f){binding=f;},pixelStorei(_,v){alignment=v;},
    framebufferTexture2D(target,attachment,kind,t,level){assert.equal(t,gpu);assert.equal(level,0);},checkFramebufferStatus(){return this.FRAMEBUFFER_COMPLETE;},readBuffer(){},
    readPixels(x,y,w,h,format,type,data){if(fail)throw Error('read failure');data.set([7,8,9,255]);},
  };
  const renderer={getContext:()=>gl,properties:{get:o=>properties.get(o)||{}},renderBufferDirect(){nativeCalls++;}};
  return {G:{renderer},material,texture,view,renderer,get binding(){return binding;},prior,get alignment(){return alignment;},get nativeCalls(){return nativeCalls;},get deleted(){return deleted;},set fail(v){fail=v;}};
}
const sha=a=>createHash('sha256').update(a).digest('hex');

test('observe hidden compiled uniform only after actual material draw; retain source offsets and actual GPU bytes',async()=>{
  const f=fixture(),original=f.renderer.renderBufferDirect,probe=installCompiledTextureReceipts(f.G,{names:['hidden','unused']});
  f.renderer.renderBufferDirect(null,null,null,f.material,{type:'Mesh'},null);
  const result=await probe.stop();
  assert.equal(f.nativeCalls,1);assert.equal(f.renderer.renderBufferDirect,original);
  assert.deepEqual(result.missing,['unused']);assert.equal(result.textures.length,1);
  assert.equal(result.textures[0].source.sha256,sha(f.view));
  assert.equal(result.textures[0].gpu.sha256,sha(Uint8Array.of(7,8,9,255)));
  assert.equal(f.binding,f.prior);assert.equal(f.alignment,8);assert.equal(f.deleted,true);
});

test('failed GPU read restores native render method/read framebuffer/alignment and deletes temporary framebuffer',async()=>{
  const f=fixture(),original=f.renderer.renderBufferDirect,probe=installCompiledTextureReceipts(f.G,{names:['hidden']});
  f.renderer.renderBufferDirect(null,null,null,f.material,{type:'Mesh'},null);f.fail=true;
  await assert.rejects(probe.stop(),/read failure/);
  assert.equal(f.renderer.renderBufferDirect,original);assert.equal(f.binding,f.prior);assert.equal(f.alignment,8);assert.equal(f.deleted,true);
});
