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
        check(weapon.name === record.names[api.LANG], `${record.id} boot language applies after registration`);
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
      // Special movement calls the real collision/integration owner as well as
      // projectile queries; a raycast-only mock cannot exercise that path.
      G.physics = new api.Physics(G.level);
      G.paint = { sample: () => 0, splat: () => 0 };
      G.match = { playing: () => true, canRespawn: () => false };
      G.projectiles = new Projectiles(G.scene);
      G.netm = null;

      class DisplayCharacter {
        constructor(options) { this.weapon = options.weapon; this.root = new THREE.Group(); this.owner = null; }
        _owner() { return this.owner; }
        _runner() { return this.owner?.weaponRunner; }
        update() { this.updatedFrames = (this.updatedFrames || 0) + 1; }
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

      const {CANONICAL_KITS}=await import('/patches/splatoon3/runtime/canonical-kits-data.mjs');
      const {WEAPON_WEIGHTS}=await import('/patches/splatoon3/runtime/weapon-weight-data.mjs');
      const {WEIGHT_SPEED_CURVES}=await import('/patches/splatoon3/runtime/weapon-weight.mjs');
      const {gearCurve,emptyLoadout}=await import('/patches/splatoon3/runtime/gear.mjs');
      const weightChecks=[];
      for(const record of records)for(const ap of [0,10,57]){
        const a=makeActor(record.id), l=emptyLoadout();
        if(ap===10)l[0].main='runSpeed';
        if(ap===57)for(const p of l){p.main='runSpeed';p.subs.fill('runSpeed');}
        a.s3.loadout=l;a.s3RefreshGear();
        const curve=WEIGHT_SPEED_CURVES[WEAPON_WEIGHTS[record.id].speed];
        const expected=gearCurve(ap,...curve.run)*60;
        check(Math.abs(a.weaponRunner.moveSpeed()-expected)<1e-8,record.id+' weighted run '+ap);
        check(a.s3.modifiers.inkSaverMain>0,record.id+' nonnegative ink sentinel');
        weightChecks.push({id:record.id,ap,speed:a.weaponRunner.moveSpeed(),weight:WEAPON_WEIGHTS[record.id].speed});
        a.weaponRunner.aimingSub=true;check(a.weaponRunner.moveSpeed()===profile.bomb.holdMoveSpeed,record.id+' sub-ready movement');
      }
      const uniqueGearChecks=[];
      for(const ap of [0,10,57]){
        const a=makeActor('shooter');G.actors=[a];const l=emptyLoadout();
        if(ap===10)l[0].main='specialPower';if(ap===57)for(const p of l){p.main='specialPower';p.subs.fill('specialPower');}
        a.s3.loadout=l;a.s3RefreshGear();a.weapon={...a.weapon,special:'zipcaster',specialCost:100};a.special=100;
        a._startSpecial();const state=a._s3AllSpecialState;check(state?.id==='zipcaster','Zipcaster state');
        for(let frame=0;frame<60;frame++)a._updateSpecial(1/60);
        check(Math.abs(state.inkFuel-(150-gearCurve(ap,15,13.05,12)))<1e-8,'Zipcaster browser drain '+ap);
        uniqueGearChecks.push({ability:'specialPower',ap,zipcasterFuel:state.inkFuel});a.reset();
      }
      const conditionalChecks=[];
      {
        const previous=G.match,a=makeActor('shooter'),e1=makeActor('shooter'),e2=makeActor('shooter');e1.team=e2.team=1;G.actors=[a,e1,e2];
        G.match={state:'playing',playing:()=>true,canRespawn:()=>false,actors:G.actors,time:180,duration:180};
        a.s3.loadout=emptyLoadout();a.s3.loadout[0].main='tenacity';a.s3RefreshGear();a.special=0;
        for(let frame=0;frame<60;frame++)a.update(1/60);
        check(Math.abs(a.special-3.24)<1e-8,'Tenacity installed Actor update');
        check(a.character.updatedFrames===60,'Tenacity fixture reaches display update for all native frames');
        conditionalChecks.push({ability:'tenacity',gauge:a.special});
        a.s3.loadout[0].main='lastDitchEffort';G.match.mode='zones';G.match.time=20;a.s3RefreshGear();
        check((a.s3.abilityPoints.inkSaverMain||0)===0,'uninstalled ranked feature stays inactive');
        G.match.mode='turf';a.s3RefreshGear();check(a.s3.abilityPoints.inkSaverMain===18,'ordinary final turf window retained');
        conditionalChecks.push({ability:'lastDitchEffort',uninstalledRanked:0,turfFinalWindow:18});G.match=previous;
      }
      const objectGearChecks=[];
      for(const id of ['booyahBomb','crabTank'])for(const equipped of [false,true]){
        const defender=makeActor('shooter'),attacker=makeActor('shooter');attacker.team=1;attacker.pos.set(0,0,5);G.actors=[defender,attacker];
        attacker.s3.loadout=emptyLoadout();if(equipped)attacker.s3.loadout[2].main='objectShredder';attacker.s3RefreshGear();
        defender.weapon={...defender.weapon,special:id,specialCost:100};defender.special=100;defender._startSpecial();defender._updateSpecial(1/60);defender.invuln=0;
        const state=defender._s3AllSpecialState,rate=equipped?(id==='crabTank'?1.3:1.1):1,before=state.armorHP;
        defender.damage(100,attacker,'shooter');check(Math.abs(state.armorHP-(before-100*rate))<1e-8,id+' compiled target gear');
        state.armorHP=50;defender.specialActive.armorHP=50;defender.hp=100;
        const bodyFactor=defender.specialActive.armor?.valueOf()===true?.25:1;
        defender.damage(100,attacker,'shooter');const expected=100-Math.floor((100-50/rate)*bodyFactor*10+1e-9)/10;
        check(state.armorHP===0&&Math.abs(defender.hp-expected)<1e-8,id+' compiled armor break');
        objectGearChecks.push({id,equipped,rate,bodyHp: defender.hp});defender.reset();
      }
      const {kitBombContact}=await import('/patches/splatoon3/runtime/kit-subs.mjs');
      for(const equipped of [false,true]){
        G.projectiles.clear();const owner=makeActor('shooter'),attacker=makeActor('shooter');attacker.team=1;G.actors=[owner,attacker];
        owner.weapon={...owner.weapon,sub:'sprinkler'};owner.weaponRunner.reset();attacker.s3.loadout=emptyLoadout();if(equipped)attacker.s3.loadout[2].main='objectShredder';attacker.s3RefreshGear();
        G.projectiles.throwBomb(owner);const b=G.projectiles.bombs.at(-1);check(!!b,'native Sprinkler birth');
        kitBombContact(api.SUB,b,{hit:true,point:new THREE.Vector3(0,0,0),normal:new THREE.Vector3(0,1,0)});
        const p={owner:attacker,team:1,damage:12,size:.01,prev:b.pos.clone().add(new THREE.Vector3(0,0,-1)),pos:b.pos.clone().add(new THREE.Vector3(0,0,1))};
        const candidate=G.projectiles.kitBarrierCandidate(p,p.prev,p.pos);check(candidate?.kind==='native-sprinkler','native Sprinkler swept hit');candidate.onHit();candidate.onHit();
        check(b.s3DeviceHP===(equipped?0:108),'native Sprinkler fixed gear damage once');
        if(equipped){G.projectiles.update(1/60);check(!G.projectiles.bombs.includes(b),'native Sprinkler retirement');}
        objectGearChecks.push({id:'sprinkler',equipped,hp:b.s3DeviceHP});
      }
      const kitChecks=[];
      for(const record of records){
        G.projectiles.clear();const a=makeActor(record.id);G.actors=[a];
        const k=CANONICAL_KITS[record.id];
        check(a.weapon.sub===k.sub&&a.weapon.special===k.special&&a.specialCost()===k.specialCost,record.id+' canonical Actor kit');
        for(let frame=0;frame<8;frame++)a.weaponRunner.update(1/60,{sub:true});
        a.weaponRunner.update(1/60,{sub:false,subReleased:true});a.weaponRunner.update(1/60,{sub:false});
        const cost=(api.SUB[k.sub].inkCost??api.SUB[k.sub].inkCostFallback)*(a.s3.modifiers.inkSaverSub??1);
        check(Math.abs(a.ink-(100-cost))<1e-6,record.id+' native sub payment');
        a.weaponRunner.reset();a.special=a.specialCost();a.invuln=0;
        a._startSpecial();check(a.stats.specials===1,record.id+' special admitted');
        a.reset();check(a.weapon.sub===k.sub&&a.weapon.special===k.special,record.id+' kit after reset');
        kitChecks.push({id:record.id,sub:k.sub,special:k.special,points:k.specialCost,inkCost:cost});
      }
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
        kitChecks, weightChecks, uniqueGearChecks, conditionalChecks, objectGearChecks,
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
