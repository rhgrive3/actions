import * as THREE from 'three';
import { CATALOG_WALL_DROP } from '/ASSET/patches/splatoon3/runtime/catalog-wall-drop-data.mjs';
import { catalogPaintEllipse } from '/ASSET/patches/splatoon3/runtime/catalog-splash-paint.mjs';
// Tests the emitted shader, emitted CPU mask, and native seed attribute packing.
// Only raster derivatives/AA are replaced: points query exact gameplay samples,
// with tx fixed to the actual atlas density instead of unrelated neighbor points.
import { PaintSystem } from '/ASSET/src/world/paint.js';
import { paintShapeSeed, paintShapeHash } from '/ASSET/patches/splatoon3/runtime/paint-ownership.mjs';

const check = (condition, message) => { if (!condition) throw Error(message); };
export function createPaintMaskProbe() {
  const paint = Object.create(PaintSystem.prototype);
  // This probe models a complete rectangular legacy atlas, not a masked native stage.
  Object.assign(paint, { level: { native: false }, size: 1024, usedHeight: 1024, grid: new Uint8Array(128 * 128), dead: new Uint8Array(128 * 128),
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
  // Bind the exact production profile data to the scalar shader probe too.
  // The actual atlas framebuffer below still uses THREE's normal uploader.
  const profileImage = paint.mat.uniforms.uMainInkProfiles.value.image;
  const profileTexture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, profileTexture);
  check(paint.mat.uniforms.uMainInkProfiles.value.minFilter === THREE.NearestFilter &&
    paint.mat.uniforms.uMainInkProfiles.value.magFilter === THREE.NearestFilter,
    'CPU/GPU profiles interpolate exact texels in highp arithmetic');
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, profileImage.width, profileImage.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, profileImage.data);
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
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, '#version 300 es\n' + fragment.replaceAll('varying ', 'in ').replaceAll('gl_FragColor', 'result').replaceAll('texture2D(', 'texture(')
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
    gl.uniform1i(gl.getUniformLocation(p, 'uMainInkProfiles'), 0);
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
  // A removed family must be inert, while each retained family still needs a
  // failing counterfactual. Read the production shader's actual kind counts.
  const shapeBody = nativeShader.match(/vec4 kindShape\(float k\) \{[^}]+\}/)?.[0];
  check(shapeBody, 'production kindShape counts');
  const shapeCounts = [...shapeBody.matchAll(/return vec4\(([^)]+)\)/g)]
    .map(match => match[1].split(',').map(Number));
  check(shapeCounts.length === 7 && shapeCounts.slice(0, 6).every(c => c.length === 4 && c.every(Number.isFinite)),
    'six complete ancillary count vectors plus the body-only fallback');
  const activeFamilies = Object.fromEntries(Object.keys(families).map((name, i) =>
    [name, shapeCounts.some(counts => (counts[i] || 0) > 0)]));
  const face = { atlas: { x: 0, y: 0, pad: 2, ppm }, su: 32, sv: 32, nu: 128, nv: 128, cu: 0.25, cv: 0.25,
    grid: 0, wall: false, turf: true };
  // #1165: exercise the *actual WebGL shader and CPU ownership* for Roller
  // body-kind 6 too. Its final band is stable only after growth (tn >= 1):
  // source-side CPU/Judd and emitted fragment need to agree at those ticks.
  // pi/60 is the published witness where the old CPU border skipped visible ink.
  for (const wall of [false, true]) for (const kind of [0, 1, 2, 3, 4, 5, 6])
    for (const seed of (kind === 6 ? [0.37, 0.72, 0.99999, Math.PI / 60] : [0.37, 0.72, 0.99999]))
      for (const tn of (kind === 6 ? [1.1, 3] : [0.6, 1.1, 3])) {
    paint.clear(); face.wall = wall;
    const order = paint._paintOrderId({ tick: 1, peer: 'mask-probe', seq: 1 });
    const sa = kind === 1 ? 1.2 : kind === 6 ? 1 : 0, sdu = sa ? 0.6 : 0, sdv = sa ? 0.8 : 0;
    const g = { R: 2.7, team: 0, seed, kind, age: tn, dur: 1, dripDur: wall ? 3 : 0,
      entries: [face, 16, 20, 0, sdu, sdv, sa], paintOrder: order, netOrderId: order };
    // Roller body has no ancillary ink: use the production CPU body path.
    if (kind === 6) {
      const claimed = paint._cpuSplat(face, 16, 20, g.R, 0, seed, sdu, sdv, sa, kind, order);
      check(claimed > 0, `Roller CPU band must claim turf: ${JSON.stringify({ wall, seed, tn })}`);
    } else {
      paint._advanceSplatOwnership(g);
    }
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
    for (const [name, pixels] of Object.entries(familyPixels)) if (!activeFamilies[name]) {
      check(pixels.every((byte, i) => byte === actual[i]), `${name} is disabled and its hash cannot alter any GPU sample`);
    }
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
    // #1165 was a *GPU paints more than CPU scores* bug. Checking only
    // CPU-owned cells would miss that exact regression: probe every dry cell
    // near the Roller footprint for solid native GPU ink as well.
    let gpuOnlySolid = 0, firstGpuOnly = null;
    if (kind === 6) {
      const dryPoints = [], dryCells = [];
      for (let j = 0; j < face.nv; j++) for (let i = 0; i < face.nu; i++) {
        const x = (i + 0.5) * face.cu, y = (j + 0.5) * face.cv;
        if (Math.abs(x - 16) > g.R * 1.25 || Math.abs(y - 20) > g.R * 1.25) continue;
        if (paint.grid[face.grid + j * face.nu + i]) continue;
        dryPoints.push(x - 16, y - 20, 0);
        dryCells.push([i, j]);
      }
      check(dryCells.length > 0, 'Roller GPU-only probe must sample unclaimed turf');
      const dryMask = query(positive, dryPoints, args[1], args[2], args[3]);
      for (let i = 0; i < dryCells.length; i++) if (dryMask[i * 4] === 255) {
        gpuOnlySolid++;
        firstGpuOnly ||= dryCells[i];
      }
      if (seed === Math.PI / 60) {
        // Old GPU-only edge witness: across=0.73*r at q.along=0.
        const across = 0.73 * g.R;
        const witness = query(positive, [-sdv * across, sdu * across, 0], args[1], args[2], args[3]);
        check(witness[0] === 255, 'published pi/60 Roller visible-band witness must remain covered');
      }
    }
    rows.push({ wall, kind, seed, tn, cells, unsupported, gpuOnlySolid, negativeUnsupported, familyUnsupported });
    check(unsupported === 0, `CPU owns invisible GPU cells: ${JSON.stringify(rows.at(-1))}`);
    check(gpuOnlySolid === 0, `GPU owns visibly solid dry Roller cells: ${JSON.stringify({ ...rows.at(-1), firstGpuOnly })}`);
  }
  for (const wall of [false, true]) check(rows.some(row => row.wall === wall && row.negativeUnsupported > 0), `old-sine ${wall ? 'wall' : 'floor'} negative control must fail`);
  for (const name of Object.keys(families)) {
    if (activeFamilies[name]) check(rows.some(row => row.familyUnsupported[name] > 0 && (name !== 'drips' || row.wall)),
      `independently reverted active ${name} must expose unsupported cells`);
    else check(rows.every(row => !row.familyUnsupported[name]), `${name} is disabled in every production kind`);
  }
  check(rows.length === 124, 'six original kinds plus final-growth Roller body: real WebGL and CPU cells exercised');
  const body = bodyMaskRows(paint, nativeShader, program, query, tx, tail);
  return { renderer: gl.getParameter(gl.RENDERER), hashQueries: hashExpected.length, activeFamilies, rows,
    cells: rows.reduce((sum, row) => sum + row.cells, 0), negativeUnsupported: rows.reduce((sum, row) => sum + row.negativeUnsupported, 0),
    body, mainAtlas: mainInkAtlasRows(), volleys:mainInkVolleyGallery(), hidden: hiddenPresentationRows(), ownedRunScan: ownedRunScanRows(), localOrderMap: localOrderMapRows() };
}

