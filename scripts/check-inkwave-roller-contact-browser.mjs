// Actual Character/Actor/Physics and WebGL atlas readback. Controlled floor; not retail hardware parity.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import { execFileSync } from 'node:child_process';
const diagnostic = process.argv.includes("--diagnostic");
const baselineIndex=process.argv.indexOf('--baseline-ref');
const baselineRef=baselineIndex<0?null:process.argv[baselineIndex+1];
const overlay=new Map(baselineRef?['main-weapon-catalog.mjs','weapons-fidelity.mjs','roller-contact-paint.mjs'].map(name=>{
  const rel='patches/splatoon3/runtime/'+name;
  return ['/'+rel,execFileSync('git',['show',baselineRef+':'+rel])];
}):[]);
// A declared diagnostic mutant retains the old authored model sizes. This is
// deliberately not labelled a reconstruction of an entire historical build.
const withoutModelScale=process.argv.includes('--without-model-scale');
const ticksIndex=process.argv.indexOf('--ticks');
const simulationTicks=ticksIndex<0?150:Number(process.argv[ticksIndex+1]);
if(!Number.isSafeInteger(simulationTicks)||simulationTicks<30||simulationTicks>150)throw Error('Expected --ticks 30..150');
const overhead=process.argv.includes('--overhead');
if(withoutModelScale)overlay.set('/patches/splatoon3/runtime/roller-source-scale.mjs',
  Buffer.from('export function rollerSourceModelScale(){return 1;}'));
