// Read-only rendering evidence for emulated mobile versus desktop settings.
// This does not establish physical Safari behaviour or the user photo build.
export async function captureUserCondition(mobile){
    const G=NG,g=G.game,e=G.env,r=G.renderer;
    const tex=t=>t?{uuid:t.uuid,type:t.type,format:t.format,colorSpace:t.colorSpace,width:t.image?.width,height:t.image?.height,version:t.version}:null;
    const targets={};for(const key of ['_cloudRT','_envRT']){const rt=e?.[key];targets[key]=rt?{width:rt.width,height:rt.height,texture:tex(rt.texture)}:null;}
    g.R.render();
    const cloudErrors=[];const gl=r.getContext(),previousTarget=r.getRenderTarget(),previousFace=r.getActiveCubeFace(),previousMip=r.getActiveMipmapLevel();
    try{for(const key of ['_cloudRT','_envRT']){const rt=e?.[key];if(!rt)continue;r.setRenderTarget(rt);const format=gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT),type=gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);targets[key].framebufferStatus=gl.checkFramebufferStatus(gl.FRAMEBUFFER);targets[key].readFormat=format;targets[key].readType=type;targets[key].samples=[];
     for(const [u,v] of [[.1,.1],[.5,.5],[.9,.9],[.25,.75],[.75,.25]]){const x=Math.min(rt.width-1,Math.floor(rt.width*u)),y=Math.min(rt.height-1,Math.floor(rt.height*v)),bytes=type===gl.FLOAT?new Float32Array(4):type===gl.HALF_FLOAT?new Uint16Array(4):type===gl.UNSIGNED_BYTE?new Uint8Array(4):null;if(!bytes||format!==gl.RGBA)throw Error('Unsupported cloud/environment readback format');gl.readPixels(x,y,1,1,format,type,bytes);targets[key].samples.push({x,y,rgba:Array.from(bytes)});}
     targets[key].readError=gl.getError();if(targets[key].framebufferStatus!==gl.FRAMEBUFFER_COMPLETE||targets[key].readError!==0)throw Error('Cloud/environment framebuffer readback failed');
    }}catch(error){cloudErrors.push(String(error.stack||error));}finally{r.setRenderTarget(previousTarget,previousFace,previousMip);}
    const frame=await globalThis.__captureNativeCanvas(mobile?'mobile-high-normal':'desktop-high-normal');
    frame.conditions={platform:'Chromium SwiftShader; touch and iOS user agent emulated, not physical Safari',historicalReferenceCandidate:'14f9f913a8438353d0e462a0e74e17d8af876230',photoCachedSourceKnown:false,photoCameraExact:false,simulationFrames:240,deltaSeconds:1/60,elapsedTargetSeconds:4,settings:{...g.settings},effectiveQuality:{...g.R.q},mobileDetection:{...g.mobile},palette:g.palette,camera:{position:G.camera.position.toArray(),quaternion:G.camera.quaternion.toArray(),matrix:G.camera.matrixWorld.toArray(),projection:G.camera.projectionMatrix.toArray()},localPosition:G.local.pos.toArray(),rig:{yaw:g.rig.yaw,pitch:g.rig.pitch},theme:g.theme,viewport:[innerWidth,innerHeight],devicePixelRatio,rendererPixelRatio:r.getPixelRatio(),environment:tex(G.scene.environment),environmentIntensity:G.scene.environmentIntensity,cloudTargets:targets,cloudErrors,cloudCoverage:e?._cloudMat?.uniforms?.uCov?.value,cloudSeed:e?._cloudMat?.uniforms?.uSeed?.value,cloudReadiness:'Five exact framebuffer texel samples; sparse diagnostic only, not whole-map validity'};return frame;
   
}
