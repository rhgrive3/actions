// Batch #1171: execute extracted, actual build-adapted source algorithms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { adaptIssueBatch1171 } from '../issue-batch-1171-adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
function checkedReplace(source, before, after, label) {
  assert.equal(source.split(before).length - 1, 1, label + ': unique protected source anchor');
  return source.replace(before, after);
}
function composed(rel) {
  const raw = fs.readFileSync(path.join(ROOT, 'inkwave-public', rel), 'utf8');
  return { raw, code: rel === 'src/net/session.js' ? adaptBuildSource(rel, raw) : adaptIssueBatch1171(rel, raw, checkedReplace) };
}

test('#1158 post-roll Dualies exposes one centered ring and preserves normal twin shot cues', () => {
  const { code } = composed('src/ui/hud.js');
  assert.match(code, /<circle cx="0" cy="0" r="6\.2" class="iw-ret__ring thin iw-ret__merged"\/>/);
  assert.match(code, /this\._twin = \[r\.querySelector\('\.iw-ret__twin\.r'\)/);
  const css = fs.readFileSync(path.join(ROOT, 'patches/splatoon3/ui.css'), 'utf8');
  assert.match(css, /\.iw-ret--dualies\.is-lock \.iw-ret__merged \{ opacity: 1; \}/);
  assert.match(css, /\.iw-ret--dualies\.is-lock \.iw-ret__twin,[\s\S]*?visibility: hidden/);
  assert.match(css, /\.iw-ret--dualies\.is-lock \.iw-ret__lock/);
});

test('#1162 water height has bit-equivalent array-free marina and normal footprint scans', () => {
  const { raw, code } = composed('src/world/environment.js');
  const body = (s) => {
    const match = s.match(/  waterHeightAt\(x, z, t = this\.time\) \{([\s\S]*?)\n  \}/);
    assert.ok(match, 'real waterHeightAt method extracted');
    return new Function('smooth', 'WATER_Y',
      'return function(x,z,t=this.time){' + match[1] + '\n};')(
        (a,b,x) => { const u=Math.max(0,Math.min(1,(x-a)/(b-a))); return u*u*(3-2*u); },-1.6);
  };
  const original = body(raw), fixed = body(code);
  const rects = [
    { minX: -5, maxX: 5, minZ: -4, maxZ: 4, aligned: true },
    { minX: 7, maxX: 12, minZ: -4, maxZ: 3,
      aligned: false, cx: 9.5, cz: -0.5, ax: 1, az: 0, hx: 2.5, hz: 3.5 }
  ];
  const bounds = { minX:-15,maxX:15,minZ:-12,maxZ:12 };
  for (const marina of [false,true]) {
    const ctx = { time: 3.2, bounds, footprint: rects,
      _marinaData: marina ? { decks:[rects[0]],wet:[rects[1]] } : null };
    for (let i=0;i<250;i++) {
      const x=Math.sin(i*17.13)*130, z=Math.cos(i*9.77)*85, t=i/17;
      assert.equal(fixed.call(ctx,x,z,t), original.call(ctx,x,z,t));
    }
  }
  // Stage switches on one live environment: marina on/off, footprint and bounds replacement.
  // Both scans must stay in step with the original on the same object at every step.
  const other = [
    { minX: -20, maxX: -14, minZ: 2, maxZ: 9, aligned: true },
    { minX: 0, maxX: 4, minZ: -11, maxZ: -6,
      aligned: false, cx: 2, cz: -8.5, ax: 0.6, az: 0.8, hx: 2, hz: 2.5 }
  ];
  const live = { time: 0.4, bounds, footprint: rects, _marinaData: null };
  const steps = [
    () => {},
    () => { live._marinaData = { decks:[rects[0]], wet:[rects[1]] }; },
    () => { live._marinaData = { decks:[other[0]], wet:[other[1]] }; live.bounds = { minX:-30,maxX:30,minZ:-20,maxZ:20 }; },
    () => { live._marinaData = null; live.footprint = other; live.bounds = bounds; },
    () => { live.footprint = [{ minX: -15, maxX: 15, minZ: -12, maxZ: 12, aligned: true }]; },
    () => { live._marinaData = { decks:[], wet:[rects[1]] }; },
  ];
  steps.forEach((step, s) => {
    step();
    for (let i=0;i<120;i++) {
      const x=Math.sin(i*11.31+s)*140, z=Math.cos(i*7.73-s)*90, t=s*1.7+i/23;
      assert.equal(fixed.call(live,x,z,t), original.call(live,x,z,t), `stage step ${s} sample ${i}`);
    }
  });
  // Theme and sea state are not inputs to waterHeightAt (it reads x, z, t, bounds, footprint, _marinaData only).
  const method = code.slice(code.indexOf('  waterHeightAt('), code.indexOf('  get seaState()'));
  assert.doesNotMatch(method, /seaState|theme/);
  assert.doesNotMatch(method, /\[M\.decks, M\.wet\]|\[this\.footprint\]/);
});

test('#1159 orphan timer cannot fire into a new room even if its callback was queued', () => {
  const { code } = composed('src/net/session.js');
  const match = code.match(/  _markReady\(id\) \{([\s\S]*?)\n  \}\n\n  _go\(\)/);
  assert.ok(match, 'actual ready scheduling method extracted');
  const timers = [];
  const Owner = new Function('setTimeout',
    'return class { constructor(){ this.state="starting"; this.isHost=true;' +
    'this._ready=new Set(); this._members=new Map([["host","H"],["guest","G"]]);' +
    'this._startCfg={id:"old",roster:[{owner:"host",bot:false},{owner:"guest",bot:false}]};' +
    'this.tr={};this.count=0;this._goT=null;} _go(){this.count++}' +
    '_markReady(id){' + match[1] + '\n} };')(
      (callback,ms)=>{ assert.equal(ms,12000);timers.push(callback);return timers.length; });
  const a = new Owner();
  a._markReady('host');
  assert.equal(timers.length, 1);
  a._startCfg={id:'new',roster:a._startCfg.roster};a.tr={};
  timers[0]();
  assert.equal(a.count,0,'old callback cannot launch the new room');
  assert.equal(code.split('clearTimeout(this._goT); this._goT = null;').length-1,4,
    'leave, new round, end and GO completion retire the deadline; fail/close delegate to leave');
});

test('#1165 CPU owner shares the shader roller body outline across seeds and directions', () => {
  const { code } = composed('src/world/paint.js');
  const m=code.match(/        if \(roll\) \{([\s\S]*?)\n        \} else \{/);
  assert.ok(m, 'real CPU Roller branch extracted');
  const implementation = new Function('px','py','sdu','sdv','r','seed','BAND_L','BAND_W','BAND_R',
    m[1].replace('continue;', 'return false;') + '\nreturn true;');
  const gpu = (px,py,dx,dy,r,seed) => {
    const along=px*dx+py*dy, across=-px*dy+py*dx;
    const wob=r*(.03*Math.sin(along/r*9+seed*30)+.018*Math.sin(along/r*23+seed*11));
    const qa=Math.abs(along)-r*.55, qb=Math.abs(across)-r*.62-wob;
    return Math.hypot(Math.max(qa,0),Math.max(qb,0)) + Math.min(Math.max(qa,qb),0)-r*.1 <= 0;
  };
  for(const seed of [0,Math.PI/60,.1,.5,.99]) for(const angle of [0,.3,1.3,2.8]) {
    const dx=Math.cos(angle),dy=Math.sin(angle),r=.62;
    for(let a=-1;a<=1;a+=.09) for(let b=-1;b<=1;b+=.09) {
      const px=a*r,py=b*r;
      assert.equal(implementation(px,py,dx,dy,r,seed,.55,.62,.1),gpu(px,py,dx,dy,r,seed),
        'CPU/GPU same permanent Roller band center sample');
    }
  }
  assert.equal(implementation(0,.73,1,0,1,Math.PI/60,.55,.62,.1),true,
    'published mismatch witness is now CPU-painted like GPU');
});

test('#1166 hidden rendering is gated while network and authoritative Match still tick', () => {
  const { code }=composed('src/main.js');
  assert.match(code,/const worldHidden = setUp \|\| document\.hidden;/);
  assert.match(code,/if \(!this\._skipRender && !document\.hidden\) \{/);
  const net = code.indexOf('    G.net?.update?.(dt);');
  const visuals = code.indexOf('    const worldHidden = setUp || document.hidden;');
  assert.ok(net>=0 && net<visuals,'network update remains before visual visibility gate');
  assert.match(code,/G\.paint\.flush\(dt\)/);
  assert.match(code,/this\.R\.render\(\)/);
});
