// Original native albedos are substantially darker than the procedural kit.
// Supply bounded neutral bounced light only where direct diffuse light is weak.
// This does not change sunlit colour, scene exposure, shadows, or other materials.
// Coefficients stay disabled until the controlled GPU experiment is reviewed.
export const NATIVE_SHADE_FILL_CONFIG=Object.freeze({inkblot:Object.freeze({day:0,sunset:0})});
export function nativeShadeFillFor(stage,theme,config=NATIVE_SHADE_FILL_CONFIG){
 if(stage!=='inkblot'||(theme!=='day'&&theme!=='sunset'))return 0;
 const value=config?.inkblot?.[theme];
 return Number.isFinite(value)?Math.max(0,Math.min(.5,value)):0;
}
export function applyNativeShadeFill(shader, uniform){
 if(!shader.fragmentShader.includes('#include <lights_fragment_end>'))throw new Error('Native shade fill: missing lighting shader anchor');
 shader.uniforms.uNativeShadeFill=uniform;
 shader.fragmentShader='uniform float uNativeShadeFill;\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
 float nativeAlbedoLuma = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
 float nativeDirectRatio = dot( reflectedLight.directDiffuse, vec3( 0.2126, 0.7152, 0.0722 ) ) / max( nativeAlbedoLuma, 0.0001 );
 float nativeShadeWeight = 1.0 - smoothstep( 0.05, 0.35, nativeDirectRatio );
 reflectedLight.indirectDiffuse += diffuseColor.rgb * clamp( uNativeShadeFill, 0.0, 0.5 ) * nativeShadeWeight;`);
}
