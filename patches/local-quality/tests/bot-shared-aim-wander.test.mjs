import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../../../inkwave-public/src/game/bots.js',import.meta.url),'utf8');
const declaration=source.match(/^const botAimWander = (\(x\) => [^;]+);$/m);
assert.ok(declaration,'Production module must own one shared pure function');
const shared=vm.runInNewContext('('+declaration[1]+')',{Math});
const original=x=>Math.sin(x)*0.6+Math.sin(x*2.27+1.3)*0.4;

test('ordinary and boss aim use one shared stateless function, with no per-tick definition',()=>{
 assert.equal((source.match(/const botAimWander =/g)||[]).length,1);
 assert.equal((source.match(/botAimWander\(this\.t \* /g)||[]).length,4);
 assert.ok(!source.includes('const wander = (x) =>'),'do not allocate old closure every update');
});
test('shared wander expression preserves Object.is for deterministic target phases',()=>{
 for(let i=0;i<50000;i++){
  const phase=(i-25000)/37.3;
  assert.ok(Object.is(shared(phase),original(phase)),'phase='+phase);
 }
 for(const phase of [0,-0,Math.PI,-Math.PI,NaN,Infinity,-Infinity]){
  assert.ok(Object.is(shared(phase),original(phase)),'special phase='+phase);
 }
});
test('ordinary and boss aim downstream arguments keep exact arithmetic and acquisition factors',()=>{
 const cases=10000;
 for(let i=0;i<cases;i++){
  const t=i/143,ph1=i*0.0031,ph2=-i*0.0023,e=(i%31)/32,acq=i%17/17,sgn=i%2?-1:1;
  const oldYaw=1.25+e*(0.75*original(t*1.7+ph1)+2.4*acq*sgn);
  const newYaw=1.25+e*(0.75*shared(t*1.7+ph1)+2.4*acq*sgn);
  const oldPitch=-0.4+e*0.6*(0.75*original(t*2.1+ph2)+1.6*acq*sgn);
  const newPitch=-0.4+e*0.6*(0.75*shared(t*2.1+ph2)+1.6*acq*sgn);
  assert.ok(Object.is(oldYaw,newYaw)&&Object.is(oldPitch,newPitch));
 }
});
