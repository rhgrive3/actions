// Original native albedos are substantially darker than the procedural kit.
// Supply bounded neutral bounced light only where direct diffuse light is weak.
// This does not change sunlit colour, scene exposure, shadows, or other materials.
export const NATIVE_SHADE_FILL = 0.35;
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
