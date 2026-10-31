#!/usr/bin/env node
// Real WebGL2 comparison of the exact pre/post composition shader text.
// This isolates the changed arithmetic; it is not a hardware FPS benchmark.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { adaptFxShaderStability } from '../patches/local-quality/fx-shader-stability-adapter.mjs';

const [snapshotPath, outputPath] = process.argv.slice(2);
if (!snapshotPath || !outputPath) throw Error('Usage: node scripts/verify-fx-shader-stability.mjs <before.json[.gz]> <receipt.json>');
const bytes = fs.readFileSync(snapshotPath);
const before = JSON.parse(snapshotPath.endsWith('.gz') ? zlib.gunzipSync(bytes) : bytes);
function chunk(source, name) {
  const match = new RegExp('const ' + name + ' =[^`]*`').exec(source);
  assert.ok(match, name);
  const first = match.index + match[0].length, end = source.indexOf('`;', first);
  assert.ok(end > first, name);
  return source.slice(first, end).replace(/\$\{([^}]+)\}/g, (_, key) => key === 'OUT_CHUNKS' ? '' : chunk(source, key));
}
const pairs = [
  ['src/fx/fx.js', 'PUFF_FRAG', 'puff'],
  ['src/fx/fx.js', 'GLOW_FRAG', 'glow'],
  ['src/fx/fx.js', 'RING_FRAG', 'ring'],
  ['src/fx/fx.js', 'BEAM_FRAG', 'beam'],
  ['src/fx/screenfx.js', 'FRAG', 'screen'],
].map(([rel, name, type]) => ({ type, before: chunk(before[rel], name), after: chunk(adaptFxShaderStability(rel, before[rel]), name) }));

