// Recover completed Library queues missing from PR1878. Keep the current source inputs.
function once(code, before, after, label) {
  const i = code.indexOf(before);
  if (i < 0 || code.indexOf(before, i + before.length) >= 0) throw new Error('Historical character anchor: ' + label);
  return code.slice(0, i) + after + code.slice(i + before.length);
}
export function adaptHistoricalCharacter20261026(rel, code) {
  const patch = (before, after, label) => { code = once(code, before, after, label); };
  if(rel==="src/game/character-hair.js"){
    patch("    for (let i = 0; i <= N; i++) { P.push(curve.getPointAt(i / N)); T.push(curve.getTangentAt(i / N).normalize()); }","    for (let i = 0; i <= N; i++) { const t = curve.getUtoTmapping(i / N); P.push(curve.getPoint(t)); T.push(curve.getTangent(t).normalize()); }","share CatmullRom point/tangent arc mapping");
  }
  if(rel==="src/game/character-face.js"){
    patch("function addEar(acc, sx, R) {","function addEar(acc, sx, R, sectionRows) {","build-local mirrored ear row cache");
    patch("    const loop = earLoop(uc, w, nB, nR, nW, 0.0016 * sstep(0.12, 0.3, uc) * sstep(0.72, 0.45, uc));","    const loop = sectionRows[j] || (sectionRows[j] = earLoop(uc, w, nB, nR, nW, 0.0016 * sstep(0.12, 0.3, uc) * sstep(0.72, 0.45, uc)));","compute mirrored ear cross sections once");
    patch("  addEar(acc, 1, R); addEar(acc, -1, R);","  const earSections = []; addEar(acc, 1, R, earSections); addEar(acc, -1, R, earSections);","share read-only sections only within one face build");
    patch("  for (const F of EYE_FRAMES) {\n    const pos = [], nrm = [], uv = [], S = [], idx = [];","  const ringKernel = th => ({r:rho(th),dr:(rho(th+1e-3)-rho(th-1e-3))/2e-3,st:Math.sin(th),ct:Math.cos(th)});\n  const azimuths = Array.from({length:nS}, (_, k) => { const ps=(k/nS)*TAU; return {cp:Math.cos(ps),sp:Math.sin(ps)}; });\n  const centerAzimuth = {cp:Math.cos(0),sp:Math.sin(0)};\n  for (const F of EYE_FRAMES) {\n    // Builder.add may alter the exported cornea parameter between eyes.\n    const cornea = Object.getOwnPropertyDescriptor(EYEB, 'cornea');\n    const ringKernels = cornea && typeof cornea.value === 'number' ? [ringKernel(0), ...ths.slice(1).map(ringKernel)] : null;\n    const pos = [], nrm = [], uv = [], S = [], idx = [];","prepare eye ring and azimuth kernels");
    patch("    const push = (th, ps) => {\n      const r = rho(th), dr = (rho(th + 1e-3) - rho(th - 1e-3)) / 2e-3;\n      const st = Math.sin(th), ct = Math.cos(th), cp = Math.cos(ps), sp = Math.sin(ps);","    const derivative = new V3();\n    const push = ({r,dr,st,ct}, {cp,sp}) => {","reuse eye normal derivative vector");
    patch("addScaledVector(new V3(ct * cp, ct * sp, -st), -dr / r)","addScaledVector(derivative.set(ct * cp, ct * sp, -st), -dr / r)","preserve exact normal arithmetic");
    patch("    push(0, 0);\n    for (let i = 1; i < ths.length; i++) for (let k = 0; k < nS; k++) push(ths[i], (k / nS) * TAU);","    push(ringKernels ? ringKernels[0] : ringKernel(0), centerAzimuth);\n    for (let i = 1; i < ths.length; i++) for (let k = 0; k < nS; k++) push(ringKernels ? ringKernels[i] : ringKernel(ths[i]), azimuths[k]);","both eyes use unchanged ring operands");
  }
  if(rel==="src/game/character.js"){
    patch("    for (let i = 0; i < 6; i++) st[i] = damp(st[i], lerp(STANCE_IDLE[i] + SV[i], lerp(A[i], STANCE_LOCK[i], lk), Math.max(aimSt, lk)), lk > 0.5 ? 16 : 9, dt);","    const stanceAlpha = 1 - Math.exp(-(lk > 0.5 ? 16 : 9) * dt);\n    for (let i = 0; i < 6; i++) st[i] = lerp(st[i], lerp(STANCE_IDLE[i] + SV[i], lerp(A[i], STANCE_LOCK[i], lk), Math.max(aimSt, lk)), stanceAlpha);","same damping alpha shared across six stance components");
  }
  return code;
}
