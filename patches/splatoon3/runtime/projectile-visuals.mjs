import { PROJECTILE_VISUAL_SOURCE } from './projectile-visual-source-data.mjs';

// Visual reconstruction only. Extracted DrawSizeParam/tail frames are read
// verbatim; cross-section topology, Hermite smoothing and liquid links are
// INKWAVE approximations. Source coordinates use the existing provisional 1:1
// conversion, not measured metres. Hoian EP02 demonstrates history stripes,
// but its unidentified asset is NOT evidence that these weapons use that mesh.
export const HISTORY_HZ = 60;
export const HISTORY_CAPACITY = 32;
export const VISUAL_RECONSTRUCTION_STATUS = 'notRetailComparison';
// Retain the previous production framing while changing topology. These are
// UNSOURCED presentation calibrations, not extra source DrawSizeParam fields or
// Nintendo mesh widths. Source records remain available verbatim below.
export const VISUAL_WIDTH_CALIBRATION = Object.freeze({shooter:.7,bucket:.5});
const DT = 1 / HISTORY_HZ, EPS = 1e-9;
const RINGS = 13, SIDES = 12, BODY_VERTICES = RINGS * SIDES;
const SECTION_COS=new Float64Array(SIDES),SECTION_SIN=new Float64Array(SIDES);
for(let i=0;i<SIDES;i++){SECTION_COS[i]=Math.cos(i/SIDES*Math.PI*2);SECTION_SIN[i]=Math.sin(i/SIDES*Math.PI*2);}
const BASE_ACTOR = Object.freeze({ shooter:'WeaponShooterNormal', dualies:'WeaponManeuverDual',
  splatling:'WeaponSpinnerStandard', roller:'WeaponRollerNormal', slosher:'WeaponSlosherStrong' });
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const actorOf = p => p.catalog?.r?.sourceActor || p.s3Weapon?.sourceActor || BASE_ACTOR[p.wid];
const sourceOf = p => PROJECTILE_VISUAL_SOURCE[actorOf(p)];
// Wall-drop owns a separate source-frame clock while gameplay deliberately
// freezes flight age. The visual timeline follows that clock without editing
// the projectile age, integration, collision, paint or network state.
const visualAge = p => finite(p?.age)+finite(p?.fidelityWallDrop?.frame)/HISTORY_HZ;
function renderAge(p, alpha) {
  // A stalled remote peer stays at its playback endpoint; every connected
  // surface must use the same clock as its head, including wall-drop links.
  const viewAlpha=p.ghost&&p._netPeer?1:alpha,h=p._iwVisualHistory;
  return Math.max(h.oldestAge,Math.min(h.latestAge,visualAge(p)-DT*(1-viewAlpha)));
}
let visualUUIDState=0x117630b7;
function visualUUIDRandom() {
  // THREE generates resource UUIDs with global Math.random. Keep constructor
  // UUID draws on an isolated cosmetic stream so match RNG state/order stays
  // byte-for-byte unchanged, including the very first shot after bootstrap.
  let x=visualUUIDState;x^=x<<13;x^=x>>>17;x^=x<<5;visualUUIDState=x>>>0;
  return visualUUIDState/0x100000000;
}

