import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const SOURCE=process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT,'inkwave-public');
const read=rel=>fs.readFileSync(path.join(SOURCE,rel),'utf8');
const css=adaptBuildSource('styles/hud.css',read('styles/hud.css'));
const hud=adaptBuildSource('src/ui/hud.js',read('src/ui/hud.js'));
const count=(s,x)=>s.split(x).length-1;

function reticle(kind) {
  const start=hud.indexOf('  _buildReticle(kind) {');
  const end=hud.indexOf('\n  _updCrosshair(f, dt) {',start);
  assert.ok(start>=0 && end>start,'installed reticle method');
  const Hud=Function('return class { '+hud.slice(start,end)+' }')();
  const h=new Hud();
  h.ret={className:'',innerHTML:'',style:{setProperty(){}},querySelector(){return {remove(){}};}};
  h._L={};
  h._buildReticle(kind);
  return h.ret.innerHTML;
}
test('#871: Shooter retains four physical tick nodes and the existing shared spread source',()=>{
  const shooter=reticle('shooter');
  assert.equal(count(shooter,'iw-ret__tick'),4);
  assert.match(shooter,/iw-ret__dot/);
  assert.match(shooter,/iw-ret__ring thin/);
  assert.equal(shooter,reticle('slosher'),'#652 shared base structure must not be rewritten');
  assert.match(hud,/"--sp"|\'--sp\'/,'spread state remains wired');
});
test('#871: published CSS positions rectangular four-corner brackets, not cardinal bars',()=>{
  const base=read('styles/hud.css');
  assert.ok(!base.includes('.iw-ret--shooter .iw-ret__tick {'),'locked upstream stays unmodified');
  const topLeft=css.match(/\.iw-ret--shooter \.iw-ret__tick:nth-child\(3\) \{([^}]+)\}/)?.[1];
  const topRight=css.match(/\.iw-ret--shooter \.iw-ret__tick:nth-child\(4\) \{([^}]+)\}/)?.[1];
  const bottomLeft=css.match(/\.iw-ret--shooter \.iw-ret__tick:nth-child\(5\) \{([^}]+)\}/)?.[1];
  const bottomRight=css.match(/\.iw-ret--shooter \.iw-ret__tick:nth-child\(6\) \{([^}]+)\}/)?.[1];
  for(const rule of [topLeft,topRight,bottomLeft,bottomRight])assert.ok(rule,'one CSS corner per Shooter tick');
  assert.match(topLeft,/border-top.*border-left/);
  assert.match(topRight,/border-top.*border-right/);
  assert.match(bottomLeft,/border-bottom.*border-left/);
  assert.match(bottomRight,/border-bottom.*border-right/);
  assert.match(css,/--iw-corner:\s*calc\(12px \+ var\(--sp, 0\) \* \.707px\)/);
  assert.match(css,/\.iw-ret--splatling \.iw-ret__tick \{/,'Splatling retains its own bracket CSS');
  assert.ok(!css.includes('.iw-ret--slosher .iw-ret__tick:nth-child'),'Slosher styling stays independent');
});
test('#871: existing other weapons keep unchanged reticle markup',()=>{
  for(const kind of ['dualies','blaster','roller','charger','splatling']){
    const output=reticle(kind);
    assert.ok(output.length>0,kind);
    if(kind==='dualies')assert.match(output,/iw-ret__twin/);
    if(kind==='splatling')assert.match(output,/iw-ret__segs/);
  }
});
