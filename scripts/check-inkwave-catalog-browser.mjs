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
      // Exercise the actual production installer, not a second test-only install.
      // Reinstalling an idempotent owner returns undefined after its first boot.
      const { MAIN_WEAPON_CATALOG } = await import('/patches/splatoon3/runtime/main-weapon-catalog-data.mjs');
      const { THREE, G, PLAYER: Player, WEAPONS, WEAPON_ORDER, Actor, Projectiles, NetMatch } = api;
      check(Player.inkMax === 100, 'catalog probe starts at 100 ink');

      check(MAIN_WEAPON_CATALOG.schema === 1, 'catalog schema');
      check(MAIN_WEAPON_CATALOG.referenceVersion === '11.3.0', 'catalog source version');
      check(MAIN_WEAPON_CATALOG.sourceCommit === '7280ff9cde8bb1c5dcef46c700c326471584d2e6', 'catalog pinned source commit');
      const records = MAIN_WEAPON_CATALOG.records;
      const ids = records.map(record => record.id);
      check(records.length === 65, `expected 65 records, got ${records.length}`);
      check(new Set(ids).size === records.length, 'catalog IDs are unique');
      check(Object.hasOwn(api.WeaponRunner.prototype, Symbol.for('inkwave.main-weapon-catalog.v1')),
        'production bootstrap installed the catalogue runtime exactly once');

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
        constructor(options) { this.weapon = options.weapon; this.color = new THREE.Color(options.color); this.root = new THREE.Group(); this.owner = null; }
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
      // BEGIN_LEGACY_SCOPE_ADMISSION_PROBE
      const scopeAdmissionChecks=[];
      {
        const {Level}=await import('/src/world/level.js');
        const {updateScopeZoom,scopeVerticalFov}=await import('/patches/splatoon3/runtime/camera-aim-controls.mjs');
        const saved={level:G.level,physics:G.physics,paint:G.paint,actors:G.actors,time:G.time};
        const originalFire=G.projectiles.fireCharger;
        try {
          G.level=new Level({bounds:{minX:-50,maxX:50,minZ:-50,maxZ:50},spawnPads:[[-40,0,0],[40,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-50,-.5,-50],max:[50,0,50]}]});
          G.physics=new api.Physics(G.level);G.paint={sample:()=>1,splat:()=>0};
          for(const count of [15,140]) {
            G.projectiles.clear();const actor=makeActor('charger_scope');G.actors=[actor];
            const tick=n=>{for(let i=0;i<n;i++){G.time+=1/60;actor.update(1/60);}};
            tick(5);actor.intent.fire=true;tick(count);
            const charge=actor.weaponRunner.charge,ink=actor.ink;
            check(Number.isFinite(charge)&&Number.isFinite(ink),'legacy scope finite charge/ink');
            check(count===140?charge===1:charge>0&&charge<1,'legacy scope partial/full boundary');
            const rig={zoom:0,scopeCharge:0,baseFov:82};for(let i=0;i<180;i++)updateScopeZoom(rig,actor,1/60);
            check(scopeVerticalFov(actor.weapon)===28,'legacy scoped 28-degree presentation retained');
            check(count===140?Math.abs(rig.zoom-rig.scopeFullZoom)<1e-7:rig.zoom===0,'legacy half-charge optical threshold');
            let shots=0,firedCharge=null;G.projectiles.fireCharger=function(...args){shots++;firedCharge=args[2];return originalFire.apply(this,args);};
            actor.intent.fire=false;tick(3);
            check(shots===1&&Number.isFinite(firedCharge),'legacy release calls actual fireCharger once');
            check(Number.isFinite(actor.ink)&&actor.ink>=ink-1e-8,'legacy prepaid release ink finite');
            G.projectiles.fireCharger=originalFire;
            scopeAdmissionChecks.push({count,charge,ink,shots,firedCharge,scopeFov:scopeVerticalFov(actor.weapon),zoom:rig.zoom});
          }
          const actor=makeActor('charger_scope');G.actors=[actor];actor.intent.fire=true;
          for(let i=0;i<145;i++){G.time+=1/60;actor.update(1/60);}
          actor.intent.squid=true;for(let i=0;i<5;i++){G.time+=1/60;actor.update(1/60);}
          check(!actor.weaponRunner.s3Stored&&!actor.weaponRunner.catalogState?.stored,'legacy scope never creates stored state');
          scopeAdmissionChecks.push({squidInput:true,form:actor.form,stored:false});
        } finally {G.projectiles.fireCharger=originalFire;G.projectiles.clear();Object.assign(G,saved);}
      }
      // END_LEGACY_SCOPE_ADMISSION_PROBE
      const {Level}=await import('/src/world/level.js');
      // BEGIN_CHARGE_KEEP_INPUT_PROBE
      const chargeKeepChecks = [];
      {
        const saved = { level:G.level, physics:G.physics, paint:G.paint, actors:G.actors, time:G.time };
        try {
          G.level = new Level({bounds:{minX:-50,maxX:50,minZ:-50,maxZ:50},spawnPads:[[-40,0,0],[40,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-50,-.5,-50],max:[50,0,50]}]});
          G.physics = new api.Physics(G.level);
          G.paint = {sample:()=>1,splat:()=>0};
          for (const id of ['s3-charger-quick','s3-charger-long','s3-charger-keeper','s3-charger-longscope']) {
            G.projectiles.clear();
            const actor = makeActor(id); G.actors = [actor];
            const tick = count => { for(let i=0;i<count;i++){G.time+=1/60;actor.update(1/60);} };
            tick(5); actor.intent.fire=true; tick(140);
            check(actor.weaponRunner.charge===1,id+' full charge through actual Actor');
            const ink=actor.ink;
            actor.intent.squid=true; tick(5);
            const stored=actor.weaponRunner.catalogState?.stored;
            if(id==='s3-charger-longscope') {
              check(actor.form==='kid'&&!stored,id+' scope cannot store charge');
              chargeKeepChecks.push({id,heldFire:true,squidInput:true,form:actor.form,stored:false});
              continue;
            }
            check(actor.form==='squid'&&actor.submerged&&stored,id+' newer Squid input stores held charge');
            check(actor.ink>=ink-1e-8,id+' keep does not debit ink again');
            const storedFrames=stored.frames,remaining=stored.remaining;
            actor.intent.squid=false; tick(8);
            check(actor.form==='kid'&&actor.weaponRunner.charge===1,id+' emerges with full charge');
            const before=G.projectiles.list.length;
            actor.intent.fire=false; tick(3);
            check(G.projectiles.list.length-before===1,id+' release emits exactly one projectile');
            check(!actor.weaponRunner.catalogState.stored,id+' released storage is retired');
            check(actor.ink>=ink-1e-8,id+' release does not duplicate prepaid cost');
            chargeKeepChecks.push({id,heldFire:true,squidInput:true,storedFrames,remaining,releaseProjectiles:G.projectiles.list.length-before,inkBeforeDive:ink,inkAfterRelease:actor.ink});
          }
        } finally {
          G.projectiles.clear();
          Object.assign(G,saved);
        }
      }
      // END_CHARGE_KEEP_INPUT_PROBE
      // BEGIN_SPLATANA_POST_WAVE_THROW_PROBE
      const splatanaThrowChecks = [];
      {
        const saved = { level:G.level, physics:G.physics, paint:G.paint, actors:G.actors, time:G.time };
        try {
          G.level = new Level({bounds:{minX:-50,maxX:50,minZ:-50,maxZ:50},spawnPads:[[-40,0,0],[40,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-50,-.5,-50],max:[50,0,50]}]});
          G.physics = new api.Physics(G.level);
          G.paint = {sample:()=>1,splat:()=>0};
          for (const id of ['s3-saber-normal','s3-saber-lite','s3-saber-heavy']) for (const phase of ['pre-wave','post-wave']) {
            G.projectiles.clear();
            const actor=makeActor(id);G.actors=[actor];let frame=0;
            const tick=()=>{frame++;G.time+=1/60;actor.update(1/60);};
            const waves=()=>G.projectiles.list.filter(p=>p.owner===actor&&p.catalog);
            for(let i=0;i<5;i++)tick();actor.intent.fire=true;tick();actor.intent.fire=false;tick();
            const state=actor.weaponRunner.catalogState;
            check(state.pending&&state.stop>0,id+' sourced pending swing');
            if(phase==='pre-wave') {
              for(let i=0;state.pending?.remaining>1/60+1e-9&&i<120;i++)tick();
              check(state.pending&&state.pending.remaining<=1/60+1e-9,id+' pending wave boundary reached within 120 ticks');
              check(waves().length===0,id+' cancellation input precedes actual wave');
              const remaining=state.pending.remaining,stop=state.stop;
              actor.intent.sub=true;tick();
              check(!state.pending&&state.stop===0&&actor.weaponRunner.aimingSub,id+' existing pre-wave Sub cancellation');
              for(let i=0;i<30;i++)tick();check(waves().length===0,id+' cancelled wave does not emerge later');
              splatanaThrowChecks.push({id,phase,remaining,stop,cancelled:true,waves:0});
            } else {
              for(let i=0;!waves().length&&i<60;i++)tick();
              check(waves().length===1&&!state.pending&&state.stop>1/60,id+' actual wave leaves positive recovery');
              const stop=state.stop;let blockedTicks=0;
              actor.intent.sub=true;
              for(let i=0;state.stop>1e-9&&i<120;i++) {
                const before=state.stop;tick();blockedTicks++;
                check(state.stop===Math.max(0,before-1/60),id+' rejected Sub preserves original decrement');
                check(!actor.weaponRunner.aimingSub,id+' post-wave Sub remains unavailable');
              }
              check(state.stop<=1e-9,id+' existing recovery expires within 120 ticks');
              tick();check(actor.weaponRunner.aimingSub,id+' held Sub prepares after natural expiry');
              check(waves().length===1,id+' rejection retains exactly the admitted main wave');
              splatanaThrowChecks.push({id,phase,stop,blockedTicks,readyFrame:frame,waves:1});
            }
          }
        } finally {
          G.projectiles.clear();Object.assign(G,saved);
        }
      }
      // END_SPLATANA_POST_WAVE_THROW_PROBE
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
      const sprinklerPowerChecks=[];
      {
        const {sprinklerPhase}=await import('/patches/splatoon3/runtime/kit-sprinkler.mjs');
        const id=Object.keys(api.WEAPONS).find(k=>api.WEAPONS[k].sub==='sprinkler');check(!!id,'standard Sprinkler kit');
        let baseVelocity;
        for(const ap of [0,10,57]){
          G.projectiles.clear();const a=makeActor(id);G.actors=[a];const l=emptyLoadout();
          if(ap===10)l[0].main='subPower';if(ap===57)for(const p of l){p.main='subPower';p.subs.fill('subPower');}
          a.s3.loadout=l;a.s3RefreshGear();a.weaponRunner.reset();a.pos.set(0,0,0);a.aimDir.set(0,0,1);a.vel.set(0,0,0);
          G.projectiles.throwBomb(a);const b=G.projectiles.bombs.at(-1),spec=b?.s3Resolved?.spec;
          check(!!spec,'native Sprinkler release '+ap);check(Math.abs(spec.periodFirstFrames-gearCurve(ap,480,630,780))<1e-8,'Sprinkler first period '+ap);
          check(Math.abs(spec.periodSecondFrames-gearCurve(ap,900,960,1020))<1e-8,'Sprinkler second period '+ap);
          if(baseVelocity===undefined)baseVelocity=b.vel.z;check(Math.abs(b.vel.z-baseVelocity)<1e-8,'Sprinkler throw distance does not gain AP '+ap);
          check(sprinklerPhase(600,spec)===(ap===57?0:1),'Sprinkler actual device stage '+ap);
          sprinklerPowerChecks.push({ap,first:spec.periodFirstFrames,second:spec.periodSecondFrames,velocity:b.vel.z});a.reset();
        }
        G.projectiles.clear();
      }
      const mistChecks=[];const mistQueryChecks=[];
      {
        const saved={actors:G.actors,projectiles:G.projectiles,time:G.time,level:G.level,physics:G.physics};
        // Mist now deploys on actual terrain contact. An empty collision world
        // exercised the removed airborne timeout rather than a valid throw.
        const {Level}=await import('/src/world/level.js');
        G.level=new Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});
        G.physics=new api.Physics(G.level);
        G.projectiles=new Projectiles(G.scene);G.actors=[];
        const source=makeActor('s3-slosher-diffusion'),victim=makeActor('shooter');victim.team=1;G.actors=[source,victim];
        source.aimDir.set(0,-1,.1).normalize();source.aimPoint.set(0,0,1);source.intent.sub=true;
        for(let i=0;i<10;i++){G.time+=1/60;source.update(1/60);}source.intent.sub=false;
        for(let i=0;i<10;i++){G.time+=1/60;source.update(1/60);}
        const cloud=G.projectiles._s3SubObjects?.find(o=>o.subId==='toxicMist');check(!!cloud,'Mist native release');
        for(let i=0;i<120&&cloud.phase!=='deployed';i++){G.time+=1/60;G.projectiles.update(1/60);}
        check(cloud.phase==='deployed','Mist native deployment');
        for(const ap of [0,10,57])for(const squid of [false,true]){
          victim.pos.copy(cloud.pos);victim.s3.loadout=emptyLoadout();
          if(ap===10)victim.s3.loadout[0].main='subResistance';
          if(ap===57)for(const p of victim.s3.loadout){p.main='subResistance';p.subs.fill('subResistance');}
          victim.s3RefreshGear();victim.grounded=true;victim.form=squid?'squid':'kid';victim.submerged=squid;victim.intent.move.set(0,0,1);victim.vel.set(0,0,0);
          for(let i=0;i<120;i++)victim._horizontal(1/60,squid,false);
          const expected=(squid?11.52:5.76)*(1-.5*gearCurve(ap,1,.75,.5));
          check(Math.abs(victim.vel.z-expected)<1e-8,'Mist victim reduction '+ap+' '+squid);
          mistChecks.push({ap,squid,speed:victim.vel.z});
          victim.pos.x+=20;victim.vel.set(0,0,0);for(let i=0;i<120;i++)victim._horizontal(1/60,squid,false);
          check(Math.abs(victim.vel.z-(squid?11.52:5.76))<1e-8,'Mist exit restores target speed');
        }
        const live=G.projectiles._s3SubObjects,los=G.physics.los;let losCalls=0;
        G.physics.los=function(...args){losCalls++;return los.apply(this,args);};
        try {
          victim.pos.copy(cloud.pos);victim.form='kid';victim.grounded=true;
          for(const count of [1,96]){
            G.projectiles._s3SubObjects=Array.from({length:count},()=>({...cloud}));losCalls=0;
            victim._horizontal(1/60,false,false);check(losCalls===1,'Mist human query has one LOS for '+count+' equal volumes');
            mistQueryChecks.push({volumes:count,form:'kid',losCalls});
          }
          victim.grounded=false;victim.form='squid';losCalls=0;victim._horizontal(1/60,true,false);
          check(losCalls===0,'Mist airborne squid skips unused query');mistQueryChecks.push({volumes:96,form:'air-squid',losCalls});
        } finally {G.physics.los=los;G.projectiles._s3SubObjects=live;}
        G.projectiles.clear();Object.assign(G,saved);
      }
      const accelerationChecks=[];
      for(const id of ['s3-shooter-short','s3-shooter-first'])for(const squid of [false,true])for(const ready of [false,true]){
        const a=makeActor(id);a.s3.loadout=emptyLoadout();a.s3RefreshGear();
        a.form=squid?'squid':'kid';a.submerged=squid;a.grounded=true;a.intent.move.set(0,0,1);a.intent.sub=ready;
        a._horizontal(1/60,squid,false);
        const expected=ready?1.2:(squid&&id==='s3-shooter-short'?.9:.6);
        check(Math.abs(a.vel.z-expected)<1e-8,id+' grounded acceleration '+squid+' '+ready);
        accelerationChecks.push({id,squid,ready,delta:a.vel.z});
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
        defender.weapon={...defender.weapon,special:id,specialCost:100};defender.special=100;defender._startSpecial();
        // Nice Ball gains its sourced armor after the 30F ascent, while Crab
        // armor is active on the first frame. Exercise active armor, not ascent.
        for(let frame=0;frame<(id==='booyahBomb'?30:1);frame++)defender._updateSpecial(1/60);
        defender.invuln=0;
        const state=defender._s3AllSpecialState,rate=(equipped?(id==='crabTank'?1.3:1.1):1)*(id==='booyahBomb'?.7:1),before=state.armorHP;
        defender.damage(100,attacker,'shooter');check(Math.abs(state.armorHP-(before-100*rate))<1e-8,id+' compiled target gear');
        state.armorHP=50;defender.specialActive.armorHP=50;defender.hp=100;
        const bodyFactor=defender.specialActive.armor?.valueOf()===true?.25:1;
        defender.damage(100,attacker,'shooter');const expected=id==='booyahBomb'?100:100-Math.floor((100-50/rate)*bodyFactor*10+1e-9)/10;
        check(state.armorHP===0&&Math.abs(defender.hp-expected)<1e-8,id+' compiled armor break');
        const bodyHp=defender.hp,penetrationChecks=[];
        if(id==='booyahBomb'){
          // General armor law: a breaking hit at or below 100 is absorbed;
          // above 100 only the excess penetrates, capped at 80. Object Shredder
          // changes armor HP debit, not that raw-hit threshold or body cap.
          // https://wikiwiki.jp/splatoon3mix/システム詳細仕様#he35f781
          for(const [raw,bodyDamage]of [[25,0],[100,0],[120,20],[180,80],[220,80]]){
            state.armorHP=50;defender.specialActive.armorHP=50;defender.hp=100;
            defender.damage(raw,attacker,'shooter');
            check(Math.abs(state.armorHP-Math.max(0,50-raw*rate))<1e-8,id+' compiled raw armor debit '+raw+' shredder='+equipped);
            check(Math.abs(defender.hp-(100-bodyDamage))<1e-8,id+' compiled 100 threshold / 80 cap '+raw+' shredder='+equipped);
            penetrationChecks.push({raw,bodyDamage:100-defender.hp,armorHp:state.armorHP});
          }
        }
        objectGearChecks.push({id,equipped,rate,bodyHp,...(penetrationChecks.length?{penetrationChecks}:{})});defender.reset();
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
      const gearAdoptionChecks=[];
      {
        const {NetMatch}=await import('/src/net/netmatch.js');
        const previousMatch=G.match,previousNet=G.netm,previousTime=G.time;
        for(const points of [0,3,10,57]){
          const owner=makeActor('shooter',71),remote=makeActor('shooter',71);owner.owner=remote.owner='gear-owner';
          owner.s3.loadout=emptyLoadout();
          if(points===3)owner.s3.loadout[0].subs[0]='specialCharge';
          if(points===10)owner.s3.loadout[0].main='runSpeed';
          if(points===57)for(const part of owner.s3.loadout){part.main='runSpeed';part.subs.fill('runSpeed');}
          owner.s3RefreshGear();if(points===3)owner.special=owner.specialCost();
          let packet;const transport={sendTo(){},broadcast:message=>{packet=JSON.parse(JSON.stringify(message));}};
          const sender=new NetMatch({myId:'gear-owner',hostId:'gear-owner',isHost:true,tr:transport},{id:'gear-browser'});
          const receiver=new NetMatch({myId:'gear-viewer',hostId:'gear-owner',isHost:false,tr:transport},{id:'gear-browser'});
          const match=actors=>({actors,state:'playing',time:180,duration:180,playing:()=>true,canRespawn:()=>false});
          sender.bind(match([owner]));receiver.bind(match([remote]));G.time+=1/60;sender._sendTick();
          receiver.onMessage('gear-owner',packet);receiver._peer('gear-owner').tr=packet.ts;receiver._sample(remote,packet.ts,0);receiver.applyRemote(remote,1/60);
          check(JSON.stringify(remote.s3.loadout)===JSON.stringify(owner.s3.loadout),'gear JSON equipment '+points);
          G.match=receiver.match;G.netm=receiver;G.actors=[remote];receiver.s.hostId='gear-viewer';receiver.s.isHost=true;receiver.onLeave('gear-owner',true);
          check(!remote.remote&&remote.isBot&&remote.owner==='gear-viewer','gear native host takeover '+points);
          if(points===3)check(remote.specialReady()&&remote.special===remote.specialCost(),'fractional-cost full gauge survives takeover');
          check(Math.abs(remote.s3.modifiers.runSpeed-owner.s3.modifiers.runSpeed)<1e-9,'gear adopted modifier '+points);
          remote.intent.move.set(0,0,1);remote.vel.set(0,0,0);remote.grounded=true;
          for(let frame=0;frame<120;frame++)remote._horizontal(1/60,false,false);
          check(Math.abs(remote.vel.z-Player.runSpeed*owner.s3.modifiers.runSpeed)<1e-8,'gear adopted native movement '+points);
          gearAdoptionChecks.push({points,runSpeed:remote.vel.z,owner:remote.owner});
        }
        G.match=previousMatch;G.netm=previousNet;G.time=previousTime;
      }
      const gearClockChecks=[];
      {
        const {NetMatch}=await import('/src/net/netmatch.js');
        const previousMatch=G.match,previousNet=G.netm,previousPads=G.level.spawnPads,previousTime=G.time;
        G.level.spawnPads=[new THREE.Vector3(),new THREE.Vector3()];
        for(const head of ['comeback','openingGambit']){
          const owner=makeActor('shooter',81),remote=makeActor('shooter',81);owner.owner=remote.owner='clock-owner';
          let packet;const transport={sendTo(){},broadcast:value=>{packet=JSON.parse(JSON.stringify(value));}};
          const sender=new NetMatch({myId:'clock-owner',hostId:'clock-owner',isHost:true,tr:transport},{id:'clock-browser'});
          const receiver=new NetMatch({myId:'clock-viewer',hostId:'clock-owner',isHost:false,tr:transport},{id:'clock-browser'});
          const match=actors=>({actors,state:'playing',time:180,duration:180,playing:()=>true,canRespawn:()=>false});
          sender.bind(match([owner]));receiver.bind(match([remote]));G.match=sender.match;G.netm=sender;G.actors=[owner];
          owner.s3.loadout=emptyLoadout();owner.s3.loadout[0].main=head;owner.s3RefreshGear();
          if(head==='comeback'){const attacker=makeActor('shooter');attacker.team=1;owner.invuln=0;owner.splat(attacker);owner.respawn();}
          const advance=(net,a,seconds)=>{for(let i=0;i<seconds*60;i++){G.time+=1/60;net.update(1/60);if(!net.match.paused){net.match.time-=1/60;if(a.remote)net.applyRemote(a,1/60);else a.update(1/60);}}};
          advance(sender,owner,8);sender._sendTick();G.match=receiver.match;G.netm=receiver;G.actors=[remote];receiver.match.time=sender.match.time;
          receiver.onMessage('clock-owner',packet);receiver._peer('clock-owner').tr=packet.ts;receiver._sample(remote,packet.ts,0);receiver.applyRemote(remote,1/60);
          advance(receiver,remote,2);receiver._hostClock(['playing',180]);receiver.s.hostId='clock-viewer';receiver.s.isHost=true;receiver.onLeave('clock-owner',true);
          check(remote.s3.modifiers.runSpeed>1,'adopted conditional effect '+head);
          receiver.match.paused=true;advance(receiver,remote,3);receiver.match.paused=false;
          advance(receiver,remote,head==='comeback'?10:20);
          check(Math.abs(remote.s3.modifiers.runSpeed-1)<1e-8,'conditional effect expires without host-clock refund '+head);
          gearClockChecks.push({head,expired:true});
        }
        G.match=previousMatch;G.netm=previousNet;G.level.spawnPads=previousPads;G.time=previousTime;
      }
      const transientGearChecks=[];
      {
        const {NetMatch}=await import('/src/net/netmatch.js');
        const saved={match:G.match,netm:G.netm,time:G.time,level:G.level,physics:G.physics,paint:G.paint,actors:G.actors};
        const V=THREE.Vector3,center=new V(0,-.1,0),half=new V(100,.1,100);
        const floor={id:0,solid:true,center,half,axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)],faces:[-1,-1,0,-1,-1,-1],aabbMin:center.clone().sub(half),aabbMax:center.clone().add(half)};
        G.level={blocks:[floor],faces:[{origin:new V(-100,0,-100),u:new V(1,0,0),v:new V(0,0,1)}],spawnPads:[new V(-80,0,0),new V(80,0,0)],spawnBarrier:0,hasRails:false,groundHeight:()=>0,queryBlocks:(_x,_z,_xx,_zz,out)=>{out.length=0;out.push(0);return out;}};
        G.physics=new api.Physics(G.level);G.paint={sample:()=>0,splat:()=>0};
        for(const kind of ['drink','drop']){
          G.projectiles.clear();G.time=0;
          const weapon=kind==='drink'?'s3-shooter-quickmiddle':'shooter',owner=makeActor(weapon,91),remote=makeActor(weapon,91);owner.owner=remote.owner='buff-owner';
          if(kind==='drop'){owner.s3.loadout=emptyLoadout();owner.s3.loadout[2].main='dropRoller';owner.s3RefreshGear();}
          let packet;const transport={sendTo(){},broadcast:value=>{packet=JSON.parse(JSON.stringify(value));}};
          const sender=new NetMatch({myId:'buff-owner',hostId:'buff-owner',isHost:true,tr:transport},{id:'buff-browser'}),receiver=new NetMatch({myId:'buff-viewer',hostId:'buff-owner',isHost:false,tr:transport},{id:'buff-browser'});
          const match=actors=>({actors,state:'playing',time:180,duration:180,playing:()=>true,canRespawn:()=>false});sender.bind(match([owner]));receiver.bind(match([remote]));G.match=sender.match;G.netm=sender;G.actors=[owner];
          const step=(net,a,count)=>{for(let i=0;i<count;i++){G.time+=1/60;net.update(1/60);net.match.time-=1/60;if(a.remote)net.applyRemote(a,1/60);else a.update(1/60);}};
          if(kind==='drink'){owner.special=owner.specialCost();owner._startSpecial();check(!(G.projectiles._s3SupportCoolers||[]).length,'holding does not install a stand');owner.aimDir.set(0,-1,0);owner.intent.sub=true;owner._updateSpecial(1/60);owner.intent.sub=false;for(let i=0;i<15&&owner.specialActive;i++)owner._updateSpecial(1/60);for(let i=0;i<20&&!(G.projectiles._s3SupportCoolers||[]).length;i++){G.time+=1/60;G.projectiles.update(1/60);}check(G.projectiles._s3SupportCoolers.length===1,'actual cooler stand after R release and ground contact');G.time+=1/60;G.projectiles.update(1/60);check(owner.s3.drink,'actual stand pickup');}
          else {owner.s3.jumpChargeTime=1/60;owner.s3.jumpFlightTime=.5;check(owner.superJump(new V(12,0,0)),'actual jump start');let frames=0;while(owner.superJumpState&&frames++<600){const jump=owner.superJumpState;if(jump.phase==='flight'&&jump.t+1/60+1e-10>=jump.dur)owner.intent.move.set(1,0,0);step(sender,owner,1);}check(frames<600&&owner.s3.dropRoller,'actual adapted landing');step(sender,owner,20);}
          const remaining=kind==='drink'?owner.s3.drinkUntil-G.time:owner.s3.dropRollerBuffRemaining,boost=owner.s3.modifiers.runSpeed;check(remaining>0&&boost>1,'earned transient boost '+kind);sender._sendTick();receiver.match.time=sender.match.time-.1;
          G.match=receiver.match;G.netm=receiver;G.actors=[remote];receiver.onMessage('buff-owner',packet);receiver._peer('buff-owner').tr=packet.ts;receiver._sample(remote,packet.ts,0);receiver.applyRemote(remote,1/60);check(!remote.s3.drink&&!(remote.s3.dropRollerBuffRemaining>0),'remote has no transient gameplay authority');
          step(receiver,remote,30);receiver.s.hostId='buff-viewer';receiver.s.isHost=true;receiver.onLeave('buff-owner',true);
          const adopted=kind==='drink'?remote.s3.drinkUntil-G.time:remote.s3.dropRollerBuffRemaining;check(Math.abs(adopted-(remaining-.6))<1e-8,'known delay and wait consumed '+kind);check(Math.abs(remote.s3.modifiers.runSpeed-boost)<1e-8,'adopted AP recomputed '+kind);
          step(receiver,remote,Math.ceil(adopted*60)+2);G.projectiles.update(1/60);check(!remote.s3.drink&&!(remote.s3.dropRollerBuffRemaining>0),'transient expires '+kind);
          transientGearChecks.push({kind,remaining,adopted,expired:true});sender.dispose();receiver.dispose();
        }
        G.projectiles.clear();Object.assign(G,saved);
      }
      const subMarkChecks=[];
      {
        const saved={match:G.match,netm:G.netm,time:G.time,level:G.level,physics:G.physics,paint:G.paint,actors:G.actors};
        G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};G.physics=new api.Physics(G.level);G.paint={sample:()=>0,splat:()=>0};G.netm=null;
        G.match={state:'playing',time:180,duration:180,playing:()=>true};
        for(const sub of ['pointSensor','inkMine','angleShooter'])for(const ap of [0,10,57]){
          G.projectiles.clear();G.time=10;
          const owner=makeActor('shooter',101),victim=makeActor('shooter',102);owner.team=0;victim.team=1;owner.invuln=victim.invuln=0;victim.s3.loadout=emptyLoadout();
          if(ap===10)victim.s3.loadout[0].main='subResistance';if(ap===57)for(const part of victim.s3.loadout){part.main='subResistance';part.subs.fill('subResistance');}victim.s3RefreshGear();
          owner.weapon={...owner.weapon,sub};owner.pos.set(0,0,0);owner.aimDir.set(0,0,1);victim.pos.set(0,0,2);G.actors=[owner,victim];
          const obj=G.projectiles.throwBomb(owner);check(!!obj,'sub mark birth '+sub);
          if(sub==='pointSensor'){const sensor=G.projectiles._s3SupportSensors[0];sensor.pos.set(0,.7,2);sensor.activeAt=10;sensor.expires=13;}
          else{obj.pos.set(0,.7,0);obj.prev.copy(obj.pos);obj.vel.set(0,0,60);if(sub==='inkMine'){obj.phase='deployed';obj.vel.set(0,0,0);obj.activeAt=0;obj.deployedAt=0;obj.expireAt=Infinity;}}
          for(let i=0;i<20&&!victim.s3.revealedUntil?.[0];i++)G.projectiles.update(1/60);
          const remaining=(victim.s3.revealedUntil?.[0]||0)-G.time,expected=(sub==='pointSensor'?8:sub==='angleShooter'?5-obj.age:5)*gearCurve(ap,1,sub==='inkMine'?.55:.43,.1);
          check(Math.abs(remaining-expected)<1e-8,'victim mark resistance '+sub+' '+ap);subMarkChecks.push({sub,ap,remaining});
        }
        G.projectiles.clear();Object.assign(G,saved);
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
      const {Level:WallProbeLevel}=await import('/src/world/level.js');
      const wallFacingChecks=[];
      {
        const saved={time:G.time,actors:G.actors,netm:G.netm,match:G.match,level:G.level,physics:G.physics};G.netm=null;G.match={playing:()=>true,state:'playing',time:180};
        G.level=new WallProbeLevel({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});G.physics=new api.Physics(G.level);
        for(const yaw of [0,Math.PI/3]){
          G.projectiles.clear();const o=makeActor('shooter'),enemy=makeActor('shooter');o.team=0;enemy.team=1;o.weapon={...o.weapon,sub:'splashWall'};o.pos.set(-10,0,-10);enemy.pos.set(80,0,80);o.aimYaw=yaw;o.aimDir.set(Math.sin(yaw),0,Math.cos(yaw));G.actors=[o,enemy];const p=G.projectiles.throwBomb(o);p.pos.set(0,1,0);p.prev.copy(p.pos);p.vel.set(0,-2,0);for(let i=0;i<120&&p.phase!=='deployed';i++){G.time+=1/60;G.projectiles.update(1/60);}check(p.phase==='deployed','wall native deployment');const normal=new THREE.Vector3(Math.sin(p.yaw),0,Math.cos(p.yaw));for(let i=0;i<60;i++){G.time+=1/60;G.projectiles.update(1/60);p.mesh.updateMatrixWorld(true);check(new THREE.Vector3(0,0,1).transformDirection(p.mesh.matrixWorld).distanceTo(normal)<1e-8,'wall rendered plane retains collision yaw');}const center=p.pos.clone().add(new THREE.Vector3(0,1,0)),start=center.clone().addScaledVector(normal,2),end=center.clone().addScaledVector(normal,-2);check(G.projectiles.kitBarrierCandidate({owner:enemy,team:1,damage:1,wid:'shooter',size:.05,prev:start,pos:end},start,end)?.object===p,'rendered wall is barrier plane');wallFacingChecks.push({yaw:p.yaw,meshYaw:p.mesh.rotation.y,frames:60,hp:p.hp});
        }
        G.projectiles.clear();Object.assign(G,saved);
      }
      const catalogueSubChecks=[];
      {
        const saved={time:G.time,actors:G.actors,netm:G.netm,match:G.match,level:G.level,physics:G.physics};
        G.netm=null;G.match={playing:()=>true,state:'playing',time:180};
        G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};G.physics=new api.Physics(G.level);
        const equipCatalogue=(a,ap)=>{a.s3.loadout=emptyLoadout();for(const p of a.s3.loadout)if(ap>=10){p.main='subResistance';ap-=10;}for(const p of a.s3.loadout)for(let i=0;i<3&&ap>=3;i++){p.subs[i]='subResistance';ap-=3;}a.s3RefreshGear();};
        for(const ap of [0,10,57]){
          G.projectiles.clear();const o=makeActor('shooter'),v=makeActor('shooter');o.team=0;v.team=1;v.invuln=0;o.pos.set(0,0,-4);v.pos.set(0,0,2);o.aimDir.set(0,0,1);o.weapon={...o.weapon,sub:'burst'};equipCatalogue(v,ap);G.actors=[o,v];const hp=v.hp,hits=[],damage=v.damage;v.damage=function(n,a,w){hits.push([n,w]);return damage.call(this,n,a,w);};const p=G.projectiles.throwBomb(o);p.pos.set(0,.7,0);p.prev.copy(p.pos);p.vel.set(0,0,60);for(let i=0;i<10;i++){G.time+=1/60;G.projectiles.update(1/60);}const rate=gearCurve(ap,1,.75,.6),expected=[25,35].reduce((sum,n)=>sum+Math.floor(n*rate*10+1e-9)/10,0);check(hits.length===2&&hits[0][0]===25&&hits[1][0]===35&&Math.abs(hp-v.hp-expected)<1e-8,'Burst preserves the direct and one-frame blast phases');catalogueSubChecks.push({source:'burst',ap,native:true,damage:hp-v.hp});
        }
        for(const [w,n]of [['burst',35],['fizzy',50],['torpedo',60],['inkMine',45]]){
          G.projectiles.clear();
          const sub=w;
          const makePair=()=>{
            const o=makeActor('shooter',1),v=makeActor('shooter',2);
            o.owner='catalogue-owner';v.owner='catalogue-victim';o.team=0;v.team=1;
            o.netLife=v.netLife=0;v.invuln=0;o.pos.set(0,0,0);v.pos.set(0,0,2);
            o.aimDir.set(0,0,1);o.weapon={...o.weapon,sub};equipCatalogue(v,57);
            return {o,v};
          };
          const sender=makePair(),receiver=makePair();let packet,ack;const ticks=[];
          const bind=(pair,myId,tr)=>{
            const session={myId,hostId:'catalogue-owner',isHost:myId==='catalogue-owner',tr,
              _members:new Map([['catalogue-owner',{}],['catalogue-victim',{}]])};
            const match={actors:[pair.o,pair.v],state:'playing',time:180,playing:()=>true};
            const nm=new NetMatch(session,{id:'catalogue-probe',map:'reef'});
            nm.bind(match);session.match=nm;G.match=match;G.netm=nm;G.actors=match.actors;
            return nm;
          };
          const tx=bind(sender,'catalogue-owner',{
            sendTo:(_id,p)=>{if(p.k==='hit')packet=JSON.parse(JSON.stringify(p));return true;},
            broadcast:p=>{if(p.k==='t')ticks.push(JSON.parse(JSON.stringify(p)));return true;},
          });
          let rx;
          try{
            // Use the real equipped-sub birth and owner tick, not a hand-written proof.
            check(!!G.projectiles.throwBomb(sender.o),'native catalogue sub birth');
            check(tx._sendTick()===true&&ticks.length===1,'native catalogue owner tick');
            const birth=ticks[0].e?.find(e=>e[1]==='ac'&&e[2]==='sub'&&e[5]?.phase==='spawn'&&e[5]?.subId===sub);
            check(!!birth,'catalogue tick carries actual sub birth');
            check(Number.isSafeInteger(birth[5].seed)&&Number.isFinite(birth[5].charge),'native catalogue birth carries seed/charge');
            tx.sendHit(sender.o,sender.v,n,w);check(packet?.d===n,'catalogue raw hit amount');
            // A second roster prevents bind() from changing the sender Actor identities.
            G.projectiles.clear();rx=bind(receiver,'catalogue-victim',{
              sendTo:(_id,p)=>{if(p.k==='hit_ack')ack=JSON.parse(JSON.stringify(p));return true;},
              broadcast:p=>{if(p.k==='hit_ack')ack=JSON.parse(JSON.stringify(p));return true;},
            });
            rx.onMessage('catalogue-owner',ticks[0]);
            const admitted=rx.peers.get('catalogue-owner');
            check(admitted?.events.some(e=>e[1]==='ac'&&e[2]==='sub'&&e[5]?.seq===birth[5].seq),'native receiver admitted catalogue birth');
            const {v}=receiver,hp=v.hp;
            rx.onMessage('foreign',packet);rx.onMessage('catalogue-owner',{...packet,d:n+.1});
            check(v.hp===hp,'foreign and oversized catalogue hit rejected');
            rx.onMessage('catalogue-owner',packet);
            check(v.hp===hp&&(rx._combatProvenance?.proofs.get('catalogue-owner')?.length||0)===0,'catalogue FIFO alone cannot authorize hit');
            await new Promise(resolve=>setTimeout(resolve,150));G.time+=.15;rx.update(.15);
            check(G.projectiles._s3SubObjects.some(o=>o.ghost&&o.owner===receiver.o&&o.seq===birth[5].seq),'native catalogue receiver creates sub');
            const expected=Math.floor(n*(['burst','fizzy'].includes(w)?.6:.5)*10+1e-9)/10;
            check(Math.abs(hp-v.hp-expected)<1e-8&&ack?.d===expected,'catalogue hit victim/ACK match');
            rx.onMessage('catalogue-owner',packet);check(Math.abs(hp-v.hp-expected)<1e-8,'duplicate catalogue hit inert');
            catalogueSubChecks.push({source:w,ap:57,wire:true,damage:hp-v.hp});
          }finally{tx.dispose();rx?.dispose();G.projectiles.clear();G.netm=null;}

        }
        G.projectiles.clear();Object.assign(G,saved);
      }
      // Independently cover attacker subPower57 and victim subResistance57 with native contacts.
      // Generated hit packets come only from native terrain trajectories, never sendHit stubs.
      const torpedoGearContactChecks=[];
      for(const [attackerAP,victimAP] of [[57,0],[0,57]]){
        const {applyAcceptedGear}=await import('/patches/splatoon3/runtime/gear-loadout-network.mjs');
        const {receiverTorpedoObservationState}=await import('/patches/splatoon3/runtime/torpedo-receiver-trajectory.mjs');
        const saved={time:G.time,actors:G.actors,netm:G.netm,match:G.match,level:G.level,physics:G.physics,paint:G.paint,projectiles:G.projectiles,scene:G.scene};
        const DT=1/60,worlds=[];
        const activate=w=>Object.assign(G,w.context);
        const world=myId=>{
          G.scene=new THREE.Scene();G.time=1;G.netm=null;
          // Terrain splashes require the native Physics raycast to hit a real floor.
          const V=THREE.Vector3,floor={id:0,solid:true,grate:false,center:new V(0,-1,47.5),half:new V(40,1,52.5),axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1],aabbMin:new V(-40,-2,-5),aabbMax:new V(40,0,100)};
          G.level={blocks:[floor],faces:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;out.push(0);return out;}};
          G.physics=new api.Physics(G.level);G.paint={sample:()=>0,splat:()=>0};G.projectiles=new Projectiles(G.scene);
          const owner=makeActor('shooter',1),victim=makeActor('shooter',2);
          Object.assign(owner,{owner:'torpedo-owner',team:0,netLife:0});Object.assign(victim,{owner:'torpedo-victim',team:1,netLife:0,invuln:0});
          owner.pos.set(0,0,26);victim.pos.set(0,0,38);owner.aimDir.set(0,0,1);owner.weapon={...owner.weapon,sub:'torpedo'};owner.weaponRunner.reset();
          owner.s3.loadout=emptyLoadout();victim.s3.loadout=emptyLoadout();if(victimAP===57)for(const piece of victim.s3.loadout){piece.main='subResistance';piece.subs.fill('subResistance');}owner.s3RefreshGear();victim.s3RefreshGear();
          const packets=[],transport={sendTo:(_to,p)=>{packets.push(JSON.parse(JSON.stringify(p)));return true;},broadcast:p=>{packets.push(JSON.parse(JSON.stringify(p)));return true;}};
          const session={myId,hostId:'torpedo-owner',isHost:myId==='torpedo-owner',tr:transport,_members:new Map([['torpedo-owner',{}],['torpedo-victim',{}]])};
          const nm=new NetMatch(session,{id:'catalogue-torpedo-ap57',map:'reef'}),match={actors:[owner,victim],state:'playing',time:180,playing:()=>true};
          nm.bind(match);session.match=nm;G.netm=nm;G.match=match;G.actors=match.actors;
          const w={owner,victim,nm,packets,context:{time:G.time,scene:G.scene,actors:G.actors,netm:nm,match,level:G.level,physics:G.physics,paint:G.paint,projectiles:G.projectiles}};worlds.push(w);return w;
        };
        const step=w=>{activate(w);G.time+=DT;w.context.time=G.time;G.projectiles.update(DT);};
        const land=drop=>{const g=drop.source.spec.gravity,t=(drop.vel.y+Math.sqrt(drop.vel.y**2+2*g*drop.pos.y))/g;return drop.pos.clone().addScaledVector(drop.vel,t).setY(0);};
        try{
          const tx=world('torpedo-owner');if(attackerAP===57)for(const piece of tx.owner.s3.loadout){piece.main='subPower';piece.subs.fill('subPower');}tx.owner.s3RefreshGear();
          check((tx.owner.s3.abilityPoints.subPower||0)===attackerAP,'Torpedo sender subPower matches fixture');
          for(let i=0;i<8;i++)tx.owner.weaponRunner.update(DT,{sub:true});tx.owner.weaponRunner.update(DT,{sub:false,subReleased:true});tx.owner.weaponRunner.update(DT,{sub:false});
          const parent=G.projectiles._s3SubObjects.find(o=>o.subId==='torpedo');check(!!parent&&tx.owner.ink===35,'Torpedo native paid release');
          // _sendTick broadcasts a packet; its return value is not the delivery signal.
          tx.nm._sendTick();
          const ticks=tx.packets.filter(p=>p.k==='t');check(ticks.length===1,'one first gear plus birth packet');const tick=ticks[0];check(!!tick.gg,'first packet carries accepted gear sidecar');
          check(tick.e?.some(e=>e[1]==='ac'&&e[5]?.phase==='spawn'&&e[5]?.subId==='torpedo'&&e[5]?.subPowerAP===attackerAP),'actual Torpedo birth gear metadata');
          for(let i=0;i<300&&!parent.dead;i++)step(tx);check(parent.dead,'native sender parent collision');
          const drops=G.projectiles._s3TorpedoSplashes.filter(d=>d.kind==='chase');check(drops.length===8,'native sender eight terrain drops');const target=land(drops[0]);
          const main=tx.packets.find(p=>p.k==='hit'&&p.w==='torpedo');check(main?.d===60,'native sender main claim60');tx.victim.pos.copy(target);
          for(let i=0;i<200;i++)step(tx);const splash=tx.packets.find(p=>p.k==='hit'&&p.w==='torpedo-splash');check(splash?.d===12,'native sender terrain claim12');
          tx.nm.dispose();G.projectiles.clear();
          const rx=world('torpedo-victim');rx.nm.onMessage('torpedo-owner',tick);
          let replica;const adoptionFrames=[];
          for(let i=0;i<30;i++){
            await new Promise(resolve=>setTimeout(resolve,17));activate(rx);G.time+=DT;rx.context.time=G.time;rx.nm.update(DT);
            if(rx.owner.net.ready)applyAcceptedGear(rx.owner,rx.owner.net.cur.adoption);
            replica=G.projectiles._s3SubObjects?.find(o=>o.subId==='torpedo');adoptionFrames.push({frame:i+1,attackerSubPowerAP:rx.owner.s3.abilityPoints.subPower||0,born:!!replica});if(replica)break;
          }
          check(!!replica&&(rx.owner.s3.abilityPoints.subPower||0)===attackerAP,'receiver adopts attacker gear before native birth');
          check((rx.victim.s3.abilityPoints.subResistance||0)===victimAP,'receiver victim resistance matches fixture');
          check(receiverTorpedoObservationState(api,G.projectiles,replica)==='active','accepted receiver native trajectory enrolled');
          // A correct raw claim before any terrain contact cannot itself mint damage.
          rx.nm.onMessage('foreign',splash);rx.nm.onMessage('torpedo-owner',{...splash,d:12.1});
          check(rx.victim.hp===100,'foreign and oversized claims reject before legitimate hit ID');
          check(!rx.nm.peers.get('torpedo-owner').hitSequences?.has(splash.h),'invalid claims do not consume hit ID');
          check(!(rx.nm._combatProvenance?.pending.get('torpedo-owner')||[]).some(item=>item.d.h===splash.h),'invalid claims do not reserve pending hit ID');
          rx.nm.onMessage('torpedo-owner',splash);check(rx.victim.hp===100,'early raw12 cannot replace receiver terrain contact');
          for(let i=0;i<300&&!replica.dead;i++)step(rx);check(replica.dead,'native receiver parent collision');
          const receiverDrops=G.projectiles._s3TorpedoSplashes.filter(d=>d.kind==='chase');check(receiverDrops.length===8,'native receiver eight terrain drops');
          check(land(receiverDrops[0]).distanceTo(target)<1e-6,'accepted receiver trajectory matches native sender landing');
          const expectedMain=victimAP===57?30:60,expectedSplash=victimAP===57?6:12,expectedHP=100-expectedMain-expectedSplash;
          rx.nm.onMessage('torpedo-owner',main);check(rx.victim.hp===100-expectedMain,'native receiver main60');
          rx.victim.pos.copy(target);
          let deliveredAtTerrain=false;for(let i=0;i<200;i++){step(rx);if(!deliveredAtTerrain&&!G.projectiles._s3TorpedoSplashes.includes(receiverDrops[0])){rx.nm.onMessage('torpedo-owner',splash);deliveredAtTerrain=true;}}
          check(deliveredAtTerrain,'receiver native drop reaches terrain and retires');
          // The queued legitimate12 may now flush from actual native contact.
          check(rx.victim.hp===expectedHP,'actual receiver terrain contact authorizes12 after60');
          const ack=rx.packets.find(p=>p.k==='hit_ack'&&p.h===splash.h);check(ack?.d===expectedSplash,'terrain claim ACK12');
          const count=rx.packets.filter(p=>p.k==='hit_ack'&&p.h===splash.h).length;
          rx.nm.onMessage('foreign',splash);rx.nm.onMessage('torpedo-owner',{...splash,d:12.1});rx.nm.onMessage('torpedo-owner',splash);
          check(rx.victim.hp===expectedHP,'foreign/overflow/duplicate terrain claims inert');
          check(rx.packets.filter(p=>p.k==='hit_ack'&&p.h===splash.h).length===count,'duplicate terrain claim does not add ACK');
          rx.nm.onMessage('torpedo-owner',{...splash,h:splash.h+1,seq:(splash.seq||0)+1});check(rx.victim.hp===expectedHP,'consumed terrain contact cannot authorize a fresh hit ID');
          if(victimAP===57)catalogueSubChecks.push({source:'torpedo-splash',ap:victimAP,wire:true,nativeContact:true,damage:ack.d});
          torpedoGearContactChecks.push({attackerSubPowerAP:attackerAP,victimSubResistanceAP:victimAP,firstPacket:true,adoptionFrames,mainRaw:60,terrainRaw:12,hp:rx.victim.hp,ackDamage:ack.d,nativeTerrain:true,duplicateInert:true});
        }finally{for(const w of worlds){activate(w);w.nm.dispose();w.context.projectiles.clear();}Object.assign(G,saved);}
      }
      const directSubChecks=[];
      {
        const saved={time:G.time,actors:G.actors,netm:G.netm,match:G.match,level:G.level,physics:G.physics};
        G.netm=null;G.match={playing:()=>true,state:'playing',time:180};
        G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};G.physics=new api.Physics(G.level);
        const equipDirect=(a,ap)=>{a.s3.loadout=emptyLoadout();for(const p of a.s3.loadout){if(ap>=10){p.main='subResistance';ap-=10;}}for(const p of a.s3.loadout)for(let i=0;i<3&&ap>=3;i++){p.subs[i]='subResistance';ap-=3;}a.s3RefreshGear();};
        for(const source of ['angleShooter','sprinkler'])for(const ap of [0,10,57]){
          G.projectiles.clear();const o=makeActor('shooter'),v=makeActor('shooter');v.team=1;v.invuln=0;v.pos.set(0,0,2);equipDirect(v,ap);G.actors=[o,v];o.weapon={...o.weapon,sub:source};o.weaponRunner.reset();const hp=v.hp;
          if(source==='angleShooter'){const p=G.projectiles.throwBomb(o);p.pos.set(0,.7,0);p.prev.copy(p.pos);p.vel.set(0,0,60);}
          else{G.projectiles.throwBomb(o);const b=G.projectiles.bombs.at(-1);kitBombContact(api.SUB,b,{hit:true,point:new THREE.Vector3(0,0,0),normal:new THREE.Vector3(0,1,0)});b.s3Sprinkler.nextFrame=Infinity;b.s3Sprinkler.drops.push({pos:new THREE.Vector3(0,.7,2),vel:new THREE.Vector3(),life:0,seed:.2});}
          for(let i=0;i<10&&v.hp===hp;i++){G.time+=1/60;G.projectiles.update(1/60);}
          const raw=source==='angleShooter'?40:20,expected=Math.floor(raw*gearCurve(ap,1,.75,.5)*10+1e-9)/10;check(Math.abs(hp-v.hp-expected)<1e-8,'native direct resistance '+source+' '+ap);directSubChecks.push({source,ap,damage:hp-v.hp});
        }
        for(const source of ['angleShooter','sprinkler'])for(const ap of [0,57]){
          if(source==='sprinkler'){
            const packets=[],acks=[],ticks=[];
            const V=THREE.Vector3,wall={id:0,solid:true,center:new V(0,2,3),half:new V(10,2,.2),axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]};
            const level={blocks:[wall],faces:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;out.push(0);return out;}},physics=new api.Physics(level);
            const worlds=[];
            const activate=w=>Object.assign(G,{netm:w.nm,match:w.match,actors:[w.o,w.v],projectiles:w.projectiles,time:w.time,level,physics});
            const endpoint=id=>{
              const o=makeActor('shooter',1),v=makeActor('shooter',2);Object.assign(o,{team:0,owner:'direct-owner',netLife:0});Object.assign(v,{team:1,owner:'direct-victim',netLife:0,invuln:0});o.pos.set(0,0,0);v.pos.set(200,0,0);o.aimDir.set(0,-.9,.435889894);equipDirect(v,ap);o.weapon={...o.weapon,sub:'sprinkler'};o.weaponRunner.reset();
              const projectiles=new originalProjectiles.constructor({add(){},remove(){}}),tr={sendTo(_to,p){if(p.k==='hit')packets.push(JSON.parse(JSON.stringify(p)));if(p.k==='hit_ack')acks.push(JSON.parse(JSON.stringify(p)));return true;},broadcast(p){if(p.k==='t'&&id==='direct-owner')ticks.push(JSON.parse(JSON.stringify(p)));if(p.k==='hit_ack')acks.push(JSON.parse(JSON.stringify(p)));return true;}};
              const session={myId:id,hostId:'direct-owner',isHost:id==='direct-owner',tr,_members:new Map([['direct-owner',{}],['direct-victim',{}]])},match={actors:[o,v],playing:()=>true,state:'playing',time:180};
              const nm=new NetMatch(session,{id:'direct-sprinkler-native',map:'reef'}),w={o,v,nm,match,projectiles,time:0};activate(w);nm.bind(match);session.match=nm;worlds.push(w);return w;
            };
            const originalProjectiles=G.projectiles,tx=endpoint('direct-owner'),rx=endpoint('direct-victim');
            try{
              activate(tx);tx.projectiles.throwBomb(tx.o);const bomb=tx.projectiles.bombs.find(b=>b.owner===tx.o);check(bomb?.s3Resolved?.spec?.id==='sprinkler'&&tx.o.weaponRunner.s3Sub?.id==='sprinkler','native resolved sprinkler');check(tx.nm._sendTick()===true,'sprinkler birth tick');
              const birth=ticks[0]?.e?.find(e=>e[1]==='b'&&e[11]==='sprinkler');check(birth?.length===16,'tagged actual sprinkler birth');
              activate(rx);rx.nm.onMessage('direct-owner',ticks[0]);await new Promise(resolve=>setTimeout(resolve,200));rx.time+=.2;activate(rx);rx.nm.update(.2);check(rx.projectiles.bombs.some(b=>b.ghost&&b.owner===rx.o),'receiver creates native sprinkler');
              let placed=false,previous=0;
              for(let frame=0;frame<180&&!acks.length;frame++){
                await new Promise(resolve=>setTimeout(resolve,17));
                const st=bomb.s3Sprinkler;if(!placed&&frame>50&&st?.drops.length){const d=st.drops.find(d=>d.pos.y>.15&&d.pos.y<1.7);if(d){tx.v.pos.set(d.pos.x,0,d.pos.z);rx.v.pos.copy(tx.v.pos);placed=true;}}
                tx.time+=1/60;activate(tx);tx.projectiles.update(1/60);if(frame%10===0)tx.nm._sendTick();
                rx.time+=1/60;activate(rx);if(frame%10===0)rx.nm.onMessage('direct-owner',ticks.at(-1));rx.nm.update(1/60);rx.projectiles.update(1/60);
                while(previous<packets.length){const packet=packets[previous++];check(packet.w==='sprinkler'&&packet.d===20,'native generated spray20');const hp=rx.v.hp;
                  rx.nm.onMessage('foreign',packet);check(rx.v.hp===hp,'foreign native spray rejected');rx.nm.onMessage('direct-owner',{...packet,w:'unknown-sub'});check(rx.v.hp===hp,'unknown native spray rejected');
                  rx.nm.onMessage('direct-owner',{...packet,d:40});check(rx.v.hp===hp&&!rx.nm._combatProvenance?.pending.get('direct-owner')?.some(x=>x.d.h===packet.h),'raw40 cannot reserve native20 ID');
                  rx.nm.onMessage('direct-owner',packet);
                }
              }
              const expected=ap===57?10:20;check(acks.length===1&&acks[0].d===expected&&rx.v.hp===100-expected,'native receiver contact and ACK agree');
              const packet=packets.find(p=>p.h===acks[0].h),hp=rx.v.hp;rx.nm.onMessage('direct-owner',packet);check(rx.v.hp===hp,'native spray duplicate inert');directSubChecks.push({source,ap,wire:true,nativeContact:true,damage:100-rx.v.hp});
            }finally{for(const w of worlds){activate(w);w.nm.dispose();w.projectiles.clear();}G.projectiles=originalProjectiles;G.netm=null;G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};G.physics=new api.Physics(G.level);}
            continue;
          }
          G.projectiles.clear();
          const makePair=()=>{
            const o=makeActor('shooter',1),v=makeActor('shooter',2);o.owner='direct-owner';v.owner='direct-victim';
            o.team=0;v.team=1;v.invuln=0;o.netLife=v.netLife=0;o.pos.set(0,0,0);v.pos.set(0,0,2);o.aimDir.set(0,0,1);
            equipDirect(v,ap);equipDirect(o,57);o.weapon={...o.weapon,sub:source};o.weaponRunner.reset();
            if(source==='sprinkler')check(o.weaponRunner.s3Sub?.id===source,'runner selected equipped sprinkler');
            return {o,v};
          };
          const sender=makePair(),receiver=makePair();let packet,ack;const ticks=[];
          const bind=(pair,myId,tr)=>{
            const session={myId,hostId:'direct-owner',isHost:myId==='direct-owner',tr,_members:new Map([['direct-owner',{}],['direct-victim',{}]])};
            const match={actors:[pair.o,pair.v],state:'playing',time:180,playing:()=>true};
            const nm=new NetMatch(session,{id:'direct-probe',map:'reef'});nm.bind(match);session.match=nm;G.netm=nm;G.match=match;G.actors=match.actors;return nm;
          };
          const tx=bind(sender,'direct-owner',{sendTo:(_id,p)=>{if(p.k==='hit')packet=JSON.parse(JSON.stringify(p));return true;},broadcast:p=>{if(p.k==='t')ticks.push(JSON.parse(JSON.stringify(p)));return true;}});
          let rx;
          try{
            // Native equipped birth and ordered owner tick; never fabricate provenance.
            const born=G.projectiles.throwBomb(sender.o);
            check(!!(source==='angleShooter'?born:G.projectiles.bombs.find(b=>b.owner===sender.o)),'native direct-sub birth');
            if(source==='sprinkler'){const b=G.projectiles.bombs.find(b=>b.owner===sender.o);check(b?.s3Sub?.id===source&&b?.s3Resolved?.spec?.id===source,'birth resolves equipped sprinkler, not stale suction');}
            check(tx._sendTick()===true&&ticks.length===1,'native direct-sub owner tick');
            const isBirth=e=>source==='angleShooter'?e[1]==='ac'&&e[2]==='sub'&&e[5]?.phase==='spawn'&&e[5]?.subId===source:e[1]==='b'&&e[2]===1&&e[3]==='bomb'&&e[11]===source;
            check(ticks[0].e.some(isBirth),'native direct-sub event recorded');
            // Raw40 is a wire policy probe; native sprinkler contact above is20.
            tx.sendHit(sender.o,sender.v,40,source);check(packet?.d===40,'raw direct hit on wire');
            G.projectiles.clear();
            rx=bind(receiver,'direct-victim',{sendTo:(_id,p)=>{if(p.k==='hit_ack')ack=JSON.parse(JSON.stringify(p));return true;},broadcast:p=>{if(p.k==='hit_ack')ack=JSON.parse(JSON.stringify(p));return true;}});
            rx.onMessage('direct-owner',ticks[0]);check(rx.peers.get('direct-owner')?.events.some(isBirth),'native direct-sub event admitted');
            const {v}=receiver,hp=v.hp;
            rx.onMessage('foreign',packet);check(v.hp===hp,'foreign direct hit rejected');
            rx.onMessage('direct-owner',{...packet,w:'unknown-sub'});check(v.hp===hp,'unknown direct hit rejected');
            if(source==='angleShooter'){rx.onMessage('direct-owner',{...packet,d:40.1});check(v.hp===hp,'oversized direct hit rejected');}
            rx.onMessage('direct-owner',packet);
            // Advance only the existing receiver clock; native ghost birth must commit.
            for(let i=0;i<30&&!ack;i++){G.time+=1/60;rx.update(1/60);}
            if(source==='sprinkler')check(G.projectiles.bombs.some(b=>b.owner===receiver.o&&b.ghost),'native receiver sprinkler materialized');
            const damage=hp-v.hp;check(damage===(ap===57?20:40)&&ack?.d===damage,'direct victim and ACK agree');
            rx.onMessage('direct-owner',packet);check(hp-v.hp===damage,'duplicate direct hit rejected');directSubChecks.push({source,ap,wire:true,damage});
          }finally{tx.dispose();rx?.dispose();G.projectiles.clear();G.netm=null;}
        }
        G.projectiles.clear();Object.assign(G,saved);
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
        splatanaThrowChecks, chargeKeepChecks, scopeAdmissionChecks, wallFacingChecks, catalogueSubChecks, torpedoGearContactChecks, directSubChecks, accelerationChecks, mistChecks, mistQueryChecks, kitChecks, weightChecks, uniqueGearChecks, sprinklerPowerChecks, conditionalChecks, objectGearChecks, gearAdoptionChecks, gearClockChecks, transientGearChecks, subMarkChecks,
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
