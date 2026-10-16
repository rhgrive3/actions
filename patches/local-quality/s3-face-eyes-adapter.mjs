// Splatoon 3 eye region (presentation only).
//
// References (official Nintendo artwork mirrored on Inkipedia, fetched 2026-10-16): the Splatoon 3 Inkling amiibo
// (Yellow) product photo, the "Inkling Models" sheet, the Yellow/Purple Inkling key-art renders, the hairstyle
// promotional 3D renders and the shooter promo. Measured on those images, not on game data:
//  * eye opening wider than tall (about 1.3 : 1), spanning most of the face width; the irises rest toward the
//    inner corners; iris about as tall as the opening, round, with a large black pupil (~0.6 of the iris) and a
//    thin warm rim;
//  * the mask is a thin goggle that hugs each opening (thin above, fuller below, short past the outer corner),
//    joined by a nose bridge below the eye line whose top edge dips at the centre; no long wings;
//  * blinking lids are mask-black;
//  * brows: short thick beans, inner end low near the mask, outer end higher.
// No original model, texture or numeric value is imported; every number is an INKWAVE calibration. Gameplay, hit
// volumes, face motion clocks and expression curves are untouched.
//
// Each anchor must occur exactly once in the composed source; anything else fails the build closed.

function once(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1)
    throw new Error(`INKWAVE S3 face eyes conflict (${label}): expected one connection`);
  return code.slice(0, at) + after + code.slice(at + before.length);
}

