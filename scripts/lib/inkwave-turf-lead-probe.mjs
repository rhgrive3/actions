import path from 'node:path';
import fs from 'node:fs';

export function inspectTurfLeadScene({name,pair,viewer}) {
  const G = globalThis.s3ProbeG, g = G.game, team = viewer;
  const local = g.match.actors.find(a => a.team === viewer && a.alive);
  if (!local) throw Error('Turf viewer fixture lacks an alive teammate');
  g.match.local = G.local = local;
  g.match.actors.forEach(a => a.isLocal = a === local);
  turfLeadProof.pair = team === 1 ? pair.slice().reverse() : pair;
  g._updateHud(0);
  g.R.render(); // frozen fixture: redraw after resize without a simulation tick
  const expected = name === 'ahead' ? [1,-1] : name === 'behind' ? [-1,1] : [0,0];
  const requireVisible = (style,label) => {
    if (style.display === 'none' || style.visibility !== 'visible' || !(Number(style.opacity) > 0)) throw Error('Turf '+label+' is not visibly presented');
  };
  const squads = g.hud.squads.map((el,i) => {
    for (let node = el; node; node = node.parentElement) requireVisible(getComputedStyle(node),'roster or ancestor');
    const style = getComputedStyle(el), alert = getComputedStyle(el,'::after'), box = el.getBoundingClientRect();
    const timer = g.hud.timer.getBoundingClientRect();
    const scale = style.transform === 'none' ? 1 : new DOMMatrixReadOnly(style.transform).a;
    const state = el.classList.contains('is-turf-leading') ? 1 : el.classList.contains('is-turf-danger') ? -1 : 0;
    if (state !== expected[i] || Math.abs(scale - (state === 1 ? 1.08 : 1)) > 1e-5) throw Error('Turf lead style mismatch');
    if ((alert.display !== 'none') !== (state === -1) || (state === -1 && !el.dataset.turfAlert)) throw Error('Turf Danger label mismatch');
    if (state === -1 && !alert.content.includes(el.dataset.turfAlert)) throw Error('Turf Danger generated content missing');
    if (!(box.right <= timer.left || box.left >= timer.right)) throw Error('Turf roster overlaps timer');
    if (state === -1) {
      requireVisible(alert,'Danger label');
      const alertTop = box.top + parseFloat(alert.top);
      const px = key => parseFloat(alert[key]) || 0;
      const matrix = alert.transform === 'none' ? {e:0,f:0} : new DOMMatrixReadOnly(alert.transform);
      const labelLeft = box.left + px('left') + matrix.e, labelTop = alertTop + matrix.f;
      const labelWidth = px('width') + (alert.boxSizing === 'border-box' ? 0 : px('paddingLeft') + px('paddingRight') + px('borderLeftWidth') + px('borderRightWidth'));
      const labelHeight = px('height') + (alert.boxSizing === 'border-box' ? 0 : px('paddingTop') + px('paddingBottom') + px('borderTopWidth') + px('borderBottomWidth'));
      if (!(labelWidth > 0 && labelHeight > 0 && labelLeft >= 0 && labelTop >= 0 && labelLeft + labelWidth <= innerWidth && labelTop + labelHeight <= innerHeight)) throw Error('Turf Danger bounds are not visible');
      for (const adornment of el.querySelectorAll('.is-self .iw-sq__you, .is-dead .iw-sq__n')) if (alertTop < adornment.getBoundingClientRect().bottom) throw Error('Turf Danger overlaps self/respawn adornment');
    }
    if (!(box.width > 0 && box.height > 0) || box.left < 0 || box.right > innerWidth || box.top < 0 || box.bottom > innerHeight || el.children.length !== 4) throw Error('Turf roster bounds/slot count changed');
    return {state,scale,label:el.dataset.turfAlert,alertDisplay:alert.display,box:{x:box.x,y:box.y,width:box.width,height:box.height}};
  });
  return {name,viewport:[innerWidth,innerHeight],physicalLocalTeam:team,squads};
}

