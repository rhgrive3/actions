import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
const adapterURL = new URL('../adapter.mjs', import.meta.url);
const source = fs.readFileSync(adapterURL, 'utf8');
const match = [...source.matchAll(/^export function networkIdentity\(\) \{([\s\S]*?)^\}/gm)];
assert.equal(match.length,1,'one actual identity producer');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
function identity(mutate = false) {
  const body=match[0][0].replace('export ','').replaceAll('import.meta.url','adapterURL');
  const io={readFileSync(url){const raw=fs.readFileSync(url);return mutate&&url.href.endsWith('/roller-presentation.mjs')?Buffer.concat([raw,Buffer.from('\n')]):raw}};
  return vm.runInNewContext(body+';networkIdentity()', {fs:io,crypto,URL,adapterURL:adapterURL.href});
}
test('native network identity includes exact emitted Roller dependency source',()=>{
  assert.ok(source.includes("from '../../patches/network-replication/roller-presentation.mjs'"),'real adapter inserts runtime import');
  const files=identity();
  assert.equal(files['roller-presentation.mjs'],hash(fs.readFileSync(new URL('../roller-presentation.mjs',import.meta.url))));
  assert.ok(!Object.keys(files).some(p=>p.includes('..')||p.includes('/tests/')));
});
test('one-byte Roller source change alters canonical inputHash without pretending to alter emitted bytes',()=>{
  const a=identity(),b=identity(true);
  const changed=Object.keys(a).filter(k=>a[k]!==b[k]);assert.deepEqual(changed,['roller-presentation.mjs']);
  const append=files=>Object.fromEntries(Object.entries(files).map(([p,h])=>['network-replication/'+p,h]));
  assert.notEqual(hash(JSON.stringify(append(a))),hash(JSON.stringify(append(b))));
  const build=fs.readFileSync(new URL('../../../scripts/build-inkwave.mjs',import.meta.url),'utf8');
  assert.ok(build.includes("for (const [file, hash] of Object.entries(identity.build.network)) identity.files['network-replication/' + file] = hash;"));
  assert.ok(build.includes('identity.inputHash = sha256(JSON.stringify(identity.files));'));
});
