// Private placement diagnostics. A binding is explicit: an actor-local mesh
// may be instantiated only from a supplied Banc transform. No stage is enabled.
const LAYERS=Object.freeze({turf:'Pnt',zones:'Var',tower:'Vlf',rainmaker:'Vgl',clams:'Vcl'});
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const vec=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const id=v=>typeof v==='string'&&v.length<=20&&/^(0|[1-9][0-9]*)$/.test(v)&&BigInt(v)<=18446744073709551615n;
const multiply=(a,b)=>Array.from({length:9},(_,i)=>{const r=Math.floor(i/3),c=i%3;return a[r*3]*b[c]+a[r*3+1]*b[c+3]+a[r*3+2]*b[c+6];});
function rotation(angles,order){
 let r=[1,0,0,0,1,0,0,0,1];
 for(const axis of order){const t=angles['XYZ'.indexOf(axis)],c=Math.cos(t),s=Math.sin(t);
  r=multiply(r,axis==='X'?[1,0,0,0,c,-s,0,s,c]:axis==='Y'?[c,0,s,0,1,0,-s,0,c]:[c,-s,0,s,c,0,0,0,1]);
 }return r;
}

export function applySourcePlacements(geometry,placement,plan,geometrySha256){
 if(placement?.schema!==1||placement.diagnosticOnly!==true||placement.versionVerified!==false||
    placement.sourceDocument?.format!=='decoded-banc-json'||!hash(placement.sourceDocument.sha256)||typeof placement.referenceVersion!=='string'||!placement.referenceVersion||
    !Array.isArray(placement.actors)||!Array.isArray(placement.rails)||!Array.isArray(placement.unresolvedRailPoints))throw Error('Unsupported normalized Banc placement');
 if(plan?.schema!==1||!hash(geometrySha256)||plan.sourceObjSha256!==geometrySha256||plan.placementSha256!==placement.sourceDocument.sha256||
    plan.stageId!==placement.stageId||!Object.hasOwn(LAYERS,plan.rule)||plan.objectSpace!=='actor-local'||
    !['XYZ','XZY','YXZ','YZX','ZXY','ZYX'].includes(plan.eulerOrder)||
    ![plan.vertexScale,plan.translationScale].every(x=>Number.isFinite(x)&&x>0)||!Array.isArray(plan.bindings)||!plan.bindings.length)throw Error('Placement plan lacks matching source identities or explicit coordinate convention');
 if(placement.unresolvedRailPoints.length)throw Error('Unresolved Banc rail points: cannot instantiate incomplete placement');
 const actors=new Map(),objects=new Map();
 for(const a of placement.actors){
  if(!id(a.id)||actors.has(a.id)||!vec(a.translate)||!vec(a.rotate)||!vec(a.scale)||a.scale.some(x=>x===0)||typeof a.layer!=='string')throw Error('Invalid or duplicate Banc actor');
  actors.set(a.id,a);
 }
 for(const o of geometry.objects){if(objects.has(o.name))throw Error('Ambiguous source OBJ object: '+o.name);objects.set(o.name,o);}
 const bound=new Map(),pairs=new Set();
 for(const b of plan.bindings){
  if(!b||typeof b.object!=='string'||!objects.has(b.object)||!id(b.actor)||!actors.has(b.actor))throw Error('Unknown object or actor in placement binding');
  if(!['Cmn',...Object.values(LAYERS)].includes(actors.get(b.actor).layer))throw Error('Unsupported bound Banc layer');
  const pair=JSON.stringify([b.object,b.actor]);if(pairs.has(pair))throw Error('Duplicate placement binding');pairs.add(pair);
  const list=bound.get(b.object)||[];list.push(actors.get(b.actor));bound.set(b.object,list);
 }
 const rows=[];
 for(const o of geometry.objects){
  const a=bound.get(o.name);
  if(!a)rows.push({object:o,actor:null});
  else for(const actor of a)if(actor.layer==='Cmn'||actor.layer===LAYERS[plan.rule])rows.push({object:o,actor});
 }
 const vertices=new Float32Array(rows.reduce((n,r)=>n+r.object.vc*8,0));
 const indices=new Uint32Array(rows.reduce((n,r)=>n+r.object.ic,0)),result=[];let vo=0,io=0;
 for(const {object:o,actor:a} of rows){
  const R=a?rotation(a.rotate,plan.eulerOrder):null,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  const name=a?o.name+'@Banc:'+a.id:o.name;
  for(let j=0;j<o.vc;j++){
   const src=(o.vo+j)*8,dst=(vo+j)*8;vertices.set(geometry.vertices.subarray(src,src+8),dst);
   if(a){
    const x=geometry.vertices[src]*a.scale[0]*plan.vertexScale,y=geometry.vertices[src+1]*a.scale[1]*plan.vertexScale,z=geometry.vertices[src+2]*a.scale[2]*plan.vertexScale;
    const nx=geometry.vertices[src+3]/a.scale[0],ny=geometry.vertices[src+4]/a.scale[1],nz=geometry.vertices[src+5]/a.scale[2];
    const n=[R[0]*nx+R[1]*ny+R[2]*nz,R[3]*nx+R[4]*ny+R[5]*nz,R[6]*nx+R[7]*ny+R[8]*nz],length=Math.hypot(...n);
    if(!(length>0&&Number.isFinite(length)))throw Error('Invalid transformed source normal');
    vertices[dst]=R[0]*x+R[1]*y+R[2]*z+a.translate[0]*plan.translationScale;
    vertices[dst+1]=R[3]*x+R[4]*y+R[5]*z+a.translate[1]*plan.translationScale;
    vertices[dst+2]=R[6]*x+R[7]*y+R[8]*z+a.translate[2]*plan.translationScale;
    for(let k=0;k<3;k++)vertices[dst+3+k]=n[k]/length;
   }
   for(let k=0;k<3;k++){min[k]=Math.min(min[k],vertices[dst+k]);max[k]=Math.max(max[k],vertices[dst+k]);}
  }
  indices.set(geometry.indices.subarray(o.io,o.io+o.ic),io);
  if(a&&a.scale[0]*a.scale[1]*a.scale[2]<0)for(let j=io;j<io+o.ic;j+=3){const swap=indices[j+1];indices[j+1]=indices[j+2];indices[j+2]=swap;}
  result.push({...o,name,vo,io,bounds:[min,max],...(a?{placementActor:a.id,placementLayer:a.layer,sourceObject:o.name}:{})});
  vo+=o.vc;io+=o.ic;
 }
 if(!vertices.every(Number.isFinite))throw Error('Placement exceeds finite Float32 geometry');
 return {vertices,indices,objects:result,placementReceipt:{schema:1,diagnosticOnly:true,versionVerified:false,
  sourceObjSha256:geometrySha256,placementSha256:placement.sourceDocument.sha256,referenceVersion:placement.referenceVersion,
  stageId:plan.stageId,rule:plan.rule,layer:LAYERS[plan.rule],objectSpace:plan.objectSpace,
  eulerOrder:plan.eulerOrder,vertexScale:plan.vertexScale,translationScale:plan.translationScale,
  boundObjects:bound.size,instances:rows.filter(r=>r.actor).length,
  movementSimulated:false,unboundSourceGeometry:'preserved with existing classification',collisionStatus:'transformed display geometry; native collision unverified',paintStatus:'inferred masks; native masks unavailable'}};
}
