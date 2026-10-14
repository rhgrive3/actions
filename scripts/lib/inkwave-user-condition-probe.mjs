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
    frame.conditions={platform:mobile?'Chromium SwiftShader with touch and iOS user agent emulation; not physical Safari':'Desktop Chromium SwiftShader',historicalReferenceCandidate:'14f9f913a8438353d0e462a0e74e17d8af876230',photoCachedSourceKnown:false,photoCameraExact:false,preparation:globalThis.__userConditionPreparation||null,actualMatchState:g.match?.state,actualMatchTime:g.match?.time,settings:{...g.settings},effectiveQuality:{...g.R.q},mobileDetection:{...g.mobile},palette:g.palette,camera:{position:G.camera.position.toArray(),quaternion:G.camera.quaternion.toArray(),matrix:G.camera.matrixWorld.toArray(),projection:G.camera.projectionMatrix.toArray()},localPosition:G.local.pos.toArray(),rig:{yaw:g.rig.yaw,pitch:g.rig.pitch},theme:g.theme,viewport:[innerWidth,innerHeight],screenSize:typeof screen!=='undefined'?[screen.width,screen.height]:null,devicePixelRatio,rendererPixelRatio:r.getPixelRatio(),environment:tex(G.scene.environment),environmentIntensity:G.scene.environmentIntensity,cloudTargets:targets,cloudErrors,cloudCoverage:e?._cloudMat?.uniforms?.uCov?.value,cloudSeed:e?._cloudMat?.uniforms?.uSeed?.value,cloudReadiness:'Five exact framebuffer texel samples; sparse diagnostic only, not whole-map validity'};return frame;
   
}

// Instrumented setup uses the native palette picker and native match lifecycle.
// No palette/material replacement and no assignment to match state or timer.
export async function prepareUserConditionMatch(){
 const G=NG,g=G.game;g.debug.freeze();g._skipRender=true;g.menus.wipe.cancel();g._setSettings({quality:'high',shadows:true,bloom:false});
 const picker=g._pickPalette;let picks=0;
 g._pickPalette=function(...args){const random=Math.random;Math.random=()=>.7;try{picks++;return picker.apply(this,args);}finally{Math.random=random;}};
 try{await g.startMatch({mapId:'inkblot',mode:'turf',difficulty:'normal',time:'day'});}finally{g._pickPalette=picker;}
 g.debug.freeze();g._skipRender=true;
 if(picks!==1||g.palette.id!=='aqua-cherry')throw Error('Native controlled palette selection did not match pinned config');
 let introFrames=0;while(g.match.state!=='playing'&&introFrames<600){g._frame(1/60);introFrames++;}
 if(g.match.state!=='playing')throw Error('Native intro did not reach playing within bounded frames');
 const timeBefore=g.match.time;for(let i=0;i<240;i++)g._frame(1/60);
 const timeAfter=g.match.time;if(g.match.state!=='playing'||Math.abs((timeBefore-timeAfter)-4)>1e-6)throw Error('Native live match time did not advance four seconds');
 G.paint.flush(1/60);globalThis.__userConditionPreparation={introFrames,liveFrames:240,deltaSeconds:1/60,timeBefore,timeAfter,paletteRandom:.7,paletteId:g.palette.id,instrumentation:'Native palette picker given fixed RNG draw; native intro and live game frames advanced, rendering skipped until capture'};
 return globalThis.__userConditionPreparation;
}
