// Dapple NOC-T visual-only correction; the accepted Dapple base is unchanged.
// Official 1920x1080 rotating reference and remaining proportion limits are in
// ../../reference/weapon-variant-dapple-noct.json. Anchors stay native.
import { Pieces, M, box, sphere, zlathe, zcyl, ring, cyl, pipe, slab, pistolGrip,
  TRIGGER_PIVOT,part,rebuild } from './kit.mjs';
import { MODELS as DUALIES } from './dualies.mjs';
const C={edge:'#383448',brown:'#75634b',metal:'#737d7c',black:'#252a2b',white:'#e4e8d9',orange:'#ed6535',lens:'#c8d171'};
const upper=[[-.045,.06],[-.03,.09],[.03,.1],[.075,.095],[.105,.07],[.112,.02],[.108,-.045],[.09,-.05],[.085,0],[.075,.05],[.04,.06],[0,.056]];
const upperWindows=[[[-.025,.069],[-.024,.083],[-.006,.086],[-.006,.067]],[[.004,.067],[.004,.086],[.031,.089],[.037,.071],[.027,.065]]];
const skid=[[-.132,-.057],[-.115,-.071],[-.07,-.08],[-.015,-.078],[.038,-.067],[.056,-.087],[.068,-.101],[.043,-.09],[-.014,-.097],[-.071,-.096],[-.116,-.085],[-.139,-.069]];
const skidWindows=[[[-.087,-.082],[-.051,-.084],[-.048,-.091],[-.083,-.09]],[[-.038,-.084],[-.008,-.083],[.015,-.078],[.022,-.085],[-.006,-.091],[-.035,-.091]]];
function build(d){
 const body=new Pieces(),ink=new Pieces();
 const trig=pistolGrip(body,{color:C.black,triggerColor:'#1a1b1f',guard:false});
 body.add(box(.023,.024,.033,0,.048,0,.2,6,4),C.black,M.satin);
 body.add(box(.025,.022,.038,0,-.069,-.014,.2,6,4),C.black,M.satin);
 body.add(slab(upper,.032,0,.002,upperWindows),C.edge,M.satin);
 body.add(slab(skid,.032,0,.0015,skidWindows),C.edge,M.satin);
 for(const side of [-1,1]){
  // Separate inner brown and outer grey panels retain a dark frame border.
  const panel=side<0?C.brown:C.metal,x=side*.0165;
  body.add(slab(upper,.001,x,.0001,upperWindows),panel,M.satin);
  body.add(slab(skid,.001,x,.0001,skidWindows),panel,M.satin);
  // The long upper inlay stays white beside lime bristles in the official
  // rotation. Do not inherit the base's team-ink stripe assignment.
  body.add(pipe([[x+side*.001,.091,-.022],[x+side*.001,.093,.015],[x+side*.001,.085,.06]],.003,16,6),C.white,M.print);
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
 body.add(pipe([[0,.11,-.035],[0,.125,-.084],[0,.124,-.131]],.0018,18,5),C.black,M.satin);
 body.add(pipe([[0,.11,-.035],[0,.118,-.084],[0,.118,-.131]],.0018,18,5),C.black,M.satin);
 body.add(cyl(.0014,[0,.119,-.079],[0,.125,-.085],6),C.black,M.satin);
 body.add(cyl(.0014,[0,.118,-.129],[0,.126,-.131],6),C.black,M.satin);
 body.add(cyl(.0008,[0,.123,-.13],[0,.061,-.192],8),C.white,M.satin);
 // Swept toothbrush arm: orange edge, dark grey inset, orange foot ridges.
 const brush=[[-.133,-.071],[-.145,-.062],[-.165,-.018],[-.182,.023],[-.199,.052],[-.195,.062],[-.181,.046],[-.165,.017],[-.151,-.019],[-.138,-.051],[-.122,-.064]];
 body.add(slab(brush,.017,0,.0015),C.orange,M.gloss);
 for(const side of [-1,1])body.add(slab([[-.141,-.047],[-.159,-.009],[-.177,.032],[-.191,.053],[-.185,.047],[-.17,.02],[-.154,-.018],[-.142,-.051]],.001,side*.009,.0001),C.metal,M.satin);
 for(let j=0;j<4;j++)body.add(box(.02,.002,.012,0,-.047+j*.006,-.145-j*.003,.1,4,4),C.orange,M.gloss);
 // Rows of bristle bundles keep the native team color without frozen lime.
 for(let x=0;x<4;x++)for(let z=0;z<4;z++)ink.add(box(.006,.026,.007,0,0,0,.08,4,4).rotateX(-.35).translate(-.0105+x*.007,.047-z*.004,-.207+z*.007));
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
