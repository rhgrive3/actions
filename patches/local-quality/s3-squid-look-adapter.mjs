// Splatoon 3 squid-form look (presentation only).
//
// References (fetched 2026-10-08): Nintendo's Japanese site clip ikahito_pc.mp4 and the How to Play clips
// s3_howtoplay_move01/02/03.mp4 (hashes in reports/inkwave-s3-hud-look-2026-10-08.md).
//  * Swimming in own ink: the clips show a raised surface over the squid. A floor-level hemisphere mound was tried
//    and removed (see the note after HALF_TURN); the local swimmer keeps the squid-shaped ghost, splashes/wake come from FX.
//  * The squid travels mantle-first with its face trailing (eyes toward the third-person camera); on dry ground it
//    lies flat with the eyes up and hops; arms are short and bundled, with two long feelers ending in dark clubs.
// Gameplay (speed, acceleration, hop timing, visibility rules, damage) is untouched; remote swimmers stay hidden
// by the floor exactly as before, and the climbing ghost is unchanged.

function once(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1)
    throw new Error(`INKWAVE S3 squid look conflict (${label}): expected one connection`);
  return code.slice(0, at) + after + code.slice(at + before.length);
}

const HALF_TURN = `
    // S3 squids travel mantle-first with the face trailing: in the official clips the third-person camera sees
    // the eyes of a squid moving away from it (rising out of ink, landing, climbing). Turn the drawn squid half
    // a turn about its mantle axis inside the pivot, so every pose owner (native, swim/roll/wall/flight patches)
    // keeps its own pivot transform and the face simply sits on the trailing side.
    for (const m of [body, ghost, dark, eyes]) m.rotation.y = Math.PI;`;

// The former own-ink mound (a team-coloured hemisphere scaled into an ellipse at the floor) was removed. It was
// only reachable from the native squid path (roller family; the sourced squid rig never updated it), its
// visibility switched on at full size on the first swim frame while the squid body was still above the ink
// (entering ink from dry ground, landing, form changes) and it kept the native yaw while swim-motion turned the
// body, so players saw an unexplained own-colour ellipse under the squid. The local swimmer now uses the same
// squid-shaped ghost on every weapon path.

const SQUID_EYE_MATERIAL = `export function makeSquidEyeMaterial(u) {
  // Squid-only painted eyes. Nintendo ikahito_pc.mp4 2.9–3.4s shows broad
  // white patches with dark pupils, without the human coloured iris spokes.
  const m = new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:0.18,metalness:0,clearcoat:1,clearcoatRoughness:0.05,specularIntensity:0.5});
  m.onBeforeCompile = shader => {
    shader.uniforms.uFlash=u.uFlash;
    inject(shader, {
      vPars:'varying vec2 vSquidEyeUv;',
      vBegin:'vSquidEyeUv=uv;',
      fPars:'varying vec2 vSquidEyeUv; uniform vec3 uFlash;',
      fColor:\`
        vec2 p=vSquidEyeUv;
        // Neutral squid gaze is independent of human form transitions.
        vec2 q0=(p-vec2(-0.34,0.35))/vec2(0.25,0.46);
        vec2 q1=(p-vec2(0.34,0.35))/vec2(0.25,0.46);
        float d=min(length(q0),length(q1))-1.0,aa=max(fwidth(d),0.001);
        float pupil=1.0-smoothstep(-aa,aa,d);
        diffuseColor.rgb=mix(vec3(0.94,0.95,0.97),vec3(0.008,0.007,0.018),pupil);
      \`,
      fEmissive:'totalEmissiveRadiance += uFlash * 0.5;',
    });
  };
  m.customProgramCacheKey=()=> 'squid-eye-connected-neutral-v3';
  return m;
}

`;

