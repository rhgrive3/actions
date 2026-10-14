// Dapple NOC-T visual-only correction; the accepted Dapple base is unchanged.
// Official 1920x1080 rotating reference and remaining proportion limits are in
// ../../reference/weapon-variant-dapple-noct.json. Anchors stay native.
import { Pieces, M, box, sphere, zlathe, zcyl, ring, cyl, pipe, slab, pistolGrip,
  TRIGGER_PIVOT,part,rebuild,smoothOutline,lathe,smoothProfile } from './kit.mjs';
import { MODELS as DUALIES } from './dualies.mjs';
const C={edge:'#383448',brown:'#75634b',metal:'#737d7c',black:'#252a2b',white:'#e4e8d9',orange:'#ed6535',lens:'#c8d171'};
// Paused official 6.93s side/three-quarter reference: rounded upper neck,
// compact rear elbow and open lower skid. Dimensions remain authored estimates.
const upper=[[-.045,.065],[-.033,.105],[-.012,.113],[.025,.104],[.062,.085],[.091,.062],
 [.108,.042],[.103,.008],[.086,-.015],[.072,-.037],[.066,-.049],[.061,-.043],[.062,-.022],
 [.078,.004],[.085,.028],[.070,.052],[.035,.071],[.002,.075],[-.017,.067]];
const upperWindows=[[[-.027,.08],[-.024,.097],[-.008,.099],[-.006,.079]],[[.007,.081],[.008,.098],[.031,.091],[.039,.081],[.029,.074]]];
const skid=[[-.108,-.06],[-.095,-.073],[-.063,-.082],[-.019,-.079],[.027,-.068],[.045,-.077],
 [.065,-.101],[.043,-.094],[.012,-.092],[-.026,-.099],[-.066,-.101],[-.100,-.09],[-.116,-.073]];
const skidWindows=[[[-.087,-.083],[-.055,-.087],[-.054,-.094],[-.085,-.09]],
 [[-.040,-.087],[-.009,-.084],[.015,-.078],[.023,-.085],[-.007,-.094],[-.037,-.094]]];
