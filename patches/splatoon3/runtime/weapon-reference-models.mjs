// Procedural interpretation of Nintendo's publicly pictured base weapons.
// Coordinates and dimensions are INKWAVE art calibration, not retail meshes.
// Keep the native grip/muzzle and animated-part contracts (including far LOD).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { superEllipsoid, lathe, sweep, finalize, torus } from '../../../src/game/character-geo.js';
import { WMAT as M } from '../../../src/game/character-mats.js';

export const REFERENCE_WEAPONS = Object.freeze({ shooter: 'Splattershot', dualies: 'Splat Dualies',
  charger: 'Splat Charger', blaster: 'Blaster', roller: 'Splat Roller', slosher: 'Slosher', splatling: 'Heavy Splatling' });
const V = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
const C = { dark:'#24252b', black:'#121519', silver:'#c1c5c5', cream:'#f1f0dd', yellow:'#ebbd24',
  purple:'#553091', red:'#d72c37', pink:'#9b184d', lilac:'#b68ec3', blue:'#369bd0' };
class Pieces {
  constructor(){this.list=[];}
  add(geo,color=C.dark,mat=M.satin){
    const g=geo.index?geo:finalize(geo),n=g.attributes.position.count,c=new THREE.Color(color);
    const colors=new Float32Array(n*3);for(let i=0;i<n;i++)colors.set([c.r,c.g,c.b],i*3);
    const out=new THREE.BufferGeometry();
    out.setAttribute('position',g.attributes.position.clone());out.setAttribute('normal',g.attributes.normal.clone());
    out.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    out.setAttribute('aMat',new THREE.Float32BufferAttribute(new Float32Array(n).fill(mat),1));
    out.setIndex(g.index.clone());this.list.push(out);g.dispose();return this;
  }
  build(){const g=this.list.length===1?this.list[0]:mergeGeometries(this.list,false);
    if(this.list.length>1)for(const p of this.list)p.dispose();return g;}
}
const at=(g,x,y,z)=>g.translate(x,y,z);
const box=(w,h,d,x,y,z,e=.38)=>at(superEllipsoid(w/2,h/2,d/2,e,e,12,8),x,y,z);
const sphere=(rx,ry,rz,x,y,z)=>at(superEllipsoid(rx,ry,rz,1,1,18,12),x,y,z);
const zlathe=(p,x=0,y=0,z=0,n=20)=>at(lathe(p,n).rotateX(Math.PI/2),x,y,z);
const ring=(r,t,x,y,z)=>at(torus(r,t,5,20),x,y,z);
function pipe(points,r=.006){return sweep(points.map(p=>V(...p)),{seg:20,radial:7,capSteps:2,radius:()=>r}).geo;}
function part(p,pivot,mat='body'){return {src:p.build(),pivot:V(...pivot),mat};}
function invisible(p){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(9),3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute([0,1,0,0,1,0,0,1,0],3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(9),3));
  g.setAttribute('aMat',new THREE.Float32BufferAttribute(new Float32Array(3),1));g.setIndex([0,1,2]);
  return {...p,src:g}; // zero-area compatibility channel, not an extra visible mechanism
}
function pistol(p,color=C.dark){
  p.add(at(superEllipsoid(.012,.055,.015,.38,.38,12,8).rotateX(Math.atan2(.25,1)),0,-.008,-.002),color,M.rubber);
  p.add(box(.034,.009,.044,0,-.063,-.014),color);
  p.add(pipe([[0,.034,.020],[0,.026,.046],[0,-.003,.044],[0,-.008,.016]],.0035),color);
}
function support(p,d,color=C.dark){
  const g=d.gripL,dir=g.handZ.clone().normalize();
  const geo=lathe([[0,-.035],[.013,-.035],[.013,.035],[0,.035]],12);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0,1,0),dir)).translate(...g.pos.toArray());
  p.add(geo,color,M.rubber);
}
function retainChannels(d,body,ink,overrides={}){
  d.body.dispose();d.ink?.dispose();d.body=body.build();d.ink=ink.build();
  for(const [name,p]of Object.entries(d.parts||{})){p.src?.dispose();d.parts[name]=overrides[name]||invisible(p);}
  for(const [name,p]of Object.entries(overrides))d.parts[name]=p;
  d.referenceWeapon=REFERENCE_WEAPONS[d.kind];return d;
}

