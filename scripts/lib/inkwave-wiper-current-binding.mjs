import assert from 'node:assert/strict';
export const WIPER_SOURCE='c0938a3f84768474df91713f7b372f9d7f8fe96a';
export const WIPER_TREE='97b9938391f156dc332f6a56ac6fe3d21d9f9dc7';
export const WIPER_BASELINE='7581ca9be8cf87d253918b8abb3b8ebe728c2093';
export const WIPER_MODULES={
 's3-projectile-shapes.mjs':{candidate:'0229bd0cb4b7a883568ee37a2a1097e07ee3cc7ed094a0765b626c7147987ac4',baseline:'41b605f45b6d99eb4abd332f4fb2fb0ac219e9e588be390b1dd4a965f1c0af02'},
 's3-ink-sheets.mjs':{candidate:'5730d0889efebc16b2e266c3875b41775d0ec2094e28788500bfd8507cfc0163',baseline:'b76941d8f2b425e9a7110efd377fcb879024a80aa074adc477d3d0a0bc6a69cb'}
};
export function assertWiperCurrentBinding(manifest,binding){
 assert.equal(binding.schema,1);assert.equal(binding.candidate,WIPER_SOURCE);assert.equal(binding.sourceTree,WIPER_TREE);assert.equal(binding.baseline,WIPER_BASELINE);
 for(const key of ['contentHash','inputHash']){assert.match(manifest[key],/^[a-f0-9]{64}$/);assert.equal(binding[key],manifest[key]);}
 assert.equal(binding.revision,manifest.build.revision);assert.equal(binding.compiler,manifest.build.esbuild);assert.equal(binding.compiler,'0.28.2');assert.equal(manifest.build.optimization,'esbuild-minify');
 assert.deepEqual(binding.modules.map(m=>m.name).sort(),Object.keys(WIPER_MODULES).sort());
 for(const m of binding.modules){assert.equal(m.rel,'patches/splatoon3/runtime/'+m.name);assert.equal(m.candidateSourceSha256,WIPER_MODULES[m.name].candidate);assert.equal(m.baselineSourceSha256,WIPER_MODULES[m.name].baseline);for(const key of ['candidateEmittedSha256','baselineEmittedSha256'])assert.match(m[key],/^[a-f0-9]{64}$/);assert.equal(manifest.artifacts['_versions/'+binding.revision+'/'+m.rel],m.candidateEmittedSha256);}
 return binding;
}
