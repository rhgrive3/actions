// Actual full-build output regressions. Run with node --experimental-vm-modules --test.
// INKWAVE_BUILT_SITE is mandatory. No fallback to source or a transform is allowed.
// VM evidence only: full emitted VFX/presentation/pool modules are evaluated with
// dependency/renderer sinks. Private bindings are exposed with appended exports;
// the Screen closure is exposed inside the real installer. Only native projectile
// _new/_push/ghostProjectile are AST-extracted from emitted weapons.js, retaining
// their emitted bodies and imported bindings. Physics/paint/metadata dependencies
// and the network-cosmetic validator are sinks, so packet validation is NOT tested.
// This is NOT browser/GPU/retail QA, nor complete gameplay integration.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { parse } from "../../patches/loading-cache/vendor/acorn.mjs";
const site = process.env.INKWAVE_BUILT_SITE;
assert.ok(site, "INKWAVE_BUILT_SITE must point to a complete emitted build");
const root = path.resolve(site), identity = JSON.parse(fs.readFileSync(path.join(root, "inkwave-build.json")));
const hash = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(hash(JSON.stringify(identity.artifacts)), identity.contentHash, "artifact manifest seal");
assert.equal(hash(JSON.stringify(identity.files)), identity.inputHash, "input manifest seal");
for (const [rel, digest] of Object.entries(identity.artifacts)) {
  assert.ok(!path.isAbsolute(rel) && !rel.split("/").includes(".."), "relative artifact path");
  assert.equal(hash(fs.readFileSync(path.join(root, rel))), digest, `full artifact readback ${rel}`);
}
assert.equal(identity.build.optimization, "esbuild-minify", "requires production minification");
const revision = identity.build.revision;
function read(rel) {
  const b = fs.readFileSync(path.join(root, rel));
  assert.equal(hash(b), identity.artifacts[rel], `emitted hash ${rel}`);
  assert.deepEqual(fs.readFileSync(path.join(root, "_versions", revision, rel)), b, `revision copy ${rel}`);
  return b.toString();
}
const prefix = "patches/splatoon3/runtime/";
const vfx = read(prefix + "special-vfx.mjs"), presentation = read(prefix + "special-presentation.mjs"), kit = read(prefix + "special-vfx-kit.mjs"), weapons = read("src/game/weapons.js");
const ast = (s) => parse(s, { ecmaVersion: "latest", sourceType: "module" });
const key = (n) => n?.name ?? n?.value;
function nodes(n, predicate, result = []) {
  if (!n || typeof n !== "object") return result;
  if (predicate(n)) result.push(n);
  for (const [k, v] of Object.entries(n)) {
    if (k === "start" || k === "end") continue;
    if (Array.isArray(v)) for (const x of v) nodes(x, predicate, result);
    else nodes(v, predicate, result);
  }
  return result;
}
const one = (xs, label) => {
  assert.equal(xs.length, 1, label);
  return xs[0];
};
function objectBinding(tree, keys) {
  return one(nodes(tree, (n) => n.type === "VariableDeclarator" && n.init?.type === "ObjectExpression" && keys.every((k) => n.init.properties.some((p) => key(p.key) === k))), "unique recipe binding").id.name;
}
const exported = (tree, name) => one(nodes(tree, (n) => n.type === "ExportSpecifier" && key(n.exported) === name), `export ${name}`).local.name;
function replaceRange(s, n, text) {
  return s.slice(0, n.start) + text + s.slice(n.end);
}
const enums = new Proxy({}, { get: () => 1 });
class Vec {
  constructor(x = 0, y = 0, z = 0) {
    this.set(x, y, z);
  }
  set(x, y, z) {
    Object.assign(this, { x, y, z });
    return this;
  }
  copy(p) {
    return this.set(p.x, p.y, p.z);
  }
  setY(y) {
    this.y = y;
    return this;
  }
  multiplyScalar(s) {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }
  add(p) {
    return this.addScaledVector(p, 1);
  }
  addScaledVector(p, s) {
    this.x += p.x * s;
    this.y += p.y * s;
    this.z += p.z * s;
    return this;
  }
}
const THREE = { Vector3: Vec, Quaternion: class {
}, Matrix4: class {
} };
async function loadModule(code, context, values = {}) {
  const tree = ast(code), mod = new vm.SourceTextModule(code, { context });
  await mod.link((spec) => {
    const imports = tree.body.filter((n) => n.type === "ImportDeclaration" && n.source.value === spec).flatMap((n) => n.specifiers);
    const names = imports.map((n) => n.type === "ImportNamespaceSpecifier" ? "Vector3" : key(n.imported));
    return new vm.SyntheticModule([...new Set(names)], function() {
      for (const name of new Set(names)) this.setExport(name, values[name] ?? (() => {
      }));
    }, { context });
  });
  await mod.evaluate();
  return mod.namespace;
}
async function loadVfx(mutation) {
  let code = vfx, tree = ast(code);
  const director = one(nodes(tree, (n) => n.type === "ClassDeclaration" && n.body.body.some((p) => key(p.key) === "endTrack")), "director class");
  if (mutation === "vac") {
    const m = one(director.body.body.filter((n) => key(n.key) === "inkVacShot"), "shot method");
    code = replaceRange(code, m.value.body, "{}");
  }
  if (mutation === "kraken") {
    assert.ok(code.includes(".jumpAttack"));
    code = code.replaceAll(".jumpAttack", ".__negativeMissingJumpAttack");
  }
  if (mutation === "bubbler") {
    assert.ok(code.includes(".ignited"));
    code = code.replaceAll(".ignited", ".__negativeAlwaysOff");
  }
  const dirs = objectBinding(tree, ["krakenRoyale", "killerWail", "crabTank"]), kits = objectBinding(tree, ["bubbler", "cooler"]);
  const map = one(nodes(tree, (n) => n.type === "VariableDeclarator" && n.init?.type === "NewExpression" && n.init.callee.name === "WeakMap"), "director map").id.name;
  const ctx = vm.createContext({ console });
  const ns = await loadModule(code + `
export {${director.id.name} as TestDirector,${dirs} as TestDirectors,${kits} as TestKits,${map} as TestMap};`, ctx, { vfxRandom: () => 0.95, inkVacState: (a) => a.state, WAIL_SPEAKER_POSITIONS: [], SPARK: enums, PUFF: enums, RIBBON: enums, BEAM: enums, SHELL: enums, BAND: enums, DISC: enums });
  return { ns, ctx };
}
async function poolClass() {
  const tree = ast(kit), cl = one(nodes(tree, (n) => n.type === "ClassDeclaration" && n.body.body.some((p) => key(p.key) === "push") && n.body.body.some((p) => key(p.key) === "end")), "ribbon pool");
  return (await loadModule(kit + `
export {${cl.id.name} as TestPool};`, vm.createContext({ console }))).TestPool;
}
function nativeProjectiles(context, G) {
  const tree = ast(weapons), cl = one(nodes(tree, (n) => n.type === "ClassDeclaration" && n.body.body.some((p) => key(p.key) === "_new") && n.body.body.some((p) => key(p.key) === "ghostProjectile")), "native projectiles");
  const methods = ["_new", "_push", "ghostProjectile"].map((name) => one(cl.body.body.filter((p) => key(p.key) === name), name));
  for (const imp of tree.body.filter((n) => n.type === "ImportDeclaration")) for (const s of imp.specifiers) {
    if (s.type === "ImportNamespaceSpecifier") context[s.local.name] = THREE;
    else if (key(s.imported) === "G") context[s.local.name] = G;
    else if (key(s.imported) === "validNetworkProjectileCosmetics") context[s.local.name] = () => true;
    else context[s.local.name] = () => {
    };
  }
  // Methods may call module-local helpers after production composition. Keep
  // their exact emitted bodies and transitive local function dependencies;
  // imported physics/metadata sinks above remain explicitly outside this test.
  const functions = new Map(tree.body.filter(n => n.type === 'FunctionDeclaration').map(n => [n.id.name,n]));
  const dependencies = new Map();
  const visit = node => {
    for (const call of nodes(node, n => n.type === 'CallExpression' && n.callee.type === 'Identifier')) {
      const name=call.callee.name, fn=functions.get(name);
      if (fn && !dependencies.has(name)) { dependencies.set(name,fn); visit(fn); }
    }
  };
  methods.forEach(visit);
  vm.runInContext(`${[...dependencies.values()].map(n => weapons.slice(n.start,n.end)).join('\n')}\nglobalThis.TestProjectiles=class {${methods.map((n) => weapons.slice(n.start, n.end)).join("\n")}};`, context);
  return context.TestProjectiles;
}
async function vacFixture(mutation) {
  const { ns, ctx } = await loadVfx(mutation), G = {}, P = nativeProjectiles(ctx, G);
  class FX {
    update() {
    }
    clear() {
    }
    setCollider() {
    }
  }
  const fx = new FX(), system = new P();
  Object.assign(system, { list: [], pool: [], inkFlight: { restore() {
  }, reset() {
  } }, projectileVisuals: { reset() {
  } } });
  Object.assign(G, { fx, projectiles: system });
  const flashes = [], shells = [], director = Object.assign(Object.create(ns.TestDirector.prototype), { inkVacShots: /* @__PURE__ */ new WeakSet(), inkjetImpacts: /* @__PURE__ */ new WeakSet(), rounds: /* @__PURE__ */ new Map(), v: Array.from({ length: 8 }, () => new Vec()), rgb: () => [1, 0, 0], aim: (_, out) => out.set(0, 0, 1), muzzle(p) {
    flashes.push({ ...p });
  }, shell(...args) {
    shells.push(args);
  }, call(fn, ...args) {
    return fn?.apply(this, args);
  } });
  ns.TestMap.set(fx, director);
  ns.installSpecialVfx({ FX, Projectiles: P, G });
  const actor = { pos: new Vec(), team: 0, state: { phase: "exhale" } };
  const shot = (reuse) => {
    if (reuse) system.pool.push(reuse);
    const p = system._new();
    Object.assign(p, { wid: "inkVac", owner: actor, team: 0, dead: false });
    p.pos.set(2, 3, 4);
    p.start.copy(p.pos);
    return p;
  };
  return { ns, G, system, actor, shot, flashes, shells, director };
}
async function assertVac(mutation) {
  const f = await vacFixture(mutation), track = { color: [1, 0, 0], d: {} };
  for (const phase of ["exhale", "exhale", "done", null]) {
    f.actor.state.phase = phase;
    f.ns.TestDirectors.inkVac.frame.call(f.director, f.actor, track, 1 / 60);
  }
  assert.equal(f.flashes.length, 0, "HOLD/cancel must not flash");
  let recorded = 0;
  f.G.netm = { recProj() {
    recorded++;
  } };
  const p = f.shot();
  assert.equal(f.system._push(p), void 0);
  assert.equal(recorded, 1);
  assert.equal(f.flashes.length, 1, "accepted actual native birth flashes");
  assert.deepEqual(f.flashes[0], { x: 2, y: 3, z: 4 });
  f.system._push(p);
  assert.equal(f.flashes.length, 1, "dedup");
  f.system.list.length = 0;
  assert.equal(f.shot(p), p);
  f.system._push(p);
  assert.equal(f.flashes.length, 2, "pooled birth resets");
  for (const flag of ["dead", "_netEnded"]) {
    const bad = f.shot();
    bad[flag] = true;
    f.system._push(bad);
  }
  assert.equal(f.flashes.length, 2, "dead and cancelled");
  const packet = [0, "p", 7, "blast", "inkVac", 2, 3, 4, 0, 0, 30, 0, 4, 0, 6, 0.2, 0, 0, 0, 0, 0.2, 1, 1, 0, 0, 0, 0];
  f.actor.remote = true;
  const ghost = f.system.ghostProjectile(f.actor, packet);
  assert.equal(ghost.ghost, true);
  assert.equal(f.flashes.length, 3, "accepted ghost birth");
  f.system._push(ghost);
  assert.equal(f.flashes.length, 3, "ghost push dedup");
  f.G.fx.s3SpecialVfxEnabled = false;
  f.system._push(f.shot());
  assert.equal(f.flashes.length, 3, "disabled");
}
test("emitted InkVac HOLD and actual native birth, dedup and pooled reuse", () => assertVac());
test("negative control: removing emitted InkVac shot observer is detected", async () => {
  await assert.rejects(() => assertVac("vac"), /accepted actual native birth flashes/);
});
function bubblerHost() {
  return { time: 0, v: [new Vec(), new Vec()], up: { x: 0, y: 1, z: 0 }, near: () => true, hdr: (c) => c, kit: { q: 0 }, beams: [], flash() {
  }, spark() {
  }, shell() {
  }, disc() {
    return {};
  }, streaks() {
  }, beam(...args) {
    const rec = { v: new Array(16).fill(0), initialAlpha: args[8], follow: args.at(-1).follow };
    rec.v[11] = rec.initialAlpha;
    this.beams.push(rec);
    return rec;
  } };
}
async function assertBubbler(mutation) {
  const { ns } = await loadVfx(mutation);
  for (const replay of [false, true]) {
    const h = bubblerHost(), o = { pos: { x: 1, y: 2, z: 3 }, ignited: replay }, r = { d: {}, color: [1, 0, 0] };
    ns.TestKits.bubbler.start.call(h, r, o);
    assert.equal(h.beams.length, 2);
    for (const b of h.beams) {
      b.follow(b);
      assert.equal(b.v[11] > 0, replay, "ignition admission");
    }
    o.ignited = true;
    h.time = 2;
    for (const b of h.beams) {
      b.follow(b);
      assert.ok(b.v[11] > 0, "ignited beams visible");
    }
    for (let i = 0; i < 60; i++) {
      h.time += 1 / 60;
      ns.TestKits.bubbler.frame.call(h, r, o, 1 / 60);
      for (const b of h.beams) b.follow(b);
    }
    assert.equal(h.beams.length, 2);
    ns.TestKits.bubbler.end.call(h, r, o);
    for (const b of h.beams) assert.equal(b.follow(b), false);
  }
}
test("emitted Bubbler ignition, immediate replay, record reuse and retirement", () => assertBubbler());
test("negative control: disabling emitted ignition is detected", async () => {
  await assert.rejects(() => assertBubbler("bubbler"), /ignited beams visible|ignition admission/);
});
async function assertKraken(mutation) {
  const { ns } = await loadVfx(mutation), Pool = await poolClass();
  function fixture() {
    const ink = Object.assign(Object.create(Pool.prototype), { list: [], T: 40, M: 48 }), glow = Object.assign(Object.create(Pool.prototype), { list: [], T: 28, M: 40 });
    const d = Object.assign(Object.create(ns.TestDirector.prototype), { kit: { ribbons: ink, glowRibbons: glow, time: 1 }, tracks: /* @__PURE__ */ new Map(), errors: 0, time: 1, v: Array.from({ length: 8 }, () => new Vec(0, 0, 1)), forward() {
      return { x: 0, z: 1 };
    }, ribbon(add, o) {
      return (add ? glow : ink).start(o);
    } });
    const a = { alive: true, remote: false, pos: { x: 0, y: 2, z: 0 }, grounded: false, climbing: false, specialActive: { id: "krakenRoyale" }, _s3AllSpecialState: { id: "krakenRoyale", jumpAttack: true, phase: "active" } }, t = { id: "krakenRoyale", phase: "active", color: [1, 0, 0], d: {} };
    d.tracks.set(a, t);
    return { d, a, t, ink, glow };
  }
  const step = (f2, dt = 1 / 60) => {
    ns.TestDirectors.krakenRoyale.frame.call(f2.d, f2.a, f2.t, dt);
    f2.d.kit.time += dt;
  };
  let angles;
  for (const hz of [30, 60, 120]) {
    const f2 = fixture();
    step(f2, 0);
    assert.equal(f2.t.d.jumpRibs, void 0);
    for (let i = 0; i < hz; i++) step(f2, 1 / hz);
    assert.equal(f2.t.d.jumpRibs?.length, 8, "admitted jump creates eight strands");
    const next = f2.t.d.jumpRibs.map((q) => q.ang);
    if (angles) next.forEach((n, i) => assert.ok(Math.abs(n - angles[i]) < 1e-10));
    angles = next;
    assert.equal(f2.ink.list.length, 6);
    assert.equal(f2.glow.list.length, 2);
    assert.ok(f2.ink.list.every((r) => r.pts.length <= 48));
    assert.ok(f2.glow.list.every((r) => r.pts.length <= 40));
  }
  for (const cause of ["ground", "climb", "cancel", "finish", "charge", "dash", "death", "recall", "expiry", "remove"]) {
    const f2 = fixture();
    step(f2);
    const ribs = f2.t.d.jumpRibs;
    if (cause === "ground") f2.a.grounded = true;
    else if (cause === "climb") f2.a.climbing = true;
    else if (cause === "cancel") f2.a._s3AllSpecialState.jumpAttack = false;
    else if (["finish", "charge", "dash"].includes(cause)) f2.a._s3AllSpecialState.phase = cause;
    else {
      if (cause === "death") f2.a.alive = false;
      if (cause === "recall") f2.a.superJumpState = {};
      if (cause === "expiry") f2.a.specialActive = null;
      if (cause === "remove") f2.d.endTrack(f2.a, f2.t);
      else f2.d.track(f2.a);
    }
    if (["ground", "climb", "cancel", "finish", "charge", "dash"].includes(cause)) step(f2);
    assert.equal(f2.t.d.jumpRibs, null, cause);
    assert.ok(ribs.every((q) => q.r.ended), cause);
  }
  for (const cause of ["nonattack", "remote", "wrong", "startup", "ground"]) {
    const f2 = fixture();
    if (cause === "nonattack") f2.a._s3AllSpecialState.jumpAttack = false;
    if (cause === "remote") f2.a.remote = true;
    if (cause === "wrong") f2.a._s3AllSpecialState.id = "inkjet";
    if (cause === "startup") f2.a._s3AllSpecialState.phase = "startup";
    if (cause === "ground") f2.a.grounded = true;
    step(f2);
    assert.equal(f2.t.d.jumpRibs, void 0, cause);
  }
  const f = fixture();
  for (let j = 0; j < 100; j++) {
    f.a.grounded = false;
    step(f);
    f.a.grounded = true;
    step(f);
  }
  assert.ok(f.ink.list.length <= 40 && f.glow.list.length <= 28);
}
test("emitted Kraken jumpAttack admission, clocks, lifecycle and actual bounded pools", () => assertKraken());
test("negative control: disabling emitted jumpAttack is detected", async () => {
  await assert.rejects(() => assertKraken("kraken"), /admitted jump creates eight strands/);
});
async function screenPose(mutation) {
  let code = presentation, tree = ast(code);
  const installName = exported(tree, "installSpecialModels"), install = one(nodes(tree, (n) => n.type === "FunctionDeclaration" && n.id.name === installName), "presentation installer");
  const poses = nodes(install, (n) => n.type === "FunctionDeclaration" && n.params.length === 3 && code.slice(n.start, n.end).includes(".s3ScreenSheet"));
  const pose = one(poses.filter((n) => !poses.some((other) => other !== n && other.start > n.start && other.end < n.end)), "screen closure");
  if (mutation) {
    const set = one(nodes(pose, (n) => n.type === "CallExpression" && n.callee.type === "MemberExpression" && key(n.callee.property) === "set" && n.callee.object.type === "MemberExpression" && key(n.callee.object.property) === "scale" && code.slice(n.callee.start, n.callee.end).includes(".sheet.scale")), "sheet scale");
    code = replaceRange(code, set.arguments[1], "0.5");
  }
  code = code.slice(0, install.body.start + 1) + `globalThis.TestScreenPose=${pose.id.name};` + code.slice(install.body.start + 1);
  const ctx = vm.createContext({ console }), ns = await loadModule(code, ctx, { WAIL_SPEAKER_POSITIONS: [] });
  class P {
    update() {
    }
  }
  ns.installSpecialModels({ THREE, G: {}, Projectiles: P });
  return ctx.TestScreenPose;
}
function screenFixture(age = 0, phase = "active") {
  const mat = { uniforms: { uOpacity: { value: 0.86 }, uTime: { value: 0 } } };
  Object.defineProperty(mat, "opacity", { get() {
    return this.uniforms.uOpacity.value;
  }, set(v) {
    this.uniforms.uOpacity.value = v;
  } });
  const edge = { opacity: 0.18 }, sheet = { scale: { set(x, y, z) {
    Object.assign(this, { x, y, z });
  } }, position: { y: 0 }, children: [{ material: edge }, { material: mat }], userData: { s3ScreenSheet: { mat, tex: { offset: { x: 0, y: 0 } } } } }, pres = { models: {}, sheet, group: { position: new Vec(), rotation: { set() {
  } } } }, o = Object.freeze({ kind: "screen", phase, age, landedAt: 0, dur: 10, width: 15, height: 9, pos: Object.freeze({ x: 1, y: 2, z: 3 }), normal: Object.freeze({ x: 0, z: 1 }) });
  return { pres, o, mat, edge };
}
async function assertScreen(mutation) {
  const pose = await screenPose(mutation);
  for (const age of [9, 9.25, 9.5, 9.75, 10, 11]) {
    const f2 = screenFixture(age), before = JSON.stringify(f2.o), fold = Math.max(0, Math.min(1, age - 9)), fade = 1 - fold * fold;
    pose(f2.o, f2.pres, 1 / 60);
    assert.equal(f2.pres.sheet.scale.y, 1, "close remains upright");
    assert.equal(f2.pres.sheet.scale.x, 1);
    assert.equal(f2.pres.sheet.position.y, 4.5);
    assert.ok(Math.abs(f2.mat.opacity - (0.8 + 0.06 * Math.sin(age * 7)) * fade) < 1e-12);
    assert.equal(f2.edge.opacity, 0.18 * fade);
    assert.equal(f2.pres.sheet.visible, fade > 0);
    assert.equal(JSON.stringify(f2.o), before);
  }
  const f = screenFixture(10);
  pose(f.o, f.pres, 1 / 60);
  pose(screenFixture(2).o, f.pres, 1 / 60);
  assert.ok(f.mat.opacity > 0.7);
  assert.equal(f.edge.opacity, 0.18);
  assert.equal(f.pres.sheet.visible, true);
  for (const [age, phase, height] of [[1, "flight", 1e-3], [0, "active", 1e-3], [0.5, "active", 0.875]]) {
    const f2 = screenFixture(age, phase);
    pose(f2.o, f2.pres, 1 / 60);
    assert.equal(f2.pres.sheet.scale.y, height);
  }
}
test("emitted Screen installer closure closes upright, hides, reuses and preserves authority", () => assertScreen());
test("negative control: emitted collapsing-height mutation is detected", async () => {
  await assert.rejects(() => assertScreen(true), /close remains upright/);
});
