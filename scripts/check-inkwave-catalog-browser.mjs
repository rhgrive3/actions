#!/usr/bin/env node
// Browser evidence for all sourced main-weapon catalog records. Physics and
// display are controlled fixtures; this does not establish Switch or retail parity.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const args = process.argv.slice(2);
const site = path.resolve(args.find(arg => !arg.startsWith('--')) || '_site');
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json'), 'utf8'));
for (const [file, digest] of Object.entries(manifest.artifacts)) {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(site, file))).digest('hex'), digest, file);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/probe') {
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>');
    return;
  }
  const file = path.resolve(site, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(site + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.setHeader('content-type', file.endsWith('.json') ? 'application/json' : 'text/javascript');
  fs.createReadStream(file).pipe(res);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  const results = [];
  const engines = args.includes('--webkit') ? ['chromium', 'webkit'] : ['chromium'];
  for (const engine of engines) {
    browser = await ({ chromium, webkit })[engine].launch({
      headless: true,
      ...(engine === 'chromium' ? {
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader'],
      } : {}),
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/probe`);

    const result = await page.evaluate(async () => {
      const check = (value, message) => { if (!value) throw new Error(message); };
      const finiteVector = value => value && [value.x, value.y, value.z].every(Number.isFinite);

      const profile = await fetch('/patches/splatoon3/profile.json').then(response => {
        if (!response.ok) throw new Error('Could not load compiled gameplay profile');
        return response.json();
      });
      const { install } = await import('/patches/splatoon3/runtime/install.mjs');
      const api = install(profile);
      const [{ installMainWeaponCatalogRuntime }, { MAIN_WEAPON_CATALOG }] = await Promise.all([
        import('/patches/splatoon3/runtime/main-weapon-catalog.mjs'),
        import('/patches/splatoon3/runtime/main-weapon-catalog-data.mjs'),
      ]);
      const runtime = installMainWeaponCatalogRuntime(api, profile);
      const { THREE, G, PLAYER: Player, WEAPONS, WEAPON_ORDER, Actor, Projectiles, NetMatch } = api;
      check(Player.inkMax === 100, 'catalog probe starts at 100 ink');

      check(MAIN_WEAPON_CATALOG.schema === 1, 'catalog schema');
      check(MAIN_WEAPON_CATALOG.referenceVersion === '11.3.0', 'catalog source version');
      check(MAIN_WEAPON_CATALOG.sourceCommit === '7280ff9cde8bb1c5dcef46c700c326471584d2e6', 'catalog pinned source commit');
      const records = MAIN_WEAPON_CATALOG.records;
      const ids = records.map(record => record.id);
      check(records.length === 65, `expected 65 records, got ${records.length}`);
      check(new Set(ids).size === records.length, 'catalog IDs are unique');
      check(runtime.records === records.length, 'runtime registered all catalog records');

      const familyCounts = {};
      const newRecords = [];
      let legacyCount = 0;
      for (const record of records) {
        check(typeof record.id === 'string' && record.id.length > 0, 'record ID');
        check(typeof record.sourceActor === 'string' && record.sourceActor.startsWith('Weapon'), `${record.id} source actor`);
        check(record.sourcePath.startsWith('data/parameter/1130/weapon/'), `${record.id} source path/version`);
        check(/^[0-9a-f]{64}$/.test(record.sourceSha256), `${record.id} source SHA-256`);
        check(record.names?.en?.trim() && record.names?.ja?.trim(), `${record.id} bilingual names`);
        const weapon = WEAPONS[record.id];
        check(weapon?.sourceMainActor === record.sourceActor, `${record.id} registered source actor`);
        check(weapon.referenceNames?.en === record.names.en && weapon.referenceNames?.ja === record.names.ja,
          `${record.id} registered language metadata`);
        if (record.legacy) {
          legacyCount++;
          continue;
        }
        check(weapon.catalogRecord === record, `${record.id} registered catalog record`);
        newRecords.push(record);
        familyCounts[record.family] = (familyCounts[record.family] || 0) + 1;
      }
      check(legacyCount === 7, `expected 7 existing weapons, got ${legacyCount}`);
      check(newRecords.length === 58, `expected 58 new weapons, got ${newRecords.length}`);
      const order = WEAPON_ORDER.filter(id => newRecords.some(record => record.id === id));
      check(JSON.stringify(order) === JSON.stringify(newRecords.map(record => record.id)), 'new weapon order follows catalog order');

      G.time = 0;
      G.scene = new THREE.Scene();
      G.teamColors = [new THREE.Color('#f80'), new THREE.Color('#03f')];
      G.actors = [];
      G.level = { blocks: [], groundHeight: () => 0, queryBlocks: (_a, _b, _c, _d, out) => { out.length = 0; return out; } };
      G.physics = {
        los: () => true,
        raycast: (_origin, _direction, _distance, hit) => { hit.hit = false; return hit; },
        segment: (_from, _to, hit) => { hit.hit = false; return hit; },
      };
      G.paint = { sample: () => 0, splat: () => 0 };
      G.match = { playing: () => true, canRespawn: () => false };
      G.projectiles = new Projectiles(G.scene);
      G.netm = null;

      class DisplayCharacter {
        constructor(options) { this.weapon = options.weapon; this.root = new THREE.Group(); this.owner = null; }
        _owner() { return this.owner; }
        _runner() { return this.owner?.weaponRunner; }
        trigger() {}
        setVisible() {}
        setHurt() {}
        setWeapon(id) { this.weapon = id; }
        aimReady() { return 1; }
        getMuzzle(out) { return out.copy(this.owner.pos).add(new THREE.Vector3(0, 1.05, 0)); }
      }
      const makeActor = (id, nid = undefined) => {
        const actor = new Actor({ team: 0, name: `catalog-${id}`, weapon: id, CharacterClass: DisplayCharacter });
        actor.character.owner = actor;
        actor.nid = nid;
        actor.isLocal = false;
        actor.form = 'kid';
        actor.grounded = true;
        actor.ink = Player.inkMax;
        actor.pos.set(0, 0, 0);
        actor.vel.set(0, 0, 0);
        actor.aimDir.set(0, 0, 1);
        actor.aimPoint.set(0, 1.05, 100);
        return actor;
      };

      let totalProjectiles = 0;
      const emissions = [];
      for (const record of newRecords) {
        G.projectiles.clear();
        const actor = makeActor(record.id);
        G.actors = [actor];
        for (let frame = 0; frame < 160; frame++)
          actor.weaponRunner.update(1 / 60, { fire: true, firePressed: frame === 0, sub: false });
        for (let frame = 0; frame < 35; frame++)
          actor.weaponRunner.update(1 / 60, { fire: false, firePressed: false, sub: false });

        const shots = G.projectiles.list.filter(projectile => projectile.owner === actor && !projectile.ghost);
        check(shots.length > 0, `${record.id} did not emit a projectile`);
        check(Number.isFinite(actor.ink) && actor.ink >= 0 && actor.ink <= 100, `${record.id} finite ink`);
        for (const projectile of shots) {
          check(finiteVector(projectile.pos), `${record.id} finite projectile position`);
          check(finiteVector(projectile.vel), `${record.id} finite projectile velocity`);
        }
        totalProjectiles += shots.length;
        emissions.push({ id: record.id, family: record.family, count: shots.length, ink: actor.ink });
      }

      // Exercise the normal NetMatch recorder footer and native Projectiles ghost
      // constructor with one added Shooter. The render surface is stubbed above.
      G.projectiles.clear();
      const shooter = newRecords.find(record => record.family === 'shooter');
      check(shooter, 'catalog has a new Shooter');
      const sender = new NetMatch({ myId: 'catalog-local', isHost: true, _inkwaveEventSeq: 0 }, { id: 'catalog-probe' });
      const owner = makeActor(shooter.id, 1);
      owner.remote = false;
      G.actors = [owner];
      G.netm = sender;
      owner.weaponRunner.update(1 / 60, { fire: true, firePressed: true, sub: false });
      const recorded = sender.out.find(event => event[1] === 'p');
      check(recorded, 'native recorder produced a projectile packet');
      check(recorded[27]?.s3Catalog?.[0] === 1, 'recorded catalog projectile metadata');
      const packet = JSON.parse(JSON.stringify(recorded));
      packet._netTick = packet.at(-2);
      packet._netSeq = packet.at(-1);
      check(packet._netTick === 0 && packet._netSeq === 1, 'native owner tick/sequence footer');

      const remote = makeActor(shooter.id, 2);
      remote.remote = true;
      remote.owner = 'catalog-peer';
      const ghost = G.projectiles.ghostProjectile(remote, packet);
      check(ghost?.ghost === true, 'native ghost was created');
      check(ghost.catalog?.r?.id === shooter.id, 'ghost retained its catalog record');

      return {
        records: records.length,
        legacy: legacyCount,
        added: newRecords.length,
        sourceVersion: MAIN_WEAPON_CATALOG.referenceVersion,
        sourceCommit: MAIN_WEAPON_CATALOG.sourceCommit,
        sourceHashes: records.length,
        bilingualMetadata: records.length,
        familyCounts,
        emittedWeapons: emissions.length,
        totalProjectiles,
        firingFrames: { hold: 160, release: 35 },
        ghost: { weapon: shooter.id, retainedCatalog: true, tick: packet._netTick, sequence: packet._netSeq },
      };
    });

    assert.deepEqual(errors, [], `${engine} page errors`);
    results.push({ engine, ...result });
    await browser.close();
    browser = null;
  }
  console.log(JSON.stringify({ build: manifest.build.revision, results }, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
