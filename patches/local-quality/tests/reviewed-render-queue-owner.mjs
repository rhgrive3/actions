import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const hash=value=>createHash('sha256').update(value).digest('hex');
const bytes=fs.readFileSync(new URL('./fixtures/queue-reviewed-render-owner-20261031.json',import.meta.url));
assert.equal(hash(bytes),'d8bff03e27cb45cdd734e43f3a6ebce45e187699d615d8363198184168d6279c','sealed later render queue owner');
const descriptor=JSON.parse(bytes);
assert.equal(descriptor.schema,1);

export const reviewedRenderOwnerPaths=Object.freeze(Object.keys(descriptor.owners));

// This is an additional text-only owner boundary. Never rewrite the older
// motion descriptor or frozen historical fixture to match the latest source.
export function reverseReviewedRenderQueueOwner(source,rel,mutate=value=>value) {
  const owner=descriptor.owners[rel];
  if(!owner)return source;
  assert.equal(hash(source),owner.currentSha256,'complete current render owner: '+rel);
  let prior=source;
  for(const [index,hunk] of owner.hunks.entries()) {
    prior=mutate(prior,hunk.current,index);
    assert.equal(prior.split(hunk.current).length-1,hunk.count,'exact render owner count: '+hunk.label);
    prior=prior.split(hunk.current).join(hunk.prior);
  }
  assert.equal(hash(prior),owner.priorSha256,'complete independent preceding render owner: '+rel);
  return prior;
}

export function replayReviewedRenderQueueOwner(source,rel) {
  const owner=descriptor.owners[rel];assert(owner,'unknown render owner');
  assert.equal(hash(source),owner.priorSha256,'complete preceding render owner: '+rel);
  let current=source;
  for(const hunk of [...owner.hunks].reverse()) {
    assert.equal(current.split(hunk.prior).length-1,hunk.count,'exact preceding render owner count: '+hunk.label);
    current=current.split(hunk.prior).join(hunk.current);
  }
  assert.equal(hash(current),owner.currentSha256,'complete independently replayed render owner: '+rel);
  return current;
}

export function reviewedRenderHunkCount(rel) { return descriptor.owners[rel]?.hunks.length??0; }
