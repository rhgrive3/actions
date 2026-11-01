import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { adaptBuildSource } from "../../../scripts/inkwave-source-composition.mjs";
import { sourceLoadedActorFixture } from "../../splatoon3/tests/source-loaded-actor-fixture.mjs";
import {
  characterSnapshot,
  poseSnapshot,
} from "./body-balance-work-fixture.mjs";

const rel = "src/game/motion/body-balance.js";
const before = fs.readFileSync(
  new URL("./fixtures/balance-center-before-20261031.js.txt", import.meta.url),
  "utf8",
);
assert.equal(
  createHash("sha256").update(before).digest("hex"),
  "066db2818a36c8aee613b0030e7ce61bcc8b25d0bf1d68a83923081b5a9ddc47",
);
const baseline = (file, raw) =>
  file === rel ? before : adaptBuildSource(file, raw);
const baselineEmitted = (file, raw) => (file === rel ? before : raw);
const fixtureOptions = {
  random: () => 0.4,
  extraExports:
    "export {locomotionProfile} from './src/game/motion/locomotion-profile.js'; export const TEST_MATH = Math;",
};
async function fixtures() {
  const sourceOnly = !process.env.INKWAVE_BUILT_SITE;
  return Promise.all([
    sourceLoadedActorFixture({
      ...fixtureOptions,
      sourceOnly,
      transform: baseline,
      emittedTransform: baselineEmitted,
    }),
    sourceLoadedActorFixture({ ...fixtureOptions, sourceOnly }),
  ]);
}

test("mixed centre rotations preserve character pose, skin, contacts and muzzle across forms and rates", async () => {
  const pair = await fixtures();
  let frames = 0,
    mixed = 0;
  try {
    for (const variant of ["Player00", "Player01"])
      for (const hz of [30, 60, 120])
        for (const weapon of ["shooter", "charger", "roller"]) {
          const actors = await Promise.all(pair.map((api) => api.make()));
          for (const a of actors) {
            a.setWeapon(weapon);
            a.character.onEvent = null;
            if (variant === "Player01")
              await a.character.sourceMotion.setVariant(variant);
          }
          const chars = actors.map((a) => a.character);
          for (let frame = 0; frame < hz; frame++) {
            const dt = 1 / hz,
              phase = Math.floor((frame * 6) / hz),
              angle = frame * 0.03;
            for (let k = 0; k < 2; k++) {
              const ch = chars[k];
              pair[k].G.time += dt;
              ch.root.position.set(
                Math.sin(angle) * 0.4,
                phase === 4 ? 0.3 : 0,
                Math.cos(angle) * 0.4,
              );
              ch.root.rotation.y = angle;
              if (frame === Math.floor(hz / 3)) ch.trigger("shoot");
              if (frame === Math.floor((hz * 2) / 3)) ch.trigger("jump");
              ch.update(dt, {
                form: phase === 5 ? "squid" : "kid",
                grounded: phase !== 4,
                speed: phase === 0 ? 0 : phase === 1 ? 0.1 : 4,
                localMove: { x: Math.sin(angle), z: Math.cos(angle) },
                firing: phase === 2,
                ink: 1,
                hp: 1,
                vy: phase === 4 ? 2 : 0,
                aimPitch: 0.12,
              });
              ch.root.updateMatrixWorld(true);
              ch.skeleton.update();
            }
            if (
              !chars[1].sourceMotion.bodyBalance._soleCenter &&
              chars[1].sourceMotion.bodyBalance.total > 0
            )
              mixed++;
            assert.deepEqual(
              structuredClone(characterSnapshot(chars[1])),
              structuredClone(characterSnapshot(chars[0])),
              `${variant}/${weapon}/${hz}Hz/frame${frame}`,
            );
            frames++;
          }
          pair.forEach((api) => api.reset());
        }
    assert.ok(mixed > 0, "the mixed-centre path was exercised");
    console.log(
      JSON.stringify({
        frames,
        mixed,
        scope:
          "actual composed Character; pose, skin, contact, muzzle; no device FPS",
      }),
    );
  } finally {
    pair.forEach((api) => api.reset());
  }
});