const rounded=(p,n=48)=>smoothOutline(p,n);
function build(d){
 const body=new Pieces(),ink=new Pieces();
 // Obtain the native trigger unchanged, but replace only the cosmetic grip.
 const discardedGrip=new Pieces(),trig=pistolGrip(discardedGrip,{color:C.black,triggerColor:'#1a1b1f',guard:false});
 for(const g of discardedGrip.list)g.dispose();
 const grip=lathe(smoothProfile([[0,-.055],[.019,-.055],[.022,-.049],[.018,-.034],
 [.015,-.005],[.017,.021],[.022,.041],[.020,.047],[0,.047]],28),20);
 grip.scale(.76,1,1).rotateX(Math.atan2(.25,1)).translate(0,-.008,-.002);
 body.add(grip,C.black,M.satin); // Smooth source surface, not the rubber knurl shader.
 body.add(box(.023,.024,.033,0,.048,0,.2,6,4),C.black,M.satin);
 body.add(box(.025,.022,.038,0,-.069,-.014,.2,6,4),C.black,M.satin);
 body.add(slab(rounded(upper,32),.032,0,.002,upperWindows.map(h=>rounded(h,12))),C.edge,M.satin);
 body.add(slab(rounded(skid,32),.032,0,.0015,skidWindows.map(h=>rounded(h,12))),C.edge,M.satin);
 for(const side of [-1,1]){
  // Separate inner brown and outer grey panels retain a dark frame border.
  const panel=side<0?C.brown:C.metal,x=side*.0165;
  body.add(slab(rounded(upper,32),.001,x,.0001,upperWindows.map(h=>rounded(h,12))),panel,M.satin);
  body.add(slab(rounded(skid,32),.001,x,.0001,skidWindows.map(h=>rounded(h,12))),panel,M.satin);
  // The long upper inlay stays white beside lime bristles in the official
  // rotation. Do not inherit the base's team-ink stripe assignment.
  body.add(pipe([[x+side*.001,.104,-.022],[x+side*.001,.102,.015],[x+side*.001,.080,.06]],.003,16,6),C.white,M.print);
  for(const z of [-.027,.047])body.add(sphere(.0025,.0025,.0025,x+side*.001,.064,z,8,4),'#c2c6bf',M.metal);
 }
 // Original nozzle location and bore are retained so bullets do not emerge
 // ahead of/behind a new cosmetic muzzle. Full frame re-proportioning pending.
 body.add(zlathe([[0,.085],[.028,.085],[.031,.095],[.031,.118],[.026,.124],[0,.124]],0,.066,0,22),C.black,M.satin);
 body.add(zlathe([[.006,.123],[.02,.123],[.02,.127],[.006,.128]],0,.066,0,20),C.metal,M.metal);
 body.add(zcyl(.0058,.125,.128,0,.066,16),'#101518',M.satin);
 for(let i=0;i<12;i++){const a=i*Math.PI/6;body.add(box(.004,.004,.018,Math.cos(a)*.031,.066+Math.sin(a)*.031,.106,.2,4,4),'#3b4244',M.satin);}
 // Rear top valve and a hollow truss boom. A taut light cord, rather than the
 // Classic approximation's short curved grey wire, suspends the brush tip.
 body.add(cyl(.006,[0,.094,-.018],[0,.132,-.027],14),C.black,M.satin);
 body.add(cyl(.0045,[0,.132,-.027],[0,.139,-.029],12),'#b8bfba',M.metal);
 body.add(pipe([[0,.11,-.035],[0,.125,-.070],[0,.124,-.110]],.0018,18,5),C.black,M.satin);
 body.add(pipe([[0,.11,-.035],[0,.118,-.070],[0,.118,-.110]],.0018,18,5),C.black,M.satin);
 body.add(cyl(.0014,[0,.119,-.065],[0,.125,-.071],6),C.black,M.satin);
 body.add(cyl(.0014,[0,.118,-.108],[0,.126,-.110],6),C.black,M.satin);
 body.add(cyl(.0008,[0,.123,-.110],[0,.067,-.158],8),C.white,M.satin);
 // Swept toothbrush arm: orange edge, dark grey inset, orange foot ridges.
 const brush=[[-.100,-.066],[-.114,-.059],[-.124,-.043],[-.128,-.014],[-.137,.016],
 [-.153,.037],[-.171,.051],[-.172,.061],[-.159,.066],[-.145,.053],[-.126,.032],
 [-.118,.009],[-.113,-.019],[-.105,-.042],[-.091,-.054]];
 body.add(slab(rounded(brush,40),.022,0,.0015),C.orange,M.gloss);
 const brushInset=[[-.105,-.049],[-.117,-.030],[-.122,-.003],[-.131,.021],[-.147,.042],
 [-.164,.055],[-.158,.058],[-.141,.043],[-.125,.021],[-.118,-.003],[-.112,-.029]];
 for(const side of [-1,1])body.add(slab(rounded(brushInset,28),.001,side*.0115,.0001),C.metal,M.satin);
 for(let j=0;j<4;j++)body.add(box(.026,.0025,.014,0,-.048+j*.006,-.105-j*.003,.2,4,4),C.orange,M.gloss);
 // Broad team-ink head under the compact elbow, visible as separate bundles.
 for(let x=0;x<5;x++)for(let z=0;z<5;z++)ink.add(box(.006,.031,.008,0,0,0,.18,4,4).rotateX(-.50)
  .translate(-.014+x*.007,.044-z*.003,-.180+z*.008));
 // Large front-facing cup light on a coiled metal bracket, separate from the
 // firing nozzle. It has a convex yellow lens and narrow stepped black rim.
 body.add(pipe([[0,.096,.065],[0,.114,.073],[0,.123,.064],[0,.137,.075]],.003,16,7),C.metal,M.metal);
 body.add(zlathe([[0,.055],[.018,.055],[.032,.067],[.043,.082],[.044,.119],[.041,.125],[.034,.125],[.034,.117],[0,.117]],0,.174,0,28),C.black,M.satin);
 body.add(sphere(.035,.035,.006,0,.174,.119,24,12),C.lens,M.lens);
 body.add(ring(.038,.002,0,.174,.124,'z',6,28),'#4b5149',M.satin);
 body.add(box(.014,.009,.033,0,.22,.082,.2,6,4),C.black,M.satin);
 // Bounded abstract mark on each lamp flank; exact Barazushi art is deferred.
 for(const side of [-1,1]){
  body.add(slab([[.075,.17],[.097,.185],[.107,.179],[.083,.163]],.001,side*.043,.0001),'#e86636',M.print);
  body.add(slab([[.078,.173],[.097,.181],[.094,.173],[.104,.176]],.001,side*.044,0),C.white,M.print);
 }
 return rebuild(d,{body,ink,parts:{trigger:part(trig,TRIGGER_PIVOT)},muzzle:[0,.066,.13]});
}
const base=DUALIES['s3-maneuver-short'];
export const FOLLOWUP_MODELS=Object.freeze({Maneuver_Short_02:Object.freeze({...base,
 sourceRow:'Maneuver_Short_02',baseId:'s3-maneuver-short',name:'Dapple Dualies NOC-T',
 sourceUrl:'https://splatoonwiki.org/wiki/File:S3_Dapple_Dualies_NOC-T_model_rotating.mp4',build,
})});
