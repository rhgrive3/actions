import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

const base = new URL('../../../inkwave-public/assets/source-motion/', import.meta.url);
const hash = data => createHash('sha256').update(data).digest('hex');
const manifest = JSON.parse(readFileSync(new URL('manifest.json', base), 'utf8'));
const merged = names => Buffer.concat(names.map(name => {
  assert.match(name, /^[\w.-]+$/, 'safe immutable asset name');
  return readFileSync(new URL(name, base));
}));
const inflate = (names,digest,bytes) => {
  const compressed=merged(names);
  if(bytes!==undefined)assert.equal(compressed.length,bytes,'pack length');
  assert.equal(hash(compressed),digest,'compressed pack SHA-256');
  return gunzipSync(compressed);
};
const catalog=JSON.parse(inflate(manifest.catalog.parts,manifest.catalog.gzipSha256).toString('utf8'));

test('lossless Player00, Player01 and squid motion packs remain valid across GitHub commits', () => {
  assert.equal(manifest.schema,'inkwave-source-motion-gzip-parts-v1');
  assert.equal(catalog.format,'INKWAVE-BFRES-1');
  for(const [variant,count] of Object.entries({Player00:262,Player01:261,Player_Squid:25})){
    const m=manifest.variants[variant],meta=catalog.variants[variant];
    assert.equal(meta.clips.length,count,variant+' clips');
    const bytes=inflate(m.parts,m.gzipSha256,m.compressedBytes);
    assert.equal(bytes.length,meta.byteLength,variant+' uncompressed length');
    assert.equal(hash(bytes),meta.sha256,variant+' source coefficient SHA-256');
    const data=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4);
    for(const c of meta.clips){
      assert.ok(c.base>=0&&c.base+meta.bones.length*10<=data.length,c.name+' pose');
      assert.ok(c.curves>=0&&c.curves+c.curveCount*10<=data.length,c.name+' curves');
      for(let i=0;i<c.curveCount;i++){
        const o=c.curves+i*10,n=data[o+8],f=data[o+7],k=data[o+9],type=(data[o+1]>>4)&7,width=type===0?4:type===1?2:1;
        assert.ok(n>=1&&f>=0&&f+n<=data.length&&k>=0&&k+n*width<=data.length,c.name+' coefficients');
      }
    }
    if(variant!=='Player_Squid'){
      const clips=new Map(meta.clips.map(c=>[c.name,c]));
      assert.equal(clips.get('WalkHold_Nrml')?.frames,40);
      assert.equal(clips.get('RunHold_Nrml')?.frames,32);
      assert.ok(clips.has('WaitShoot_Nrml'));
    }
  }
});
