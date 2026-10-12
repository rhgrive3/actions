import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './source-fixture.mjs';

test('rectangular mask probe supplies the production level contract, including native dead-cell dispatch', async () => {
  const {PaintSystem} = await fixture({productionComposition:true});
  const source = fs.readFileSync(new URL('./paint-mask-browser-fixture.mjs', import.meta.url), 'utf8');
  const setup = source.match(/export function createPaintMaskProbe\(\) \{([\s\S]*?)\n\}/)?.[1];
  assert(setup, 'execute the actual browser probe setup');
  const create = () => new Function('PaintSystem', setup)(PaintSystem);
  const face = {atlas:{x:0,y:0,pad:2,ppm:64},su:32,sv:32,nu:128,nv:128,cu:.25,cv:.25,grid:0,wall:false,turf:true};
  const splat = paint => paint._cpuSplat(face,16,20,2.7,0,Math.PI/60,.6,.8,1,6);
  const legacy = create();
  assert.equal(legacy.level.native, false, 'this fixture tests a complete rectangular legacy atlas');
  assert(splat(legacy) > 0, 'actual composed Roller body must claim grid cells');
  assert(legacy.grid.some(Boolean));

  const missing = create();
  delete missing.level;
  assert.throws(() => splat(missing), /Cannot read properties of undefined.*native/,
    'negative control reproduces the former constructor-bypass failure');

  const native = create();
  native.level.native = true;
  native.dead.fill(1);
  assert.equal(splat(native), 0, 'native invalid cells remain excluded by the real composed CPU path');
  assert.equal(native.grid.some(Boolean), false);
});
