import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { COMBAT_AUDIO } from '../runtime/audio/combat-recipes.mjs';
import { WeaponSoundBank } from '../runtime/audio/bank.mjs';

// SHA-pinned existing source blobs, not guessed generated PCM. Their precise
// original SLINK conditions are unknown; playback is opt-in until verified.
const originals=[
 ['combat:ink_focus_normal','HitEf_InkHit_Focused_Normal_00.mp3','96b1786ae01eacd7f7f639d5123c070cefb5d44b6c2d74a955b726f90d339bd3',6381],
 ['combat:ink_focus_strong','HitEf_InkHit_Focused_Strong_00.mp3','bc0a85a307d0379d41bed9845caedaef44b7a3d3385db822ee2f39682a0bfb46',10413],
 ['combat:splat_squid','Pl_DeadBubbleSplash_00.mp3','8963d67e781c415a6247e0b7725e0c8f891dd313d4a98cceadadde566797e40c',33271],
];
const manifest=JSON.parse(fs.readFileSync(new URL('../runtime/audio/real-s3-installed.json',import.meta.url),'utf8'));
const source=JSON.parse(fs.readFileSync(new URL('../runtime/audio/real-s3-samples.json',import.meta.url),'utf8'));

test('3 additional original 2022 sound binaries are IN THE REPO with pinned exact SHA and byte count',()=>{
 for(const [id,file,sha,length] of originals){
   const bytes=fs.readFileSync(new URL('../runtime/audio/s3-real/'+file,import.meta.url));
   assert.equal(bytes.length,length,id+' actual shipped bytes');
   assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),sha,id+' unmodified source blob');
   assert.equal(COMBAT_AUDIO[id]?.events[0],'fire',id+' can be requested through real-only bank');
   const a=manifest.clips.filter(c=>c.id===id&&c.event==='fire');
   assert.equal(a.length,1,id+' published-source manifest');
   assert.equal(a[0].file,'s3-real/'+file);
   assert.equal(a[0].sha256,sha);
   assert.equal(source.clips.filter(c=>c.id===id).length,1,'matching auditable source manifest');
 }
 assert.equal(manifest.clips.length,274);
 assert.equal(source.clips.length,274);
});

test('the extra source events never fall back to generated one-shot audio',()=>{
 const bank=new WeaponSoundBank({sampleRate:48000},{realOnly:true,audibleShotFallback:true});
 for(const [id] of originals){
   assert.equal(bank.has(id,'fire'),true);
   assert.equal(bank.name(id,'fire'),`main:${id}:fire`);
   assert.equal(bank.resolve(`main:${id}:fire`),null,'no source resident yet: no synthesized substitute');
   assert.throws(()=>bank.get(id,'fire'),/Procedural/);
 }
 bank.dispose();
});
