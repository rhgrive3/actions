// Only immutable adapted text and V8 compilation data are cached; each test
// still links/evaluates fresh SourceTextModules in fresh VM contexts.
function boundedCache(maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
    throw new RangeError('cache limit must be positive');
  const entries = new Map();
  let used = 0;
  return {
    get(key) {
      const entry = entries.get(key);
      if (entry) { entries.delete(key); entries.set(key, entry); }
      return entry;
    },
    put(key, entry, bytes) {
      const old = entries.get(key);
      if (old) { used -= old.bytes; entries.delete(key); }
      if (bytes > maxBytes) return;
      while (used + bytes > maxBytes && entries.size) {
        const first = entries.keys().next().value;
        used -= entries.get(first).bytes;
        entries.delete(first);
      }
      entries.set(key, { ...entry, bytes });
      used += bytes;
    },
  };
}

// Invalidation by *exact* raw source content retains strict source-drift checks.
export function memoizeFixtureSourceAdapter(adapter, maxBytes = 12 * 1024 * 1024) {
  if (typeof adapter !== 'function') throw new TypeError('source adapter must be callable');
  const cache = boundedCache(maxBytes);
  return (path, raw) => {
    if (typeof path !== 'string' || typeof raw !== 'string') return adapter(path, raw);
    const hit = cache.get(path);
    if (hit?.raw === raw) return hit.result;
    const result = adapter(path, raw);
    if (typeof result === 'string')
      cache.put(path, { raw, result }, 2 * (raw.length + result.length));
    return result;
  };
}

// V8 can execute stale code if cachedData belongs to different source bytes.
// Therefore a matching identifier alone is NEVER enough: compare full text.
export function memoizeFixtureVmCompiler(Module, maxBytes = 12 * 1024 * 1024) {
  // Some validation CLIs import source-fixture before rejecting an unsupported
  // fixture root, without --experimental-vm-modules. Defer this error until a
  // VM compilation is actually requested so early guards remain effective.
  if (typeof Module !== 'function') return () => { throw new TypeError('SourceTextModule constructor required'); };
  const cache = boundedCache(maxBytes);
  return (source, options) => {
    const id = options?.identifier;
    if (typeof source !== 'string' || typeof id !== 'string')
      return new Module(source, options);
    const hit = cache.get(id);
    if (hit?.source === source)
      return new Module(source, { ...options, cachedData: hit.data });
    const mod = new Module(source, options);
    if (typeof mod.createCachedData === 'function') {
      const data = mod.createCachedData();
      if (data?.byteLength)
        cache.put(id, { source, data }, source.length * 2 + data.byteLength);
    }
    return mod;
  };
}