// Fixed-capacity time/position/velocity ring. No vectors, arrays or callbacks
// are allocated by record/sample; tangents come from actual physics velocity.
export class ProjectileHistory {
  constructor() { this.data = new Float64Array(HISTORY_CAPACITY * 7); this.reset(); }
  reset() { this.count = 0; this.next = 0; this.latestAge = 0; }
  record(age, x, y, z, vx, vy, vz) {
    if (!Number.isFinite(age) || !Number.isFinite(x+y+z+vx+vy+vz)) return false;
    if (this.count && age < this.latestAge - EPS) return false;
    let i;
    if (this.count && Math.abs(age - this.latestAge) <= EPS)
      i = (this.next + HISTORY_CAPACITY - 1) % HISTORY_CAPACITY;
    else { i=this.next; this.next=(i+1)%HISTORY_CAPACITY; this.count=Math.min(HISTORY_CAPACITY,this.count+1); }
    const o=i*7, a=this.data;
    a[o]=age; a[o+1]=x; a[o+2]=y; a[o+3]=z; a[o+4]=vx; a[o+5]=vy; a[o+6]=vz;
    this.latestAge=age; return true;
  }
  get oldestAge() { return this.count ? this.data[((this.next-this.count+HISTORY_CAPACITY)%HISTORY_CAPACITY)*7] : 0; }
  sample(age, out, offset=0) {
    if (!this.count) { for(let j=0;j<6;j++)out[offset+j]=0; return false; }
    const a=this.data, first=(this.next-this.count+HISTORY_CAPACITY)%HISTORY_CAPACITY;
    let lo=first*7, hi=lo;
    for(let j=1;j<this.count;j++) {
      hi=((first+j)%HISTORY_CAPACITY)*7;
      if(a[hi]>=age-EPS)break;
      lo=hi;
    }
    if(age<=a[first*7] || age>=this.latestAge || hi===lo) {
      const o=age<=a[first*7]?first*7:((this.next+HISTORY_CAPACITY-1)%HISTORY_CAPACITY)*7;
      for(let j=0;j<6;j++)out[offset+j]=a[o+j+1]; return true;
    }
    const span=a[hi]-a[lo], u=clamp((age-a[lo])/Math.max(EPS,span)), u2=u*u, u3=u2*u;
    const h00=2*u3-3*u2+1, h10=u3-2*u2+u, h01=-2*u3+3*u2, h11=u3-u2;
    for(let j=0;j<3;j++) {
      const delta=a[hi+1+j]-a[lo+1+j];
      let m0=span*a[lo+4+j],m1=span*a[hi+4+j];
      // Bounded Hermite tangents prevent a collision-truncated segment from
      // overshooting beyond its final contact sample. This slope limiter is an
      // INKWAVE interpolation choice, not recovered Nintendo effect code.
      if(Math.abs(delta)<EPS){m0=0;m1=0;}
      else {
        if(m0*delta<0)m0=0;if(m1*delta<0)m1=0;
        const q=Math.hypot(m0/delta,m1/delta);
        if(q>3){m0*=3/q;m1*=3/q;}
      }
      out[offset+j]=h00*a[lo+1+j]+h10*m0+h01*a[hi+1+j]+h11*m1;
      out[offset+3+j]=((6*u2-6*u)*a[lo+1+j]+(3*u2-4*u+1)*m0+
        (-6*u2+6*u)*a[hi+1+j]+(3*u2-2*u)*m1)/Math.max(EPS,span);
    }
    return true;
  }
}

export function projectileVisualKind(p) {
  if (!p || p.s3SpecialWeapon || p.type==='kit' || p.type==='blast') return 'legacy';
  const actor=actorOf(p), family=p.catalog?.r?.family || p.s3Weapon?.kind;
  if(actor==='WeaponSlosherBathtub')return 'bubble';
  if(actor==='WeaponSlosherLauncher')return 'spiral';
  if(actor==='WeaponSlosherWashtub')return 'explosive';
  if(actor==='WeaponSlosherDiffusion')return 'tri-sheet';
  if(actor==='WeaponSlosherDouble')return 'paired-sheet';
  if(actor==='WeaponSlosherStrong' || p.type==='slosh' && p.wid==='slosher') {
    const u=p.catalog?.descriptor?.unit;
    return u!=null ? (u===2?'bucket-rear':'bucket-front') :
      (finite(p.fidelitySloshPacketIndex,-1)>=4 || p.fidelitySloshUnit?.UnitDelayFrame===4 ? 'bucket-rear':'bucket-front');
  }
  if(family==='roller'||family==='brush'||p.type==='drop'&&p.wid==='roller')
    return p.catalog?.descriptor?.key==='vertical'||p.fidelityMode==='vertical'?'roller-vertical':'roller-horizontal';
  if(family==='shooter'||family==='dualies'||family==='splatling'||p.type==='shot'&&(p.wid==='shooter'||p.wid==='dualies'||p.wid==='splatling'))return 'shooter';
  return 'legacy';
}

