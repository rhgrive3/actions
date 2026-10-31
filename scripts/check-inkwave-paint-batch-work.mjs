#!/usr/bin/env node
// Exploratory full native match comparison. Candidate is served only to the
// trial context. All timings are intentionally excluded: observers hash every
// actor's skeleton and muzzle each tick and count exact ground-query repeats.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const site = path.resolve(process.argv[2] || "_site"),
  out = path.resolve(
    process.argv[3] || ".ci-scratch/profile/match-candidate.json",
  ),
  frames = Number(process.argv[4] || 600),
  diagnose = false,
  trialOnly = process.argv.includes("--trial-only"),
  rel = "src/world/paint.js";
assert(Number.isInteger(frames) && frames >= 1 && frames <= 3600);
const sha = (x) => createHash("sha256").update(x).digest("hex");
const baseline=fs.readFileSync(path.join(site,rel),'utf8');
const trial=fs.readFileSync(process.env.INKWAVE_PAINT_EXPERIMENT||'/workspace/scratch/paint-direct-candidate.js','utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
assert.equal(sha(baseline),manifest.artifacts[rel]);
const mime = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".html": "text/html",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
};
const server = http.createServer((req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, "http://local").pathname),
      file = path.resolve(site, "." + (p === "/" ? "/index.html" : p));
    if (!file.startsWith(site + path.sep) || !fs.statSync(file).isFile())
      throw Error();
    res.writeHead(200, {
      "content-type": mime[path.extname(file)] || "application/octet-stream",
    });
    fs.createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
