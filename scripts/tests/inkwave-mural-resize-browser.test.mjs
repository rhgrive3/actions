import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
test('mural redraw counterfactual audit preserves the production pixel-copy policy',
  { skip: !process.env.INKWAVE_CHROMIUM_PATH }, async t => {
    const { chromium } = await import(process.env.INKWAVE_PLAYWRIGHT_MODULE || 'playwright');
    const source = await fs.readFile(path.join(root, 'inkwave-public/src/world/murals.js'), 'utf8');
    assert.ok(source.includes('const shared = g.getImageData(0, 0, W, RH * ROWS);'));
    const draws = `  drawBanner(g, 0, font);
  drawChevrons(g, RH, font);
  drawShop(g, RH * 2, font);
  drawShipping(g, RH * 3, font);`;
    assert.equal(source.split(draws).length, 2);
    const candidate = source.replace(draws, '  const drawShared = () => {\n' + draws + '\n  };\n  drawShared();')
      .replace('      const shared = g.getImageData(0, 0, W, RH * ROWS);\n', '')
      .replace('      g.putImageData(shared, 0, 0);', '      drawShared();');
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<script type="importmap">{"imports":{"three":"/inkwave-public/vendor/three/build/three.module.js"}}</script>'); return; }
        if (url.pathname === '/inkwave-public/src/world/mural-candidate.js') { res.setHeader('content-type', 'text/javascript'); res.end(candidate); return; }
        const pathname = decodeURIComponent(url.pathname).replace(/^\/inkwave-public\/patches\//, '/patches/');
        const file = path.resolve(root, '.' + pathname);
        if (!file.startsWith(root)) throw Error('outside root');
        res.setHeader('content-type', (/\.m?js$/.test(file)) ? 'text/javascript' : file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream');
        res.end(await fs.readFile(file));
      } catch { res.statusCode = 404; res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const browser = await chromium.launch({ executablePath: process.env.INKWAVE_CHROMIUM_PATH, headless: true,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    t.after(() => browser.close());
    const page = await browser.newPage({ deviceScaleFactor: 2 });
    await page.goto('http://127.0.0.1:' + server.address().port);
    const receipt = await page.evaluate(async () => {
      for (const [name, file, weight] of [['Titan One', 'TitanOne-latin.woff2', '400'], ['Rubik', 'Rubik-latin.woff2', '100 900']]) {
        const face = new FontFace(name, 'url(/inkwave-public/assets/fonts/' + file + ')', { weight });
        document.fonts.add(await face.load());
      }
      const [{ createMuralTexture: before }, { createMuralTexture: after }, { STAGES }] = await Promise.all([
        import('/inkwave-public/src/world/murals.js'), import('/inkwave-public/src/world/mural-candidate.js'), import('/inkwave-public/src/world/stages/index.js')]);
      const textures = [await before('tidewater'), await after('tidewater')];
      const read = CanvasRenderingContext2D.prototype.getImageData;
      const counts = [0, 0], durations = [[], []], disposals = [0, 0];
      textures.forEach((texture, i) => texture.addEventListener('dispose', () => disposals[i]++));
      CanvasRenderingContext2D.prototype.getImageData = function (...args) {
        textures.forEach((texture, i) => { if (this.canvas === texture.image) counts[i]++; });
        return read.apply(this, args);
      };
      const stages = ['tidewater', 'halyard', 'tidewater', ...Object.keys(STAGES).filter(key => STAGES[key].drawMurals).flatMap(key => [key, 'tidewater']),
        ...Array.from({ length: 20 }, () => ['halyard', 'tidewater']).flat()];
      let bytes = 0, firstMismatch = null, mismatchingFrames = 0;
      for (const stage of stages) {
        for (let i = 0; i < 2; i++) {
          const begin = performance.now(); textures[i].userData.setStage(stage); durations[i].push(performance.now() - begin);
        }
        if (JSON.stringify(textures[0].userData.murals) !== JSON.stringify(textures[1].userData.murals)) throw Error('placement mismatch ' + stage);
        if (textures[0].image.height !== textures[1].image.height) throw Error('dimension mismatch ' + stage);
        const pixels = textures.map(texture => read.call(texture.image.getContext('2d'), 0, 0, texture.image.width, texture.image.height).data);
        for (let i = 0; i < pixels[0].length; i++) if (pixels[0][i] !== pixels[1][i]) {
          firstMismatch ||= { stage, byte: i, before: pixels[0][i], after: pixels[1][i] }; mismatchingFrames++; break;
        }
        bytes += pixels[0].length;
      }
      CanvasRenderingContext2D.prototype.getImageData = read;
      textures.forEach(texture => texture.dispose());
      return { browser: navigator.userAgent, stages: stages.length, bytes, counts, disposals, firstMismatch, mismatchingFrames,
        meanSetStageMs: durations.map(values => values.reduce((a, b) => a + b, 0) / values.length) };
    });
    assert.ok(receipt.counts[0] >= 40); assert.equal(receipt.counts[1], 0);
    assert.deepEqual(receipt.disposals[1], receipt.disposals[0]);
    assert.ok(receipt.firstMismatch, 'this Chromium run demonstrates why unconditional redraw is rejected');
    t.diagnostic(JSON.stringify(receipt));
  });
