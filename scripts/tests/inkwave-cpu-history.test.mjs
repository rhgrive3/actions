import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {replaceOnce} from '../../patches/local-quality/adapter.mjs';
const url=new URL('../benchmark-aplus-verification.mjs',import.meta.url);
const source=fs.readFileSync(url,'utf8');
// Execute the actual admission prefix, before the expensive historical loops.
const prefix=source.slice(source.indexOf('function benchmarkComposedProductionBuildParity()'),source.indexOf('  // Reconstruct exact pre-migration'));
assert.ok(prefix.includes('combinedBodySha')&&prefix.includes('Immutable historical BodyBalance'));
const run=(changeCurrent=x=>x,changeFixture=x=>x)=>new Function('fs','createHash','replaceOnce','assert',prefix.replaceAll('import.meta.url',JSON.stringify(url.href))+'return true;} return benchmarkComposedProductionBuildParity();')({readFileSync(path,...args){
 const value=fs.readFileSync(path,...args);
 return path.pathname.endsWith('/inkwave-public/src/game/motion/body-balance.js')?changeCurrent(value):path.pathname.endsWith('/body-balance-26a4db41.js.txt')?changeFixture(value):value;
}},createHash,replaceOnce,assert);
test('actual historical gate admits the exact independently verified cache/closure integration',()=>assert.equal(run(),true));
test('arbitrary current runtime drift cannot inherit the historical identity claim',()=>{
 for(const change of [s=>s+'\n',s=>s.replace('vertical:.38','vertical:.4'),s=>s.replace('for(const i of this.rotationWorldIndices){','for(let i=0;i<this.bank.bones.length;i++){')])
  assert.throws(()=>run(change),/exact reviewed closure or its fixed #1815 cache integration/);
});
test('the immutable historical reference is checked independently of the current source',()=>{
 assert.throws(()=>run(x=>x,s=>s+'\n'),/Immutable historical BodyBalance migration input/);
});
