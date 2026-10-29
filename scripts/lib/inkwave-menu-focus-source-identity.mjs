import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const HISTORICAL_MENU_LAYOUT_SHA256='f694cc7e2cecfc612c054faad7a60e2656bdac18c743977c17c35f5ec40bb55d';
export const CURRENT_MENU_LAYOUT_SHA256='ff0a0c479e5aca4f88082836c17d8631e2d835caae7fc9c8eddcaa26e76918d9';
const hash=source=>createHash('sha256').update(source).digest('hex');
// a138128328543f9e8236a867408b57467ab527c9: cache only screen-owned
// nodes, retain native navigation on lost ownership, and avoid unchanged writes.
const changes=[
 [
  "  const onNav = scr.onNav;\n  scr.onNav = dir => {\n    // Read the real grid on each move: the six-rule catalogue, portrait rows",
  "  const onNav = scr.onNav;\n  const modeRow = scr.el.querySelector('.iw-modesel__row');\n  const modeCards = modeRow ? [...modeRow.querySelectorAll('.iw-mode')] : [];\n  scr.onNav = dir => {\n    // Read the real grid on each move: the six-rule catalogue, portrait rows",
 ],
 [
  "    if ((touchMenu() || menus._input === 'touch') && ['up', 'down', 'left', 'right'].includes(dir)) {\n      const row = scr.el.querySelector('.iw-modesel__row');\n      const cards = [...row.querySelectorAll('.iw-mode')];\n      const i = cards.indexOf(menus._focus);",
  "    if ((touchMenu() || menus._input === 'touch') && (dir === 'up' || dir === 'down' || dir === 'left' || dir === 'right')) {\n      const row = modeRow, cards = modeCards;\n      const i = cards.indexOf(menus._focus);\n      if (i < 0 || row?.isConnected === false || cards.some(card => card.parentNode !== row)) return onNav?.(dir);",
 ],
 [
  "    for (const c of cards) c.hidden = key !== 'all' && c.dataset.cat !== key;",
  "    for (const c of cards) { const hidden = key !== 'all' && c.dataset.cat !== key; if (c.hidden !== hidden) c.hidden = hidden; }",
 ],
];
function once(source,from,to){
 const i=source.indexOf(from);
 assert.ok(i>=0&&source.indexOf(from,i+from.length)<0,'Menu focus epoch requires exactly one reviewed owner site');
 return source.slice(0,i)+to+source.slice(i+from.length);
}
export function restoreReviewedMenuLayout(source){
 for(const [before,after] of [...changes].reverse())source=once(source,after,before);
 assert.equal(hash(source),HISTORICAL_MENU_LAYOUT_SHA256,'Menu owner restoration must equal the complete frozen source epoch');
 return source;
}
export function verifyMenuLayoutSourceIdentity(source,manifestDigest,historicalDigest){
 assert.equal(historicalDigest,HISTORICAL_MENU_LAYOUT_SHA256,'Frozen menu focus source epoch');
 const observed=hash(source);
 assert.equal(manifestDigest,observed,'Emitted menu-layout input matches actual repository source bytes');
 if(observed===HISTORICAL_MENU_LAYOUT_SHA256)return {epoch:'historical-stage-picker',sourceSha256:observed,historicalSha256:observed};
 assert.equal(observed,CURRENT_MENU_LAYOUT_SHA256,'Reviewed current menu-layout source epoch');
 const restored=restoreReviewedMenuLayout(source);
 assert.equal(hash(restored),HISTORICAL_MENU_LAYOUT_SHA256,'Current menu-layout reverses to the complete frozen source epoch');
 return {epoch:'a1381283-screen-owned-caches',sourceSha256:observed,historicalSha256:hash(restored)};
}
