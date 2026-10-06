import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { adaptSource } from '../adapter.mjs';

const read = path => fs.readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const hud = adaptSource('src/ui/hud.js', read('inkwave-public/src/ui/hud.js'));
const style = read('patches/splatoon3/ui.css');

test('the S3 adapter replaces only the default Shooter cardinal ticks with four corner markers', () => {
  const match = hud.match(/else if \(kind === "shooter"\) \{([\s\S]*?)\n    \} else \{/);
  assert.ok(match, 'the adapted HUD has a Shooter-specific branch');
  const corners = [...match[1].matchAll(/class="iw-ret__corner (nw|ne|sw|se)"/g)].map(x => x[1]);
  assert.deepEqual(corners, ['nw', 'ne', 'sw', 'se']);
  assert.doesNotMatch(match[1], /iw-ret__tick/);
  assert.match(match[1], /circle r="15" class="iw-ret__ring thin"/);
  assert.match(hud, /else \{\n      r\.innerHTML = `[\s\S]*?iw-ret__tick[\s\S]*?--a:270deg/,
    'the fallback reticle retains its original geometry');
});

test('the live spread value expands and contracts a symmetric legacy-sized shooter envelope', () => {
  assert.match(hud, /this\.ret\.style\.setProperty\('--sp', sp\.toFixed\(1\)\)/,
    'the corners consume the same spread state as the previous ticks');
  const box = style.match(/\.iw-ret--shooter \.iw-ret__corners\s*\{([^}]+)\}/s)?.[1] || '';
  assert.match(box, /width:\s*calc\(45px \+ var\(--sp, 0\) \* 2px\)/);
  assert.match(box, /height:\s*45px/,
    'vertical extent stays at the existing screen-space bound');
  assert.match(style, /\.iw-ret--shooter \.iw-ret__corner\.ne\s*\{[^}]*scaleX\(-1\)/);
  assert.match(style, /\.iw-ret--shooter \.iw-ret__corner\.sw\s*\{[^}]*scaleY\(-1\)/);
  assert.match(style, /\.iw-ret--shooter \.iw-ret__corner\.se\s*\{[^}]*scale\(-1\)/);
});

test('Shooter geometry is isolated from weapon-specific reticles and Range/network state', () => {
  assert.match(hud, /else if \(kind === 'dualies'\)[\s\S]*?iw-ret__tick/);
  assert.match(hud, /else if \(kind === 'splatling'\)[\s\S]*?iw-ret__tick/);
  assert.match(style, /\.iw-ret--shooter \.iw-ret__corner/);
  assert.doesNotMatch(style, /\.iw-ret--(?:blaster|dualies|charger|roller|slosher|splatling) \.iw-ret__corner/);
  const html = adaptSource('index.html', read('inkwave-public/index.html'));
  assert.match(html, /href="\.\/patches\/splatoon3\/ui\.css"/,
    'the actual S3 build entry loads the scoped corner styles');
});
