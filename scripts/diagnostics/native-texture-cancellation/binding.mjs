import crypto from 'node:crypto';import assert from 'node:assert/strict';
export const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
export const pins={candidate:'7e885a80b111238d4b479c798a3195641da5415637f2e89f6eec1b3819f9b09b',baseline:'6b706ae30aafccda4abde8913f0d57f8518a92e0173cfaf3f1904d5b4965487b',cache:'8561727ceee23794958ca74e6861b5215de7651ac22594d688f6a1f6ee978bfc',three:'9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea',threeCore:'9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6'};
export function makeSite(inputs){
 for(const [name,expected]of Object.entries(pins))assert.equal(sha256(inputs[name]),expected,'Immutable '+name);
 const raw=new Map([['vendor/three.module.js',inputs.three],['vendor/three.core.js',inputs.threeCore]]);
 for(const role of ['baseline','candidate']){
  raw.set(role+'/native-load.mjs',inputs[role]);raw.set(role+'/source-cache.mjs',inputs.cache);
  raw.set(role+'/registry.mjs',Buffer.from('export const nativeStageURL=(_id,file)=>new URL("/synthetic/"+file,location.origin).href;'));
  raw.set(role+'/build-config.mjs',Buffer.from('export const nativeStageBuild={mode:"browser-direct"};'));
  raw.set(role+'/source-data.mjs',Buffer.from('export const loadBrowserSource=()=>{throw Error("Unexpected stage geometry request")};'));
 }
 const manifest={schema:1,scope:'Unmodified source modules with geometry/registry boundary adapters; synthetic real-browser resource lifetime only',artifacts:Object.fromEntries([...raw].sort(([a],[b])=>a.localeCompare(b)).map(([p,b])=>[p,{sha256:sha256(b),bytes:b.length}]))};
 const revision=sha256(Buffer.from(JSON.stringify(manifest))),prefix='/_versions/'+revision+'/';
 const resources=new Map([...raw].map(([p,b])=>[prefix+p,b]));
 const index=Buffer.from('<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><script type="importmap">'+JSON.stringify({imports:{three:prefix+'vendor/three.module.js'}})+'</script><title>Texture cancellation acceptance</title>');
 resources.set('/',index);resources.set('/manifest.json',Buffer.from(JSON.stringify({...manifest,revision,prefix})));
 return{resources,manifest:{...manifest,revision,prefix},prefix};
}
export function resolveRequest(site,url){assert.equal(typeof url,'string');assert.ok(!url.includes('?')&&!url.includes('#')&&!url.includes('%')&&!url.includes('..'),'Exact URL only');const b=site.resources.get(url);assert.ok(b,'Unknown resource');return b;}
