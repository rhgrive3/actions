import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {adaptHeadgear} from '../headgear-adapter.mjs';
const root=new URL('../../../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(new URL(p,root))).digest('hex');
test('catalog and localized picker add four stable IDs without replacing existing entries',()=>{
 const style=adaptHeadgear('src/game/character-style.js',read('inkwave-public/src/game/character-style.js'));
 const hats=style.match(/export const HATS = (\[[^;]+\]);/)[1];
 assert.deepEqual(JSON.parse(hats.replaceAll("'",'"')),['none','cap','beanie','bucket','armor-helmet-replica','two-line-mesh','camo-headphones-suiton','ink-black-flap-cap','goldfish-mask','samurai-helmet','face-goggles','thief-hook']);
 const ja=adaptHeadgear('src/i18n.js',read('inkwave-public/src/i18n.js'));
 for(const label of ['キンギョマスケラ','サムライヘルメット','フェイスゴーグル','カイトウ・フック'])assert(ja.includes(label));
 assert(read('inkwave-public/src/ui/menus.js').includes("count: n(L.HATS), names: L.HAT_NAMES"));
});
test('approved face and old headgear source modules remain exact',()=>{
 const expected={"patches/local-quality/headgear/armor-helmet.js": "cc86aafd2e81bb9a6bc7cf070fcfdc39135636f0db959e419bd37168dc670f6a", "patches/local-quality/headgear/two-line-mesh.js": "05f24581fe7a409c875de39ae47acbdf5751f1c2e25441806d9197183f8a8a23", "patches/local-quality/headgear/camo-headphones.js": "c46a991198fd2034695c40e63467f875e57ad143789ec913ac0c1ceafd3476d4", "patches/local-quality/headgear/character-headgear-ink-black-flap-cap.js": "2e3687e65e7b95f4997e6d116a3a4b0ccb8c1cf09a9003bd5d3cab15309ae27d", "patches/local-quality/s3-face-look-adapter.mjs": "173dea3ad8f7d9a88accf891654218526bd91502199db7274646f48ed373322e"};
 for(const [file,hash] of Object.entries(expected))assert.equal(sha(file),hash,file);
});