function mainInkVolleyGallery() {
  const captures=globalThis.mainInkCapturedEvents||[];if(!captures.length)return [];
  const renderer=new THREE.WebGLRenderer({antialias:false}),rows=[];
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=70+Math.ceil(captures.length/2)*265;
  canvas.dataset.mainInkVolleys='';document.body.appendChild(canvas);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#101b25';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#e4f6fa';ctx.font='bold 23px sans-serif';ctx.fillText('Actual single-trigger Actor paint events / same numeric source inputs',25,33);
  ctx.font='14px sans-serif';ctx.fillText('Before: ellipse bodies. After: shared silhouette profiles. Top-down GPU framebuffer; independent panel crop per weapon.',25,56);
  try {for(let w=0;w<captures.length;w++)for(let after=0;after<2;after++) {
    const capture=captures[w],V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
    const face={origin:V(-40,0,-5),u:V(1,0,0),v:V(0,0,1),n:V(0,1,0),su:80,sv:105,wall:false,turf:true,paintable:true};
    const level={faces:[face],blocks:[{faces:[0,-1,-1,-1,-1,-1],aabbMin:V(-40,-.01,-5),aabbMax:V(40,.01,100)}],
      pointInside:()=>false,queryBlocks:(_a,_b,_c,_d,out=[])=>{out.length=0;out.push(0);return out;}};
    const paint=new PaintSystem(renderer,level,{atlasSize:1024,maxDensity:8,cell:.25});
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(const e of capture.events){
      const reach=e.R*(1+(e.stretchAmt||0));minX=Math.min(minX,e.at[0]-reach);maxX=Math.max(maxX,e.at[0]+reach);
      minZ=Math.min(minZ,e.at[2]-reach);maxZ=Math.max(maxZ,e.at[2]+reach);
      paint.splat(V(...e.at),e.R,e.team,{seed:e.seed,kind:e.kind,footprint:after?e.footprint:null,
        stretch:e.stretch?V(...e.stretch):undefined,stretchAmt:e.stretchAmt,face:e.face,instant:true});
    }
    paint.flush(0);const pixels=new Uint8Array(1024*1024*4);renderer.readRenderTargetPixels(paint.rt,0,0,1024,1024,pixels);
    const image=new ImageData(1024,1024);
    for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){const i=(y*1024+x)*4,j=((1023-y)*1024+x)*4;
      image.data[j]=52;image.data[j+1]=224;image.data[j+2]=194;image.data[j+3]=pixels[i+3];}
    const scratch=document.createElement('canvas');scratch.width=scratch.height=1024;scratch.getContext('2d').putImageData(image,0,0);
    const x=((w%2)*2+after)*300+12,y=75+Math.floor(w/2)*265;
    ctx.fillStyle='#192a36';ctx.fillRect(x,y,282,248);ctx.fillStyle='#e4f6fa';ctx.font='bold 15px sans-serif';ctx.fillText(capture.id+' / '+(after?'after':'before'),x+10,y+24);
    const a=face.atlas,span=Math.max(maxX-minX,maxZ-minZ,4)*1.06;
    const ox=(minX+maxX-span)/2,oz=(minZ+maxZ-span)/2,side=span*a.ppm;
    ctx.drawImage(scratch,a.x+a.pad+(ox+40)*a.ppm,1024-(a.y+a.pad+(oz+5)*a.ppm+side),side,side,x+35,y+31,210,210);
    check(paint.counts[0]>0,'actual single-trigger capture paints the real atlas');
    rows.push({id:capture.id,after:!!after,stamps:capture.events.length,cells:paint.counts[0]});paint.dispose();
  }}finally{renderer.dispose();}
  return rows;
}

