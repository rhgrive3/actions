import {gunzipSync} from 'node:zlib';
import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{createHash}from'node:crypto';
import{fixture,sourceFiles}from'./native-fixture.mjs';import{observePostprocessIdentityOwners as observe}from'./postprocess-owners.mjs';import{semanticSnapshot,compareSemanticSnapshots,inventoryUUIDs}from'./semantic-identity.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const raw=JSON.parse(gunzipSync(Buffer.from(fs.readFileSync(new URL('./historical-A1-snapshot.json.gz.base64',import.meta.url),'utf8'),'base64')));
function snapshot(f=fixture()){
 // Explicit hybrid test: saved unrelated scene schema + new CPU native-owner fixture output.
 // Never write this into the original receipt or claim historical native owner observation.
 const s=structuredClone(raw),p=s.entryObservation.postprocess,z=observe(f.g,sha);p.identityOwners=z;
 for(const m of z.materials)p.passes[m.ordinal].material.uuid=m.uuid;
 for(const b of z.bindings){const mat=['grade','screen','output'].includes(b.owner)?p.passes[['grade','screen','output'].indexOf(b.owner)+3].material:p.ao[b.owner];const t=z.textures.find(x=>x.role===b.role);mat.uniforms[b.sampler]={type:'texture',uuid:t.uuid,version:t.version,sourceVersion:t.sourceVersion};}
 return s;
}
function rename(s){const x=structuredClone(s),ids=new Map();let i=900000;for(const ref of inventoryUUIDs(x)){if(!ids.has(ref.uuid))ids.set(ref.uuid,`00000000-0000-4000-8000-${(++i).toString(16).padStart(12,'0')}`);let at=x;for(const k of ref.path.slice(0,-1))at=at[k];at[ref.path.at(-1)]=ids.get(ref.uuid);}return x;}
test('original captured snapshot remains incomplete, with all original unknown references',()=>{const x=semanticSnapshot(raw);assert.equal(x.complete,false);assert.equal(x.unknown.length,12);});
test('actual native constructors → observer → actual saved snapshot schema → mapper',()=>{const s=snapshot(),x=semanticSnapshot(s);assert.equal(x.complete,true);assert.equal(x.definitions.length,232);const c=compareSemanticSnapshots(s,rename(s));assert.equal(c.semanticEqual,true,c.error);assert.equal(c.rawIdsEqual,false);assert.equal(c.rawEqual,false);});
test('observation is read-only and never renders or populates renderer caches',()=>{const {g}=fixture();g.R.renderer.render=()=>assert.fail('render called');g.R.renderer.properties={get:()=>assert.fail('cache get')};const before=observe(g,sha),after=observe(g,sha);assert.deepEqual(after,before);assert.equal(g.R.composer.readBuffer,g.R.composer.renderTarget2);});
const nativeNegatives={
 'foreign grade owner':f=>{f.g.R.grade={};},
 'foreign screen owner':f=>{f.g.screenfx.pass={};},
 'foreign output owner':f=>{f.g.R.composer.passes[5]={...f.g.R.composer.passes[5],isOutputPass:false};},
 'material alias merging':f=>{const p=f.g.R.composer.passes;p[5].material=p[3].material;},
 'uniform owner replacement':f=>{f.g.R.grade.uniforms={...f.g.R.grade.uniforms};},
 'quad owner replacement':f=>{f.g.R.grade._fsQuad.material=f.g.screenfx.mat;},
 'ping-pong target merge':f=>{f.g.R.composer.renderTarget2=f.g.R.composer.renderTarget1;},
 'foreign ping-pong read target':f=>{f.g.R.composer.readBuffer=f.g.screenfx.lens.rt;},
 'foreign sampler':f=>{f.g.R.grade.uniforms.tDiffuse.value=f.g.screenfx.lens.rt.texture;},
 'split sampler alias':f=>{f.g.R.grade.uniforms.tDiffuse.value=f.g.R.composer.renderTarget1.texture.clone();},
 'foreign lens target':f=>{f.g.screenfx.lens.rt=f.g.R.composer.renderTarget1;},
 'foreign AO depth target':f=>{f.g.R.gtao.depthTexture=new f.THREE.DepthTexture();},
 'foreign AO normal sampler':f=>{f.g.R.gtao.gtaoMaterial.uniforms.tNormal.value=f.g.R.composer.renderTarget1.texture;},
 'foreign PD input':f=>{f.g.R.gtao.pdMaterial.uniforms.tDiffuse.value=f.g.R.gtao.normalTexture;},
 'wrong texture backing owner':f=>{f.g.R.composer.renderTarget1.texture.renderTarget=f.g.R.composer.renderTarget2;},
 'wrong texture source owner':f=>{f.g.R.composer.renderTarget1.texture.source.data={};},
 'nonfinite material version':f=>{f.g.R.grade.material.version=NaN;},
 'missing texture version':f=>{delete f.g.R.composer.renderTarget1.texture.version;},
 'invalid sample count':f=>{f.g.R.composer.renderTarget1.samples=NaN;},
 'oversized shader':f=>{f.g.R.grade.material.fragmentShader='x'.repeat(65537);}
};
for(const[name,mutate]of Object.entries(nativeNegatives))test(name,()=>{const f=fixture();mutate(f);assert.throws(()=>observe(f.g,sha),/Postprocess owner/);});
const receiptNegatives={
 'binding split':s=>{s.entryObservation.postprocess.passes[3].material.uniforms.tDiffuse.uuid='00000000-0000-4000-8000-111111111111';},
 'two owner aliases merged':s=>{const t=s.entryObservation.postprocess.identityOwners.textures;t[1].uuid=t[0].uuid;},
 'source aliases merged':s=>{const t=s.entryObservation.postprocess.identityOwners.textures;t[1].sourceUuid=t[0].sourceUuid;},
 'role swap':s=>{const t=s.entryObservation.postprocess.identityOwners.textures;[t[0],t[1]]=[t[1],t[0]];},
 'geometry bytes changed':s=>{s.entryObservation.geometries[0].contentSha256='0'.repeat(64);},
 'uniform changed':s=>{s.entryObservation.postprocess.passes[3].material.uniforms.uExposure=123;},
 'noise content changed':s=>{s.entryObservation.postprocess.ao.gtaoNoise.sha256='0'.repeat(64);},
 'shader content changed':s=>{s.entryObservation.postprocess.identityOwners.materials[0].fragment.sha256='0'.repeat(64);},
 'unknown reference':s=>{s.entryObservation.postprocess.uninventoried='00000000-0000-4000-8000-333333333333';},
 'collapsed diffuse roles':s=>{const p=s.entryObservation.postprocess,t=p.identityOwners.textures[0];p.passes[4].material.uniforms.tDiffuse.uuid=t.uuid;p.identityOwners.bindings[1].role='composer1';p.identityOwners.bindings[1].uuid=t.uuid;},
 'changed attachment dimensions':s=>{const t=s.entryObservation.postprocess.identityOwners.textures[0];t.width++;t.rtWidth++;},
 'GPU proof fabricated':s=>{s.entryObservation.postprocess.identityOwners.gpuContentMeasured=true;}
};
for(const[name,mutate]of Object.entries(receiptNegatives))test(name,()=>{const a=snapshot(),b=rename(a);mutate(b);assert.equal(compareSemanticSnapshots(a,b).semanticEqual,false);});

