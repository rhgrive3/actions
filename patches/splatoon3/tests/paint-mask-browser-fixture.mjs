// Tests the emitted shader, emitted CPU mask, and native seed attribute packing.
// Only raster derivatives/AA are replaced: points query exact gameplay samples,
// with tx fixed to the actual atlas density instead of unrelated neighbor points.
import { PaintSystem } from '/ASSET/src/world/paint.js';
import { paintShapeSeed, paintShapeHash } from '/ASSET/patches/splatoon3/runtime/paint-ownership.mjs';

const check = (condition, message) => { if (!condition) throw Error(message); };
export function createPaintMaskProbe() {
  const paint = Object.create(PaintSystem.prototype);
  Object.assign(paint, { size: 1024, usedHeight: 1024, grid: new Uint8Array(128 * 128), dead: new Uint8Array(128 * 128),
    counts: [0, 0], version: 0, clock: 0, growing: [],
    renderer: { capabilities: { getMaxAnisotropy: () => 1 }, getRenderTarget: () => null,
      getClearColor: c => c, getClearAlpha: () => 0, setRenderTarget() {}, setClearColor() {}, clear() {}, render() {} } });
  paint._initGPU();
  return paint;
}

export async function runPaintMaskProbe() {
  const paint = createPaintMaskProbe();
  const nativeShader = paint.mat.fragmentShader;
  check(nativeShader.includes('float paintShapeHash('), 'emitted shader must contain the shared integer hash');
  const canvas = document.createElement('canvas'), gl = canvas.getContext('webgl2', { antialias: false });
  check(gl, 'real WebGL2 is required');
  const maxWidth = 1024;
  function compile(type, source) {
    const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
    check(gl.getShaderParameter(shader, gl.COMPILE_STATUS), gl.getShaderInfoLog(shader)); return shader;
  }
  function program(fragment) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, `#version 300 es
precision highp float;
in vec3 query; uniform float width; uniform float height;
uniform vec4 splat; uniform vec4 grow; uniform vec3 stretch;
out vec3 vLocal; out vec4 vSplat; out vec4 vGrow; out vec3 vStretch;
void main() {
  float id = float(gl_VertexID);
  gl_Position = vec4((mod(id, width) + 0.5) / width * 2.0 - 1.0, (floor(id / width) + 0.5) / height * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0; vLocal = query; vSplat = splat; vGrow = grow; vStretch = stretch;
}`));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, '#version 300 es\n' + fragment.replaceAll('varying ', 'in ').replaceAll('gl_FragColor', 'result')
      .replace('precision highp float;', 'precision highp float;\nout vec4 result;')));
    gl.linkProgram(p); check(gl.getProgramParameter(p, gl.LINK_STATUS), gl.getProgramInfoLog(p)); return p;
  }
  function query(p, points, splat = [0, 0, 0, 0], grow = [0, 0, 0, 0], stretch = [0, 0, 0]) {
    const count = points.length / 3, width = Math.min(count, maxWidth), height = Math.ceil(count / width);
    canvas.width = width; canvas.height = height; gl.viewport(0, 0, width, height); gl.useProgram(p);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);
    const attr = gl.getAttribLocation(p, 'query'); gl.enableVertexAttribArray(attr); gl.vertexAttribPointer(attr, 3, gl.FLOAT, false, 0, 0);
    gl.uniform1f(gl.getUniformLocation(p, 'width'), width); gl.uniform1f(gl.getUniformLocation(p, 'height'), height);
    gl.uniform4fv(gl.getUniformLocation(p, 'splat'), splat); gl.uniform4fv(gl.getUniformLocation(p, 'grow'), grow); gl.uniform3fv(gl.getUniformLocation(p, 'stretch'), stretch);
    gl.disable(gl.BLEND); gl.disable(gl.DITHER); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, count);
    const result = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, result);
    check(gl.getError() === gl.NO_ERROR, 'GPU sample/readback error'); gl.deleteBuffer(buffer); return result;
  }
  const hashBody = nativeShader.match(/float paintShapeHash\([^}]+\}/)?.[0]; check(hashBody, 'shared shader hash extraction');
  const hashProgram = program(`precision highp float; varying vec3 vLocal; ${hashBody}
void main() { float h = paintShapeHash(vLocal.x, vLocal.y, vLocal.z) * 65536.0;
  gl_FragColor = vec4(floor(h / 256.0) / 255.0, mod(h, 256.0) / 255.0, 0.0, 1.0); }`);
  const hashPoints = [], hashExpected = [];
  for (const word of [0, 1, 255, 256, 24248, 32767, 32768, 65534, 65535]) for (let stream = 0; stream < 12; stream++) for (let k = 0; k < 14; k++) {
    hashPoints.push(word, stream, k); hashExpected.push(paintShapeHash(word, stream, k) * 65536);
  }
  const hashPixels = query(hashProgram, hashPoints);
  for (let i = 0; i < hashExpected.length; i++) check(hashPixels[i * 4] * 256 + hashPixels[i * 4 + 1] === hashExpected[i], `CPU/GPU hash mismatch at ${i}`);

  // Ask the actual SDF whether each interior sample is solidly visible. Preserve
  // all native shape math, branching, smooth unions, and the unchanged body.
  const ppm = 64, margin = 1.5 / ppm;
  const tx = /float tx = max\(max\(abs\(dFdx\(p0.x\)\), abs\(dFdy\(p0.x\)\)\), max\(abs\(dFdx\(p0.y\)\), abs\(dFdy\(p0.y\)\)\)\);/;
  check(tx.test(nativeShader), 'native texel derivative anchor');
  const tail = /  float fw = max\(fwidth\(sd\), 1e-5\);[\s\S]*?gl_FragColor = vec4\(team, 1.0, hsh\(seed \* 1.73\), a\);/;
  check(tail.test(nativeShader), 'native coverage output anchor');
  const maskShader = nativeShader.replace(tx, `float tx = ${1 / ppm};`)
    .replace(tail, `  gl_FragColor = vec4(sd < -${margin} ? 1.0 : 0.0, 0.0, 0.0, 1.0);`);
  const streams = [[7.31, 1.93], [3.17, 5.71], [11.3, 2.39], [13.1, 7.7], [5.3, 3.1], [9.9, 1.7],
    [17.9, 4.13], [2.71, 8.09], [6.47, 3.37], [3.7, 11.3], [8.1, 2.9], [4.3, 5.9]];
  function revertedShader(first, end) {
    let result = maskShader;
    for (let i = first; i < end; i++) {
      const [a, b] = streams[i], anchor = `paintShapeHash(paintSeed, ${i}.0, fk)`;
      check(result.includes(anchor), `native ancillary stream ${i}`);
      result = result.replace(anchor, `hsh(seed * ${a} + fk * ${b})`);
    }
    return result;
  }
  const positive = program(maskShader), negative = program(revertedShader(0, 12)), rows = [];
  const families = { rays: program(revertedShader(0, 3)), satellites: program(revertedShader(3, 6)),
    spatter: program(revertedShader(6, 9)), drips: program(revertedShader(9, 12)) };
  const face = { atlas: { x: 0, y: 0, pad: 2, ppm }, su: 32, sv: 32, nu: 128, nv: 128, cu: 0.25, cv: 0.25,
    grid: 0, wall: false, turf: true };
  for (const wall of [false, true]) for (const kind of [0, 1, 2, 3, 4, 5]) for (const seed of [0.37, 0.72, 0.99999]) for (const tn of [0.6, 1.1, 3]) {
    paint.clear(); face.wall = wall;
    const order = paint._paintOrderId({ tick: 1, peer: 'mask-probe', seq: 1 });
    const sa = kind === 1 ? 1.2 : 0, sdu = sa ? 0.6 : 0, sdv = sa ? 0.8 : 0;
    const g = { R: 2.7, team: 0, seed, kind, age: tn, dur: 1, dripDur: wall ? 3 : 0,
      entries: [face, 16, 20, 0, sdu, sdv, sa], paintOrder: order, netOrderId: order };
    paint._advanceSplatOwnership(g);
    const dT = wall ? 1 - Math.pow(1 - Math.min(1, tn / 3), 2.2) : 1;
    const count = paint._paintOrderRuns(face, order, 0, 32, 0, 32), runs = paint._paintOrderRunScratch.slice(0, count * 4);
    const points = []; let cells = 0;
    for (let i = 0; i < paint.grid.length; i++) if (paint.grid[i]) {
      const x = (i % 128 + 0.5) * 0.25, y = (Math.floor(i / 128) + 0.5) * 0.25;
      let included = false;
      for (let j = 0; j < runs.length; j += 4) if (x >= runs[j] && x <= runs[j + 1] && y >= runs[j + 2] && y <= runs[j + 3]) { included = true; break; }
      check(included, 'claimed cell missing from canonical GPU run');
      for (const [dx, dy] of [[0, 0], [-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]]) points.push(x - 16 + dx, y - 20 + dy, 0);
      cells++;
    }
    if (!cells) continue;
    paint.quads = 0;
    paint._pushQuad(face, 0, 1, 0, 1, 16, 20, 0, g.R, 0, seed, kind, sdu, sdv, sa, tn, dT, 0);
    const word = paint.aGrow[3]; check(word === paintShapeSeed(seed), 'native emitted quad seed packing');
    const args = [points, [g.R, 0, Math.fround(seed), (wall ? 1 : 0) + 2 * kind], [tn, dT, 0, word], [sdu, sdv, sa]];
    const actual = query(positive, ...args), reverted = query(negative, ...args);
    const familyPixels = Object.fromEntries(Object.entries(families).filter(([name]) => name !== 'drips' || wall)
      .map(([name, p]) => [name, query(p, ...args)]));
    const familyUnsupported = Object.fromEntries(Object.keys(familyPixels).map(name => [name, 0]));
    let unsupported = 0, negativeUnsupported = 0;
    for (let cell = 0; cell < cells; cell++) {
      let seen = false, revertedSeen = false;
      for (let sample = 0; sample < 5; sample++) { const i = (cell * 5 + sample) * 4; seen ||= actual[i] === 255; revertedSeen ||= reverted[i] === 255; }
      if (!seen) unsupported++; if (!revertedSeen) negativeUnsupported++;
      for (const [name, pixels] of Object.entries(familyPixels)) {
        let familySeen = false;
        for (let sample = 0; sample < 5; sample++) familySeen ||= pixels[(cell * 5 + sample) * 4] === 255;
        if (!familySeen) familyUnsupported[name]++;
      }
    }
    rows.push({ wall, kind, seed, tn, cells, unsupported, negativeUnsupported, familyUnsupported });
    check(unsupported === 0, `CPU owns invisible GPU cells: ${JSON.stringify(rows.at(-1))}`);
  }
  for (const wall of [false, true]) check(rows.some(row => row.wall === wall && row.negativeUnsupported > 0), `old-sine ${wall ? 'wall' : 'floor'} negative control must fail`);
  for (const name of Object.keys(families)) check(rows.some(row => row.familyUnsupported[name] > 0 && (name !== 'drips' || row.wall)),
    `independently reverted ${name} must expose unsupported cells`);
  check(rows.length === 108, 'all shape kinds, seeds, wall/floor and growth phases exercised');
  return { renderer: gl.getParameter(gl.RENDERER), hashQueries: hashExpected.length, rows,
    cells: rows.reduce((sum, row) => sum + row.cells, 0), negativeUnsupported: rows.reduce((sum, row) => sum + row.negativeUnsupported, 0) };
}
