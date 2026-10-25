// CPU-only presentation contracts, not a claim of retail pixel equivalence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPON_RETICLE_GEOMETRY_PROFILES as profiles, weaponReticleGeometryProfile as profile,
  weaponReticleGeometryState as state} from '../weapon-reticle-geometry.mjs';
import {readWeaponReticlePresentation} from '../weapon-reticle-presentation.mjs';

test('only reference-supported identities select geometry; unsupported families and Decavitator remain native', () => {
  assert.equal(profile({family:'roller'}), profiles.roller);
  assert.equal(profile({family:'brella'}), profiles.brella);
  for (const [id,key] of [['s3-saber-lite','wiper'],['s3-saber-normal','stamper']]) {
    assert.equal(profile({family:'splatana',weaponId:id}),profiles[key]);
    const kit={id:id+'-01',kind:'catalog',behaviorKind:'splatana',catalogRecord:{id,family:'splatana'}};
    assert.equal(profile(readWeaponReticlePresentation(kit,{})),profiles[key]);
  }
  for (const value of [undefined,null,{},...['shooter','blaster','charger','stringer','slosher','brush','dualies','splatling'].map(family=>({family})),
    {family:'splatana',weaponId:'s3-saber-heavy'},
    {family:'splatana',weaponId:'s3-saber-lite-01'}]) {
    assert.equal(profile(value),null); assert.equal(state(value),null);
  }
});

test('all profile/state records and allowed IDs are immutable cached presentation data', () => {
  assert(Object.isFrozen(profiles));
  for (const p of Object.values(profiles)) {
    assert(Object.isFrozen(p)); assert(Object.isFrozen(p.states));
    assert.equal(p.accuracy,'reference-guided-approximation'); assert.equal(p.referenceHeight,720);
    if(p.weaponIds)assert(Object.isFrozen(p.weaponIds));
    for(const s of Object.values(p.states)) {
      assert(Object.isFrozen(s)); assert.equal(s.profileId,p.id);
      assert.equal(s.id,p.id+':'+s.state);
      assert.match(s.svg,/aria-hidden="true"/); assert.match(s.svg,/focusable="false"/);
      assert.match(s.svg,/transform:none/); assert.match(s.svg,/pointer-events:none/);
      assert.match(s.svg,/color:inherit/); assert.doesNotMatch(s.svg,/#fff|--iw-reticle-presentation-color/);
      assert.doesNotMatch(s.svg,/NaN|Infinity|<image|<script|https?:\/\/[^" ]+\.(?:png|jpg|gif)/i);
      assert.match(s.svg,/stroke-dasharray:none/);
    }
  }
});

test('roller and Brella retain one steady state without inventing canopy or empty-ammo geometry', () => {
  for(const family of ['roller','brella'])for(const charging of [false,true])for(const charge of [0,.5,1]) {
    const p={family,charge,charging,streaming:true,canopyOpen:true,canopyPreparing:true};
    assert.equal(state(p),profile(p).states.idle);
  }
  assert.match(profiles.roller.states.idle.svg,/<circle[^>]*r="13"/);
  assert.match(profiles.roller.states.idle.svg,/M-49\.2 -18\.7l8 -8/);
  assert.doesNotMatch(profiles.brella.states.idle.svg,/<path/,'Brella spread corners belong on the four existing ticks, not a duplicate static frame');
});

test('Wiper and independently verified Stamper use idle versus charge/full presentation, release always recovers idle', () => {
  for(const [weaponId,key]of [['s3-saber-lite','wiper'],['s3-saber-normal','stamper']]) {
    for(const [charging,charge,name]of [[false,0,'idle'],[false,1,'idle'],[true,0,'charging'],[true,.999,'charging'],[true,1,'full'],[1,1,'idle']]) {
      assert.equal(state({family:'splatana',weaponId,charging,charge}),profiles[key].states[name]);
    }
    assert.match(profiles[key].states.idle.svg,/idle-ticks/);
    assert.match(profiles[key].states.charging.svg,/charge-bars/);
    assert.equal(profiles[key].states.full.svg,profiles[key].states.charging.svg,'no unverified full-charge recolouring');
    assert.doesNotMatch(profiles[key].states.charging.svg,/iw-ret__charge|stroke-dashoffset|animate/);
  }
});

test('Stamper has its own eight idle ticks and eight charge bars; only Decavitator stays excluded', () => {
  assert.equal(profiles.stamper.activation,'active');
  const idle=profiles.stamper.states.idle.svg,charging=profiles.stamper.states.charging.svg;
  for(const x of [-45,-36,-27,-18,18,27,36,45])assert(idle.includes(`M${x} -7V7`));
  assert.equal((idle.match(/M-?\d+ -7V7/g)||[]).length,8);
  assert.equal((profiles.wiper.states.idle.svg.match(/M-?\d+ -7V7/g)||[]).length,6);
  assert(charging.includes('M-9 -49H9 M-11 -38H11 M-13 -27H13 M-15 -16H15 M-15 16H15 M-13 27H13 M-11 38H11 M-9 49H9'));
  for(const id of ['s3-saber-heavy'])for(const charging of [false,true])for(const charge of [0,.5,1]) {
    const presentation={family:'splatana',weaponId:id,charge,charging};
    assert.equal(profile(presentation),null);assert.equal(state(presentation),null);
  }
  const kit={id:'s3-saber-normal-01',kind:'catalog',behaviorKind:'splatana',catalogRecord:{id:'s3-saber-normal',family:'splatana'}};
  assert.equal(state(readWeaponReticlePresentation(kit,{charge:1,charging:true})),profiles.stamper.states.full);
});

test('Brella shares four cached quadrant SVGs which counterrotate only the inherited local angle', () => {
  const glyphs=profiles.brella.spreadTickSvgs;
  assert(Object.isFrozen(glyphs));assert.equal(glyphs.length,4);
  assert.equal(profiles.brella.states.idle.spreadTickSvgs,glyphs);
  const paths=['M-10 -10V-20L0 -30H10','M10 -10V-20L0 -30H-10','M-10 10V20L0 30H10','M10 10V20L0 30H-10'];
  glyphs.forEach((svg,i)=>{
    assert(svg.includes(paths[i]),'TL/TR/BL/BR glyph order '+i);
    assert.match(svg,/viewBox="-16 -40 32 80"/);
    assert.match(svg,/width="32" height="80"/);assert.match(svg,/left:-16px;top:-40px/);
    assert.match(svg,/rotate\(calc\(0deg - var\(--iw-angle,\s*0deg\)\)\)/);
    assert.doesNotMatch(svg,/var\(--sp|--iw-cx|--iw-cy|stroke-dasharray:(?!none)/);
  });
  for(const p of [profiles.roller,profiles.wiper,profiles.stamper])for(const s of Object.values(p.states))assert.equal(s.spreadTickSvgs,null);
});

test('steady selectors reuse immutable records across repeated frames without mutating input', () => {
  const input=Object.freeze({family:'brella',weaponId:'test-brella',charge:.5,charging:true});
  const first=state(input);for(let i=0;i<10_000;i++)assert.strictEqual(state(input),first);
  assert.deepEqual(input,{family:'brella',weaponId:'test-brella',charge:.5,charging:true});
});
