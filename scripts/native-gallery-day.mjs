// Serialized browser helper. Uses the site's actual emitted Environment.
// Native day input lighting only: no compositor, arena or stage shadows.
export async function nativeGalleryDay({THREE,renderer,scene,prefix,EnvironmentOverride}) {
 for(const [key,value] of Object.entries({NeutralToneMapping:7,SRGBColorSpace:'srgb',HalfFloatType:1016}))if(THREE[key]!==value)throw Error('Missing native lighting export '+key);
 const {Environment}=EnvironmentOverride?{Environment:EnvironmentOverride}:await import(prefix+'src/world/environment.js');
 const nativeScene=new THREE.Scene(),random=Math.random;let seed=0x51a7c0de,env;
 try{Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};env=new Environment(renderer,nativeScene,{theme:'day',shadowSize:512});}finally{Math.random=random;}
 try{
  const rt=env._envRT;
  if(env.theme!=='day'||!rt||rt.width!==768||rt.height!==1024||rt.texture.colorSpace!=='srgb-linear'||rt.texture.type!==1016||rt.texture.mapping!==306)throw Error('Invalid native day PMREM');
  const data=new Uint16Array(rt.width*rt.height*4);renderer.readRenderTargetPixels(rt,0,0,rt.width,rt.height,data);
  const half=b=>{const sign=b&32768?-1:1,e=(b>>>10)&31,f=b&1023;return e===31?(f?NaN:sign*Infinity):sign*(e?2**(e-15)*(1+f/1024):2**-14*f/1024);};
  let sum=0,max=0,positive=0;for(let i=0;i<data.length;i+=4){let lit=false;for(let j=0;j<3;j++){const v=half(data[i+j]);if(!Number.isFinite(v)||v<0)throw Error('Invalid native PMREM radiance');sum+=v;max=Math.max(max,v);lit ||= v>0;}positive+=lit;}
  if(positive<1000||!(sum>0)||renderer.getContext().getError()!==0)throw Error('Empty or failed native PMREM');
  if(nativeScene.environmentIntensity!==.45||env.sun.intensity!==3.3||env.hemi.intensity!==.45)throw Error('Native day light drift');
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=.94;
  scene.add(env.sun,env.sun.target,env.hemi);scene.environment=env.envMap;scene.environmentIntensity=nativeScene.environmentIntensity;
  return {owner:env,receipt:{scope:'Actual emitted native day input lighting; no compositor, arena or stage shadows',theme:env.theme,cubeSize:256,width:rt.width,height:rt.height,colorSpace:rt.texture.colorSpace,type:rt.texture.type,mapping:rt.texture.mapping,exposure:renderer.toneMappingExposure,toneMapping:renderer.toneMapping,outputColorSpace:renderer.outputColorSpace,environmentIntensity:scene.environmentIntensity,sunIntensity:env.sun.intensity,hemiIntensity:env.hemi.intensity,meanRadiance:sum/(rt.width*rt.height*3),maxRadiance:max,positivePixels:positive}};
 }catch(e){env.dispose();throw e;}
}
