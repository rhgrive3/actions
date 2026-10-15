import assert from'node:assert/strict';import crypto from'node:crypto';import path from'node:path';
export const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
export const pins={candidate:'b58d2bb33cc69862e4429e2ba074d0e036f240a441c9fec903541a51b44cbfdb',baseline:'45a1df47519f80f9053658ab45194f3f1fbf95e3ebe874f7244ba38c469334d2',fixture:'348b09e0eeb27f3f7ad3f48631d389b15d7de63b27e632d7fb8104f56f6f9db3',three:'9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea',threeCore:'9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6'};
const dependencies={ctx:['G'],paint:['PaintSystem'],nav:['NavGraph'],minimap:['Minimap'],swimWake:['SwimWake'],'native-load':['loadNativeData','loadNativeTextures'],'native-level':['NativeLevel'],'native-physics':['NativePhysics'],'native-render':['nativeDisplay','nativeInkGeometry','nativeInkMaterial'],'native-ink-chunks':['NativeInkMesh'],'source-menu':['sourceLoadingStatus']};
export function makeSite(inputs){
 for(const[k,v]of Object.entries(pins))assert.equal(sha256(inputs[k]),v,'Immutable '+k);
 const raw=new Map([['vendor/three.module.js',inputs.three],['vendor/three.core.js',inputs.threeCore],['fixture.mjs',inputs.fixture]]);
 for(const role of ['baseline','candidate']){
  const world=role+'/patches/native-stages/runtime/native-world.mjs';raw.set(world,inputs[role]);const seen=new Set();
  for(const match of inputs[role].toString().matchAll(/from\s*['"]([^'"]+)['"]/g)){
   const spec=match[1];if(spec==='three')continue;assert.ok(spec.startsWith('.'),'Only frozen relative imports');const key=path.posix.basename(spec).replace(/\.(mjs|js)$/,'');assert.ok(dependencies[key],'Unknown dependency '+key);seen.add(key);
   const target=path.posix.normalize(path.posix.join(path.posix.dirname(world),spec));assert.ok(target.startsWith(role+'/'));
   raw.set(target,Buffer.from(`const d=globalThis.__worldFixture.dependencies[${JSON.stringify(key)}];\n`+dependencies[key].map(name=>`export const ${name}=d.${name};`).join('\n')));
  }
  assert.deepEqual([...seen].sort(),Object.keys(dependencies).sort());
 }
 const manifest={scope:'Unmodified native-world coordinator; synthetic dependency adapters; actual pinned Three renderer and diagnostic fixture',artifacts:Object.fromEntries([...raw].sort(([a],[b])=>a.localeCompare(b)).map(([p,b])=>[p,{sha256:sha256(b),bytes:b.length}]))};const revision=sha256(Buffer.from(JSON.stringify(manifest))),prefix='/_versions/'+revision+'/';
 const resources=new Map([...raw].map(([p,b])=>[prefix+p,b]));resources.set('/',Buffer.from('<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><script type="importmap">'+JSON.stringify({imports:{three:prefix+'vendor/three.module.js'}})+'</script>'));resources.set('/manifest.json',Buffer.from(JSON.stringify({...manifest,revision,prefix})));return{resources,prefix,manifest:{...manifest,revision,prefix}};
}
export function resolveRequest(site,url){assert.equal(typeof url,'string');assert.ok(!/[?#%]/.test(url)&&!url.includes('..'),'Exact route only');assert.ok(site.resources.has(url),'Unknown resource');return site.resources.get(url);}
export function observePage(page,errors){page.on('pageerror',e=>errors.push({type:'pageerror',message:String(e.stack||e)}));page.on('console',m=>{if(m.type()==='error')errors.push({type:'console.error',message:m.text()});});page.on('requestfailed',r=>errors.push({type:'requestfailed',url:r.url(),error:r.failure()?.errorText||'failed'}));}
export function assertNoErrors(errors){assert.deepEqual(errors,[],'No page, console, or network errors');}
