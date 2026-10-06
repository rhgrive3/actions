import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';

const root = new URL('../../../', import.meta.url);
const read = (rel) => fs.readFileSync(new URL('inkwave-public/' + rel, root), 'utf8');
const compose = (rel, code = read(rel)) =>
  adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));

function section(source, start, end) {
  const at = source.indexOf(start);
  const until = source.indexOf(end, at);
  assert.ok(at >= 0 && until > at, `boundary: ${start}`);
  return source.slice(at, until);
}

// Simple DOM tree mock for HUD elements
class MockNode {
  constructor(tag = 'div', attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.className = attrs.class || '';
    this.classList = {
      names: new Set(this.className.split(/\s+/).filter(Boolean)),
      add(...cls) { cls.forEach((c) => this.names.add(c)); },
      remove(...cls) { cls.forEach((c) => this.names.delete(c)); },
      contains(c) { return this.names.has(c); },
      toggle(c, force) {
        const on = force !== undefined ? !!force : !this.contains(c);
        if (on) this.add(c); else this.remove(c);
        return on;
      },
    };
    this.style = {
      _props: {},
      setProperty: (k, v) => { this.style._props[k] = String(v); },
      getPropertyValue: (k) => this.style._props[k] || '',
    };
    if (attrs.style) {
      for (const [k, v] of Object.entries(attrs.style)) this.style.setProperty(k, v);
    }
    this.innerHTML = attrs.html || '';
    this.textContent = '';
    this.title = attrs.title || '';
    this._connected = true;
  }
  get isConnected() { return this._connected; }
  appendChild(child) {
    if (!child) return child;
    if (child.parentNode) {
      const idx = child.parentNode.children.indexOf(child);
      if (idx >= 0) child.parentNode.children.splice(idx, 1);
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  querySelectorAll(sel) {
    const res = [];
    const walk = (n) => {
      for (const ch of n.children) {
        if (sel.startsWith('.')) {
          const cls = sel.slice(1);
          if (ch.classList.contains(cls)) res.push(ch);
        } else if (sel.toLowerCase() === ch.tagName.toLowerCase()) {
          res.push(ch);
        }
        walk(ch);
      }
    };
    walk(this);
    return res;
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
  remove() {
    this._connected = false;
    if (this.parentNode) {
      const idx = this.parentNode.children.indexOf(this);
      if (idx >= 0) this.parentNode.children.splice(idx, 1);
      this.parentNode = null;
    }
  }
}

function createHudRig(hudCode, { isBoss = false, myTeam = 0 } = {}) {
  const overLayer = new MockNode('div', { class: 'iw-hud-over' });
  const sounds = [];
  const timers = [];
  const G = {
    teamHex: ['#ff8a14', '#2f5bff'],
    game: { palette: { names: ['Alpha', 'Bravo'] } },
  };
  const WEAPONS = {
    shooter: { name: 'Wave Gun', kind: 'shooter' },
    roller: { name: 'Splat Roller', kind: 'roller' },
    charger: { name: 'Ink Charger', kind: 'charger' },
    dualies: { name: 'Dual Squelchers', kind: 'dualies' },
  };
  const TEAM_NAMES = ['Alpha', 'Bravo'];

  const h = (tag, attrs, ...children) => {
    const el = new MockNode(tag, attrs || {});
    const flat = children.flat(Infinity).filter(Boolean);
    for (const c of flat) {
      if (typeof c === 'string' || typeof c === 'number') {
        el.textContent += String(c);
      } else if (c instanceof MockNode) {
        el.appendChild(c);
      }
    }
    return el;
  };

  const toHex = (c, fb) => c || fb;
  const kindOf = (w) => (WEAPONS[w] && WEAPONS[w].kind) || w || 'shooter';
  const weaponIcon = (k) => `<svg class="icon-${k}"></svg>`;
  const splatSVG = () => '<svg class="splat"></svg>';
  const bossEmblem = () => '<svg class="boss"></svg>';
  const BOSS_NAME = 'HULLBREAKER';
  const BOSS_EPITHET = 'SCOURGE OF THE DEEP';
  const colorVars = (el, prefix, hex) => {
    el.style.setProperty(`--${prefix}`, hex);
  };

  // Extract _lineup method body
  const lineupSource = section(hudCode, '  _lineup(match) {', '\n  // ---------------------------------------------------------------- damage direction arcs');

  // Helpers from menus.js or adapted
  const TITLE_ADJ = ['Fresh', 'Inky', 'Turf', 'Splashy', 'Rad', 'Sneaky', 'Deep-Sea', 'Glossy', 'Tidal', 'Zesty', 'Mighty', 'Soggy', 'Speedy', 'Salty', 'Bubbly', 'Snazzy', 'Drippy', 'Sunny'];
  const TITLE_NOUN = ['Squidkid', 'Inkling', 'Turf Boss', 'Wave Rider', 'Splatter', 'Tentacle', 'Drip Lord', 'Sprayer', 'Rookie', 'Legend', 'Deck Hand', 'Sea Pickle', 'Kelp Fan', 'Ink Slinger', 'Plaza Star', 'Harbor Kid'];
  const fnv = (str) => { let x = 2166136261; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };
  const tagTitle = (name) => { const x = fnv(String(name || '').toLowerCase()); return `${TITLE_ADJ[x % TITLE_ADJ.length]} ${TITLE_NOUN[(x >>> 8) % TITLE_NOUN.length]}`; };
  const tagNum = (name) => '#' + String(1000 + (fnv('#' + String(name || '')) % 9000));
  const tagArt = (seed) => `<svg data-seed="${seed}"></svg>`;

  const GLYPHS = {
    star: '<svg class="glyph-star"></svg>',
    crown: '<svg class="glyph-crown"></svg>',
    squidlet: '<svg class="glyph-squidlet"></svg>',
    bot: '<svg class="glyph-bot"></svg>',
  };
  const AWARDS = {
    mvp: { label: 'MVP', metal: 'gold', icon: 'star', desc: 'Best all-round score' },
    turf: { label: 'TURF KING', metal: 'gold', icon: 'crown', desc: 'Most turf inked' },
  };
  const AWARD_ICONS = {
    star: '<svg class="icon-star"></svg>',
    crown: '<svg class="icon-crown"></svg>',
  };
  const awardIcon = (id) => AWARD_ICONS[id] || `<svg class="icon-${id}"></svg>`;

  const ctx = {
    h,
    toHex,
    kindOf,
    weaponIcon,
    splatSVG,
    bossEmblem,
    BOSS_NAME,
    BOSS_EPITHET,
    colorVars,
    G,
    WEAPONS,
    TEAM_NAMES,
    fnv,
    tagTitle,
    tagNum,
    tagArt,
    GLYPHS,
    AWARDS,
    AWARD_ICONS,
    awardIcon,
    timers,
    setTimeout: (fn, ms) => timers.push({ fn, ms }),
  };

  const hud = {
    overLayer,
    boss: { on: isBoss },
    _actors: () => [],
    _myTeam: () => myTeam,
    _snd: (name, opts) => sounds.push({ name, opts }),
  };

  const fn = vm.runInNewContext(`({ ${lineupSource.trim()} })._lineup`, ctx);
  hud._lineup = fn.bind(hud);

  const make8Roster = () => [
    { name: 'Player1', team: 0, weaponId: 'shooter', isLocal: true },
    { name: 'Player2', team: 0, weaponId: 'roller', isLocal: false },
    { name: 'Player3', team: 0, weaponId: 'charger', isLocal: false },
    { name: 'Player4', team: 0, weaponId: 'dualies', isLocal: false },
    { name: 'Player5', team: 1, weaponId: 'shooter', isLocal: false },
    { name: 'Player6', team: 1, weaponId: 'roller', isLocal: false },
    { name: 'Player7', team: 1, weaponId: 'charger', isLocal: false },
    { name: 'Player8', team: 1, weaponId: 'dualies', isLocal: false },
  ];

  return { hud, overLayer, sounds, make8Roster, tagTitle, tagNum, fnv, timers };
}

// ---------------------------------------------------------------- Tests

test('#673 negative: raw unpatched HUD uses invented two-column team-name + VS roster with YOU label and no Splashtags', () => {
  const rawHud = read('src/ui/hud.js');
  const rig = createHudRig(rawHud);
  const match = { actors: rig.make8Roster() };
  rig.hud._lineup(match);

  // Unpatched HUD creates the VS element
  const vs = rig.overLayer.querySelectorAll('.iw-lu__vs');
  assert.equal(vs.length, 1, 'Raw unpatched HUD contains invented VS splat');

  // Unpatched HUD contains team-name headers
  const teamNames = rig.overLayer.querySelectorAll('.iw-lu__name');
  assert.equal(teamNames.length, 2, 'Raw unpatched HUD contains 2 team name headers');

  // Unpatched HUD contains invented YOU label
  const youLabels = rig.overLayer.querySelectorAll('em');
  assert.equal(youLabels.length, 1, 'Raw unpatched HUD contains invented YOU label');
  assert.equal(youLabels[0].textContent, 'YOU');

  // Unpatched HUD DOES NOT contain Splashtags
  const stags = rig.overLayer.querySelectorAll('.iw-stag');
  assert.equal(stags.length, 0, 'Raw unpatched HUD has 0 Splashtags');

  // Raw menus.js does not export tag helpers
  const rawMenus = read('src/ui/menus.js');
  assert.doesNotMatch(rawMenus, /export const fnv =/);
  assert.doesNotMatch(rawMenus, /export const tagTitle =/);
  assert.doesNotMatch(rawMenus, /export const tagNum =/);
});

test('#673: adapted HUD introduces S3 Splashtag identity presentation for all participants without invented YOU or VS', () => {
  const composedHud = compose('src/ui/hud.js');
  const rig = createHudRig(composedHud);
  const match = { actors: rig.make8Roster() };
  rig.hud._lineup(match);

  // No invented VS element
  const vs = rig.overLayer.querySelectorAll('.iw-lu__vs');
  assert.equal(vs.length, 0, 'Adapted HUD must not contain invented VS roster splat');

  // No invented team-name header divs
  const teamNames = rig.overLayer.querySelectorAll('.iw-lu__name');
  assert.equal(teamNames.length, 0, 'Adapted HUD must not contain invented team name header rows');

  // No invented YOU sticker element
  const emElements = rig.overLayer.querySelectorAll('em');
  assert.equal(emElements.length, 0, 'Adapted HUD must not contain invented YOU element');

  // Exactly 8 Splashtags created
  const stags = rig.overLayer.querySelectorAll('.iw-stag');
  assert.equal(stags.length, 8, 'Adapted HUD presents all 8 participants as Splashtag identity cards');

  // 4 Alpha (my team) and 4 Bravo
  const colA = rig.overLayer.querySelector('.iw-lineup__col--a');
  const colB = rig.overLayer.querySelector('.iw-lineup__col--b');
  assert.ok(colA, 'Contains team A column');
  assert.ok(colB, 'Contains team B column');
  assert.equal(colA.querySelectorAll('.iw-stag').length, 4, 'Team A has 4 cards');
  assert.equal(colB.querySelectorAll('.iw-stag').length, 4, 'Team B has 4 cards');

  // Local player highlighting uses .is-self class, not invented YOU text
  const selfCards = rig.overLayer.querySelectorAll('.is-self');
  assert.equal(selfCards.length, 1, 'Only local player card receives .is-self');
  assert.equal(selfCards[0].querySelector('.iw-stag__name').textContent, 'Player1');
});

test('#673: Splashtags faithfully reflect player names, deterministic title, number, banner art and weapon icon', () => {
  const composedHud = compose('src/ui/hud.js');
  const rig = createHudRig(composedHud);
  const match = { actors: rig.make8Roster() };
  rig.hud._lineup(match);

  const stags = rig.overLayer.querySelectorAll('.iw-stag');
  match.actors.forEach((actor, i) => {
    const card = stags[i];
    assert.ok(card, `Card for actor ${actor.name} exists`);

    // Name
    const nameEl = card.querySelector('.iw-stag__name');
    assert.ok(nameEl, 'Name element exists');
    assert.equal(nameEl.textContent, actor.name);

    // Title
    const titleEl = card.querySelector('.iw-stag__title');
    assert.ok(titleEl, 'Title element exists');
    assert.equal(titleEl.textContent, rig.tagTitle(actor.name));

    // Tag Number (#XXXX)
    const numEl = card.querySelector('.iw-stag__num');
    assert.ok(numEl, 'Number element exists');
    assert.equal(numEl.textContent, rig.tagNum(actor.name));

    // Banner Art
    const artEl = card.querySelector('.iw-stag__art');
    assert.ok(artEl, 'Art element exists');
    const expectedSeed = rig.fnv(actor.name.toLowerCase());
    assert.ok(artEl.innerHTML.includes(`data-seed="${expectedSeed}"`), 'Art uses deterministic FNV seed');

    // Weapon Icon
    const wEl = card.querySelector('.iw-stag__w');
    assert.ok(wEl, 'Weapon element exists');

    // Badges slot
    const badgesEl = card.querySelector('.iw-stag__badges');
    assert.ok(badgesEl, 'Badges element exists');
  });
});

test('#673: menus.js exports fnv, tagTitle, and tagNum when adapted', () => {
  const composedMenus = compose('src/ui/menus.js');
  assert.match(composedMenus, /export const fnv =/);
  assert.match(composedMenus, /export const tagTitle =/);
  assert.match(composedMenus, /export const tagNum =/);
});

test('#673: boss mode preserves squad vs Hullbreaker presentation and timing', () => {
  const composedHud = compose('src/ui/hud.js');
  const rig = createHudRig(composedHud, { isBoss: true });
  const match = { actors: rig.make8Roster() };
  rig.hud._lineup(match);

  // Boss mode still uses is-boss and iw-lu__vs
  const bel = rig.overLayer.querySelector('.is-boss');
  assert.ok(bel, 'Boss lineup container present');
  const vs = rig.overLayer.querySelectorAll('.iw-lu__vs');
  assert.equal(vs.length, 1, 'Boss lineup retains central VS element');
  const foe = rig.overLayer.querySelector('.iw-lu__foe');
  assert.ok(foe, 'Boss lineup retains foe element');
  assert.equal(foe.querySelector('.iw-lu__name').textContent, 'HULLBREAKER');
});

test('#673: adapter transforms fail closed on missing or duplicate anchors', () => {
  const rawHud = read('src/ui/hud.js');
  const rawMenus = read('src/ui/menus.js');

  // Missing anchor in hud.js must throw
  assert.throws(() => adaptSource('src/ui/hud.js', rawHud.replace("const el = h('div', { class: 'iw-lineup' },", "/* removed */")), /intro Splashtags presentation/);

  // Duplicate anchor in hud.js must throw
  const dupHud = rawHud.replace("const el = h('div', { class: 'iw-lineup' },", "const el = h('div', { class: 'iw-lineup' },\nconst el = h('div', { class: 'iw-lineup' },");
  assert.throws(() => adaptSource('src/ui/hud.js', dupHud), /intro Splashtags presentation/);

  // Missing anchor in menus.js must throw
  assert.throws(() => adaptSource('src/ui/menus.js', rawMenus.replace('const fnv = (str) => { let x = 2166136261;', '/* removed */')), /export fnv/);
});

test('#673: participant presentation metadata contract - provided title, ID, banner, and badge records survive into DOM for local and remote cards', () => {
  const composedHud = compose('src/ui/hud.js');
  const rig = createHudRig(composedHud);
  const roster = rig.make8Roster();

  // Attach metadata to local card (card 0)
  roster[0].title = 'Grand Champion';
  roster[0].tagNum = '#7777';
  roster[0].banner = 4;
  roster[0].badges = ['star', 'crown', 'mvp'];

  // Attach nested profile metadata to remote card (card 1)
  roster[1].profile = {
    title: 'Tidal Wave',
    tagNum: '1234',
    banner: 2,
    badges: [{ icon: 'squidlet' }, { id: 'turf' }],
  };

  // Attach custom SVG banner and custom SVG + text badges to remote card (card 4)
  roster[4].banner = '<svg class="custom-banner"></svg>';
  roster[4].badges = ['<svg class="custom-badge"></svg>', 'PRO'];

  const match = { actors: roster };
  rig.hud._lineup(match);

  const stags = rig.overLayer.querySelectorAll('.iw-stag');
  assert.equal(stags.length, 8, '8 Splashtags rendered');

  // Card 0 (local)
  const card0 = stags[0];
  assert.equal(card0.querySelector('.iw-stag__title').textContent, 'Grand Champion');
  assert.equal(card0.querySelector('.iw-stag__num').textContent, '#7777');
  assert.ok(card0.querySelector('.iw-stag__art').innerHTML.includes('data-seed="4"'));
  const badges0 = card0.querySelectorAll('.iw-stag__badge');
  assert.equal(badges0.length, 3, 'Card 0 renders 3 badges');
  assert.ok(badges0[0].innerHTML.includes('glyph-star'));
  assert.ok(badges0[1].innerHTML.includes('glyph-crown'));
  assert.ok(badges0[2].innerHTML.includes('icon-star'));

  // Card 1 (remote nested profile)
  const card1 = stags[1];
  assert.equal(card1.querySelector('.iw-stag__title').textContent, 'Tidal Wave');
  assert.equal(card1.querySelector('.iw-stag__num').textContent, '#1234', 'Formatted with leading #');
  assert.ok(card1.querySelector('.iw-stag__art').innerHTML.includes('data-seed="2"'));
  const badges1 = card1.querySelectorAll('.iw-stag__badge');
  assert.equal(badges1.length, 2, 'Card 1 renders 2 badges');
  assert.ok(badges1[0].innerHTML.includes('glyph-squidlet'));
  assert.ok(badges1[1].innerHTML.includes('icon-crown'));

  // Card 4 (custom SVG and text badge)
  const card4 = stags[4];
  assert.ok(card4.querySelector('.iw-stag__art').innerHTML.includes('custom-banner'));
  const badges4 = card4.querySelectorAll('.iw-stag__badge');
  assert.equal(badges4.length, 2, 'Card 4 renders 2 badges');
  assert.ok(badges4[0].innerHTML.includes('custom-badge'));
  assert.equal(badges4[1].textContent, 'PRO');
});

test('#673: absent participant metadata falls back to stable deterministic defaults without inventing badge IDs', () => {
  const composedHud = compose('src/ui/hud.js');
  const rig = createHudRig(composedHud);
  const match = { actors: rig.make8Roster() };
  rig.hud._lineup(match);

  const stags = rig.overLayer.querySelectorAll('.iw-stag');
  match.actors.forEach((a, i) => {
    const card = stags[i];
    assert.equal(card.querySelector('.iw-stag__title').textContent, rig.tagTitle(a.name));
    assert.equal(card.querySelector('.iw-stag__num').textContent, rig.tagNum(a.name));
    assert.ok(card.querySelector('.iw-stag__art').innerHTML.includes(`data-seed="${rig.fnv(a.name.toLowerCase())}"`));
    // Badge container exists but contains NO invented badge elements
    const badgesContainer = card.querySelector('.iw-stag__badges');
    assert.ok(badgesContainer, 'Badge slot container exists');
    assert.equal(card.querySelectorAll('.iw-stag__badge').length, 0, 'No fake badge IDs invented for offline/bot participants');
  });
});

test('#673: online Alpha and Bravo clients share identical identity order while _myTeam and local highlight differ', () => {
  const composedHud = compose('src/ui/hud.js');
  const rosterAlpha = [
    { name: 'Alpha1', team: 0, weaponId: 'shooter', isLocal: true },
    { name: 'Alpha2', team: 0, weaponId: 'roller', isLocal: false },
    { name: 'Alpha3', team: 0, weaponId: 'charger', isLocal: false },
    { name: 'Alpha4', team: 0, weaponId: 'dualies', isLocal: false },
    { name: 'Bravo1', team: 1, weaponId: 'shooter', isLocal: false },
    { name: 'Bravo2', team: 1, weaponId: 'roller', isLocal: false },
    { name: 'Bravo3', team: 1, weaponId: 'charger', isLocal: false },
    { name: 'Bravo4', team: 1, weaponId: 'dualies', isLocal: false },
  ];
  const rosterBravo = [
    { name: 'Alpha1', team: 0, weaponId: 'shooter', isLocal: false },
    { name: 'Alpha2', team: 0, weaponId: 'roller', isLocal: false },
    { name: 'Alpha3', team: 0, weaponId: 'charger', isLocal: false },
    { name: 'Alpha4', team: 0, weaponId: 'dualies', isLocal: false },
    { name: 'Bravo1', team: 1, weaponId: 'shooter', isLocal: true },
    { name: 'Bravo2', team: 1, weaponId: 'roller', isLocal: false },
    { name: 'Bravo3', team: 1, weaponId: 'charger', isLocal: false },
    { name: 'Bravo4', team: 1, weaponId: 'dualies', isLocal: false },
  ];

  const rigAlpha = createHudRig(composedHud, { myTeam: 0 });
  const rigBravo = createHudRig(composedHud, { myTeam: 1 });

  assert.equal(rigAlpha.hud._myTeam(), 0, 'Alpha client _myTeam is 0');
  assert.equal(rigBravo.hud._myTeam(), 1, 'Bravo client _myTeam is 1');

  rigAlpha.hud._lineup({ actors: rosterAlpha });
  rigBravo.hud._lineup({ actors: rosterBravo });

  const stagsAlpha = rigAlpha.overLayer.querySelectorAll('.iw-stag');
  const stagsBravo = rigBravo.overLayer.querySelectorAll('.iw-stag');
  assert.equal(stagsAlpha.length, 8);
  assert.equal(stagsBravo.length, 8);

  // Both clients see the EXACT same order of 8 participant identities
  for (let i = 0; i < 8; i++) {
    const nameA = stagsAlpha[i].querySelector('.iw-stag__name').textContent;
    const nameB = stagsBravo[i].querySelector('.iw-stag__name').textContent;
    assert.equal(nameA, nameB, `Participant at position ${i} has identical identity on both clients`);

    const titleA = stagsAlpha[i].querySelector('.iw-stag__title').textContent;
    const titleB = stagsBravo[i].querySelector('.iw-stag__title').textContent;
    assert.equal(titleA, titleB, `Title at position ${i} is identical`);

    const numA = stagsAlpha[i].querySelector('.iw-stag__num').textContent;
    const numB = stagsBravo[i].querySelector('.iw-stag__num').textContent;
    assert.equal(numA, numB, `Tag number at position ${i} is identical`);
  }

  // Alpha client highlights local player Alpha1 (index 0) with .is-self
  assert.ok(stagsAlpha[0].classList.contains('is-self'), 'Alpha client highlights Alpha1');
  assert.ok(!stagsAlpha[4].classList.contains('is-self'), 'Alpha client does not highlight Bravo1');

  // Bravo client highlights local player Bravo1 (index 4) with .is-self
  assert.ok(!stagsBravo[0].classList.contains('is-self'), 'Bravo client does not highlight Alpha1');
  assert.ok(stagsBravo[4].classList.contains('is-self'), 'Bravo client highlights Bravo1');
});

test('#673: lineup cleans up previous overlay and maintains exactly one intro overlay instance', () => {
  const composedHud = compose('src/ui/hud.js');
  const rig = createHudRig(composedHud);
  const match = { actors: rig.make8Roster() };

  // First call
  rig.hud._lineup(match);
  assert.equal(rig.overLayer.querySelectorAll('.iw-lineup').length, 1);

  // Second call replaces prior overlay cleanly
  rig.hud._lineup(match);
  assert.equal(rig.overLayer.querySelectorAll('.iw-lineup').length, 1, 'Only one overlay remains attached');

  // Timer removes the overlay after timeout
  assert.equal(rig.timers.length > 0, true);
  const cleanupTimer = rig.timers.filter((t) => t.ms === 3500).at(-1);
  assert.ok(cleanupTimer, 'Timer for 3500ms removal scheduled');
  cleanupTimer.fn();
  assert.equal(rig.overLayer.querySelectorAll('.iw-lineup').length, 0, 'Overlay removed after cleanup timer');
});

test('#673: badge and banner sanitization prevents script injection safely', () => {
  const composedHud = compose('src/ui/hud.js');
  const rig = createHudRig(composedHud);
  const roster = rig.make8Roster();

  roster[0].banner = '<svg><script>alert("xss")</script></svg>';
  roster[0].badges = ['<script>evil()</script>', '<svg onload="alert(1)"></svg>'];

  const match = { actors: roster };
  assert.doesNotThrow(() => rig.hud._lineup(match));

  const card = rig.overLayer.querySelectorAll('.iw-stag')[0];
  const artHtml = card.querySelector('.iw-stag__art').innerHTML;
  assert.ok(!artHtml.includes('<script>'), 'Script tag stripped from banner');
  assert.ok(artHtml.includes('data-seed='), 'Fell back to deterministic seed');

  const badges = card.querySelectorAll('.iw-stag__badge');
  assert.equal(badges.length, 0, 'Injected badges stripped and not rendered');
});