// Real production paint quads, material/uniform uploader and framebuffer.
// Include a plain ellipse control beside the four flying bodies/contact band.
function mainInkAtlasRows() {
  const renderer=new THREE.WebGLRenderer({antialias:false}),rows=[];
  const gallery=document.createElement('canvas');gallery.width=1200;gallery.height=650;
  gallery.dataset.mainInkGallery='';document.body.appendChild(gallery);
  const ctx=gallery.getContext('2d');ctx.fillStyle='#101b25';ctx.fillRect(0,0,1200,650);
  ctx.fillStyle='#e4f6fa';ctx.font='bold 24px sans-serif';ctx.fillText('INKWAVE / actual GPU paint footprints',30,36);
  ctx.font='14px sans-serif';ctx.fillText('Existing width / depth / seed. Individual bodies; volley and drop placement stay with each weapon.',30,61);
  const names=['Ellipse control','Shooter / Dualies','Bucket body','Brush flick','Roller flick','Brush / Roller contact'];
  try {
    for(let k=0;k<6;k++) {
      const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
      const face={origin:V(-8,0,-8),u:V(1,0,0),v:V(0,0,1),n:V(0,1,0),su:16,sv:16,wall:false,turf:true,paintable:true};
      const level={faces:[face],blocks:[{faces:[0,-1,-1,-1,-1,-1],aabbMin:V(-8,-.01,-8),aabbMax:V(8,.01,8)}],
        pointInside:()=>false,queryBlocks:(_a,_b,_c,_d,out=[])=>{out.length=0;out.push(0);return out;}};
      const paint=new PaintSystem(renderer,level,{atlasSize:512,maxDensity:28,cell:.125});
      const footprint=['ink-shot','ink-slosh','ink-brush','ink-flick','ink-contact'][k-1];
      const area=paint.splat(V(),1.6,0,{kind:'source-shot',footprint,seed:.37,face:0,stretch:V(0,0,1),stretchAmt:k===5?0:1.5,instant:true});
      paint.flush(0);
      const pixels=new Uint8Array(512*512*4);renderer.readRenderTargetPixels(paint.rt,0,0,512,512,pixels);
      const image=new ImageData(512,512);
      for(let y=0;y<512;y++)for(let x=0;x<512;x++){
        const from=(y*512+x)*4,to=((511-y)*512+x)*4;
        image.data[to]=52;image.data[to+1]=224;image.data[to+2]=194;image.data[to+3]=pixels[from+3];
      }
      const scratch=document.createElement('canvas');scratch.width=scratch.height=512;scratch.getContext('2d').putImageData(image,0,0);
      const x=20+(k%3)*400,y=90+Math.floor(k/3)*280;
      ctx.fillStyle='#192a36';ctx.fillRect(x,y,380,256);ctx.fillStyle='#e4f6fa';ctx.font='bold 17px sans-serif';ctx.fillText(names[k],x+16,y+25);
      const a=face.atlas,side=9*a.ppm,inset=3.5*a.ppm;
      ctx.drawImage(scratch,a.x+a.pad+inset,512-(a.y+a.pad+inset+side),side,side,x+80,y+35,210,210);
      let solid=0,mismatches=0;
      for(let j=0;j<face.nv;j++)for(let i=0;i<face.nu;i++) {
        const gx=Math.floor(a.x+a.pad+(i+.5)*face.cu*a.ppm),gy=Math.floor(a.y+a.pad+(j+.5)*face.cv*a.ppm),at=(gy*512+gx)*4;
        if(pixels[at+3]>250){solid++;if(!paint.grid[face.grid+j*face.nu+i])mismatches++;}
      }
      check(area>0&&solid>20&&mismatches===0,'real main atlas must show only owned solid ink');
      if(k===5){
        const gx=Math.floor(a.x+a.pad+8*a.ppm),gy=Math.floor(a.y+a.pad+9.35*a.ppm);
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)check(pixels[((gy+dy)*512+gx+dx)*4+3]===0,
          'zero-width contact section must not render an unowned centerline');
      }
      rows.push({kind:k?9+k:8,area,solid,mismatches,counts:Array.from(paint.counts)});paint.dispose();
    }
  } finally {renderer.dispose();}
  return rows;
}

