import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../combat-provenance-adapter.mjs',import.meta.url),'utf8').replace('export function ','function ');
// Synthetic constants/knockback validator exercise final composition plumbing,
// not gameplay magnitudes or the native knockback geometry contract.
const template=`const G={},THREE={},NetMatch={};const IW_HIT_MAX_DAMAGE=500,IW_HIT_CAUSES=new Set(['angleShooter','burst','shot','blaster']),IW_ANGLE_SHOOTER_HIT_MAX=40,IW_CATALOGUE_SUB_HIT_MAX={burst:180};
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
const generator=vm.createContext({template});new vm.Script(source+'\noutput=adaptCombatProvenance("src/net/netmatch.js",template);').runInContext(generator,{timeout:100});
const compiled=vm.createContext({installCombatProvenance:()=>{}});new vm.Script(generator.output.replace(/^import .*\n/,'')+'\npolicy=iwRemoteHitPayloadAllowed;guard=nativeGuard;').runInContext(compiled,{timeout:100});
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
test('duplicate final guard fails closed during composition',()=>{generator.template=template+template;assert.throws(()=>new vm.Script('adaptCombatProvenance("src/net/netmatch.js",template)').runInContext(generator,{timeout:100}),/identity mismatch/);});
