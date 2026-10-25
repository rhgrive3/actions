#!/usr/bin/env node
// QA only: seal genuine, already audited numeric derivatives for the unchanged
// native-arena test. No textures, conversion, download, site build or publication.
import fs from 'node:fs';
import {assertTerrainReceipt} from './lib/inkwave-terrain-receipt.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {nativeStageCatalog,prepareNativeStageBuild} from './lib/inkwave-native-stages.mjs';
import {SOURCE_COMMIT,SOURCE_RECIPE} from '../patches/native-stages/runtime/source-catalog.mjs';
import {validateNativeGeometry} from '../patches/native-stages/tools/validate-geometry.mjs';
const [sourcesArg,derivedArg,auditArg,outArg]=process.argv.slice(2);
assert(sourcesArg&&derivedArg&&auditArg&&outArg,'Expected private source root, derived root, audit JSON, new private output root');
const privateRoot=fs.realpathSync('.codex-stage-sources');
const inside=p=>p.startsWith(privateRoot+path.sep);
const sources=fs.realpathSync(sourcesArg),derived=fs.realpathSync(derivedArg),out=path.resolve(outArg);
assert(inside(sources)&&inside(derived)&&inside(out),'All model data must remain inside private .codex-stage-sources');
assert(!fs.existsSync(out),'Refuse to overwrite an existing private fixture');
assert.equal(fs.realpathSync(path.dirname(out)),path.dirname(out),'Output parent must not redirect through symlinks');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const definition=nativeStageCatalog().stages.find(s=>s.id==='urchin');assert(definition);
const source=path.join(sources,'urchin'),input=path.join(derived,'urchin');
const objHash=crypto.createHash('sha256');
for await(const chunk of fs.createReadStream(path.join(source,definition.internal+'.obj')))objHash.update(chunk);
assert.equal(objHash.digest('hex'),definition.sourceSha256,'Original OBJ digest');
const tree=read(path.join(source,'tree.json'));assert.equal(tree.sha,definition.tree);assert.equal(tree.truncated,false);
const mtl=fs.readFileSync(path.join(source,definition.internal+'.mtl'));
const pins=tree.tree.filter(f=>f.type==='blob'&&f.path===definition.internal+'.mtl');assert.equal(pins.length,1);
assert.equal(mtl.length,pins[0].size);
assert.equal(crypto.createHash('sha1').update('blob '+mtl.length+'\0').update(mtl).digest('hex'),pins[0].sha,'Original MTL Git digest');
const audit=read(auditArg);assert.equal(audit.status,'passed');assert.equal(audit.sourceCommit,SOURCE_COMMIT);
const rows=audit.stages.filter(s=>s.id==='urchin');assert.equal(rows.length,1);const row=rows[0];assert.equal(row.sourceSha256,definition.sourceSha256);
const manifest=read(path.join(input,'manifest.json'));assert.equal(manifest.sourceCommit,SOURCE_COMMIT);assert.equal(manifest.sourceRecipe,SOURCE_RECIPE);assert.equal(manifest.sourceMode,'browser-direct');
for(const key of ['id','internal','sourceSha256','tree','bounds','spawnPads','sourceSemantics','sourceNavigation'])assert.deepEqual(manifest[key],definition[key],'Definition '+key);
const specs={vertices:[Float32Array,'vertices'],indices:[Uint32Array,'indices'],triangles:[Float32Array,'collision'],normals:[Float32Array,'normals'],flags:[Uint32Array,'flags'],objectIds:[Uint32Array,'objects'],nodes:[Float32Array,'bvh'],order:[Uint32Array,'order'],triangleFace:[Int32Array,'triangleFace'],mask:[Uint8Array,'mask']};
const data={manifest},integrity={},files=['manifest.json'];
for(const [key,[Type,name]] of Object.entries(specs)){
 const file=name+'.bin',bytes=fs.readFileSync(path.join(input,file));assert.equal(bytes.length%Type.BYTES_PER_ELEMENT,0);
 data[key]=new Type(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
 integrity[file]={bytes:bytes.length,sha256:hash(bytes)};files.push(file);
}
assert.equal(integrity['vertices.bin'].sha256,row.sourceGeometrySha256);
assert.equal(integrity['indices.bin'].sha256,row.sourceIndexSha256);
const bytes=fs.readFileSync(path.join(input,'manifest.json'));integrity['manifest.json']={bytes:bytes.length,sha256:hash(bytes)};
assertTerrainReceipt(integrity,row.derivedFiles);
const actual=validateNativeGeometry(data);for(const [key,value] of Object.entries(actual))assert.equal(value,row[key],'Audit count '+key);
// Private regular files satisfy the production prepared-asset contract. Copy
// only the audited numeric payload and verify the copy against that receipt.
fs.mkdirSync(path.join(out,'urchin'),{recursive:true});
for(const file of files){
 const target=path.join(out,'urchin',file);
 fs.copyFileSync(path.join(input,file),target,fs.constants.COPYFILE_EXCL);
 const copied=fs.readFileSync(target);
 assert.equal(copied.length,integrity[file].bytes,'Copied fixture size '+file);
 assert.equal(hash(copied),integrity[file].sha256,'Copied fixture digest '+file);
}
fs.writeFileSync(path.join(out,'urchin','integrity.json'),JSON.stringify(integrity));
fs.writeFileSync(path.join(out,'catalog.json'),JSON.stringify({schema:1,sourceCommit:SOURCE_COMMIT,physicsOnly:true,stages:[definition]}));
fs.writeFileSync(path.join(out,'PHYSICS-ONLY.txt'),'Private QA fixture. Genuine source-derived numeric geometry only. Textures are absent. Never build, bundle, render or publish this package.\n');
prepareNativeStageBuild(out); // Run existing definition/integrity/terrain guards.
console.log(JSON.stringify({schema:1,stage:'urchin',physicsOnly:true,sourceSha256:definition.sourceSha256,files:files.length,...actual}));
