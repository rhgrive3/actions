import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const built=process.env.INKWAVE_BUILT_SITE;
if(Object.hasOwn(process.env,'INKWAVE_BUILT_SITE')){
 assert.ok(built?.trim(),'INKWAVE_BUILT_SITE must name an emitted site, not fall back to source');
 const identity=JSON.parse(fs.readFileSync(path.join(built,'inkwave-build.json'),'utf8'));
 assert.match(identity.contentHash,/^[a-f0-9]{64}$/,'emitted site needs its build identity');
}
const audioRoot=built?pathToFileURL(path.resolve(built,'patches/splatoon3/runtime/audio')+path.sep):new URL('../runtime/audio/',import.meta.url);
const { COMBAT_AUDIO }=await import(new URL('combat-recipes.mjs',audioRoot));
const { WeaponSoundBank }=await import(new URL('bank.mjs',audioRoot));

// SHA-pinned existing source blobs, not guessed generated PCM. Their precise
// original SLINK conditions are unknown; playback is opt-in until verified.
const originals=[
 ['combat:ink_focus_normal','HitEf_InkHit_Focused_Normal_00.mp3','96b1786ae01eacd7f7f639d5123c070cefb5d44b6c2d74a955b726f90d339bd3',6381],
 ['combat:ink_focus_strong','HitEf_InkHit_Focused_Strong_00.mp3','bc0a85a307d0379d41bed9845caedaef44b7a3d3385db822ee2f39682a0bfb46',10413],
 ['combat:splat_squid','Pl_DeadBubbleSplash_00.mp3','8963d67e781c415a6247e0b7725e0c8f891dd313d4a98cceadadde566797e40c',33271],
];
const manifest=JSON.parse(fs.readFileSync(new URL('real-s3-installed.json',audioRoot),'utf8'));
const source=JSON.parse(fs.readFileSync(new URL('real-s3-samples.json',audioRoot),'utf8'));

test('3 additional original 2022 sound binaries are IN THE REPO with pinned exact SHA and byte count',()=>{
 for(const [id,file,sha,length] of originals){
   const bytes=fs.readFileSync(new URL('s3-real/'+file,audioRoot));
   assert.equal(bytes.length,length,id+' actual shipped bytes');
   assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),sha,id+' unmodified source blob');
   assert.equal(COMBAT_AUDIO[id]?.events[0],'fire',id+' can be requested through real-only bank');
   const a=manifest.clips.filter(c=>c.id===id&&c.event==='fire');
   assert.equal(a.length,1,id+' published-source manifest');
   assert.equal(a[0].file,'s3-real/'+file);
   assert.equal(a[0].sha256,sha);
   assert.equal(source.clips.filter(c=>c.id===id).length,1,'matching auditable source manifest');
 }
 assert.equal(manifest.clips.length,420,'source-only supplemental MP3s are registered without changing original source metadata');
 assert.equal(source.clips.length,274);
});

test('the extra source events never fall back to generated one-shot audio',()=>{
 const bank=new WeaponSoundBank({sampleRate:48000},{realOnly:true,audibleShotFallback:true});
 for(const [id] of originals){
   assert.equal(bank.has(id,'fire'),true);
   assert.equal(bank.name(id,'fire'),`main:${id}:fire`);
   assert.equal(bank.resolve(`main:${id}:fire`),null,'no source resident yet: no synthesized substitute');
   assert.throws(()=>bank.get(id,'fire'),{name:'Error',message:'Recorded-only cue cannot generate PCM: '+id+'/fire'});
   assert.equal(bank.cache.size,0,'a refused source cue cannot allocate authored PCM');
   assert.equal(bank.bytes,0,'a refused source cue cannot retain authored PCM bytes');
 }
 bank.dispose();
});