const site = path.resolve(process.argv[2]),
  out = path.resolve(process.argv[3]),
  id = process.argv[4] || "roller",
  hz = Number(process.argv[5] || 60);
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  if(overlay.has(req.url)){res.setHeader('content-type','text/javascript');return res.end(overlay.get(req.url));}
  if (req.url === "/probe") {
    res.setHeader("content-type", "text/html");
    return res.end(
      '<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>',
    );
  }
  let f = path.join(site, decodeURIComponent(req.url));
  res.setHeader(
    "content-type",
    f.endsWith(".json")
      ? "application/json"
      : f.endsWith(".png")
        ? "image/png"
        : "text/javascript",
  );
  if (fs.existsSync(f)) fs.createReadStream(f).pipe(res);
  else {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 840 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:" + server.address().port + "/probe");
  const result = await page.evaluate(
    async ({ id, hz, simulationTicks, overhead }) => {
      let rng = 0x524f4c4c;
      Math.random = () => {
        rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
        return rng / 4294967296;
      };
      const profile = await fetch("/patches/splatoon3/profile.json").then((r) =>
        r.json(),
      );
      const { install } = await import(
        "/patches/splatoon3/runtime/install.mjs"
      );
      const api = install(profile);
      const { installMainWeaponCatalogRuntime } = await import(
        "/patches/splatoon3/runtime/main-weapon-catalog.mjs"
      );
      installMainWeaponCatalogRuntime(api, profile);
      const { G, THREE, Actor, Character, Projectiles, Physics, PaintSystem } =
          api,
        V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
      });
      renderer.setSize(1280, 840);
      document.body.style.margin = "0";
      document.body.append(renderer.domElement);
      renderer.setClearColor("#c3bacb");
      G.scene = new THREE.Scene();
      G.scene.add(new THREE.HemisphereLight("#ffffff", "#7e728c", 3));
      const light = new THREE.DirectionalLight("#ffffff", 3);
      light.position.set(-5, 10, -5);
      G.scene.add(light);
      G.teamColors = [new THREE.Color("#ff008c"), new THREE.Color("#03f")];
      G.settings = {};
      G.time = 0;
      G.netm = null;
      G.match = { playing: () => true, canRespawn: () => false };
      const face = {
        id: 0,
        origin: V(-10, 0, -5),
        u: V(1, 0, 0),
        v: V(0, 0, 1),
        n: V(0, 1, 0),
        su: 20,
        sv: 30,
        wall: false,
        turf: true,
        paintable: true,
      };
      const block = {
        id: 0,
        solid: true,
        grate: false,
        center: V(0, -1, 10),
        half: V(10, 1, 15),
        axes: [V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)],
        faces: [-1, -1, 0, -1, -1, -1],
        aabbMin: V(-10, -2, -5),
        aabbMax: V(10, 0, 25),
      };
      G.level = {
        faces: [face],
        blocks: [block],
        pointInside: () => false,
        groundHeight: () => 0,
        queryBlocks(_a, _b, _c, _d, out = []) {
          out.length = 0;
          out.push(0);
          return out;
        },
      };
      G.physics = new Physics(G.level);
      G.paint = new PaintSystem(renderer, G.level, {
        atlasSize: 1024,
        maxDensity: 30,
        cell: 0.05,
      });
      G.projectiles = new Projectiles(G.scene);
      G.actors = [];
      const atlas = face.atlas;
      const geometry = new THREE.PlaneGeometry(20, 30);
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, -0.004, 10);
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          ink: { value: G.paint.texture },
          rect: {
            value: new THREE.Vector4(
              atlas.x + atlas.pad,
              atlas.y + atlas.pad,
              20 * atlas.ppm,
              30 * atlas.ppm,
            ),
          },
          size: { value: G.paint.size },
        },
        vertexShader:
          "varying vec3 P;void main(){P=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
        fragmentShader:
          "uniform sampler2D ink;uniform vec4 rect;uniform float size;varying vec3 P;void main(){vec2 uv=(rect.xy+vec2((P.x+10.0)/20.0,(P.z+5.0)/30.0)*rect.zw)/size;vec4 v=texture2D(ink,uv);float line=step(.97,fract(P.x))*0.3+step(.97,fract(P.z))*0.3;vec3 dry=vec3(.67,.64,.72)-line;gl_FragColor=vec4(mix(dry,vec3(1.,0.,.42),v.a),1.);}",
      });
      G.scene.add(new THREE.Mesh(geometry, mat));
      const a = new Actor({
        team: 0,
        weapon: id,
        isLocal: false,
        CharacterClass: Character,
        style: { hair: 0, skin: 2, outfit: 0, eyes: 0 },
      });
      a.character.actor = a;
      await a.character.sourceMotion.ready;
      a.form = "kid";
      a.grounded = true;
      a.ground.hit = true;
      a.ground.face = 0;
      a.pos.set(0, 0, 0);
      a.ink = 100;
      a.yaw = 0;
      a.aimYaw = 0;
      a.aimDir.set(0, 0, 1);
      a.aimPoint.set(0, 1.05, 100);
      a.intent.move.set(0, 0, 1);
      a.intent.fire = true;
      a.weaponRunner.rolling = true;
      a.weaponRunner.flick = -1;
      a.weaponRunner.cooldown = 0;
      a.weaponRunner.flickRecover = 0;
      G.actors = [a];
      G.scene.add(a.character.root);
      const events = [],
        splat = G.paint.splat;
      G.paint.splat = function (at, r, t, o) {
        events.push({
          at: at.toArray(),
          r,
          stretch: o.stretch?.toArray(),
          amount: o.stretchAmt,
          kind: o.kind,
          footprint: o.footprint,
        });
        return splat.call(this, at, r, t, o);
      };
      const { FixedClock } = await import(
        "/patches/splatoon3/runtime/clock.mjs"
      );
      const clock = new FixedClock();
      for (let i = 0; i < hz * simulationTicks / 60; i++) {
        clock.advance(1 / hz, (dt) => {
          a.ink = 100;
          G.time += dt;
          a.update(dt);
          G.paint.advanceSimulation(dt);
        });
        G.paint.flush(0);
      }
      const camera = new THREE.PerspectiveCamera(45, 1280 / 840, 0.1, 100);
      camera.position.set(0, 8, a.pos.z - 6);
      camera.lookAt(0, 0, a.pos.z - 2.2);
      if(overhead){camera.position.set(0,14,a.pos.z-2);camera.up.set(0,0,1);camera.lookAt(0,0,a.pos.z-2);}
      renderer.render(G.scene, camera);
      const pixels = new Uint8Array(G.paint.size ** 2 * 4);
      renderer.readRenderTargetPixels(
        G.paint.rt,
        0,
        0,
        G.paint.size,
        G.paint.size,
        pixels,
      );
      const sample = (x, z) => {
        let col = Math.floor(atlas.x + atlas.pad + (x + 10) * atlas.ppm),
          row = Math.floor(atlas.y + atlas.pad + (z + 5) * atlas.ppm);
        return pixels[4 * (row * G.paint.size + col) + 3];
      };
      // Independent 11.3.0 BodyParam.PaintParam endpoints, also transcribed
      // as full firing-range-line widths 1.12/.88/1.36/1.04/1.36 (one line=5).
      const sourceHalf = {roller:2.8,'s3-roller-compact':2.2,'s3-roller-heavy':3.4,
        's3-roller-hunter':2.6,'s3-roller-wide':3.4}[id];
      const sourceDrumWidth = {roller:2.5712,'s3-roller-compact':2.5664,
        's3-roller-heavy':2.5816,'s3-roller-hunter':2.6044,'s3-roller-wide':3.256}[id];
      const spans=[];
      // Recent settled body; the old trailing window included the beginning
      // of a short stroke and mixed acceleration/caps into the width median.
      for(let z=a.pos.z-.5;z<a.pos.z+.5;z+=.05){
        let lo=Infinity,hi=-Infinity;
        for(let x=-4.5;x<=4.5;x+=.025)if(sample(x,z)>=128){lo=Math.min(lo,x);hi=Math.max(hi,x);}
        if(hi>=lo)spans.push(hi-lo);
      }
      let holes = 0,
        rows = 0;
      for (let z = 2; z < a.pos.z - 0.5; z += 0.05) {
        rows++;
        if (sample(0, z) < 128) holes++;
      }
      a.character.root.updateMatrixWorld(true);
      const drum = a.character.weapon.drum;
      const geo = a.character.weapon.def.drum;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const b = geo.boundingBox,
        m = drum.matrixWorld.elements;
      const physicalHalf = (b.max.x - b.min.x) * 0.5 * Math.hypot(m[0], m[2]);
      const last = events.at(-1),
        front = last.stretch
          ? V(...last.at).addScaledVector(V(...last.stretch), 0.6 * last.r * (1 + last.amount))
          : V(...last.at),
        centre = drum.localToWorld(b.min.clone().add(b.max).multiplyScalar(.5));
      const contactError = Math.hypot(front.x - centre.x, front.z - centre.z);
      let cpuHoles = 0;
      for (let z = 2; z < a.pos.z - 0.5; z += 0.05)
        if (G.paint.sampleWorld(0, V(0, 0, z)) !== 1) cpuHoles++;
      return {
        id,
        hz,
        physicalHalf,
        sourceHalf,
        sourceDrumWidth,
        gpuMinWidth:Math.min(...spans),gpuMaxWidth:Math.max(...spans),
        gpuMedianWidth:[...spans].sort((a,b)=>a-b)[Math.floor(spans.length/2)],
        groundSpeed:Math.hypot(a.vel.x,a.vel.z),rollTime:a.weaponRunner.rollT,
        contactDepth:1.2*last.r*(1+last.amount),
        contactError,
        cpuHoles,
        actor: a.pos.toArray(),
        drum: a.character.weapon.drum.getWorldPosition(V()).toArray(),
        events: events.slice(-6),
        rows,
        holes,
        samples: [-0.5, -0.25, 0, 0.25, 0.5].map((x) => ({
          x,
          values: Array.from({ length: 30 }, (_, i) => sample(x, 2 + i * 0.2)),
        })),
        sourceActive: a.character.sourceMotion.active,
        ticks: clock.ticks,
      };
    },
    { id, hz, simulationTicks, overhead },
  );
  const build = JSON.parse(
    fs.readFileSync(path.join(site, "inkwave-build.json")),
  );
  Object.assign(result, {
    contentHash: build.contentHash,
    browser: browser.version(),
    errors,
    baselineRef,
    withoutModelScale,
    simulationTicks,overhead,
    runtimeOverlayPaths:[...overlay.keys()],
  });
  fs.writeFileSync(
    path.join(out, "result.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  await page.screenshot({ path: path.join(out, "view.png") });
  console.log(
    JSON.stringify({
      id,
      hz,
      holes: result.holes,
      cpuHoles: result.cpuHoles,
      contactError: result.contactError,
      width: result.events.at(-1).r * 2,
      gpuMaxWidth: result.gpuMaxWidth,
    }),
  );
  if (!diagnostic) {
    assert.equal(errors.length, 0);
    assert.equal(result.holes, 0, "continuous GPU center");
    assert.equal(result.cpuHoles, 0, "continuous CPU center");
    assert.ok(
      result.contactError < 1e-5,
      "leading edge must touch current cylinder",
    );
    assert.ok(
      result.events.every((e) => e.footprint === "ink-contact"),
      "one continuous physical band",
    );
    const speedMax={roller:.132,'s3-roller-compact':.16,'s3-roller-heavy':.108,'s3-roller-hunter':.132,'s3-roller-wide':.142}[id]*60;
    const expectedHalf=1.3+(result.sourceHalf-1.3)*Math.min(1,result.groundSpeed/speedMax);
    assert.ok(Math.abs(result.events.at(-1).r-expectedHalf)<1e-5,
      'paint width uses speed and the documented minimum, independently of drum geometry');
    assert.ok(result.gpuMaxWidth>=2*expectedHalf*.93&&result.gpuMaxWidth<=2*expectedHalf+.15,
      'actual GPU stripe reaches the source width, not just the model width');
    assert.ok(Math.abs(2*result.physicalHalf-result.sourceDrumWidth)<1e-4,
      'rendered drum width uses measured model coordinates, independently of paint width');
    assert.ok(Math.abs(result.contactDepth-1.5)<1e-10,'contact depth stays independent of transverse ink width');
    assert.equal(result.ticks, simulationTicks);
  }
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
