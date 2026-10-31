#!/usr/bin/env node
// Reproducible documentation only: exact runtime additions, actual material
// usage/render bounds, same-scale plans and analytic construction sections.
// node --experimental-vm-modules scripts/document-map3-art.mjs [--verify]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url)), source = path.join(root, 'inkwave-public');
const output = path.join(root, 'docs/stage-redesign/map3'), context = vm.createContext({ console }), cache = new Map();
const artPath = path.join(source, 'src/world/stages/map3-art.js');
const artSource = fs.readFileSync(artPath, 'utf8');
function load(file) {
  if (cache.has(file)) return cache.get(file);
  let code = fs.readFileSync(file, 'utf8');
  if (file === artPath) {
    // Build-only instrumentation records the actual add() calls. This avoids
    // maintaining a second guessed table of each shape's material/color.
    const anchor = 'if (this.owner) { g.computeBoundingBox();';
    assert.equal(code.split(anchor).length, 2, 'Art instrumentation anchor changed');
    code = code.replace(anchor, `if (this.owner) {
      const key = material + ':' + c.getHexString();
      const styles = this.owner.styles || (this.owner.styles = new Map());
      const style = styles.get(key) || { material, color: '#' + c.getHexString(), geometryTypes: new Set(), calls: 0 };
      style.geometryTypes.add(geometry.type); style.calls++; styles.set(key, style);
      g.computeBoundingBox();`);
    const record = 'parts: r.parts }))';
    assert.equal(code.split(record).length, 2, 'Art record instrumentation anchor changed');
    code = code.replace(record, `parts: r.parts, styles: Array.from(r.styles?.values() || [], v => ({...v, geometryTypes: [...v.geometryTypes].sort()})) }))`);
  }
  const m = new vm.SourceTextModule(code, { context, identifier: file }); cache.set(file, m); return m;
}
const entry = new vm.SourceTextModule(`export * as THREE from 'three'; export * from './src/world/stages/map3-art.js'; export * from './src/world/stages/map3-layout.js';`, { context, identifier: path.join(source, 'map3-art-documentation-entry.js') });
await entry.link((s, m) => load(s === 'three' ? path.join(source, 'vendor/three/build/three.module.js') : s.startsWith('three/addons/') ? path.join(source, 'vendor/three/jsm', s.slice('three/addons/'.length)) : path.resolve(path.dirname(m.identifier), s)));
await entry.evaluate();
const { THREE, MAP3_LAYOUTS, MAP3_ART_PALETTES, MAP3_ART_SKIN_EPSILON, map3ArtAssemblies, map3ArtColliders, createMap3Art } = entry.namespace;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const clone = v => JSON.parse(JSON.stringify(v));
function union(records) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const r of records) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], r.min[k]); max[k] = Math.max(max[k], r.max[k]); }
  return { min, max };
}
function footprint(c) {
  if (!c.obox) return [[c.min[0], c.min[2]], [c.max[0], c.min[2]], [c.max[0], c.max[2]], [c.min[0], c.max[2]]];
  const angle = c.rotY * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
    const x = sx * c.size[0] / 2, z = sz * c.size[2] / 2;
    return [c.center[0] + x * cos + z * sin, c.center[2] - x * sin + z * cos];
  });
}
const report = {
  schema: 1, units: 'WU (world units); no SI calibration', axes: { up: '+Y', planHorizontal: '+X right', planVertical: '+Z down', teamA: '-Z', teamB: '+Z' },
  provenance: { runtimeSource: 'inkwave-public/src/world/stages/map3-art.js', sha256: hash(artSource), stageDataSource: 'inkwave-public/src/world/stages/map3-data.js', stageDataSha256: hash(fs.readFileSync(path.join(source, 'src/world/stages/map3-data.js'))), generator: 'scripts/document-map3-art.mjs' },
  scope: 'Exact final added collider definitions plus runtime assembly descriptors and measured rendered bounds. Base floor/ramp/obstacle design remains frozen in design.json. Exterior scenery and mounted skins are recorded as visual regions, not added collision.',
  tolerances: { mountedSkinReliefWU: MAP3_ART_SKIN_EPSILON, undersideMaterialReliefWU: 0.005 }, stages: {},
};
for (const id of ['tidewater', 'kelpline']) {
  const layout = MAP3_LAYOUTS[id], art = createMap3Art(new THREE.Scene(), { layout });
  const regions = clone(art.group.userData.map3Art.records), byId = new Map(regions.map(r => [r.id, r]));
  const colliders = map3ArtColliders(layout).map(c => ({
    id: c.map3ArtSupport, owner: c.map3ArtOwner || `${c.map3ArtSupport[0]}_market_hall`, family: c.map3ArtKind || 'market-pier',
    definition: clone(c), flags: { solid: true, paint: false, hidden: true, roof: !!c.roof, rail: !!c.rail, grate: !!c.rail, obox: !!c.obox, perch: false },
    footprintXZ: footprint(c),
  }));
  const assemblies = map3ArtAssemblies(layout).map(a => {
    const sourceRecord = a.source || layout.map3.floors.find(f => f.id === a.owner) || null;
    const parts = a.parts.map((p, i) => {
      const record = byId.get(`${a.id}:${i}`); assert.ok(record, `${a.id}:${i}`);
      return { id: `${a.id}:${i}`, descriptor: clone(p), renderedBounds: { min: record.min, max: record.max }, styles: record.styles };
    });
    return { id: a.id, owner: a.owner, family: a.family, sourceRecord: clone(sourceRecord), colliderBounds: union(a.parts), renderedBounds: union(parts.map(p => p.renderedBounds)), parts };
  });
  const materials = art.group.children.map(mesh => ({
    id: mesh.name.split(':').at(-1), type: mesh.material.type, vertexColors: mesh.material.vertexColors,
    baseColor: '#' + mesh.material.color.getHexString(), roughness: mesh.material.roughness ?? null, metalness: mesh.material.metalness ?? null,
    opacity: mesh.material.opacity, transparent: mesh.material.transparent, depthWrite: mesh.material.depthWrite,
    side: mesh.material.side === THREE.DoubleSide ? 'double' : 'front', texture: mesh.material.map?.name || null,
  }));
  const standaloneStructures = colliders.filter(c => c.family === 'market-pier').map(c => ({ id: c.id, owner: c.owner, sourceRecord: clone(layout.map3.floors.find(f => f.id === c.owner)), colliderBounds: { min: c.definition.min, max: c.definition.max }, renderedBounds: { min: byId.get(c.id).min, max: byId.get(c.id).max }, styles: byId.get(c.id).styles }));
  report.stages[id] = { name: layout.map3.name, bounds: clone(layout.bounds), waterY: layout.map3.waterY, palette: clone(MAP3_ART_PALETTES[id]), materials, stats: clone(art.stats), addedColliderCount: colliders.length, colliders, assemblies, standaloneStructures, visualRegions: regions };
  art.dispose();
}

