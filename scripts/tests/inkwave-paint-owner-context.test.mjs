import test from 'node:test';import assert from 'node:assert/strict';
import {MAIN_INK_BASELINE_MANIFEST as manifest,planMainInkBaseline} from '../lib/inkwave-main-ink-baseline.mjs';
const path='patches/network-replication/adapter.mjs';
const suffixes=[", 'ink-charger-a', 'ink-charger-b', 'ink-charger-c'",", 'ink-charger-a', 'ink-charger-b', 'ink-charger-c', 'ink-blast'",", 'ink-charger-a', 'ink-charger-b', 'ink-charger-c', 'ink-blast', 'ink-blast-rectified'"];
const h=manifest.files.find(r=>r.path===path).hunks.find(h=>h.id==='paint-1');
function maps(suffix){const before=new Map(),after=new Map();for(const r of manifest.files){before.set(r.path,r.mode==='file'?null:'BASELINE PHYSICS\n'+r.hunks.map(h=>h.before).join('\n'));after.set(r.path,r.mode==='file'?r.content:'CANDIDATE PHYSICS\n'+r.hunks.map(h=>h.after).join('\n'));}before.set(path,before.get(path).replace(h.before,h.before.replace(']);',suffix+']);')));after.set(path,after.get(path).replace(h.after,h.after.replace(']);',suffix+']);')));return{before,after};}
test('all three traced owner contexts preserve suffix bytes and all32 legacy paint hunks',()=>{assert.equal(manifest.files.flatMap(r=>r.hunks||[]).length,32);for(const suffix of suffixes){const{before,after}=maps(suffix);const plan=planMainInkBaseline(before,after);assert.equal(plan.sources.get(path),before.get(path).replace(h.before.replace(']);',suffix+']);'),h.after.replace(']);',suffix+']);')));}});
test('unknown duplicate missing and reordered owner suffixes fail rather than broad acceptance',()=>{for(const suffix of [suffixes[2]+", 'unknown'",suffixes[2]+", 'ink-blast'",", 'ink-charger-b', 'ink-charger-a', 'ink-charger-c'",", 'ink-charger-a', 'ink-charger-c'"]){const{before,after}=maps(suffix);assert.throws(()=>planMainInkBaseline(before,after));}});
test('owner context remains in non-paint digest and unrelated candidate bytes are not copied',()=>{let previous;for(const suffix of suffixes){const{before,after}=maps(suffix);const p=planMainInkBaseline(before,after);const row=p.evidence.paths.find(r=>r.path===path);assert.notEqual(row.nonPaintSha256,previous);previous=row.nonPaintSha256;assert.ok(p.sources.get(path).startsWith('BASELINE PHYSICS'));assert.ok(!p.sources.get(path).includes('CANDIDATE PHYSICS'));const aligned=planMainInkBaseline(p.sources,after);assert.equal(aligned.changes.length,0);assert.equal(aligned.evidence.paths.find(r=>r.path===path).nonPaintSha256,row.nonPaintSha256);}});
test('current complete paint/physics modules reject mutation, absent and legacy counterparts',async()=>{
 const fs=await import('node:fs');const actual=new Map(manifest.files.map(r=>[r.path,fs.readFileSync(new URL('../../'+r.path,import.meta.url),'utf8')]));
 assert.equal(planMainInkBaseline(actual,actual).changes.length,0);
 for(const path of ['patches/splatoon3/main-ink-footprint-adapter.mjs','patches/splatoon3/runtime/main-ink-footprints.mjs','patches/splatoon3/runtime/main-weapon-catalog.mjs','patches/splatoon3/runtime/weapons-fidelity.mjs']){
 for(const value of [null,actual.get(path)+'\n// changed',actual.get(path).replace(/const /,'let ')]){
 const bad=new Map(actual);bad.set(path,value);assert.throws(()=>planMainInkBaseline(bad,actual));assert.throws(()=>planMainInkBaseline(actual,bad));
 }
 }
});
