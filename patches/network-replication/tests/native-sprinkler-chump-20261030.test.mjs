import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeSprinklerSource} from './native-sprinkler-source-fixture.mjs';
import {objectDamageScale} from '../../splatoon3/runtime/sub-resistance.mjs';

const fields=['sourceSpecial','sourceActivation','sourceObject','sourceIndex','sourceSeed'];
const claim=e=>e?.[1]==='ac'&&e[5]?.phase==='nativeObjectHit';
const source=t=>nativeSprinklerSource(t,{kind:'special',id:'superChump',frames:400,
 configure:x=>{
  // The real target throw also consumes random values. Pin the source's
  // independent fixture sequence after that constructor, retaining the same
  // three overlapping native decoys as the Sub/Special regression.
  x.f.setRandomSeed(7);
 }});

function checkBirths(x){
 const born=x.events.filter(e=>e[5]?.id==='superChump'&&e[5]?.action==='deploy');
 assert.equal(born.length,12,'a real paid native activation publishes twelve constructor events');
 assert.ok(x.claims.length>=3,'fixed-seed native decoys overlap the real Sprinkler');
 assert.ok(x.claims.filter(e=>e[5].damage===35).length>=2,'two separate decoys share the native weak damage band');
 for(const e of x.claims){
  const p=e[5],b=born.find(e=>e[5].activation===p.sourceActivation&&e[5].object===p.sourceObject)?.[5];
  assert.equal(p.sourceSpecial,'superChump');assert.ok(b,'source label selects an actual emitted native constructor');
  assert.equal(p.sourceIndex,b.index);assert.equal(p.sourceSeed,b.seed);assert.equal(b.tick,1);
 }
 assert.equal(new Set(x.claims.map(e=>e[5].sourceIndex)).size,x.claims.length);
}

test('native Sprinkler Chump: distinct native decoys retain source labels through AoE and consume only their own contacts',async t=>{
 const x=await source(t);checkBirths(x);const out=[];let serial=1000000;
 const changed=(e,edit)=>{const p=structuredClone(e);p[5].eventSeq=serial++;edit?.(p[5]);return p;};
 for(const packet of x.packets)out.push(...x.deliver(packet,rows=>rows.flatMap(e=>{
  if(!claim(e))return[e];
  return [changed(e,p=>{for(const f of fields)delete p[f];}),
   ...fields.map(f=>changed(e,p=>{delete p[f];})),
   changed(e,p=>{p.sourceActivation++;}),changed(e,p=>{p.sourceObject=p.sourceObject%12+1;}),
   changed(e,p=>{p.sourceIndex=(p.sourceIndex+1)%12;}),changed(e,p=>{p.sourceSeed=(p.sourceSeed^1)>>>0;}),
   changed(e,p=>{p.damage++;}),e,changed(e)];
 })));
 const applied=out.filter(r=>r.after<r.before),scale=objectDamageScale(x.attacker,'sprinkler','Bomb');
 assert.ok(applied.length>=2,'overlapping distinct native decoys reach the real HP consumer');
 assert.ok(applied.every(r=>r.event[5].eventSeq<1000000),'missing/relabelled/inflated/fresh-sequence proposals cannot spend another native birth');
 for(const r of applied)assert.equal(r.after,Math.max(0,r.before-r.event[5].damage*scale),'existing native object scaling and HP clamping remain exact');
 assert.equal(x.target.s3DeviceHP,Math.max(0,120-x.claims.reduce((sum,e)=>sum+e[5].damage*scale,0)));
 assert.equal(new Set(applied.map(r=>r.event[5].sourceIndex)).size,applied.length);
 t.diagnostic(JSON.stringify({fixtureSeed:7,claims:x.claims.map(e=>({index:e[5].sourceIndex,amount:e[5].damage})),accepted:applied.length,hp:x.target.s3DeviceHP,scale}));
});

test('native Sprinkler Chump: source labels and constructors without the paid use never reduce native HP',async t=>{
 const x=await source(t);checkBirths(x);assert.ok(x.events.some(e=>e[1]==='ev'&&e[2]==='special:use'));
 for(const packet of x.packets)x.deliver(packet,rows=>rows.filter(e=>!(e[1]==='ev'&&e[2]==='special:use')));
 assert.equal(x.target.s3DeviceHP,120);assert.equal(x.target.s3Destroyed,undefined);
});

test('native Sprinkler Chump: omitting all private decoy births cannot be repaired by complete proposal labels',async t=>{
 const x=await source(t);checkBirths(x);
 for(const packet of x.packets)x.deliver(packet,rows=>rows.filter(e=>!(e[5]?.id==='superChump'&&e[5]?.action==='deploy')));
 assert.equal(x.target.s3DeviceHP,120);assert.equal(x.target.s3Destroyed,undefined);
});
