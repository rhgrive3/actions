// Dedicated profile material. The baseline material and the legacy path remain
// untouched. Inputs and arithmetic match the emitted canonical shader.
const PROFILE_SIGNATURE = 'float mainInkDistance(vec2 p, vec2 direction, float radius, float kind, float word, float isWall)';
// Version admission, not a security checksum. Pixel acceptance remains mandatory.
function knownShader(text, length, signature) {
  if(typeof text!=='string'||text.length!==length)return false;
  let hash=2166136261;
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return (hash>>>0)===signature;
}
export function profileShaderSources(material) {
  const vertex = material?.vertexShader, fragment = material?.fragmentShader;
  if (!knownShader(vertex, 325, 1558068951) || !knownShader(fragment, 10118, 2117504631) ||
      !vertex.includes('gl_Position = vec4(aPos, 0.0, 1.0);') ||
      !fragment.includes(PROFILE_SIGNATURE) ||
      !fragment.includes('if (kind >= 10.0) fw = min(fw, max(tx, 1e-5));') ||
      !fragment.includes('sd = mainInkDistance(p, dir, r * grow, kind, paintSeed, isWall);') ||
      !fragment.includes('float paintShapeHash(') ||
      !fragment.includes('vec4(team, 1.0, hsh(seed * 1.73), a)')) return null;
  const header = fragment.slice(fragment.indexOf('uniform highp sampler2D uMainInkProfiles;'), fragment.indexOf('float paintShapeHash('));
  const vs = `
attribute vec2 aPos;
attribute vec3 aLocal;
attribute vec4 aSplat;
attribute vec3 aStretch;
attribute vec4 aGrow;
varying vec4 vProfileLocalDirection;
varying vec4 vProfileState;
varying vec3 vProfileParameters;
void main() {
  float r2 = aSplat.x * aSplat.x - aLocal.z * aLocal.z;
  float r = sqrt(r2);
  float tb = 1.0 - pow(1.0 - clamp(aGrow.x, 0.0, 1.0), 4.0);
  float grow = mix(0.4, 1.0, tb);
  bool body = aGrow.z < 0.5 || aGrow.z > 1.5;
  vProfileParameters = vec3(r2 <= 0.0 || !body ? -1.0 : r * grow,
    fract(sin(aSplat.z * 1.73) * 43758.5453123), aStretch.z);
  vProfileState = vec4(floor(aSplat.w * 0.5 + 0.01), floor(aGrow.w + 0.5), mod(aSplat.w, 2.0), aSplat.y);
  vProfileLocalDirection = vec4(aLocal.xy, aStretch.xy);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  const fs = `precision highp float;
varying vec4 vProfileLocalDirection;
varying vec4 vProfileState;
varying vec3 vProfileParameters;
` + header + `
void main() {
  float radius = vProfileParameters.x;
  if (radius < 0.0) discard;
  float kind = vProfileState.x, paintSeed = vProfileState.y, isWall = vProfileState.z;
  vec2 p0 = vProfileLocalDirection.xy;
  float tx = max(max(abs(dFdx(p0.x)), abs(dFdy(p0.x))), max(abs(dFdx(p0.y)), abs(dFdy(p0.y))));
  vec2 dir = vProfileLocalDirection.zw; float sa = vProfileParameters.z;
  vec2 p = p0;
  if (sa > 0.0 || (kind == 14.0 && sa < 0.0)) {
    float a = dot(p, dir); vec2 perp = p - a * dir;
    float s = kind == 14.0 && sa < 0.0 ? 1.0 + sa : (a > 0.0 ? 1.0 + sa : 1.0 + 0.25 * sa);
    p = perp + dir * (a / s);
  }
  float sd = mainInkDistance(p, dir, radius, kind, paintSeed, isWall);
  float fw = min(max(fwidth(sd), 1e-5), max(tx, 1e-5));
  float a = 1.0 - smoothstep(-1.5 * fw, 1.5 * fw, sd);
  if (a <= 0.002) discard;
  gl_FragColor = vec4(vProfileState.w, 1.0, vProfileParameters.y, a);
}
`;
  return { vertex: vs, fragment: fs };
}
