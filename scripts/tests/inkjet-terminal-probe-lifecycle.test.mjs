import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from '../../patches/splatoon3/tests/source-fixture.mjs';
import { makePaintWorld } from '../../patches/splatoon3/tests/paint-authority-fixture.mjs';
import { wireTerminalFxCollider, activatePaidTerminalInkjet } from '../lib/inkjet-terminal-probe.mjs';

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


test('terminal probe accepts native paid activation with the authoritative active gauge', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
    extraExports: "export { applyCatalogueChoice } from './patches/splatoon3/runtime/catalogue.mjs'; export { activeSpecialGaugeState } from './patches/splatoon3/runtime/active-special-gauge.mjs';" });
  makePaintWorld(f);
  const a=f.make('shooter'); a.isLocal=true; a.form='kid'; f.G.match.state='playing';
  assert.equal(f.applyCatalogueChoice(a,{sub:'bomb',special:'inkjet'},f.installedRuntime),true);
  const before=a.stats.specials, paid=activatePaidTerminalInkjet(a,assert.ok);
  assert.equal(a.stats.specials,before+1);
  assert.equal(a.special,paid, 'active gauge starts full, rather than immediately zero');
  assert.ok(f.activeSpecialGaugeState(a), 'native authoritative gauge owns the paid action');
  assert.equal(a.specialReady(),false, 'the remaining gauge cannot buy another activation');
  a._startSpecial();
  assert.equal(a.stats.specials,before+1, 'repeat activation is denied');
  a._updateSpecial(1/60);
  assert.ok(a.special>0 && a.special<paid, 'native action clock depletes the reserved gauge');
  for(let i=0;i<600 && a.specialActive;i++) { f.G.time+=1/60; a._updateSpecial(1/60); }
  assert.equal(a.specialActive,null, 'native action terminates');
  assert.equal(a.special,0, 'completed action consumes its remaining gauge');
  assert.equal(f.activeSpecialGaugeState(a),null, 'termination releases the authoritative gauge');
});

test('paid terminal guard rejects an activation that did not charge an action', () => {
  for (const mutate of [a=>{}, a=>{a.specialActive={id:'inkjet'};}, a=>{a.specialActive={id:'inkjet'};a.stats.specials++;a.special=0;}]) {
    const a={special:0,stats:{specials:0},specialCost:()=>200,specialReady(){return !this.specialActive;},_startSpecial(){mutate(this);}};
    assert.throws(()=>activatePaidTerminalInkjet(a,assert.ok),/native paid Inkjet activation/);
  }
});

test('paid terminal guard rejects native remote and dead owners without admitting an action', async () => {
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  for(const blocked of ['remote','dead']) {
    const a=f.make('shooter'); a.weapon={...a.weapon,special:'inkjet'};
    if(blocked==='remote')a.remote=true;else a.alive=false;
    const before=a.stats.specials;
    assert.throws(()=>activatePaidTerminalInkjet(a,assert.ok),/native (?:paid Inkjet activation|Inkjet ready before paid activation)/);
    assert.equal(a.stats.specials,before,blocked+' cannot pay for an activation');
    assert.equal(a.specialActive,null);
  }
});