// PR1188: bidirectional CPU-grid / GPU-body agreement. The GPU program is the
// emitted shader in its native body-only mode (vGrow.z > 1.5, fully grown)
// with only the AA output replaced by the zero-crossing of the body SDF. Every
// gameplay cell centre inside the reach box is asked of both sides.
function bodyMaskRows(paint, nativeShader, program, query, tx, tail) {
  const bodyShader = nativeShader.replace(tx, 'float tx = 1.0 / 64.0;')
    .replace(tail, '  gl_FragColor = vec4(sd < 0.0 ? 1.0 : 0.0, abs(sd) < 1e-3 ? 1.0 : 0.0, 0.0, 1.0);');
  const gpu = program(bodyShader), rows = [];
  const sourceBoundary = 'sd = length(p) - r * grow;';
  check(bodyShader.split(sourceBoundary).length === 2, 'one dedicated sourced paint boundary');
  const genericSource = program(bodyShader.replace(sourceBoundary,
    'sd = length(p) - r * grow * wob(atan(p.y, p.x), seed);'));
  const circleMain = program(bodyShader.replace('sd = mainInkDistance(p, dir, r * grow, kind, paintSeed);', 'sd = length(p) - r * grow;'));
  const size = 32, cell = 0.25, n = size / cell;
  const face = { atlas: { x: 0, y: 0, pad: 2, ppm: 64 }, su: size, sv: size, nu: n, nv: n, cu: cell, cv: cell,
    grid: 0, wall: false, turf: true };
  const cases = [];
  for (const [kind, sa] of [[0, 0.7], [2, 0], [3, 0], [4, 0], [4, 0.32], [5, 0], [5, 0.32], [5, 0.2743], [5, 3.2]])
    for (const R of [1.62, 2.43, 3.2]) for (const seed of [0.11, 0.5, 0.93]) cases.push({ kind, sa, R, seed });
  for(const depth of [.25,.5,.8,1,1.25,2.62]) for(const seed of [.11,.5,.93]) {
    const shape=catalogPaintEllipse(2,depth);
    cases.push({kind:0,sa:shape.stretchAmt,R:shape.radius,seed,rotate:shape.rotate,depth});
  }
  // Dedicated WidthHalf masks must execute on both surface orientations, with
  // independently timed splashes, tiny drops and rotated narrow-depth shapes.
  // Retain every preexisting generic case and its bidirectional pixel checks.
  for (const wall of [false, true]) for (const kind of [8, 9])
    for (const radius of [.05, .65, 1.93, 4.024884828332687])
      for (const depth of [.25, 1, 1.31, 2.24]) for (const seed of [.11, .93]) {
        const shape = catalogPaintEllipse(radius, depth);
        cases.push({ wall, kind, sa:shape.stretchAmt, R:shape.radius, seed, rotate:shape.rotate, depth });
      }
  const wallRadii = [...new Set(Object.values(CATALOG_WALL_DROP).flatMap(r => [r.paint.PaintRadiusShock, r.paint.PaintRadiusFall]))]
    .filter(R => Number.isFinite(R) && R > 0);
  for (const R of wallRadii) for (const seed of [.11, .5, .93]) cases.push({ kind:0, sa:0, R, seed, wall:true });
  const mainStart = cases.length;
  for (const wall of [false,true]) for (const kind of [10,11,12,13,14])
    for (const radius of [.2,.65,1.93]) for (const depth of [.25,1,2.24]) for (const seed of [.11,.93])
      for (const angle of [0, Math.PI/4, 2.4]) {
        const shape=catalogPaintEllipse(radius,depth);
        cases.push({wall,kind,R:shape.radius,sa:shape.stretchAmt,seed,depth,angle});
      }
  const mainCount = cases.length - mainStart;
  // Charger has three seed-dependent legacy-style silhouettes in the formerly
  // unused rows 5-7 of the same 4 KiB profile. Exercise both surface flags,
  // charge-width endpoints and oblique bearings, with no extra shot producers.
  const chargerStart = cases.length;
  for(const wall of [false,true]) for(const kind of [15,16,17])
    for(const radius of [.78,1.56]) for(const depth of [1,3.5])
      for(const seed of [.11,.93]) for(const angle of [0,Math.PI/4]){
        const shape=catalogPaintEllipse(radius,depth);
        cases.push({wall,kind,R:shape.radius,sa:shape.stretchAmt,seed,depth,angle});
      }
  const chargerCount=cases.length-chargerStart;
  for (const { kind, sa, R, seed, rotate=false, depth=null, wall=false, angle=null } of cases) {
    face.wall = wall;
    face.turf = !wall;
    paint.grid = new Uint8Array(n * n); paint.dead = new Uint8Array(n * n); paint.counts = [0, 0];
    paint._paintOwnershipOrder = new Uint32Array(n * n);
    const sdu = angle !== null ? Math.cos(angle) : sa ? (rotate ? -.8 : .6) : 0,
      sdv = angle !== null ? Math.sin(angle) : sa ? (rotate ? .6 : .8) : 0, lu = 16, lv = 16;
    paint._cpuSplat(face, lu, lv, R, 0, seed, sdu, sdv, sa, kind);
    const points = [], index = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * cell - lu, y = (j + 0.5) * cell - lv;
      if (Math.hypot(x, y) > R * (1 + sa) * 1.6) continue;
      points.push(x, y, 0); index.push(j * n + i);
    }
    const splat = [R, 0, Math.fround(seed), 2 * kind + (wall ? 1 : 0)];
    const grow = [3,1,2,paintShapeSeed(seed)];
    const pixels = query(gpu, points, splat, grow, [sdu, sdv, sa]);
    const reverted = kind >= 8 ? query(kind >= 10 ? circleMain : genericSource, points, splat, grow, [sdu, sdv, sa]) : null;
    let negativeDifferences = 0;
    let cpu = 0, gpuCells = 0, cpuOnly = 0, gpuOnly = 0, ties = 0;
    for (let k = 0; k < index.length; k++) {
      const owned = paint.grid[index[k]] === 1, visible = pixels[k * 4] === 255, tie = pixels[k * 4 + 1] === 255;
      if (owned) cpu++; if (visible) gpuCells++;
      if (owned !== visible) { if (tie) ties++; else if (owned) cpuOnly++; else gpuOnly++; }
      if (reverted && visible !== (reverted[k * 4] === 255)) negativeDifferences++;
    }
    rows.push({ wall, kind, sa, R, seed, depth, angle, cpu, gpu: gpuCells, cpuOnly, gpuOnly, ties, negativeDifferences });
  }
  const result = { rows, cpuOnly: rows.reduce((t, r) => t + r.cpuOnly, 0), gpuOnly: rows.reduce((t, r) => t + r.gpuOnly, 0),
    ties: rows.reduce((t, r) => t + r.ties, 0), cpuCells: rows.reduce((t, r) => t + r.cpu, 0), gpuCells: rows.reduce((t, r) => t + r.gpu, 0) };
  // Only float32 ties on the SDF zero crossing (|sd| < 1e-3 WU, 1/16 texel) may disagree.
  check(result.cpuOnly === 0 && result.gpuOnly === 0, `CPU body ownership differs from the rendered body: ${JSON.stringify(rows.filter(r => r.cpuOnly || r.gpuOnly).slice(0, 4))}`);
  check(rows.length === 227 + wallRadii.length * 3 + mainCount + chargerCount
    && rows.filter(r => r.kind < 8).length === 99 + wallRadii.length * 3 && result.cpuCells > 0,
    'all original body cases, 128 sourced floor/wall cases and catalog wall-drop radii exercised');
  for (const wall of [false, true]) for (const kind of [8, 9]) {
    const sourced = rows.filter(row => row.wall === wall && row.kind === kind);
    check(sourced.length === 32 && sourced.some(row => row.cpu > 0), 'sourced mask claims actual cells');
    check(sourced.some(row => row.negativeDifferences > 0), 'reverting only sourced boundary must change GPU cells');
  }
  for(const kind of [10,11,12,13,14]) {
    const main=rows.filter(row=>row.kind===kind);
    check(main.length===108 && main.some(row=>row.cpu>0), 'main footprint CPU path exercised');
    check(main.some(row=>row.negativeDifferences>0), 'circle-only counterfactual must change main footprint');
  }
  for(const kind of [15,16,17]){
    const charger=rows.filter(row=>row.kind===kind);
    check(charger.length===32&&charger.some(row=>row.cpu>0),'Charger profile paints on both surfaces');
    check(charger.some(row=>row.negativeDifferences>0),'Charger must not regress to a plain ellipse');
  }
  return result;
}