const EDITS = {
  'src/game/character-face.js': [
    ["eye placement",
      "export const EYE = { az: 0.355, el: 0.14, daz: 0.172, del: 0.222, tilt: 0.1 };\n",
      "export const EYE = { az: 0.52, el: 0.05, daz: 0.172, del: 0.222, tilt: 0.06 };\n"],
    ["brow placement",
      "export const BROW = { az0: 0.19, az1: 0.54, el: 0.455 };\n",
      "export const BROW = { az0: 0.16, az1: 0.57, el: 0.345 };\n"],
    ["goggle mask doc",
      "/** Mask (Inkling eye mask) signed distance in the head's (az, el): > 0 inside. Same shape as the skin shader's pigment. */\n",
      "/** Mask (Inkling eye mask) signed distance in the head's (az, el): > 0 inside. Same shape as the skin shader's pigment.\n *  Splatoon 3 goggle: a rounded-rectangle lobe hugging each eye opening (thin above, fuller below, short past the outer\n *  corner) and a nose bridge below the eye line whose top edge dips at the centre. */\nexport const MASK = { az: 0.565, el: 0.055, ain: 0.35, aout: 0.34, bt: 0.246, bb: 0.259, n: 2.4, bTop: 0.06, bDip: 0.06, bBot: -0.15 };\n"],
    ["goggle mask shape",
      "  const lobe = (1 - Math.hypot((ax - 0.355) / 0.3, (el - 0.15) / 0.29)) * 0.26;\n  const bridge = ax < 0.42 ? 0.1 + 0.1 * sstep(0, 0.36, ax) - Math.abs(el - 0.17) : -1;\n  const s = (ax - 0.42) / 0.9;\n  const wc = 0.16 + 0.2 * Math.pow(clamp(s, 0, 1), 1.35);\n  const wh = 0.205 * Math.pow(clamp(1 - s, 0, 1), 0.8);\n  const wing = s > -0.1 && s <= 1 ? wh - Math.abs(el - wc) : -1;\n  return smaxK(smaxK(lobe, bridge, 0.06), wing, 0.07);\n",
      "  const dx = Math.abs(ax - MASK.az) / (ax < MASK.az ? MASK.ain : MASK.aout), dy = Math.abs(el - MASK.el) / (el > MASK.el ? MASK.bt : MASK.bb);\n  const lobe = (1 - Math.pow(Math.pow(dx, MASK.n) + Math.pow(dy, MASK.n), 1 / MASK.n)) * 0.25;\n  const top = MASK.bTop - MASK.bDip * gauss(ax, 0.12), bot = MASK.bBot + 0.01 * gauss(ax, 0.1);\n  const bridge = ax < 0.45 ? Math.min(top - el, el - bot) : -1;\n  return smaxK(lobe, bridge, 0.05);\n"],
    ["cheekbone below the larger eye",
      "  off += 0.0019 * Math.exp(-(((aa - 0.8) / 0.2) ** 2) - (((el + 0.03) / 0.12) ** 2));    // cheekbone under the outer eye\n",
      "  off += 0.0019 * Math.exp(-(((aa - 0.85) / 0.2) ** 2) - (((el + 0.21) / 0.1) ** 2));    // cheekbone under the outer eye\n"],
    ["mask plane follows the eye line",
      "  off -= 0.0024 * Math.exp(-((az / 0.55) ** 2) - (((el - 0.14) / 0.2) ** 2));            // mask plane\n",
      "  off -= 0.0024 * Math.exp(-((az / 0.8) ** 2) - (((el - EYE.el) / 0.2) ** 2));          // mask plane\n"],
    ["brow ridge under the lowered brows",
      "  off += 0.0024 * Math.exp(-(((aa - 0.33) / 0.2) ** 2) - (((el - 0.475) / 0.07) ** 2));  // brow ridge\n",
      "  off += 0.0024 * Math.exp(-(((aa - 0.4) / 0.24) ** 2) - (((el - 0.4) / 0.07) ** 2));    // brow ridge\n"],
    ["eyeball proportions and rest gaze",
      "export const EYEB = { rx: 0.052, ry: 0.0605, rz: 0.035, xh: 0.5, hu: 0.6, hl: 0.57, l0: 0.0, close: 0.22, over: 0.035,\n  lidU: 1.075, lidL: 1.05, k: 0.07, dip: 0.055, apex: 0.0008, yaw: 0.2, rest: -0.06, iris: 0.37, cornea: 0.045 };\n",
      "export const EYEB = { rx: 0.073, ry: 0.061, rz: 0.036, xh: 0.68, hu: 0.6, hl: 0.56, l0: 0.0, close: 0.22, over: 0.035,\n  lidU: 1.075, lidL: 1.05, k: 0.07, dip: 0.055, apex: 0.0008, yaw: 0.42, rest: -0.28, iris: 0.6, cornea: 0.04 };\n"],
    ["eye patch bounds",
      "const EYE_RECT = { az0: 0.085, az1: 0.625, el0: -0.25, el1: 0.44 };\n",
      "const EYE_RECT = { az0: 0.1, az1: 1.0, el0: -0.245, el1: 0.4 };\n"],
    ["carrier knots around the wider eye patch",
      "  const half = piecewise([0, EYE_RECT.az0, MOUTH_RECT.az, EYE_RECT.az1, 0.95, 1.3, 1.75, 2.3, Math.PI], rhoAz, R.step);\n",
      "  const half = piecewise([0, EYE_RECT.az0, MOUTH_RECT.az, EYE_RECT.az1, 1.3, 1.75, 2.3, Math.PI], rhoAz, R.step);\n"],
    ["lash tabs on the lid edge",
      "export const LASHES = [{ e: 0.91, phi: 0.58, r: 0.155, tip: -1.2 }, { e: 0.93, phi: 0.24, r: 0.115, tip: -0.7 }];\n",
      "export const LASHES = [{ e: 0.97, phi: 0.5, r: 0.11, tip: -1.2 }, { e: 0.99, phi: 0.2, r: 0.08, tip: -0.7 }];\n"],
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
      "  float dx = abs(ax - ${MASK.az.toFixed(4)}) / (ax < ${MASK.az.toFixed(4)} ? ${MASK.ain.toFixed(4)} : ${MASK.aout.toFixed(4)});\n  float dy = abs(el - ${MASK.el.toFixed(4)}) / (el > ${MASK.el.toFixed(4)} ? ${MASK.bt.toFixed(4)} : ${MASK.bb.toFixed(4)});\n  float lobe = (1.0 - pow(pow(dx, ${MASK.n.toFixed(3)}) + pow(dy, ${MASK.n.toFixed(3)}), ${(1 / MASK.n).toFixed(5)})) * 0.25;\n  float top = ${MASK.bTop.toFixed(4)} - ${MASK.bDip.toFixed(4)} * exp(-pow(ax / 0.12, 2.0)), bot = ${MASK.bBot.toFixed(4)} + 0.01 * exp(-pow(ax / 0.1, 2.0));\n  float bridge = ax < 0.45 ? min(top - el, el - bot) : -1.0;\n  return iwSmax(lobe, bridge, 0.05);\n"],
    ["lid travel varying (vertex)",
      "        attribute vec3 aHead; attribute vec4 aFace; varying vec3 vHead; varying vec4 vFace; varying vec2 vIwUv;\n",
      "        attribute vec3 aHead; attribute vec4 aFace; varying vec3 vHead; varying vec4 vFace; varying vec2 vIwUv; varying float vIwLid;\n"],
    ["lid travel varying (fragment)",
      "        varying vec3 vHead; varying vec4 vFace; varying vec2 vIwUv;\n",
      "        varying vec3 vHead; varying vec4 vFace; varying vec2 vIwUv; varying float vIwLid;\n"],
    ["crisp mask edge and black closing lid",
      "          iwVisor = smoothstep(-0.008 - w, 0.008 + w, sd);\n",
      "          iwVisor = smoothstep(-0.003 - w, 0.003 + w, sd);\n          iwVisor = max(iwVisor, smoothstep(0.08, 0.15, vIwLid));  // a closing lid is mask-black (S3 blink); idle squints stay as they are\n"],
    ["lid travel reset",
      "        vec3 iwPos = position;\n",
      "        vec3 iwPos = position; vIwLid = 0.0;\n"],
    ["lid travel amount",
      "          float a = aFace.x * cl.x - aFace.y * cl.y;             // + rotates down (upper lid), − up (lower lid)\n          mat3 M = uEyeM[si], Mi = uEyeMi[si]; vec3 C = uEyeC[si];\n",
      "          float a = aFace.x * cl.x - aFace.y * cl.y;             // + rotates down (upper lid), − up (lower lid)\n          vIwLid = abs(a);\n          mat3 M = uEyeM[si], Mi = uEyeMi[si]; vec3 C = uEyeC[si];\n"],
    ["lash contact shadow follows LASHES",
      "              vec3 L = k == 0 ? vec3(${(0.91 * Math.cos(0.58)).toFixed(4)}, ${(0.91 * Math.sin(0.58)).toFixed(4)}, 0.155) : vec3(${(0.93 * Math.cos(0.24)).toFixed(4)}, ${(0.93 * Math.sin(0.24)).toFixed(4)}, 0.115);\n              float tipA = k == 0 ? -1.2 : -0.7;\n",
      "              vec3 L = k == 0 ? vec3(${(LASHES[0].e * Math.cos(LASHES[0].phi)).toFixed(4)}, ${(LASHES[0].e * Math.sin(LASHES[0].phi)).toFixed(4)}, ${LASHES[0].r.toFixed(4)}) : vec3(${(LASHES[1].e * Math.cos(LASHES[1].phi)).toFixed(4)}, ${(LASHES[1].e * Math.sin(LASHES[1].phi)).toFixed(4)}, ${LASHES[1].r.toFixed(4)});\n              float tipA = k == 0 ? ${LASHES[0].tip.toFixed(2)} : ${LASHES[1].tip.toFixed(2)};\n"],
    ["round iris on the wider ball",
      "          vec2 iq = ip.xy / sin(uIrisR);\n",
      "          vec2 iq = ip.xy * vec2(${(FACE_SHADER.eyeR.x / FACE_SHADER.eyeR.y).toFixed(4)}, 1.0) / sin(uIrisR);   // round on the (wider) ball\n"],
    ["smoother iris",
      "          ic *= mix(1.0, mix(0.76, 1.2, fib), smoothstep(0.3, 0.7, r) * fl);\n",
      "          ic *= mix(1.0, mix(0.9, 1.08, fib), smoothstep(0.3, 0.7, r) * fl);\n"],
    ["S3 iris rim and pupil",
      "          ic *= mix(1.0, 0.22, smoothstep(0.78, 0.99, r));                                                  // limbal ring\n          float pr = 0.34 * (0.8 + 0.45 * clamp(uPupil, 0.0, 1.0));\n          float pd = length(iq * vec2(1.0, 0.86) - vec2(0.0, 0.03)) - pr;\n",
      "          ic *= mix(1.0, 0.86, smoothstep(0.72, 0.9, r));                                                   // a little darker outside\n          ic = mix(ic, mix(uIris2 * 0.8, vec3(0.86, 0.24, 0.13), 0.65), smoothstep(0.885, 0.935, r));          // thin warm rim\n          float pr = 0.55 * (0.88 + 0.24 * clamp(uPupil, 0.0, 1.0));\n          float pd = length(iq) - pr;\n"],
  ],
  'src/game/character-geo.js': [
    ["classic brow: short bean, inner end low",
      "  { name: 'classic', el: (t) => BROW.el + 0.045 * Math.sin(Math.PI * (t * 0.8 + 0.12)) - 0.014 * t, r: (t) => 0.0092 * (0.5 + 0.5 * Math.sin(Math.PI * (0.22 + 0.72 * t))) * lerp(1.15, 0.7, t), az1: BROW.az1 },\n",
      "  { name: 'classic', el: (t) => BROW.el - 0.055 + 0.11 * t + 0.012 * Math.sin(Math.PI * t), r: (t) => 0.0104 * (0.5 + 0.5 * Math.sin(Math.PI * (0.16 + 0.76 * t))) * lerp(1.1, 0.58, t), az1: BROW.az1 },\n"],
  ],
};

export function adaptS3FaceEyes(rel, code) {
  const edits = EDITS[rel];
  if (!edits) return code;
  for (const [label, before, after] of edits) code = once(code, before, after, label);
  return code;
}
