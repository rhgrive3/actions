import test from 'node:test';
import assert from 'node:assert/strict';
import {installGpuUploadTracker} from '../lib/inkwave-gpu-frame-inputs.mjs';

function fixture(t){
  const prior=globalThis.WebGL2RenderingContext,priorTracker=globalThis.__inkwaveGpuUploadTracker;
  class GL{
    constructor(){Object.assign(this,{TEXTURE_2D:3553,TEXTURE_3D:32879,TEXTURE_2D_ARRAY:35866,TEXTURE_CUBE_MAP:34067,TEXTURE_CUBE_MAP_POSITIVE_X:34069,TEXTURE_CUBE_MAP_NEGATIVE_Z:34074,TEXTURE_BINDING_2D:32873,TEXTURE_BINDING_3D:32874,TEXTURE_BINDING_2D_ARRAY:35869,TEXTURE_BINDING_CUBE_MAP:34068,FRAMEBUFFER:36160,READ_FRAMEBUFFER:36008,DRAW_FRAMEBUFFER:36009,READ_FRAMEBUFFER_BINDING:36010,DRAW_FRAMEBUFFER_BINDING:36006,COLOR_ATTACHMENT0:36064});this.bound=new Map();this.nativeCalls=[];}
    bindTexture(target,object){this.bound.set(target,object);}
    bindFramebuffer(target,object){if(target!==this.DRAW_FRAMEBUFFER)this.read=object;if(target!==this.READ_FRAMEBUFFER)this.draw=object;}
    getParameter(key){if(key===this.READ_FRAMEBUFFER_BINDING)return this.read;if(key===this.DRAW_FRAMEBUFFER_BINDING)return this.draw;return this.bound.get(new Map([[this.TEXTURE_BINDING_2D,this.TEXTURE_2D],[this.TEXTURE_BINDING_CUBE_MAP,this.TEXTURE_CUBE_MAP],[this.TEXTURE_BINDING_3D,this.TEXTURE_3D],[this.TEXTURE_BINDING_2D_ARRAY,this.TEXTURE_2D_ARRAY]]).get(key));}
    texImage2D(...args){this.nativeCalls.push(['texImage2D',args]);}
    texStorage2D(...args){this.nativeCalls.push(['texStorage2D',args]);}
    texStorage3D(...args){this.nativeCalls.push(['texStorage3D',args]);}
    generateMipmap(...args){this.nativeCalls.push(['generateMipmap',args]);}
    framebufferTexture2D(...args){this.nativeCalls.push(['framebufferTexture2D',args]);}
    drawElements(...args){this.nativeCalls.push(['drawElements',args]);}
    clear(...args){this.nativeCalls.push(['clear',args]);}
  }
  globalThis.WebGL2RenderingContext=GL;const original=GL.prototype.texImage2D,tracker=installGpuUploadTracker(),gl=new GL();
  t.after(()=>{tracker.uninstall();assert.equal(GL.prototype.texImage2D,original);if(prior===undefined)delete globalThis.WebGL2RenderingContext;else globalThis.WebGL2RenderingContext=prior;if(priorTracker===undefined)delete globalThis.__inkwaveGpuUploadTracker;else globalThis.__inkwaveGpuUploadTracker=priorTracker;});
  return {gl,tracker,state:tracker.context(gl)};
}

test('pre-init allocation tracker forwards exact source arguments and records both texImage2D overloads',t=>{
  const {gl,state}=fixture(t),gpu={};gl.bindTexture(gl.TEXTURE_2D,gpu);
  const image={width:8,height:4},view=new Uint8Array(32);
  gl.texImage2D(gl.TEXTURE_2D,0,6408,6408,5121,image);
  gl.texImage2D(gl.TEXTURE_2D,1,6408,4,2,0,6408,5121,view);
  assert.equal(gl.nativeCalls[0][1][5],image);assert.equal(gl.nativeCalls[1][1][8],view);
  assert.deepEqual([...state.textures.get(gpu).levels.values()].map(v=>[v.level,v.width,v.height]),[[0,8,4],[1,4,2]]);
});

test('allocated and generated mip receipts retain cube faces and distinguish array layers from 3D slices',t=>{
  const {gl,state}=fixture(t),cube={},array={},volume={};
  gl.bindTexture(gl.TEXTURE_CUBE_MAP,cube);gl.texStorage2D(gl.TEXTURE_CUBE_MAP,3,34842,4,4);
  assert.equal(state.textures.get(cube).levels.size,18);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY,array);gl.texStorage3D(gl.TEXTURE_2D_ARRAY,3,34842,8,4,8);gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  assert.deepEqual([...state.textures.get(array).levels.values()].sort((a,b)=>a.level-b.level).map(v=>v.depth),[8,8,8]);
  gl.bindTexture(gl.TEXTURE_3D,volume);gl.texStorage3D(gl.TEXTURE_3D,3,34842,8,4,8);
  assert.deepEqual([...state.textures.get(volume).levels.values()].map(v=>v.depth),[8,4,2]);
});

test('frame draw hook observes pre-write texture version; auxiliary draws remain native but do not enter game receipts',t=>{
  const {gl,state}=fixture(t),gpu={},fb={};gl.bindTexture(gl.TEXTURE_2D,gpu);gl.texStorage2D(gl.TEXTURE_2D,1,34842,4,4);gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,gpu,0);
  const before=state.textures.get(gpu).version,seen=[];state.capture={beforeDraw(){seen.push(state.textures.get(gpu).version);}};
  gl.drawElements(4,3,5123,0);assert.deepEqual(seen,[before]);assert.equal(state.textures.get(gpu).version,before+1);
  state.auxiliary=true;gl.drawElements(4,3,5123,0);state.auxiliary=false;
  assert.equal(gl.nativeCalls.filter(v=>v[0]==='drawElements').length,2);assert.equal(seen.length,1);assert.equal(state.textures.get(gpu).version,before+1);
});

test('uninstall removes an instance copy of a tracker method restored by a nested observer',t=>{
  const {gl,tracker}=fixture(t),original=tracker.raw.drawElements;
  gl.drawElements=gl.drawElements;assert.equal(Object.hasOwn(gl,'drawElements'),true);
  tracker.uninstall();assert.equal(Object.hasOwn(gl,'drawElements'),false);assert.equal(gl.drawElements,original);
});