// Exercise the real atlas framebuffer, including the composed mip path and
// snapshot replay. This is independent of the scalar mask shader probe above.
function hiddenPresentationRows() {
  const rows = [];
  const descriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  const originalRender = renderer.render.bind(renderer);
  let drawCalls = 0;
  renderer.render = (...args) => { drawCalls++; return originalRender(...args); };
  try {
    for (const wall of [false, true]) for (const rate of [30, 60, 120]) {
      const results = [];
      for (const hidden of [false, true]) {
        Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
        const V = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
        const face = { origin: wall ? V(-6,0,0) : V(-6,0,-6), u:V(1,0,0),
          v:wall?V(0,1,0):V(0,0,1), n:wall?V(0,0,-1):V(0,1,0),
          su:12,sv:12,wall,turf:!wall,paintable:true };
        const level = { faces:[face], blocks:[{faces:[0,-1,-1,-1,-1,-1], aabbMin:wall?V(-6,0,-.01):V(-6,-.01,-6), aabbMax:wall?V(6,12,.01):V(6,.01,6)}],
          pointInside:()=>false,queryBlocks:(_x0,_z0,_x1,_z1,out=[])=>{out.length=0;out.push(0);return out;} };
        const paint = new PaintSystem(renderer,level,{atlasSize:512,maxDensity:32,cell:.25});
        drawCalls=0;
        const point=wall?V(0,7,0):V(0,0,0);
        for(let tick=0;tick<rate*5;tick++) {
          if(tick===0||tick===rate/2||tick===rate) {
            const team=tick===rate/2?1:0, seq=tick===0?1:tick===rate/2?2:3;
            const p=point.clone();p.x+=seq===2?.75:seq===3?-.75:0;
            paint.splat(p,1.6,team,{seed:team?.72:.37,
              __netOrder:{clock:seq,seq,peer:'paint-probe-'+team,epoch:'visibility'}});
          }
          paint.advanceSimulation(1/rate);paint.flush(1/rate);
        }
        if(hidden)check(drawCalls===0,'hidden paint must not render atlas or regenerate mipmaps');
        Object.defineProperty(document,'hidden',{configurable:true,value:false});
        paint.flush(0);
        check(drawCalls>0,'restored paint must actually draw');
        const pixels=new Uint8Array(512*512*4);renderer.readRenderTargetPixels(paint.rt,0,0,512,512,pixels);
        const samples=[];
        for(let j=0;j<face.nv;j++)for(let i=0;i<face.nu;i++){
          const x=Math.floor(face.atlas.x+face.atlas.pad+(i+.5)*face.cu*face.atlas.ppm);
          const y=Math.floor(face.atlas.y+face.atlas.pad+(j+.5)*face.cv*face.atlas.ppm);
          const at=(y*512+x)*4,owner=paint.grid[face.grid+j*face.nu+i];
          samples.push({owner,red:pixels[at],alpha:pixels[at+3]});
        }
        results.push({samples,counts:Array.from(paint.counts),clock:paint.clock});paint.dispose();
      }
      check(JSON.stringify(results[0].counts)===JSON.stringify(results[1].counts),'hidden floor counts equal visible');
      let compared=0,mismatches=0;
      for(let i=0;i<results[0].samples.length;i++){
        const a=results[0].samples[i],b=results[1].samples[i];
        check(a.owner===b.owner,'hidden CPU owner parity');
        // Fully opaque samples exclude fractional raster/AA accumulation.
        if(a.owner&&a.alpha>250&&b.alpha>250){compared++;if((a.red>127)!==(b.red>127))mismatches++;}
      }
      check(compared>20&&mismatches===0,'restored solid GPU ownership must equal visible atlas');
      rows.push({wall,rate,compared,mismatches,counts:results[1].counts});
    }
  } finally {
    if(descriptor)Object.defineProperty(document,'hidden',descriptor);else delete document.hidden;
    renderer.dispose();
  }
  return rows;
}

