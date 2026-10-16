// Splatoon 3 face look: eye region, nose and jaw (presentation only).
//
// References (official Nintendo artwork mirrored on Inkipedia, fetched 2026-10-16): the Splatoon 3 Inkling amiibo
// (Yellow) product photo, the "Inkling Models" sheet, the Yellow/Purple Inkling key-art renders, the hairstyle
// promotional 3D renders and the shooter promo. Measured on those images, not on game data:
//  * eye opening wider than tall (about 1.3 : 1), spanning most of the face width, outer corner a little higher; the irises rest toward the
//    inner corners; iris about as tall as the opening, round, with a large black pupil (~0.6 of the iris) and a
//    thin warm rim;
//  * the mask is a thin goggle band: its top edge is one smooth line, high over the outer half of each eye and
//    sloping down past the inner corners to the low middle of the nose bridge (no step); fuller below the eyes,
//    a rounded end just past the outer corner; no long wings;
//  * the white runs right up to the mask (only a thin contact shade);
//  * blinking lids are mask-black and move inside a fixed mask outline (the upper lid comes down to the lower);
//  * brows: short thick beans, inner end low near the mask, outer end higher;
//  * the face is flush around the eyes (no visible socket bowl), one skin tone from the eyes to the cheeks;
//  * a broad, clearly projecting nose that emerges from under the mask bridge, no visible nostrils from the front;
//  * a round, soft jaw and chin; the face stays upright down to the mouth instead of turning toward the neck early.
// No original model, texture or numeric value is imported; every number is an INKWAVE calibration. Gameplay, hit
// volumes, face motion clocks and expression curves are untouched.
//
// Each anchor must occur exactly once in the composed source; anything else fails the build closed.

function once(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1)
    throw new Error(`INKWAVE S3 face look conflict (${label}): expected one connection`);
  return code.slice(0, at) + after + code.slice(at + before.length);
}

