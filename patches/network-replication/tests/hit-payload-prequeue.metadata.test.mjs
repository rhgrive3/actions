import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
const stormImport="import {adaptStormDeviceContact} from './storm-device-contact-adapter.mjs';";
let source=readFileSync(new URL('../combat-provenance-adapter.mjs',import.meta.url),'utf8');
assert.equal(source.split(stormImport).length,2,'one explicit build-only Storm composition dependency');
source=source.replace(stormImport,'').replace('export function ','function ');
const stormSource=readFileSync(new URL('../storm-device-contact-adapter.mjs',import.meta.url),'utf8').replace('export function ','function ');
assert.doesNotMatch(source+stormSource,/^import /m,'new composition dependencies require explicit metadata audit');
source=stormSource+'\n'+source;
// Synthetic constants/knockback validator exercise final composition plumbing,
// not gameplay magnitudes or the native knockback geometry contract.
const payloadTemplate=`const G={},THREE={},NetMatch={};const IW_HIT_MAX_DAMAGE=500,IW_HIT_CAUSES=new Set(['angleShooter','burst','shot','blaster']),IW_ANGLE_SHOOTER_HIT_MAX=40,IW_CATALOGUE_SUB_HIT_MAX={burst:180};
const validBlasterKnockback=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
function nativeGuard(d) {
    const blastKnockback = d.w === 'blaster' && validBlasterKnockback(d.kb);
    if (d.kb !== undefined && !blastKnockback) return;
    if (!Number.isFinite(d.d) || d.d < 0 || (d.d === 0 && !blastKnockback) || d.d > IW_HIT_MAX_DAMAGE) return;
    if (typeof d.w !== 'string' || !IW_HIT_CAUSES.has(d.w)) return;
    if (d.w === 'angleShooter' && d.d > IW_ANGLE_SHOOTER_HIT_MAX) return;
    if (Object.hasOwn(IW_CATALOGUE_SUB_HIT_MAX,d.w) && d.d > IW_CATALOGUE_SUB_HIT_MAX[d.w]) return;
 return true;
}`;
// Compose source text only. Native modules/actors are never evaluated in this metadata test.
const nativeSource=adaptBuildSource('src/net/netmatch.js',readFileSync(new URL('../../../inkwave-public/src/net/netmatch.js',import.meta.url),'utf8'));
const hitStart='  _hit(d, from) {',hitEnd='    this._applyingHit = true;';
assert.equal(nativeSource.split(hitStart).length,2);assert.equal(nativeSource.split(hitEnd).length,2);
const receiptPrefix=nativeSource.slice(nativeSource.indexOf(hitStart),nativeSource.indexOf(hitEnd));
const bossStart=nativeSource.indexOf('  _acceptBossHit(from, d) {');
const bossReceipt=nativeSource.slice(bossStart,nativeSource.indexOf('\n  sendBossHit(',bossStart));
const constants=payloadTemplate.slice(0,payloadTemplate.indexOf('function nativeGuard')).replace('NetMatch={}','unusedNetMatch={}');
// Include the exact build-only Storm anchors in an uncalled metadata method.
// The real helper transforms them; no native Storm birth/use is evaluated.
const stormTemplate=`
  _stormMetadata(p) {
    const source = { s3SpecialPowerAP: p.s3SpecialWeapon.specialPowerAP ?? 0 };
      kitPreparedEvents.push(e);
          commitCreatedSprinklerBirth(this, from, e, b);
    if (!stormSnapshotAllows(a, e._stormSnapshot, from) || e._netSeq <= auth.useSeq) return;
    for (;;) {
      if (!stormSnapshotAllows(a, e._stormSnapshot, from) || e._netSeq <= auth.useSeq) break;
      break;
    }
          auth.used = true;
  }
`;
const template=constants+'class NetMatch {\n'+receiptPrefix+hitEnd+'\n}\n'+bossReceipt+'\n  sendBossHit() {}\n'+stormTemplate+'}';
const nativeGuard=payloadTemplate.slice(payloadTemplate.indexOf('function nativeGuard'));
const generator=vm.createContext({template});new vm.Script(source+'\noutput=adaptCombatProvenance("src/net/netmatch.js",template);').runInContext(generator,{timeout:100});
let generated=generator.output;
for(const dependency of [
  "import { installCombatProvenance } from '../../patches/network-replication/combat-provenance.mjs';",
  "import { stageNativeStormDeviceBirth,authorizeNativeStormDeviceBirth,commitNativeStormDeviceBirth } from '../../patches/network-replication/storm-device-contact-proof.mjs';",
]) {
  assert.equal(generated.split(dependency).length,2,'one explicitly isolated native dependency');
  generated=generated.replace(dependency,'');
}
assert.doesNotMatch(generated,/^import /m,'unreviewed native dependency cannot enter metadata realm');
const compiled=vm.createContext({installCombatProvenance:()=>{}});new vm.Script(generated+'\n'+nativeGuard+'\npolicy=iwRemoteHitPayloadAllowed;guard=nativeGuard;').runInContext(compiled,{timeout:100});
for(const [name,d,want] of [
 ['angle bound',{w:'angleShooter',d:40},true],['angle overflow',{w:'angleShooter',d:40.1},false],
 ['sub bound',{w:'burst',d:180},true],['sub overflow',{w:'burst',d:181},false],
 ['maximum',{w:'shot',d:500},true],['overflow',{w:'shot',d:501},false],
 ['unknown',{w:'fake',d:10},false],['negative',{w:'shot',d:-1},false],
 ['nan',{w:'shot',d:NaN},false],['zero without kb',{w:'shot',d:0},false],
 ['zero with unrelated kb',{w:'shot',d:0,kb:[1,0,0]},false],['zero bounded blaster',{w:'blaster',d:0,kb:[1,0,0]},true],
 ['bad blaster kb',{w:'blaster',d:0,kb:{}},false],['normal',{w:'shot',d:35},true]
])test(name,()=>{assert.equal(compiled.policy(d),want);assert.equal(!!compiled.guard(d),want);});
test('remote wrapper checks policy before proof and enqueue',()=>{const s=readFileSync(new URL('../combat-provenance.mjs',import.meta.url),'utf8'),a=s.indexOf('  P._hit=function');const part=s.slice(a,s.indexOf('  P.onMessage=',a));assert.ok(part.indexOf('!context.hitPayloadAllowed(d)')<part.indexOf('combatAdmission(this'));assert.ok(part.indexOf('!context.hitPayloadAllowed(d)')<part.indexOf('enqueue(this'));});
test('missing final Blaster guard fails closed during composition',()=>{generator.template=template.replace('const blastKnockback','const changed');assert.throws(()=>new vm.Script('adaptCombatProvenance("src/net/netmatch.js",template)').runInContext(generator,{timeout:100}),/identity mismatch/);});
test('duplicate final guard fails closed during composition',()=>{generator.template=template+nativeGuard;assert.throws(()=>new vm.Script('adaptCombatProvenance("src/net/netmatch.js",template)').runInContext(generator,{timeout:100}),/identity mismatch/);});