const tideBridge = report.stages.tidewater.assemblies.find(a => a.id === 'A_market_bridge:tied-arches');
const kelpPortal = report.stages.kelpline.assemblies.find(a => a.id === 'central-transfer-portals');
const primaryBeam = kelpPortal.parts.find(p => p.descriptor.kind === 'portal-beam').descriptor;
report.sectionFacts = {
  tidewater: { floorId: 'A_market_bridge', sectionZ: -5.7, deckY: tideBridge.sourceRecord.y, undersideY: tideBridge.sourceRecord.bottom, lowerRouteY: 0, crownCenterlineY: Math.max(...tideBridge.parts.flatMap(p => [p.descriptor.a0[1], p.descriptor.a1[1]])), colliderCrownY: tideBridge.colliderBounds.max[1] },
  kelpline: { floorIds: ['central_west', 'central_solid', 'central_east'], sectionStartXZ: [primaryBeam.a0[0], primaryBeam.a0[2]], sectionEndXZ: [primaryBeam.a1[0], primaryBeam.a1[2]], deckY: MAP3_LAYOUTS.kelpline.map3.floors.find(f => f.id === 'central_solid').y, undersideY: MAP3_LAYOUTS.kelpline.map3.floors.find(f => f.id === 'central_solid').bottom, lowerRouteY: 0, beamBottomY: primaryBeam.min[1], beamTopY: primaryBeam.max[1] },
};
report.sectionFacts.kelpline.clearanceAboveDeck = report.sectionFacts.kelpline.beamBottomY - report.sectionFacts.kelpline.deckY;
assert.ok(Math.abs(report.sectionFacts.tidewater.crownCenterlineY - 7.8) < 1e-10, 'Update section labels after geometry changes');
assert.ok(Math.abs(report.sectionFacts.kelpline.beamBottomY - 12.76) < 1e-10, 'Update section labels after geometry changes');
assert.ok(Math.abs(report.sectionFacts.kelpline.beamTopY - 13.24) < 1e-10, 'Update section labels after geometry changes');

