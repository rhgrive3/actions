// Diagnostic-only generated program extension. Canonical frame/paired files are never written.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {sha256,SEQUENCED_FRAME_SHA256} from './entry-driver.mjs';
export const OWNER_BODIES={
 'postprocess-owners.mjs':'e873d6c6c616ffe492b46db2c96ed53e3ad239bb2e7e27299aff2a04294e1e3e',
 'register-postprocess.mjs':'1e2d0184ac2b3c6fef7561816ab025b359aa5bdec73182b2221566e9a8d0e527',
 'semantic-identity.mjs':'c1584de11703191c93e69b8db8c596f757b4a1195667c7aaf4d9346bb3fe0650'
};
const readBodies=()=>Object.fromEntries(Object.keys(OWNER_BODIES).map(name=>[name,fs.readFileSync(new URL('./postprocess/'+name,import.meta.url),'utf8')]));
function checkedBodies(bodies){assert.deepEqual(Object.keys(bodies).sort(),Object.keys(OWNER_BODIES).sort());for(const[name,hash]of Object.entries(OWNER_BODIES))assert.equal(sha256(bodies[name]),hash,'reviewed postprocess helper body: '+name);return bodies;}
export function verifyPostprocessBodies(){checkedBodies(readBodies());}
function unique(body,needle,replacement){assert.equal(body.split(needle).length,2,'unique postprocess injection boundary');return body.replace(needle,replacement);}
export function preparePostprocessDiagnostic(prepared,paired,bodies=readBodies()){
 checkedBodies(bodies);assert.equal(sha256(prepared.program),prepared.provenance.generatedFrameSha256,'pre-owner actual frame body');
 let original=prepared.program;for(const item of prepared.provenance.imports)original=unique(original,'from '+JSON.stringify(item.url),"from '"+item.specifier+"'");
 assert.equal(sha256(original),SEQUENCED_FRAME_SHA256,'exact pre-owner sequenced frame');
 const observer=bodies['postprocess-owners.mjs'].replace('export function','function');
 const anchor=' const nativeResources=observeNativeIdentityResources({G,r,a,roots,materials:seenM},sha);';
 const insertion=observer+'\n postprocess.identityOwners=observePostprocessIdentityOwners(g,sha);\n'+anchor;
 const program=unique(prepared.program,anchor,insertion);
 const mapper=bodies['semantic-identity.mjs'],start=mapper.indexOf('export function semanticSnapshot('),end=mapper.indexOf('\nexport function compareSemanticSnapshots(',start);assert.ok(start>=0&&end>start);
 const replacement=mapper.slice(start,end).replace('export function','function');
 const old=replacement.replace(' const postprocessRules=registerPostprocessOwners(e,register);\n','').replace(' ...postprocessRules,\n','');
 assert.notEqual(old,replacement);const register=bodies['register-postprocess.mjs'].replace("import assert from 'node:assert/strict';\n",'').replace('export function','function');
 const pairedProgram=unique(paired,old,register+'\n'+replacement);
 const ownerProvenance={schema:1,diagnosticOnly:true,gpuContentMeasured:false,preOwnerFrameSha256:sha256(prepared.program),preOwnerPairedSha256:sha256(paired),helpers:Object.entries(OWNER_BODIES).map(([name,hash])=>({name,path:fileURLToPath(new URL('./postprocess/'+name,import.meta.url)),sha256:hash}))};
 return{prepared:{program,provenance:{...prepared.provenance,generatedFrameSha256:sha256(program),postprocessOwners:ownerProvenance}},pairedProgram};
}
