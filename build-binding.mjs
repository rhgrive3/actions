import assert from 'node:assert/strict';
export const REGISTRY='patches/splatoon3/runtime/weapon-models/registry.mjs';
export const REQUIRED=[REGISTRY,'src/world/environment.js','patches/splatoon3/runtime/install.mjs','patches/splatoon3/runtime/main-weapon-catalog.mjs','patches/splatoon3/profile.json','vendor/three/build/three.module.js'];
export function inputPath(key){
 const roots={upstream:'inkwave-public',patch:'patches/splatoon3','build-script':'scripts','touch-layout':'patches/touch-layout',reliability:'patches/reliability','local-quality':'patches/local-quality','network-replication':'patches/network-replication','practice-range':'patches/practice-range','loading-cache':'patches/loading-cache','native-stages':'patches/native-stages'};
 const [prefix,...parts]=key.split('/');assert.ok(roots[prefix]&&parts.length&&parts.every(p=>p&&p!=='.'&&p!=='..'),'Unknown/unsafe build input '+key);return roots[prefix]+'/'+parts.join('/');
}
export function validateBuildBinding(manifest,plan,readSource,readSite,hash){
 assert.match(manifest.build.revision,/^[a-f0-9]{64}$/,'content-derived revision');
 assert.equal(hash(JSON.stringify(manifest.files)),manifest.inputHash);
 assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
 assert.equal(manifest.build.script,hash(readSource('scripts/build-inkwave.mjs')),'builder identity');
 assert.ok(Object.keys(manifest.files).length>0);
 for(const [key,digest] of Object.entries(manifest.files))assert.equal(hash(readSource(inputPath(key))),digest,'Exact checkout input '+key);
 for(const f of plan.payload){if(f.path.startsWith('patches/splatoon3/runtime/'))assert.equal(manifest.files['patch/'+f.path.slice('patches/splatoon3/'.length)],f.sha256,'Required model input '+f.path);}
 assert.match(plan.registrySHA256,/^[a-f0-9]{64}$/);
 assert.equal(manifest.artifacts[REGISTRY],plan.registrySHA256,'reviewed emitted registry');
 const prefix='_versions/'+manifest.build.revision+'/';
 for(const file of REQUIRED){assert.match(manifest.artifacts[file]||'',/^[a-f0-9]{64}$/,'required runtime '+file);assert.equal(manifest.artifacts[prefix+file],manifest.artifacts[file],'versioned runtime '+file);}
 for(const [file,digest] of Object.entries(manifest.artifacts)){assert.ok(!file.startsWith('/')&&file.split('/').every(p=>p&&p!=='.'&&p!=='..'));assert.equal(hash(readSite(file)),digest,file);}
 return {revision:manifest.build.revision,inputCount:Object.keys(manifest.files).length,registrySHA256:plan.registrySHA256,required:REQUIRED};
}
export function validateDelivered(delivered,manifest){for(const file of REQUIRED)assert.equal(delivered[file],manifest.artifacts[file],'Required actual delivery '+file);}