function shooter(d){
  const p=new Pieces(),i=new Pieces(),can=new Pieces(),tr=new Pieces();pistol(p,C.purple);support(p,d,C.yellow);
  // Rounded translucent-looking rear bottle, broad yellow rail, short cone nozzle.
  p.add(box(.072,.068,.171,0,.065,.018),C.yellow,M.gloss);
  p.add(box(.043,.016,.178,0,.039,.022),C.purple);
  can.add(sphere(.067,.072,.094,0,.141,-.037),C.cream,M.gloss);
  p.add(ring(.059,.0055,0,.113,-.113),C.yellow,M.gloss);
  p.add(zlathe([[0,-.014],[.026,-.014],[.026,.014],[0,.014]],0,.127,-.140),C.blue,M.gloss);
  p.add(pipe([[-.035,.125,-.116],[-.048,.153,-.132],[-.018,.171,-.148],[.007,.149,-.144]],.006),C.yellow);
  p.add(zlathe([[.010,.123],[.015,.123],[.014,.164],[.029,.207],[.027,.212],[.009,.212],[.009,.199]],0,.066),C.yellow,M.gloss);
  p.add(zlathe([[0,.211],[.009,.211],[.009,.2118],[0,.2118]],0,.066),C.blue);
  for(const z of [.063,.085,.106])p.add(box(.060,.005,.013,0,.071,z),C.yellow);
  i.add(box(.012,.026,.023,-.037,.067,.018));
  tr.add(box(.006,.021,.006,0,.022,.031),C.purple);
  return retainChannels(d,p,i,{can:part(can,[0,.141,-.037],'body'),trigger:part(tr,[0,.0315,.0282])});
}
function charger(d){
  const p=new Pieces(),i=new Pieces();pistol(p,C.purple);support(p,d,C.purple);
  // The selected kit is the unscoped base Charger: a single long tube and open iron sights.
  p.add(box(.038,.046,.310,0,.045,.051),C.purple);
  p.add(zlathe([[0,.133],[.011,.133],[.011,.645],[.014,.655],[.014,.684],[.007,.684],[.007,.674]],0,.058),C.black,M.metal);
  p.add(box(.026,.018,.326,0,.083,.170),C.yellow);
  for(const z of [.12,.19,.26,.33])p.add(box(.035,.008,.022,0,.085,z),C.yellow);
  p.add(sphere(.027,.034,.133,0,.087,-.039),C.cream,M.gloss);
  p.add(zlathe([[0,-.183],[.022,-.183],[.024,-.175],[.024,-.164],[0,-.164]],0,.087),C.blue);
  p.add(box(.013,.014,.095,0,.043,-.181),C.silver,M.metal);
  p.add(box(.018,.081,.013,0,.027,-.236),C.yellow);
  p.add(box(.018,.012,.047,0,-.009,-.220),C.yellow);
  p.add(pipe([[-.013,.088,.590],[-.013,.132,.623],[.013,.132,.623],[.013,.088,.590]],.004),C.yellow);
  p.add(box(.005,.025,.006,0,.106,.604),C.yellow);
  i.add(ring(.014,.0025,0,.058,.661));
  // Charge indication remains available, integrated along the tube rather than an unrelated scope/coil cage.
  const old=d.glow;
  const glow=new Pieces();for(let k=0;k<4;k++)glow.add(ring(.0118,.0016,0,.058,.363+k*.047),'#ffffff',M.led);
  d.glow=glow.build();const pos=d.glow.attributes.position,seg=new Float32Array(pos.count);
  for(let n=0;n<pos.count;n++)seg[n]=Math.max(0,Math.min(1,(pos.getZ(n)-.34)/.20));
  d.glow.setAttribute('aSeg',new THREE.Float32BufferAttribute(seg,1));old?.dispose();
  return retainChannels(d,p,i);
}
function blaster(d){
  d.muzzlePart='front'; // the rendered opening follows the existing spring-front channel
  const p=new Pieces(),i=new Pieces(),front=new Pieces(),lever=new Pieces(),tr=new Pieces();
  pistol(p);support(p,d);
  p.add(zlathe([[0,-.122],[.051,-.122],[.055,-.114],[.055,-.021],[.045,-.012],[0,-.012]],0,.092),C.silver,M.metal);
  for(const z of [-.100,-.068,-.026])p.add(ring(.055,.005,0,.092,z),C.dark);
  p.add(zlathe([[0,-.01],[.045,-.01],[.045,.153],[0,.153]],0,.092),C.dark);
  // Centre spring and left pull-down lever actuate once per admitted shot.
  for(let k=0;k<8;k++)p.add(ring(.047,.003,0,.092,.029+k*.012),C.silver,M.metal);
  p.add(box(.050,.016,.134,0,.028,.154),C.dark);
  front.add(zlathe([[.015,.193],[.085,.193],[.100,.213],[.101,.310],[.091,.342],[.014,.342],[.014,.334]],0,.092),C.dark);
  front.add(zlathe([[0,.340],[.089,.340],[.086,.345],[.014,.345],[.014,.337]],0,.092),C.silver,M.metal);
  front.add(ring(.100,.004,0,.092,.313),C.red,M.gloss);
  // Original stylised flame strips, following the visible red/orange flame canister silhouette.
  for(let k=0;k<10;k++){
    const a=k*Math.PI/5,x=Math.cos(a),y=Math.sin(a);
    front.add(pipe([[x*.099,.092+y*.099,.224],[x*.104,.092+y*.104,.257],
      [Math.cos(a+.10)*.101,.092+Math.sin(a+.10)*.101,.285],[x*.096,.092+y*.096,.314]],.0038),C.red,M.gloss);
  }
  p.add(box(.089,.009,.123,0,-.016,.242),C.dark);
  for(let k=0;k<7;k++)p.add(box(.082,.002,.002,0,-.010,.194+k*.013),C.silver,M.metal);
  p.add(pipe([[-.040,.130,-.079],[-.040,.167,-.079],[.040,.167,-.079],[.040,.130,-.079]],.004),C.silver,M.metal);
  lever.add(box(.038,.010,.014,.077,.112,-.008),C.silver,M.metal);
  i.add(ring(.046,.003,0,.092,.014));tr.add(box(.006,.021,.006,0,.022,.031),C.dark);
  return retainChannels(d,p,i,{front:part(front,[0,.092,.275]),lever:part(lever,[.058,.112,-.008]),trigger:part(tr,[0,.0315,.0282])});
}
function dualies(d){
  const p=new Pieces(),i=new Pieces();pistol(p);
  // An open magenta frame and feed hose, not a pair of generic firearm slides.
  p.add(box(.030,.031,.173,0,.077,.021),C.pink,M.gloss);
  p.add(box(.027,.013,.102,0,.034,-.012),C.pink);
  for(const z of [-.054,-.010,.033])p.add(box(.022,.044,.013,0,.054,z),C.pink);
  p.add(box(.028,.088,.030,0,.029,.100).rotateX(-.10),C.pink);
  p.add(zlathe([[.006,.117],[.033,.117],[.034,.143],[.018,.148],[.006,.148]],0,.0645),C.black);
  p.add(zlathe([[.006,.145],[.019,.145],[.019,.147],[.006,.147]],0,.0645),C.silver,M.metal);
  p.add(box(.031,.006,.095,0,.096,.013),C.silver,M.metal);
  p.add(pipe([[0,.094,-.038],[0,.137,-.053],[0,.163,-.048]],.009),C.black);
  p.add(pipe([[0,.090,-.070],[.015,.058,-.086],[.015,-.053,-.079],[0,-.078,-.022]],.0045),C.silver);
  p.add(pipe([[0,-.066,-.012],[0,-.080,-.060],[0,-.050,-.092],[0,-.023,-.103]],.009),C.cream,M.gloss);
  for(const y of [-.033,-.045,-.057])p.add(box(.024,.006,.018,0,y,-.098),C.blue,M.gloss);
  p.add(box(.038,.008,.038,0,-.071,-.017),C.pink);
  i.add(box(.010,.020,.022,-.016,.074,-.035));
  return retainChannels(d,p,i);
}
function slosher(d){
  const p=new Pieces(),i=new Pieces(),surf=new Pieces(),z=.148,y=.012;
  // Dark faceted pail, lilac side braces and a real open arch. Existing grip
  // sockets are preserved so authored fists remain centered on their handles.
  p.add(at(lathe([[0,-.082],[.061,-.082],[.108,.075],[.109,.103],[.099,.104],[.088,.075],[.052,-.068],[0,-.068]],12),0,y,z),C.dark);
  p.add(at(torus(.104,.006,5,24).rotateX(Math.PI/2),0,y+.099,z),C.lilac,M.gloss);
  for(const sx of [-1,1])p.add(pipe([[sx*.07,y-.073,z],[sx*.11,y+.010,z-.044],
    [sx*.105,y+.099,z-.058],[sx*.086,y+.179,z-.035],[sx*.050,y+.189,z-.042]],.008),C.lilac,M.gloss);
  p.add(pipe([[-.050,y+.189,z-.042],[0,y+.189,z-.042],[.050,y+.189,z-.042]],.011),C.black,M.rubber);
  // Native right handle is integrated into the rear brace; the left socket is
  // the horizontal lower support bar, retained through the admitted heave.
  p.add(pipe([[0,-.042,0],[0,.045,0]],.012),C.black,M.rubber);support(p,d);
  p.add(pipe([[0,.045,0],[0,.078,.064],[0,y+.189,z-.042]],.007),C.lilac);
  p.add(pipe([[0,-.042,0],[0,-.060,.062],[0,y-.074,z-.05]],.007),C.lilac);
  for(let k=0;k<7;k++)p.add(at(torus(.019,.003,4,12).rotateX(Math.PI/2),0,y-.055+k*.015,z-.079),C.silver,M.metal);
  // The fill follows the INNER taper; a cylindrical fill protrudes through the
  // faceted lower wall and makes an unintended zigzag stripe outside the pail.
  i.add(at(lathe([[0,-.062],[.050,-.062],[.077,.046],[0,.046]],24),0,y,z));
  surf.add(at(lathe([[0,0],[.077,0],[.077,.001],[0,.001]],24),0,y+.048,z));
  return retainChannels(d,p,i,{surface:part(surf,[0,y+.048,z],'ink')});
}
function splatling(d){
  const p=new Pieces(),i=new Pieces(),bar=new Pieces();pistol(p,C.dark);support(p,d,C.yellow);
  const axis=.070;
  p.add(zlathe([[0,-.028],[.073,-.028],[.076,.139],[.071,.187],[0,.187]],0,axis),C.red,M.gloss);
  // Three substantial tubes and gold nozzles match the pictured Heavy cluster.
  for(let k=0;k<3;k++){
    const a=Math.PI/2+k*2*Math.PI/3,x=Math.cos(a)*.045,y=axis+Math.sin(a)*.045;
    bar.add(zlathe([[0,.174],[.024,.174],[.024,.425],[.018,.435],[0,.435]],x,y),C.silver,M.metal);
    bar.add(zlathe([[.006,.429],[.023,.429],[.023,.456],[.018,.466],[.006,.466]],x,y),C.yellow,M.metal);
    for(const z of [.207,.321,.419])bar.add(ring(.026,.003,x,y,z),C.red,M.gloss);
  }
  bar.add(zlathe([[0,.184],[.071,.184],[.071,.198],[0,.198]],0,axis),C.red,M.gloss);
  p.add(box(.104,.016,.165,0,-.013,.123),C.black);
  // Tall, outward tilted metal reservoir, two straps and a feed hose.
  const tank=at(lathe([[0,-.14],[.056,-.14],[.062,-.128],[.062,.128],[.056,.14],[0,.14]],24).rotateZ(-.22),.130,.145,-.041);
  p.add(tank,C.silver,M.metal);
  for(const y of [.100,.144])p.add(at(torus(.063,.004,5,24).rotateX(Math.PI/2).rotateZ(-.22),.130,y,-.041),C.black);
  p.add(pipe([[.120,.004,-.039],[.131,-.047,-.051],[.070,-.065,.050],[.035,.020,.070]],.009),C.yellow,M.gloss);
  p.add(pipe([[-.027,.081,-.016],[-.038,.147,.009],[.021,.147,.034],[.032,.082,.065]],.008),C.yellow);
  for(let k=0;k<6;k++)p.add(at(torus(.014,.003,4,12).rotateX(Math.PI/2),-.056,.005+k*.013,.092),C.silver,M.metal);
  i.add(box(.028,.064,.014,.139,.175,.021));
  return retainChannels(d,p,i,{barrels:part(bar,[0,axis,.300])});
}
function recolor(g,map){
  if(!g)return;const a=g.attributes.color;if(!a)return;
  const pairs=map.map(([from,to])=>[new THREE.Color(from),new THREE.Color(to)]);
  for(let n=0;n<a.count;n++)for(const [f,t]of pairs){
    if(Math.abs(a.getX(n)-f.r)+Math.abs(a.getY(n)-f.g)+Math.abs(a.getZ(n)-f.b)<.005){a.setXYZ(n,t.r,t.g,t.b);break;}
  }a.needsUpdate=true;
}
function roller(d){
  // Keep the verified wide drum, exact grip locations and articulated hinge.
  // Purple frame / yellow bearings / pale metal reservoir follow the base Roller.
  const map=[['#5b616c',C.purple],['#2a2e37',C.purple],['#1b1e25',C.black],['#c3c9d2',C.yellow]];
  recolor(d.body,map);recolor(d.drumCaps,map);
  for(const p of Object.values(d.parts||{}))recolor(p.src,map);
  const reservoir=d.parts?.hingeInk;
  if(reservoir){reservoir.mat='body';recolor(reservoir.src,[['#ffffff',C.cream]]);}
  d.referenceWeapon=REFERENCE_WEAPONS.roller;return d;
}
const BUILD={shooter,charger,blaster,dualies,slosher,splatling,roller};
export function referenceWeaponModel(d){if(!BUILD[d.kind])throw Error('Unknown reference weapon '+d.kind);return BUILD[d.kind](d);}
