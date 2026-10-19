export const PRODUCTION_LIGHTING_CONFIG=Object.freeze({theme:'day',bounds:{minX:-25,maxX:25,minZ:-44,maxZ:44},shadowSize:512});
export const PRODUCTION_EXPOSURE=.94;
export function createProductionLighting(Environment,renderer,scene){
 const env=new Environment(renderer,scene,PRODUCTION_LIGHTING_CONFIG),theme=Environment.THEMES.day;
 const fail=m=>{scene.environment=null;env.dispose();throw Error(m);};
 if(!env.envMap||scene.environment!==env.envMap)fail('Production PMREM environment missing');
 if(scene.environmentIntensity!==(theme.envK??.66))fail('Production environment intensity mismatch');
 if(env.sun.intensity!==theme.sunIntensity||env.hemi.intensity!==theme.hemiIntensity)fail('Production theme light mismatch');
 if(renderer.toneMappingExposure!==PRODUCTION_EXPOSURE)fail('Production boot exposure mismatch');
 return env;
}

