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
      const mistChecks=[];
      {
        const saved={actors:G.actors,projectiles:G.projectiles,time:G.time};
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
          const expected=(squid?11.52:5.76)*(1-.28*gearCurve(ap,1,.75,.5));
          check(Math.abs(victim.vel.z-expected)<1e-8,'Mist victim reduction '+ap+' '+squid);
          mistChecks.push({ap,squid,speed:victim.vel.z});
          victim.pos.x+=20;victim.vel.set(0,0,0);for(let i=0;i<120;i++)victim._horizontal(1/60,squid,false);
          check(Math.abs(victim.vel.z-(squid?11.52:5.76))<1e-8,'Mist exit restores target speed');
        }
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
          if(kind==='drink'){owner.special=owner.specialCost();owner._startSpecial();check(G.projectiles._s3SupportCoolers.length===1,'actual cooler stand');G.time+=1/60;G.projectiles.update(1/60);check(owner.s3.drink,'actual stand pickup');}
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
          const remaining=(victim.s3.revealedUntil?.[0]||0)-G.time,expected=(sub==='pointSensor'?8:5)*gearCurve(ap,1,sub==='inkMine'?.55:.43,.1);
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
          G.projectiles.clear();const o=makeActor('shooter',1),v=makeActor('shooter',2);o.owner='direct-owner';v.owner='direct-victim';v.team=1;v.invuln=0;o.netLife=v.netLife=0;equipDirect(v,ap);equipDirect(o,57);o.weapon={...o.weapon,sub:source};let packet,ack;
          const tx=new NetMatch({myId:'direct-owner',hostId:'direct-owner',isHost:true,tr:{sendTo:(_id,p)=>{packet=JSON.parse(JSON.stringify(p));}}},{id:'direct-probe'});tx.bind({actors:[o,v],state:'playing',time:180});tx.sendHit(o,v,40,source);check(packet.d===40,'raw direct hit on wire');
          const rx=new NetMatch({myId:'direct-victim',hostId:'direct-owner',isHost:false,tr:{sendTo:(_id,p)=>{ack=JSON.parse(JSON.stringify(p));}}},{id:'direct-probe'});rx.bind({actors:[o,v],state:'playing',time:180});G.netm=rx;G.match=rx.match;const hp=v.hp;
          rx.onMessage('foreign',packet);check(v.hp===hp,'foreign direct hit rejected');if(source==='angleShooter'){rx.onMessage('direct-owner',{...packet,d:40.1});check(v.hp===hp,'oversized direct hit rejected');}rx.onMessage('direct-owner',packet);const damage=hp-v.hp;check(damage===(ap===57?20:40)&&ack.d===damage,'direct victim and ACK agree');rx.onMessage('direct-owner',packet);check(hp-v.hp===damage,'duplicate direct hit rejected');directSubChecks.push({source,ap,wire:true,damage});tx.dispose();rx.dispose();G.netm=null;
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
        directSubChecks, accelerationChecks, mistChecks, kitChecks, weightChecks, uniqueGearChecks, conditionalChecks, objectGearChecks, gearAdoptionChecks, gearClockChecks, transientGearChecks, subMarkChecks,
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
