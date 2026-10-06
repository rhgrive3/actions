import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './robustness-fixture.mjs';
const source=fs.readFileSync(new URL('./browser-fixture.mjs',import.meta.url),'utf8');
const start=source.indexOf('function makeActor(r)'),end=source.indexOf('\nconst game=',start);
assert(start>=0&&end>start);
const factorySource=source.slice(start,end);
function factory(f,before=false){
 f.G.net={myId:'me'};
 const code=before?factorySource.replace('Object.assign(a,{specialCost:Actor.prototype.specialCost,specialFrac:Actor.prototype.specialFrac,specialReady:Actor.prototype.specialReady});',''):factorySource;
 return vm.runInNewContext(code+';makeActor',{THREE:f.THREE,G:f.G,WEAPONS:f.WEAPONS,WeaponRunner:f.WeaponRunner,Actor:f.Actor});
}
const roster={nid:7,owner:'me',team:0,weapon:'roller'};
test('old browser arena Actor reproduces the real _sendTick specialCost TypeError',async()=>{
 const f=await fixture(),make=factory(f,true),a=make(roster),nm=f.makeNetMatch(f.makeSession());f.bind(nm,[a]);
 assert.equal(a.specialCost,undefined);assert.throws(()=>nm._sendTick(),/specialCost is not a function/);
});
test('browser arena uses actual Actor methods and sends current local cost/readiness once',async()=>{
 const f=await fixture(),make=factory(f),a=make(roster),remote=make({...roster,nid:8,owner:'p2',team:1}),nm=f.makeNetMatch(f.makeSession());
 f.bind(nm,[a,remote]);let packet;nm.s.tr.broadcast=d=>{packet=JSON.parse(JSON.stringify(d));};
 assert.equal(a.specialCost,f.Actor.prototype.specialCost);assert.equal(a.specialReady,f.Actor.prototype.specialReady);assert.equal(a.specialFrac,f.Actor.prototype.specialFrac);
 a.weapon={...a.weapon,specialCost:142.25};a.special=100;remote.s3SpecialCost=97;remote.s3SpecialReady=true;
 nm._sendTick();assert.equal(packet.sc[7],142.25);assert.equal(packet.sc[8],undefined);assert.equal(packet.a.length,1);assert.equal(packet.a[0][10]&8388608,0);assert.equal(a.specialFrac(),100/142.25);
 a.weapon.specialCost=80;nm._sendTick();assert.equal(packet.sc[7],80);assert.equal(packet.a[0][10]&8388608,8388608);
 a.specialActive={id:'storm'};nm._sendTick();assert.equal(packet.a[0][10]&8388608,0);
 remote.special=25;assert.equal(remote.specialCost(),97);assert.equal(remote.specialReady(),true);remote.specialActive={id:'storm'};assert.equal(remote.specialReady(),false);
 remote.remote=false;assert.equal(remote.specialCost(),remote.weapon.specialCost,'adopted owner ignores remote presentation override');
});
test('actual JSON tick keeps equipped cost and readiness after owner admission',async()=>{
 const owner=await fixture(),receiver=await fixture(),a=factory(owner)(roster),b=factory(receiver)(roster);
 const onm=owner.makeNetMatch(owner.makeSession('me','me')),rnm=receiver.makeNetMatch(receiver.makeSession('p2','me'));
 owner.bind(onm,[a]);receiver.bind(rnm,[b]);let packet;onm.s.tr.broadcast=d=>{packet=JSON.parse(JSON.stringify(d));};
 a.weapon={...a.weapon,specialCost:137.5};a.special=137.5;onm._sendTick();
 rnm.onMessage('spoof',packet);assert.equal(b.net.buf.length,0);
 rnm.onMessage('me',packet);assert.equal(b.net.buf.length,1);assert.equal(b.net.buf[0].spCost,137.5);
 rnm._peer('me').tr=packet.ts;
 rnm._sample(b,packet.ts,1/60);rnm.applyRemote(b,1/60);
 assert.equal(b.specialCost(),137.5);assert.equal(b.specialReady(),true);
});