function drawRecord(p) {
  if(p.fidelitySloshDraw)return p.fidelitySloshDraw;
  if(p.fidelityDrawRadius&&!p.catalog&&(p.fidelityMode==='horizontal'||p.fidelityMode==='vertical'||p.wid==='roller'))return p.fidelityDrawRadius;
  const source=sourceOf(p), descriptor=p.catalog?.descriptor;
  if(!source)return null;
  if(descriptor) {
    const key=descriptor.key;
    const name=key==='slosh'?'UnitGroupParam':key==='vertical'?'VerticalSwingUnitGroupParam':
      key==='horizontal'?'WideSwingUnitGroupParam':key==='brush'?'SwingUnitGroupParam':null;
    if(name) {
      const group=name==='UnitGroupParam'?'slosh':name==='VerticalSwingUnitGroupParam'?'vertical':name==='WideSwingUnitGroupParam'?'wide':'brush';
      return source[group]?.[descriptor.unit]?.drawSize || null;
    }
  }
  return source.drawSize || null;
}
export function projectileDrawRadius(p, age=finite(p?.age)) {
  const d=drawRecord(p), index=p.catalog?.descriptor?.index ?? p.fidelitySloshIndex ?? 0;
  if(d) {
    const init=finite(d.initRadius,finite(d.InitRadius))+index*finite(d.AfterOffsetInitRadius);
    const end=finite(d.endRadius,finite(d.EndRadius,init))+index*finite(d.AfterOffsetEndRadius);
    const duration=finite(d.changeTime,finite(d.ChangeFrame)/HISTORY_HZ);
    // Retain the existing ChangeFrame=0 immediate-EndRadius convention. A
    // zero/negative authored companion envelope is invisible, not hit-size ink.
    return Math.max(0,init+(end-init)*(duration>0?clamp(age/duration):1));
  }
  // Shooter sparse source omits DrawSizeParam. Existing native visual radius
  // is a labelled fallback; collision radius is never used when a record exists.
  return Math.max(0,finite(p?.vis,finite(p?.size,.1)));
}
export function projectileTailFrames(p, fallback=2) {
  const frames=sourceOf(p)?.tailLength?.MaxLengthFrame;
  // 2F Shooter/Dualies default remains approximate: no source/default table or
  // retained frame-measurement asset establishes it. Splatling explicit3F wins.
  return Number.isFinite(frames)&&frames>0?frames:fallback;
}
export function projectileVisualWidth(p, age=finite(p?.age)) {
  const kind=p?._iwVisualKind || projectileVisualKind(p);
  const calibration=kind==='shooter'?VISUAL_WIDTH_CALIBRATION.shooter:
    kind==='bucket-front'||kind==='bucket-rear'?VISUAL_WIDTH_CALIBRATION.bucket:1;
  return projectileDrawRadius(p,age)*calibration;
}
function tailLimits(p) {
  const d=drawRecord(p);
  return d;
}

