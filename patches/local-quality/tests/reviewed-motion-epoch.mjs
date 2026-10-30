import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const hash=value=>createHash('sha256').update(value).digest('hex');
const bytes=fs.readFileSync(new URL('./fixtures/queue-reviewed-motion-epoch-20261030.json',import.meta.url));
assert.equal(hash(bytes),'1510866b790f61d7182a7d6ed28a350792b8a4dc63d05947ed6d3d0d548297d9','sealed reviewed motion epoch');
const descriptor=JSON.parse(bytes);
assert.equal(descriptor.schema,1);

// Reconstruct the preceding independent historical owner chain using only the
// exact later-reviewed source hunks; all remaining bytes must match its hash.
export function reverseReviewedMotionEpoch(source,owner) {
  const epoch=descriptor.owners[owner];assert(epoch,'unknown reviewed motion owner');
  assert.equal(hash(source),epoch.currentSha256,'complete reviewed current owner');
  let prior=source;
  for(const {current,prior:before} of epoch.hunks){
    assert.equal(prior.split(current).length,2,'one exact reviewed motion hunk');
    prior=prior.replace(current,before);
  }
  assert.equal(hash(prior),epoch.priorSha256,'complete independent previous owner');
  return prior;
}

export function reverseReviewedCharacterWave(source) {
  assert.equal(hash(source),'83b3cee63f496a94949e6f7ea39e4dcb82f3212136ba1718c66a2cc0779e435b','complete current Wave owner');
  const h=descriptor.owners.character.hunks.find(row=>row.current.includes('if (dot(uIwRim.rgb, uIwRim.rgb) > 0.0)'));
  assert(h);assert.equal(source.split(h.current).length,2,'one reviewed rim shader hunk');
  const prior=source.replace(h.current,h.prior);
  assert.equal(hash(prior),descriptor.owners.character.priorSha256,'complete previous Wave owner');
  return prior;
}
