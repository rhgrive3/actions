// Late refinements for immutable inputs; directly owned outfit/LOD stay in source.
function once(code, before, after) {
  if (code.split(before).length !== 2) throw Error('World/native 20261029 anchor: '+before.slice(0,90));
  return code.replace(before, after);
}
export function adaptWorldNative20261029(rel, code) {
  const patch = (before, after) => { code = once(code, before, after); };
  if (rel === 'src/world/environment.js') {
    // Compute explicit gradients before arena-dependent discard/branches. The
    // bundled renderer is WebGL2 and already uses textureLod in this shader.
    const start = '  vec2 p = P.xz;\n  float detail = 1.0 - smoothstep(35.0, 380.0, dist);';
    if (code.split(start).length !== 3) throw Error('World/native sea variant count');
    code = code.replaceAll(start, start+'\n  vec2 fineUV = p * 0.29 + vec2(0.71, 0.13) + uTime * vec2(0.031, -0.026);\n  vec2 fineDx = dFdx(fineUV), fineDy = dFdy(fineUV);');
    const sample = '  vec4 w4 = texture2D(uWaveTex, p * 0.29 + vec2(0.71, 0.13) + uTime * vec2(0.031, -0.026));\n';
    if (code.split(sample).length !== 3) throw Error('World/native fine wave sample count');
    code = code.replaceAll(sample, '');
    patch('  g += (w4.xy - 0.5) * 0.45 * nearF * uWaveStrength * 0.42 * 0.85;',
      '  if (nearF > 0.0) {\n    vec4 w4 = textureGrad(uWaveTex, fineUV, fineDx, fineDy);\n    g += (w4.xy - 0.5) * 0.45 * nearF * uWaveStrength * 0.42 * 0.85;\n  }');
    patch('  vec2 g = (w3.xy - 0.5) * 0.9 + ((w1.xy - 0.5) * 0.85 + (w2.xy - 0.5) * 0.55) * mix(0.3, 1.0, detail) + (w4.xy - 0.5) * 0.45 * nearF;',
      '  vec2 g = (w3.xy - 0.5) * 0.9 + ((w1.xy - 0.5) * 0.85 + (w2.xy - 0.5) * 0.55) * mix(0.3, 1.0, detail);\n  if (nearF > 0.0) {\n    vec4 w4 = textureGrad(uWaveTex, fineUV, fineDx, fineDy);\n    g += (w4.xy - 0.5) * 0.45 * nearF;\n  }');
    for (const scale of ['uMarinaK.w','8.0']) patch(
      `  float dObj = mix(${scale}, texture2D(uFoamTex, clamp(fuv, 0.0, 1.0)).r * ${scale}, inField);`,
      `  float dObj = ${scale};\n  if (inField > 0.0) dObj = textureLod(uFoamTex, clamp(fuv, 0.0, 1.0), 0.0).r * ${scale};`);
  }
  if (rel === 'src/game/character-face.js') {
    patch('    for (let j = 1; j < n; j++) {\n      const tgt = (j / n) * cum[N]; let i = 0; while (i < N - 1 && cum[i + 1] < tgt) i++;',
      '    let i = 0;\n    for (let j = 1; j < n; j++) {\n      const tgt = (j / n) * cum[N]; while (i < N - 1 && cum[i + 1] < tgt) i++;');
    patch('    const jw = jawCarrier(p), ck = cheekCarrier(p);\n    const id = acc.v(p, { w: skinWeights(p, jw, ck), lid: lidAngles(p), mw: 0, part: 1, n });',
      '    const id = acc.v(p, { w: carrierSkinWeights(p), lid: lidAngles(p), mw: 0, part: 1, n });');
    code = `// Carrier vertices share only identical samples; neck and jaw thresholds differ.
function carrierSkinWeights(p) {
  _wv.subVectors(p, HEAD_C); const r = _wv.length();
  const az = Math.atan2(_wv.x, _wv.z), el = Math.asin(clamp(_wv.y / r, -1, 1));
  const below = sstep(MOUTH.el + 0.035, MOUTH.el - 0.1, el);
  const lat = sstep(1.3, 0.8, Math.abs(az));
  const d = neckAxisDist(p), throatWeight = sstep(0.046, 0.072, d);
  const throat = throatWeight + sstep(1.1, 1.14, p.y) * (1 - throatWeight);
  const jawW = 0.97 * below * lat * clamp(throat, 0, 1);
  const cheekW = 0.55 * gauss(Math.abs(az) - 0.6, 0.24) * gauss(el + 0.31, 0.16);
  const w1 = sstep(0.975, 1.02, p.y);
  const w2 = Math.max(sstep(1.05, 1.1, p.y), sstep(0.05, 0.078, d) * sstep(1.0, 1.05, p.y));
  const s = { chest: 1 - w1, neck: w1 * (1 - w2), head: w1 * w2 };
  const h = s.head, jaw = h * jawW * JAW_GAIN, ck = h * cheekW * (1 - jawW);
  const out = [['head', h - jaw - ck], ['jaw', jaw], ['neck', s.neck], ['chest', s.chest]];
  if (ck > 1e-4) out.push([p.x > 0 ? 'cheekL' : 'cheekR', ck]);
  return out;
}
` + code;
  }
  if (rel === 'src/game/minimap.js') {
    patch('  activate(scheduleBuild = true) {\n    CURRENT = this;', '  activate(scheduleBuild = true) {\n    if (this._retired) throw Error("Cannot activate retired minimap");\n    CURRENT = this;');
    patch("    const idle = typeof requestIdleCallback === 'function' ? (fn) => requestIdleCallback(fn, { timeout: 1500 }) : (fn) => setTimeout(fn, 60);\n    idle(() => { if (G.settings?.minimap === false) return; if (!this._built && CURRENT === this) this._build(); });", '    this._scheduleBuild();');
    patch("      const idle = typeof requestIdleCallback === 'function' ? (fn) => requestIdleCallback(fn, { timeout: 1500 }) : (fn) => setTimeout(fn, 60);\n      idle(() => { if (G.settings?.minimap !== false && !this._built && CURRENT === this) this._build(); });", '      this._scheduleBuild();');
    patch('  setViewerTeam(team) {', `  _scheduleBuild() {
    this._cancelBuild?.();
    const idle = typeof requestIdleCallback === 'function';
    const callback = () => { this._cancelBuild = null; if (!this._retired && G.settings?.minimap !== false && !this._built && CURRENT === this) this._build(); };
    const handle = idle ? requestIdleCallback(callback, {timeout:1500}) : setTimeout(callback,60);
    this._cancelBuild = () => { if (idle) globalThis.cancelIdleCallback?.(handle); else clearTimeout(handle); };
  }
  // The caller retires only a committed replacement's previous map. An active
  // map remains recoverable, and retiring another map never clears shared FX.
  dispose() {
    if (CURRENT === this || this._retired) return false;
    this._retired = true; this._cancelBuild?.(); this._cancelBuild = null;
    for (const canvas of [this.canvas,this.base,this.inkC,this.flashC]) canvas.width = canvas.height = 0;
    for (const key of ['inkImg','flashImg','hgt','topBlock','nrm','pixCell','pixFx','pixFy','pixSx','pixSy','owner','_nativeSupportCache','_nativeReachabilityCache']) this[key] = null;
    return true;
  }
  setViewerTeam(team) {`);
  }
  if (rel === 'src/main.js') {
    patch('    this.minimap = new Minimap(level, G.paint);', '    const retiredMinimap = this.minimap;\n    this.minimap = new Minimap(level, G.paint);');
    patch('    if (G.teamColors[0]) this._setPalette(this.palette || this._pickPalette());\n  }\n\n  _shadowRoots()', '    if (G.teamColors[0]) this._setPalette(this.palette || this._pickPalette());\n    retiredMinimap?.dispose?.();\n  }\n\n  _shadowRoots()');
  }
  // Exact cold-geometry refinements with frozen full-mesh parity fixtures.
  if (rel === "src/game/character-geo.js") {
    patch("  const P = g.attributes.position; const v = new V3(), c = new V3();", "  const P = g.attributes.position; const v = new V3(), c = new V3(), d = new V3();");
    patch("    const d = v.clone().sub(c); const cp = d.dot(c) / (R * r);", "    d.copy(v).sub(c); const cp = d.dot(c) / (R * r);");
    patch("const h = cgY(cg, i, c, n); const r = radial(cg, i, c, n); return h < 0.0098 ? _c.setRGB(0.1, 0.1, 0.12) : (h > 0.021 && r < 0.017 ?", "const h = cgY(cg, i, c, n); return h < 0.0098 ? _c.setRGB(0.1, 0.1, 0.12) : (h > 0.021 && radial(cg, i, c, n) < 0.017 ?");
    patch("        weights: () => [['chest', 1]],", "        bone: 'chest',");
    patch("  const rows = [], meta = [];\n  const pushRow = (fn) => { const r = [], m = []; for (const az of azs)", "  const rows = [], meta = [], hairlines = new Map(azs.map(az => [az, hairline(az)]));\n  const pushRow = (fn) => { const r = [], m = []; for (const az of azs)");
    patch("      const R = headShape(...dirAE(az, el, dB).toArray(), sk).length(), De = rim - el, ts = Math.tan(hat.brim.slope);", "      dirAE(az, el, dB);\n      const R = headShape(dB.x, dB.y, dB.z, sk).length(), De = rim - el, ts = Math.tan(hat.brim.slope);");
    patch("    const rho = sm.w / 0.17 + 0.05;\n    for (let j = 0; j < nE; j++) {", "    const rho = sm.w / 0.17 + 0.05;\n    const azimuthDistances = Array.from({length:nA}, (_,i) => { const az = -Math.PI + (i / nA) * TAU; return Math.atan2(Math.sin(az - sm.az), Math.cos(az - sm.az)); });\n    for (let j = 0; j < nE; j++) {");
    patch("        if (ang(az, el, sm.az, sm.el) < rho)", "        if (Math.hypot(azimuthDistances[i] * Math.cos((el + sm.el) / 2), el - sm.el) < rho)");
    patch("function sqPoint(th, y, off, out) {\n  const r = Math.max(0, sqR(y)) + off;", "function sqPoint(th, y, off, out, ring = null) {\n  const r = (ring ? ring.r : Math.max(0, sqR(y))) + off;");
    patch("  const f = sqFin(y) * Math.pow(Math.abs(s), 24);", "  const f = (ring ? ring.fin : sqFin(y)) * Math.pow(Math.abs(s), 24);");
    patch("    const rows = ys.slice(1, -1).map((y) => Array.from({ length: nT }, (_, i) => sqPoint((i / nT) * TAU, y, 0, new V3())));", "    const rows = ys.slice(1, -1).map((y) => { const ring = {r:Math.max(0,sqR(y)),fin:sqFin(y)}; return Array.from({ length: nT }, (_, i) => sqPoint((i / nT) * TAU, y, 0, new V3(), ring)); });");
    const capStart = code.indexOf('function buildCap('), capEnd = code.indexOf('  const top = headSurf(',capStart);
    if (capStart < 0 || capEnd < capStart) throw Error('World cap scope');
    let cap = code.slice(capStart,capEnd);
    // Keep the table initializer's original samples; only row consumers reuse them.
    const initEnd=cap.indexOf('  const pushRow');
    cap=cap.slice(0,initEnd)+cap.slice(initEnd).replaceAll('hairline(az)','hairlines.get(az)');
    code=code.slice(0,capStart)+cap+code.slice(capEnd);
  }
  if (rel === "src/game/character-hair.js") {
    patch("    const [x, y] = this.offset(t, th, scale);", "    const [x, y] = this.offset === TentacleSurface.prototype.offset ? this.offsetInto(t, th, scale, null, this._pointOffset || (this._pointOffset = [])) : this.offset(t, th, scale);");
  }
  if (rel === "src/game/motion/source-controller.js") {
    patch("!['move','idle'].includes(this.state)||!['move','idle'].includes(state)", "(this.state!=='move'&&this.state!=='idle')||(state!=='move'&&state!=='idle')");
    patch("const balanceActive=['move','idle'].includes(this.state)&&!this.manual;", "const balanceActive=(this.state==='move'||this.state==='idle')&&!this.manual;");
  }
  if (rel === "src/game/character-face.js") {
    patch("  const c0 = at(cx, cy, 1.066);\n  const ids = [];", "  const c0 = at(cx, cy, 1.066);\n  const angularKernel = Array.from({length:segs},(_,k)=>{const a=(k/segs)*TAU;return {r:lashR(L,a),c:Math.cos(a),s:Math.sin(a)};});\n  const ids = [];");
    patch("for (let k = 0; k < segs; k++) { const a = (k / segs) * TAU, rr = lashR(L, a) * f; row.push(at(cx + rr * Math.cos(a), cy + rr * Math.sin(a), 1.066 - 0.016 * f * f)); }", "for (let k = 0; k < segs; k++) { const kernel=angularKernel[k], rr=kernel.r*f; row.push(at(cx + rr * kernel.c, cy + rr * kernel.s, 1.066 - 0.016 * f * f)); }");
    patch("  // margin roll: a rounded lid edge that tucks under the eyeball surface (the wet line)\n  for (let j = 1; j <= m; j++) {", "  // margin roll: a rounded lid edge that tucks under the eyeball surface (the wet line)\n  const marginKernel = cols.map(c => { const tEdge=eyeSkinT(F,apertureDir(c.phi,1,a)), x=EYEB.xh*Math.cos(c.phi), travel=lidTravel(x), up=Math.sin(c.phi)>=0;return {tEdge,travel,up}; });\n  for (let j = 1; j <= m; j++) {");
    patch("      const tEdge = eyeSkinT(F, apertureDir(c.phi, 1, a));", "      const tEdge = marginKernel[k].tEdge;");
    patch("      const x = EYEB.xh * Math.cos(c.phi), [tu, tl] = lidTravel(x);\n      const up = Math.sin(c.phi) >= 0;", "      const [tu, tl] = marginKernel[k].travel;\n      const up = marginKernel[k].up;");
    patch("  const bagRing = (sgn, dy, dz, sx) => cols.map((c, k) => {\n    const x0 = contact[k].clone().sub(MF.C).dot(X);\n    const a = x0 / MF.hw;\n    const y = (c.up ? 1 : -1) * dy * Math.sqrt(Math.max(0, 1 - Math.min(1, a * a) ** 2) * 0.85 + 0.15);", "  const bagKernel = contact.map(p => { const x0=p.clone().sub(MF.C).dot(X), a=x0/MF.hw; return {x0,a,width:Math.sqrt(Math.max(0,1-Math.min(1,a*a)**2)*0.85+0.15)}; });\n  const bagRing = (sgn, dy, dz, sx) => cols.map((c, k) => {\n    const {x0,a,width} = bagKernel[k];\n    const y = (c.up ? 1 : -1) * dy * width;");
  }
  if (rel === "src/fx/fx.js") patch("      X[x + 5] += X[x + 6] * dt;\n    }\n    for (let i = 0; i < pool.n; i++) {\n      const x = i * 14, i3 = i * 3, i4 = i * 4;","      X[x + 5] += X[x + 6] * dt;\n      const i4 = i * 4;");
  if (rel === "src/world/paint.js") {
    patch("      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,\n      generateMipmaps: false, depthBuffer: false, stencilBuffer: false,","      minFilter: this.level.native ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,\n      generateMipmaps: false, depthBuffer: false, stencilBuffer: false,");
    patch("  _regenerateMipmaps() {\n    if (globalThis.document?.hidden) return;","  _regenerateMipmaps() {\n    if (this.level.native || globalThis.document?.hidden) return;");
  }
  if (rel === 'src/world/decor.js') {
    patch("const at = (g, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(s, s, s)));","const atMatrix = new THREE.Matrix4(), atPosition = new THREE.Vector3(), atScale = new THREE.Vector3(), atQuaternion = new THREE.Quaternion(), atEuler = new THREE.Euler(0,0,0,'YXZ');\nconst at = (g, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => g.applyMatrix4(atMatrix.compose(atPosition.set(x,y,z), atQuaternion.setFromEuler(atEuler.set(rx,ry,rz,'YXZ')), atScale.set(s,s,s)));");
    patch("          const tx = qx - px, ty = qy - py, tz = qz - pz, tl = Math.hypot(tx, ty, tz) || 1;","          const tx = qx - px, ty = qy - py, tz = qz - pz, tl = Math.hypot(tx, ty, tz) || 1;\n          const leafTx = tx / tl, leafTz = tz / tl;");
    patch("            const tipx = px + ox * L * 0.82 + (tx / tl) * L * 0.35, tipy = py - droop, tipz = pz + oz * L * 0.82 + (tz / tl) * L * 0.35;","            const tipx = px + ox * L * 0.82 + leafTx * L * 0.35, tipy = py - droop, tipz = pz + oz * L * 0.82 + leafTz * L * 0.35;");
    patch("            const b0 = vtx(px - (tx / tl) * 0.035, py, pz - (tz / tl) * 0.035, cc, t);","            const b0 = vtx(px - leafTx * 0.035, py, pz - leafTz * 0.035, cc, t);");
    patch("            const b1 = vtx(px + (tx / tl) * 0.035, py, pz + (tz / tl) * 0.035, cc, t);","            const b1 = vtx(px + leafTx * 0.035, py, pz + leafTz * 0.035, cc, t);");
  }
  if (rel === 'src/world/level.js') {
    patch("      lin.copy(f.color); B.col.push3(lin.r, lin.g, lin.b);\n      Q.copy(p).sub(f.origin);\n      const cu = Q.dot(f.u), cv = Q.dot(f.v);","      B.col.push3(f.color.r, f.color.g, f.color.b);\n      const qx=p.x-f.origin.x,qy=p.y-f.origin.y,qz=p.z-f.origin.z;\n      const cu=qx*f.u.x+qy*f.u.y+qz*f.u.z,cv=qx*f.v.x+qy*f.v.y+qz*f.v.z;");
    patch("            rows.push([r0, r1, Nn.clone()]);","            rows.push([r0, r1, Nn.x, Nn.y, Nn.z]);");
    patch("            const [a0, a1, na] = rows[q], [b0, b1] = rows[q + 1];\n            tri(a0, a1, b1, na); tri(a0, b1, b0, na);","            const [a0, a1, nx, ny, nz] = rows[q], [b0, b1] = rows[q + 1];\n            Nn.set(nx,ny,nz); tri(a0, a1, b1, Nn); tri(a0, b1, b0, Nn);");
  }
  if (rel === 'src/world/environment.js') {
    patch("          containers.push({ matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, quayTop + 1.3 + k * 2.6, z), _q, new THREE.Vector3(1, 1, 1)), color });","          containers.push({ x, y:quayTop + 1.3 + k * 2.6, z, qx:_q.x, qy:_q.y, qz:_q.z, qw:_q.w, color });");
    patch("    containers.forEach(({ matrix, color }, i) => { containerMesh.setMatrixAt(i, matrix); containerMesh.setColorAt(i, new THREE.Color(color)); });","    const containerColor = new THREE.Color();\n    containers.forEach(({ x,y,z,qx,qy,qz,qw,color }, i) => { _m4.compose(_v.set(x,y,z),_q.set(qx,qy,qz,qw),_s.set(1,1,1)); containerMesh.setMatrixAt(i, _m4); containerMesh.setColorAt(i, containerColor.set(color)); });");
    patch("  const rings = R + 2;\n  for (let k = 1; k < rings; k++) {","  const rings = R + 2;\n  const islandBasis=Array.from({length:S},(_,sI)=>{const a=(sI/S)*Math.PI*2;return [Math.cos(a),Math.sin(a)];});\n  for (let k = 1; k < rings; k++) {");
    patch("      const a = (sI / S) * Math.PI * 2;\n      push(Math.cos(a) * f, Math.sin(a) * f, k === rings - 1 ? -6 : undefined);","      const [ca,sa]=islandBasis[sI];\n      push(ca * f, sa * f, k === rings - 1 ? -6 : undefined);");
  }
  if (rel === "src/game/character-hair.js") {
    patch("    out.push(b.clone().addScaledVector(d, x + L * 0.12 * u).addScaledVector(o, y).add(new V3(0, lift * rk * u * u * Math.abs(curl), 0)));","    const point=b.clone().addScaledVector(d,x+L*0.12*u).addScaledVector(o,y);\n    point.x+=0;point.y+=lift*rk*u*u*Math.abs(curl);point.z+=0;out.push(point);");
    patch("  frame(t, P, T, O, B) {","  frame(t, P, T, O, B, computeBinormal = true) {");
    patch("    B.crossVectors(T, O).normalize();","    if (computeBinormal) B.crossVectors(T, O).normalize();");
    patch("    const t = lerp(from, to, i / n); S.frame(t, P, T, O, B); const s = S.section(t);","    const t = lerp(from, to, i / n);\n    if(S.frame===TentacleSurface.prototype.frame)S.frame(t,P,T,O,B,false);else S.frame(t,P,T,O,B);\n    const s = S.section(t);");
  }
  if (rel === "src/game/character-geo.js") {
    patch("    const topPt = (u, sN) => {","    const topPt = (u, sN, baseP, direction) => {");
    patch("      const q = base(u, new V3()).addScaledVector(dirAt(u), sN * L);","      const q = baseP.clone().addScaledVector(direction, sN * L);");
    patch("      const u = -1 + (2 * k) / nu;\n      rowsB.push(loop.map(([sN, side]) => { const q = topPt(u, Math.min(1, sN)); if (side > 0) { q.y -= TH * side; if (side < 1) q.addScaledVector(dirAt(u), 0.0026 * Math.sin(Math.PI * side) + (sN - 1) * 0.08); } return q; }));","      const u = -1 + (2 * k) / nu, baseP=base(u,new V3()), direction=dirAt(u);\n      rowsB.push(loop.map(([sN, side]) => { const q = topPt(u, Math.min(1, sN),baseP,direction); if (side > 0) { q.y -= TH * side; if (side < 1) q.addScaledVector(direction, 0.0026 * Math.sin(Math.PI * side) + (sN - 1) * 0.08); } return q; }));");
  }
  if (rel === 'src/world/environment.js') patch('    const runs = this._boundaryRuns();','    const runs = marina ? [] : this._boundaryRuns();');
  if(rel==='src/game/minimap.js')patch("    const sx = (this.pixSx = this.pixSx?.length === N ? this.pixSx.fill(0) : new Int8Array(N)), sy = (this.pixSy = this.pixSy?.length === N ? this.pixSy.fill(0) : new Int32Array(N));","    const StrideArray=faces.every(f=>Number.isInteger(f.nu)&&f.nu>=0&&f.nu<=65535)?Uint16Array:Int32Array;\n    const sx = (this.pixSx = this.pixSx?.length === N ? this.pixSx.fill(0) : new Int8Array(N)), sy = (this.pixSy = this.pixSy?.length === N && this.pixSy.constructor === StrideArray ? this.pixSy.fill(0) : new StrideArray(N));");
  if(rel==='src/game/character-geo.js'){
    patch("  if (kind === 'wristbands') {","  if (kind === 'wristbands') {\n    const wristCount=lo?10:20,wristFlat=ARM_FLAT(0.893),wristBasis=Array.from({length:wristCount},(_,i)=>{const th=(i/wristCount)*TAU;return [Math.cos(th),Math.sin(th)];});");
    patch("      const rows = prof.map(([a, dr]) => { const row = []; for (let i = 0; i < nT; i++) { const th = (i / nT) * TAU; row.push(c0.clone().addScaledVector(fd, a).addScaledVector(side, (ra * ARM_FLAT(0.893) + dr) * Math.cos(th)).addScaledVector(fw, (ra + dr) * Math.sin(th))); } return row; });","      const rows = prof.map(([a, dr]) => { const row = []; for (let i = 0; i < nT; i++) { const [ca,sa]=wristBasis[i]; row.push(c0.clone().addScaledVector(fd, a).addScaledVector(side, (ra * wristFlat + dr) * ca).addScaledVector(fw, (ra + dr) * sa)); } return row; });");
    patch("    for (const dy of [0.034, -0.028]) {","    const kneeBasis=Array.from({length:14},(_,i)=>{const th=(i/14)*TAU;return [Math.sin(th),Math.cos(th)];});\n    for (const dy of [0.034, -0.028]) {");
    patch("      const rows = prof.map(([a, r]) => Array.from({ length: 14 }, (_, i) => { const th = (i / 14) * TAU; return axisC.clone().add(new V3(r * Math.sin(th), a, r * 0.96 * Math.cos(th) + 0.004)); }));","      const rows = prof.map(([a, r]) => kneeBasis.map(([sa,ca]) => axisC.clone().add(new V3(r * sa, a, r * 0.96 * ca + 0.004))));");
    patch("    const rowsR = [], vR = [];","    const rowsR = [], vR = [], bucketDirections = new Map();");
    patch("        const dir = new V3(n.x, 0, n.z).normalize().multiplyScalar(Math.cos(0.62)).add(new V3(0, -Math.sin(0.62), 0));\n        q.addScaledVector(dir, Math.min(1, sN) * L);\n        const up = new V3(0, 1, 0).addScaledVector(dir, -dir.y).normalize();","        let basis=bucketDirections.get(az);\n        if(!basis){const dir=new V3(n.x,0,n.z).normalize().multiplyScalar(Math.cos(0.62)).add(new V3(0,-Math.sin(0.62),0));const up=new V3(0,1,0).addScaledVector(dir,-dir.y).normalize();basis={dir,up};bucketDirections.set(az,basis);}\n        const {dir,up}=basis;\n        q.addScaledVector(dir, Math.min(1, sN) * L);");
  }
  if(rel==='src/world/paint.js'){
    patch("    const reach = radius * Math.max(3.2, reachK + 1.4 * sAmt + 0.3);","    const numericStretch=typeof sAmt==='number', stretchExtentFactor=numericStretch?reachK+1.4*sAmt:0, faceExtentFactor=numericStretch?(kind===14?reachK+1.4*Math.max(0,sAmt):stretchExtentFactor):0;\n    const reach = radius * Math.max(3.2, (numericStretch?stretchExtentFactor:reachK+1.4*sAmt) + 0.3);");
    patch("          const ext = rr * (reachK + 1.4 * (kind === 14 ? Math.max(0, sAmt) : sAmt));","          const ext = rr * (numericStretch?faceExtentFactor:reachK+1.4*(kind===14?Math.max(0,sAmt):sAmt));");
  }
  if(rel==='src/world/environment.js'){
    patch("    this.sailInst.instanceMatrix.addUpdateRange(0, this.sailboats.length * 16);","    if(this.sailInst.instanceMatrix.array.length!==this.sailboats.length*16) this.sailInst.instanceMatrix.addUpdateRange(0, this.sailboats.length * 16);");
    patch("    this.buoyInst.instanceMatrix.addUpdateRange(0, this.buoys.length * 16);","    if(this.buoyInst.instanceMatrix.array.length!==this.buoys.length*16) this.buoyInst.instanceMatrix.addUpdateRange(0, this.buoys.length * 16);");
    patch("    this.gullInst.instanceMatrix.addUpdateRange(0, this.gulls.length * 16);","    if(this.gullInst.instanceMatrix.array.length!==this.gulls.length*16) this.gullInst.instanceMatrix.addUpdateRange(0, this.gulls.length * 16);");
  }
  if(rel==='src/game/character-geo.js'){patch("    for (const outline of [true, false]) {\n      const rows=[];","    const maskColumns=Array.from({length:nu+1},(_,i)=>{const u=(i/nu*2-1)*0.995,h=0.068*Math.sqrt(Math.max(0,1-u*u));return {u,top:0.112+h-0.030*Math.exp(-Math.pow(u/0.24,2)),bottom:0.112-h+0.008*Math.exp(-Math.pow(u/0.22,2))};});\n    for (const outline of [true, false]) {\n      const rows=[];");patch("          const u=(i/nu*2-1)*0.995;\n          const h=0.068*Math.sqrt(Math.max(0,1-u*u));\n          const top=0.112+h-0.030*Math.exp(-Math.pow(u/0.24,2));\n          const bottom=0.112-h+0.008*Math.exp(-Math.pow(u/0.22,2));","          const {u,top,bottom}=maskColumns[i];");}
  return code;
}