const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const n = v => Number(v.toFixed(3));
const text = (x, y, s, css = '', anchor = 'start') => `<text x="${n(x)}" y="${n(y)}" text-anchor="${anchor}"${css ? ` class="${css}"` : ''}>${esc(s)}</text>`;
const line = (x1, y1, x2, y2, style = '') => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${style}/>`;
const rect = (x, y, w, h, style = '') => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" ${style}/>`;
const colors = { cover: '#cc7b2d', rail: '#22826b', bridge: '#8258a7', portal: '#365f9e', pier: '#53646b' };
const familyColor = c => c.family === 'market-pier' ? colors.pier : c.family === 'market-bridge' ? colors.bridge : c.family === 'terminal-portal' ? colors.portal : c.flags.rail ? colors.rail : colors.cover;
function svgStart(w, h, title, desc) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><title>${esc(title)}</title><desc>${esc(desc)}</desc><style>text{font-family:Arial,Helvetica,sans-serif;fill:#20333c;font-size:12px}.title{font-size:23px;font-weight:700}.subtitle{font-size:13px;fill:#52666d}.stage{font-size:19px;font-weight:700}.small{font-size:10px;fill:#52666d}.note{font-size:11px;fill:#52666d}.label{font-size:12px;font-weight:700}</style>${rect(0, 0, w, h, 'fill="#fbfcfa"')}`;
}
function planSvg() {
  const scale = 4, top = 149, panelX = [90, 590], width = 1090, height = 953;
  let svg = svgStart(width, height, 'MAP3 — exact added collision footprints', 'Two stages at the same 4 pixels per world unit. Light outlines show original decks and ramps; colors show all added collider projections, including overhead members. Rotated portal boxes use their actual oriented footprint.');
  svg += text(46, 39, 'MAP3 — added collision / deck plan', 'title');
  svg += text(46, 65, 'Same scale: 4 px / WU. Both panels use X −48…48, Z −76…76. +Z points down.', 'subtitle');
  svg += text(46, 87, 'Colored footprints include overhead structures; overlap in this plan does not mean a blocked route at deck height.', 'subtitle');
  for (const [index, id] of ['tidewater', 'kelpline'].entries()) {
    const stage = report.stages[id], data = MAP3_LAYOUTS[id].map3, px = panelX[index], X = x => px + (x + 48) * scale, Z = z => top + (z + 76) * scale;
    svg += text(px, 119, stage.name, 'stage'); svg += text(px, 137, `${stage.addedColliderCount} added parts · all nonpaintable · exact definitions in JSON`, 'small');
    svg += rect(px, top, 96 * scale, 152 * scale, 'fill="#eaf3f6" stroke="#becdd0"');
    for (const x of [-40, -20, 0, 20, 40]) { svg += line(X(x), Z(-76), X(x), Z(76), 'stroke="#d4e1e4" stroke-width="0.6"'); svg += text(X(x), top + 625, x, 'small', 'middle'); }
    for (const z of [-72, -48, -24, 0, 24, 48, 72]) { svg += line(X(-48), Z(z), X(48), Z(z), 'stroke="#d4e1e4" stroke-width="0.6"'); svg += text(px - 9, Z(z) + 3, z, 'small', 'end'); }
    const b = stage.bounds;
    svg += rect(X(b.minX), Z(b.minZ), (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale, 'fill="none" stroke="#81979e" stroke-dasharray="5 4" stroke-width="0.8"');
    for (const f of [...data.floors].sort((a, b) => a.y - b.y)) {
      svg += `<g><title>${esc(`${f.id}: top ${f.y}, bottom ${f.bottom} WU`)}</title>${rect(X(f.rect[0]), Z(f.rect[2]), (f.rect[1] - f.rect[0]) * scale, (f.rect[3] - f.rect[2]) * scale, `fill="#f9faf6" fill-opacity="0.75" stroke="#a6b1b1" stroke-width="0.8" ${f.material === 'grate' ? 'stroke-dasharray="2 2"' : ''}`)}</g>`;
    }
    for (const r of data.ramps) svg += `<g><title>${esc(`${r.id}: ${r.y0} → ${r.y1} WU`)}</title>${rect(X(r.rect[0]), Z(r.rect[2]), (r.rect[1] - r.rect[0]) * scale, (r.rect[3] - r.rect[2]) * scale, 'fill="#d9dfd9" fill-opacity="0.55" stroke="#9caaa8" stroke-width="0.55"')}</g>`;
    // Re-stroke every original deck outline after the fills so an upper slab
    // does not erase the projected outline of a real lower route.
    for (const f of data.floors) svg += rect(X(f.rect[0]), Z(f.rect[2]), (f.rect[1] - f.rect[0]) * scale, (f.rect[3] - f.rect[2]) * scale, `fill="none" stroke="#8f9d9d" stroke-opacity="0.75" stroke-width="0.65" ${f.material === 'grate' ? 'stroke-dasharray="2 2"' : ''}`);
    for (const o of data.obstacles) svg += rect(X(o.rect[0]), Z(o.rect[2]), (o.rect[1] - o.rect[0]) * scale, (o.rect[3] - o.rect[2]) * scale, 'fill="#b8c0bc" stroke="#737f7b" stroke-width="0.6"');
    for (const c of stage.colliders) {
      const points = c.footprintXZ.map(([x, z]) => `${n(X(x))},${n(Z(z))}`).join(' '), color = familyColor(c), d = c.definition;
      svg += `<polygon points="${points}" fill="${color}" fill-opacity="0.50" stroke="${color}" stroke-width="0.55"${c.flags.rail ? ' stroke-dasharray="1.4 1"' : ''}><title>${esc(`${c.id}; Y ${d.min[1]}…${d.max[1]}; roof=${c.flags.roof}; rail=${c.flags.rail}; OBB=${c.flags.obox}`)}</title></polygon>`;
    }
    svg += text(X(0), Z(-69), 'A', 'label', 'middle') + text(X(0), Z(69), 'B', 'label', 'middle');
    svg += text(px + 192, top + 647, 'X / WU', 'small', 'middle'); svg += text(px - 31, top - 8, 'Z', 'small');
  }
  const legend = [['Original deck / ramp', '#f9faf6'], ['Existing cover', '#b8c0bc'], ['Cover crowns / roofs', colors.cover], ['Rail-only members', colors.rail], ['Market bridge ribs', colors.bridge], ['Terminal portals', colors.portal], ['Market piers', colors.pier]];
  legend.forEach(([label, color], i) => { const x = 46 + (i % 4) * 258, y = 836 + Math.floor(i / 4) * 25; svg += rect(x, y - 11, 15, 12, `fill="${color}" stroke="#75858a" stroke-width="0.6"`) + text(x + 23, y, label, 'note'); });
  svg += line(46, 898, 126, 898, 'stroke="#20333c" stroke-width="2"') + line(46, 894, 46, 902, 'stroke="#20333c"') + line(126, 894, 126, 902, 'stroke="#20333c"') + text(138, 902, '20 WU', 'note');
  svg += text(46, 929, 'Exterior quays and mounted face details have no additional collision and are intentionally omitted from this collision plan.', 'note');
  return svg + '</svg>\n';
}
function sectionSvg() {
  const scale = 18, baseY = 400, Y = y => baseY - y * scale, X0 = x => 70 + (x + 25) * scale, X1 = s => 572 + (s + 1.2) * scale;
  let svg = svgStart(1120, 585, 'MAP3 — bridge construction sections', 'Analytic sections through Tidewater market arch and along one Kelpline skew portal beam. Both use 18 pixels per world unit horizontally and vertically. Collision boxes are shown in pale tint; the arch centerline and portal beam faces are explicitly distinguished.');
  svg += text(38, 37, 'MAP3 — bridge sections from final runtime parts', 'title');
  svg += text(38, 62, 'Both sections: 18 px / WU in each axis. Thin tinted areas show conservative collision envelopes.', 'subtitle');
  svg += text(38, 96, 'Tidewater · A market bridge', 'stage') + text(38, 116, 'Section at Z = −5.7; horizontal coordinate is world X.', 'small');
  svg += text(590, 96, 'Kelpline · primary skew portal', 'stage') + text(590, 116, 'Along beam (−11.6, −5.4) → (10.4, 8.6) in XZ; distance s.', 'small');
  for (const y of [0, 3.6, 4.8, 7.8, 12.76]) {
    svg += line(54, Y(y), 471, Y(y), 'stroke="#e1e6e3" stroke-width="0.8"') + line(578, Y(y), 1090, Y(y), 'stroke="#e1e6e3" stroke-width="0.8"');
  }
  // Original lower floor and exact bridge slab.
  svg += rect(X0(-25), Y(0), 18 * scale, 4 * scale, 'fill="#e4e8e0" stroke="#9caaa4"');
  svg += rect(X0(-24), Y(4.8), 16 * scale, 0.6 * scale, 'fill="#cad4cc" stroke="#647d73"');
  const td = MAP3_LAYOUTS.tidewater.map3, tc = td.obstacles.find(o => o.id === 'A_bridge_cover');
  svg += rect(X0(tc.rect[0]), Y(tc.y1), (tc.rect[1] - tc.rect[0]) * scale, (tc.y1 - tc.y0) * scale, 'fill="#e0d6c4" stroke="#a99b7c"');
  const ta = report.stages.tidewater.assemblies.find(a => a.id === 'A_market_bridge:tied-arches');
  const atZ = ta.parts.filter(p => p.descriptor.min[2] <= -5.7 && p.descriptor.max[2] >= -5.7);
  for (const { descriptor: p } of atZ) {
    svg += rect(X0(p.min[0]), Y(p.max[1]), (p.max[0] - p.min[0]) * scale, (p.max[1] - p.min[1]) * scale, 'fill="#a287b7" fill-opacity="0.28" stroke="#8258a7" stroke-width="0.45"');
    if (p.a0) svg += line(X0(p.a0[0]), Y(p.a0[1]), X0(p.a1[0]), Y(p.a1[1]), `stroke="${p.kind === 'post' ? '#435b5b' : '#437e70'}" stroke-width="${p.kind === 'post' ? 2.5 : p.rail ? 0.9 : 2}"`);
  }
  svg += text(54, Y(7.8) - 23, 'Crown centerline Y 7.8', 'label') + line(208, Y(7.8) - 20, X0(-16), Y(7.8), 'stroke="#437e70"');
  svg += text(54, Y(7.8) - 8, 'Collision envelope reaches Y 7.875', 'small');
  svg += text(54, Y(4.8) - 35, 'Deck Y 4.8', 'label');
  svg += text(54, Y(4.2) + 17, 'Underside Y 4.2', 'small');
  svg += text(54, Y(0) - 10, 'Lower route Y 0', 'label');
  svg += text(X0(-16), Y(2.0), '4.2 WU structural underpass', 'small', 'middle');
  svg += text(X0(-16), Y(4.8) - 39, '3.0 WU rise above deck', 'small', 'middle');
  for (const x of [-24, -20, -16, -12, -8]) svg += text(X0(x), 493, x, 'small', 'middle');
  svg += text(220, 515, 'World X / WU', 'small', 'middle');
  // Kelpline section follows the actual local long axis of the first OBB beam.
  const ka = report.stages.kelpline.assemblies.find(a => a.id === 'central-transfer-portals');
  const beam = ka.parts.find(p => p.descriptor.kind === 'portal-beam').descriptor;
  const length = beam.obb.size[2], direction = [(beam.a1[0] - beam.a0[0]) / length, (beam.a1[2] - beam.a0[2]) / length];
  function interval(rect) {
    let lo = -Infinity, hi = Infinity;
    for (const [origin, d, min, max] of [[beam.a0[0], direction[0], rect[0], rect[1]], [beam.a0[2], direction[1], rect[2], rect[3]]]) {
      let a = (min - origin) / d, b = (max - origin) / d; if (a > b) [a, b] = [b, a]; lo = Math.max(lo, a); hi = Math.min(hi, b);
    }
    return [lo, hi];
  }
  svg += rect(X1(-1), Y(0), (length + 2) * scale, 4 * scale, 'fill="#e4e8e0" stroke="#9caaa4"');
  const [lo, hi] = interval([-12, 12, -10, 10]);
  svg += rect(X1(lo), Y(3.6), (hi - lo) * scale, 0.6 * scale, 'fill="#cad4cc" stroke="#647d73"');
  for (const name of ['A_bridge_edge', 'B_bridge_edge']) {
    const o = MAP3_LAYOUTS.kelpline.map3.obstacles.find(o => o.id === name), [left, right] = interval(o.rect);
    svg += rect(X1(left), Y(o.y1), (right - left) * scale, (o.y1 - o.y0) * scale, 'fill="#e0d6c4" stroke="#a99b7c"');
  }
  for (const [i, s] of [[0, 0], [1, length]]) {
    const p = ka.parts[i].descriptor;
    svg += rect(X1(s - p.size[0] / 2), Y(p.max[1]), p.size[0] * scale, (p.max[1] - p.min[1]) * scale, 'fill="#344e5c" stroke="#344e5c"');
  }
  svg += rect(X1(0), Y(13.24), length * scale, 0.48 * scale, 'fill="#5e8586" stroke="#344e5c"');
  svg += text(608, 143, 'Beam top Y 13.24', 'label') + text(608, 160, 'Beam lower face Y 12.76', 'label');
  svg += line(823, 158, X1(length * 0.55), Y(12.76), 'stroke="#365f9e" stroke-width="0.8"');
  svg += text(X1(length / 2), Y(8.2), '9.16 WU clear above upper deck', 'label', 'middle');
  svg += text(715, Y(3.6) - 13, 'Upper deck Y 3.6', 'label');
  svg += text(595, Y(3.0) + 18, 'Underside Y 3.0', 'small');
  svg += text(595, Y(0) - 10, 'Lower route Y 0', 'label');
  for (const s of [0, 5, 10, 15, 20, 25]) svg += text(X1(s), 493, s, 'small', 'middle');
  svg += text(820, 515, 'Distance along actual beam / WU', 'small', 'middle');
  svg += text(38, 548, 'Original slab thickness is 0.6 WU. Underside material relief ≤0.005 WU is not enlarged here. Bases are shown down to Y −4.', 'note');
  svg += text(38, 569, 'These sections document geometry and clearance; full Actor, camera and ranked tower checks are recorded separately in runtime verification.', 'note');
  return svg + '</svg>\n';
}
const outputs = {
  'runtime-art-coordinates.json': JSON.stringify(report) + '\n',
  'runtime-art-plan.svg': planSvg(),
  'runtime-art-sections.svg': sectionSvg(),
};
for (const [name, content] of Object.entries(outputs)) {
  const file = path.join(output, name);
  if (process.argv.includes('--verify')) assert.equal(fs.readFileSync(file, 'utf8'), content, `Stale documentation: ${name}`);
  else fs.writeFileSync(file, content);
  console.log(`${process.argv.includes('--verify') ? 'Verified' : 'Wrote'} ${name}: ${Buffer.byteLength(content)} bytes`);
}