export class ProjectileVisualRuntime {
  constructor(system, THREE, helpers={}) {
    this.system=system; this.THREE=THREE; this.helpers=helpers; this.capacity=700;
    this.historyPool=[]; this.trails=[]; this.trailPool=[];
    // History storage does not limit gameplay. This backend draws at most700
    // bodies (including links/tails); further bodies are omitted, as the native
    // stream also has a700-instance limit. History-pool exhaustion may route a
    // round back to that independently bounded legacy stream; it does not
    // guarantee all overflow becomes visible or improve capacity by itself.
    for(let i=0;i<this.capacity*2;i++)this.historyPool.push(new ProjectileHistory());
    for(let i=0;i<this.capacity;i++)this.trailPool.push({history:null,radius:0,endAge:0,birth:0,frames:0,r:0,g:0,b:0});
    this.stats={historiesCreated:this.historyPool.length,samplesRecorded:0,vertexCount:0,triangles:0,linkedRollerPairs:0,drawCalls:0};
    this.sample=new Float64Array(6);this.sample2=new Float64Array(6);
    this.centers=new Float64Array(RINGS*6);this.widths=new Float64Array(RINGS);
    this.thicknesses=new Float64Array(RINGS);this.cross=new Float64Array(9);
    this.renderRecords=new Array(this.capacity);this.renderRecordCount=0;
    this.groupIds=new Float64Array(this.capacity);this.groupHeads=new Int32Array(this.capacity);
    this.groupNext=new Int32Array(this.capacity);this.groupSequence=0;
    this.groupLedgerIds=new WeakMap();
    this.peerGroupOwners=new Array(this.capacity);this.peerGroupActors=new Array(this.capacity);
    this.peerGroupBirths=new Float64Array(this.capacity);this.peerGroupIds=new Float64Array(this.capacity);
    this.peerGroupNext=0;
    this.lastAlpha=1;this.disposed=false;
    // One opaque CPU-mesh batch. Stored positions/normals are the same geometry
    // in beauty, shadow, depth and override-normal passes: no invisible shader
    // displacement and no per-projectile draw calls.
    const savedRandom=Math.random;
    // Synchronous construction only; no gameplay callbacks run under this
    // stream. Restore even on constructor failure before scene notifications.
    try {
    Math.random=visualUUIDRandom;
    const count=this.capacity*BODY_VERTICES, geo=this.geometry=new THREE.BufferGeometry();
    this.position=new THREE.BufferAttribute(new Float32Array(count*3),3);
    this.normal=new THREE.BufferAttribute(new Float32Array(count*3),3);
    this.color=new THREE.BufferAttribute(new Float32Array(count*3),3);
    for(const attr of [this.position,this.normal,this.color])attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position',this.position);geo.setAttribute('normal',this.normal);geo.setAttribute('color',this.color);
    const indices=new Uint32Array(this.capacity*(RINGS-1)*SIDES*6);
    let n=0;
    for(let body=0;body<this.capacity;body++)for(let ring=0;ring<RINGS-1;ring++)for(let side=0;side<SIDES;side++) {
      const a=body*BODY_VERTICES+ring*SIDES+side,b=body*BODY_VERTICES+ring*SIDES+(side+1)%SIDES;
      indices[n++]=a;indices[n++]=b;indices[n++]=a+SIDES;
      indices[n++]=b;indices[n++]=b+SIDES;indices[n++]=a+SIDES;
    }
    geo.setIndex(new THREE.BufferAttribute(indices,1));geo.setDrawRange(0,0);
    this.material=new THREE.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,roughness:.14,clearcoat:1,
      clearcoatRoughness:.04,envMapIntensity:1.15});
    this.mesh=new THREE.Mesh(geo,this.material);this.mesh.frustumCulled=false;this.mesh.castShadow=true;
    this.mesh.visible=false;
    } finally { Math.random=savedRandom; }
    system.scene.add(this.mesh);
    this.ranges=[{start:0,count:0},{start:0,count:0},{start:0,count:0}];
    this.attributes=[this.position,this.normal,this.color];
    const geometryBytes=this.position.array.byteLength+this.normal.array.byteLength+
      this.color.array.byteLength+this.geometry.index.array.byteLength;
    this.stats.bufferBudget={historyBytes:this.capacity*2*HISTORY_CAPACITY*7*8,
      cpuGeometryBytes:geometryBytes,gpuGeometryBytes:geometryBytes,
      auxiliaryTypedBytes:this.sample.byteLength+this.sample2.byteLength+this.centers.byteLength+
        this.widths.byteLength+this.thicknesses.byteLength+this.cross.byteLength+this.groupIds.byteLength+
        this.groupHeads.byteLength+this.groupNext.byteLength+this.peerGroupBirths.byteLength+this.peerGroupIds.byteLength};
  }
  reset(p) {
    if(p._iwVisualHistory){this.historyPool.push(p._iwVisualHistory);p._iwVisualHistory=null;}
    p._iwVisualStartAge=0;p._iwVisualNextSample=0;p._iwVisualBeforeAge=0;
    p._iwVisualBeforeX=p._iwVisualBeforeY=p._iwVisualBeforeZ=0;
    p._iwVisualBeforeVX=p._iwVisualBeforeVY=p._iwVisualBeforeVZ=0;
    p._iwVisualKind=null;p._iwVisualOrdinal=null;p._iwVisualGroup=0;p._iwVisualLastNetStep=-1;
  }
  handles(p) { return !!p._iwVisualHistory && p._iwVisualKind!=='legacy'; }
  ensureBirth(p) {
    if(p._iwVisualHistory)return true;
    // Deferred Bucket rounds have no authoritative muzzle until their actual
    // physics birth refresh. Do not draw a connection to the enqueue position.
    if(p.delay>0||p._s3SloshBirthPending)return false;
    const kind=p._iwVisualKind || projectileVisualKind(p);p._iwVisualKind=kind;
    if(kind==='legacy')return false;
    const h=this.historyPool.pop();if(!h)return false;
    h.reset();p._iwVisualHistory=h;p._iwVisualNextSample=visualAge(p)+DT;
    h.record(visualAge(p),p.pos.x,p.pos.y,p.pos.z,p.vel.x,p.vel.y,p.vel.z);this.stats.samplesRecorded++;
    this._group(p);return true;
  }
  _group(p) {
    if(p._iwVisualGroup)return;
    const ledger=p.catalog?.volley||p.s3DamageGroup||p.vol;
    if(ledger) {
      // The render-owned weak map never writes gameplay's volley/hit ledger and
      // cannot keep its actors alive after the projectile system clears it.
      let id=this.groupLedgerIds.get(ledger);
      if(!id){id=++this.groupSequence;this.groupLedgerIds.set(ledger,id);}
      p._iwVisualGroup=id;
    } else if(p.ghost&&p._iwVisualKind==='roller-horizontal'&&p._netPeer) {
      // Legacy packets expose the same birth tick for a flick's globs but no
      // shared damage ledger. Reconstruct only visual grouping from that tick.
      const birth=finite(p._netBornTick,finite(p._netBorn)*HISTORY_HZ),actor=actorOf(p);
      for(let back=1;back<=16;back++) {
        const i=(this.peerGroupNext-back+this.capacity)%this.capacity;
        if(this.peerGroupOwners[i]===p.owner&&this.peerGroupActors[i]===actor&&this.peerGroupBirths[i]===birth){p._iwVisualGroup=this.peerGroupIds[i];return;}
      }
      const i=this.peerGroupNext;this.peerGroupNext=(i+1)%this.capacity;
      this.peerGroupOwners[i]=p.owner;this.peerGroupActors[i]=actor;this.peerGroupBirths[i]=birth;
      p._iwVisualGroup=this.peerGroupIds[i]=++this.groupSequence;
    }
  }
  beginStep(p) {
    p._iwVisualBeforeAge=visualAge(p);p._iwVisualBeforeX=p.pos.x;p._iwVisualBeforeY=p.pos.y;p._iwVisualBeforeZ=p.pos.z;
    p._iwVisualBeforeVX=p.vel.x;p._iwVisualBeforeVY=p.vel.y;p._iwVisualBeforeVZ=p.vel.z;
  }
  beginPhysicsStep(p) {
    // Native delayed-Bucket birth refresh happens inside the final gameplay
    // wrapper, after the update caller's snapshot. Capture the actual launch
    // position/velocity at the inner integration boundary, before forces run.
    // Catalog derivatives call this same observer at their own fixed-step edge.
    if(!p._iwVisualHistory)this.beginStep(p);
  }
  recordStep(p,dt=DT) {
    const kind=p._iwVisualKind||projectileVisualKind(p);p._iwVisualKind=kind;
    if(this.disposed || kind==='legacy')return;
    let h=p._iwVisualHistory;
    if(!h) {
      h=this.historyPool.pop();if(!h)return;
      h.reset();p._iwVisualHistory=h;
      // Delayed Slosher birth refreshes the muzzle inside its gameplay wrapper;
      // p.prev is the authoritative start after that refresh, not the enqueue pose.
      const birth=Math.max(0,visualAge(p)-Math.min(dt,visualAge(p)));
      p._iwVisualStartAge=birth;p._iwVisualNextSample=birth+DT;
      const refreshed=p.type==='slosh'&&p.fidelitySloshUnit;
      h.record(birth,refreshed?p.prev.x:p._iwVisualBeforeX,refreshed?p.prev.y:p._iwVisualBeforeY,refreshed?p.prev.z:p._iwVisualBeforeZ,
        p._iwVisualBeforeVX,p._iwVisualBeforeVY,p._iwVisualBeforeVZ);
      this.stats.samplesRecorded++;
    }
    this._group(p);
    const age=visualAge(p), before=finite(p._iwVisualBeforeAge), span=Math.max(EPS,age-before);
    while(p._iwVisualNextSample<=age+EPS) {
      const at=p._iwVisualNextSample,u=clamp((at-before)/span);
      // Ordinary gameplay endpoints are actual60Hz steps. The interpolation
      // here is only for fractional true-birth/attract intervals; not new physics.
      h.record(at,p._iwVisualBeforeX+(p.pos.x-p._iwVisualBeforeX)*u,p._iwVisualBeforeY+(p.pos.y-p._iwVisualBeforeY)*u,p._iwVisualBeforeZ+(p.pos.z-p._iwVisualBeforeZ)*u,
        p._iwVisualBeforeVX+(p.vel.x-p._iwVisualBeforeVX)*u,
        p._iwVisualBeforeVY+(p.vel.y-p._iwVisualBeforeVY)*u,p._iwVisualBeforeVZ+(p.vel.z-p._iwVisualBeforeVZ)*u);
      this.stats.samplesRecorded++;p._iwVisualNextSample+=DT;
    }
    // Inner fixed-tick observers run before collision resolves its exact
    // contact point. Replace the newest same-age sample with the final endpoint
    // so a retained rod cannot extend through an obstruction/target.
    if(Math.abs(h.latestAge-age)<=EPS)h.record(age,p.pos.x,p.pos.y,p.pos.z,p.vel.x,p.vel.y,p.vel.z);
    p._iwVisualLastNetStep=finite(p._netSteps,-1);
  }
  recordPhysicsPoint(p, previousAge) {
    if(this.disposed)return;
    const kind=p._iwVisualKind||projectileVisualKind(p);p._iwVisualKind=kind;
    if(kind==='legacy')return;
    let h=p._iwVisualHistory;
    if(!h){h=this.historyPool.pop();if(!h)return;h.reset();p._iwVisualHistory=h;
      h.record(previousAge,p.prev.x,p.prev.y,p.prev.z,p._iwVisualBeforeVX,p._iwVisualBeforeVY,p._iwVisualBeforeVZ);
      this.stats.samplesRecorded++;
    }
    if(h.record(p.age,p.pos.x,p.pos.y,p.pos.z,p.vel.x,p.vel.y,p.vel.z))this.stats.samplesRecorded++;
    p._iwVisualNextSample=p.age+DT;this._group(p);
  }
  release(p) {
    const h=p._iwVisualHistory;if(!h)return;
    const tail=p._iwVisualKind==='shooter'&&h.count>1?this.trailPool.pop():null;
    if(tail) {
      tail.history=h;tail.radius=projectileVisualWidth(p);tail.endAge=h.latestAge;
      tail.birth=finite(this.system.inkFlight?.time);tail.frames=projectileTailFrames(p);
      const color=p.owner?.color;tail.r=finite(color?.r,1);tail.g=finite(color?.g,1);tail.b=finite(color?.b,1);
      this.trails.push(tail);
    } else this.historyPool.push(h);
    p._iwVisualHistory=null;
  }
  _frame(dx,dy,dz) {
    const l=Math.hypot(dx,dy,dz)||1;dx/=l;dy/=l;dz/=l;
    // Parallel to world up is stable and finite; sheet thickness tracks up.
    let rx=dz,ry=0,rz=-dx,rl=Math.hypot(rx,rz);
    if(rl<EPS){rx=1;rz=0;rl=1;}
    rx/=rl;rz/=rl;
    const a=this.cross;a[0]=rx;a[1]=ry;a[2]=rz;
    a[3]=dy*rz-dz*ry;a[4]=dz*rx-dx*rz;a[5]=dx*ry-dy*rx;
    a[6]=dx;a[7]=dy;a[8]=dz;
  }
  _body(h,start,end,radius,kind,r,g,b,seed=0,petalCenter=0,petalRate=0) {
    if(!(radius>0)||this.bodies>=this.capacity)return false;
    start=Math.max(h.oldestAge,Math.min(start,end));end=Math.min(h.latestAge,end);
    const c=this.centers,w=this.widths,t=this.thicknesses;
    const isSphere=kind==='bubble'||kind==='explosive'||kind==='spiral';
    for(let ring=0;ring<RINGS;ring++) {
      const u=ring/(RINGS-1), o=ring*6;
      h.sample(isSphere?end:start+(end-start)*u,c,o);
      const speed=Math.hypot(c[o+3],c[o+4],c[o+5])||1;
      let cap=1,axial=0,width=radius,thin=1;
      if(isSphere) {const a=u*Math.PI;cap=Math.sin(a);axial=-radius*Math.cos(a);}
      else {
        const edge=1/6;
        if(u<edge){const a=(u/edge)*Math.PI/2;cap=Math.sin(a);axial=-radius*Math.cos(a);}
        else if(u>1-edge){const a=(1-u)/edge*Math.PI/2;cap=Math.sin(a);axial=radius*Math.cos(a);}
        if(kind==='bucket-front') {width*=.72+.28*Math.sin(Math.PI*u);thin=.30+.14*u;}
        else if(kind==='bucket-rear') {width*=.16+.84*Math.pow(u,1.55);thin=.12+.12*u;}
        else if(kind==='roller-horizontal'){width*=.42+.58*Math.pow(Math.sin(Math.PI*u),.4);thin=.24;}
        else if(kind==='roller-vertical'){width*=.22+.78*u;thin=.48;}
        else if(kind==='tri-sheet'){width*=.30+.70*Math.sin(Math.PI*u);thin=.30;}
        else if(kind==='paired-sheet'){width*=.38+.62*Math.sin(Math.PI*u);thin=.26;}
      }
      c[o]+=c[o+3]/speed*axial;c[o+1]+=c[o+4]/speed*axial;c[o+2]+=c[o+5]/speed*axial;
      w[ring]=width*cap;t[ring]=width*thin*cap;
    }
    this._writeBody(c,w,t,kind,r,g,b,seed,petalCenter,petalRate);return true;
  }
  _writeBody(c,w,t,kind,r,g,b,seed,petalCenter,petalRate) {
    const pa=this.position.array,na=this.normal.array,ca=this.color.array;
    const base=this.bodies++*BODY_VERTICES;
    for(let ring=0;ring<RINGS;ring++) {
      const o=ring*6,prev=Math.max(0,ring-1)*6,next=Math.min(RINGS-1,ring+1)*6;
      let dx=c[next]-c[prev],dy=c[next+1]-c[prev+1],dz=c[next+2]-c[prev+2];
      const length=Math.hypot(dx,dy,dz);
      if(length<EPS){dx=c[o+3];dy=c[o+4];dz=c[o+5];}
      this._frame(dx,dy,dz);const f=this.cross;
      const dWidth=(w[Math.min(RINGS-1,ring+1)]-w[Math.max(0,ring-1)])/Math.max(EPS,length);
      const dThin=(t[Math.min(RINGS-1,ring+1)]-t[Math.max(0,ring-1)])/Math.max(EPS,length);
      for(let side=0;side<SIDES;side++) {
        const angle=side/SIDES*Math.PI*2,cs=SECTION_COS[side],sn=SECTION_SIN[side];
        let lobe=1;
        if(kind==='roller-horizontal')lobe=.86+.14*Math.pow(Math.max(0,Math.cos(angle*5+seed*7+ring*.6)),4);
        else if(kind==='roller-vertical'&&petalCenter+petalRate>0)
          lobe=(petalCenter+petalRate*Math.max(0,Math.cos(angle*4)))/(petalCenter+petalRate);
        else if(kind==='tri-sheet')lobe=.78+.22*Math.max(0,Math.cos(angle*3+seed*3));
        else if(kind==='spiral')lobe=.86+.14*Math.cos(angle*3+ring*.75+seed*6);
        else if(kind==='explosive')lobe=.92+.08*Math.sin(angle*5+ring*1.2+seed*8);
        const x=cs*w[ring]*lobe,y=sn*t[ring]*lobe,vertex=(base+ring*SIDES+side)*3;
        pa[vertex]=c[o]+f[0]*x+f[3]*y;pa[vertex+1]=c[o+1]+f[1]*x+f[4]*y;pa[vertex+2]=c[o+2]+f[2]*x+f[5]*y;
        let nx,ny,nz;
        if(ring===0||ring===RINGS-1){const sign=ring===0?-1:1;nx=f[6]*sign;ny=f[7]*sign;nz=f[8]*sign;}
        else {
          // Cross-product of the ellipse's angular/longitudinal tangents.
          // Full geometry is stored on CPU, including taper normals. The small
          // decorative lobe derivative is approximated, not a retail normal map.
          const ax=-sn*w[ring],ay=cs*t[ring],sx=cs*dWidth,sy=sn*dThin;
          const nzLocal=ax*sy-ay*sx;
          nx=ay*f[0]-ax*f[3]+nzLocal*f[6];ny=ay*f[1]-ax*f[4]+nzLocal*f[7];nz=ay*f[2]-ax*f[5]+nzLocal*f[8];
        }
        const nl=Math.hypot(nx,ny,nz)||1;na[vertex]=nx/nl;na[vertex+1]=ny/nl;na[vertex+2]=nz/nl;
        ca[vertex]=r;ca[vertex+1]=g;ca[vertex+2]=b;
      }
    }
  }
  _drawRound(p,alpha) {
    const h=p._iwVisualHistory;if(!h||!h.count||p.delay>0)return;
    const kind=p._iwVisualKind;
    const age=renderAge(p,alpha);
    let radius=projectileVisualWidth(p,age);
    if(p.fidelitySloshDraw&&this.helpers.fidelitySlosherDrawRadius) {
      // Existing sourced fall-dependent draw scale is retained. The helper
      // reads gameplay state; render interpolation never writes p.pos/p.age.
      const current=projectileDrawRadius(p),scaled=this.helpers.fidelitySlosherDrawRadius(p);
      if(current>0)radius*=scaled/current;
    }
    let start=age;
    if(kind==='shooter')start=Math.max(0,age-projectileTailFrames(p)*DT);
    else if(kind!=='bubble'&&kind!=='explosive'&&kind!=='spiral') {
      const d=tailLimits(p),solid=finite(d?.tailSolidTime,finite(d?.TailSolidFrame,5)/HISTORY_HZ);
      const min=finite(d?.tailMin,finite(d?.TailLengthMin,0)),max=finite(d?.tailMax,finite(d?.TailLengthMax,4));
      start=Math.max(h.oldestAge,age-solid);
      h.sample(age,this.sample);h.sample(start,this.sample2);
      const length=Math.hypot(this.sample[0]-this.sample2[0],this.sample[1]-this.sample2[1],this.sample[2]-this.sample2[2]);
      if(length>max&&max>=0)start=age-(age-start)*max/Math.max(EPS,length);
      // A sourced minimum may exceed the short newborn history: bounded
      // extension follows the actual tangent, never past the recorded muzzle.
      // The minimum is intentionally not an invented speed/shrink timeline.
      if(length<min)start=Math.max(h.oldestAge,age-solid);
    }
    const color=p.owner?.color, unit=p.fidelityRollerUnit||sourceOf(p)?.vertical?.[p.catalog?.descriptor?.unit];
    this._body(h,start,age,radius,kind,finite(color?.r,1),finite(color?.g,1),finite(color?.b,1),finite(p.seed),
      finite(unit?.FourPetalsCenterRadiusRate),finite(unit?.FourPetalsPetalRadiusRate));
    if(kind==='roller-horizontal'&&this.renderRecordCount<this.capacity&&p._iwVisualGroup) {
      const i=this.renderRecordCount++;this.renderRecords[i]=p;
      let slot=p._iwVisualGroup%this.capacity;
      while(this.groupIds[slot]&&this.groupIds[slot]!==p._iwVisualGroup)slot=(slot+1)%this.capacity;
      this.groupIds[slot]=p._iwVisualGroup;this.groupNext[i]=this.groupHeads[slot];this.groupHeads[slot]=i;
    }
  }
  _rollerLinks(alpha) {
    // Only adjacent siblings of the same real volley; distance-bounded bridges
    // split as trajectories separate. This is visual surface tension, not paint,
    // collision or an extracted Roller mesh/equation.
    for(let slot=0;slot<this.capacity;slot++)for(let i=this.groupHeads[slot];i>=0;i=this.groupNext[i]) {
      const p=this.renderRecords[i],pi=p._iwVisualOrdinal ?? p.catalog?.descriptor?.index;
      for(let j=this.groupNext[i];j>=0;j=this.groupNext[j]) {
        const q=this.renderRecords[j],qi=q._iwVisualOrdinal ?? q.catalog?.descriptor?.index;
        if(Number.isFinite(pi)&&Number.isFinite(qi)&&Math.abs(pi-qi)!==1)continue;
        if(!Number.isFinite(pi)&&!Number.isFinite(qi)&&p.fidelityRollerUnitIndex!==q.fidelityRollerUnitIndex)continue;
        const age=renderAge(p,alpha),qage=renderAge(q,alpha);
        p._iwVisualHistory.sample(age,this.sample);q._iwVisualHistory.sample(qage,this.sample2);
        const distance=Math.hypot(this.sample[0]-this.sample2[0],this.sample[1]-this.sample2[1],this.sample[2]-this.sample2[2]);
        const radius=Math.min(projectileDrawRadius(p,age),projectileDrawRadius(q,qage));
        if(!(radius>0)||distance<radius*.6||distance>radius*3||this.bodies>=this.capacity)continue;
        const c=this.centers,w=this.widths,t=this.thicknesses;
        const dx=this.sample2[0]-this.sample[0],dy=this.sample2[1]-this.sample[1],dz=this.sample2[2]-this.sample[2];
        for(let ring=0;ring<RINGS;ring++){const u=ring/(RINGS-1),o=ring*6;
          c[o]=this.sample[0]+dx*u;c[o+1]=this.sample[1]+dy*u;c[o+2]=this.sample[2]+dz*u;
          c[o+3]=dx;c[o+4]=dy;c[o+5]=dz;w[ring]=radius*.30*Math.sin(Math.PI*u);t[ring]=w[ring]*.42;
        }
        const color=p.owner.color;this._writeBody(c,w,t,'roller-link',color.r,color.g,color.b,finite(p.seed),0,0);
        this.stats.linkedRollerPairs++;break;
      }
    }
  }
  draw(alpha=1) {
    if(this.disposed)return;
    alpha=clamp(finite(alpha,1));this.lastAlpha=alpha;this.bodies=0;this.renderRecordCount=0;this.stats.linkedRollerPairs=0;
    this.groupIds.fill(0);this.groupHeads.fill(-1);
    for(const p of this.system.list){this.ensureBirth(p);if(this.handles(p))this._drawRound(p,alpha);}
    this._rollerLinks(alpha);
    const now=finite(this.system.inkFlight?.time);
    for(let i=this.trails.length-1;i>=0;i--) {
      const t=this.trails[i],elapsed=Math.max(0,now-t.birth-DT*(1-alpha)),start=t.endAge+elapsed-t.frames*DT;
      if(start>=t.endAge-EPS){this.historyPool.push(t.history);t.history=null;this.trailPool.push(t);this.trails[i]=this.trails[this.trails.length-1];this.trails.pop();continue;}
      this._body(t.history,start,t.endAge,t.radius,'shooter',t.r,t.g,t.b);
    }
    const vertices=this.bodies*BODY_VERTICES,indices=this.bodies*(RINGS-1)*SIDES*6;
    this.stats.vertexCount=vertices;this.stats.triangles=indices/3;this.stats.drawCalls=this.bodies?1:0;
    this.geometry.setDrawRange(0,indices);this.mesh.visible=vertices>0;
    if(!vertices)return;
    // Reused update-range records avoid full-capacity GPU uploads.
    for(let i=0;i<3;i++){const a=this.attributes[i],r=this.ranges[i];r.count=vertices*3;a.updateRanges.length=0;a.updateRanges.push(r);a.needsUpdate=true;}
  }
  clear() {
    for(const p of this.system.list)if(p._iwVisualHistory){this.historyPool.push(p._iwVisualHistory);p._iwVisualHistory=null;}
    for(const t of this.trails){this.historyPool.push(t.history);t.history=null;this.trailPool.push(t);}
    this.trails.length=0;this.renderRecordCount=0;this.renderRecords.fill(null);
    this.peerGroupOwners.fill(null);this.peerGroupActors.fill(null);this.peerGroupIds.fill(0);this.peerGroupNext=0;
    this.geometry.setDrawRange(0,0);this.mesh.visible=false;this.stats.vertexCount=this.stats.triangles=this.stats.drawCalls=0;
  }
  dispose() {
    if(this.disposed)return;this.clear();this.disposed=true;
    this.system.scene.remove(this.mesh);this.geometry.dispose();this.material.dispose();
    this.historyPool.length=0;this.trailPool.length=0;
  }
}
