// Narrow #1165 readback: real production-composed PaintSystem, synthetic flat face.
// No full game, original stage assets, Switch parity or hardware performance claim.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptBuildSource } from '../../scripts/inkwave-source-composition.mjs';
const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs'));
const served = new Map();
const server = http.createServer((req, res) => {
  try {
    const rel = decodeURIComponent(new URL(req.url, 'http://local').pathname).slice(1);
    if (!rel) { res.setHeader('content-type', 'text/html'); res.end('<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>'); return; }
    const base = rel.startsWith('patches/') ? root : path.join(root, 'inkwave-public');
    const file = path.resolve(base, rel);
    assert.ok(file.startsWith(base + path.sep));
    const raw = fs.readFileSync(file);
    if (/\.(m?js)$/.test(rel)) {
      const code = base === root ? raw.toString() : adaptBuildSource(rel, raw.toString());
      served.set(rel, createHash('sha256').update(code).digest('hex'));
      res.setHeader('content-type', 'text/javascript'); res.end(code);
    } else { res.end(raw); }
  } catch (e) { console.error('serve',req.url,String(e)); res.writeHead(404); res.end(String(e)); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const proof = await page.evaluate(async () => {
    const T = await import('three'), { PaintSystem } = await import('/src/world/paint.js'), { G } = await import('/src/core/ctx.js');
    G.netm = null; G.settings = { quality: 'low' }; G.actors = [];
    const v = (x, y, z) => new T.Vector3(x, y, z), renderer = new T.WebGLRenderer();
    const face = { paintable: true, turf: true, origin: v(0,0,0), u: v(1,0,0), v: v(0,0,1), n: v(0,1,0), su: 8, sv: 8, block: 0, wall: false };
    const level = { faces: [face], blocks: [{ aabbMin:v(0,-1,0), aabbMax:v(8,1,8), faces:[0,-1,-1,-1,-1,-1] }], pointInside:()=>false, queryBlocks:()=>[0] };
    const paint = new PaintSystem(renderer, level, { atlasSize:1024, maxDensity:120, cell:.25 }); G.paint = paint;
    const pixel = new Uint8Array(4), stats = { cases:0, cells:0, aaCells:0, coreMismatches:0, inside:0, outside:0, coverageChecks:0, glErrors:[] };
    const tooth = x => 1 - 4 * Math.abs(x - Math.floor(x) - .5);
    try {
      for (const r of [.3,.62,1]) for (const seed of [0,Math.PI/60,.1,.5,.99]) for (const angle of [0,.3,1.3,2.8]) for (const team of [0,1]) {
        paint.clear();
        paint.splat(v(4,0,4),100,1-team,{seed:0,kind:'shot',instant:true}); paint.flush(1/60);
        const x=3.125,z=3.125-.73*r,dx=Math.cos(angle),dz=Math.sin(angle);
        paint.splat(v(x,0,z),r,team,{seed,kind:'roll',stretch:v(dx,0,dz),instant:true}); paint.flush(1/60);
        const maxGradient=1+.08*4*2.1+.04*4*5.3;
        const aaWidth=(1.5*Math.SQRT2+Math.SQRT1_2)*maxGradient/face.atlas.ppm;
        for (let j=7;j<20;j++) for(let i=7;i<20;i++) {
          const u=(i+.5)*face.cu,w=(j+.5)*face.cv,px=u-x,py=w-z;
          const along=px*dx+py*dz,across=-px*dz+py*dx;
          const wob=r*(.08*tooth(along/r*2.1+seed*4.7+.25)+.04*tooth(along/r*5.3+seed*2.3+.25));
          const a=Math.abs(along)-r*.55,b=Math.abs(across)-r*.62-wob;
          const sd=Math.hypot(Math.max(a,0),Math.max(b,0))+Math.min(Math.max(a,b),0)-r*.1;
          const ax=Math.floor(face.atlas.x+face.atlas.pad+u*face.atlas.ppm),ay=Math.floor(face.atlas.y+face.atlas.pad+w*face.atlas.ppm);
          renderer.readRenderTargetPixels(paint.rt,ax,ay,1,1,pixel);
          const gpu=pixel[0]>=128?2:1,cpu=paint.sample(0,u,w); stats.cells++;
          if(sd<0) stats.inside++; else stats.outside++;
          if(Math.abs(sd)<=aaWidth) { stats.aaCells++; continue; }
          if(gpu!==cpu) { stats.coreMismatches++; throw Error('Interior CPU/GPU mismatch '+JSON.stringify({r,seed,angle,team,u,w,sd,aaWidth,gpu,cpu,pixel:[...pixel]})); }
          if(paint.sampleWorld(0,v(u,0,w))!==cpu) throw Error('sampleWorld disagrees with cell ownership');
        }
        const counts=[0,0]; for(let k=0;k<paint.grid.length;k++)if(!paint.dead[k]&&paint.grid[k])counts[paint.grid[k]-1]++;
        const cov=paint.coverage();for(let t=0;t<2;t++)if(Math.abs(cov[t]-counts[t]/paint.turfTotal)>1e-12)throw Error('Coverage diverges from CPU grid');
        stats.coverageChecks++; stats.cases++;
      }
      const gl=renderer.getContext(),error=gl.getError(); if(error!==gl.NO_ERROR)stats.glErrors.push(error);
      return stats;
    } finally { paint.dispose(); renderer.dispose(); }
  });
  assert.equal(proof.coreMismatches,0); assert.equal(proof.cases,120); assert.ok(proof.inside>0 && proof.outside>0);
  assert.deepEqual(proof.glErrors,[]); assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ scope:'Real Chromium SwiftShader WebGL atlas readback; production source adapters; synthetic flat face; instantaneous opposing-team repaint. AA-bound cells excluded from hard ownership comparisons. No full match, rate sweep, bot/Judd, Switch or physical-device evidence.', browser:await browser.version(), ...proof, errors, served:Object.fromEntries(served) },null,2));
} finally { await browser?.close(); await new Promise(r=>server.close(r)); }