function unmergedOwnerRuns(face, orderId, u0, u1, v0, v1) {
    const padM = (face.atlas.pad - 0.5) / face.atlas.ppm;
    const i0 = Math.max(0, Math.floor(Math.max(0, u0) / face.cu));
    const i1 = Math.min(face.nu - 1, Math.floor(Math.min(face.su, u1) / face.cu));
    const j0 = Math.max(0, Math.floor(Math.max(0, v0) / face.cv));
    const j1 = Math.min(face.nv - 1, Math.floor(Math.min(face.sv, v1) / face.cv));
    let scratch = this._paintOrderRunScratch, runCount = 0;
    for (let j = j0; j <= j1; j++) {
      let start = -1;
      for (let i = i0; i <= i1 + 1; i++) {
        const owns = i <= i1 && this._paintOwnershipOrder[face.grid + j * face.nu + i] === orderId;
        if (owns && start < 0) start = i;
        if ((!owns || i === i1 + 1) && start >= 0) {
          const end = owns ? i : i - 1;
          let x0 = Math.max(u0, start * face.cu), x1 = Math.min(u1, (end + 1) * face.cu);
          let y0 = Math.max(v0, j * face.cv), y1 = Math.min(v1, (j + 1) * face.cv);
          if (start === 0) x0 = Math.max(u0, -padM);
          if (end === face.nu - 1) x1 = Math.min(u1, face.su + padM);
          if (j === 0) y0 = Math.max(v0, -padM);
          if (j === face.nv - 1) y1 = Math.min(v1, face.sv + padM);
          if (x1 > x0 && y1 > y0) {
            const offset = runCount * 4;
            if (offset + 4 > scratch.length) {
              const grown = new Float64Array(Math.max(scratch.length * 2, offset + 4));
              grown.set(scratch); this._paintOrderRunScratch = scratch = grown;
            }
            scratch[offset] = x0; scratch[offset + 1] = x1;
            scratch[offset + 2] = y0; scratch[offset + 3] = y1;
            runCount++;
          }
          start = -1;
        }
      }
    }
    return runCount;
  };

