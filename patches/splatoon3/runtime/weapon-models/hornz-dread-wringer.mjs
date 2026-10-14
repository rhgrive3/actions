// Variant-only reconstruction from the 128px Slosher_Double_02 inventory icon:
// Leanny/splat3@7280ff9cde8bb1c5dcef46c700c326471584d2e6,
// images/weapon/Wst_Slosher_Double_02.png (blob 72dcb55de49798d52277ac62cd83d1d225397762).
// Visible silhouette only; this is not a claim about unseen retail geometry.
import { Pieces, M, box, slab, cyl, pipe, sphere } from './kit.mjs';

export function hornzDreadWringer(d) {
  // Replace only fresh fixed-colour body geometry. Native grips, sockets, ink
  // volume, level surface and animated/hidden part records are left untouched.
  const p = new Pieces();
  const C = { pink:'#dc3975', edge:'#f05a91', grey:'#64645b', light:'#88887b', dark:'#34352f', black:'#222420', stud:'#99998c' };
  const floor=-.078;
  p.add(box(.174,.014,.312,0,floor,.178,.24),C.dark,M.satin);
  // Low, elongated open pink tray with sloping ends, rather than a tall cuboid.
  const side=[[.145,floor],[.322,floor],[.335,-.052],[.335,.060],[.315,.073],[.164,.058],[.145,.033]];
  const rim=[[.145,.033],[.164,.058],[.315,.073],[.335,.060]];
  for(const s of [-1,1]) {
    p.add(slab(side,.009,s*.076,.002),C.pink,M.gloss);
    p.add(pipe(rim.map(([z,y])=>[s*.078,y,z]),.006,26,8),C.edge,M.gloss);
  }
  p.add(box(.148,.009,.172,0,-.067,.244,.2),C.pink,M.gloss);
  p.add(box(.151,.124,.009,0,-.006,.330,.25),C.pink,M.gloss);
  p.add(box(.151,.105,.009,0,-.015,.149,.25),C.pink,M.gloss);
  // The reference has a faceted, tapering grey rear housing and prominent
  // angular side plates. Do not reuse the base's smooth rectangular block.
  const housing=[[.026,-.062],[.133,-.062],[.158,-.027],[.148,.052],[.117,.092],[.054,.095],[.024,.060]];
  p.add(slab(housing,.145,0,.005),C.grey,M.satin);
  const cheek=[[.018,-.032],[.037,.045],[.067,.090],[.080,.037],[.146,.024],[.162,-.002],[.135,-.028],[.062,-.018],[.039,-.050]];
  for(const s of [-1,1]) {
    p.add(slab(cheek,.013,s*.079,.0015),C.dark,M.satin);
    p.add(cyl(.008,[s*.082,.006,.061],[s*.089,.006,.061],12),C.light,M.metal);
    p.add(cyl(.005,[s*.082,.018,.127],[s*.089,.018,.127],12),C.light,M.metal);
  }
  // Open arched carry frame over the housing, with a broad grey bridge.
  for(const s of [-1,1]) p.add(pipe([[s*.065,.047,.042],[s*.066,.122,.060],[s*.052,.145,.085],[s*.043,.146,.124],[s*.040,.080,.149]],.010,28,10),C.light,M.satin);
  p.add(cyl(.012,[-.052,.145,.085],[.052,.145,.085],16),C.grey,M.satin);
  // Twin wringer rolls remain across the chassis, in front of the housing.
  for(const z of [.121,.155]) p.add(cyl(.0155,[-.069,.072,z],[.069,.072,z],20),C.black,M.rubber);
  // Long dark side rails are a dominant icon feature. Their pale studs belong
  // on the rail; the old six floating spikes on the pink tub are removed.
  for(const s of [-1,1]) {
    p.add(pipe([[s*.084,.033,.129],[s*.091,.068,.180],[s*.091,.079,.318],[s*.082,.063,.341]],.010,30,10),C.dark,M.satin);
    for(let k=0;k<6;k++) {
      const z=.176+k*.028, y=.069+(z-.18)*.075;
      p.add(sphere(.006,.0045,.007,s*.100,y,z,10,6),C.stud,M.metal);
    }
    // Pink diagonal ribs below the rail are visible in the icon, unlike
    // invented free-standing horns around the tub.
    for(let k=0;k<4;k++) p.add(slab([[.168+k*.032,-.045],[.177+k*.032,-.045],[.199+k*.032,.052],[.190+k*.032,.052]],.004,s*.082,.0005),C.dark,M.satin);
  }
  p.add(cyl(.011,[-.09,.079,.318],[.09,.079,.318],18),C.black,M.rubber);
  // Preserve the native origin-centred right-hand sleeve and its clearance.
  p.add(pipe([[0,.058,.033],[0,.060,.004],[0,.030,-.012],[0,-.030,-.012],[0,-.060,.004],[0,-.058,.033]],.0052,24,8),C.grey,M.satin);
  p.add(cyl(.0125,[0,-.05,-.004],[0,.05,-.004],14),C.dark,M.rubber);
  for(const s of [-1,1]) p.add(cyl(.016,[s*.075,-.078,.048],[s*.09,-.078,.048],14),C.black,M.rubber);
  const body=p.build();
  d.body?.dispose?.(); d.body=body;
  return d;
}
