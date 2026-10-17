#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_RETROREFLECTION
	uniform float retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
uniform sampler2D uPaint;
uniform float uTexel;
uniform vec3 uTeamA;
uniform vec3 uTeamB;
uniform float uTime;
uniform float uInkGlow;
uniform sampler2D uMural;
uniform sampler2D uLight;
uniform float uAO;
uniform vec3 uLamps[12];
uniform int uLampN;
uniform vec3 uLampCol;
uniform vec3 uSeeA;
uniform vec3 uSeeB;
uniform float uSeeOn;
uniform float uSeeFeet;
uniform vec4 uSeeSupport;
uniform float uSeeA2C;
uniform float uAtlasSize;
uniform float uPpm;
uniform float uGel;
uniform vec4 uWake[48];
uniform vec4 uWakeB[4];
uniform vec4 uSwimH[4];
uniform vec4 uSwimF[4];
varying vec2 vLightUv;
varying vec3 vFaceTan;
varying vec2 vPaintUv;
varying vec2 vFaceUv;
varying vec4 vFaceData;
varying vec3 vFaceFlags;
varying vec3 vWPos;
varying vec3 vWNorm;

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
// anti-aliased grid line: returns 1 on the line
// practice range: anti-aliased world line (half-width hw, metres) that fades to its mean coverage once a pixel
// spans more than the line, so distant grids never shimmer
float rangeLine(float x, float period, float hw) {
  float fw = max(fwidth(x), 1e-5);
  float d = abs(fract(x / period + 0.5) - 0.5) * period;
  float a = 1.0 - smoothstep(hw - fw * 0.5, hw + fw * 0.5, d);
  return mix(a, 2.0 * hw / period, smoothstep(hw, 4.0 * hw, fw));
}
float gridLine(float x, float period, float width) {
  float fx = abs(fract(x / period + 0.5) - 0.5) * period;
  float w = fwidth(x) * 0.75;
  return 1.0 - smoothstep(width - w, width + w, fx);
}

uniform float uInkClock;
uniform vec4 uRip[24];
uniform vec4 uRipP[24];
float gInkKeep = 0.0;      // share of the surface relief that still shows through thin (wall) ink
// Paint lookups use textureGrad with gradients clamped to ≤ 8 texels: trilinear + anisotropic filtering (no shimmer at
// distance) while never reaching mip levels coarse enough to bleed across the 8-texel face padding.
vec2 gPdx = vec2(0.0), gPdy = vec2(0.0);
vec4 paintAt(vec2 uv) { return textureGrad(uPaint, uv, gPdx, gPdy); }
// Close-up reconstruction of the paint atlas with a cubic B-spline (C2: smooth, round ink outlines and a smooth height
// field at any magnification) plus its analytic gradient — 12 bilinear taps inside one 4×4 texel footprint.
void inkBspl(float t, out vec4 w, out vec4 dw) {
  float t2 = t * t, t3 = t2 * t, it = 1.0 - t;
  w = vec4(it * it * it, 3.0 * t3 - 6.0 * t2 + 4.0, -3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0, t3) * (1.0 / 6.0);
  dw = vec4(-it * it, 3.0 * t2 - 4.0 * t, -3.0 * t2 + 2.0 * t + 1.0, t2) * 0.5;
}
vec4 inkTap(vec2 st) { return textureLod(uPaint, (st + 0.5) / uAtlasSize, 0.0); }
vec4 paintCubic(vec2 uv, out vec4 gX, out vec4 gY) {
  vec2 st = uv * uAtlasSize - 0.5;
  vec2 i = floor(st), f = st - i;
  vec4 wx, dwx, wy, dwy;
  inkBspl(f.x, wx, dwx); inkBspl(f.y, wy, dwy);
  vec2 gx = vec2(wx.x + wx.y, wx.z + wx.w), gy = vec2(wy.x + wy.y, wy.z + wy.w);
  vec2 ox = vec2(-1.0 + wx.y / gx.x, 1.0 + wx.w / gx.y), oy = vec2(-1.0 + wy.y / gy.x, 1.0 + wy.w / gy.y);
  vec2 dgx = vec2(dwx.x + dwx.y, dwx.z + dwx.w), dgy = vec2(dwy.x + dwy.y, dwy.z + dwy.w);
  vec2 dox = vec2(-1.0 + dwx.y / dgx.x, 1.0 + dwx.w / dgx.y), doy = vec2(-1.0 + dwy.y / dgy.x, 1.0 + dwy.w / dgy.y);
  vec4 v = gx.x * (gy.x * inkTap(i + vec2(ox.x, oy.x)) + gy.y * inkTap(i + vec2(ox.x, oy.y)))
         + gx.y * (gy.x * inkTap(i + vec2(ox.y, oy.x)) + gy.y * inkTap(i + vec2(ox.y, oy.y)));
  gX = dgx.x * (gy.x * inkTap(i + vec2(dox.x, oy.x)) + gy.y * inkTap(i + vec2(dox.x, oy.y)))
     + dgx.y * (gy.x * inkTap(i + vec2(dox.y, oy.x)) + gy.y * inkTap(i + vec2(dox.y, oy.y)));
  gY = dgy.x * (gx.x * inkTap(i + vec2(ox.x, doy.x)) + gx.y * inkTap(i + vec2(ox.y, doy.x)))
     + dgy.y * (gx.x * inkTap(i + vec2(ox.x, doy.y)) + gx.y * inkTap(i + vec2(ox.y, doy.y)));
  return v;
}
// Unnormalised Mikkelsen bump: dHdxy is the per-pixel change of a height in metres, so the tilt equals the true
// slope of the ink surface regardless of distance/viewing angle.
vec3 perturbInk(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = dFdx(surf_pos.xyz);
  vec3 vSigmaY = dFdy(surf_pos.xyz);
  vec3 R1 = cross(vSigmaY, surf_norm);
  vec3 R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}

vec2 fsz0(vec4 fd) { return fd.zw; }
#ifdef USE_TEXLIB
precision highp sampler2DArray;
uniform sampler2DArray tAlbedo;
uniform sampler2DArray tNormal;
uniform sampler2DArray tOrm;
uniform float uTexSize;
uniform vec4 uTL[TL_SLOTS];
uniform vec4 uTLt[TL_SLOTS];
uniform vec4 uTLs[TL_SLOTS];

// ---- INKWAVE texlib (see src/world/texlib.js header for the API) ----
#ifndef TEXLIB_INCLUDED
#define TEXLIB_INCLUDED
#define TEXLIB_PLAIN 0
#define TEXLIB_GRID 1
#define TEXLIB_HEX 2
#ifndef TEXLIB_HEX_SCALE
#define TEXLIB_HEX_SCALE 0.5
#endif
struct TexlibSample { vec4 albedo; vec3 normal; vec4 orm; };

uint texlib_pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
uint texlib_hash(ivec2 p) { return texlib_pcg(uint(p.x) + texlib_pcg(uint(p.y) + 0x9e3779b9u)); }
float texlib_h01(uint h) { return float(h >> 8u) * (1.0 / 16777216.0); }

