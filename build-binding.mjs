import assert from 'node:assert/strict';
export const REGISTRY='patches/splatoon3/runtime/weapon-models/registry.mjs';
export const REQUIRED=[REGISTRY,'src/core/ctx.js','src/game/weapons.js','src/world/environment.js','patches/splatoon3/runtime/install.mjs','patches/splatoon3/runtime/main-weapon-catalog.mjs','patches/splatoon3/profile.json','vendor/three/build/three.module.js','patches/splatoon3/runtime/ranked/world.mjs','patches/splatoon3/runtime/ranked/clams.mjs','patches/splatoon3/runtime/ranked/small-clam-model.mjs','patches/splatoon3/runtime/ranked/power-clam-model.mjs','patches/splatoon3/runtime/ranked/rainmaker-model.mjs'];
export const THREE_CORE='vendor/three/build/three.core.js';
export const THREE_MODULE='vendor/three/build/three.module.js';
export function requiredArtifacts(manifest){return Object.hasOwn(manifest.artifacts,THREE_CORE)?[...REQUIRED,THREE_CORE]:REQUIRED;}
export function inputPath(key){
 const roots={upstream:'inkwave-public',patch:'patches/splatoon3','build-script':'scripts','touch-layout':'patches/touch-layout',reliability:'patches/reliability','local-quality':'patches/local-quality','network-replication':'patches/network-replication','practice-range':'patches/practice-range','loading-cache':'patches/loading-cache','native-stages':'patches/native-stages'};
 const [prefix,...parts]=key.split('/');assert.ok(roots[prefix]&&parts.length&&parts.every(p=>p&&p!=='.'&&p!=='..'),'Unknown/unsafe build input '+key);return roots[prefix]+'/'+parts.join('/');
}
export const REQUIRED_MODEL_INPUTS = {
 'patches/native-stages/adapter.mjs': 'native-stages/adapter.mjs',
 'patches/splatoon3/runtime/ranked/clams.mjs': 'patch/runtime/ranked/clams.mjs',
 'patches/splatoon3/runtime/ranked/install.mjs': 'patch/runtime/ranked/install.mjs',
 'patches/splatoon3/runtime/ranked/power-clam-model.mjs': 'patch/runtime/ranked/power-clam-model.mjs',
 'patches/splatoon3/runtime/ranked/rainmaker-model.mjs': 'patch/runtime/ranked/rainmaker-model.mjs',
 'patches/splatoon3/runtime/ranked/rainmaker.mjs': 'patch/runtime/ranked/rainmaker.mjs',
 'patches/splatoon3/runtime/ranked/small-clam-model.mjs': 'patch/runtime/ranked/small-clam-model.mjs',
 'patches/splatoon3/runtime/ranked/world.mjs': 'patch/runtime/ranked/world.mjs'
};
export function validateRequiredModelInputs(manifest,plan){
 for(const [path,key] of Object.entries(REQUIRED_MODEL_INPUTS)){
  const row=plan.payload.find(f=>f.path===path);assert.ok(row,'Required model source pin '+path);
  assert.equal(manifest.files[key],row.sha256,'Required model input '+path);
 }
}
export function validateBuildBinding(manifest,plan,readSource,readSite,hash){
 assert.match(manifest.build.revision,/^[a-f0-9]{64}$/,'content-derived revision');
 assert.equal(hash(JSON.stringify(manifest.files)),manifest.inputHash);
 assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
 assert.equal(manifest.build.script,hash(readSource('scripts/build-inkwave.mjs')),'builder identity');
 assert.ok(Object.keys(manifest.files).length>0);
 for(const [key,digest] of Object.entries(manifest.files))assert.equal(hash(readSource(inputPath(key))),digest,'Exact checkout input '+key);
 validateRequiredModelInputs(manifest,plan);

 for(const file of [THREE_MODULE,THREE_CORE])assert.match(manifest.files['upstream/'+file]||'',/^[a-f0-9]{64}$/,'Required Three source '+file);
 if(readSite(THREE_MODULE).toString().includes('three.core.js'))assert.ok(Object.hasOwn(manifest.artifacts,THREE_CORE),'Referenced Three core artifact required');
 const prefix='_versions/'+manifest.build.revision+'/';
 for(const file of requiredArtifacts(manifest)){assert.match(manifest.artifacts[file]||'',/^[a-f0-9]{64}$/,'required runtime '+file);assert.equal(manifest.artifacts[prefix+file],manifest.artifacts[file],'versioned runtime '+file);}
 for(const [file,digest] of Object.entries(manifest.artifacts)){assert.ok(!file.startsWith('/')&&file.split('/').every(p=>p&&p!=='.'&&p!=='..'));assert.equal(hash(readSite(file)),digest,file);}
 return {revision:manifest.build.revision,inputCount:Object.keys(manifest.files).length,registrySHA256:manifest.artifacts[REGISTRY],required:requiredArtifacts(manifest)};
}
export function validateDelivered(delivered,manifest){for(const file of requiredArtifacts(manifest))assert.equal(delivered[file],manifest.artifacts[file],'Required actual delivery '+file);}
