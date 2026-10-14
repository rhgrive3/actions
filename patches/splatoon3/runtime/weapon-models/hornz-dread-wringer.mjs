// Hornz-only procedural reconstruction. Sources: official SplatNet3 400px icon
// and @SplatoonJP/status/1932728512353579047 rotation (2s, 6s, 10s).
// No retail mesh or texture is embedded. Native gameplay channels are retained.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Pieces, M, box, slab, cyl, pipe, zlathe } from './kit.mjs';

export function hornzDreadWringer(d) {
  const p=new Pieces();
  const C={pink:'#e51688',edge:'#f54da6',grey:'#96978a',light:'#b5b6a7',dark:'#34382f',black:'#20251f',metal:'#bfc5b6',stripe:'#282334'};
  // The pink vessel is an open, elongated rounded tray. The front lip is low;
  // the upper rear portion is concealed by the separate pale open hopper.
  const floor=-.078;
  const side=[[.038,floor],[.313,floor],[.333,-.058],[.336,.010],[.323,.052],[.302,.065],[.065,.060],[.040,.036]];
  for(const s of [-1,1]) {
    p.add(slab(side,.010,s*.077,.003),C.pink,M.gloss);
    p.add(pipe([[s*.078,.036,.040],[s*.078,.060,.065],[s*.078,.065,.302],[s*.078,.052,.323],[s*.078,.010,.336]],.005,32,8),C.edge,M.gloss);
  }
  p.add(box(.152,.010,.284,0,-.070,.184,.25),C.pink,M.gloss);
  p.add(box(.152,.118,.010,0,-.011,.043,.25),C.pink,M.gloss);
  p.add(box(.153,.069,.010,0,-.035,.332,.3),C.pink,M.gloss);
  p.add(cyl(.005,[-.078,.002,.337],[.078,.002,.337],16),C.edge,M.gloss);
  // Irregular tapered black tiger stripes on the pink shell (flat printed
  // geometry, not structural diagonal bars). Layout is procedural, not an
  // assertion that every small retail graphic is matched pixel-for-pixel.
  const stripeProfiles=[
    [[.058,.053],[.072,.056],[.084,.020],[.080,.001],[.094,-.022],[.083,-.036],[.073,-.005],[.070,.022]],
    [[.101,.057],[.116,.058],[.126,.030],[.119,.011],[.140,-.018],[.133,-.042],[.120,-.013],[.109,.006]],
    [[.154,.059],[.168,.060],[.160,.033],[.175,.010],[.175,-.009],[.161,-.021],[.164,.002],[.149,.027]],
    [[.198,.061],[.212,.062],[.207,.038],[.220,.020],[.215,-.008],[.200,-.027],[.208,.003],[.195,.022]],
    [[.244,.062],[.258,.063],[.250,.042],[.260,.026],[.251,.005],[.237,-.009],[.244,.020],[.237,.040]],
    [[.285,.063],[.298,.063],[.289,.043],[.296,.025],[.283,.003],[.276,-.014],[.277,.020]],
    [[.090,-.071],[.111,-.071],[.105,-.050],[.118,-.028],[.108,-.036],[.095,-.051]],
    [[.177,-.071],[.199,-.071],[.194,-.053],[.205,-.033],[.190,-.042],[.183,-.054]],
    [[.262,-.071],[.281,-.071],[.269,-.049],[.277,-.028],[.265,-.035],[.257,-.053]]
  ];
  for(const s of [-1,1])for(const outline of stripeProfiles)p.add(slab(outline,.0008,s*.0825,0),C.stripe,M.print);
  // Pale rear hopper: actual open mouth and inner walls, not a grey block or
  // a thin carry arch. Sloped walls lead down to its recessed inner floor.
  const hopperSide=[[.022,-.013],[.136,-.013],[.164,.052],[.153,.092],[.116,.140],[.048,.137],[.018,.100]];
  for(const s of [-1,1]) {
    p.add(slab(hopperSide,.012,s*.066,.003),C.grey,M.satin);
    p.add(pipe([[s*.066,.100,.018],[s*.066,.137,.048],[s*.066,.140,.116],[s*.066,.092,.153]],.007,26,8),C.light,M.satin);
  }
  p.add(box(.132,.012,.123,0,-.007,.083,.3),C.grey,M.satin);
  p.add(box(.133,.112,.011,0,.048,.022,.35),C.grey,M.satin);
  // Back rim rounds into the two sides; front is a deep opening above a
  // ribbed black crosswise lip, clearly visible in the 400px reference.
  p.add(pipe([[-.066,.137,.048],[-.040,.145,.038],[.040,.145,.038],[.066,.137,.048]],.007,24,10),C.light,M.satin);
  p.add(box(.131,.038,.014,0,.010,.149,.3),C.grey,M.satin);
  p.add(box(.135,.016,.022,0,.037,.153,.4),C.black,M.rubber);
  for(let k=0;k<5;k++)p.add(cyl(.0013,[-.063,.043,.144+k*.004],[.063,.043,.144+k*.004],10),C.dark,M.rubber);
  // Black flat rear braces and their pivot fasteners flank the pale hopper.
  for(const s of [-1,1]) {
    p.add(slab([[.013,.091],[.020,.119],[.156,.044],[.149,.019]],.012,s*.080,.002),C.dark,M.satin);
    p.add(slab([[.047,.070],[.062,.062],[.063,.143],[.047,.144]],.013,s*.082,.002),C.dark,M.satin);
    for(const [z,y]of [[.052,.087],[.147,.035]])p.add(cyl(.006,[s*.086,y,z],[s*.092,y,z],12),C.metal,M.metal);
    // Small wheels sit behind the hopper; confirmed by the rotating rear.
    p.add(cyl(.014,[s*.045,.009,.009],[s*.058,.009,.009],18),C.black,M.rubber);
  }
  p.add(box(.174,.025,.011,0,.112,.018,.18),C.dark,M.satin);
  // One flat black strap down each side of the pink body, three conical
  // metal studs per side, hexagonal fasteners at the ends. The lower second
  // row in the turntable video is a reflection, not another physical rail.
  for(const s of [-1,1]) {
    p.add(box(.013,.029,.308,s*.094,-.015,.188,.12),C.dark,M.satin);
    for(const z of [.106,.163,.220]) {
      const cone=zlathe([[0,0],[.010,0],[.010,.003],[.007,.012],[0,.030]],0,0,0,18).rotateY(s*Math.PI/2).translate(s*.102,-.014,z);
      p.add(cone,C.metal,M.metal);
    }
    for(const z of [.060,.265,.318])p.add(cyl(.006,[s*.101,-.014,z],[s*.106,-.014,z],6),C.metal,M.metal);
    p.add(pipe([[s*.088,.034,.055],[s*.088,.031,.245],[s*.083,.068,.153]],.0024,22,6),C.dark,M.metal);
  }
  // Front cross-grip with the ribbed rubber sleeve and metal end plates.
  p.add(box(.200,.032,.018,0,-.015,.339,.15),C.dark,M.satin);
  p.add(box(.132,.031,.024,0,-.015,.343,.3),C.black,M.rubber);
  for(let k=0;k<7;k++)p.add(cyl(.0012,[-.064,-.027+k*.004,.356],[.064,-.027+k*.004,.356],10),C.dark,M.rubber);
  for(const s of [-1,1])p.add(box(.016,.033,.025,s*.075,-.015,.344,.15),C.metal,M.metal);
  // Origin-centred gameplay hand sleeve stays clear and unchanged in size.
  p.add(pipe([[0,.058,.033],[0,.060,.004],[0,.030,-.012],[0,-.030,-.012],[0,-.060,.004],[0,-.058,.033]],.0052,24,8),C.grey,M.satin);
  p.add(cyl(.0125,[0,-.05,-.004],[0,.05,-.004],14),C.dark,M.rubber);
  const body=p.build();d.body?.dispose?.();d.body=body;
  // Official rotation (2s/14s) shows team-coloured ink in both vessels.
  // The inherited front ink spans z≈.163–.313, outside this rear cavity.
  // Append only a shallow rear pool to the existing team-ink draw channel;
  // never bake the reference's turquoise colour into fixed body geometry.
  const pool=new Pieces().add(box(.116,.014,.104,0,.009,.084,.25), '#ffffff', M.satin).build();
  const ink=mergeGeometries([d.ink,pool],false);
  if(!ink)throw new Error('Hornz rear ink attributes differ');
  d.ink.dispose();pool.dispose();d.ink=ink;
  return d;
}
