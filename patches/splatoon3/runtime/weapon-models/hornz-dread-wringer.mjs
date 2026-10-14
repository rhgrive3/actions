// Hornz-only procedural reconstruction. Sources: official SplatNet3 400px icon
// and @SplatoonJP/status/1932728512353579047 rotation (2s, 6s, 10s).
// No retail mesh or texture is embedded. Native gameplay channels are retained.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { THREE, Pieces, M, box, slab, cyl, pipe, zlathe, smoothOutline } from './kit.mjs';

export function hornzDreadWringer(d) {
  const p=new Pieces();
  const C={pink:'#e51688',edge:'#f54da6',grey:'#96978a',light:'#b5b6a7',dark:'#34382f',black:'#20251f',metal:'#bfc5b6',stripe:'#282334'};
  // Rounded, tapered pink vessel with a rolled lip. Construct a continuous
  // thick shell instead of four intersecting flat plates.
  const contour=(hx,hz,r)=>{
    const out=[];for(const [x,z,a]of [[hx-r,hz-r,0],[-hx+r,hz-r,Math.PI/2],[-hx+r,-hz+r,Math.PI],[hx-r,-hz+r,3*Math.PI/2]])
      for(let k=0;k<8;k++){const q=a+k*Math.PI/16;out.push([x+r*Math.cos(q),z+r*Math.sin(q)]);}return out;
  };
  const meshFromLoops=(loops,connections,caps=[])=>{
    const n=loops[0].length,pos=loops.flat(2),idx=[];
    for(const [a,b,flip]of connections)for(let j=0;j<n;j++){const k=(j+1)%n,A=a*n+j,B=a*n+k,C=b*n+j,D=b*n+k;idx.push(...(flip?[A,C,B,B,C,D]:[A,B,C,B,D,C]));}
    for(const [loop,flip]of caps)for(let j=1;j<n-1;j++)idx.push(...(flip?[loop*n,loop*n+j+1,loop*n+j]:[loop*n,loop*n+j,loop*n+j+1]));
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
  };
  const pinkRing=(hx,hz,r,y)=>contour(hx,hz,r).map(([x,z])=>[x,y===null?.065-Math.max(0,z-.112)*1.55:y,.181+z]);
  const pinkLoops=[pinkRing(.071,.132,.022,-.074),pinkRing(.080,.145,.027,-.060),pinkRing(.084,.149,.030,null),pinkRing(.074,.139,.024,null),pinkRing(.065,.126,.019,-.063)];
  p.add(meshFromLoops(pinkLoops,[[0,1,true],[1,2,true],[2,3,true],[3,4,true]],[[0,false],[4,true]]),C.pink,M.gloss);
  p.add(pipe([...pinkLoops[2],pinkLoops[2][0]],.0045,96,8),C.edge,M.gloss);
  p.add(pipe([...pinkLoops[0],pinkLoops[0][0]],.003,96,6),C.edge,M.gloss);
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
  for(const s of [-1,1])for(const outline of stripeProfiles){
    const g=slab(smoothOutline(outline,40),.0008,0,0),a=g.attributes.position;
    for(let i=0;i<a.count;i++){
      const y=a.getY(i),z=a.getZ(i),w=y<-.060?.071+(y+.074)/.014*.009:.080+(y+.060)/.125*.004;
      const end=Math.max(0,Math.abs(z-.181)-.119),r=.030;
      const inset=end>0?r-Math.sqrt(Math.max(0,r*r-end*end)):0;
      a.setX(i,s*(w-inset+.0007)+a.getX(i));
    }g.computeVertexNormals();p.add(g,C.stripe,M.print);
  }
  // The pale part's mouth faces forward and upward, not straight upward.
  // Its thick rounded-rectangle rim lies on a plane tilted back 22 degrees;
  // the hollow shell tapers down/back to the wheel end seen in the rotation.
  const angle=.38,co=Math.cos(angle),si=Math.sin(angle);
  const hopperRing=(hx,hy,r,cy,cz)=>contour(hx,hy,r).map(([x,v])=>[x,cy+v*co,cz-v*si]);
  const hopperLoops=[
    hopperRing(.058,.034,.014,.040,.024),
    hopperRing(.069,.046,.019,.060,.069),
    hopperRing(.082,.067,.025,.100,.130),
    hopperRing(.067,.052,.019,.100,.131),
    hopperRing(.054,.032,.014,.060,.077),
    hopperRing(.045,.023,.010,.040,.034)
  ];
  p.add(meshFromLoops(hopperLoops,[[0,1],[1,2],[2,3],[3,4],[4,5]],[[0,true],[5,false]]),C.grey,M.satin);
  // Broad rim comes from the shell's annulus; avoid a thin white wire cage.
  p.add(pipe([...hopperLoops[2],hopperLoops[2][0]],.0028,96,8),C.light,M.satin);
  p.add(box(.137,.020,.025,0,.049,.153,.5),C.black,M.rubber);
  for(let k=0;k<6;k++)p.add(cyl(.0012,[-.064,.050+k*.002,.166],[.064,.050+k*.002,.166],10),C.dark,M.rubber);
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
    p.add(pipe([[s*.088,.030,.055],[s*.088,.030,.146],[s*.083,.061,.153]],.0024,22,6),C.dark,M.metal);
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
  const pool=new Pieces().add(box(.090,.016,.075,0,.042,.085,.35), '#ffffff', M.satin).build();
  const ink=mergeGeometries([d.ink,pool],false);
  if(!ink)throw new Error('Hornz rear ink attributes differ');
  d.ink.dispose();pool.dispose();d.ink=ink;
  return d;
}
