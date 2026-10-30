import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {ProjectileHistory as BeforeHistory, FrozenClamDistance} from './fixtures/wave345-before-7e860.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const beforeHash='c1b0bb74f6581774fc873ec9c8132a906e4776135036892c228fec0b4097a12a';
assert.equal(hash(fs.readFileSync(new URL('./fixtures/wave345-before-7e860.mjs',import.meta.url))),beforeHash,'frozen 7e860 oracle');
if(process.env.INKWAVE_BUILT_ROOT)throw Error('Use INKWAVE_BUILT_SITE; INKWAVE_BUILT_ROOT is unsupported');
const built=process.env.INKWAVE_BUILT_SITE?path.resolve(process.env.INKWAVE_BUILT_SITE):null;
const files=['projectile-visuals.mjs','ranked/clams.mjs'];
if(built){
  const manifest=JSON.parse(fs.readFileSync(path.join(built,'inkwave-build.json'),'utf8'));
  assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash,'artifact manifest identity');
  for(const rel of files){
    const artifact='patches/splatoon3/runtime/'+rel,source='patch/runtime/'+rel;
    assert.equal(hash(fs.readFileSync(path.join(root,artifact))),manifest.files[source],source+' source binding');
    assert.equal(hash(fs.readFileSync(path.join(built,artifact))),manifest.artifacts[artifact],artifact+' emitted bytes');
  }
  console.log('Wave 3-5 emitted modules: contentHash='+manifest.contentHash);
}
async function actual(rel){
  const file=built?path.join(built,'patches/splatoon3/runtime',rel):path.join(root,'patches/splatoon3/runtime',rel);
  return import(pathToFileURL(file).href);
}
const {ProjectileHistory}=await actual(files[0]);
const {ClamsRule}=await actual(files[1]);

test('projectile history retains exact empty, first, irregular, wrapped and knot interpolation',()=>{
  let checks=0;
  for(const count of [0,1,2,5,31,32,33,40]){
    const old=new BeforeHistory(),now=new ProjectileHistory(),ages=[];
    for(let i=0;i<count;i++){
      const age=i/60+(i%4)*.0001, values=[Math.sin(i*.2),i*.13,Math.cos(i*.3),i%3-1,Math.sin(i),2-i*.02];
      assert.equal(now.record(age,...values),old.record(age,...values));ages.push(age);
    }
    for(const bad of [NaN,Infinity,-Infinity])assert.equal(now.record(bad,0,0,0,0,0,0),old.record(bad,0,0,0,0,0,0));
    const first=ages[Math.max(0,ages.length-32)]??0,last=ages.at(-1)??0,middle=ages[Math.floor(ages.length/2)]??0;
    const probes=[-Infinity,first-1e-9,first,first+1e-9,middle-1.001e-9,middle,middle+1.001e-9,(first+last)/2,last-1e-9,last,last+1e-9,Infinity,NaN];
    for(const age of probes)for(const offset of [0,2]){
      const a=new Float64Array(10).fill(-9),b=new Float64Array(10).fill(-9);
      assert.equal(now.sample(age,b,offset),old.sample(age,a,offset));
      assert.deepEqual(b,a,`count=${count} age=${age} offset=${offset}`);checks++;
    }
  }
  assert.equal(checks,208);
});

test('clam pickup distance matches the frozen law at finite boundaries and malformed coordinates',()=>{
  const old=new FrozenClamDistance(),now=Object.create(ClamsRule.prototype);
  const points=[[0,0,0],[.82,0,0],[.8200000000000001,0,0],[.820001,0,0],[.8200010000000001,0,0],[-.8200010000000001,0,0],[0,.82,0],[0,0,-.82],[NaN,0,0],[Infinity,0,0],[-Infinity,0,0],[0,-0,0],[],[1],[1,2],[,1,2],[1,,2],[1,2,],null];
  let checks=0;
  for(const p of points)for(const q of [[0,0,0],[.3,.2,-.7],[NaN,0,0],[Infinity,0,0]])for(const reject of [false,true]){
    assert.ok(Object.is(now._pickupDistanceSq(p,q,reject),old._pickupDistanceSq(p,q,reject)),`position=${String(p)} target=${String(q)} reject=${reject}`);checks++;
  }
  assert.equal(checks,152);
});

test('native grounded-clam pickup preserves the original radius and event ownership',()=>{
  const old=new FrozenClamDistance();
  for(const x of [-.8200010000000001,-.8200000000000001,-.82,0,.82,.8200000000000001,.8200010000000001]){
    const events=[],rule=new ClamsRule({event:(kind,data)=>events.push({kind,data})},{clams:{spawns:[],goals:[[0,0,10],[0,0,-10]]}});
    const clam=rule._newClam('small',null,[0,0,0]),actor={id:'a',team:0,alive:true,pos:[x,0,0]};
    const expected=!(old._pickupDistanceSq(actor.pos,clam.pos,true)>.82**2);
    assert.equal(rule._pickup(clam,actor,{}),expected,`pickup x=${x}`);
    assert.equal(rule.state.clams.includes(clam),!expected);
    assert.equal(events.some(event=>event.kind==='clam-pickup'),expected);
  }
});
