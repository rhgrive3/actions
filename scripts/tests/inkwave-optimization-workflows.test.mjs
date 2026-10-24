import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const read=name=>fs.readFileSync(new URL('../../.github/workflows/'+name+'.yml',import.meta.url),'utf8');
function eventPaths(source,event){
 const text=new RegExp('^  '+event+':\\n([\\s\\S]*?)(?=^  [a-z_]+:|^[a-z_]+:)','m').exec(source)?.[1];
 assert.ok(text,'event exists: '+event);
 const inline=/paths: \[([^\n]+)\]/.exec(text);
 return inline?[...inline[1].matchAll(/'([^']+)'/g)].map(m=>m[1]):[...text.matchAll(/^      - ['"]([^'"]+)['"]/gm)].map(m=>m[1]);
}
const matches=(pattern,file)=>new RegExp('^'+pattern.split('**').map(p=>p.split('*').map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[^/]*')).join('.*')+'$').test(file);
const squid=['inkwave-public/src/game/character.js','inkwave-public/src/game/character-geo.js','inkwave-public/src/game/character-mats.js','inkwave-public/src/game/motion/squid-rig.js','scripts/build-inkwave.mjs','scripts/inkwave-source-composition.mjs','scripts/check-inkwave-startup-budget.mjs',...['performance-v2-geometry','performance-v2-topology','performance-v2-ao','pause-gpu'].map(n=>'patches/local-quality/tests/'+n+'.test.mjs')];
for(const [workflow,events,inputs,unrelated] of [
 ['inkwave-squid-visual-qa',['pull_request'],squid,'inkwave-public/src/world/unrelated.js'],
 ['zevant-account',['pull_request','push'],['patches/splatoon3/runtime/ranked/combat.mjs','inkwave-public/index.html','scripts/inkwave-source-composition.mjs','scripts/lib/inkwave-native-stages.mjs','scripts/check-inkwave-startup-budget.mjs','account/worker/index.js'],null],
 ['inkwave-relay-security',['pull_request','push'],['inkwave-public/src/net/session.js','inkwave-public/src/net/mock.js','patches/splatoon3/tests/source-fixture.mjs'],null],
 ['inkwave-character-asset-qa',['pull_request'],['inkwave-public/src/game/character.js','inkwave-public/src/game/character-mats.js','inkwave-public/vendor/three/build/three.module.js','inkwave-public/vendor/three/addons/loaders/GLTFLoader.js','scripts/build-inkwave.mjs','scripts/lib/inkwave-source-compaction.mjs','tools/character-asset-qa/test.mjs','inkwave-public/src/core/ctx.js','patches/splatoon3/runtime/install.mjs'],null],
 ['inkwave-explosher-flight-glitter', ['pull_request'], ['patches/splatoon3/tests/s3-projectile-shapes.test.mjs', 'scripts/tests/inkwave-projectile-character-reset.test.mjs', 'patches/splatoon3/tests/projectile-visuals.test.mjs'], null],
 ['validate-inkwave-native-stage5', ['pull_request'], ['patches/splatoon3/tests/scorch-gorge-stage.test.mjs', 'patches/splatoon3/tests/ranked-world.test.mjs', 'scripts/tests/inkwave-stage-assets.test.mjs'], null],
 ['validate-inkwave-audio-v11', ['pull_request'], ['patches/splatoon3/tests/real-s3-loader-v7.test.mjs', 'patches/local-quality/tests/ipad-audio-unlock.test.mjs'], null],
 ['inkwave-squid-heading-qa', ['pull_request'], ['patches/splatoon3/tests/source-loaded-actor-fixture.mjs'], null],
 ['inkwave-swim-entry-qa', ['pull_request'], ['patches/splatoon3/tests/source-loaded-actor-fixture.mjs'], null],
 ['inkwave-roller-support-source-pin', ['pull_request'], ['patches/splatoon3/runtime/roller.mjs', 'patches/splatoon3/runtime/roller-contact-paint.mjs', 'scripts/inkwave-source-composition.mjs', 'patches/splatoon3/tests/fixtures/roller.b34a8aaf.source.txt'], null],
 ['inkwave-object-presentation-qa', ['pull_request'], ['patches/splatoon3/tests/owner-report-2026-10-18.test.mjs', 'patches/splatoon3/tests/respawn-lifecycle.test.mjs', 'patches/splatoon3/tests/remote-respawn.test.mjs', 'patches/splatoon3/tests/issue-879-spawn-pose.test.mjs', 'patches/splatoon3/tests/ranked-clams.test.mjs', 'patches/splatoon3/tests/ranked-power-clam-model.test.mjs', 'patches/splatoon3/tests/bomb-motion.test.mjs'], null],
 ['inkwave-health-recovery-rain', ['pull_request'], ['patches/splatoon3/tests/storm-effects.test.mjs', 'patches/splatoon3/tests/storm-vertical-cutoff-735.test.mjs'], null],
 ['inkwave-lobby-slot-browser', ['pull_request'], ['scripts/tests/inkwave-lobby-slot-browser-fixture.test.mjs'], null],
 ['inkwave-terminal-recovery-qa', ['pull_request'], ['patches/reliability/tests/start.test.mjs', 'scripts/tests/inkwave-native-stage-publish-rollback.test.mjs'], null],
 ['inkwave-pause-gpu', ['pull_request'], ['patches/local-quality/idle-resources.mjs', 'patches/local-quality/tests/idle-resources.test.mjs', 'patches/local-quality/tests/idle-attract-budget.test.mjs', 'patches/local-quality/tests/idle-fixture.mjs'], null],
 ['inkwave-small-tank', ['pull_request'], ['patches/local-quality/tests/s3-hud-look.test.mjs'], null],
 ['inkwave-ink-volumes', ['pull_request'], ['scripts/build-inkwave.mjs', 'scripts/inkwave-source-composition.mjs'], null],
 ['inkwave-reopened-six', ['pull_request'], ['patches/loading-cache/tests/cargo-offline-precache.test.mjs', 'patches/loading-cache/adapter.mjs', 'inkwave-public/src/config.js'], null],
 ['validate-inkwave-update', ['pull_request', 'push'], ['tests/ink-flight/model.test.mjs', 'tests/platform-lifecycle/platform-smoke.test.mjs', 'scripts/lib/minimap-canvas-observation.test.mjs', 'scripts/lib/minimap-canvas-three-binding.test.mjs', 'scripts/fetch-inkwave-pinned-references.py', 'scripts/tests/test_fetch_inkwave_pinned_references.py'], null],
 ['inkwave-defense-selection', ['pull_request'], ['patches/splatoon3/tests/kit-defense.test.mjs', 'patches/splatoon3/tests/kit-big-bubbler-blaster-contact.test.mjs'], null],
 ['inkwave-ink-micro-surface', ['pull_request'], ['patches/local-quality/tests/grate-normal.test.mjs', 'patches/local-quality/tests/paint-hotpath.test.mjs'], null],
 ['inkwave-touch-frame-pacing', ['pull_request'], ['patches/loading-cache/tests/cargo-offline-precache.test.mjs'], null],
 ['inkwave-crab-gyro', ['pull_request'], ['patches/splatoon3/tests/special-projectile-paint-credit.test.mjs', 'patches/reliability/tests/input-ownership.test.mjs', 'patches/reliability/tests/stick-inversion-scope.test.mjs'], null],
 ['validate-inkwave-update', ['pull_request', 'push'], ['package.json'], null],
 ['pages-inkwave', ['push'], ['package.json'], null],
 ['validate-inkwave-update', ['push', 'pull_request'], ['scripts/check-weapons-reference.mjs', 'scripts/verify-completion-sources.mjs'], null],
 ['validate-inkwave-ranked', ['push', 'pull_request'], ['scripts/build-inkwave.mjs', 'scripts/inkwave-source-composition.mjs'], null],
 ['inkwave-specials-1130', ['pull_request'], ['patches/splatoon3/tests/all-specials.test.mjs', 'patches/splatoon3/tests/kit-ink-vac.test.mjs', 'patches/splatoon3/tests/kit-big-bubbler.test.mjs', 'patches/splatoon3/tests/storm-effects.test.mjs', 'patches/splatoon3/tests/support-kit-recon-cooler.test.mjs', 'patches/splatoon3/tests/issue-912-triple-slam-fists.test.mjs', 'patches/splatoon3/tests/inkjet-paint-wire.test.mjs'], null],
 ['inkwave-projectile-visuals', ['pull_request'], ['scripts/tests/inkwave-projectile-capture-ui.test.mjs', 'patches/splatoon3/tests/slosher-draw-size-1014.test.mjs', 'patches/splatoon3/tests/roller-draw-radius.test.mjs', 'tests/ink-flight/model.test.mjs', 'scripts/tests/inkwave-build-packaging.test.mjs'], null],
])test(workflow+' schedules dedicated QA for each directly consumed input',()=>{
 for(const event of events){const paths=eventPaths(read(workflow),event);
  for(const file of inputs)assert.ok(paths.some(p=>matches(p,file)),event+': '+file);
  for(const file of ['docs/example.md',...(unrelated?[unrelated]:[])])assert.ok(!paths.some(p=>matches(p,file)),event+': unrelated '+file);
 }
});
test('two browser jobs retain independent DPR invocations, artifact names and failing fan-in',()=>{
 const source=read('inkwave-small-tank');
 assert.match(source,/browser: \[chromium, webkit\]/);assert.doesNotMatch(source,/matrix\.dpr|dpr: \[/);
 for(const dpr of [1,2]){
  assert.match(source,new RegExp('id: dpr'+dpr));
  assert.ok(source.includes('--dpr '+dpr));
  assert.ok(source.includes('small-tank-browser-evidence-${{ matrix.browser }}-dpr'+dpr));
 }
 assert.ok(source.includes("steps.dpr1.outcome != 'skipped'"),'DPR2 does not require DPR1 success');
 const fanin=/run: (test "\$DPR1"[^\n]+)/.exec(source)?.[1];assert.ok(fanin);
 for(const [one,two] of [['success','success'],['failure','success'],['success','failure'],['failure','failure'],['success','skipped']]){
  const result=spawnSync('bash',['-c',fanin],{env:{...process.env,DPR1:one,DPR2:two}});
  assert.equal(result.status===0,one==='success'&&two==='success');
 }
});
test('pinned historical frame replay is manual, with both immutable refs preserved',()=>{
 const source=read('inkwave-material-native-frame');
 assert.match(source,/^  workflow_dispatch:/m);assert.doesNotMatch(source,/^  pull_request:/m);
 for(const sha of ['b9c46f57f8a5427eaa71dd740688622490b61bb8','429cc1352d9b13ffe83c579ed714b84acf6139ed'])assert.ok(source.includes('ref: '+sha));
 assert.ok(source.includes('--replay-diagnostic'));
});
test('Dynamo keeps one final always-run full evidence upload',()=>{
 const source=read('inkwave-dynamo-handle');assert.equal((source.match(/uses: actions\/upload-artifact@v4/g)||[]).length,1);
 assert.match(source,/uses: actions\/upload-artifact@v4\n        if: always\(\)/);
 assert.match(source,/path: \.dynamo-evidence\//);assert.match(source,/retention-days: 14/);
});

test('squid baseline remains an explicit second immutable shallow tree',()=>{
 const source=read('inkwave-squid-visual-qa');
 assert.doesNotMatch(source,/fetch-depth: 0/);assert.match(source,/fetch-depth: 1/);
 assert.ok(source.includes('git fetch --no-tags --depth=1 origin "$BASE_SHA"'));
 assert.ok(source.includes('git cat-file -e "$BASE_SHA^{commit}"'));
 assert.ok(source.includes('test "$(git -C _squid_baseline rev-parse HEAD)" = "$BASE_SHA"'));
 assert.ok(source.includes('BASE_SHA: fbaf105eb310daf10ef7bd72675805ccf3f5a8bc'));
});
test('headgear retains six isolated shards with no enabled historical scope walker',()=>{
 const source=read('inkwave-headgear-visual-qa');
 assert.doesNotMatch(source,/fetch-depth: 0|assert-scope\.mjs/);assert.match(source,/fetch-depth: 1/);
 assert.equal((source.match(/^          - key:/gm)||[]).length,6);
 for(const suite of ['qa','multiview','ibl']){
  const runner=fs.readFileSync(new URL('../../tools/headgear-production-'+suite+'/run.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(runner,/assert-scope\.mjs/);
  const gitCalls=[...runner.matchAll(/execFileSync\('git',\[([^\]]*)\]/g)].map(m=>m[1]);
  assert.deepEqual(gitCalls,["'rev-parse','HEAD'"],'history consumers need explicit baseline fetches');
 }
});

test('quality history is bounded to exact endpoint trees and immutable checkout identity remains mandatory',()=>{
 const source=read('ci-quality-gate');assert.doesNotMatch(source,/fetch-depth: 0/);assert.match(source,/fetch-depth: 1/);assert.match(source,/filter: blob:none/);assert.match(source,/run: node scripts\/inkwave-quality-scope\.mjs --fetch-base/);assert.ok(source.includes('test "$actual_source_sha" = "$EXPECTED_SOURCE_SHA"'));
});