const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  const result = await page.evaluate(pairs => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw Error('WebGL2 required');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const receipt = { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), width: 128, height: 128, runs: [] };
    const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    const pixels = new Uint8Array(128 * 128 * 4);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const o = (y * 128 + x) * 4; pixels[o] = (x * 7 + y * 3) % 256;
      pixels[o + 1] = (x * 5 + y * 11) % 256; pixels[o + 2] = 127; pixels[o + 3] = 255;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 128, 128, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const vertex = `#version 300 es
      precision highp float;uniform float fixtureMode,fixtureAge,fixtureScale;uniform vec4 fixtureMisc;
      out vec2 vUv;out vec4 vCol,vMisc;out float vT,vH;out vec3 vN,vW;
      void main(){vec2 p=gl_VertexID==0?vec2(-1.,-1.):gl_VertexID==1?vec2(3.,-1.):vec2(-1.,3.);
        gl_Position=vec4(p,0.,1.);vec2 uv=p*.5+.5;vUv=fixtureMode<.5?p*fixtureScale:uv;
        vCol=vec4(.23,.57,.83,.87);vMisc=fixtureMisc;vT=fixtureAge;vH=uv.y;
        float angle=uv.x*6.2831853;vN=vec3(cos(angle),0.,sin(angle));vW=vec3(p.x,uv.y*3.,p.y);}`;
    function shader(type, text) {
      const object = gl.createShader(type); gl.shaderSource(object, text); gl.compileShader(object);
      if (!gl.getShaderParameter(object, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(object));
      return object;
    }
    function program(source) {
      source = source.replace(/#include\s*<[^>]+>/g, '').replaceAll('texture2D(', 'texture(').replaceAll('varying ', 'in ').replaceAll('gl_FragColor', 'outputColor');
      const fragment = '#version 300 es\nprecision highp float;precision highp int;\n#define TAPS 4\nuniform vec3 cameraPosition;out vec4 outputColor;\n' + source;
      const p = gl.createProgram(), vs = shader(gl.VERTEX_SHADER, vertex), fs = shader(gl.FRAGMENT_SHADER, fragment);
      gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
      gl.deleteShader(vs); gl.deleteShader(fs);
      const uniforms = [];
      for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
        const u = gl.getActiveUniform(p, i); uniforms.push({ name: u.name, type: u.type, size: u.size, location: gl.getUniformLocation(p, u.name) });
      }
      return { p, uniforms };
    }
    function draw(program, fixture) {
      gl.useProgram(program.p);
      for (const u of program.uniforms) {
        let v = fixture[u.name];
        if (v === undefined) v = u.type === gl.FLOAT ? 0 : u.type === gl.SAMPLER_2D || u.type === gl.INT ? 0 :
          Array(u.size * ({ [gl.FLOAT_VEC2]: 2, [gl.FLOAT_VEC3]: 3, [gl.FLOAT_VEC4]: 4 }[u.type] || 1)).fill(0);
        if (u.type === gl.FLOAT) gl.uniform1fv(u.location, Array.isArray(v) ? v : [v]);
        else if (u.type === gl.INT || u.type === gl.SAMPLER_2D) gl.uniform1iv(u.location, Array.isArray(v) ? v : [v]);
        else if (u.type === gl.FLOAT_VEC2) gl.uniform2fv(u.location, v);
        else if (u.type === gl.FLOAT_VEC3) gl.uniform3fv(u.location, v);
        else if (u.type === gl.FLOAT_VEC4) gl.uniform4fv(u.location, v);
      }
      gl.clearColor(0.07, 0.09, 0.11, 0.13); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3);
      const image = new Uint8Array(128 * 128 * 4); gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, image); return image;
    }
    const base = { fixtureMode: 0, fixtureAge: .31, fixtureScale: 1, fixtureMisc: [.271, .317, .31, 0],
      uTime: 1.75, uRes: [128, 128], uAspect: 1, cameraPosition: [1, 3, 5], uSat: 1,
      uPunchPos: [.5, .5], uBlastPos: [.4, .6], uSpeedTint: [.2, .6, .9] };
    for (const pair of pairs) {
      const old = program(pair.before), next = program(pair.after), cases = [];
      if (pair.type === 'puff') for (const kind of [0, .5, 1, 1.5, 2, 2.5, 3, 3.5, 4]) for (const age of [0, .31, .8, .99])
        cases.push({ ...base, fixtureMisc: [.271, .317, age, kind] });
      if (pair.type === 'glow') for (const kind of [0, 10, 20, 30]) for (const core of [.1, .5, 1])
        cases.push({ ...base, fixtureMisc: [.271, .317, .31, kind + core] });
      if (pair.type === 'ring') for (const kind of [0, .5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7]) for (const age of [0, .31, .8, .99])
        cases.push({ ...base, fixtureAge: age, fixtureMisc: [.271, kind, .8, .1] });
      if (pair.type === 'beam') for (const kind of [0, 1]) for (const age of [0, .31, .8, .99])
        cases.push({ ...base, fixtureAge: age, fixtureMisc: [.271, 3, .317, kind] });
      if (pair.type === 'screen') for (const aspect of [1, 4 / 3, 16 / 9]) for (const time of [0, .5, 3]) for (const effect of ['idle', 'speed', 'aura', 'edge', 'flood']) {
        const f = { ...base, fixtureMode: 1, uAspect: aspect, uTime: time };
        if (effect === 'speed') f.uSpeed = .5;
        if (effect === 'aura') f.uAura = [.2, .3, .8, .6];
        if (effect === 'edge') f.uEdgeInk = [.3, .2, .8, .8];
        if (effect === 'flood') { f.uFlood = [.3, .5, .8, .7]; f.uFloodDrip = .5; f.uHole = .35; f.uHoleRim = [.4, .7, .9]; }
        cases.push(f);
      }
      let channels = 0, different = 0, maxDifference = 0, changedPixels = 0, totalAbsoluteDifference = 0;
      for (const f of cases) {
        const a = draw(old, f), b = draw(next, f);
        for (let i = 0; i < a.length; i += 4) {
          let pixelChanged = false;
          for (let c = 0; c < 4; c++) { const d = Math.abs(a[i + c] - b[i + c]); channels++; totalAbsoluteDifference += d;
            if (d) { different++; pixelChanged = true; } maxDifference = Math.max(maxDifference, d); }
          if (pixelChanged) changedPixels++;
        }
      }
      receipt.runs.push({ type: pair.type, cases: cases.length, channels, differingChannels: different, changedPixels, maxByteDifference: maxDifference, meanByteDifference: totalAbsoluteDifference / channels });
      gl.deleteProgram(old.p); gl.deleteProgram(next.p);
    }
    receipt.glError = gl.getError(); return receipt;
  }, pairs);
  result.browser = browser.version();
  result.beforeSnapshotSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  result.scope = 'Composed fragment shaders in a deterministic standalone WebGL2 fixture. No iPad FPS or Nintendo hardware equivalence claim.';
  fs.mkdirSync(path.dirname(outputPath), { recursive: true }); fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  assert.equal(result.glError, 0);
  for (const run of result.runs) assert.ok(run.maxByteDifference <= 1, run.type + ' exceeds a one-byte arithmetic rounding difference');
} finally { await browser.close(); }
