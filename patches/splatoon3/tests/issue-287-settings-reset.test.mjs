import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { fixture } from './source-fixture.mjs';
import { migrateAimProfiles, applyAimSettingsChange } from '../../local-quality/aim-profile.mjs';
import { initialGyroDefaults } from '../../local-quality/gyro-permission.mjs';
import { notePausedWorldChange } from '../../local-quality/idle-resources.mjs';
import { legacyPadToS3, s3PadMultiplier } from '../runtime/pad-sensitivity.mjs';

const compose = rel => adaptBuildSource(rel, fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8'));
const main = compose('src/main.js'), menu = compose('src/ui/menus.js');
function span(source, start, end) {
  const at = source.indexOf(start), until = source.indexOf(end, at);
  assert.ok(at >= 0 && until > at, `actual composed span ${start}`);
  assert.equal(source.indexOf(start, at + start.length), -1, `unique ${start}`);
  return source.slice(at, until);
}
async function settingsRig(saved) {
  const { DEFAULT_SETTINGS } = await fixture({ productionComposition: true });
  const storage = new Map(saved ? [['inkwave.settings', JSON.stringify(saved)]] : []);
  const G = { mode:'match' };
  const context = {
    DEFAULT_SETTINGS, G, migrateAimProfiles, applyAimSettingsChange, initialGyroDefaults,
    legacyPadToS3, notePausedWorldChange,
    localStorage: { getItem:k=>storage.get(k) ?? null, setItem:(k,v)=>storage.set(k,v) },
    // Display/resource owners are irrelevant to settings storage and are inert.
    applyRuntimeWorldQuality(){}, refreshEnvironmentBudget(){}, effectiveQuality(){}, dressingFor(){}, THREE:{},
  };
  const persistence = span(main, 'function loadJSON(', 'const DEFAULT_PROFILE');
  const load = span(main, "    this.settings = G.settings = migrateAimProfiles(", "    this.profile = loadJSON(");
  const set = span(main, '  _setSettings(partial) {', '\n  _applyAudioVolumes()');
  const Game = vm.runInNewContext(`${persistence}\nclass Game { bootSettings(){${load}} ${set} }; Game`, context);
  const make = () => { const game = new Game(); game.mobile={touch:false}; game._applyAudioVolumes=()=>{}; game.bootSettings(); return game; };
  const game = make(), calls = [], refreshed = new Map();
  const controls = new Map(['padSensitivity','aimProfile','gyroSens','invertY'].map(k=>[k,{refresh:v=>refreshed.set(k,v)}]));
  const node = { classList:{add(){},remove(){}}, querySelector:()=>({textContent:''}) };
  let button;
  const ui = { _btn(options){button=options;return node;}, _sfx(){}, _settings:()=>game.settings, _accentExternal:true,
    api:{setSettings(p){calls.push(p);game._setSettings(p);}} };
  const buildReset = vm.runInNewContext(`(function(){${span(menu,'    let resetArmed = 0;', "    const saved = h('div', { class: 'iw-saved'")}\n})`,
    {...context, GLYPHS:{reset:''}, tr:v=>v, safeCall:fn=>fn(), controls, rowsEl:{querySelectorAll:()=>[]}, restartAnim(){}, savedPulse(){}});
  buildReset.call(ui);
  return {game, DEFAULT_SETTINGS, storage, calls, refreshed, reload:make, accept:()=>button.accept()};
}

test('#287 native Settings reset restores the same centered stick gain as fresh boot, including saved reload', async () => {
  const r = await settingsRig();
  assert.equal(r.game.settings.padSensitivity, 0);
  r.game._setSettings({padSensitivity:4, gyroSens:2});
  r.game._setSettings({aimProfile:'handheld', padSensitivity:-3, gyroSens:-2});
  r.accept();
  assert.equal(r.calls.length, 0, 'first click only arms native confirmation');
  assert.equal(r.game.settings.padSensitivity, -3);
  r.accept();
  assert.equal(r.calls.length, 1);
  assert.equal(r.game.settings.aimProfile, 'tv');
  assert.equal(r.game.settings.padSensitivity, 0, 'legacy 1x must not be saved as S3 setting +1');
  for (const p of Object.values(r.game.settings.aimProfiles)) {
    assert.equal(p.padSensitivity, 0);
    assert.equal(p.gyroSens, 0);
  }
  assert.equal(r.refreshed.get('padSensitivity'), 0, 'visible control refreshes from actual settings');
  assert.equal(s3PadMultiplier(r.game.settings.padSensitivity), 1);
  const saved = JSON.parse(r.storage.get('inkwave.settings'));
  assert.equal(saved.padSensitivityScale, 's3');
  assert.equal(saved.padSensitivity, 0);
  assert.equal(r.reload().settings.padSensitivity, 0, 'reload never migrates an already-S3 reset twice');
  assert.equal(r.DEFAULT_SETTINGS.padSensitivity, 1, 'legacy boot default remains intact for old saves');
});

test('#287 real boot keeps each legacy and already-S3 profile choice until explicit reset', async () => {
  for (const saved of [
    {padSensitivity:1.5},
    {aimProfile:'handheld', aimProfiles:{tv:{padSensitivity:.75},handheld:{padSensitivity:2}}},
    {padSensitivityScale:'s3', aimProfile:'handheld', aimProfiles:{tv:{padSensitivity:-4},handheld:{padSensitivity:3.5}}},
  ]) {
    const r = await settingsRig(saved), modern = saved.padSensitivityScale === 's3';
    for(const mode of ['tv','handheld']) {
      const original = saved.aimProfiles?.[mode]?.padSensitivity ?? saved.padSensitivity;
      assert.equal(r.game.settings.aimProfiles[mode].padSensitivity, modern ? original : legacyPadToS3(original));
    }
    assert.equal(r.reload().settings.padSensitivity, r.game.settings.padSensitivity, 'migration is one-time');
    for(let i=0;i<4;i++) {
      r.accept(); r.accept();
      assert.equal(r.game.settings.padSensitivity, 0);
      assert.equal(r.reload().settings.padSensitivity, 0);
    }
  }
});
