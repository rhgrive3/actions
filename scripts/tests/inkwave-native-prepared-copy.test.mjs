import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {copyLocalNativeAssets,prepareNativeStageBuild,nativeStageIdentity,NATIVE_ROOT} from '../lib/inkwave-native-stages.mjs';
import {BASE_SOURCE_STAGES,SOURCE_COMMIT} from '../../patches/native-stages/runtime/source-catalog.mjs';

const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-copy-gate-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,'source'),build=path.join(root,'build'),definition=BASE_SOURCE_STAGES[0];
 fs.mkdirSync(source,{recursive:true});
 fs.writeFileSync(path.join(source,'catalog.json'),JSON.stringify({schema:1,sourceCommit:SOURCE_COMMIT,stages:[definition]}));
 const f={root,source,build,definition,stage:path.join(source,definition.id)};
 fs.mkdirSync(f.stage);
 f.files={'manifest.json':Buffer.from(JSON.stringify({schema:1,id:definition.id,objects:[]})),'nested/vertices.bin':Buffer.from([0,1,2,255])};
 f.integrity={};
 for(const [rel,bytes] of Object.entries(f.files)){
  const file=path.join(f.stage,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);
  f.integrity[rel]={bytes:bytes.length,sha256:hash(bytes)};
 }
 f.repin=()=>{f.raw=Buffer.from(JSON.stringify(f.integrity));fs.writeFileSync(path.join(f.stage,'integrity.json'),f.raw);f.prepared={root:source,config:{stages:[{id:definition.id,integritySha256:hash(f.raw)}]}};};
 f.repin();return f;
}
test('prepare seals inventory bytes and authenticated local copies preserve the complete file set',t=>{
 const f=fixture(t),prepared=prepareNativeStageBuild(f.source,{});
 assert.equal(prepared.config.stages[0].integritySha256,hash(f.raw));
 copyLocalNativeAssets(f.build,prepared);
 const output=path.join(f.build,'_native-reference-assets',f.definition.id);
 for(const [rel,bytes] of Object.entries({...f.files,'integrity.json':f.raw}))assert.deepEqual(fs.readFileSync(path.join(output,rel)),bytes);
 assert.deepEqual(fs.readdirSync(output).sort(),['integrity.json','manifest.json','nested']);
 assert.match(fs.readFileSync(path.join(f.build,'_native-reference-assets/LOCAL-ONLY.txt'),'utf8'),/Do not deploy/);
});
const corruptions={
 'stage symlink':f=>{fs.renameSync(f.stage,f.stage+'-real');fs.symlinkSync(f.stage+'-real',f.stage);},
 'inventory symlink':f=>{fs.renameSync(path.join(f.stage,'integrity.json'),path.join(f.root,'inventory.json'));fs.symlinkSync(path.join(f.root,'inventory.json'),path.join(f.stage,'integrity.json'));},
 'listed file symlink':f=>{fs.unlinkSync(path.join(f.stage,'manifest.json'));fs.symlinkSync('nested/vertices.bin',path.join(f.stage,'manifest.json'));},
 'nested directory symlink':f=>{fs.renameSync(path.join(f.stage,'nested'),path.join(f.root,'nested'));fs.symlinkSync(path.join(f.root,'nested'),path.join(f.stage,'nested'));},
 'missing file':f=>fs.unlinkSync(path.join(f.stage,'nested/vertices.bin')),
 'unlisted nested file':f=>fs.writeFileSync(path.join(f.stage,'nested/extra.bin'),'extra'),
 'missing manifest entry':f=>{delete f.integrity['manifest.json'];f.repin();},
 'wrong authenticated body size':f=>{f.integrity['nested/vertices.bin'].bytes++;f.repin();},
 'invalid entry digest':f=>{f.integrity['nested/vertices.bin'].sha256='invalid';f.repin();},
 'negative entry size':f=>{f.integrity['nested/vertices.bin'].bytes=-1;f.repin();},
 'fractional entry size':f=>{f.integrity['nested/vertices.bin'].bytes=1.5;f.repin();},
 'null entry':f=>{f.integrity['nested/vertices.bin']=null;f.repin();},
};
for(const rel of ['../escape.bin','/absolute.bin','nested\\escape.bin','nested//vertices.bin','nested/./vertices.bin','integrity.json']){
 corruptions['invalid inventory path '+rel]=f=>{f.integrity[rel]={bytes:0,sha256:hash('')};f.repin();};
}
for(const [kind,corrupt] of Object.entries(corruptions))test('prepare and copy both reject '+kind+' without publishing partial assets',t=>{
 const f=fixture(t);corrupt(f);
 assert.throws(()=>prepareNativeStageBuild(f.source,{}));
 assert.throws(()=>copyLocalNativeAssets(f.build,f.prepared));
 assert.equal(fs.existsSync(path.join(f.build,'_native-reference-assets')),false);
});
test('a later stage failure removes already copied authenticated stages',t=>{
 const f=fixture(t),second='second';fs.cpSync(f.stage,path.join(f.source,second),{recursive:true});
 f.prepared.config.stages.push({id:second,integritySha256:hash(f.raw)});
 fs.writeFileSync(path.join(f.source,second,'nested/vertices.bin'),'changed after admission');
 assert.throws(()=>copyLocalNativeAssets(f.build,f.prepared),/integrity mismatch/);
 assert.equal(fs.existsSync(path.join(f.build,'_native-reference-assets')),false);
});
test('a changed but internally valid inventory cannot replace the admitted inventory',t=>{
 const f=fixture(t),prepared=prepareNativeStageBuild(f.source,{});
 fs.writeFileSync(path.join(f.stage,'nested/vertices.bin'),'replacement');
 f.integrity['nested/vertices.bin']={bytes:11,sha256:hash('replacement')};f.repin();
 assert.throws(()=>copyLocalNativeAssets(f.build,prepared),/integrity manifest changed/);
 assert.equal(fs.existsSync(path.join(f.build,'_native-reference-assets')),false);
});
test('native source inventory JSON remains bound to exact source identity',()=>{
 const identity=nativeStageIdentity(),inventories=Object.keys(identity).filter(rel=>rel.includes('source-inventories/')&&rel.endsWith('.json'));
 assert.ok(inventories.length>0);
 for(const rel of inventories)assert.equal(identity[rel],hash(fs.readFileSync(path.join(NATIVE_ROOT,rel))));
});