// Controlled presentation snapshots on the loaded Main, Match, HUD, CSS and
// i18n. Coverage/viewer/finish state are restored; ownership cells, input and
// simulation time are never changed.
export async function probeTurfLead(page, evidence) {
  const viewport = page.viewportSize(), rows = [];
  let phase = {name:'setup'};
  await page.evaluate(() => {
    const G = globalThis.s3ProbeG, g = G.game;
    if (g.match.mode !== 'turf' || g.match.state !== 'playing' || !g.frozen) throw Error('Turf probe requires the frozen live UI fixture');
    const descriptor = Object.getOwnPropertyDescriptor(G.paint, 'coverage');
    const local = g.match.local, globalLocal = G.local, flags = g.match.actors.map(a => a.isLocal), state = g.match.state;
    globalThis.turfLeadProof = { pair: [0.4, 0.4], restore() {
      g.match.local = local; G.local = globalLocal; g.match.state = state;
      g.match.actors.forEach((a,i) => a.isLocal = flags[i]);
      if (descriptor) Object.defineProperty(G.paint, 'coverage', descriptor);
      else delete G.paint.coverage;
      g._updateHud(0);
    } };
    G.paint.coverage = () => turfLeadProof.pair;
  });
  try {
    for (const viewer of [0,1]) for (const size of [{width:1280,height:800}, {width:375,height:812}]) {
      await page.setViewportSize(size);
      for (const [name, pair] of [['ahead',[0.6,0.2]], ['behind',[0.2,0.6]], ['below',[0.29,0.2]], ['tie',[0.4,0.4]]]) {
        phase = {viewer,viewport:size,name};
        const row = await page.evaluate(inspectTurfLeadScene, {name,pair,viewer});
        rows.push(row);
        if (name === 'ahead' || name === 'behind') await page.screenshot({path:path.join(evidence,`turf-lead-team${viewer}-${size.width}-${name}.png`),animations:'disabled',timeout:90000});
      }
    }
    phase = {name:'finish-and-range-boundaries'};
    const boundaries = await page.evaluate(() => {
      const G = globalThis.s3ProbeG, g = G.game, state = g.match.state, wasRange = g.hud.el.classList.contains('iw-hud--range');
      try {
        turfLeadProof.pair = [.6,.2]; g._updateHud(0);
        g.hud.el.classList.add('iw-hud--range');
        if (getComputedStyle(g.hud.top).display !== 'none') throw Error('Range combat-bar suppression changed');
        if (!wasRange) g.hud.el.classList.remove('iw-hud--range');
        g.match.state = 'finish'; g._updateHud(0);
        if (g.hud.squads.some(el => el.classList.contains('is-turf-leading') || el.classList.contains('is-turf-danger') || el.dataset.turfAlert)) throw Error('Finish snapshot retained Turf lead');
        return {rangeClassSuppressesCombatBar:true,finishSnapshotClears:true};
      } finally {g.match.state = state;g.hud.el.classList.toggle('iw-hud--range',wasRange);}
    });
    return {boundaries,fixture:'loaded Main -> Match -> HUD; controlled coverage/viewer/finish snapshots; Chromium computed style and PNG',rows};
  } catch (error) {
    const diagnostic = {phase,rows,error:error.message};
    try { await page.screenshot({path:path.join(evidence,'turf-lead-failure.png'),animations:'disabled',timeout:90000}); diagnostic.screenshot = 'turf-lead-failure.png'; }
    catch (captureError) { diagnostic.screenshotError = captureError.message; }
    try { fs.writeFileSync(path.join(evidence,'turf-lead-failure.json'),JSON.stringify(diagnostic,null,2)); }
    catch (writeError) { console.error('Turf failure diagnostic write failed: '+writeError.message); }
    throw error;
  } finally {
    try { await page.evaluate(() => { try { turfLeadProof.restore(); } finally { delete globalThis.turfLeadProof; } }); }
    finally { await page.setViewportSize(viewport); }
  }
}
