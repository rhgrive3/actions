// Integration receipt: pack the real native source through the production
// S3 -> touch -> reliability -> quality -> network adapter order.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../adapter.mjs';
const rel='src/game/weapons.js';
const raw=fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js',import.meta.url),'utf8');

test('network Bomb replay clock and owner life guard survive Kit explosion paint composition',()=>{
 const code=adaptNetworkSource(rel,adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,raw)))));
 assert.equal(code.split('const detonationLocalTime = b.ghost ? b._netBornLocal + b.age : null;').length-1,1);
 assert.match(code,/kitBombExplosionPaint\(SUB, b, G.paint\)/);
 assert.match(code,/e\._netLifeStartedAt > detonationLocalTime/);
 assert.match(code,/if \(d <= kitBombRadius\(SUB, b, s.radius\)\)/);
});
