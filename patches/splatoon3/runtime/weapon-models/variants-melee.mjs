// Alternate-kit procedural finishes, derived from the current base builders.
// Exact 11.3.0 source-row identities; these are visuals, not new gameplay kits.
import { THREE, Pieces, M, box, slab, sphere, zlathe } from './kit.mjs';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MODELS as ROLLERS } from './rollers.mjs';
import { MODELS as BRUSHES } from './brushes.mjs';
import { MODELS as SLOSHERS } from './sloshers.mjs';
import { MODELS as SPLATANAS } from './splatanas.mjs';
const BASES = { ...ROLLERS, ...BRUSHES, ...SLOSHERS, ...SPLATANAS };

// Clone before writing: no cached base color attributes or material objects are
// mutated. Match authored linear RGB, never team colors or approximate hues.
function acceptsFinish(sourceRow, channel, sourceHex, g, i) {
  // A repeated palette color is not a semantic part ID: guard exceptions using
  // the original builder's fixed channel, surface class and authored region.
  const z = g.attributes.position.getZ(i), surface = g.attributes.aMat.getX(i);
  if (sourceRow === 'Roller_Compact_01' && sourceHex === '#f2a92a') return channel === 'hinge';
  if (sourceRow === 'Roller_Compact_02') {
    if (sourceHex === '#f2a92a') return channel === 'hinge';
    if (sourceHex === '#8f8d86') return channel === 'body' && z >= .109 && z <= .256;
  }
  if (sourceRow === 'Roller_Heavy_02' && (sourceHex === '#28282c' || sourceHex === '#18181b')) {
    return channel === 'body' && surface === M.rubber && z <= .113;
  }
  return true;
}
function recolor(g, palette, sourceRow, channel) {
  if (!g?.attributes.color || !palette.length) return g;
  const out = g.clone(), color = out.attributes.color;
  const pairs = palette.map(([a,b]) => [new THREE.Color(a), new THREE.Color(b), a]);
  for (let i = 0; i < color.count; i++) {
    const p = pairs.find(([a]) => Math.abs(color.getX(i)-a.r)<1e-6 && Math.abs(color.getY(i)-a.g)<1e-6 && Math.abs(color.getZ(i)-a.b)<1e-6);
    if (p && acceptsFinish(sourceRow, channel, p[2], g, i)) {
      color.setXYZ(i, p[1].r, p[1].g, p[1].b);
      // The ANG-L description explicitly identifies this fixed canister as
      // chrome. Keep the identically colored grip brace on its original satin.
      if (sourceRow === 'Roller_Compact_02' && channel === 'body' && p[2] === '#8f8d86') out.attributes.aMat.setX(i, M.metal);
    }
  }
  g.dispose(); // Geometry was just allocated by base.build, never a cached def.
  return out;
}
function finish(d, palette, sourceRow) {
  d.body = recolor(d.body, palette, sourceRow, 'body');
  if (d.drumCaps) d.drumCaps = recolor(d.drumCaps, palette, sourceRow, 'drumCaps');
  for (const [name,p] of Object.entries(d.parts || {})) if (p.mat === 'body' && !p.hidden) p.src = recolor(p.src, palette, sourceRow, name);
  return d;
}
function add(d, pieces, channel='body') {
  const owner = channel === 'body' ? d : d.parts[channel];
  if (!owner || (channel !== 'body' && (owner.mat !== 'body' || owner.hidden))) throw new Error(`Missing fixed-color detail channel ${channel}`);
  const key = channel === 'body' ? 'body' : 'src', extra = pieces.build();
  const merged = mergeGeometries([owner[key], extra], false);
  if (!merged) throw new Error('Variant detail attributes differ');
  owner[key].dispose(); // Exclusively owned fresh geometry after finish().
  owner[key] = merged; extra.dispose();
}
// Original geometric marks approximate brand placement, not copied game textures.
function chevrons(p,x,y,z,color='#f4f0df',s=.012) {
  for(let i=0;i<3;i++) p.add(slab([[z+i*s*1.4,y-s],[z+i*s*1.4+s*.7,y],[z+i*s*1.4,y+s],[z+i*s*1.4+s*.4,y+s],[z+i*s*1.4+s*1.1,y],[z+i*s*1.4+s*.4,y-s]],.0015,x,.0002),color,M.print);
}
function badge(p,x,y,z,color='#eae8dc',s=.018) {
  p.add(box(.002,s,s*2,x,y,z,.2,4,4),color,M.print);
  p.add(box(.003,s*.18,s*1.4,x+.001,y,z,.2,4,4),'#30333b',M.print);
}
function packet(p,x,y,z) {p.add(box(.01,.045,.035,x,y,z,.3,6,4),'#88785b',M.satin);badge(p,x+.006,y,z,'#d7cdb3',.015);}
function bulbs(p,x,y,z) {['#ed354f','#73df47','#579df5'].forEach((c,i)=>p.add(sphere(.008,.008,.008,x,y,z+i*.022,8,6),c,M.gloss));}
const rows = [
 ['Roller_Normal_01','roller','Krak-On Splat Roller',{'#4b31c8':'#ee7628','#f2bf2c':'#397bc7'},'krak'],
 ['Roller_Compact_01','s3-roller-compact','Carbon Roller Deco',{'#f2a92a':'#d53543'},'carbon'],
 ['Roller_Compact_02','s3-roller-compact','Carbon Roller ANG-L',{'#f2a92a':'#343438','#8f8d86':'#b5bbc0','#e9384e':'#ee7d35','#3fd3c4':'#829e83'},'carbonLamp'],
 ['Roller_Heavy_01','s3-roller-heavy','Gold Dynamo Roller',{'#55565b':'#b89439','#28282c':'#80601e','#a9abb1':'#ddc374','#c27a3c':'#d8b653'},null],
 ['Roller_Heavy_02','s3-roller-heavy','Starz Dynamo Roller',{'#55565b':'#242644','#a9abb1':'#30365e','#28282c':'#e6e5df','#18181b':'#e6e5df'},'dynamoStars'],
 ['Roller_Hunter_01','s3-roller-hunter','Foil Flingza Roller',{'#86202b':'#264caf','#4e0f17':'#172b66'},'foil'],
 ['Roller_Wide_01','s3-roller-wide','Big Swig Roller Express',{'#6c52e6':'#e9c72d'},'express'],
 ['Roller_Wide_02','s3-roller-wide','Planetz Big Swig Roller',{'#6c52e6':'#ed6b78','#3c7fe4':'#ed6b78','#94b4f6':'#9e6eca','#4b2cb0':'#d4d5d0'},'planetz'],
 ['Brush_Mini_01','s3-brush-mini','Inkbrush Nouveau',{'#b2b7bf':'#c4a25c','#b9692c':'#d6bb80'},'inkbrush'],
 ['Brush_Normal_01','s3-brush-normal','Octobrush Nouveau',{'#7a3018':'#b88d53','#4e1c0e':'#876238'},'octobrush'],
 ['Brush_Normal_02','s3-brush-normal','Cometz Octobrush',{'#7a3018':'#e0ded8','#4e1c0e':'#aaa7ad','#c9a24a':'#505681','#e9e1c9':'#34343c','#d6ccb0':'#24242b'},'cometz'],
 ['Brush_Heavy_01','s3-brush-heavy','Painbrush Nouveau',{'#c9ccd2':'#c8ad68','#7d8088':'#9f843d','#7b2f1d':'#352018','#efebe2':'#d1b254','#d8d3c8':'#af8f3c','#2f4fd0':'#9f843d'},'painbrush'],
 ['Brush_Heavy_02','s3-brush-heavy','Painbrush BRN-Z',{'#c9ccd2':'#9b713e','#7d8088':'#5d4630','#efebe2':'#414344','#d8d3c8':'#292e2d','#2f4fd0':'#466556'},'bronze'],
 ['Slosher_Strong_01','slosher','Slosher Deco',{'#a07fd2':'#3474c9','#7653b0':'#244c89'},'slosher'],
 ['Slosher_Diffusion_01','s3-slosher-diffusion','Tri-Slosher Nouveau',{'#e3e01c':'#84c7dc','#b9b412':'#5d9eaf'},'tri'],
 ['Slosher_Diffusion_02','s3-slosher-diffusion','Tri-Slosher ASH-N',{'#2b3cb0':'#45474b','#e3e01c':'#584337','#b9b412':'#382f28'},'ash'],
 ['Slosher_Launcher_01','s3-slosher-launcher','Sloshing Machine Neo',{'#e4d9bd':'#27282c','#b9b6ab':'#34353a'},'machine'],
 ['Slosher_Bathtub_01','s3-slosher-bathtub','Bloblobber Deco',{'#1c1d21':'#e6c739'},'blob'],
 ['Slosher_Washtub_01','s3-slosher-washtub','Custom Explosher',{'#5f6a2c':'#c3b38d','#4b5523':'#978762'},'explo'],
 ['Slosher_Double_01','s3-slosher-double','Dread Wringer D',{'#9a9da2':'#24242a','#7d8086':'#353238','#5c5f65':'#77604b'},'dread'],
 ['Slosher_Double_02','s3-slosher-double','Hornz Dread Wringer',{'#e4d21c':'#e878b7','#7d8086':'#929399','#5c5f65':'#28272d'},'hornz'],
 ['Saber_Normal_01','s3-saber-normal','Splatana Stamper Nouveau',{'#26346f':'#eeeae1','#1a1a1d':'#4d9460'},'stamper'],
 ['Saber_Normal_02','s3-saber-normal','Stickerz Splatana Stamper',{'#26346f':'#dbe94a','#6f737b':'#28272d','#ecebe6':'#24242b'},'stickerz'],
 ['Saber_Lite_01','s3-saber-lite','Splatana Wiper Deco',{'#1a1a1d':'#d8d9d5'},'wiper'],
 ['Saber_Lite_02','s3-saber-lite','Splatana Wiper RUS-T',{'#1a1a1d':'#815c40','#b8bcc4':'#79907c'},'rust'],
 ['Saber_Heavy_01','s3-saber-heavy','Charcoal Decavitator',{'#f3f4e8':'#20212e','#67b9db':'#c8a64d','#dde9e6':'#4b4b5e','#92dcca':'#20212e'},null],
];
function detail(d, type) {
  if (!type) return;
  const p=new Pieces();let channel='body';
  switch(type) {
    case 'krak': badge(p,.023,0,.49,'#f5f0e6',.026);break;
    case 'carbon': channel='hinge';chevrons(p,.22,.014,.47,'#f0e9d9',.012);break;
    case 'carbonLamp': channel='hinge';p.add(box(.026,.024,.035,-.22,.018,.475),'#222328',M.satin);p.add(box(.02,.004,.025,-.22,.032,.475),'#e9d898',M.gloss);break;
    case 'dynamoStars': channel='hinge';bulbs(p,.22,.025,.63);for(let i=0;i<7;i++)p.add(sphere(.003,.003,.006,.1+i*.045,.025,.66,6,4),'#eef0e6',M.print);break;
    case 'foil': badge(p,.025,0,.12,'#d7e0ee',.018);break;
    case 'express': badge(p,.047,.04,.29,'#dbb32b',.024);break;
    case 'planetz': badge(p,.047,.04,.29,'#8dc783',.024);bulbs(p,.047,.04,.32);break;
    case 'inkbrush': badge(p,.04,0,.402,'#f0e9d9',.012);break;
    case 'octobrush': badge(p,.022,0,.35,'#e8d7b2',.015);break;
    case 'cometz': bulbs(p,.055,0,.35);break;
    case 'painbrush': badge(p,.026,0,.32,'#ecd48b',.021);break;
    case 'bronze': packet(p,.065,0,.39);break;
    case 'slosher': chevrons(p,.097,.025,.12,'#e1e5e8',.012);break;
    case 'tri': badge(p,.098,.015,.18,'#e2e6d9',.025);break;
    case 'ash': packet(p,-.103,.01,.18);break;
    case 'machine': badge(p,.07,.06,.19,'#e1ddd3',.02);break;
    case 'blob': chevrons(p,.1,0,.17,'#283d75',.01);break;
    case 'explo': badge(p,.103,0,.18,'#eee6cc',.023);break;
    case 'dread': badge(p,.079,0,.14,'#dfddd1',.023);break;
    case 'hornz': for(const sx of [-1,1])for(let i=0;i<3;i++){const g=zlathe([[0,0],[.009,.003],[0,.03]],0,0,0,6).rotateY(sx*Math.PI/2).translate(sx*.08,.055,.17+i*.025);p.add(g,'#a2a3a7',M.metal);}break;
    case 'stamper': p.add(box(.003,.012,.07,.018,0,-.005),'#4d9460',M.print);badge(p,.014,.006,.20,'#dedccf',.015);break;
    case 'stickerz': for(let i=0;i<4;i++)badge(p,.014,0,.12+i*.052,['#85b9e0','#c89ed4','#78ccb4','#e5bf77'][i],.016);break;
    case 'wiper': chevrons(p,.009,.005,.18,'#405b85',.009);chevrons(p,0,.052,.12,'#e9dd9b',.006);break;
    case 'rust': packet(p,.019,0,-.025);badge(p,.009,.004,.22,'#e6e1d4',.009);break;
    default: throw new Error(`Unknown variant detail ${type}`);
  }
  add(d,p,channel);
}
export const VARIANT_MODELS = Object.freeze(Object.fromEntries(rows.map(([sourceRow,baseId,name,palette,type])=>{
  const base=BASES[baseId];
  return [sourceRow,Object.freeze({...base,sourceRow,baseId,name,sourceUrl:'https://splatoonwiki.org/wiki/'+name.replaceAll(' ','_'),build(freshFamilyDef){const d=base.build(freshFamilyDef);finish(d,Object.entries(palette),sourceRow);detail(d,type);return d;}})];
})));