function ownedRunScanRows() {
  const rows=[],renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(32,32);
  try {
    for(const wall of [false,true])for(const seed of [.03,.37,.92]){
      const results=[];
      for(const legacy of [true,false]){
        const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
        const face={origin:wall?V(-6,0,0):V(-6,0,-6),u:V(1,0,0),v:wall?V(0,1,0):V(0,0,1),n:wall?V(0,0,-1):V(0,1,0),su:12,sv:12,wall,turf:!wall,paintable:true};
        const level={faces:[face],blocks:[{faces:[0,-1,-1,-1,-1,-1],aabbMin:wall?V(-6,0,-.01):V(-6,-.01,-6),aabbMax:wall?V(6,12,.01):V(6,.01,6)}],pointInside:()=>false,queryBlocks:(_a,_b,_c,_d,out=[])=>{out.length=0;out.push(0);return out;}};
        const paint=new PaintSystem(renderer,level,{atlasSize:512,maxDensity:32,cell:.25});if(legacy)paint._paintOrderRuns=unmergedOwnerRuns;
        let quads=0,tickIndex=0;const drawRectangles=[];const push=paint._pushQuad;paint._pushQuad=function(...args){quads++;drawRectangles.push({tick:tickIndex,values:args.slice(1)});return push.apply(this,args)};
        for(let tick=0;tick<90;tick++){tickIndex=tick;
          if([0,9,18].includes(tick)){
            const seq=tick/9+1,team=seq===2?1:0,pos=wall?V((seq-2)*.65,7,0):V((seq-2)*.65,0,0);
            paint.splat(pos,1.6,team,{seed,kind:seed===.03?'line':seed===.92?'roll':'shot',stretch:wall?V(.6,.8,0):V(.6,0,.8),stretchAmt:1.2,__netOrder:{clock:seq,seq,peer:'run-merge-'+team,epoch:'run-merge'}});
          }
          paint.advanceSimulation(1/60);paint.flush(1/60);
        }
        const pixels=new Uint8Array(512*512*4);renderer.readRenderTargetPixels(paint.rt,0,0,512,512,pixels);
        results.push({pixels,quads,drawRectangles,grid:Array.from(paint.grid),owners:Array.from(paint._paintOwnershipOrder),counts:Array.from(paint.counts)});paint.dispose();
      }
      const [before,after]=results;check(JSON.stringify(before.grid)===JSON.stringify(after.grid),'run scan changed gameplay grid');check(JSON.stringify(before.owners)===JSON.stringify(after.owners),'run scan changed event ownership');check(JSON.stringify(before.counts)===JSON.stringify(after.counts),'run scan changed turf counts');
      let mismatch=0,maxDifference=0,alphaMismatch=0,solidAlphaChanges=0;const channelMismatches=[0,0,0,0],examples=[];
      for(let i=0;i<before.pixels.length;i++)if(before.pixels[i]!==after.pixels[i]){mismatch++;channelMismatches[i%4]++;const d=Math.abs(before.pixels[i]-after.pixels[i]);maxDifference=Math.max(maxDifference,d);if(i%4===3){alphaMismatch++;if((before.pixels[i]>127)!==(after.pixels[i]>127))solidAlphaChanges++;}if(examples.length<16)examples.push({x:Math.floor(i/4)%512,y:Math.floor(i/2048),channel:i%4,before:before.pixels[i],after:after.pixels[i]});}
      if(mismatch){
        const encode=bytes=>{let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(raw);};
        globalThis.paintMaskDiagnostic={wall,seed,mismatch,maxDifference,alphaMismatch,solidAlphaChanges,channelMismatches,examples,beforeQuads:before.quads,afterQuads:after.quads,beforeDrawRectangles:before.drawRectangles,afterDrawRectangles:after.drawRectangles,pixels:{width:512,height:512,format:'RGBA8',before:encode(before.pixels),after:encode(after.pixels)}};
      }
      check(mismatch===0,'run scan changed actual GPU atlas bytes: '+JSON.stringify({wall,seed,mismatch}));check(after.quads===before.quads,'run scan changed native submissions');check(JSON.stringify(after.drawRectangles)===JSON.stringify(before.drawRectangles),'run scan changed exact ordered quad inputs');
      rows.push({wall,seed,beforeQuads:before.quads,afterQuads:after.quads,mismatch});
    }
  } finally {renderer.dispose();}
  return rows;
}


function localOrderMapRows() {
  const p=Object.create(PaintSystem.prototype);p.grid=new Uint8Array(64);
  const network={clock:9,peer:'order-map-browser',seq:1,epoch:'probe'};
  const first=p._paintOrderId(network), local=[];
  for(let n=0;n<10000;n++)local.push(p._paintOrderId());
  check(p._paintOrderId(network)===first,'network duplicate identity survives local allocations');
  check(p._paintOrderIds.size===1,'only network dedupe key is retained');
  check(p._paintOrderRecords.length===10002,'local order records remain available');
  check(new Set(local).size===10000,'local IDs remain distinct');
  check(p._paintOrderComesAfter(local[9999],local[0]),'local chronology remains intact');
  const result={localIds:local.length,networkKeys:p._paintOrderIds.size,records:p._paintOrderRecords.length};
  p._clearPaintOwnership();
  check(p._paintOrderIds.size===0&&p._paintOrderRecords.length===1,'clear releases both order stores');
  check(p._paintOrderId(network)===1,'new match restarts network identity');
  check(p._paintOrderId()===2&&p._paintOrderIds.size===1,'new local identity remains outside dedupe map');
  return {...result,clear:true};
}
