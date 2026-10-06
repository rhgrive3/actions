// Issue #605 — the pre-GO match intro must play a dedicated Splatoon-style Opening cue.
// The raw upstream intro is silent (`_playMusic(null)`), so every claim here runs against the
// composed source the build ships: the cue exists, compiles clean in the music engine, cuts into
// `battle` at GO, and leaves the boss / attract / Practice Range / final-minute / results /
// fixed-step simulation contracts untouched. No Nintendo audio: the cue is an original composition.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource, checkCompatibility } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';

const publicRoot = process.env.INKWAVE_UPSTREAM_SOURCE ? pathToFileURL(process.env.INKWAVE_UPSTREAM_SOURCE + '/') : new URL('../../../inkwave-public/', import.meta.url);
const read = rel => fs.readFileSync(new URL(rel, publicRoot), 'utf8');
const build = rel => adaptSource(rel, read(rel));
const composeMain = rel => adaptRange(rel, adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, build(rel)))));
const CUE = "this._playMusic(this.match?.mode === 'boss' ? null : 'opening');";
const INTRO_ANCHOR = "    setTimeout(() => { if (this.match?.state === 'intro') this.hud?.setVisible(true); }, 3000);\n    this._playMusic(null);";
const SONG_ANCHOR = "  results_win: {\n    name: 'Fresh Victory',";

function part(code, start, end) {
  const a = code.indexOf(start);
  assert.ok(a >= 0, 'missing connection: ' + start);
  const b = code.indexOf(end, a + start.length);
  assert.ok(b > a, 'missing connection: ' + end);
  return code.slice(a, b);
}

test('#605: raw upstream stays byte-identical and its intro stays silent', () => {
  assert.doesNotThrow(() => checkCompatibility(fileURLToPath(publicRoot)));
  const main = read('src/main.js');
  assert.ok(main.includes(INTRO_ANCHOR), 'native intro is the silence this issue fixes');
  assert.ok(!main.includes("'opening'"), 'the cue never leaks into raw upstream');
  assert.ok(!read('src/audio/music.js').includes('  opening: {'), 'no track added to raw upstream');
});

test('#605: the composed turf intro starts the Opening cue instead of silence', () => {
  const main = build('src/main.js');
  const intro = part(main, '  _intro() {', '\n  pause() {');
  assert.ok(intro.includes(CUE), 'intro requests the dedicated Opening cue');
  assert.ok(!intro.includes('_playMusic(null)'), 'turf intro no longer silences the music engine');
  assert.ok(intro.includes("G.audio?.play('ready')"), 'READY SFX unchanged');
  assert.ok(intro.includes("this.hud?.banner('ready')"), 'READY banner schedule unchanged');
  assert.ok(!/runSimulation|\bG\.time\b/.test(intro), 'the cue is presentation only and cannot advance simulation');
  assert.ok(main.includes('runSimulation(this, dt)'), 'fixed-step simulation connection unchanged');
});

test('#605: boss intro, attract and Practice Range keep their own audio routing', () => {
  const main = build('src/main.js');
  const boss = part(main, '  _bossIntro(b) {', '  // round over');
  assert.ok(boss.includes('this._playMusic(null);'), 'boss intro stays silent by design');
  assert.ok(!boss.includes("'opening'"), 'boss intro never requests the Opening cue');
  const events = part(main, "on('match:state', ({ state, match }) => {", "if (state === 'judge')");
  assert.ok(events.includes('if (match.attract || match !== this.match) return;'), 'attract never reaches _intro()');
  const composed = composeMain('src/main.js');
  assert.ok(composed.includes('match.opts?.range) return;'), 'Practice Range never reaches _intro()');
  assert.ok(composed.includes(CUE), 'composed turf intro still carries the cue');
});

test('#605: GO, final-minute, finish and results music hand-offs are unchanged', () => {
  const main = build('src/main.js');
  assert.ok(main.includes("if (match.mode !== 'boss') this._playMusic('battle');"), 'GO still starts the battle track');
  assert.ok(main.includes("if (this.match?.mode !== 'boss') this._playMusic('battle_final');"), 'one-minute hand-off unchanged');
  assert.ok(main.includes("setTimeout(() => this._playMusic(won ? 'results_win' : 'results_lose'), 2600);"), 'results hand-off unchanged');
  assert.ok(main.includes('G.music?.stop?.(0.4); this._musicTrack = null;'), 'time-up stop unchanged');
  assert.equal((main.match(/G\.music\?\.stop\?\.\(0\.3\)/g) || []).length, 2, 'offline and online launches still stop the menu track before the intro');
});

test('#605: the Opening cue is a distinct, clean-compiling track that cuts straight into battle', async () => {
  const mod = await import('data:text/javascript;base64,' + Buffer.from(build('src/audio/music.js')).toString('base64'));
  assert.ok(mod.SONGS.opening, 'dedicated track id registered');
  for (const id of ['battle', 'battle_final']) {
    assert.notEqual(mod.SONGS.opening.name, mod.SONGS[id].name, `distinct name from ${id}`);
    assert.notEqual(mod.SONGS.opening.bpm, mod.SONGS[id].bpm, `distinct tempo from ${id} so GO takes the immediate cross-fade`);
  }
  const song = mod.getSong('opening');
  assert.deepEqual(song.warnings, [], 'cue compiles without engine warnings');
  assert.equal(song.bars.length, 4, 'four bars at 140 bpm cover the 4.2 s intro before GO cuts it');
  assert.equal(mod.TRACKS.opening.name, 'Opening Sting');
  assert.match(read('src/audio/music.js'), /if \(cur && fade > 0 && cur\.song\.bpm === song\.bpm\)/,
    'engine hand-off rule: equal tempos wait for the next bar line, different tempos cut now');
});

test('#605: missing, duplicated or re-applied connections fail closed', () => {
  const main = read('src/main.js'), music = read('src/audio/music.js');
  assert.throws(() => adaptSource('src/main.js', main.replace(INTRO_ANCHOR, '    this._playMusic(null);')), /match-start Opening cue/);
  assert.throws(() => adaptSource('src/main.js', main.replace(INTRO_ANCHOR, INTRO_ANCHOR + '\n' + INTRO_ANCHOR)), /match-start Opening cue/);
  assert.throws(() => adaptSource('src/audio/music.js', music.replace(SONG_ANCHOR, '  results_win: {')), /match-start Opening cue/);
  assert.throws(() => adaptSource('src/audio/music.js', music.replace(SONG_ANCHOR, SONG_ANCHOR + SONG_ANCHOR)), /match-start Opening cue/);
  assert.throws(() => adaptSource('src/audio/music.js', adaptSource('src/audio/music.js', music)), /conflict/);
  assert.throws(() => adaptSource('src/main.js', adaptSource('src/main.js', main)), /conflict/);
});
