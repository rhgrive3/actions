import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const upstream=process.env.INKWAVE_UPSTREAM_SOURCE||path.join(root,'inkwave-public');
const built=process.env.INKWAVE_BUILT_SITE;
if (built) {
  test('actual emitted MobileInput retains button center and floating-stick ownership', () => {
    const result=spawnSync(process.execPath,['--experimental-vm-modules','--input-type=module','-e',`(${verifyBuilt.toString()})()`],
      {encoding:'utf8',timeout:30000,env:{...process.env,INKWAVE_BUILT_SITE:path.resolve(built)}});
    if(result.stdout)console.log(result.stdout.trim());
    assert.equal(result.status,0,result.stderr||result.error?.message||'built layout verifier failed');
  });
} else {
const raw=fs.readFileSync(path.join(upstream,'src/core/mobile.js'),'utf8');
// Source ownership contract; the dedicated browser gate executes minified production bytes.
const code=adaptTouchLayout('src/core/mobile.js',raw);
const layout=code.match(/  _layoutAll\(\) \{[\s\S]*?\n  \}/)?.[0];
assert(layout,'actual native layout method retained');
const ids=['fire','jump','sub','squid','special','map','pause','gyro','stick'];
const run=new Function('ORDER','layoutUnit','return ({'+layout+'})._layoutAll;')(ids,()=>1);
for(const viewport of [[1024,768],[844,390],[568,320],[320,568]])test('button visual center and stick ownership survive layout '+viewport.join('x'),()=>{
 const els=Object.fromEntries(ids.map(id=>[id,{style:{transform:'old-translation'}}]));let draw=0;
 const boxes=Object.fromEntries(ids.map((id,i)=>[id,{x:viewport[0]*(.4+i*.04),y:viewport[1]*.7,d:46+i*3}]));
 const owner={root:{},els,_stick:{active:false},_safe:()=>({l:0,r:0,t:0,b:0}),_box:id=>boxes[id],_drawStick:()=>draw++};run.call(owner);
 for(const id of ids){const s=els[id].style,b=boxes[id];assert.equal(s.width,s.height);
  if(id==='stick'){assert.equal(s.left,undefined);assert.match(s.transform,/^translate3d\(/);assert.equal(owner._stickHome,b);continue;}
  assert.equal(s.transform,'none');assert(Math.abs(parseFloat(s.left)+parseFloat(s.width)/2-b.x)<=.1);assert(Math.abs(parseFloat(s.top)+parseFloat(s.height)/2-b.y)<=.1);
  // Actual animated CSS and transform origin are checked by the browser gate.
 }
 assert.equal(draw,1);
});
test('input hit routing and pressed animation are not changed to hide the mismatch',()=>{
 const extract=s=>s.match(/  _hitButton\(x, y\) \{[\s\S]*?\n  \}/)[0];assert.equal(extract(code),extract(raw));
 const css=fs.readFileSync(path.join(upstream,'styles/mobile.css'),'utf8');assert.match(css,/\.iwm-b\.is-down[^}]*scale: \.92; transition: scale 40ms/s);
});
test('upstream position drift fails the build anchor instead of silently restoring translated scaling',()=>{
 assert.throws(()=>adaptTouchLayout('src/core/mobile.js',raw.replace('el.style.transform = `translate3d(${(b.x - b.d / 2)', 'el.style.transform = `translate3d(${(b.x - b.d * .5)')),/pressed button center/);
});

}

// Load the emitted module graph without source adapters, including its installed
// prototype wrappers. Only DOM display surfaces are fixtures. The subprocess
// enables Node's VM modules without changing the existing workflow command.
async function verifyBuilt() {
  const {default:fs}=await import('node:fs'), {default:path}=await import('node:path');
  const {default:vm}=await import('node:vm'), {default:assert}=await import('node:assert/strict');
  const {createHash}=await import('node:crypto');
  const root=path.resolve(process.env.INKWAVE_BUILT_SITE);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'inkwave-build.json'),'utf8'));
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash,'artifact identity');
  assert.equal(hash(JSON.stringify(manifest.files)),manifest.inputHash,'input identity');
  console.log(JSON.stringify({builtRoot:root,contentHash:manifest.contentHash,inputHash:manifest.inputHash}));
  const context=vm.createContext({console,URL,URLSearchParams,performance,AbortController,setTimeout,clearTimeout,
    navigator:{userAgent:'layout ownership fixture',maxTouchPoints:0},
    screen:{width:1024,height:768,orientation:{angle:0}},innerWidth:1024,innerHeight:768,
    localStorage:{getItem:()=>null},window:{addEventListener(){}},
    document:{documentElement:{classList:{add(){},remove(){},toggle(){},contains(){return false;}}}}});
  const modules=new Map();
  function load(file) {
    if(modules.has(file))return modules.get(file);
    const rel=path.relative(root,file);assert(!rel.startsWith('..')&&!path.isAbsolute(rel),'built-only module graph');
    const bytes=fs.readFileSync(file);assert.equal(hash(bytes),manifest.artifacts[rel],rel+' emitted identity');
    const mod=new vm.SourceTextModule(bytes.toString(),{context,identifier:file});modules.set(file,mod);return mod;
  }
  const entry=load(path.join(root,'src/core/mobile.js'));
  await entry.link((spec,from)=>load(spec==='three'?path.join(root,'vendor/three/build/three.module.js'):
    spec.startsWith('three/addons/')?path.join(root,'vendor/three/jsm',spec.slice(13)):path.resolve(path.dirname(from.identifier),spec)));
  await entry.evaluate();
  const {MobileInput,CONTROLS}=entry.namespace;
  assert.equal(typeof MobileInput.prototype._layoutAll,'function');
  const ids=Object.keys(CONTROLS);assert(ids.includes('stick')&&ids.includes('fire')&&ids.includes('jump'));
  for(const [width,height] of [[1024,768],[844,390],[568,320],[320,568]]) {
    context.innerWidth=width;context.innerHeight=height;context.screen.width=width;context.screen.height=height;
    const els=Object.fromEntries(ids.map(id=>[id,{style:{transform:'old-translation'}}]));let draw=0;
    const boxes=Object.fromEntries(ids.map((id,i)=>[id,{x:width*(.4+i*.04),y:height*.7,d:46+i*3}]));
    const owner=Object.assign(Object.create(MobileInput.prototype),{root:{},els,_stick:{active:false},
      _safe:()=>({l:0,r:0,t:0,b:0}),_box:id=>boxes[id],_drawStick:()=>draw++});
    owner._layoutAll();
    for(const id of ids) {
      const s=els[id].style,b=boxes[id];assert.equal(s.width,s.height);
      if(id==='stick'){assert.equal(s.left,undefined);assert.match(s.transform,/^translate3d\(/);assert.equal(owner._stickHome,b);continue;}
      assert.equal(s.transform,'none',id+' cannot scale a layout translation');
      assert(Math.abs(parseFloat(s.left)+parseFloat(s.width)/2-b.x)<=.1,id+' x center');
      assert(Math.abs(parseFloat(s.top)+parseFloat(s.height)/2-b.y)<=.1,id+' y center');
    }
    assert.equal(draw,1);owner._stick.active=true;owner._layoutAll();assert.equal(draw,1,'active stick is not recentered');
  }
}