async function run(side) {
  const context = await browser.newContext({
    viewport: { width: 480, height: 320 },
    serviceWorkers: "block",
  });
  const page = await context.newPage(),
    errors = [];
  let intercepted = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/" + rel, async (route) => {
    intercepted++;
    await route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: side === "trial" ? trial : baseline,
    });
  });
  try {
    await page.addInitScript(() => {
      localStorage.setItem(
        "inkwave.settings",
        JSON.stringify({
          quality: "low",
          shadows: false,
          bloom: false,
          musicVolume: 0,
          audioVolume: 0,
        }),
      );
      let s = 987654321;
      Math.random = () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
      };
    });
    await page.goto(
      "http://127.0.0.1:" + server.address().port + "/?skipTitle",
      { waitUntil: "domcontentloaded" },
    );
    await page.waitForFunction(() => window.__G?.mode === "menu", null, {
      timeout: 300000,
    });
    console.log(side + " menu ready");
    const result = await page.evaluate(
      async ({ frames, diagnose }) => {
        const g = window.__inkwave,
          G = window.__G;
        let s = 13579;
        Math.random = () => {
          s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
          return s / 4294967296;
        };
        const M = Object.getPrototypeOf(G.match),
          setup = M?.setup;
        if (setup)
          M.setup = function (...args) {
            s = 11223;
            return setup.apply(this, args);
          };
        g.debug.freeze();
        G.time = 0;
        g.s3Clock?.reset();
        g.menus.wipe.cancel();
        await g.startMatch({
          mapId: "scorch",
          mode: "turf",
          duration: 180,
          difficulty: "normal",
        });
        g._skipRender = true;
        await Promise.all(
          G.actors.map((a) => a.character?._sourceMotionLoader),
        );
        await Promise.all(
          G.actors.map((a) => a.character?.sourceMotion?.ready),
        );
        s = 24680;
        for (const a of G.actors) {
          const b = a.bot;
          if (!b) continue;
          b.sweep = Math.random() * 10;
          b.strafe = Math.random() < 0.5 ? 1 : -1;
          b.bombCd = 3 + Math.random() * 4;
          b.think = Math.random() * 0.2;
          b.chargeRelease = 0.95 + Math.random() * 0.05;
          b.ph1 = Math.random() * 20;
          b.ph2 = Math.random() * 20;
          b.t = Math.random() * 10;
          b.dodgeCd = 1 + Math.random() * 2;
        }
        for (let i = 0, n = (g.match.turfIntroFrames ?? 253) + 47; i < n; i++)
          g._frame(1 / 60);
        g.input.mouse.left = true;
        for (let i = 0; i < 3; i++) g._frame(1 / 60);
        g.input.mouse.left = false;
        for (let i = 0; i < 300; i++) g._frame(1 / 60);
        const repetition = {
          samples: 0,
          animated: 0,
          comparable: 0,
          repeated: 0,
          uniquePairs: 0,
          byClip: {},
        };
        if (diagnose) {
          const banks = new Set(),
            lastByOutput = new WeakMap();
          for (const a of G.actors) {
            const bank = a.character?.sourceMotion?.bank;
            if (!bank || banks.has(bank)) continue;
            banks.add(bank);
            const sample = bank.sample;
            bank.sample = function (...args) {
              const result = sample.apply(this, args),
                clip =
                  typeof args[0] === "string"
                    ? this.clips.get(args[0])
                    : args[0],
                output = args[2],
                fixed = this.layouts.get(clip)?.fixed;
              if (!clip || !output || !fixed) return result;
              repetition.samples++;
              const mode = clip.rotationMode,
                width = mode === "quaternion" ? 4 : 3,
                n = this.bones.length;
              let byClip = lastByOutput.get(output);
              if (!byClip) {
                byClip = new Map();
                lastByOutput.set(output, byClip);
              }
              let cache = byClip.get(clip);
              if (!cache) {
                cache = {
                  values: new Float64Array(n * width),
                  valid: new Uint8Array(n),
                };
                byClip.set(clip, cache);
                repetition.uniquePairs++;
              }
              const row =
                repetition.byClip[clip.name] ||
                (repetition.byClip[clip.name] = {
                  animated: 0,
                  comparable: 0,
                  repeated: 0,
                });
              for (let i = 0; i < n; i++) {
                if (fixed[i]) continue;
                repetition.animated++;
                row.animated++;
                let equal = !!cache.valid[i];
                for (let j = 0; j < width; j++)
                  if (
                    !Object.is(
                      cache.values[i * width + j],
                      output.raw[i * 10 + 6 + j],
                    )
                  )
                    equal = false;
                if (cache.valid[i]) {
                  repetition.comparable++;
                  row.comparable++;
                  if (equal) {
                    repetition.repeated++;
                    row.repeated++;
                  }
                }
                for (let j = 0; j < width; j++)
                  cache.values[i * width + j] = output.raw[i * 10 + 6 + j];
                cache.valid[i] = 1;
              }
              return result;
            };
          }
        }
        const memoHitsBefore = G.actors.reduce(
            (v, a) => v + (a.character._oobGroundMemoHits || 0),
            0,
          ),
          budgetBefore = G.actors.map((a) => a.character._oobBudgetTicks || 0),
          renderFrameBefore = G.renderer.info.render.frame;
        const balanceStats = { calls: 0, mixedCenter: 0, transition: 0 };
        const balanceOwners = new WeakMap();
        for (const actor of G.actors) {
          const motion = actor.character.sourceMotion;
          if (motion?.bodyBalance) balanceOwners.set(motion.bodyBalance, motion);
        }
        const balanceProto = Object.getPrototypeOf(G.actors[0].character.sourceMotion.bodyBalance);
        const originalApply = balanceProto.apply;
        balanceProto.apply = function (...args) {
          balanceStats.calls++;
          if (!this._soleCenter) balanceStats.mixedCenter++;
          const owner = balanceOwners.get(this);
          if (owner && owner.transitionTime / Math.max(1e-6, owner.s3StateBlendSeconds) < 1)
            balanceStats.transition++;
          return originalApply.apply(this, args);
        };
        let seen = null;
        const memoScan = {calls:0, hits:0, comparisonsForward:0, comparisonsReverse:0, byLength:{}, byHitIndex:{}};
        const stats = { calls: 0, repeated: 0, updates: 0, maxPerUpdate: 0 },
          cp = Object.getPrototypeOf(G.actors[0].character),
          update = cp.update,
          ground = cp._ground;
        cp.update = function (...args) {
          const prev = seen;
          seen = new Map();
          stats.updates++;
          try {
            return update.apply(this, args);
          } finally {
            stats.maxPerUpdate = Math.max(stats.maxPerUpdate, seen.size);
            seen = prev;
          }
        };
        cp._ground = function (x, z, ...args) {
          if (diagnose) {
            const memo = this._oobGroundMemoActive && this._oobGroundMemo;
            if (memo) {
              const length=memo.length,y=this.root.position.y,phys=this.phys;
              let first=-1,last=-1;
              for(let i=0;i<length;i++){const h=memo[i];if(h.x===x&&h.z===z&&h.y===y&&h.phys===phys){if(first<0)first=i;last=i;}}
              memoScan.calls++;memoScan.byLength[length]=(memoScan.byLength[length]||0)+1;
              memoScan.comparisonsForward+=first<0?length:first+1;
              memoScan.comparisonsReverse+=last<0?length:length-last;
              if(first>=0){memoScan.hits++;memoScan.byHitIndex[first]=(memoScan.byHitIndex[first]||0)+1;}
            }
          }
          if (
            seen &&
            Number.isFinite(x) &&
            Number.isFinite(z) &&
            Number.isFinite(this.root.position.y)
          ) {
            const key = [x, z, this.root.position.y]
              .map((v) => (Object.is(v, -0) ? "-0" : String(v)))
              .join("/");
            stats.calls++;
            if (seen.has(key)) stats.repeated++;
            else seen.set(key, true);
          }
          return ground.call(this, x, z, ...args);
        };
        const f = new Float64Array(1),
          u = new Uint32Array(f.buffer),
          mix = (h, n) => Math.imul(h ^ n, 16777619) >>> 0,
          num = (h, v) => {
            f[0] = +v;
            return mix(mix(h, u[0]), u[1]);
          },
          hashArray = (h, values) => {
            for (const v of values) h = num(h, v);
            return h;
          };
        const muzzle = new G.actors[0].pos.constructor();
        const state = () => {
          let game = 2166136261,
            pose = 2166136261;
          for (const a of G.actors) {
            game = hashArray(game, [
              a.pos.x,
              a.pos.y,
              a.pos.z,
              a.vel.x,
              a.vel.y,
              a.vel.z,
              a.hp,
              a.ink,
              a.alive ? 1 : 0,
              a.grounded ? 1 : 0,
              a.yaw ?? 0,
              a.special ?? 0,
              a.stats?.turf ?? 0,
            ]);
            game = mix(game, (a.form || "").length);
            for (const b of a.character.boneList || [])
              pose = hashArray(pose, [
                b.position.x,
                b.position.y,
                b.position.z,
                b.quaternion.x,
                b.quaternion.y,
                b.quaternion.z,
                b.quaternion.w,
                b.scale.x,
                b.scale.y,
                b.scale.z,
              ]);
            a.character.getMuzzle(muzzle);
            pose = hashArray(pose, [muzzle.x, muzzle.y, muzzle.z]);
          }
          const P = G.paint;
          game = hashArray(game, [...P.counts, P.version, P.growing.length]);
          return [game, pose];
        };
        const cellHash = (a) => {
          let h = 2166136261;
          for (let i = 0; i < (a?.length || 0); i++) h = mix(h, a[i]);
          return h;
        };
        const seq = [], atlasSamples = [];
        const transferStats={atlasRenders:0,uploads:0,bytes:0};
        const renderer=G.renderer,gl=renderer.getContext(),oldRender=renderer.render,oldSubData=gl.bufferSubData;
        renderer.render=function(scene,...args){if(scene===G.paint.scene)transferStats.atlasRenders++;return oldRender.call(this,scene,...args);};
        gl.bufferSubData=function(...args){if(renderer.getRenderTarget()===G.paint.rt){const data=args[2],unit=data?.BYTES_PER_ELEMENT||1,offset=args[3]||0,length=args[4];transferStats.uploads++;transferStats.bytes+=(length||Math.max(0,(data?.byteLength||0)/unit-offset))*unit;}return oldSubData.apply(this,args);};
        async function hashAtlas(frame){const size=G.paint.size,pixels=new Uint8Array(size*size*4);G.renderer.readRenderTargetPixels(G.paint.rt,0,0,size,size,pixels);const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))].map(x=>x.toString(16).padStart(2,'0')).join('');atlasSamples.push({frame,hash,glError:G.renderer.getContext().getError()});}
        g.debug.key("KeyW", true);
        g.debug.fire(true);
        for (let i = 0; i < frames; i++) {
          g.rig.yaw += 0.6 / 30;
          g.debug.key("Space", i % 60 === 0);
          g._frame(1 / 30);
          seq.push(state());
          if((i+1)%60===0)await hashAtlas(i+1);
        }
        g.debug.key("KeyW", false);
        g.debug.fire(false);
        renderer.render=oldRender;gl.bufferSubData=oldSubData;
        const atlasSize=G.paint.size, pixels=new Uint8Array(atlasSize*atlasSize*4);
        G.renderer.readRenderTargetPixels(G.paint.rt,0,0,atlasSize,atlasSize,pixels);
        const atlasHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))].map(x=>x.toString(16).padStart(2,'0')).join('');
        const atlasGlError=G.renderer.getContext().getError();
        return {
          atlasSize,atlasHash,atlasGlError,packedPaint:!!(G.paint._iwPackedPaint||G.paint._iwSafeExperiment||G.paint._iwBatchExperiment),paintExperimentStats:G.paint._iwSafeExperiment?structuredClone(G.paint._iwSafeExperiment.stats):G.paint._iwBatchExperiment?structuredClone(G.paint._iwBatchExperiment.stats):null,
          stage: G.level.manifest?.id,
          native: G.level.native,
          actors: G.actors.length,
          bots: G.actors.filter((a) => a.bot).length,
          roster: G.actors.map((a) => a.weapon?.id),
          ticks: g.s3Clock.ticks,
          seq,atlasSamples,transferStats,
          grid: cellHash(G.paint.grid),
          order: cellHash(G.paint._paintOwnershipOrder),
          counts: [...G.paint.counts],
          stats,
          balanceStats,
          memoScan,
          memoHits:
            G.actors.reduce(
              (v, a) => v + (a.character._oobGroundMemoHits || 0),
              0,
            ) - memoHitsBefore,
          repetition,
          renderFrameBefore,
          renderFrameAfter: G.renderer.info.render.frame,
          budgetTicks: G.actors.map(
            (a, i) => (a.character._oobBudgetTicks || 0) - budgetBefore[i],
          ),
          lastDrawFrames: G.actors.map((a) => a.character._camFrame ?? null),
        };
      },
      { frames, diagnose },
    );
    return { ...result, side, intercepted, errors };
  } finally {
    await context.close();
  }
}
try {
  if (diagnose || trialOnly) {
    const result = await run(trialOnly ? "trial" : "base");
    const report = {
      browser: browser.version(),
      frames,
      baselineSha256: sha(baseline),
      trialSha256: sha(trial),
      module: rel,
      result,
      scope: trialOnly
        ? "One trial run for comparison to an existing A/A receipt. Instrumented; not a speed measurement."
        : "One deterministic native Turf run; observations include repeated raw animated-rotation inputs for the same clip/output pose, and existing in-update ground memo hits. Instrumented; not a speed measurement.",
    };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
    console.log(
      JSON.stringify({
        side: result.side,
        intercepted: result.intercepted,
        stats: result.stats,
        memoScan: result.memoScan,
        memoHits: result.memoHits,
        repetition: result.repetition,
        renderFrameBefore: result.renderFrameBefore,
        renderFrameAfter: result.renderFrameAfter,
        budgetTicks: result.budgetTicks,
        lastDrawFrames: result.lastDrawFrames,
        errors: result.errors,
      }),
    );
    assert(
      result.stage === "scorch" &&
        result.native &&
        result.actors === 8 &&
        result.bots === 7 &&
        result.intercepted >= 1 &&
        result.errors.length === 0,
    );
    process.exitCode = 0;
  } else {
    const results = [];
    for (const side of ["base", "base", "trial"]) {
      console.log("running " + side);
      results.push(await run(side));
    }
    const [a, b, c] = results;
    const compare = (x, y) => {
      let first = x.seq.findIndex(
        (v, i) => v[0] !== y.seq[i]?.[0] || v[1] !== y.seq[i]?.[1],
      );
      return {
        sameRoster: JSON.stringify(x.roster) === JSON.stringify(y.roster),
        sameTicks: x.ticks === y.ticks,
        firstDivergentFrame: first,
        gameAndPoseFramesEqual: first < 0 && x.seq.length === y.seq.length,
        gridEqual: x.grid === y.grid,
        orderEqual: x.order === y.order,
        atlasEqual: x.atlasSize === y.atlasSize && x.atlasHash === y.atlasHash && x.atlasGlError === 0 && y.atlasGlError === 0 && JSON.stringify(x.atlasSamples)===JSON.stringify(y.atlasSamples) && x.atlasSamples.every(s=>s.glError===0),
      };
    };
    const summary = {
      browser: browser.version(),
      frames,
      baselineSha256: sha(baseline),
      trialSha256: sha(trial),
      module: rel,
      baselineComparison: compare(a, b),
      trialComparison: compare(a, c),
      results,
      scope:
        "Exploratory paint A/A/B, deterministic native Turf; 30 Hz presentation with 60 Hz fixed ticks; atlas rendering/upload counters perturb runtime; scene rendering off; full paint atlas SHA-256 every 60 frames and final; 8 actors, per-tick actor state, local bone TRS and muzzle hash, final paint grid/order hash; hashing and ground-query observers perturb runtime and exclude timing claims. Exact repeated ground query coordinates within one character.update are only a theoretical cache upper bound.",
    };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(summary, null, 2) + "\n");
    console.log(
      JSON.stringify({
        baselineComparison: summary.baselineComparison,
        trialComparison: summary.trialComparison,
        stats: results.map((x) => ({
          side: x.side,
          intercepted: x.intercepted,
          stats: x.stats,
          balanceStats: x.balanceStats,
          errors: x.errors,
        })),
        roster: a.roster,
      }),
    );
    assert(
      results.every(
        (x) =>
          x.stage === "scorch" &&
          x.native &&
          x.actors === 8 &&
          x.bots === 7 &&
          x.intercepted >= 1 &&
          x.errors.length === 0,
      ),
    );
    assert(
      summary.baselineComparison.sameRoster &&
        summary.baselineComparison.sameTicks &&
        summary.baselineComparison.gameAndPoseFramesEqual &&
        summary.baselineComparison.gridEqual &&
        summary.baselineComparison.orderEqual && summary.baselineComparison.atlasEqual,
      "baseline did not reproduce",
    );
    assert(
      summary.trialComparison.sameRoster &&
        summary.trialComparison.sameTicks &&
        summary.trialComparison.gameAndPoseFramesEqual &&
        summary.trialComparison.gridEqual &&
        summary.trialComparison.orderEqual && summary.trialComparison.atlasEqual && !a.packedPaint && c.packedPaint && c.paintExperimentStats?.deferred>0,
      "candidate differs",
    );
  }
} finally {
  await browser.close();
  server.close();
}
