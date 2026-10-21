// Exact emitted launch/ghost acceptance. This deliberately has no source fallback.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const required = [
  'vendor/three/build/three.module.js', 'src/core/ctx.js', 'src/game/weapons.js',
  'src/net/netmatch.js', 'patches/network-replication/paint-authority.mjs',
  'patches/splatoon3/runtime/weapons.mjs', 'patches/splatoon3/runtime/weapon-edgecases.mjs',
  'patches/splatoon3/profile.json',
];
function contained(root, name) {
  const file = fs.realpathSync(path.resolve(root, name));
  assert(file.startsWith(root + path.sep), 'emitted path escapes immutable namespace: ' + name);
  return file;
}
export function verifyLaunchSite(site, expectedManifestHash) {
  assert(site, '--site must name an existing emitted build');
  assert.match(expectedManifestHash || '', /^[a-f0-9]{64}$/, 'a pinned manifest SHA256 is required');
  site = fs.realpathSync(site);
  const bytes = fs.readFileSync(contained(site, 'inkwave-build.json'));
  assert.equal(hash(bytes), expectedManifestHash, 'pinned build manifest');
  const manifest = JSON.parse(bytes), revision = manifest.build?.revision;
  assert.match(revision || '', /^[a-f0-9]{64}$/, 'immutable build revision');
  assert.equal(manifest.build.optimization, 'esbuild-minify', 'production emitted optimization');
  assert.equal(hash(JSON.stringify(manifest.files)), manifest.inputHash, 'source-input receipt');
  assert.equal(hash(JSON.stringify(manifest.artifacts)), manifest.contentHash, 'emitted artifact receipt');
  const prefix = '_versions/' + revision + '/', runtime = contained(site, prefix);
  const checked = new Map();
  for (const [name, expected] of Object.entries(manifest.artifacts)) {
    if (!name.startsWith(prefix) || !/\.(?:mjs|js|json)$/.test(name)) continue;
    const relative = name.slice(prefix.length), file = contained(runtime, relative);
    assert.equal(hash(fs.readFileSync(file)), expected, 'emitted bytes: ' + relative);
    checked.set(relative, expected);
  }
  for (const name of required) assert(checked.has(name), 'required emitted module: ' + name);
  // weapons-fixture selects source only when this vendor file is absent. It is
  // already present, namespace-contained and hashed before calling the fixture.
  assert(fs.statSync(contained(runtime, required[0])).isFile(), 'emitted vendor is required');
  return { site, runtime, manifest, manifestHash: expectedManifestHash, checked };
}
export async function runLaunchPackets(site, expectedManifestHash) {
  const verified = verifyLaunchSite(site, expectedManifestHash);
  const { fixture } = await import('./weapons-fixture.mjs');
  const rows = [], loaded = new Map();
  for (const kind of ['roller', 'splatling']) {
    const f = await fixture({ site: verified.runtime, fidelity: true, network: true });
    for (const file of f.sourceFiles) {
      const real = fs.realpathSync(file);
      assert(real.startsWith(verified.runtime + path.sep), 'runtime cannot fall back to checkout source');
      const relative = path.relative(verified.runtime, real).split(path.sep).join('/');
      assert(verified.checked.has(relative), 'loaded module must be in the immutable manifest: ' + relative);
      assert.equal(hash(fs.readFileSync(real)), verified.checked.get(relative), 'loaded bytes remain pinned: ' + relative);
      loaded.set(relative, verified.checked.get(relative));
    }
    const a = f.make(kind), ps = f.projectiles;
    Object.assign(a, { isLocal: true, nid: 1, owner: 'owner' });
    const nm = new f.NetMatch({ myId: 'owner', hostId: 'owner', isHost: true,
      _members: new Map([['owner', 'Owner']]) }, { id: 'emitted-launch' });
    nm.bind({ actors: [a] }); nm.mute = 0; nm.out = []; nm.eventSeq = 0;
    try {
      if (kind === 'roller') ps.fireFlick(a, a.weapon);
      else ps.fireSplatling(a, a.weapon, 3.3);
      const packets = nm.out.filter(e => e[1] === 'p'), paint = nm.out.filter(e => e[1] === 's');
      assert.equal(packets.length, kind === 'roller' ? 13 : 1, 'original launch packet count');
      assert.equal(paint.length, kind === 'roller' ? 1 : 0, 'original launch paint count');
      if (paint.length) assert.deepEqual(Array.from(paint[0][14][4]),
        ['inkwave-paint-authority-v1', 'actor', 1, 0], 'real roster-bound paint authority');
      const before = nm.out.length;
      const initial = packets.map(e => new f.THREE.Vector3(e[8], e[9], e[10]));
      ps.clear();
      for (const packet of packets) ps.ghostProjectile(a, packet);
      assert.equal(ps.list.length, packets.length, 'original ghost packet count');
      let maxVelocityError = 0;
      ps.list.forEach((p, i) => {
        assert.ok(p.ghost);
        for (const axis of ['x', 'y', 'z']) {
          const error = Math.abs(p.vel[axis] - initial[i][axis]);
          assert.ok(error < .011, 'original transmitted velocity tolerance');
          maxVelocityError = Math.max(maxVelocityError, error);
        }
      });
      assert.equal(nm.out.length, before, 'ghost replay emits no duplicate owner events');
      rows.push({ kind, projectiles: packets.length, paint: paint.length,
        ghosts: ps.list.length, maxVelocityError, duplicateEvents: nm.out.length - before });
    } finally { ps.clear(); nm.dispose(); }
  }
  for (const name of required.filter(name => /\.[cm]?js$/.test(name)))
    assert(loaded.has(name), 'required runtime was actually imported: ' + name);
  return { status: 'passed', mode: 'exact-emitted-no-source-fallback',
    manifestSha256: verified.manifestHash, inputHash: verified.manifest.inputHash,
    contentHash: verified.manifest.contentHash, buildRevision: verified.manifest.build.revision,
    verifiedRuntimeFiles: verified.checked.size, loaded: Object.fromEntries([...loaded].sort()), rows };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), option = name => {
    const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1];
  };
  const result = await runLaunchPackets(option('--site'), option('--manifest-sha256'));
  const out = option('--out');
  if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n'); }
  console.log(JSON.stringify({ ...result, loaded: Object.keys(result.loaded).length }));
}
