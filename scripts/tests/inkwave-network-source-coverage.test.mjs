import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {networkIdentity,NETWORK_ROOT} from '../../patches/network-replication/adapter.mjs';
import {BUILD_ONLY_PATCH_MODULES} from '../lib/inkwave-build-only-modules.mjs';
import {assertNetworkArtifactSourceBinding} from '../lib/inkwave-network-source-coverage.mjs';
const sha='a'.repeat(64),name='canonical-weapon-actions.mjs';
const make=()=>({artifacts:{['patches/network-replication/'+name]:sha},files:{['network-replication/'+name]:sha},build:{network:{[name]:sha}}});
test('actual copied top-level network modules all have a source identity',()=>{
 const network=networkIdentity(),artifacts={};
 // This is a source-only regression for current builder exclusions. The build
 // guard itself inspects the resulting artifacts, including nested paths.
 for(const ent of fs.readdirSync(NETWORK_ROOT,{withFileTypes:true})){
  const rel=ent.name;if(!ent.isFile()||!rel.endsWith('.mjs')||rel==='adapter.mjs'||rel.endsWith('-adapter.mjs')||BUILD_ONLY_PATCH_MODULES.has('patches/network-replication/'+rel))continue;
  artifacts['patches/network-replication/'+rel]=sha;
 }
 const files=Object.fromEntries(Object.entries(network).map(([k,v])=>['network-replication/'+k,v]));
 assert.ok(assertNetworkArtifactSourceBinding({artifacts,files,build:{network}})>0);
});
test('source coverage rejects omitted, malformed, changed and newly copied leaves',()=>{
 let m=make();assert.equal(assertNetworkArtifactSourceBinding(m),1);
 delete m.files['network-replication/'+name];assert.throws(()=>assertNetworkArtifactSourceBinding(m),/lacks matching source identity/);
 m=make();m.files['network-replication/'+name]='invalid';assert.throws(()=>assertNetworkArtifactSourceBinding(m),/lacks matching source identity/);
 m=make();m.files['network-replication/'+name]='b'.repeat(64);assert.throws(()=>assertNetworkArtifactSourceBinding(m),/lacks matching source identity/);
 m=make();m.artifacts['patches/network-replication/new-unlisted.mjs']=sha;assert.throws(()=>assertNetworkArtifactSourceBinding(m),/new-unlisted/);
 m=make();m.artifacts['_versions/abc/patches/network-replication/nested/new.mjs']=sha;assert.throws(()=>assertNetworkArtifactSourceBinding(m),/nested\/new/);
 m=make();m.files['network-replication/adapter.mjs']=sha;m.build.network['adapter.mjs']=sha;assert.equal(assertNetworkArtifactSourceBinding(m),1);
 assert.throws(()=>assertNetworkArtifactSourceBinding({artifacts:{},files:{},build:{network:{}}}),/no emitted modules/);
});