void texlib_triGrid(vec2 st, out vec3 w, out ivec2 v1, out ivec2 v2, out ivec2 v3) {
  st *= 3.46410162;
  vec2 sk = mat2(1.0, 0.0, -0.57735027, 1.15470054) * st;
  ivec2 b = ivec2(floor(sk));
  vec3 t = vec3(fract(sk), 0.0); t.z = 1.0 - t.x - t.y;
  float s = step(0.0, -t.z), s2 = 2.0 * s - 1.0;
  w = vec3(-t.z * s2, s - t.y * s2, s - t.x * s2);
  int si = int(s);
  v1 = b + ivec2(si, si); v2 = b + ivec2(si, 1 - si); v3 = b + ivec2(1 - si, si);
}
vec2 texlib_hexCentre(ivec2 v) { return mat2(1.0, 0.0, 0.5, 0.8660254) * vec2(v) / (3.46410162 * TEXLIB_HEX_SCALE); }
mat2 texlib_rot(uint h) { float a = texlib_h01(h) * 6.28318531; float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

void texlib_tap(sampler2DArray tA, sampler2DArray tN, sampler2DArray tO, vec2 st, float layer, vec2 gx, vec2 gy, mat2 M,
                out vec4 a, out vec3 n, out float nl, out vec4 o) {
  vec3 p = vec3(st, layer);
  a = textureGrad(tA, p, M * gx, M * gy);
  vec3 nr = textureGrad(tN, p, M * gx, M * gy).xyz * 2.0 - 1.0;
  o = textureGrad(tO, p, M * gx, M * gy);
  nl = length(nr);
  n = vec3(transpose(M) * nr.xy, nr.z);
}

TexlibSample texlibSample(sampler2DArray tA, sampler2DArray tN, sampler2DArray tO, vec2 uv, float layer, int mode, int sym) {
  vec2 gx = dFdx(uv), gy = dFdy(uv);
  // keep the footprint anisotropy within what 16x hardware AF resolves (≤ 12:1): past that, blur instead of alias
  float lx = dot(gx, gx), ly = dot(gy, gy);
  if (lx > ly * 144.0) gy = ly > 1e-20 ? gy * sqrt(lx / (ly * 144.0)) : vec2(-gx.y, gx.x) / 12.0;
  else if (ly > lx * 144.0) gx = lx > 1e-20 ? gx * sqrt(ly / (lx * 144.0)) : vec2(gy.y, -gy.x) / 12.0;
  TexlibSample r;
  vec3 n; float nl;
  if (mode == TEXLIB_HEX) {
    vec3 w; ivec2 v1, v2, v3;
    texlib_triGrid(uv * TEXLIB_HEX_SCALE, w, v1, v2, v3);
    uint h1 = texlib_hash(v1), h2 = texlib_hash(v2), h3 = texlib_hash(v3);
    mat2 R1 = texlib_rot(h1), R2 = texlib_rot(h2), R3 = texlib_rot(h3);
    vec2 c1 = texlib_hexCentre(v1), c2 = texlib_hexCentre(v2), c3 = texlib_hexCentre(v3);
    vec2 o1 = vec2(texlib_h01(texlib_pcg(h1)), texlib_h01(texlib_pcg(h1 + 1u)));
    vec2 o2 = vec2(texlib_h01(texlib_pcg(h2)), texlib_h01(texlib_pcg(h2 + 1u)));
    vec2 o3 = vec2(texlib_h01(texlib_pcg(h3)), texlib_h01(texlib_pcg(h3 + 1u)));
    vec4 a1, a2, a3, q1, q2, q3; vec3 n1, n2, n3; float l1, l2, l3;
    texlib_tap(tA, tN, tO, R1 * (uv - c1) + c1 + o1, layer, gx, gy, R1, a1, n1, l1, q1);
    texlib_tap(tA, tN, tO, R2 * (uv - c2) + c2 + o2, layer, gx, gy, R2, a2, n2, l2, q2);
    texlib_tap(tA, tN, tO, R3 * (uv - c3) + c3 + o3, layer, gx, gy, R3, a3, n3, l3, q3);
    vec3 W = w * w; W *= W; W *= w * w * w;                   // w^7
    W *= mix(vec3(1.0), vec3(q1.a, q2.a, q3.a) + 0.05, 0.6);  // height-aware contrast blend
    W /= max(W.x + W.y + W.z, 1e-6);
    r.albedo = W.x * a1 + W.y * a2 + W.z * a3;
    r.orm = W.x * q1 + W.y * q2 + W.z * q3;
    n = W.x * n1 + W.y * n2 + W.z * n3;
    nl = W.x * l1 + W.y * l2 + W.z * l3;
  } else if (mode == TEXLIB_GRID) {
    uint h = texlib_hash(ivec2(floor(uv))) & uint(sym);
    mat2 M = mat2(1.0);
    if ((h & 4u) != 0u) M = mat2(0.0, 1.0, 1.0, 0.0);
    if ((h & 1u) != 0u) M = mat2(-1.0, 0.0, 0.0, 1.0) * M;
    if ((h & 2u) != 0u) M = mat2(1.0, 0.0, 0.0, -1.0) * M;
    texlib_tap(tA, tN, tO, M * (fract(uv) - 0.5) + 0.5, layer, gx, gy, M, r.albedo, n, nl, r.orm);
  } else {
    texlib_tap(tA, tN, tO, uv, layer, gx, gy, mat2(1.0), r.albedo, n, nl, r.orm);
  }
  // Toksvig: mips average bumps into shorter normals -> widen the lobe instead of sparkling
  float v = max((1.0 - nl) / max(nl, 1e-3) - 0.006, 0.0);
  float a = r.orm.g * r.orm.g;
  r.orm.g = sqrt(sqrt(min(a * a + 2.0 * v, 1.0)));
  r.normal = normalize(vec3(n.xy, max(n.z, 1e-3)));
  return r;
}

mat3 texlibTangentFrame(vec3 eyePos, vec3 surfNormal, vec2 uv) {
  vec3 q0 = dFdx(eyePos), q1 = dFdy(eyePos);
  vec2 st0 = dFdx(uv), st1 = dFdy(uv);
  vec3 N = surfNormal;
  vec3 q1perp = cross(q1, N), q0perp = cross(N, q0);
  vec3 T = q1perp * st0.x + q0perp * st1.x;
  vec3 B = q1perp * st0.y + q0perp * st1.y;
  float det = max(dot(T, T), dot(B, B));
  float sc = det == 0.0 ? 0.0 : inversesqrt(det);
  return mat3(T * sc, B * sc, N);
}
vec3 texlibPerturbNormal(vec3 nTS, vec3 T, vec3 B, vec3 N, float strength) {
  return normalize(T * (nTS.x * strength) + B * (nTS.y * strength) + N * nTS.z);
}
vec3 texlibPerturbNormal(vec3 nTS, mat3 tbn, float strength) {
  return texlibPerturbNormal(nTS, tbn[0], tbn[1], tbn[2], strength);
}

#ifndef TEXLIB_DETAIL_SCALE
#define TEXLIB_DETAIL_SCALE 0.5
#endif
// blends the 'detail' layer into a sample at two rotated scales (no visible period). pMetres = surface coords in
// metres; amount = meta.detail (0 = skip). Albedo x (2 * detail), normal UDN-blended, roughness += delta.
void texlibDetail(inout TexlibSample s, sampler2DArray tA, sampler2DArray tN, sampler2DArray tO, vec2 pMetres, float layer, float amount) {
  vec2 u1 = pMetres / TEXLIB_DETAIL_SCALE;
  vec2 gx = dFdx(u1), gy = dFdy(u1);
  if (amount <= 0.0) return;
  const mat2 R = mat2(0.8660254, 0.5, -0.5, 0.8660254);
  vec2 u2 = R * u1 * 0.61 + vec2(0.37, 0.71);
  vec2 hx = R * gx * 0.61, hy = R * gy * 0.61;
  vec4 a1 = textureGrad(tA, vec3(u1, layer), gx, gy), a2 = textureGrad(tA, vec3(u2, layer), hx, hy);
  vec3 n1 = textureGrad(tN, vec3(u1, layer), gx, gy).xyz * 2.0 - 1.0, n2 = textureGrad(tN, vec3(u2, layer), hx, hy).xyz * 2.0 - 1.0;
  vec4 o1 = textureGrad(tO, vec3(u1, layer), gx, gy), o2 = textureGrad(tO, vec3(u2, layer), hx, hy);
  s.albedo.rgb *= mix(1.0, a1.r + a2.r, amount);
  vec2 dn = (n1.xy + transpose(R) * n2.xy) * 0.7071;
  s.normal = normalize(vec3(s.normal.xy + dn * amount, s.normal.z));
  s.orm.g = clamp(s.orm.g + (o1.g + o2.g - 1.0) * amount, 0.02, 1.0);
}

// screen-space specular AA on the final (perturbed) normal (Tokuyoshi-Kaplanyan / Filament): widens the lobe where
// the normal changes faster than the pixel grid can resolve — kills glints on bevels/rivets at distance.
float texlibSpecularAA(vec3 n, float roughness) {
  vec3 du = dFdx(n), dv = dFdy(n);
  float kernel = min(2.0 * 0.15 * (dot(du, du) + dot(dv, dv)), 0.2);
  float a = roughness * roughness;
  return sqrt(sqrt(clamp(a * a + kernel, 0.0, 1.0)));
}
float texlib_vn(vec2 p) {
  vec2 i = floor(p), f = p - i; vec2 u = f * f * (3.0 - 2.0 * f);
  ivec2 c = ivec2(i);
  float a = texlib_h01(texlib_hash(c)), b = texlib_h01(texlib_hash(c + ivec2(1, 0)));
  float d = texlib_h01(texlib_hash(c + ivec2(0, 1))), e = texlib_h01(texlib_hash(c + ivec2(1, 1)));
  return mix(mix(a, b, u.x), mix(d, e, u.x), u.y);
}
float texlibMacro(vec2 p) {
  float n = 0.62 * texlib_vn(p * 0.085 + 3.7) + 0.38 * texlib_vn(p * 0.29 + 11.3);
  return 0.94 + 0.12 * n;
}
float texlibCoverage(float a, vec2 uv, float texSize) {
  vec2 dx = dFdx(uv) * texSize, dy = dFdy(uv) * texSize;
  float lod = 0.5 * log2(max(max(dot(dx, dx), dot(dy, dy)), 1e-8));
  float sharp = clamp((a - 0.5) / max(fwidth(a), 1e-4) + 0.5, 0.0, 1.0);
  // coverage-preserving: as openings fall below the pixel grid the bars thicken until the grate reads solid
  // (as real grating does at a distance / grazing angle) instead of breaking into dotted, shimmering holes
  float far = clamp(a * (1.0 + 1.6 * max(lod, 0.0)), 0.0, 1.0);
  return mix(sharp, far, smoothstep(-0.5, 0.8, lod));
}
#endif

#endif
uniform vec4 uMurA[12];
uniform vec4 uMurB[12];
uniform vec2 uMurC[12];
vec3 gTexMod = vec3(1.0);   // surface albedo modulation (≈ 1 mean) + paint coverage, for weathered murals
float gTexPaint = 1.0;
vec3 gTexN = vec3(0.0, 0.0, 1.0);
vec4 gTexORM = vec4(1.0, 0.8, 0.0, 0.5);
float gTexStr = 0.0;
vec4 gStair = vec4(0.0);    // stair / ramp top: distance across from one side (m), width (m), edge kind, step coordinate
float gTexKeep = 0.0;       // share of the texture relief kept under ink (stairs keep their steps)
float gTexAlpha = 1.0;
float gInk = 0.0;
vec3 gInkCol = vec3(0.0);
float gBaseRough = 0.8;
float gInkH = 0.0;
vec2 gInkD = vec2(0.0);
float gRib = 0.0;
float gFresh = 0.0;
float gInkNear = 0.0;
float gInkS = 0.0;
float gWake = 0.0;
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
{
  // see-through: geometry in front of the local player that overlaps their on-screen silhouette dissolves, so low
  // cover never hides your character. The window is a capsule in screen space around the body (feet → head) with a
  // soft edge; only fragments clearly in front of the player dissolve (never anything behind them), and floors /
  // platform sides at or below the player's feet are never cut (no holes under you).
  // With MSAA the fade uses alpha-to-coverage (sub-pixel, smooth); without it an 8×8 ordered dither + discard.
  diffuseColor.a = 1.0;
  if (uSeeOn > 0.001) {
    vec3 Bv = (viewMatrix * vec4(uSeeB, 1.0)).xyz;
    float dB = -Bv.z, dP = vViewPosition.z;
    if (dB > 0.6 && dP < dB - 0.2) {
      float bodyH = uSeeB.y - uSeeFeet;                        // kid ≈ 1.0, squid ≈ 0.4
      vec3 Fv = (viewMatrix * vec4(uSeeB.x, uSeeFeet + 0.05, uSeeB.z, 1.0)).xyz;
      vec3 Hv = (viewMatrix * vec4(uSeeB.x, uSeeFeet + bodyH * 1.42 + 0.06, uSeeB.z, 1.0)).xyz;
      vec2 p = -vViewPosition.xy / dP, f = Fv.xy / max(-Fv.z, 0.05), h = Hv.xy / max(-Hv.z, 0.05);
      vec2 fh = h - f;
      float t = clamp(dot(p - f, fh) / max(dot(fh, fh), 1e-8), 0.0, 1.0);
      float sd = length(p - (f + fh * t)) * dB;                  // metres, measured at the player's distance
      float R = mix(0.3, 0.46, clamp(bodyH, 0.0, 1.0));          // body half-width + margin
      float k = 1.0 - smoothstep(R, R + 0.42, sd);
      k *= 1.0 - smoothstep(dB - 0.75, dB - 0.2, dP);                  // only well in front of the player
      // never cut floors at the player's feet, nor the sides of the platform they stand on
      float feetTop = uSeeFeet + 0.3;
      if (vWNorm.y > 0.6 && vWPos.y < feetTop) k = 0.0;
      // A supporting ramp is not a camera obstruction, even uphill of the feet.
      if (uSeeSupport.y > 0.6 && dot(vWNorm, uSeeSupport.xyz) > 0.995
          && abs(dot(vWPos, uSeeSupport.xyz) - uSeeSupport.w) < 0.03) k = 0.0;
      if (abs(vWNorm.y) < 0.6 && vWPos.y + max(vFaceData.w - vFaceUv.y, 0.0) * 0.9 < feetTop) k = 0.0;
      k *= uSeeOn;
      if (k > 0.002) {
        ivec2 q = ivec2(gl_FragCoord.xy) & 7;
        int xy = q.x ^ q.y;
        float bay = (float(((xy & 1) << 5) | ((q.x & 1) << 4) | ((xy & 2) << 2) | ((q.x & 2) << 1) | ((xy & 4) >> 1) | ((q.x & 4) >> 2)) + 0.5) / 64.0;
        // alpha-to-coverage gives 4 levels per pixel; a small ordered offset fills the steps in between, tapered so
        // the open centre and the untouched rim stay perfectly clean (no screen-door grain over the character)
        float a = 1.0 - k;
        if (uSeeA2C > 0.5) diffuseColor.a = clamp(a + (bay - 0.5) * 0.25 * smoothstep(0.0, 0.2, a) * (1.0 - smoothstep(0.8, 1.0, a)), 0.0, 1.0);
        else if (k > bay * 0.98 + 0.01) discard;
      }
    }
  }
  vec2 fu = vFaceUv;
  float pattern = vFaceData.x;
#ifdef GRATE
  // bar grating: 4 cm bars on a 7 cm pitch one way, 2 cm cross-bars every 20 cm; holes are cut out
  {
    float gw = fwidth(fu.x) + 1e-4;
    float bx = 1.0 - smoothstep(0.02 - gw, 0.02 + gw, abs(fract(fu.x / 0.07 + 0.5) - 0.5) * 0.07);
    float by = 1.0 - smoothstep(0.01 - gw, 0.01 + gw, abs(fract(fu.y / 0.2 + 0.5) - 0.5) * 0.2);
    float edge = 1.0 - smoothstep(0.05, 0.06, min(min(fu.x, fsz0(vFaceData).x - fu.x), min(fu.y, fsz0(vFaceData).y - fu.y)));
    float solid = max(max(bx, by), edge);
    if (abs(vWNorm.y) < 0.5) solid = 1.0;
    if (solid < 0.5) discard;
  }
#endif
  vec2 fsz = vFaceData.zw;
  vec3 base = diffuseColor.rgb;
  float rough = 0.82;
  float big = fbm(vWPos.xz * 0.18 + vWPos.y * 0.1);
  float fine = vnoise(fu * 9.0);
#ifdef USE_TEXLIB
  {
    int pid = int(pattern + 0.5);
    bool vertical = abs(vWNorm.y) < 0.5;
    // per-slot remaps: ramp / asphalt / yard sides → concrete, car-deck edge → plating, gelcoat tops → planks
    if (vertical) pid = int(uTLt[pid].z + 0.5); else if (vWNorm.y > 0.5) pid = int(uTLt[pid].w + 0.5);
    vec4 tl = uTL[pid]; vec4 tt = uTLt[pid];
    // stairs / ramps: sample in the ramp's own frame — u across, v downhill from the top landing — with v phase-locked so
    // a whole number of steps fits the visible flight (the slab runs 0.6 m on under the floor at its low end, level.js)
    vec2 tuv = fu * tl.y;
    vec4 sp = uTLs[pid];
    vec2 tA = vec2(1.0, 0.0), tD = vec2(0.0, 1.0);
    if (sp.x > 0.0 && vWNorm.y > 0.5) {
      bool alongU = abs(vFaceTan.y) > 0.02;                                   // x-running ramps: face u runs up/down the slope
      float sg = alongU ? sign(vFaceTan.y) : sign(vWNorm.z * vFaceTan.x - vWNorm.x * vFaceTan.z);   // uphill = +axis?
      float fa = alongU ? fu.x : fu.y, fcr = alongU ? fu.y : fu.x;
      float La = alongU ? fsz.x : fsz.y, Wd = alongU ? fsz.y : fsz.x;
      float dTop = sg > 0.0 ? La - fa : fa;
      if (dTop > La - 0.3) { sg = -sg; dTop = La - dTop; }                   // bevel past the crest: visible fragments never sit in the buried tail
      float Lv = max(La - 0.6, sp.x);
      float Ps = Lv / max(1.0, floor(Lv / sp.x + 0.5));
      tuv = vec2(fcr * tl.y, dTop / (Ps * sp.y));
      tA = alongU ? vec2(0.0, 1.0) : vec2(1.0, 0.0);
      tD = alongU ? vec2(-sg, 0.0) : vec2(0.0, -sg);
      gStair = vec4(fcr, Wd, sp.w, dTop / Ps);
      gTexKeep = sp.z;
    }
    TexlibSample ts = texlibSample(tAlbedo, tNormal, tOrm, tuv, tl.x, int(tl.z), int(tl.w));
    ts.normal = vec3(ts.normal.x * tA + ts.normal.y * tD, ts.normal.z);      // back into the face's (u, v) frame
    base = tt.x > 1.5 ? ts.albedo.rgb + diffuseColor.rgb * ts.albedo.a * 1.25
         : (tt.x > 0.5 ? diffuseColor.rgb * ts.albedo.rgb * 1.25 : ts.albedo.rgb);
    base *= texlibMacro(vWPos.xz + vWPos.y * 0.7);
    base *= mix(1.0, ts.orm.r, 0.85);                            // cavity occlusion in grout / seams / grooves
    gTexMod = (tt.x > 1.5 ? vec3(ts.albedo.a * 1.25) : (tt.x > 0.5 ? ts.albedo.rgb * 1.25 : vec3(1.0))) * mix(1.0, ts.orm.r, 0.85);
    gTexPaint = tt.x > 1.5 ? clamp(ts.albedo.a * 1.45, 0.0, 1.0) : 1.0;
    rough = ts.orm.g;
    gTexN = ts.normal; gTexORM = ts.orm; gTexStr = tt.y; gTexAlpha = ts.albedo.a;
    #ifdef GRATE
      if (texlibCoverage(ts.albedo.a, fu * tl.y, uTexSize) < 0.5 && !vertical) discard;
    #endif
  }
  if (pattern < 0.5) {
  } else if (pattern < 1.5) {
    // court markings over the pavers
    float rr = length(vWPos.xz);
    float wr = fwidth(rr);
    float mark = 1.0 - smoothstep(0.09 - wr, 0.09 + wr, abs(rr - 9.5));
    float wz = fwidth(vWPos.z);
    mark = max(mark, (1.0 - smoothstep(0.07 - wz, 0.07 + wz, abs(vWPos.z))) * step(9.5, abs(vWPos.x)));
    mark *= 0.75 + 0.25 * step(0.35, vnoise(vWPos.xz * 6.0));
    if (vWNorm.y > 0.5) base = mix(base, vec3(0.97, 0.96, 0.92), mark * 0.9);
  } else if (pattern > 3.5 && pattern < 4.5) {
    float edge = 1.0 - smoothstep(0.16, 0.2, min(fu.x, fsz.x - fu.x));
    if (vWNorm.y > 0.5) { base = mix(base, vec3(0.93, 0.72, 0.12), edge * 0.95); rough = mix(rough, 0.6, edge); }
  } else if (pattern > 7.5 && pattern < 8.5) {
    float e = min(min(fu.x, fsz.x - fu.x), min(fu.y, fsz.y - fu.y));
    float band = 1.0 - smoothstep(0.34, 0.36, e);
    float chev = step(0.5, fract((fu.x + fu.y) * 1.6));
    if (vWNorm.y > 0.5) base = mix(base, mix(vec3(0.95, 0.76, 0.1), vec3(0.12), chev), band * step(0.05, e));
  } else if (pattern > 8.5 && pattern < 9.5) {
    float e = min(min(fu.x, fsz.x - fu.x), min(fu.y, fsz.y - fu.y));
    float bed = smoothstep(0.24, 0.27, e) * step(0.5, vWNorm.y);
    vec3 grass = vec3(0.32, 0.55, 0.22) * (0.8 + 0.35 * fbm(fu * 6.0));
    base = mix(base, grass, bed);
    rough = mix(rough, 0.95, bed);
    gTexStr *= 1.0 - bed;
  } else if (pattern > 9.5 && pattern < 10.5 && abs(vWNorm.y) >= 0.5) {
      vec2 wp = vWPos.xz;
      float ax = abs(wp.x), az = abs(wp.y);
      float mw = fwidth(ax) + 1e-4;
      float dash = step(0.45, fract(az / 3.0));
      float lane = (1.0 - smoothstep(0.07 - mw, 0.07 + mw, abs(ax - 11.5))) * dash * step(4.0, az);
      float bay = (1.0 - smoothstep(0.05 - mw, 0.05 + mw, abs(fract((ax - 2.0) / 2.6) - 0.5) * 2.6)) * step(24.5, az) * step(az, 27.0) * step(ax, 8.0);
      float sx = wp.x * sign(wp.y);
      vec2 hz = vec2(sx - 4.0, az - 17.0);
      float inZone = step(abs(hz.x), 2.0) * step(abs(hz.y), 1.0);
      float hatch = step(0.5, fract((wp.x + wp.y) * 1.25)) * inZone;
      float border = inZone * (1.0 - step(abs(hz.x), 1.9) * step(abs(hz.y), 0.9));
      float wear = 0.9 + 0.1 * smoothstep(0.2, 0.5, vnoise(wp * 3.0));
      float paintM = clamp(lane + hatch * 0.9 + border, 0.0, 1.0) * wear;
      base = mix(base, vec3(0.95, 0.74, 0.18), paintM);
      base = mix(base, vec3(0.93, 0.93, 0.9), bay * wear);
      rough = mix(rough, 0.7, max(paintM, bay));
  }
  // ---- modelled detail (shader-only, no layout change) ----
  {
    int pid = int(pattern + 0.5);
    vec2 wp = vWPos.xz;
    float ef = min(min(fu.x, fsz.x - fu.x), min(fu.y, fsz.y - fu.y));
    bool isTop = vWNorm.y > 0.6;
    bool isWall = abs(vWNorm.y) < 0.5;
    // floors: soft grime patches, sun-bleached warm areas and smoother traffic-polished patches (sheen at grazing sun)
    if (isTop && (pid == 1 || pid == 16 || pid == 10 || pid == 2 || pid == 8 || pid == 17 || pid == 19 || pid == 21)) {
      float m1 = vnoise(wp * 0.09 + 5.3), m2 = vnoise(wp * 0.31 + 1.7), m3 = vnoise(wp * 1.3);
      float grime = smoothstep(0.52, 0.86, m1 * 0.65 + m2 * 0.35);
      base *= 1.0 - 0.075 * grime * (0.7 + 0.3 * m3);
      base *= mix(vec3(1.0), vec3(1.025, 1.005, 0.965), smoothstep(0.42, 0.12, m1));
      rough = mix(rough, rough * 0.72, smoothstep(0.62, 0.9, m2) * 0.7);
    }
    // stone coping on exposed tops of walls / platforms / parapets, with a drip-groove shadow under the cap
    if (pid == 0 || pid == 2 || pid == 3 || pid == 13 || pid == 15 || pid == 16 || pid == 23) {
      float cop = 0.0, groove = 0.0;
      float cw = mix(0.2, 0.26, step(3.0, min(fsz.x, fsz.y)));
      if (isTop) {
        cop = min(fsz.x, fsz.y) < 1.15 ? 1.0 : 1.0 - smoothstep(cw - 0.008, cw + 0.008, ef);
        groove = (1.0 - smoothstep(0.004, 0.012, abs(ef - cw))) * step(1.15, min(fsz.x, fsz.y));
      } else if (isWall && vFaceFlags.x > 0.5) {
        float dt = fsz.y - fu.y;
        cop = 1.0 - smoothstep(0.1, 0.108, dt);
        groove = 1.0 - smoothstep(0.005, 0.016, abs(dt - 0.118));
      }
      vec3 stone = vec3(0.9, 0.885, 0.845) * (0.95 + 0.07 * vnoise(fu * 9.0) + 0.03 * vnoise(fu * 41.0));
      base = mix(base, stone * texlibMacro(wp + vWPos.y * 0.7), cop);
      rough = mix(rough, 0.72, cop);
      gTexStr *= 1.0 - 0.8 * cop;
      base *= 1.0 - 0.28 * groove;
    }
    // practice range measuring grid (floors): thin lines on every world metre, bold on every 5 m
    if (pid == 31 && isTop) {
      float mn = max(rangeLine(vWPos.x, 1.0, 0.011), rangeLine(vWPos.z, 1.0, 0.011));
      float mj = max(rangeLine(vWPos.x, 5.0, 0.04), rangeLine(vWPos.z, 5.0, 0.04));
      base = mix(base, base * 0.6, mn * 0.8);
      base = mix(base, base * 0.34, mj);
    }
    // practice range height lines (walls): every 0.5 m of world height, bold on every metre
    if (pid == 32 && isWall) {
      float hm = rangeLine(vWPos.y, 0.5, 0.009), hM = rangeLine(vWPos.y, 1.0, 0.022);
      base = mix(base, base * 0.62, hm * 0.8);
      base = mix(base, vec3(0.13, 0.16, 0.23), hM * 0.85);
    }
    // ramps: anti-slip grooves across the slope
    if (pid == 4 && isTop) {
      vec3 Tt = normalize(vFaceTan - vWNorm * dot(vFaceTan, vWNorm)), Bb = cross(vWNorm, Tt);
      vec2 up2 = vec2(Tt.y, Bb.y);
      float along = dot(fu, up2 / max(length(up2), 1e-4));
      float g = gridLine(along, 0.32, 0.016);
      base *= 1.0 - 0.2 * g;
      rough = mix(rough, 0.95, g);
    }
    // containers: rust streaks bleeding from the top rail and corners, dirt toward the bottom
    if (pid == 5 && isWall) {
      float st = vnoise(vec2(dot(wp, vec2(0.707)) * 5.5 + vWPos.x * 0.8, vWPos.y * 0.35));
      float fromTop = smoothstep(fsz.y * 0.25, fsz.y, fu.y);
      float rust = smoothstep(0.6, 0.92, st) * (0.35 + 0.65 * fromTop);
      rust = max(rust, (1.0 - smoothstep(0.05, 0.3, ef)) * smoothstep(0.45, 0.8, vnoise(fu * 3.0)) * 0.8);
      base = mix(base, vec3(0.42, 0.2, 0.1) * (0.8 + 0.4 * vnoise(fu * 11.0)), rust * 0.42);
      rough = mix(rough, 0.85, rust);
      base *= mix(0.84, 1.0, smoothstep(0.0, 0.7, fu.y));
    }
    // stairs / ramps: soft contact shadow along the stringers / kick plates / cheek walls the props put at both sides;
    // the stone stair is worn smoother and paler down its middle, the steel stair's plate polished along the walking line
    if (gStair.z > 0.5) {
      float e = min(gStair.x, gStair.y - gStair.x);
      float kind = gStair.z;
      float sw = kind < 1.5 ? 0.16 : (kind < 2.5 ? 0.3 : (kind < 3.5 ? 0.14 : 0.12));
      base *= 1.0 - (kind < 2.5 ? 0.26 : 0.2) * (1.0 - smoothstep(0.0, sw, e));
      float mid = 1.0 - smoothstep(0.18, 0.42, abs(gStair.x / max(gStair.y, 0.01) - 0.5));
      if (kind > 1.5 && kind < 2.5) { base *= 1.0 + 0.05 * mid; rough = mix(rough, rough * 0.78, mid); }
      if (kind < 1.5) rough = mix(rough, rough * 0.85, mid * (1.0 - gTexPaint));
    }
    // painted render / timber cladding: rain-washed grime streaks hanging from the top edge of each wall face
    if ((pid == 23 || pid == 22) && isWall) {
      float fromTop = fsz.y - fu.y;
      float st = 0.6 * vnoise(vec2(fu.x * 1.9, fromTop * 0.3 + 7.1)) + 0.4 * vnoise(vec2(fu.x * 6.3, fromTop * 0.8 + 2.3));
      float streak = smoothstep(0.5, 0.85, st) * exp(-fromTop * 0.75);
      base *= 1.0 - 0.2 * streak;
      rough = mix(rough, 0.9, streak * 0.6);
    }
    // boatyard: galvanised slot drain round the tug's wash-down bay (Alpha-half coordinates; the 180° twin follows)
    if (pid == 21 && isTop) {
      vec2 q = wp.y > 0.0 ? -wp : wp;
      vec2 d = abs(q - vec2(17.5, -18.4)) - vec2(4.4, 7.0);
      float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
      float e = abs(sd), aw = fwidth(e) + 1e-4;
      float chan = 1.0 - smoothstep(0.08 - aw, 0.08 + aw, e);
      float lip = (1.0 - smoothstep(0.105 - aw, 0.105 + aw, e)) * (1.0 - chan);
      float run = d.x > d.y ? q.y : q.x;
      float fw = fwidth(run) + 1e-5;
      float slot = smoothstep(0.3 - fw / 0.025, 0.3 + fw / 0.025, abs(fract(run / 0.025) - 0.5) * 2.0);
      float bar = mix(0.4, slot, clamp(0.025 / (fw * 4.0) - 0.5, 0.0, 1.0));
      base = mix(base, mix(vec3(0.025), vec3(0.34, 0.35, 0.36), bar), chan);
      base = mix(base, vec3(0.4, 0.41, 0.42) * (0.9 + 0.2 * fine), lip * 0.85);
      rough = mix(rough, 0.48, max(chan * bar, lip));
      gTexORM.b = mix(gTexORM.b, 0.75, max(chan * bar, lip));
      gTexStr *= 1.0 - max(chan, lip);
      base *= mix(vec3(1.0), vec3(0.94, 0.9, 0.87), step(sd, -0.105) * 0.8);   // the bay floor: darker, run-off stained
      // world-scale (non-repeating) oil drips and a worn service-lane wheel track beside the bay
      float oilW = smoothstep(0.68, 0.88, 0.65 * vnoise(q * 0.9 + 13.1) + 0.35 * vnoise(q * 3.1 + 2.7));
      base *= 1.0 - 0.26 * oilW * (1.0 - chan);
      rough = mix(rough, 0.62, oilW * 0.5);
      float tx = q.x - (12.15 + 0.25 * sin(q.y * 0.37));
      float track = (1.0 - smoothstep(0.1, 0.17, min(abs(tx - 0.85), abs(tx + 0.85)))) * step(q.y, -7.6) * (0.5 + 0.5 * vnoise(q * vec2(1.3, 0.35)));
      base *= 1.0 - 0.1 * track;
      rough = mix(rough, rough * 0.85, track);
    }
  }
  if (false) { if (pattern < 0.5) {   // legacy procedural chain below is compiled out of use
#else
  base *= 0.93 + 0.1 * big;
  if (pattern < 0.5) {
#endif
    // plain painted concrete
    base *= 0.97 + 0.05 * fine;
  } else if (pattern < 1.5) {
    // deck: 2 m concrete slabs with dark joints, tone per slab, speckle
    vec2 cell = floor(fu / 2.0);
    base *= 0.95 + 0.08 * h21(cell);
    float j = max(gridLine(fu.x, 2.0, 0.018), gridLine(fu.y, 2.0, 0.018));
    base *= 1.0 - 0.28 * j;
    base *= 0.96 + 0.06 * step(0.93, h21(floor(fu * 22.0)));
    // painted court markings: centre ring + halfway line (slightly worn)
    float rr = length(vWPos.xz);
    float wr = fwidth(rr);
    float mark = 1.0 - smoothstep(0.09 - wr, 0.09 + wr, abs(rr - 9.5));
    float wz = fwidth(vWPos.z);
    mark = max(mark, (1.0 - smoothstep(0.07 - wz, 0.07 + wz, abs(vWPos.z))) * step(9.5, abs(vWPos.x)));
    mark *= 0.75 + 0.25 * step(0.35, vnoise(vWPos.xz * 6.0));
    if (vWNorm.y > 0.5) base = mix(base, vec3(0.97, 0.96, 0.92), mark * 0.9);
    rough = 0.86;
  } else if (pattern < 2.5) {
    // tiles: 0.5 m tiles with lighter grout
    vec2 cell = floor(fu / 0.5);
    base *= 0.94 + 0.09 * h21(cell + 3.1);
    float j = max(gridLine(fu.x, 0.5, 0.012), gridLine(fu.y, 0.5, 0.012));
    base = mix(base, base * 0.78 + 0.08, j);
    rough = 0.6;
  } else if (pattern < 3.5) {
    // concrete wall: formwork bands + tie holes + low grime
    float band = gridLine(fu.y, 1.2, 0.01);
    base *= 1.0 - 0.14 * band;
    vec2 tp = vec2(fract(fu.x / 1.2) - 0.5, fract(fu.y / 1.2 - 0.25) - 0.5) * 1.2;
    base *= 1.0 - 0.35 * (1.0 - smoothstep(0.02, 0.035, length(tp)));
    base *= 0.94 + 0.06 * smoothstep(0.0, 0.9, fu.y);
    rough = 0.9;
  } else if (pattern < 4.5) {
    // ramps: grip grooves + yellow safety edges
    float g = gridLine(fu.y, 0.35, 0.02);
    base *= 1.0 - 0.18 * g;
    float edge = 1.0 - smoothstep(0.16, 0.2, min(fu.x, fsz.x - fu.x));
    if (vWNorm.y > 0.5) base = mix(base, vec3(0.93, 0.72, 0.12), edge * 0.95);
    rough = 0.75;
  } else if (pattern < 5.5) {
    // shipping container: vertical corrugation ribs
    float rib = sin(fu.x / 0.28 * 6.2831);
    gRib = rib;
    base *= 0.92 + 0.1 * rib;
    float frame = 1.0 - smoothstep(0.08, 0.1, min(min(fu.y, fsz.y - fu.y), min(fu.x, fsz.x - fu.x)));
    base = mix(base, base * 0.7, frame);
    base *= 0.95 + 0.07 * fbm(fu * vec2(3.0, 0.7));
    rough = 0.55;
  } else if (pattern < 6.5) {
    // wood planks
    float pl = gridLine(fu.y, 0.26, 0.008);
    float plank = floor(fu.y / 0.26);
    float grain = fbm(vec2(fu.x * 0.7 + h21(vec2(plank)) * 30.0, fu.y * 18.0));
    base *= 0.84 + 0.22 * grain;
    base *= 1.0 - 0.35 * pl;
    float frame = 1.0 - smoothstep(0.1, 0.12, min(min(fu.y, fsz.y - fu.y), min(fu.x, fsz.x - fu.x)));
    base = mix(base, base * 0.82, frame * step(fsz.x, 3.0) * step(fsz.y, 3.0));
    rough = 0.78;
  } else if (pattern < 7.5) {
    // metal railing: brushed + rivets
    base *= 0.92 + 0.08 * vnoise(vec2(fu.x * 40.0, fu.y * 1.5));
    vec2 rp = vec2(fract(fu.x / 0.8) - 0.5, fu.y - fsz.y + 0.12) * vec2(0.8, 1.0);
    base *= 1.0 - 0.3 * (1.0 - smoothstep(0.02, 0.03, length(rp)));
    rough = 0.45;
  } else if (pattern < 8.5) {
    // spawn deck: tiles + chevron hazard band around the edges
    vec2 cell = floor(fu / 0.6);
    base *= 0.95 + 0.06 * h21(cell + 7.7);
    float j = max(gridLine(fu.x, 0.6, 0.01), gridLine(fu.y, 0.6, 0.01));
    base *= 1.0 - 0.15 * j;
    float e = min(min(fu.x, fsz.x - fu.x), min(fu.y, fsz.y - fu.y));
    float band = 1.0 - smoothstep(0.34, 0.36, e);
    float chev = step(0.5, fract((fu.x + fu.y) * 1.6));
    if (vWNorm.y > 0.5) base = mix(base, mix(vec3(0.95, 0.76, 0.1), vec3(0.12), chev), band * step(0.05, e));
    rough = 0.65;
  } else if (pattern > 9.5 && pattern < 10.5) {
    if (abs(vWNorm.y) < 0.5) {
      // slab edges / trench walls read as poured concrete
      base = base * 1.18 * (0.95 + 0.05 * fine);
      base *= 1.0 - 0.12 * gridLine(fu.y, 1.2, 0.01);
      rough = 0.9;
    } else {
      base *= 0.92 + 0.08 * vnoise(fu * 3.0) + 0.04 * (vnoise(fu * 37.0) - 0.5) * (1.0 - smoothstep(0.02, 0.06, length(fwidth(fu))));
      rough = 0.92;
      // container-yard markings (world space, symmetric under the map's 180° rotation)
      vec2 wp = vWPos.xz;
      float ax = abs(wp.x), az = abs(wp.y);
      float mw = fwidth(ax) + 1e-4;
      // dashed yellow lane dividers at x = ±11.5
      float dash = step(0.45, fract(az / 3.0));
      float lane = (1.0 - smoothstep(0.07 - mw, 0.07 + mw, abs(ax - 11.5))) * dash * step(4.0, az);
      // white bay lines beside the base containers
      float bay = (1.0 - smoothstep(0.05 - mw, 0.05 + mw, abs(fract((ax - 2.0) / 2.6) - 0.5) * 2.6)) * step(24.5, az) * step(az, 27.0) * step(ax, 8.0);
      // hatched safety zone at the foot of each central ramp
      float sx = wp.x * sign(wp.y);           // 180°-rotation-symmetric x (ramps sit at x=-4,z<0 and x=+4,z>0)
      vec2 hz = vec2(sx - 4.0, az - 17.0);
      float inZone = step(abs(hz.x), 2.0) * step(abs(hz.y), 1.0);
      float hatch = step(0.5, fract((wp.x + wp.y) * 1.25)) * inZone;
      float border = inZone * (1.0 - step(abs(hz.x), 1.9) * step(abs(hz.y), 0.9));
      float wear = 0.9 + 0.1 * smoothstep(0.2, 0.5, vnoise(wp * 3.0));
      base = mix(base, vec3(0.95, 0.74, 0.18), clamp(lane + hatch * 0.9 + border, 0.0, 1.0) * wear);
      base = mix(base, vec3(0.93, 0.93, 0.9), bay * wear);
    }
  } else if (pattern > 10.5 && pattern < 11.5) {
    // painted steel panels: 1.2 m panels with seams + bolt rows
    float seam = max(gridLine(fu.x, 1.2, 0.008), gridLine(fu.y, 1.2, 0.008));
    base *= 1.0 - 0.22 * seam;
    base *= 0.95 + 0.06 * fbm(fu * 1.3);
    rough = 0.5;
  } else if (pattern > 11.5 && pattern < 12.5) {
    base *= 0.9;
    rough = 0.45;
  } else if (pattern > 15.5 && pattern < 16.5) {
    // pavers: 2 m slabs
    vec2 cell = floor(fu / 2.0);
    base *= 0.95 + 0.07 * h21(cell + 1.3);
    float j = max(gridLine(fu.x, 2.0, 0.02), gridLine(fu.y, 2.0, 0.02));
    base *= 1.0 - 0.25 * j;
    rough = 0.84;
  } else if (pattern > 12.5) {
    base *= 0.95 + 0.05 * fine;
    rough = 0.7;
  } else {
    // planter: stone rim with grass bed on top
    float e = min(min(fu.x, fsz.x - fu.x), min(fu.y, fsz.y - fu.y));
    float bed = smoothstep(0.24, 0.27, e) * step(0.5, vWNorm.y);
    vec3 grass = vec3(0.32, 0.55, 0.22) * (0.8 + 0.35 * fbm(fu * 6.0));
    base = mix(base * (0.95 + 0.05 * fine), grass, bed);
    rough = mix(0.8, 0.95, bed);
  }
#ifdef USE_TEXLIB
  }
#endif
  // murals / signage
  if (vFaceFlags.z > -0.5) {
    // atlas rect (mA) + placement on the face in metres (mB: x0, xLen, y0, yLen; xLen < 0 = strip repeating every
    // -xLen face heights, yLen <= 0 = full face height) + weathering (mC: surface shows through, paint damage cuts it)
    int mi = int(vFaceFlags.z + 0.5);
    vec4 mA = uMurA[mi], mB = uMurB[mi];
    vec2 mC = uMurC[mi];
    float my = mB.w > 0.0 ? (fu.y - mB.z) / mB.w : fu.y / fsz.y;
    float mx = mB.y < 0.0 ? fu.x / (-mB.y * fsz.y) : clamp((fu.x - mB.x) / mB.y, 0.0005, 0.9995);
    vec2 muv = vec2(mA.x + mA.y * mx, mA.z + mA.w * clamp(my, 0.004, 0.996));
    vec4 mc = texture2D(uMural, muv);
    mc.rgb *= mix(vec3(1.0), gTexMod, mC.x);
    mc.a *= mix(1.0, gTexPaint, mC.y);
    base = mix(base, mc.rgb * (0.92 + 0.1 * big), mc.a * 0.96);
  }
  // crisp modelled edges: thin bright chamfer + soft inner shadow
  float e = min(min(fu.x, fsz.x - fu.x), min(fu.y, fsz.y - fu.y));
  float ew = fwidth(e);
  // (edges are real bevel geometry now; the old painted chamfer lines drew seams where faces stack)
  // contact darkening at the foot of walls that stand on something
  if (vFaceFlags.x > 0.5 && vFaceFlags.y > 0.5) {
    base *= mix(0.55, 1.0, smoothstep(0.0, 0.85, fu.y));
  }
  gBaseRough = rough;

  // ---- wet ink (src/world/inkShading.js) ----

  if (vFaceData.y > 0.5) {
    vec2 pdx = dFdx(vPaintUv), pdy = dFdy(vPaintUv);
    float texFoot = max(length(pdx), length(pdy)) / uTexel;
    float gk = min(1.0, 8.0 / max(texFoot, 1e-4));
    gPdx = pdx * gk; gPdy = pdy * gk;
    vec4 pnt = paintAt(vPaintUv);
    float near = 1.0 - smoothstep(0.9, 2.4, texFoot);
    vec4 gX = vec4(0.0), gY = vec4(0.0);                   // per-texel gradients of all four channels
    vec4 l2 = textureLod(uPaint, vPaintUv, 2.0);
    float seam2 = l2.r / max(l2.a, 1e-3);
    if (near > 0.0 && l2.a > 0.002 && (l2.a < 0.998 || pnt.a < 0.998 || (seam2 > 0.006 && seam2 < 0.994))) {
      vec4 cX, cY;
      vec4 cub = paintCubic(vPaintUv, cX, cY);
      pnt = mix(pnt, cub, near);
      gX = cX * near; gY = cY * near;
    }
    gInkNear = near;
    float amt = pnt.a;
    float fw = fwidth(amt);
    float w = clamp(fw * 0.8, 0.008, 0.25);
    gInk = smoothstep(0.5 - w, 0.5 + w, amt);
    float ia = 1.0 / max(amt, 0.02);
    float tRaw = clamp(pnt.r * ia, 0.0, 1.0);
    // crisp, pixel-anti-aliased colour border between the teams (no muddy mixed-colour fringe)
    float wT = clamp(fwidth(tRaw) * 0.75, 0.012, 0.2);
    float tm = smoothstep(0.5 - wT, 0.5 + wT, tRaw);
    float wet = clamp(pnt.g * ia, 0.0, 1.0);
    float fresh = smoothstep(0.3, 0.97, wet);               // visibly wet for ≈ 4 s after landing
    gFresh = fresh * gInk;
    float tone = clamp(pnt.b * ia, 0.0, 1.0);
    bool wallF = abs(vWNorm.y) < 0.5;
    vec3 Tf = normalize(vFaceTan - vWNorm * dot(vFaceTan, vWNorm)), Bf = cross(vWNorm, Tf);
    // world-space direction toward the sun (the scene's only directional light)
#if NUM_DIR_LIGHTS > 0
    vec3 sunW = normalize((vec4(directionalLights[0].direction, 0.0) * viewMatrix).xyz);
#else
    vec3 sunW = normalize(vec3(-0.41, 0.83, -0.38));
#endif
    vec2 sunF = vec2(dot(sunW, Tf), dot(sunW, Bf));        // sun direction in the face's (u, v) plane
    // thickness profile: 0 at the edge → 1 on the flat top (≈2–3 texels in). Floors pool (tall rounded lip, taller
    // while fresh); walls hold a thinner clinging film that lets the surface relief show through a little.
    float s = clamp((amt - 0.5) * 1.7, 0.0, 1.0);
    float hs = 1.0 - (1.0 - s) * (1.0 - s);
    gInkS = hs;
    float thick = (wallF ? 0.6 : 1.0) * (1.0 + 0.5 * fresh);
    gInkKeep = wallF ? 0.32 * (1.0 - 0.5 * fresh) : 0.0;
    vec2 gradA = vec2(gX.a, gY.a);
    gInkD = gradA * 2.0 * (1.0 - s) * 1.7 * 1.9 * gInk * thick;
    // where the two teams' inks meet: the newer (wetter) ink rides over the older one on a rounded lip; two inks of
    // the same age meet in a soft crease between their rounded edges
    vec2 gT = (vec2(gX.r, gY.r) - tRaw * gradA) * ia;       // d(team share) per texel
    float gTl = length(gT);
    float seam = 0.0, seamShadow = 0.0;
    if (gTl > 0.03 && amt > 0.6) {
      vec2 sn = gT / gTl;                                    // across the seam, toward team B
      float x = (tRaw - 0.5) / gTl;                          // signed distance to the midline, texels
      float e1 = exp(-x * x / 1.7), e2 = exp(-x * x / 0.8);
      seam = e1 * smoothstep(0.03, 0.14, gTl) * near;
      vec2 gW = (vec2(gX.g, gY.g) - wet * gradA) * ia;
      float newer = clamp(dot(gW, sn) / gTl * 1.6, -1.0, 1.0);   // +1: team B's side is the newer, wetter ink
      float dh = newer * 2.4 * e1 / 2.3 + 0.9 * 2.0 * x / 0.8 * e2 * (1.0 - 0.6 * abs(newer));
      gInkD += sn * dh * seam * gInk * thick;
      // the lower (older) side sits in the lip's shadow; the crease itself is a thin dark line
      seamShadow = seam * (0.45 * max(0.0, -x * newer) * e1 + 0.55 * e2 * (1.0 - 0.7 * abs(newer)));
    }
    // Convert per-texel derivatives to the slope of a 4mm world-space film.
    gInkD *= uPpm * 0.004 / 1.9;
    vec3 team = mix(uTeamA, uTeamB, tm);
    vec3 inkCol = team * (0.93 + 0.13 * tone);
    // translucent thin lip reads lighter and a touch more saturated; the thick body a little deeper
    float lip = (1.0 - hs) * near;
    inkCol = mix(inkCol, inkCol * 1.16 + team * 0.05, lip * 0.35);
    inkCol *= 1.0 - 0.05 * hs;
    inkCol *= 1.0 - 0.3 * seamShadow * gInk;
    // fresh ink: a touch brighter + richer for the first moments, settling to its dry colour
    inkCol *= 1.0 + 0.07 * fresh * fresh;
    gInkCol = inkCol;
    float halo = smoothstep(0.06, 0.5, amt) * (1.0 - gInk) * near;
    if (!wallF) {
      // ink sits ON the ground: the lip throws a soft contact shadow, heavier on the side away from the sun
      vec2 outN = -gradA / max(length(gradA), 1e-4);
      float away = clamp(0.55 - 0.9 * dot(outN, normalize(sunF + 1e-4)) * length(sunF), 0.25, 1.3);
      halo *= smoothstep(0.4, 0.85, vWNorm.y) * away;
      base *= mix(vec3(1.0), team * 0.45 + 0.3, halo * 0.5);
    } else {
      // walls: the edge soaks into the surface — a damp, slightly tinted halo instead of a shadow
      base *= mix(vec3(1.0), team * 0.35 + 0.5, halo * 0.55);
    }
    base = mix(base, gInkCol, gInk);
  }
  diffuseColor.rgb = base;
}
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>

roughnessFactor = mix(gBaseRough, mix(0.26, 0.14, gFresh), gInk);
	#include <metalnessmap_fragment>
#ifdef USE_TEXLIB
metalnessFactor = gTexORM.b * (1.0 - gInk);
#endif
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
{
  vec2 slope = gInkD;

  if (gInk > 0.01) {
    // gel micro-surface: soft swells so reflections break into wet highlights. Mip-filtered (fades to flat by itself
    // at distance). Walls stretch it vertically. Fresh ink is smoother (surface tension) and sways very gently while it
    // settles; dry ink shows a little more texture.
    vec2 gp = vFaceUv * (abs(vWNorm.y) < 0.5 ? vec2(0.9, 0.42) : vec2(0.75));
    float fr2 = gFresh * gFresh;
    gp += vec2(uTime * 0.011, -uTime * 0.007) + fr2 * 0.022 * vec2(sin(uTime * 2.3), cos(uTime * 1.9));
#ifdef USE_TEXLIB
    if (uGel >= 0.0) {
      vec2 gx = dFdx(gp), gy = dFdy(gp);
      vec3 gn = textureGrad(tNormal, vec3(gp, uGel), gx, gy).xyz * 2.0 - 1.0;
      slope += -gn.xy / max(gn.z, 0.3) * (0.95 - 0.5 * gFresh) * gInk * gInkS;
    }
#else
    {
      const float e = 0.06;
      vec2 q = gp * 2.2;
      float hx = vnoise(q + vec2(e, 0.0)) - vnoise(q - vec2(e, 0.0));
      float hy = vnoise(q + vec2(0.0, e)) - vnoise(q - vec2(0.0, e));
      float gf = 1.0 - smoothstep(0.03, 0.12, length(fwidth(vWPos)));
      slope += vec2(hx, hy) / (2.0 * e) * 0.035 * gf * gInk;
    }
#endif
  }
#ifndef USE_TEXLIB
  if (vFaceData.x > 4.5 && vFaceData.x < 5.5) {
    // corrugation on containers (only where not inked), analytic derivative
    slope.x += (1.0 - gInk) * -sin(vFaceUv.x / 0.28 * 6.2831) * 0.35;
  }
#endif
  vec3 T = normalize(vFaceTan - vWNorm * dot(vFaceTan, vWNorm));
  vec3 Bt = cross(vWNorm, T);
  if (gInk > 0.01) {
    // swim wakes: the ink itself ripples where a squid swims. Each trail segment sheds an expanding ripple (a stadium
    // around the path — their envelope opens into the V-wake) and the submerged body pushes up a glossy mound with a
    // small bow ridge at speed. Height field → analytic gradient in the face's tangent plane.
    vec3 wS = vec3(0.0); float wG = 0.0;
    for (int s = 0; s < 4; s++) {
      vec4 Bd = uWakeB[s];
      if (Bd.w <= 0.0 || distance(vWPos, Bd.xyz) > Bd.w) continue;
      for (int i = 0; i < 11; i++) {
        vec4 A0 = uWake[s * 12 + i], A1 = uWake[s * 12 + i + 1];
        if (A0.w < -1.0 || A1.w < -1.0) continue;
        vec3 ab = A1.xyz - A0.xyz;
        float t = clamp(dot(vWPos - A0.xyz, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
        float age = uTime - mix(A0.w, A1.w, t);
        if (age <= 0.0 || age > 1.15) continue;
        vec3 D = vWPos - (A0.xyz + ab * t);
        D -= vWNorm * dot(D, vWNorm);
        float d = length(D);
        float r = 0.1 + age * 0.95, w = 0.075 + age * 0.085;
        float x = d - r;
        float env = exp(-x * x / (w * w));
        if (env < 0.003) continue;
        float fade = 1.0 - age / 1.15;
        fade *= fade * smoothstep(0.0, 0.05, age);
        float amp = 0.0135 * fade;
        float dh = amp * env * (-2.0 * x / (w * w) * cos(x * 25.0) - 25.0 * sin(x * 25.0));
        wS += D * (dh / max(d, 1e-4));
        wG += env * fade * 0.6;
      }
      vec4 H = uSwimH[s], F = uSwimF[s];
      if (H.w > 0.002) {
        vec3 D = vWPos - H.xyz;
        D -= vWNorm * dot(D, vWNorm);
        vec3 Fp = F.xyz - vWNorm * dot(F.xyz, vWNorm);
        float fl = length(Fp);
        Fp = fl > 1e-3 ? Fp / fl : T;
        float al = dot(D, Fp);
        vec3 Cv = D - Fp * al;
        float ac = length(Cv);
        vec3 Cn = Cv / max(ac, 1e-4);
        // mound over the body (sits a touch behind the head, stretches with speed)
        float am = al + 0.1, La = 0.3 + 0.2 * F.w, Lc = 0.19;
        float hm = 0.05 * H.w * exp(-(am * am) / (La * La) - (ac * ac) / (Lc * Lc));
        // bow ridge pushed ahead of the head
        float ab2 = al - 0.3, hb = 0.022 * H.w * F.w * exp(-(ab2 * ab2) / 0.012 - (ac * ac) / 0.07);
        wS += Fp * (-2.0 * am / (La * La) * hm - 2.0 * ab2 / 0.012 * hb) + Cn * (-2.0 * ac / (Lc * Lc) * hm - 2.0 * ac / 0.07 * hb);
        wG += hm * 16.0 + hb * 20.0;
      }
    }
    // clamp the slope so crests never flip the normal; fade with distance like the gel (no shimmer on far floors)
    float wl = length(wS);
    if (wl > 0.9) wS *= 0.9 / wl;
    float wFar = 1.0 - smoothstep(0.05, 0.16, length(fwidth(vWPos)));
    slope += vec2(dot(wS, T), dot(wS, Bt)) * gInk * wFar;
    gWake = clamp(wG, 0.0, 1.0) * gInk * wFar;
  }

  if (gInk > 0.01) {
    // ripples: a wave packet runs out from every impact / footstep / dive, thinning as it spreads; the crests catch
    // the light (glossier). Height field → analytic gradient in the face plane.
    vec3 rS = vec3(0.0); float rG = 0.0;
    for (int i = 0; i < 24; i++) {
      vec4 Pr = uRip[i], Qr = uRipP[i];
      float age = uInkClock - Pr.w;
      if (age <= 0.0 || age >= Qr.w) continue;
      vec3 D = vWPos - Pr.xyz;
      float off = dot(D, vWNorm);
      if (abs(off) > 0.4) continue;                          // another surface
      D -= vWNorm * off;
      float front = Qr.z * age;
      float d = length(D);
      float x = d - front;
      float sg = Qr.y * 0.8;
      if (x > sg * 3.0 || x < -Qr.y * 4.0) continue;
      float env = exp(-x * x / (sg * sg));
      float k = 6.2831853 / Qr.y;
      float fade = 1.0 - age / Qr.w;
      fade *= fade * smoothstep(0.0, 0.03, age);
      float amp = Qr.x * fade / (1.0 + d * 1.6);
      float dh = amp * env * (-2.0 * x / (sg * sg) * cos(k * x) - k * sin(k * x));
      rS += D * (dh / max(d, 1e-4));
      rG += env * fade * min(Qr.x * 90.0, 1.0);
    }
    float rl = length(rS);
    if (rl > 0.75) rS *= 0.75 / rl;
    float rFar = 1.0 - smoothstep(0.05, 0.18, length(fwidth(vWPos)));
    slope += vec2(dot(rS, T), dot(rS, Bt)) * gInk * rFar;
    gWake = max(gWake, clamp(rG * 0.5, 0.0, 1.0) * gInk * rFar);
  }
  vec3 nBase = vWNorm;
#ifdef USE_TEXLIB
  float keep = max((vFaceData.x > 4.5 && vFaceData.x < 5.5) ? 0.55 : 0.0, gTexKeep);
  nBase = texlibPerturbNormal(gTexN, T, Bt, vWNorm, gTexStr * (1.0 - gInk * (1.0 - max(keep, gInkKeep))));
#endif
#ifdef DOUBLE_SIDED
  normal = normalize(mat3(viewMatrix) * (nBase - slope.x * T - slope.y * Bt)) * faceDirection;
#else
  vec3 wn = normalize(nBase - slope.x * T - slope.y * Bt);
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
#endif
}
	#include <clearcoat_normal_fragment_begin>
clearcoatNormal = normal;
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>

totalEmissiveRadiance += gInkCol * gInk * uInkGlow * (0.75 + 0.35 * gInkS);
	#include <lights_physical_fragment>
{
  // glossy wet coat on ink (sharp while fresh, satin once dry); roughness widened where the ink normal varies faster
  // than the pixel grid (no sparkle)
  vec3 cdu = dFdx(normal), cdv = dFdy(normal);
  float kern = min(0.3 * (dot(cdu, cdu) + dot(cdv, cdv)), 0.18);
  float cr = mix(mix(0.06, 0.028, gFresh), 0.022, gWake);
  material.clearcoat = gInk;
  material.clearcoatRoughness = min(sqrt(sqrt(cr * cr * cr * cr + kern)), 1.0);
  material.roughness = mix(material.roughness, min(sqrt(sqrt(pow(material.roughness, 4.0) + kern)), 1.0), gInk);
  // the coat carries the gloss; the pigment layer underneath only adds a soft sheen (keeps the hue pure)
  material.specularColor *= 1.0 - 0.7 * gInk;
  material.specularColorBlended *= 1.0 - 0.7 * gInk;
  material.specularF90 = mix(material.specularF90, 0.35, gInk);
  // flatter Fresnel on the coat: a little more reflection head-on, far less at grazing angles, so the team colour
  // survives a low gameplay camera instead of washing out to sky-white
  material.clearcoatF0 = vec3(mix(0.04, 0.055 + 0.015 * gFresh, gInk));
  material.clearcoatF90 = mix(1.0, 0.3, gInk);
}
	#include <lights_fragment_begin>
for (int i = 0; i < 12; i++) {
  if (i >= uLampN) break;
  vec3 lw = uLamps[i] - vWPos;
  float d2 = dot(lw, lw);
  if (d2 > 100.00) continue;
  float w = clamp(1.0 - d2 * d2 / 10000.0, 0.0, 1.0);
  IncidentLight lampL;
  lampL.direction = normalize((viewMatrix * vec4(lw, 0.0)).xyz);
  lampL.color = uLampCol * (w * w / max(d2, 0.35));
  lampL.visible = true;
  RE_Direct(lampL, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
}
	#include <lights_fragment_maps>
// ink keeps its hue in shade: the blue sky's ambient is applied hue-neutral to the pigment
if (gInk > 0.0) {
  const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
  irradiance = mix(irradiance, vec3(dot(irradiance, LW)), 0.7 * gInk);
  #if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
  iblIrradiance = mix(iblIrradiance, vec3(dot(iblIrradiance, LW)), 0.7 * gInk);
  #endif
}
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular ) && defined( USE_CLEARCOAT )
  // stylised wet reflections: pushed toward a neutral sheen so a blue sky never turns yellow ink olive, then tinted a
  // little by the pigment underneath (a thick coloured gel) so a grazing view keeps the team hue
  {
    float cl = dot(clearcoatRadiance, vec3(0.2126, 0.7152, 0.0722));
    vec3 tint = gInkCol / max(dot(gInkCol, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
    clearcoatRadiance = mix(clearcoatRadiance, mix(vec3(cl), cl * min(tint, vec3(2.5)), 0.3), 0.6 * gInk);
    clearcoatRadiance *= 1.0 + gInk * (0.25 + 0.3 * gFresh) + gWake * 0.7;
  }
#endif
	#include <lights_fragment_end>
if (gInk > 0.0) {
  const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
  float dL = dot(reflectedLight.directDiffuse, LW), iL = dot(reflectedLight.indirectDiffuse, LW);
  float shade = 1.0 - smoothstep(0.1, 0.6, dL / max(dL + iL, 1e-5));
  vec3 c2 = gInkCol * gInkCol;
  vec3 rich = c2 * (dot(gInkCol, LW) / max(dot(c2, LW), 1e-4));      // same brightness, deeper chroma
  vec3 id = reflectedLight.indirectDiffuse;
  vec3 idRich = rich * (iL / max(dot(gInkCol, LW), 1e-4));
  id = mix(id, idRich, 0.5 * shade) * (1.0 + 0.6 * shade);
  reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse, id, gInk);
}
	#include <aomap_fragment>
if (uAO > 0.0 && vLightUv.x >= 0.0) {
  // baked ambient occlusion: full on sky/indirect light, a touch on the sun so contact shadows read in daylight
  float bao = mix(1.0, texture2D(uLight, vLightUv).r, uAO);
  reflectedLight.indirectDiffuse *= bao;
  reflectedLight.indirectSpecular *= mix(1.0, bao, 0.85);
  reflectedLight.directDiffuse *= mix(1.0, bao, 0.4);
}
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	outgoingLight = min(outgoingLight, vec3(5.0));
#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}