test("mixed centre skips unread matrices and falls back for custom FK, callbacks, sqrt and unordered banks", async () => {
  const pair = await fixtures();
  try {
    const actors = await Promise.all(pair.map((api) => api.make())),
      controllers = actors.map((a) => a.character.sourceMotion);
    const prepare = (k) => {
      const c = controllers[k],
        b = c.bodyBalance;
      c.bank.sample("WalkHold_Nrml", 12.25, c.pose);
      b.clear();
      b.add(pair[k].locomotionProfile(c.bank, "WalkHold_Nrml"), 0.6);
      b.add(pair[k].locomotionProfile(c.bank, "RunHold_Nrml"), 0.4);
      return b;
    };
    const balances = [prepare(0), prepare(1)],
      unused = Array.from({ length: 22 }, (_, i) => i).find(
        (i) => !balances[1].rotationWorldIndices.includes(i),
      );
    assert.notEqual(unused, undefined);
    for (const b of balances) b.center.world[unused].elements[0] = 12345;
    balances.forEach((b, k) =>
      b.apply(controllers[k].pose, controllers[k].pose, { run: 0.4 }),
    );
    assert.notEqual(
      balances[0].center.world[unused].elements[0],
      12345,
      "baseline recomputes unused matrix",
    );
    assert.equal(
      balances[1].center.world[unused].elements[0],
      12345,
      "optimized path skips unused matrix",
    );
    assert.deepEqual(
      structuredClone(poseSnapshot(balances[1].pose)),
      structuredClone(poseSnapshot(balances[0].pose)),
    );
    for (const kind of ["fk", "callback", "unordered", "sqrt"]) {
      const calls = [0, 0],
        restores = [];
      for (let k = 0; k < 2; k++) {
        const b = balances[k];
        prepare(k);
        if (kind === "fk") {
          const old = b.center.fk;
          b.center.fk = function (...args) {
            calls[k]++;
            return old.apply(this, args);
          };
          restores[k] = () => {
            b.center.fk = old;
          };
        } else if (kind === "callback") {
          const q = b.center.wq[unused],
            old = q._onChangeCallback;
          q._onChange(() => calls[k]++);
          restores[k] = () => {
            q._onChange(old);
          };
        } else if (kind === "unordered") {
          const old = b.bank.parentsFirst;
          b.bank.parentsFirst = false;
          b.center.world[unused].elements[0] = 12345;
          restores[k] = () => {
            b.bank.parentsFirst = old;
          };
        } else {
          const math = pair[k].TEST_MATH,
            old = math.sqrt;
          math.sqrt = function (x) {
            calls[k]++;
            return old(x);
          };
          restores[k] = () => {
            math.sqrt = old;
          };
        }
        b.apply(controllers[k].pose, controllers[k].pose, { run: 0.4 });
      }
      if (kind === "unordered")
        for (const b of balances)
          assert.notEqual(
            b.center.world[unused].elements[0],
            12345,
            "unordered bank recomputes the full centre",
          );
      else if (kind === "sqrt")
        assert.ok(
          calls[0] > 0 && calls[0] === calls[1],
          "sqrt hook sees the same calls",
        );
      else
        assert.deepEqual(
          calls,
          [1, 1],
          kind + " falls back to the original FK",
        );
      assert.deepEqual(
        structuredClone(poseSnapshot(balances[1].pose)),
        structuredClone(poseSnapshot(balances[0].pose)),
        kind + " output",
      );
      restores.forEach((fn) => fn());
    }
    for (const values of [
      [0, 0, 0, 0],
      [-0, 0, -0, 1],
      [0.2, -0.5, 0.7, 0.9],
      [NaN, 0, 0, 1],
      [Infinity, 0, 0, 1],
    ]) {
      for (let k = 0; k < 2; k++) {
        const b = prepare(k),
          index = b.rotationWorldIndices[0];
        b.center.q[index].set(...values);
        b.apply(controllers[k].pose, controllers[k].pose, { run: 0.4 });
      }
      assert.deepEqual(
        structuredClone(poseSnapshot(balances[1].pose)),
        structuredClone(poseSnapshot(balances[0].pose)),
        "edge quaternion " + String(values),
      );
    }
  } finally {
    pair.forEach((api) => api.reset());
  }
});