const commonRoot=process.env.INKWAVE_MATERIAL_COMMON_SOURCE;
const contract=JSON.parse(fs.readFileSync(new URL('./source-contract.json',import.meta.url))),official=JSON.parse(fs.readFileSync(new URL('./common-tree-blobs.json',import.meta.url)));
function verifyContract(c,loaded=sourceFiles,tree=official){
 assert.equal(c.commit,'c0938a3f84768474df91713f7b372f9d7f8fe96a');assert.equal(c.tree,'97b9938391f156dc332f6a56ac6fe3d21d9f9dc7');assert.equal(tree.commit,c.commit);assert.equal(tree.tree,c.tree);
 assert.equal(c.files.length,17);assert.equal(new Set(loaded).size,loaded.length);assert.deepEqual([...loaded].sort(),c.files.map(f=>commonRoot+'/'+f.path).sort(),'actual imported/extracted source closure');
 const blobs=new Map(tree.blobs.map(x=>[x.path,x.sha]));assert.equal(blobs.size,tree.blobs.length,'duplicate official blob path');
 for(const f of c.files){assert.equal(f.blob,blobs.get(f.path),'official COMMON blob binding');const b=fs.readFileSync(commonRoot+'/'+f.path);assert.equal(sha(b),f.sha256);assert.equal(createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex'),f.blob);}
}
test('17 actual loaded source bodies and complete closure bind to official COMMON tree',()=>verifyContract(contract));
test('additional uncontracted source import rejects',()=>assert.throws(()=>verifyContract(contract,[...sourceFiles,commonRoot+'/unexpected.mjs']),/source closure/));
test('removed constructor import rejects',()=>assert.throws(()=>verifyContract(contract,sourceFiles.slice(1)),/source closure/));
test('contract blob changed away from official tree rejects',()=>{const c=structuredClone(contract);c.files[0].blob='0'.repeat(40);assert.throws(()=>verifyContract(c),/official COMMON blob/);});
test('duplicated official source path rejects before canonicalization',()=>{const t=structuredClone(official);t.blobs.push({...t.blobs[0]});assert.throws(()=>verifyContract(contract,sourceFiles,t),/duplicate official blob/);});
