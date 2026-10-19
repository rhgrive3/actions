import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { adaptUiLocalization } from '../ui-localization-adapter.mjs';
import { makeUiTranslator, UI_JA } from '../runtime/ui-strings.mjs';
import { localizeGameContent } from '../runtime/content-language.mjs';
const translate=makeUiTranslator(value=>UI_JA[value]??value,UI_JA,true);
test('room state templates preserve names, codes and English mode',()=>{
 assert.equal(translate('Room full · 2 not ready'),'満員・あと2人が準備中');
 assert.equal(translate('3 of 8 ready'),'8人中3人が準備OK');
 assert.equal(translate('Connecting to room B7J9K…'),'部屋 B7J9K に接続中…');
 assert.equal(translate('Waiting for Player <1>'),'Player <1>を待っています');
 assert.equal(translate('2 bots join the squad'),'チームにボット2人を追加');
 assert.equal(translate('Player <1>'),'Player <1>');
 assert.equal(translate('Player <1> joined the room'),'Player <1>が参加しました');
 assert.equal(translate('Waiting for Player <1> to ready up'),'Player <1>の準備を待っています');
 assert.equal(makeUiTranslator(x=>x,UI_JA,false)('Waiting for Player <1>'),'Waiting for Player <1>');
});
test('live DOM updates translate owned labels while player names remain byte-identical',()=>{
 const raw=`const statusTxt={},name={},hintEl={},label={},style={};
 const p={name:'Room is full'};name.textContent=p.name;
 let txt='3 of 8 ready';statusTxt.textContent=txt;
 hintEl.textContent='Connecting to room '+code+'…';
 label.textContent=ready?'JOIN':p.name;
 style.textContent='color: red';
 export {statusTxt,name,hintEl,label,style};`;
 const code=adaptUiLocalization('src/ui/menus.js',raw).replace(/^import.*\n/,'').replace('export {statusTxt,name,hintEl,label,style};','({statusTxt,name,hintEl,label,style})');
 const actual=vm.runInNewContext(code,{tu:translate,code:'B7J9K',ready:false});
 assert.equal(actual.statusTxt.textContent,'8人中3人が準備OK');assert.equal(actual.hintEl.textContent,'部屋 B7J9K に接続中…');
 assert.equal(actual.name.textContent,'Room is full');assert.equal(actual.label.textContent,'Room is full');assert.equal(actual.style.textContent,'color: red');
});
test('production composition translates dynamic room errors, help, awards and appearance updates',()=>{
 const composed=adaptBuildSource('src/ui/menus.js',fs.readFileSync(new URL('../../../inkwave-public/src/ui/menus.js',import.meta.url),'utf8'));
 assert.match(composed,/errTitle\.textContent = tu\(E.title\)/);
 assert.match(composed,/statusTxt\.textContent = tu\(txt\)/);
 assert.match(composed,/appearanceLabel\.textContent = tu\(/);
 assert.doesNotMatch(composed,/P\.name\.textContent = tu\(p\.name\)/);
 assert.equal(translate('Motion sensitivity'),'ジャイロ感度');assert.equal(translate('#1 Turf Inker'),'塗りポイント No.1');
});
test('installed catalogue content uses localized names and gameplay instructions without changing IDs or slots',()=>{
 const WEAPONS={x:{id:'x',behaviorKind:'stringer',catalogRecord:{family:'stringer'},referenceNames:{ja:'トライストリンガー',en:'Tri-Stringer'},sub:'bomb',special:'inkjet'}};
 const SUB={bomb:{id:'bomb',name:'Splat Bomb'}},SPECIALS={inkjet:{id:'inkjet',name:'Inkjet',duration:8}};
 localizeGameContent({WEAPONS,SUB,SPECIALS,LANG:'ja'});
 assert.equal(WEAPONS.x.name,'トライストリンガー');assert.equal(WEAPONS.x.class,'ストリンガー');assert.match(WEAPONS.x.blurb,/チャージ/);
 assert.equal(SUB.bomb.name,'スプラッシュボム');assert.equal(SPECIALS.inkjet.name,'ジェットパック');assert.equal(SPECIALS.inkjet.duration,8);assert.equal(WEAPONS.x.sub,'bomb');
});
test('update news cards translate every label and keep the bullet separator outside the translated text',()=>{
 const raw=fs.readFileSync(new URL('../../../inkwave-public/src/ui/news.js',import.meta.url),'utf8');
 const adapted=adaptUiLocalization('src/ui/news.js',raw);
 assert.match(adapted,/h\('span', null, h\('b', null, b\), ' — ', t\)/);
 const literals=[...raw.slice(raw.indexOf('const PAGES = ['),raw.indexOf('export class WhatsNew')).matchAll(/'([^'\n]*[A-Za-z][^'\n]*)'/g)].map(m=>m[1])
  .filter(s=>!/^(?:mp|boss|a|b|is-new|NEW!)$/.test(s)&&!s.endsWith('.webp'));
 for(const label of [...literals,'What’s new','CONTINUE','Skip','TRY IT','LATER','Locker']) assert.notEqual(translate(label),label,label);
 assert.equal(translate('TRY IT'),'あそんでみる');
});
test('boot progress labels are translated at the loading owner, including those main.js passes raw',()=>{
 const composed=adaptBuildSource('src/ui/menus.js',fs.readFileSync(new URL('../../../inkwave-public/src/ui/menus.js',import.meta.url),'utf8'));
 assert.match(composed,/this\._loading\.label = tu\(String\(label\)\);/);
 assert.match(composed,/^import \{ tu \} from '\.\.\/i18n\.js';/m);
 const main=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8');
 const labels=[...main.matchAll(/await progress\([\d.]+, (?:t\()?'([^']+)'/g)].map(m=>m[1]);
 assert.ok(labels.includes('Teaching squids to swim…')&&labels.includes('Tuning the tentacles…'),'raw boot labels still present upstream');
 const ja=Object.fromEntries([...fs.readFileSync(new URL('../../../inkwave-public/src/i18n.js',import.meta.url),'utf8').matchAll(/'((?:Mixing|Building|Filling|Teaching|Tuning|Warming|Ready)[^']*)': '([^']+)'/g)].map(m=>[m[1],m[2]]));
 for(const label of labels) assert.ok(ja[label]&&ja[label]!==label&&/[ぁ-んァ-ン一-龯]/.test(ja[label]),label);
});
test('control guide map marker and practice range card action are localized',()=>{
 // map-toggle-adapter makes every Map row show the 'toggle' marker; h() translates it like 'hold'.
 const composed=adaptBuildSource('src/ui/menus.js',fs.readFileSync(new URL('../../../inkwave-public/src/ui/menus.js',import.meta.url),'utf8'));
 assert.match(composed,/\['Map', 'toggle', K\('TAB'\)/);
 assert.equal(UI_JA.toggle,'押して開閉');
 const range=fs.readFileSync(new URL('../../practice-range/runtime/menu.mjs',import.meta.url),'utf8');
 assert.match(range,/GLYPHS\.play \}\), L\('START'\)\)/);
 assert.match(fs.readFileSync(new URL('../../practice-range/runtime/strings.mjs',import.meta.url),'utf8'),/'START': 'スタート'/);
});
test('map hints follow the shared TAB/M map toggle instead of the retired hold',async()=>{
 const {UI_EN}=await import('../runtime/ui-strings.mjs');
 const hud=adaptBuildSource('src/ui/hud.js',fs.readFileSync(new URL('../../../inkwave-public/src/ui/hud.js',import.meta.url),'utf8'));
 const menus=adaptBuildSource('src/ui/menus.js',fs.readFileSync(new URL('../../../inkwave-public/src/ui/menus.js',import.meta.url),'utf8'));
 assert.match(hud,/press \[TAB\] or \[M\] to close/); // map-toggle-adapter owns the toggle
 for(const [source,code] of [['Hold [TAB] to plan a Super Jump',hud],['Hold [TAB] to open the big map and spot unpainted turf.',menus]]) {
  assert.ok(code.includes(source),source);
  assert.doesNotMatch(UI_JA[source],/長押し/);assert.match(UI_JA[source],/\[TAB\]か\[M\]/);
  assert.match(UI_EN[source],/^Press \[TAB\] or \[M\]/);
 }
 assert.doesNotMatch(UI_EN['Minimap <b>hidden</b> — hold TAB for the big map'],/hold/i);
});