const ORIGINAL_SQUID_FACE = "  // ---- raised visor band with rolled edges + eye sockets\n  {\n    const nu = Math.max(40, Math.round(SD.around * 0.55)), nv = Math.max(10, Math.round(SD.rows * 0.22));\n    const rows = [];\n    for (let j = 0; j <= nv; j++) {\n      const v = j / nv;\n      rows.push(Array.from({ length: nu + 1 }, (_, i) => {\n        const u = i / nu; const ang = lerp(-2.05, 2.05, u);\n        const c = 0.09 + 0.02 * (Math.abs(ang) / 2.05) ** 2;\n        const hh = 0.045 * Math.pow(Math.max(0, 1 - (Math.abs(ang) / 2.05) ** 2), 0.6);\n        const y = c + (v * 2 - 1) * (hh + 0.004);\n        const e = Math.abs(v * 2 - 1);\n        const lift = 0.0078 * Math.sqrt(Math.max(0, 1 - Math.pow(e, 6))) - 0.003 * sstep(0.9, 1, e);\n        const endK = sstep(2.05, 1.35, Math.abs(ang));\n        return sqSurfN(ang, y, -0.002 + lift * endK, new V3());\n      }));\n    }\n    const g = gridGeo(rows, { wrapU: false, outward: (p, out) => out.set(0, p.y, 0) });\n    dark.add(g, { color: new THREE.Color(0.018, 0.02, 0.03) });\n  }\n  for (const sx of [1, -1]) {\n    const g = polarPatch(lod === 'far' ? 4 : 9, lod === 'far' ? 16 : 36, (u, v, r, out) => sqSurfN(sx * 0.5 + u * 0.31, 0.092 + v * 0.037, 0.0092 + 0.0042 * (1 - r * r), out));\n    eyes.add(g, { uv: true, ex: sx });\n  }\n";
const CONNECTED_SQUID_FACE = `  // Connected white squid eye mask and narrow dark outline, both follow the mantle.
  // The user's figure is a structural reference; physical lighting remains native.
  {
    const nu = lod === 'far' ? 16 : 32, nv = lod === 'far' ? 6 : 10;
    for (const outline of [true, false]) {
      const rows=[];
      for(let j=0;j<=nv;j++) {
        const v=j/nv;
        rows.push(Array.from({length:nu+1},(_,i)=>{
          const u=(i/nu*2-1)*0.995;
          const h=0.068*Math.sqrt(Math.max(0,1-u*u));
          const top=0.112+h-0.030*Math.exp(-Math.pow(u/0.24,2));
          const bottom=0.112-h+0.008*Math.exp(-Math.pow(u/0.22,2));
          const y=lerp(bottom-(outline?0.004:0),top+(outline?0.004:0),v);
          return sqSurfN(u*(outline?1.18:1.10),y,outline?0.006:0.008,new V3());
        }));
      }
      const g=gridGeo(rows,{wrapU:false,outward:(p,out)=>out.set(p.x,0,p.z)});
      const idx=g.index.array;for(let i=0;i<idx.length;i+=3){const t=idx[i+1];idx[i+1]=idx[i+2];idx[i+2]=t;}g.computeVertexNormals();
      if(outline) dark.add(g,{color:new THREE.Color(0.018,0.02,0.03)});
      else eyes.add(g,{uv:(i)=>[g.attributes.uv.getX(i)*2-1,(g.attributes.position.getY(i)-0.112)/0.068],ex:0});
    }
  }
`;

