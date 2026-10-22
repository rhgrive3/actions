// QA-only evidence for the native music timer. Never exempt arbitrary blob scripts.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const MUSIC_TIMER_SOURCE = 'let id=0;onmessage=(e)=>{clearInterval(id);if(e.data>0)id=setInterval(()=>postMessage(0),e.data)}';
export const isMusicOwner = rel => /^(?:_versions\/[^/]+\/)?src\/audio\/music\.js$/.test(rel);

// Observe object URL creation without replacing its Blob, Worker, timer, or RNG.
// Direct caller stack and actual immutable Blob bytes are retained separately
// from the stable A/A identity (random object URLs are not source identities).
export function observeBlobCreation() {
  const original = URL.createObjectURL, pending = [];
  URL.createObjectURL = function(blob) {
    const stack = new Error().stack;
    const url = Reflect.apply(original, this, arguments);
    if (blob instanceof Blob) pending.push(blob.text().then(body => ({ url, body, mime: blob.type, stack })));
    return url;
  };
  Object.defineProperty(window, '__rollerBlobCreations', { value: () => Promise.all(pending) });
}

export function verifyMusicWorkers(evidence, loaded, manifest) {
  assert(evidence && Array.isArray(evidence.responses) && Array.isArray(evidence.creations) &&
    Array.isArray(evidence.workers) && Array.isArray(evidence.owners), 'Missing Blob provenance');
  const origin = new URL(evidence.origin);
  assert(['http:', 'https:'].includes(origin.protocol) && origin.origin === evidence.origin, 'Invalid capture origin');
  const records = [];
  const workers = new Set(evidence.workers);
  assert(workers.size > 0, 'Native music Worker evidence is required');
  assert.equal(workers.size, evidence.workers.length, 'Duplicate observed worker');
  assert.equal(evidence.responses.length, workers.size, 'Worker response coverage differs');
  const seen = new Set();
  for (const response of evidence.responses) {
    const url = new URL(response.url);
    assert.equal(url.protocol, 'blob:', 'Dynamic script must preserve blob protocol');
    assert.equal(response.protocol, url.protocol, 'Raw response protocol differs');
    assert.equal(url.origin, origin.origin, 'Foreign Blob script origin');
    assert(workers.has(response.url) && !seen.has(response.url), 'Blob script is not a unique observed Worker');
    seen.add(response.url);
    assert.equal(response.body, MUSIC_TIMER_SOURCE, 'Unreviewed Blob worker bytes');
    assert.equal(response.sha256, hash(Buffer.from(response.body)), 'Blob response hash differs');
    assert.equal(response.bytes, Buffer.byteLength(response.body), 'Blob response length differs');
    const creations = evidence.creations.filter(c => c.url === response.url);
    assert.equal(creations.length, 1, 'Missing or ambiguous Blob creator');
    const creation = creations[0];
    assert.equal(creation.body, response.body, 'Created Blob differs from observed response');
    assert.equal(creation.mime, 'text/javascript', 'Unexpected Blob type');
    // Chromium stacks: Error, observer frame, then the immediate native caller.
    // Never search deeper frames: a foreign helper called by music is not music.
    const caller = creation.stack?.split('\n')[2]?.match(/(?:\(|\s)(https?:\/\/[^\s)]+):(\d+):(\d+)\)?$/);
    assert(caller, 'Missing direct Blob creator frame');
    const ownerURL = new URL(caller[1]);
    assert.equal(ownerURL.origin, origin.origin, 'Foreign Blob creator');
    assert.equal(ownerURL.search + ownerURL.hash, '', 'Unexpected creator URL suffix');
    const rel = decodeURIComponent(ownerURL.pathname).replace(/^\//, '');
    assert(isMusicOwner(rel), 'Blob creator is not the native music owner');
    if (rel.startsWith('_versions/')) assert.equal(rel, `_versions/${manifest.build.revision}/src/audio/music.js`, 'Wrong versioned music owner');
    const owners = evidence.owners.filter(o => o.url === ownerURL.href);
    assert.equal(owners.length, 1, 'Missing or ambiguous observed music owner bytes');
    const owner = owners[0], ownerHash = hash(Buffer.from(owner.body));
    assert(Object.hasOwn(manifest.artifacts, rel), 'Unbound music owner');
    assert.equal(ownerHash, manifest.artifacts[rel], 'Music owner differs from manifest');
    assert.equal(loaded[rel]?.sha256, ownerHash, 'Music owner was not loaded');
    assert.equal(loaded[rel]?.bytes, Buffer.byteLength(owner.body), 'Music owner length differs');
    assert(owner.body.includes(JSON.stringify(MUSIC_TIMER_SOURCE)) || owner.body.includes("'" + MUSIC_TIMER_SOURCE + "'"), 'Timer literal absent from actual music owner');
    records.push({ kind: 'native-music-timer-worker', protocol: 'blob:', owner: rel,
      ownerSha256: ownerHash, sha256: response.sha256, bytes: response.bytes });
  }
  return records.sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
