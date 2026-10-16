// Additive surface treatment of freshly-built procedural base models only.
// No shared materials, team-ink geometry, sockets or gameplay values are edited.
import { THREE, Pieces, M, box, sphere, zcyl, ring, part, slab, emptyGeometry, pipe } from './kit.mjs';

export function recolor(g, map, filter = null) {
  if (!g?.attributes.color) return 0;
  const colors = g.attributes.color.clone(), pos = g.attributes.position;
  const pairs = Object.entries(map).map(([a, b]) => [new THREE.Color(a), new THREE.Color(b)]);
  let changed = 0;
  for (let i = 0; i < colors.count; i++) {
    if (filter && !filter(pos.getX(i), pos.getY(i), pos.getZ(i))) continue;
    for (const [a, b] of pairs) if (Math.abs(colors.getX(i) - a.r) < 1e-6 && Math.abs(colors.getY(i) - a.g) < 1e-6 && Math.abs(colors.getZ(i) - a.b) < 1e-6) {
      colors.setXYZ(i, b.r, b.g, b.b); changed++; break;
    }
  }
  g.setAttribute('color', colors); return changed;
}
export function fixedSurfaces(d, map) {
  recolor(d.body, map);
  for (const p of Object.values(d.parts || {})) if (p.mat === 'body' && !p.hidden) recolor(p.src, map);
}
function append(d, channel, pieces) {
  if (pieces.empty) return;
  const target = channel === 'body' ? d : d.parts[channel], key = channel === 'body' ? 'body' : 'src';
  const old = target[key]; pieces.list.unshift(old); target[key] = pieces.build();
}
// Rhinestone arrow rows, individually raised; coordinates use the current base barrel.
export function stones(d) {
  const p = new Pieces(), z0 = d.muzzle.z - .105, y0 = d.muzzle.y;
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) for (const sign of [-1, 1]) {
    p.add(sphere(.0035, .0035, .0035, side * .035, y0 + sign * (4 - i) * .007, z0 + i * .011, 6, 4), i % 2 ? '#f4f1ef' : '#f26da9', M.gloss);
  }
  append(d, 'body', p);
}
// Gravity-only existing decoration mounted to the native can; no new geometry.
export function gravityStones(d) {
  const p = new Pieces(), z0 = d.parts.can.pivot.z - .022, y0 = d.parts.can.pivot.y;
  const sideCenters = [0.04375657445925615, 0.036440905776610674, 0.0395522617772004, 0.042127325344592174, 0.05257580174927114];
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) for (const sign of [-1, 1]) {
    p.add(sphere(.0035, .0035, .0035, side * sideCenters[i], y0 + sign * (4 - i) * .007, z0 + i * .011, 6, 4), i % 2 ? '#f4f1ef' : '#f26da9', M.gloss);
  }
  d.parts.variantCharm = part(p.build(), d.parts.can.pivot, 'body');
}
// Heavy-only relocation of the same20 stones into the existing can label part.
// Native Heavy animate already follows can; no extra mesh or animation callback.
export function heavyStones(d) {
  const p = new Pieces(), z0 = d.parts.can.pivot.z - .022, y0 = d.parts.can.pivot.y;
  const sideCenters = [0.04733516539322082, 0.049717948492180586, 0.052117270456055485, 0.053941942944893795, 0.060007144597114065];
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) for (const sign of [-1, 1]) {
    p.add(sphere(.0035, .0035, .0035, side * sideCenters[i], y0 + sign * (4 - i) * .007, z0 + i * .011, 6, 4), i % 2 ? '#f4f1ef' : '#f26da9', M.gloss);
  }
  append(d, 'canLabel', p);
}
// Move only explicitly sourced triangles from team-ink shading to a fixed
// surface. No coincident cover, position changes or shared-material mutation.
// The caller gives a triangle predicate so a partial partition cannot cut faces.
export function partitionInk(d, source, color, material = M.gloss, select = () => true) {
  const original = source === 'ink' ? d.ink : d.parts[source]?.src;
  if (!original?.index) throw new Error(`Missing indexed ink source ${source}`);
  if (source !== 'ink' && d.parts[source].mat !== 'ink') throw new Error(`Not an ink channel: ${source}`);
  const fixed = [], keep = [], pos = original.attributes.position, ix = original.index.array;
  for (let i = 0; i < ix.length; i += 3) {
    const face = [ix[i], ix[i + 1], ix[i + 2]];
    const chosen = select(face, pos);
    (chosen ? fixed : keep).push(...face);
  }
  if (!fixed.length) throw new Error(`Empty fixed ink partition: ${source}`);
  const fixedGeo = original.clone(); fixedGeo.setIndex(fixed);
  const colors = fixedGeo.attributes.color.clone(), mats = fixedGeo.attributes.aMat.clone(), tint = new THREE.Color(color);
  for (let i = 0; i < colors.count; i++) { colors.setXYZ(i, tint.r, tint.g, tint.b); mats.setX(i, material); }
  fixedGeo.setAttribute('color', colors); fixedGeo.setAttribute('aMat', mats);
  const remaining = keep.length ? original.clone().setIndex(keep) : emptyGeometry();
  if (source === 'ink') {
    d.ink = remaining;
    const pieces = new Pieces(); pieces.list.push(fixedGeo); append(d, 'body', pieces);
  } else {
    d.parts[source].src = remaining;
    d.parts.variantSkin = part(fixedGeo, d.parts[source].pivot, 'body');
  }
  original.dispose();
  (d.variantFixedInk ||= []).push({ source, target: source === 'ink' ? 'body' : 'variantSkin', triangleCount: fixed.length / 3, color, material });
}
export function fixedCanSurface(d, source, color, material = M.gloss) {
  partitionInk(d, source, color, material);
}
const CAN_FOLLOWERS = Object.freeze(['variantSkin', 'variantCharm']);
export function canAccessoryAnimation(baseAnimate) {
  return (w, st) => {
    baseAnimate?.(w, st);
    const source = w.parts?.can;
    if (!source) return;
    for (const key of CAN_FOLLOWERS) {
      const skin = w.parts[key];
      if (skin) { skin.position.copy(source.position); skin.quaternion.copy(source.quaternion); skin.scale.copy(source.scale); skin.visible = source.visible; }
    }
  };
}
export function lamp(d) {
  d.body.computeBoundingBox(); const b = d.body.boundingBox, y = b.max.y + .012, z = (b.min.z + b.max.z) * .35;
  const p = new Pieces();
  p.add(box(.024, .014, .022, 0, y - .014, z), '#493a28', M.satin);
  p.add(zcyl(.014, z - .018, z + .018, 0, y, 12), '#463d2f', M.metal);
  p.add(zcyl(.010, z + .018, z + .019, 0, y, 12), '#e9dfbe', M.lens);
  append(d, 'body', p);
}
export function glowSticks(d) {
  const p = new Pieces();
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3, x = Math.cos(a) * .031, y = d.muzzle.y + Math.sin(a) * .031;
    p.add(zcyl(.003, d.muzzle.z - .034, d.muzzle.z - .005, x, y, 8), ['#ed3861','#49d464','#478ce8'][i], M.gloss);
  }
  append(d, 'body', p);
}
export function greenFoil(d) {
  const p = d.parts.can; if (!p || p.mat !== 'body') return;
  recolor(p.src, {'#ececea':'#369777'}, (_x, _y, z) => Math.floor(z / .028) % 2 === 0);
}
// Deliberately not retail decals or text: no invented brand glyphs are generated.
export function paintPattern(d, from, tones, kind = 'scales') {
  const allowed = from.map(x => new THREE.Color(x)), shades = tones.map(x=>new THREE.Color(x));
  for (const [name,g] of [['body',d.body],...Object.entries(d.parts).filter(([,p])=>p.mat==='body'&&!p.hidden).map(([n,p])=>[n,p.src])]) {
    const c=g.attributes.color.clone(),p=g.attributes.position;
    for(let i=0;i<c.count;i++)if(allowed.some(a=>Math.abs(c.getX(i)-a.r)<1e-6&&Math.abs(c.getY(i)-a.g)<1e-6&&Math.abs(c.getZ(i)-a.b)<1e-6)) {
      const y=p.getY(i),z=p.getZ(i),x=p.getX(i);
      const v=kind==='spots'?Math.sin(z*139)*Math.cos(y*151+x*37):Math.cos(z*180+Math.sin(y*180)*.8)*Math.cos(y*180);
      const col=shades[v>.35?1:0];c.setXYZ(i,col.r,col.g,col.b);
    }
    g.setAttribute('color',c);
  }
}
export function colorRing(d, z = d.muzzle.z - .045, radius = .03, y = d.muzzle.y) {
  const p=new Pieces();
  for(let i=0;i<3;i++)p.add(ring(radius,.0022,0,0,0,'z',4,12,Math.PI*2/3).rotateZ(i*Math.PI*2/3).translate(0,y,z),['#ef3f5e','#5bd46b','#478ce8'][i],M.gloss);
  append(d,'body',p);
}
export function starSticker(d) {
  const p=new Pieces(),y=.085,z=.008;
  for(const side of [-1,1]) {
    const outline=[];
    for(let i=0;i<10;i++){const a=i*Math.PI/5,r=i%2?.012:.024;outline.push([z+Math.cos(a)*r,y+Math.sin(a)*r]);}
    const geo=slab(outline,.0007,side*.034,0);
    p.add(geo,'#f5ae34',M.print);
    const sticker=p.list[p.list.length-1],colors=sticker.attributes.color,pos=sticker.attributes.position,dark=new THREE.Color('#ec772d');
    for(let i=0;i<colors.count;i++)if(pos.getZ(i)>z)colors.setXYZ(i,dark.r,dark.g,dark.b);
    for(const dz of [-.006,.006])p.add(sphere(.001,.005,.0025,side*.0355,y+.004,z+dz,6,4),'#24242a',M.print);
  }
  d.parts.variantSkin=part(p,d.parts.can.pivot,'body');
}
export function plainSticker(d, channel = 'body') {
  const target=channel==='body'?d.body:d.parts[channel].src;target.computeBoundingBox();const b=target.boundingBox,p=new Pieces();
  const y=(b.min.y+b.max.y)/2,z=(b.min.z+b.max.z)/2;
  for(const s of [-1,1])p.add(box(.001,.018,.032,s*(s<0?-b.min.x:b.max.x)+s*.001,y,z,.25,4,2),'#efeadf',M.print);
  append(d,channel,p);
}
export function fixedInkSurface(d, color) { partitionInk(d, 'ink', color); }
// Fabric outline is procedural; the sourced feature is a red coral/seaweed
// attachment. It is a rigid first-pass detail, not a claimed retail cloth sim.
export function coralTag(d, style = 'pro') {
  const p = new Pieces();
  const [x, y, z] = style === 'pro' ? [-.106, .065, -.17] : [-.015, -.074, .16];
  const outline = [[-.025,0],[-.018,-.015],[-.021,-.032],[-.012,-.022],[-.009,-.046],[-.003,-.052],[.003,-.026],[.012,-.038],[.016,-.034],[.009,-.016],[.025,-.025],[.022,-.015],[.012,-.007],[.017,.006],[.009,.012],[.002,0],[-.005,.011],[-.010,.009],[-.006,-.006],[-.016,.004]];
  p.add(slab(outline.map(([a,b])=>[z+a,y+b]),.0012,x,.0003),'#cf493b',M.rubber);
  append(d,'body',p);
}
export function squidCharm(d) {
  const source = d.parts.can, box3 = source.src.boundingBox || (source.src.computeBoundingBox(), source.src.boundingBox);
  const x = box3.min.x - .019, y = box3.min.y - .020, z = source.pivot.z;
  const p = new Pieces();
  // Gray squid-shaped toy silhouette, small display and three colored buttons.
  const outline = [[-.022,.007],[-.019,.025],[0,.045],[.019,.025],[.022,.007],[.015,-.016],[.007,-.010],[0,-.019],[-.007,-.010],[-.015,-.016]];
  p.add(slab(outline.map(([a,b])=>[z+a,y+b]),.009,x,.002),'#a6abb0',M.satin);
  p.add(box(.002,.018,.023,x-.0054,y+.015,z,.3,4,3),'#3b4547',M.lens);
  for(let i=0;i<3;i++)p.add(sphere(.0018,.0025,.0025,x-.006,y-.002,z+(i-1)*.008,6,4),['#ee3957','#63d268','#4c8fea'][i],M.gloss);
  p.add(ring(.007,.0015,0,0,0,'x',4,12).translate(x,y+.047,z),'#bec1c4',M.metal);
  p.add(pipe([[box3.min.x-.001,source.pivot.y,z],[x,y+.056,z],[x,y+.047,z]],.0009,8,4),'#bec1c4',M.metal);
  d.parts.variantCharm=part(p,source.pivot,'body');
}
