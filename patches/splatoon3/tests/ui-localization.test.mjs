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
