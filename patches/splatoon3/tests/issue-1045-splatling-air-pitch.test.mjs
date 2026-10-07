import test from 'node:test';
import assert from 'node:assert/strict';
import { spreadWeaponRound } from '../runtime/weapon-edgecases.mjs';
const THREE = await import(new URL('../../../inkwave-public/vendor/three/build/three.module.js', import.meta.url));
const DEG = Math.PI / 180;

function withRandom(values, fn) {
  const old = Math.random; let i = 0;
  Math.random = () => values[i++ % values.length];
  try { return fn(); } finally { Math.random = old; }
}
function pitch(v) { return Math.atan2(v.y, Math.hypot(v.x, v.z)); }
function yaw(v) { return Math.atan2(v.x, v.z); }

test('#1045 airborne Heavy Splatling keeps 1.6deg vertical envelope with 7deg horizontal spread', () => {
  let fallbacks = 0;
  const system = { _spread: v => { fallbacks++; return v; } };
  const w = { kind: 'splatling', spreadGround: 3.3, spreadAir: 7, spreadPitchGround: 1.6 };
  const a = { grounded: false };
  const vertical = withRandom([1, .25], () => spreadWeaponRound(system, new THREE.Vector3(0, 0, 1), a, w));
  assert.equal(fallbacks, 0, 'airborne Splatling must not fall back to the generic compressed cone');
  assert.ok(Math.abs(Math.abs(pitch(vertical)) / DEG - 1.6) < 1e-9);

  const horizontal = withRandom([1, 0], () => spreadWeaponRound(system, new THREE.Vector3(0, 0, 1), a, w));
  assert.ok(Math.abs(Math.abs(yaw(horizontal)) / DEG - 7) < 1e-9);
});