export function adaptS3SquidLook(rel, code) {
  if (rel === 'src/game/character.js') {
    code = once(code, 'getDarkMaterial, makeEyeMaterial,', 'getDarkMaterial, makeEyeMaterial, makeSquidEyeMaterial,', 'squid eye factory import');
    code = once(code, '      eye: makeEyeMaterial(u),', '      eye: makeEyeMaterial(u),\n      squidEye: makeSquidEyeMaterial(u),', 'owned squid eye material');
    code = once(code, 'new THREE.Mesh(sh.eyes, this.mats.eye)', 'new THREE.Mesh(sh.eyes, this.mats.squidEye)', 'squid eye attachment');
    code = once(code, "'eye', 'fill', 'squid',", "'eye', 'squidEye', 'fill', 'squid',", 'squid eye disposal');
    code = once(code, '    this.squid = { pivot, body, ghost, dark, eyes };\n', '    this.squid = { pivot, body, ghost, dark, eyes };' + HALF_TURN + '\n', 'trailing face');
    // Dry ground: the clips show the squid lying flat, mantle pointing along travel and eyes up (move02 0.0–0.25 s
    // and 6.6 s), not standing on its arms. Keep the native hop/squash/yaw clocks; only the resting axis changes.
    code = once(code,
      "      _e1.set(tilt, this.sqYaw, 0.05 * Math.sin(t * 2.3), 'YXZ'); q.setFromEuler(_e1);\n      p.set(0, 0.165 + hop, 0);",
      "      _e1.set(Math.PI / 2 - 0.52 - tilt * 0.5, this.sqYaw, 0.05 * Math.sin(t * 2.3), 'YXZ'); q.setFromEuler(_e1);\n      p.set(0, 0.09 + hop * 0.8, 0);\n      _v2.set(0, -0.11, 0).applyQuaternion(q); p.add(_v2);", 'flat dry squid');
    return code;
  }
  if (rel === 'src/game/character-mats.js') {
    if(code.includes('export function makeSquidEyeMaterial(')) throw new Error('INKWAVE S3 squid look conflict (eye factory already adapted)');
    const split=code.indexOf('export function makeSquidMaterial(u, ghost = false) {');
    if(split<0) throw new Error('INKWAVE S3 squid look conflict (squid material missing)');
    const head=code.slice(0,split);let body=code.slice(split);
    body=once(body,'          diffuseColor.rgb *= mix(0.7, 1.0, iwAO);', `          // Dark violet club coating and pale spots observed across 2.9–3.4s.
          // Negative tint is authored only for the two long feeler tips.
          if(vSqPart > 0.5 && vTint < -0.05) {
            float tip=smoothstep(0.05,0.9,-vTint);
            vec3 club=vec3(0.075,0.04,0.16);
            if(vSqPart > 1.5 && vSqPart < 2.5) club=mix(vec3(0.13,0.08,0.24),vec3(0.38,0.29,0.56),smoothstep(0.1,0.65,vSq.y-1.0));
            else if(vSqPart < 1.5) club=mix(club,vec3(0.38,0.29,0.56),iwSuck);
            // Broad flat marks on the outward/eye-facing club surface. Existing
            // cup relief is inward-facing and cannot represent these visible marks.
            if(vSqPart < 1.5 || vSqPart > 2.5) {
              float t=vSqUv.x,cs=vSqUv.y;
              float side=sqrt(max(0.0,1.0-cs*cs));
              float d0=length(vec2((t-0.70)/0.052,side/0.29));
              float d1=length(vec2((t-0.80)/0.052,(side-0.53)/0.25));
              float d2=length(vec2((t-0.90)/0.047,side/0.33));
              float d=min(d0,min(d1,d2)),aa=max(fwidth(d),0.03);
              float spots=(1.0-smoothstep(1.0-aa,1.0+aa,d))*smoothstep(0.05,0.25,cs);
              club=mix(club,vec3(0.38,0.29,0.56),spots);
            }
            diffuseColor.rgb=mix(diffuseColor.rgb,club,tip);
          }
          diffuseColor.rgb *= mix(0.7, 1.0, iwAO);`, 'two long club coating');
    code=head+body;
    return once(code, 'export function makeSquidMaterial(u, ghost = false) {', SQUID_EYE_MATERIAL + 'export function makeSquidMaterial(u, ghost = false) {', 'squid-only eye surface');
  }
  if (rel === 'src/game/character-geo.js') {
    // Bounded silhouette correction from Nintendo ikahito 2.9–3.4s:
    // flatten the inflated mantle without scaling the rig or human geometry.
    // Surface-following eye/band coordinates and thickness metadata use SQ_ZS too.
    code = once(code, 'const SQ_ZS = 0.86;', 'const SQ_ZS = 0.62;', 'flatter squid mantle');
    code = once(code, '[0.126, 0.03], [0.131, 0.08], [0.127, 0.13]', '[0.108, 0.03], [0.112, 0.08], [0.116, 0.13]', 'less bulbous lower mantle');
    // Shorten only the lower mantle beneath the connected white field. Keep the
    // surface sampler, profile domain and closing pole in the same coordinates.
    code=once(code, '[[0, -0.034], [0.07, -0.03], [0.108, -0.009], [0.108, 0.03]', '[[0, 0.006], [0.07, 0.009], [0.108, 0.023], [0.108, 0.045]', 'short lower mantle profile');
    code=once(code, 'densitySamples(SD.rows, -0.034, 0.375,', 'densitySamples(SD.rows, 0.006, 0.375,', 'short lower mantle sampling');
    code=once(code, 'start: new V3(0, -0.034, 0), end: new V3(0, 0.375, 0)', 'start: new V3(0, 0.006, 0), end: new V3(0, 0.375, 0)', 'short lower mantle pole');
    // Whole-model reference landmarks: broaden the cap relative to the eye field,
    // and raise its rounded apex without changing the lower mantle or attachments.
    code=once(code, '[0.099, 0.214], [0.081, 0.254], [0.059, 0.298], [0.035, 0.34], [0.015, 0.366], [0, 0.375]', '[0.099, 0.2218], [0.081, 0.2698], [0.059, 0.3226], [0.035, 0.373], [0.015, 0.4042], [0, 0.415]', 'measured taller cap profile');
    code=once(code, 'return 0.108 * sstep(0.158, 0.222, y) * Math.pow(1 - sstep(0.222, 0.374, y), 1.05);', 'return 0.118 * sstep(0.100, 0.145, y) * Math.pow(1 - sstep(0.145, 0.4138, y), 1.05);', 'measured broader rounded cap');
    code=once(code, 'densitySamples(SD.rows, 0.006, 0.375,', 'densitySamples(SD.rows, 0.006, 0.415,', 'taller cap sampling');
    code=once(code, 'end: new V3(0, 0.375, 0)', 'end: new V3(0, 0.415, 0)', 'taller cap pole');
    code=once(code, 'const f = sqFin(y) * Math.pow(Math.abs(s), 7);', 'const f = sqFin(y) * Math.pow(Math.abs(s), 24);', 'lateral shoulders preserve frontal eye field');
    // the two long feelers hang in front of the face (the +Z side, which faces the camera after the half turn),
    // as in the clips; the other arms are short, stubby and hang close together instead of splaying out
    code = once(code, '    const feeler = k === 4 || k === 6;', '    const feeler = k === 0 || k === N - 1;', 'feelers under the face');
    code = once(code,
      '    const len = lerp(0.15, 0.108, Math.max(0, Math.cos(a))) * (k % 2 ? 0.92 : 1.0) * (feeler ? 1.3 : 1);',
      '    const len = lerp(0.15, 0.108, Math.max(0, Math.cos(a))) * (k % 2 ? 0.92 : 1.0) * (feeler ? 2.0 : 0.28);', 'bundled arms and long feelers');
    // Six presentation arms match the bank's two arms plus four leg chains.
    // Semantic IDs and the /10 phase encoding remain stable for source skinning.
    code = once(code, '    const a = (k / N) * TAU + 0.31;', '    if (![0, 2, 4, 6, 8, 9].includes(k)) continue;\n    const a = (k / N) * TAU + 0.31;', 'four short lobes and two long outer arms');
    code = once(code,
      '    const raw = [[dx * 0.055, 0.012, dz * 0.055], [dx * 0.09, -0.04, dz * 0.09], [dx * 0.118, -0.035 - len * 0.55, dz * 0.118], [dx * 0.15, -0.035 - len * 0.86, dz * 0.15], [dx * (0.178 + curl * 0.6), -0.032 - len * 0.98, dz * (0.178 + curl * 0.6)]].map((q) => new V3(...q));',
      '    const side = k === 0 ? 1 : -1;\n    const shortX = ({2:0.050,4:0.017,6:-0.017,8:-0.050})[k];\n    const outerShort = k === 2 || k === 8;\n    const raw = (feeler ? [[side*0.095,0.012,0.035],[side*0.106,-0.04,0.043],[side*0.112,-0.035-len*0.55,0.050],[side*0.116,-0.035-len*0.86,0.055],[side*0.117,-0.032-len*0.98,0.055]] : [[shortX,0.045,0.020],[shortX,-0.015,0.020],[shortX,-0.025-len*0.55,0.024],[shortX,-0.025-len*0.86,0.028],[shortX,-0.024-len*0.98,0.028]]).map((q) => new V3(q[0], q[1]+(feeler ? 0.025 : 0.035+(outerShort ? 0.012 : 0)), q[2]-(!feeler && outerShort ? 0.030 : 0)));', 'outer long roots and four compact supports');
    code = once(code, 'const out = new V3(dx, 0.35, dz).normalize();', 'const out = new V3(0, 0.35, 1).normalize();', 'club curl follows face plane');
    code = once(code, 'outward: (P, o) => o.set(P.x, 0.25, P.z).normalize(),', 'outward: (P, o) => o.set(0, 0.25, 1).normalize(),', 'broad clubs face the eyes');
    // Short arms are compact rounded fingers, not thin curled wires.
    code = once(code, 'const pts = curlTip(raw, (feeler ? 0.9 : 0.75) + 0.1 * (k % 3), () => out, 0.5);', 'const pts = raw;', 'uncurled short arm group');
    code = once(code, 'lerp(0.0255, 0.0062, Math.pow(t, 0.78))', 'lerp(feeler ? 0.0255 : 0.036, feeler ? 0.0062 : 0.014, Math.pow(t, 0.78))', 'rounded short arms');
    code = once(code, 'tipSteps: D.tipSteps, tipLen: 1.1 });', 'tipSteps: D.tipSteps, tipLen: feeler ? 1.1 : 0.65 });', 'rounded short arm terminal caps');
    // Tiny repeated relief cups made the short lobes read as spindly legs.
    // Preserve the hidden long-arm cups; short arm surfaces stay smooth.
    code = once(code, '    if (SD.cups) {', '    if (SD.cups && feeler) {', 'simplified short arm surface');
    code = once(code, 'ex: SD.cups ? 3 : 1, uv:', 'ex: !feeler || SD.cups ? 3 : 1, uv:', 'short arms without printed microcups');
    // S3 squid colours follow the tentacle scheme: the two longest tentacles shade darker toward their club
    // tips (negative tint = the material's dark ink shade); the cups keep their pale tint, so the club reads
    // as a dark tip with light spots.
    code = once(code,
      'color: (p, i) => _c.setRGB(tint(tA[i]), tA[i], k / N)',
      'color: (p, i) => _c.setRGB(feeler ? lerp(tint(tA[i]), -0.95, sstep(0.5, 0.8, tA[i])) : tint(tA[i]), tA[i], k / N)', 'dark feeler clubs');
    code = once(code, '_c.setRGB(tint(ct[i]) + 0.1, ct[i], k / N)', '_c.setRGB(feeler ? lerp(tint(ct[i]) + 0.1, -0.95, sstep(0.5, 0.8, ct[i])) : tint(ct[i]) + 0.1, ct[i], k / N)', 'club spot coating marker');
    code=once(code,ORIGINAL_SQUID_FACE,CONNECTED_SQUID_FACE,'connected squid eye mask');
    code=once(code,"  _squid.set(key, res);","  res.eyes.userData.squidConnectedEye = true;\n  res.body.userData.squidCompactSupports = true;\n  _squid.set(key, res);",'connected eye binding marker');
    return once(code,
      "(feeler ? 0.22 * gauss(t - 0.8, 0.07) : 0)",
      "(feeler ? 4.5 * gauss(t - 0.74, 0.24) : 0)", 'feeler club tips');
  }
  return code;
}
