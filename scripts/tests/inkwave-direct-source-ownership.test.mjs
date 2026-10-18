import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fetchWorkflow = fs.readFileSync(new URL('../../.github/workflows/fetch-inkwave.yml', import.meta.url), 'utf8');
const navigation = fs.readFileSync(new URL('../../inkwave-public/src/game/nav.js', import.meta.url), 'utf8');
const murals = fs.readFileSync(new URL('../../inkwave-public/src/world/murals.js', import.meta.url), 'utf8');
const worldProps = fs.readFileSync(new URL('../../inkwave-public/src/world/props.js', import.meta.url), 'utf8');
const marinaVessels = fs.readFileSync(new URL('../../inkwave-public/src/world/props-marina-vessels.js', import.meta.url), 'utf8');
const lobbySetTexture = fs.readFileSync(new URL('../../inkwave-public/src/game/lobbySet-tex.js', import.meta.url), 'utf8');
const uiIcons = fs.readFileSync(new URL('../../inkwave-public/src/ui/ui-icons.js', import.meta.url), 'utf8');
const runtimeUiStrings = fs.readFileSync(new URL('../../patches/splatoon3/runtime/ui-strings.mjs', import.meta.url), 'utf8');
const muralAdapter = fs.readFileSync(new URL('../../patches/local-quality/mural-atlas-adapter.mjs', import.meta.url), 'utf8');
const mainComposition = fs.readFileSync(new URL('../inkwave-source-composition.mjs', import.meta.url), 'utf8');
const composition = fs.readFileSync(new URL('../../patches/local-quality/adapter.mjs', import.meta.url), 'utf8');

test('public-source fetch is a read-only candidate workflow, never a direct-source overwrite', () => {
  assert.match(fetchWorkflow, /permissions:\s*\n\s*contents: read/);
  assert.match(fetchWorkflow, /candidate="\$\{RUNNER_TEMP\}\/inkwave-upstream-candidate"/);
  assert.match(fetchWorkflow, /review-inkwave-upstream\.mjs/);
  assert.match(fetchWorkflow, /actions\/upload-artifact@v4/);
  assert.doesNotMatch(fetchWorkflow, /rm -rf inkwave-public/);
  assert.doesNotMatch(fetchWorkflow, /git (?:push|commit|add inkwave-public)/);
});

test('migrated A-star heuristic owner is the readable game source', () => {
  assert.match(navigation, /this\._h = new Float64Array\(N\)/);
  assert.match(navigation, /heap\.push\(e\.to, ng \+ heuristic\[e\.to\]\)/);
  assert.doesNotMatch(composition, /adaptNavHeuristic/);
  assert.match(navigation, /buildNativeNav\(this\)/);
  assert.match(navigation, /const heap = this\._heap \|\| \(this\._heap = new Heap\(\)\)/);
});

test('mural atlas and world branding use directly editable source without rebuild-time rewriting', async () => {
  const { adaptBuildSource } = await import('../inkwave-source-composition.mjs');
  assert.equal(adaptBuildSource('src/world/murals.js', murals), murals);
  assert.match(murals, /const W = 2048, RH = 256, ROWS = 4, FULL_H = 2048/);
  assert.match(murals, /let H = stageId === 'halyard' \|\| STAGE_MURALS\[stageId\] \? FULL_H : RH \* ROWS/);
  assert.match(murals, /tex\.dispose\(\)/);
  assert.match(murals, /strokeText\('ZEVANT', ox \+ 300, 186\)/);
  assert.match(murals, /fillText\('ZEVANT', ox \+ 294, 180\)/);
  assert.doesNotMatch(muralAdapter, /if \(rel !== 'src\/world\/murals\.js'\)/);
  assert.doesNotMatch(mainComposition, /'src\/world\/murals\.js':/);
  assert.match(muralAdapter, /if \(rel === 'src\/main\.js'\)/, 'selected-stage main hook remains until main.js is migrated');
});

test('ZEVANT stage and lobby lettering is directly owned by authored game modules', async () => {
  const { adaptBuildSource } = await import('../inkwave-source-composition.mjs');
  for (const [path, source] of [
    ['src/world/props-marina-vessels.js', marinaVessels],
    ['src/game/lobbySet-tex.js', lobbySetTexture],
  ]) assert.equal(adaptBuildSource(path, source), source, path + ' must not be rewritten by the build');
  assert.match(worldProps, /ZEVANT HARBOR · SEWER · ZEVANT HARBOR · SEWER/);
  assert.match(marinaVessels, /text\(B, 'ZEVANT', 0\.19/);
  assert.match(marinaVessels, /text\(B, 'ZEVANT', 0\.1,/);
  assert.match(marinaVessels, /text\(B, 'ZEVANT', 0\.11/);
  assert.match(lobbySetTexture, /const word = 'ZEVANT', size =/);
  assert.match(uiIcons, /logoMarkup\(title = 'ZEVANT'/);
  assert.match(runtimeUiStrings, /The ZEVANT servers didn’t answer/);
  assert(!mainComposition.includes("  'patches/splatoon3/runtime/ui-strings.mjs': ["));
  for (const path of ['src/world/props.js', 'src/world/props-marina-vessels.js', 'src/game/lobbySet-tex.js', 'src/ui/ui-icons.js']) {
    assert(!mainComposition.includes("  '" + path + "': ["), path + ' must not require late string replacement');
  }
});