const EDITS = {
  'src/game/character-face.js': [
    ["eye placement and tilt",
      "export const EYE = { az: 0.355, el: 0.14, daz: 0.172, del: 0.222, tilt: 0.1 };\n",
      "export const EYE = { az: 0.52, el: 0.05, daz: 0.172, del: 0.222, tilt: 0.12 };\n"],
    ["brow placement",
      "export const BROW = { az0: 0.19, az1: 0.54, el: 0.455 };\n",
      "export const BROW = { az0: 0.16, az1: 0.57, el: 0.345 };\n"],
    ["goggle mask doc",
      "/** Mask (Inkling eye mask) signed distance in the head's (az, el): > 0 inside. Same shape as the skin shader's pigment. */\n",
      "/** Mask (Inkling eye mask) signed distance in the head's (az, el): > 0 inside. Same shape as the skin shader's pigment.\n *  Splatoon 3 goggle: one band between a top and a bottom edge. The top edge is a single smooth line: high over the outer\n *  half of each eye, sloping down past the inner corners to the low middle of the nose bridge (no step where the eye\n *  part meets the bridge). The bottom edge is fuller under the eyes, rises to the bridge and toward the outer corner,\n *  and the band ends in a rounded cap just past the outer corner. */\nexport const MASK = { top: 0.28, tLo: 0.05, t0: 0.06, t1: 0.53, tOut: 0.035, bot: -0.205, bLo: -0.13, b0: 0.1, b1: 0.45,\n  bRise: 0.09, r0: 0.62, r1: 0.95, cap: 0.93, capK: 1.2, capEl: 0.05, k: 0.04 };\n"],
    ["goggle mask shape",
      "  const lobe = (1 - Math.hypot((ax - 0.355) / 0.3, (el - 0.15) / 0.29)) * 0.26;\n  const bridge = ax < 0.42 ? 0.1 + 0.1 * sstep(0, 0.36, ax) - Math.abs(el - 0.17) : -1;\n  const s = (ax - 0.42) / 0.9;\n  const wc = 0.16 + 0.2 * Math.pow(clamp(s, 0, 1), 1.35);\n  const wh = 0.205 * Math.pow(clamp(1 - s, 0, 1), 0.8);\n  const wing = s > -0.1 && s <= 1 ? wh - Math.abs(el - wc) : -1;\n  return smaxK(smaxK(lobe, bridge, 0.06), wing, 0.07);\n",
      "  const top = MASK.tLo + (MASK.top - MASK.tLo) * sstep(MASK.t0, MASK.t1, ax) - MASK.tOut * sstep(0.7, 0.95, ax);\n  const bot = MASK.bLo + (MASK.bot - MASK.bLo) * sstep(MASK.b0, MASK.b1, ax) + MASK.bRise * sstep(MASK.r0, MASK.r1, ax);\n  const cap = MASK.cap - ax - MASK.capK * (el - MASK.capEl) ** 2;\n  return sminK(sminK(top - el, el - bot, MASK.k), cap, 2 * MASK.k);\n"],
    ["softer, lower under-jaw blend",
      "const JAW_PLANE = { n: new V3(0, -1, 0.35).normalize(), d: 0, k: 0.016 };\nJAW_PLANE.d = 0.152 / Math.hypot(1, 0.35);                         // plane through (0, −0.152, 0) from HEAD_C, rising 35 % forward\n",
      "const JAW_PLANE = { n: new V3(0, -1, 0.2).normalize(), d: 0, k: 0.11 };\nJAW_PLANE.d = 0.162 / Math.hypot(1, 0.2);                          // plane through (0, −0.162, 0) from HEAD_C, rising 20 % forward\n"],
    ["rounder jaw taper; lower face stays upright",
      "    x *= 1 - 0.235 * k - 0.1 * sstep(-0.3, -0.66, el) - 0.19 * sstep(-0.6, -1.05, el);\n    if (dz > 0) z *= 1 - 0.04 * k - 0.085 * sstep(-0.55, -0.95, el) * front;  // chin tucks back under the mouth\n",
      "    x *= 1 - 0.16 * k - 0.1 * sstep(-0.25, -0.8, el) - 0.1 * sstep(-0.55, -1.15, el);\n    if (dz > 0) z *= 1 - 0.02 * k - 0.05 * sstep(-0.7, -1.05, el) * front;   // the lower face stays upright; the chin tucks only underneath\n"],
    ["cheeks, chin and a forward mouth front",
      "  off += 0.0085 * Math.exp(-(((aa - 0.6) / 0.36) ** 2) - (((el + 0.3) / 0.22) ** 2));    // cheek volume\n  off += 0.0048 * Math.exp(-(((aa - 0.42) / 0.17) ** 2) - (((el + 0.2) / 0.12) ** 2));   // cheek apples\n  off += 0.0019 * Math.exp(-(((aa - 0.8) / 0.2) ** 2) - (((el + 0.03) / 0.12) ** 2));    // cheekbone under the outer eye\n  off += 0.0072 * Math.exp(-(((aa - 1.0) / 0.34) ** 2) - (((el + 0.27) / 0.2) ** 2));    // mochi cheeks round out the silhouette\n  off += 0.0022 * Math.exp(-((az / 0.19) ** 2) - (((el + 0.76) / 0.1) ** 2));            // small soft chin\n",
      "  off += 0.007 * Math.exp(-(((aa - 0.6) / 0.38) ** 2) - (((el + 0.27) / 0.24) ** 2));    // cheek volume\n  off += 0.0032 * Math.exp(-(((aa - 0.45) / 0.22) ** 2) - (((el + 0.32) / 0.13) ** 2));  // cheek apples (below the mask, not against its edge)\n  off += 0.0014 * Math.exp(-(((aa - 0.85) / 0.24) ** 2) - (((el + 0.3) / 0.13) ** 2));   // cheekbone under the outer eye\n  off += 0.0056 * Math.exp(-(((aa - 1.0) / 0.36) ** 2) - (((el + 0.22) / 0.24) ** 2));   // mochi cheeks round out the silhouette\n  off += 0.004 * Math.exp(-((az / 0.24) ** 2) - (((el + 0.74) / 0.13) ** 2));            // small, round chin\n  off += 0.0065 * Math.exp(-((az / 0.4) ** 2) - (((el + 0.48) / 0.18) ** 2));           // mouth and chin front kept forward (no early turn to the neck)\n"],
    ["taller, broader nose",
      "  off += 0.0064 * Math.exp(-((az / 0.052) ** 2) - (((el + 0.13) / 0.056) ** 2));         // nose: button tip\n  off += 0.0019 * Math.exp(-(((aa - 0.05) / 0.03) ** 2) - (((el + 0.156) / 0.034) ** 2)); // nose wings\n  off -= 0.0012 * Math.exp(-(((aa - 0.027) / 0.015) ** 2) - (((el + 0.177) / 0.011) ** 2)); // nostrils\n  off -= 0.0008 * Math.exp(-((az / 0.07) ** 2) - (((el + 0.215) / 0.022) ** 2));         // subnasal tuck\n  off += 0.0012 * Math.exp(-((az / 0.1) ** 2) - (((el + 0.06) / 0.07) ** 2));            // nose bridge\n",
      "  off += 0.021 * Math.exp(-((az / 0.1) ** 2) - (((el + 0.182) / 0.062) ** 2));           // nose: broad rounded tip, well forward\n  off += 0.0024 * Math.exp(-(((aa - 0.085) / 0.04) ** 2) - (((el + 0.196) / 0.036) ** 2)); // nose wings\n  off -= 0.0004 * Math.exp(-(((aa - 0.03) / 0.016) ** 2) - (((el + 0.222) / 0.011) ** 2)); // nostrils: a hint under the tip (S3 shows none from the front)\n  off -= 0.0008 * Math.exp(-((az / 0.07) ** 2) - (((el + 0.252) / 0.022) ** 2));         // subnasal tuck\n  off += 0.012 * Math.exp(-((az / 0.095) ** 2) - (((el + 0.11) / 0.075) ** 2));         // nose bridge rising from under the mask\n"],
    ["shallow mask plane",
      "  off -= 0.0024 * Math.exp(-((az / 0.55) ** 2) - (((el - 0.14) / 0.2) ** 2));            // mask plane\n",
      "  off -= 0.0012 * Math.exp(-((az / 0.9) ** 2) - (((el - EYE.el) / 0.26) ** 2));         // mask plane (shallow, so the eye band blends into the face)\n"],
    ["brow ridge under the lowered brows",
      "  off += 0.0024 * Math.exp(-(((aa - 0.33) / 0.2) ** 2) - (((el - 0.475) / 0.07) ** 2));  // brow ridge\n",
      "  off += 0.0024 * Math.exp(-(((aa - 0.4) / 0.24) ** 2) - (((el - 0.4) / 0.07) ** 2));    // brow ridge\n"],
    ["soft mentolabial fold",
      "  off -= 0.0022 * Math.exp(-((az / 0.17) ** 2) - (((el + 0.57) / 0.045) ** 2));          // mentolabial fold\n",
      "  off -= 0.0012 * Math.exp(-((az / 0.17) ** 2) - (((el + 0.57) / 0.06) ** 2));           // mentolabial fold (soft)\n"],
    ["eyeball proportions, rest gaze, upper-lid blink",
      "export const EYEB = { rx: 0.052, ry: 0.0605, rz: 0.035, xh: 0.5, hu: 0.6, hl: 0.57, l0: 0.0, close: 0.22, over: 0.035,\n  lidU: 1.075, lidL: 1.05, k: 0.07, dip: 0.055, apex: 0.0008, yaw: 0.2, rest: -0.06, iris: 0.37, cornea: 0.045 };\n",
      "export const EYEB = { rx: 0.073, ry: 0.061, rz: 0.036, xh: 0.68, hu: 0.6, hl: 0.56, l0: 0.0, close: 0.0, over: 0.035,\n  lidU: 1.075, lidL: 1.05, k: 0.07, dip: 0.055, apex: 0.0008, yaw: 0.42, rest: -0.28, iris: 0.6, cornea: 0.04 };\n"],
    ["no eye socket bowl",
      "  const sock = 0.42 * sstep(1.33, 1.06, e) * sstep(0.05, 0.4, wr);  // socket: skull falls away inside the lid fold (0 on the patch rim)\n",
      "  const sock = 0.0 * sstep(1.33, 1.06, e) * sstep(0.05, 0.4, wr);  // socket: skull falls away inside the lid fold (0 on the patch rim)\n"],
    ["lid shell sinks to just over the ball past the lids",
      "  const lid = lerp(EYEB.lidL, EYEB.lidU, up) + 0.018 * sstep(1.0, 1.25, e);\n",
      "  // the lid shell only shapes the lids: past them it sinks to just over the eyeball, so the face around the mask stays\n  // flush wherever the ball lies under it (and still covers the wide ball where it rises above the head)\n  const lid = Math.max(1.02, lerp(EYEB.lidL, EYEB.lidU, up) + 0.018 * sstep(1.0, 1.25, e) - 0.4 * lerp(sstep(1.24, 1.45, e), sstep(1.14, 1.35, e), up));\n"],
    ["lid scratch vector",
      "const _le = new V3();\n",
      "const _le = new V3(), _lq = new V3();\n"],
    ["lids travel only inside the mask, clear of its edge",
      "  if (s >= 0) return [tu * sstep(1.3, 1.03, e), 0];\n  return [0, tl * sstep(1.22, 1.03, e)];\n",
      "  if (s >= 0) {\n    // the moving lid stays clear of the mask edge, so the outline never stretches with it (the eye shader paints the\n    // ball past the lid line mask-black, so a lid that travels less still reads as closed)\n    _lq.subVectors(p, HEAD_C);\n    const inMask = sstep(0.006, 0.05, visorSD(Math.atan2(_lq.x, _lq.z), Math.asin(clamp(_lq.y / _lq.length(), -1, 1))));\n    return [tu * sstep(1.12, 1.03, e) * inMask, 0];\n  }   // the whole moving upper lid stays inside the mask (S3: black lids, fixed outline)\n  return [0, tl * sstep(1.1, 1.0, e)];\n"],
    ["eye patch bounds",
      "const EYE_RECT = { az0: 0.085, az1: 0.625, el0: -0.25, el1: 0.44 };\n",
      "const EYE_RECT = { az0: 0.1, az1: 1.0, el0: -0.245, el1: 0.4 };\n"],
    ["carrier knots around the wider eye patch",
      "  const half = piecewise([0, EYE_RECT.az0, MOUTH_RECT.az, EYE_RECT.az1, 0.95, 1.3, 1.75, 2.3, Math.PI], rhoAz, R.step);\n",
      "  const half = piecewise([0, EYE_RECT.az0, MOUTH_RECT.az, EYE_RECT.az1, 1.3, 1.75, 2.3, Math.PI], rhoAz, R.step);\n"],
    ["lash tabs on the lid edge",
      "export const LASHES = [{ e: 0.91, phi: 0.58, r: 0.155, tip: -1.2 }, { e: 0.93, phi: 0.24, r: 0.115, tip: -0.7 }];\n",
      "export const LASHES = [{ e: 0.97, phi: 0.5, r: 0.11, tip: -1.2 }, { e: 0.99, phi: 0.2, r: 0.08, tip: -0.7 }];\n"],
    ["nostril and nose-wing AO",
      "      a *= 1 - 0.45 * gauss(Math.abs(az) - 0.027, 0.016) * gauss(el + 0.178, 0.013);   // nostrils\n      a *= 1 - 0.12 * gauss(Math.abs(az) - 0.058, 0.03) * gauss(el + 0.17, 0.02);     // nose-wing crease\n",
      "      a *= 1 - 0.08 * gauss(Math.abs(az) - 0.03, 0.017) * gauss(el + 0.222, 0.013);    // nostrils\n      a *= 1 - 0.05 * gauss(Math.abs(az) - 0.068, 0.032) * gauss(el + 0.205, 0.02);    // nose-wing crease\n"],
    ["cornea over the larger iris",
      "  const rho = (th) => 1 + EYEB.cornea * Math.pow(Math.max(0, Math.cos(Math.min(1, th / 0.5) * Math.PI / 2)), 1.6);\n",
      "  const rho = (th) => 1 + EYEB.cornea * Math.pow(Math.max(0, Math.cos(Math.min(1, th / (EYEB.iris + 0.06)) * Math.PI / 2)), 1.6);\n"],
  ],
  'src/game/character-mats.js': [
    ["mask and lash constants",
      "import { FACE_SHADER } from './character-face.js';\n",
      "import { FACE_SHADER, MASK, LASHES } from './character-face.js';\n"],
    ["goggle mask pigment",
      "  float lobe = (1.0 - length(vec2((ax - 0.355) / 0.3, (el - 0.15) / 0.29))) * 0.26;\n  float bridge = ax < 0.42 ? 0.1 + 0.1 * smoothstep(0.0, 0.36, ax) - abs(el - 0.17) : -1.0;\n  float s = (ax - 0.42) / 0.9;\n  float wc = 0.16 + 0.2 * pow(clamp(s, 0.0, 1.0), 1.35);\n  float wh = 0.205 * pow(clamp(1.0 - s, 0.0, 1.0), 0.8);\n  float wing = (s > -0.1 && s <= 1.0) ? wh - abs(el - wc) : -1.0;\n  return iwSmax(iwSmax(lobe, bridge, 0.06), wing, 0.07);\n",
      "  float top = ${MASK.tLo.toFixed(4)} + ${(MASK.top - MASK.tLo).toFixed(4)} * smoothstep(${MASK.t0.toFixed(4)}, ${MASK.t1.toFixed(4)}, ax) - ${MASK.tOut.toFixed(4)} * smoothstep(0.7, 0.95, ax);\n  float bot = ${MASK.bLo.toFixed(4)} + ${(MASK.bot - MASK.bLo).toFixed(4)} * smoothstep(${MASK.b0.toFixed(4)}, ${MASK.b1.toFixed(4)}, ax) + ${MASK.bRise.toFixed(4)} * smoothstep(${MASK.r0.toFixed(4)}, ${MASK.r1.toFixed(4)}, ax);\n  float cap = ${MASK.cap.toFixed(4)} - ax - ${MASK.capK.toFixed(4)} * pow(el - ${MASK.capEl.toFixed(4)}, 2.0);\n  return -iwSmax(-(-iwSmax(-(top - el), -(el - bot), ${MASK.k.toFixed(4)})), -cap, ${(2 * MASK.k).toFixed(4)});\n"],
    ["soft blush, no boundary",
      "          float bl = exp(-pow((abs(az) - 0.6) / 0.2, 2.0) - pow((el + 0.3) / 0.13, 2.0));\n          float blushK = bl * mix(0.3, 0.12, smoothstep(0.35, 0.8, 1.0 - uSkinLum)) * (1.0 + 1.5 * clamp(uMouth2.w, 0.0, 1.0));\n",
      "          float bl = exp(-pow((abs(az) - 0.62) / 0.3, 2.0) - pow((el + 0.32) / 0.2, 2.0));\n          float blushK = bl * mix(0.14, 0.06, smoothstep(0.35, 0.8, 1.0 - uSkinLum)) * (1.0 + 1.5 * clamp(uMouth2.w, 0.0, 1.0));\n"],
    ["nose tint follows the nose",
      "          float nose = exp(-pow(az / 0.06, 2.0) - pow((el + 0.13) / 0.06, 2.0)) + 0.6 * exp(-pow((abs(az) - 0.045) / 0.03, 2.0) - pow((el + 0.165) / 0.025, 2.0));\n",
      "          float nose = exp(-pow(az / 0.065, 2.0) - pow((el + 0.165) / 0.065, 2.0)) + 0.6 * exp(-pow((abs(az) - 0.05) / 0.03, 2.0) - pow((el + 0.2) / 0.025, 2.0));\n"],
    ["crisp mask edge",
      "          iwVisor = smoothstep(-0.008 - w, 0.008 + w, sd);\n",
      "          iwVisor = smoothstep(-0.003 - w, 0.003 + w, sd);\n"],
    ["lid cover flag",
      "        vec3 iwEyeEmit = vec3(0.0); float iwEyeRim = 0.0; float iwCat = 0.0;\n",
      "        vec3 iwEyeEmit = vec3(0.0); float iwEyeRim = 0.0; float iwCat = 0.0; float iwLidCov = 0.0;\n"],
    ["thin lid contact shade (white up to the mask)",
      "          float shade = mix(0.3, 1.0, smoothstep(0.0, 0.2, dU)) * mix(0.55, 1.0, smoothstep(0.0, 0.12, dL));\n",
      "          // S3: the white runs right up to the mask; only a thin contact shade under the lids\n          float shade = mix(0.55, 1.0, smoothstep(0.0, 0.07, dU)) * mix(0.7, 1.0, smoothstep(0.0, 0.06, dL));\n"],
    ["lash contact shadow follows LASHES",
      "              vec3 L = k == 0 ? vec3(${(0.91 * Math.cos(0.58)).toFixed(4)}, ${(0.91 * Math.sin(0.58)).toFixed(4)}, 0.155) : vec3(${(0.93 * Math.cos(0.24)).toFixed(4)}, ${(0.93 * Math.sin(0.24)).toFixed(4)}, 0.115);\n              float tipA = k == 0 ? -1.2 : -0.7;\n",
      "              vec3 L = k == 0 ? vec3(${(LASHES[0].e * Math.cos(LASHES[0].phi)).toFixed(4)}, ${(LASHES[0].e * Math.sin(LASHES[0].phi)).toFixed(4)}, ${LASHES[0].r.toFixed(4)}) : vec3(${(LASHES[1].e * Math.cos(LASHES[1].phi)).toFixed(4)}, ${(LASHES[1].e * Math.sin(LASHES[1].phi)).toFixed(4)}, ${LASHES[1].r.toFixed(4)});\n              float tipA = k == 0 ? ${LASHES[0].tip.toFixed(2)} : ${LASHES[1].tip.toFixed(2)};\n"],
    ["round iris on the wider ball",
      "          vec2 iq = ip.xy / sin(uIrisR);\n",
      "          vec2 iq = ip.xy * vec2(${(FACE_SHADER.eyeR.x / FACE_SHADER.eyeR.y).toFixed(4)}, 1.0) / sin(uIrisR);   // round on the (wider) ball\n"],
    ["smoother iris",
      "          ic *= mix(1.0, mix(0.76, 1.2, fib), smoothstep(0.3, 0.7, r) * fl);\n",
      "          ic *= mix(1.0, mix(0.9, 1.08, fib), smoothstep(0.3, 0.7, r) * fl);\n"],
    ["S3 iris rim, pupil and black lid cover",
      "          ic *= mix(1.0, 0.22, smoothstep(0.78, 0.99, r));                                                  // limbal ring\n          float pr = 0.34 * (0.8 + 0.45 * clamp(uPupil, 0.0, 1.0));\n          float pd = length(iq * vec2(1.0, 0.86) - vec2(0.0, 0.03)) - pr;\n",
      "          ic *= mix(1.0, 0.86, smoothstep(0.72, 0.9, r));                                                   // a little darker outside\n          ic = mix(ic, mix(uIris2 * 0.8, vec3(0.86, 0.24, 0.13), 0.65), smoothstep(0.885, 0.935, r));          // thin warm rim\n          float pr = 0.55 * (0.88 + 0.24 * clamp(uPupil, 0.0, 1.0));\n          float pd = length(iq) - pr;\n"],
    ["lid cover: matte like the lid",
      "          iwEyeRim = 1.0 - shade;\n",
      "          // S3 lids are mask-black: whatever of the ball lies past a lid line reads as the lid itself, so a closing lid\n          // never shows the eye through the stretched fold\n          float lidCover = max(1.0 - smoothstep(-0.03, 0.0, dU), 1.0 - smoothstep(-0.03, 0.0, dL)); iwLidCov = lidCover;\n          col = mix(col, vec3(0.012, 0.0135, 0.02), lidCover);\n          iwEyeRim = max(1.0 - shade, lidCover);\n"],
    ["lid cover: no iris glow",
      "          iwEyeEmit = ic * irisM * (1.0 - pupil) * 0.07 * shade;\n",
      "          iwEyeEmit = ic * irisM * (1.0 - pupil) * 0.07 * shade * (1.0 - lidCover);\n"],
    ["lid cover: no catch-light",
      "          iwCat = (c1 * 1.6 + c2 * 0.7) * mix(1.0, 0.35, spread) * smoothstep(0.02, 0.12, dU);\n",
      "          iwCat = (c1 * 1.6 + c2 * 0.7) * mix(1.0, 0.35, spread) * smoothstep(0.02, 0.12, dU) * (1.0 - lidCover);\n"],
    ["lid cover: satin roughness",
      "      fRough: 'roughnessFactor = mix(roughnessFactor, 0.35, iwEyeRim);',\n",
      "      fRough: 'roughnessFactor = mix(roughnessFactor, 0.35, iwEyeRim); roughnessFactor = mix(roughnessFactor, 0.48, iwLidCov);',\n"],
    ["lid cover: no clearcoat",
      "          material.clearcoat *= mix(1.0, 0.35, iwEyeRim);\n",
      "          material.clearcoat *= mix(1.0, 0.35, iwEyeRim) * (1.0 - iwLidCov);   // a closed lid is satin like the mask\n"],
  ],
  'src/game/character-geo.js': [
    ["classic brow: short bean, inner end low",
      "  { name: 'classic', el: (t) => BROW.el + 0.045 * Math.sin(Math.PI * (t * 0.8 + 0.12)) - 0.014 * t, r: (t) => 0.0092 * (0.5 + 0.5 * Math.sin(Math.PI * (0.22 + 0.72 * t))) * lerp(1.15, 0.7, t), az1: BROW.az1 },\n",
      "  { name: 'classic', el: (t) => BROW.el - 0.055 + 0.11 * t + 0.012 * Math.sin(Math.PI * t), r: (t) => 0.0104 * (0.5 + 0.5 * Math.sin(Math.PI * (0.16 + 0.76 * t))) * lerp(1.1, 0.58, t), az1: BROW.az1 },\n"],
  ],
};

export function adaptS3FaceLook(rel, code) {
  const edits = EDITS[rel];
  if (!edits) return code;
  for (const [label, before, after] of edits) code = once(code, before, after, label);
  return code;
}
