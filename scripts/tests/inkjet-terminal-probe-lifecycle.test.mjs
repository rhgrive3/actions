import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from '../../patches/splatoon3/tests/source-fixture.mjs';
import { makePaintWorld } from '../../patches/splatoon3/tests/paint-authority-fixture.mjs';
import { wireTerminalFxCollider, activateTerminalInkjet } from '../lib/inkjet-terminal-probe.mjs';

// Source-only regression of the native browser probe's boot sequence. Real
// composed FX/Physics are used; this is not GPU/browser/Character acceptance.
test('terminal probe initializes the real director through production FX collider wiring', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const api = f.installedRuntime, { G, THREE } = api;
  makePaintWorld(f);
  const fx = G.fx = new api.FX(G.scene, { quality: .35 });
  try {
    assert.equal(fx.s3SpecialVfx, undefined, 'constructor alone does not initialize the director');
    wireTerminalFxCollider(api, fx);
    const d = fx.s3SpecialVfx;
    assert.ok(d?.kit && d.rounds, 'setCollider initializes the installed production director');
    assert.equal(d.errors, 0);
    const ground = fx.collider(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, -1, 0));
    assert.ok(ground);
    assert.ok(Math.abs(ground.point.y) < 1e-9 && ground.normal.y > .99);
    assert.equal(fx.collider(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 2, 10)), null);
    // Rebuilding the QA world must not leave FX bound to the old Physics.
    makePaintWorld(f, { wall: true });
    const wall = fx.collider(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 2, 10));
    assert.ok(wall);
    assert.ok(Math.abs(wall.point.z - 8) < 1e-9 && wall.normal.z < -.99);
    assert.equal(fx.s3SpecialVfx, d, 'world replacement does not recreate the director');
  } finally { fx.dispose(); }
});

test('native browser setup wires FX before keeping the strict composed-director assertion', () => {
  const source = fs.readFileSync(new URL('../lib/inkjet-terminal-probe.mjs', import.meta.url), 'utf8');
  assert.match(source, /G\.fx=new api\.FX\(scene,\{quality:\.35\}\);\s*wireTerminalFxCollider\(api,G\.fx\);\s*assert\(!!G\.fx\.s3SpecialVfx,'production-composed Inkjet director'\)/);
});


test('terminal activation follows the native continuously depleted Inkjet gauge', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
    extraExports: "export {applyCatalogueChoice} from './patches/splatoon3/runtime/catalogue.mjs';" });
  makePaintWorld(f);
  const a=f.make('shooter'), before=a.stats.specials;
  const paid=activateTerminalInkjet(a,f.applyCatalogueChoice,f.installedRuntime,(ok,label)=>assert.ok(ok,label));
  assert.equal(a.stats.specials,before+1);
  assert.equal(a.specialActive.id,'inkjet');
  assert.equal(a.special,paid,'native active gauge starts full, then depletes with action time');
  f.tick(a,1);
  assert.ok(a.special>0 && a.special<paid,'normal native update consumes the paid gauge');
});
