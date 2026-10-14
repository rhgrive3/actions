// Special presentation for the actual public Character. The legacy motion
// layer owns phase/foot lifecycle; the final S3 layer below draws unarmed Slam.
// Nintendo establishes the action families; all joint/reach values below are
// calibration for this rig. No Actor/Runner clocks or world transforms change.
const INSTALL = Symbol.for('inkwave.s3.special-motion.install.v1');
const states = new WeakMap();
const stateMap = ch => ch?.[INSTALL]?.states ?? states;
function shown(ch) {
  for (let p = ch.root; p; p = p.parent) if (p.visible === false) return false;
  return true;
}
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
export const SPECIAL_MOTION_CALIBRATION = Object.freeze({
  stormReleasePose: .10, slamRecovery: .42,
  hangLeadHeight: .70, hangTrailHeight: .20, hangLeadForward: .30,
  status: 'engine visual calibration; original joint curves and frame timings unknown',
});

function state(ch) {
  const map = stateMap(ch);
  let m = map.get(ch);
  if (!m) { m = { controlled: false, token: null, blocked: null, phase: null,
    kind: null, recovery: 0, weapon: ch.weaponKind, stormThrow: false, nativeOnly: false,
    impactPending: false }; map.set(ch, m); }
  return m;
}
function clear(ch, block = true) {
  const m = stateMap(ch).get(ch); if (!m) return;
  // Interruption can precede the first visual observation of a live action.
  const token = ch._owner()?.specialActive ?? m.token;
  if (block && token) m.blocked = token;
  m.token = null; m.phase = m.kind = null; m.recovery = 0;
  m.nativeOnly = false;
}
export function specialMotionSnapshot(ch) {
  const m = stateMap(ch).get(ch);
  return m ? { phase: m.phase, kind: m.kind, recoveryAge: m.recovery, impactPending: m.impactPending,
    controlled: m.controlled, originalMapping: m.kind === 'slam' ? 'native Tidal Slam; closest comparison Triple Splashdown'
      : m.kind === 'storm' ? 'Ink Tempest; closest comparison Ink Storm' : null } : null;
}
export function specialMotionOwnsPose(ch) { return ch?.s3SpecialMotionEnabled !== false && !!stateMap(ch).get(ch)?.phase; }

// Replace ONLY a caller's legacy leap/slam timer conjunction. Every other
// contact/gait criterion stays with that caller. Detached, disabled and
// unmapped network presentation retains the supplied native timer decision.
export function specialMotionAllowsFootPlant(ch, nativeEligible) {
  const m = stateMap(ch).get(ch);
  if (!ch?.[INSTALL] || ch.s3SpecialMotionEnabled === false || !m?.controlled || m.nativeOnly)
    return nativeEligible;
  // An interruption can clear nativeOnly while an incomplete network token
  // remains live. Read its mapping without running native owner lookup clocks.
  const live = ch.actor?.character === ch ? ch.actor.specialActive : null;
  if (live && (!Number.isFinite(live.t) || !(live.id === 'storm'
    || live.id === 'slam' && ['rise', 'hang', 'fall'].includes(live.phase))
    || m.token !== live && m.blocked !== live)) return nativeEligible;
  return !(m.kind === 'slam' && m.phase);
}

export function installSpecialMotion({ Character, Actor, THREE, CHARACTER_CHANNELS: C,
  CHARACTER_TIMERS: T, CHARACTER_BOMB_POSE: nativePose }, _profile) {
  if (!Character || !THREE || !C || !Number.isInteger(T?.T_THROW) || !Number.isInteger(T?.T_SLAM)
    || typeof nativePose?.throw !== 'function')
    throw new Error('Special motion requires actual Character, pose/timer channels and native throw method');
  const proto = Character.prototype;
  if (Object.hasOwn(proto, INSTALL)) return;
  Object.defineProperty(proto, INSTALL, { value: Object.freeze({ states }) });
  const update = proto.update, leap = proto._poseLeap, slam = proto._poseSlam;
  const throwing = proto._poseThrow, trigger = proto.trigger, setWeapon = proto.setWeapon;
  const dispose = proto.dispose, build = proto._buildPose, solve = proto._solveLimb;
  const stormOwned = (ch, m) => ch.s3SpecialMotionEnabled !== false && m.controlled && !m.nativeOnly && m.stormThrow;
  proto.update = function (dt, input) {
    const m = state(this), owner = this._owner(), s = input || {};
    if (this.s3SpecialMotionEnabled !== false && owner) {
      m.controlled = true;
      const live = owner.specialActive, step = Math.max(0, Math.min(.1, dt || 0));
      const form = s.form || 'kid', stormHold = live?.id === 'storm' && live.phase === 'hold';
      const interrupted = !owner.alive || s.hp === 0 || form !== 'kid' || this.dance || !shown(this) || owner.superJumpState
        || s.subAim && !stormHold || s.rolling || owner.weaponRunner?.aimingSub && !stormHold || owner.weaponRunner?.dodge
        || (!live && owner.weaponRunner?.firingPose())
        || this.weaponKind !== m.weapon;
      if (interrupted) clear(this);
      else if (live && live !== m.blocked && (live.id === 'slam' || live.id === 'storm')) {
        m.token = live; m.kind = live.id; m.recovery = 0;
        // Network proxies may supply only {id, net:true}; the local physics
        // phase cannot be inferred from it. Retain native replay presentation.
        m.nativeOnly = !Number.isFinite(live.t) || (live.id === 'slam' && !['rise', 'hang', 'fall'].includes(live.phase));
        m.phase = m.nativeOnly ? 'native-unmapped' : live.id === 'storm' ? (stormHold ? 'storm-hold' : 'storm-deploy') : live.phase;
      } else if (!live && m.token) {
        // Only a completed grounded fall earns impact recovery. Cancellation
        // in rise/hang must not resurrect a slam after returning to kid form.
        const completed = m.kind === 'slam' && m.phase === 'fall' && s.grounded;
        const stormEnd = m.kind === 'storm' && m.phase === 'storm-deploy';
        m.token = null; m.recovery = step; m.nativeOnly = false;
        m.phase = completed ? 'slam-recovery' : stormEnd ? 'storm-recovery' : null;
        if (!m.phase) m.kind = null;
      } else if (m.phase === 'slam-recovery' || m.phase === 'storm-recovery') {
        m.recovery += step;
        if (m.recovery >= SPECIAL_MOTION_CALIBRATION.slamRecovery) clear(this, false);
      } else if (live !== m.blocked) clear(this, false);
      m.weapon = this.weaponKind;
      if (this.tr[T.T_SLAM] >= 1.4) m.impactPending = false;
    } else if (m.controlled) {
      clear(this);
      if (!owner) m.controlled = false;
    }
    return update.call(this, dt, input);
  };
  proto._poseLeap = function (P, elapsed) {
    const m = state(this);
    if (this.s3SpecialMotionEnabled === false || !m.controlled || m.nativeOnly) return leap.call(this, P, elapsed);
    if (m.kind !== 'slam' || !['rise', 'hang'].includes(m.phase)) return;
    const result = leap.call(this, P, elapsed);
    // Nintendo's airborne Triple Splashdown render has a clearly lifted lead
    // knee and a trailing foot below it. Borrow only that readable silhouette
    // for Tidal Slam's hang; preserve its own somersault and weapon strike.
    const k = m.phase === 'hang' ? 1 : smooth((elapsed - .44) / .14);
    const span = this.rest.hips.y - this.rest.footL.y, v = SPECIAL_MOTION_CALIBRATION;
    P[C.FOOTL + 1] += (this.rest.footL.y + span * v.hangLeadHeight - P[C.FOOTL + 1]) * k;
    P[C.FOOTL + 2] += (span * v.hangLeadForward - P[C.FOOTL + 2]) * k;
    P[C.FOOTR + 1] += (this.rest.footR.y + span * v.hangTrailHeight - P[C.FOOTR + 1]) * k;
    return result;
  };
  proto._poseSlam = function (P, elapsed) {
    const m = state(this);
    if (this.s3SpecialMotionEnabled === false || !m.controlled || m.nativeOnly) return slam.call(this, P, elapsed);
    if (m.kind !== 'slam' || !['fall', 'slam-recovery'].includes(m.phase)) {
      // A low ceiling can make actual Physics impact occur at st <= .02.
      // Native _poseSlam defers its impact clock/spring/hair impulse until a
      // later grounded pose. A new shot may already own that pose. Delegate
      // the pending native effect once, discarding only the old strike pose.
      if (m.impactPending && this.grounded && elapsed > .02 && !this.slamGround) {
        m.base ||= new Float32Array(P.length); m.base.set(P);
        try { slam.call(this, P, elapsed); } finally { P.set(m.base); }
        if (this.slamGround) m.impactPending = false;
      }
      return;
    }
    // The native impact springs and two-bone IK still run. Fade the weapon
    // strike into the normal hold once grounded, instead of its 1.4s timer
    // overriding the player's newly regained control.
    if (m.phase === 'slam-recovery') {
      // Native _poseSlam uses PX too, so keep a bounded, per-character buffer.
      m.base ||= new Float32Array(P.length); m.base.set(P);
      slam.call(this, P, elapsed);
      if (this.slamGround) m.impactPending = false;
      const weight = 1 - smooth(m.recovery / SPECIAL_MOTION_CALIBRATION.slamRecovery);
      for (let i = 0; i < P.length; i++) P[i] = m.base[i] + (P[i] - m.base[i]) * weight;
      return;
    }
    const result = slam.call(this, P, elapsed);
    if (this.slamGround) m.impactPending = false;
    return result;
  };
  proto._poseThrow = function (P, elapsed) {
    const m = state(this);
    if (!stormOwned(this, m))
      return throwing.call(this, P, elapsed);
    // Managed Storm is applied once after all build layers below.
  };
  proto._solveLimb = function (limb, target, pole, endQuat, weight, slot) {
    const m = state(this), R = this.limbs.armR, L = this.limbs.armL;
    if (this.s3SpecialMotionEnabled === false || !m.controlled || m.nativeOnly || m.kind !== 'slam'
      || !m.phase || !endQuat || weight <= .99 || (limb !== R && !(this.dual && limb === L)))
      return solve.call(this, limb, target, pole, endQuat, weight, slot);
    const x = m.reach ||= { right: new THREE.Vector3(), left: new THREE.Vector3(), delta: new THREE.Vector3(),
      leftCenter: new THREE.Vector3(), point: new THREE.Vector3(), parentQ: new THREE.Quaternion(),
      weaponQ: new THREE.Quaternion() };
    this._kidXform(limb.up.parent, x.right, x.parentQ);
    x.right.add(x.delta.copy(limb.up.position).applyQuaternion(x.parentQ));
    // Use the actual native solver's arm span limit, not a longer limb or a
    // fabricated reach residual. A two-handed hold constrains the weapon's
    // right socket by the support arm's sphere as well. Native IK still solves
    // both limbs and the weapon is still attached to the actual solved hand.
    const radius = (limb.a + limb.b) * .9995;
    const support = limb === R && !this.dual && this.P[C.IKL] > .99 && this.P[C.LTW] < .001;
    if (support) {
      this._kidXform(L.up.parent, x.left, x.parentQ);
      x.left.add(x.delta.copy(L.up.position).applyQuaternion(x.parentQ));
      const d = this.weapon.def;
      x.weaponQ.copy(d.handR.quat).invert().premultiply(endQuat);
      x.delta.subVectors(d.handL.pos, d.handR.pos).applyQuaternion(x.weaponQ);
      x.leftCenter.copy(x.left).sub(x.delta);
    }
    x.point.copy(target);
    for (let i = 0; i < (support ? 16 : 1); i++) {
      x.delta.subVectors(x.point, x.right);
      let distance = x.delta.length();
      if (distance > radius) x.point.copy(x.right).addScaledVector(x.delta, radius / distance);
      if (support) {
        x.delta.subVectors(x.point, x.leftCenter); distance = x.delta.length();
        const leftRadius = (L.a + L.b) * .9995;
        if (distance > leftRadius) x.point.copy(x.leftCenter).addScaledVector(x.delta, leftRadius / distance);
      }
    }
    return solve.call(this, limb, x.point, pole, endQuat, weight, slot);
  };
  proto._buildPose = function (...args) {
    const m = state(this);
    if (!stormOwned(this, m)) return build.apply(this, args);
    // Bomb also observes the native 'throw' event and applies its pose after
    // _poseThrow. Use its public opt-out only during this build transaction,
    // so a Storm token (including cancellation) has one presentation owner.
    const descriptor = Object.getOwnPropertyDescriptor(this, 's3BombMotionEnabled');
    let result;
    try {
      Object.defineProperty(this, 's3BombMotionEnabled', { value: false, configurable: true, writable: true });
      result = build.apply(this, args);
    } finally {
      if (descriptor) Object.defineProperty(this, 's3BombMotionEnabled', descriptor);
      else delete this.s3BombMotionEnabled;
    }
    if (['storm-deploy', 'storm-recovery'].includes(m.phase) && this.tr[T.T_THROW] < .62)
      nativePose.throw.call(this, this.P, this.tr[T.T_THROW] + SPECIAL_MOTION_CALIBRATION.stormReleasePose);
    return result;
  };
  proto.trigger = function (name, ...args) {
    if (name === 'throw') state(this).stormThrow = this._owner()?.specialActive?.id === 'storm';
    if ((name === 'throw' && !state(this).stormThrow) || name === 'flick') clear(this);
    if (name === 'special_slam') {
      const m = state(this), live = this._owner()?.specialActive;
      // A short fall can begin and land in one physics tick. The native event
      // is enough to retain that transition when the next visual frame sees
      // specialActive already cleared; no invented gameplay phase clock.
      if (live?.id === 'slam' && live !== m.blocked) { m.token = live; m.kind = 'slam'; m.phase = 'fall'; }
    }
    if (this.s3SpecialMotionEnabled !== false &&
      ['spawn', 'jump', 'superjump', 'squidroll', 'squidsurge', 'squidsurge_top', 'dodge', 'slosh', 'shoot', 'charge_release', 'movement_cancel'].includes(name)) clear(this);
    return trigger.call(this, name, ...args);
  };
  proto.setWeapon = function (kind, ...args) {
    if (kind !== this.weaponKind) clear(this);
    const result = setWeapon.call(this, kind, ...args);
    const m = stateMap(this).get(this); if (m) m.weapon = this.weaponKind;
    return result;
  };
  proto.dispose = function (...args) { stateMap(this).delete(this); return dispose.apply(this, args); };
  if (Actor && !Object.hasOwn(Actor.prototype, INSTALL)) {
    Object.defineProperty(Actor.prototype, INSTALL, { value: true });
    const impact = Actor.prototype._slamImpact;
    Actor.prototype._slamImpact = function (...args) {
      if (this.character && this.character.s3SpecialMotionEnabled !== false) state(this.character).impactPending = true;
      return impact.apply(this, args);
    };
    for (const name of ['reset', 'splat']) {
      const original = Actor.prototype[name];
      Actor.prototype[name] = function (...args) {
        const result = original.apply(this, args);
        if (name === 'reset' || !this.alive) {
          clear(this.character);
          const m = stateMap(this.character).get(this.character);
          if (m) m.impactPending = false;
        }
        return result;
      };
    }
  }
}

// Shared procedural special assets and presentation. Kept in the existing
// boot module so the offline worker does not duplicate extra URL manifests.
// Source-guided procedural art for the existing S3 specials. These meshes,
// surfaces and joint coordinates are INKWAVE calibration, not retail assets.
// Geometry is immutable and shared. Every model owns its materials; disposal
// never destroys the geometry of a second live activation.
const factories = new WeakMap();
function factory(THREE) {
const bank = new Map(), V = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
// Keep the renderer's Three namespace: direct kit installers and the composed
// runtime must not allocate meshes from a second Three installation.
function finalize(g) {
  if (!g.index) g.setIndex(Array.from({length:g.attributes.position.count}, (_,i)=>i));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
function mergeGeometries(parts) {
  const total=parts.reduce((n,g)=>n+g.attributes.position.count,0), g=new THREE.BufferGeometry();
  for (const key of ['position','normal','color']) {
    const data=new Float32Array(total*3);let offset=0;
    for(const p of parts){data.set(p.attributes[key].array,offset);offset+=p.attributes[key].array.length;}
    g.setAttribute(key,new THREE.BufferAttribute(data,3));
  }
  const indices=[];let base=0;
  for(const p of parts){for(const i of p.index.array)indices.push(i+base);base+=p.attributes.position.count;}
  g.setIndex(indices);return g;
}
function superEllipsoid(rx,ry,rz,e1=1,e2=1,ws=18,hs=12) {
  const g=new THREE.SphereGeometry(1,ws,hs),p=g.attributes.position;
  const sp=(x,e)=>Math.sign(x)*Math.pow(Math.abs(x),e);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),ce=Math.hypot(x,z);
    p.setXYZ(i,sp(ce,e1)*sp(ce>1e-9?x/ce:1,e2)*rx,sp(y,e1)*ry,sp(ce,e1)*sp(ce>1e-9?z/ce:0,e2)*rz);
  }
  g.computeVertexNormals();return g;
}
const lathe=(profile,segments)=>new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),segments);
const torus=(r,t,radial,segments)=>new THREE.TorusGeometry(r,t,radial,segments);
const C={black:'#151b22',dark:'#343942',silver:'#b7c5cc',cream:'#f5f0d8',yellow:'#ffce24',red:'#d14a3e',blue:'#5474bc'};
class Parts {
  constructor(){this.parts=[];}
  add(g,color=C.dark){
    if(!g.index)g=finalize(g);
    const c=new THREE.Color(color),n=g.attributes.position.count,col=new Float32Array(n*3);
    for(let j=0;j<n;j++){col[j*3]=c.r;col[j*3+1]=c.g;col[j*3+2]=c.b;}
    const p=new THREE.BufferGeometry();p.setAttribute('position',g.attributes.position.clone());
    p.setAttribute('normal',g.attributes.normal.clone());p.setAttribute('color',new THREE.BufferAttribute(col,3));
    p.setIndex(g.index.clone());g.dispose();this.parts.push(p);return this;
  }
  end(){const g=mergeGeometries(this.parts,false);for(const p of this.parts)p.dispose();g.computeBoundingSphere();g.userData.specialShared=true;return g;}
}
const box=(w,h,d,x=0,y=0,z=0)=>superEllipsoid(w/2,h/2,d/2,.35,.35,12,8).translate(x,y,z);
const orb=(x,y,z,rx,ry=rx,rz=rx)=>superEllipsoid(rx,ry,rz,1,1,18,12).translate(x,y,z);
const tube=(r,l,x=0,y=0,z=0)=>lathe([[0,-l/2],[r,-l/2],[r,l/2],[0,l/2]],20).rotateX(Math.PI/2).translate(x,y,z);
const pipe=(r,inner,l,x=0,y=0,z=0)=>lathe([[inner,-l/2],[r,-l/2],[r,l/2],[inner,l/2],[inner,-l/2]],24).rotateX(Math.PI/2).translate(x,y,z);
const rim=(r,t,x=0,y=0,z=0)=>torus(r,t,6,24).translate(x,y,z);
const hose=(points,r)=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>V(...p))),28,r,8,false);
function geometry(key,make){if(!bank.has(key))bank.set(key,make());return bank.get(key);}
function surface(color,ink=false){return new THREE.MeshStandardMaterial({color,vertexColors:!ink,
  roughness:ink ? .24 : .43,metalness:ink ? .08 : .18});}
function mesh(root,geo,material,name){const m=new THREE.Mesh(geo,material);m.name=name;m.castShadow=true;root.add(m);return m;}
function hardware(root,key,make){return mesh(root,geometry(key,make),surface(0xffffff),key);}
function ink(root,key,color,make){return mesh(root,geometry(key,make),surface(color,true),key);}
function root(kind){const g=new THREE.Group();g.name='special:'+kind;g.userData.specialKind=kind;return g;}
function sockets(g,r,l,muzzle){
  const d=g.userData,q=new THREE.Quaternion();if(d.specialKind==='trizooka'||d.specialKind==='storm')q.setFromAxisAngle(V(1,0,0),-Math.PI/2);
  d.handQR=q.clone();d.handQL=q.clone();d.holeR=V(.0255,-.0525,0);d.holeL=V(-.0255,-.0525,0);
  d.gripR=V(...r);d.gripL=V(...l);d.handR=d.gripR.clone().sub(d.holeR.clone().applyQuaternion(d.handQR));
  d.handL=d.gripL.clone().sub(d.holeL.clone().applyQuaternion(d.handQL));d.muzzle=V(...muzzle);return g;
}

function createTrizooka(color){
  const g=root('trizooka');
  hardware(g,'zooka-housing',()=>{
    const p=new Parts();p.add(tube(.105,.42,0,.075,-.03),C.silver);
    for(let i=0;i<8;i++)p.add(rim(.11,.015,0,.075,-.22+i*.05),C.cream);
    p.add(pipe(.19,.14,.20,0,.075,.28),'#4cab30').add(rim(.18,.024,0,.075,.392),C.red)
      .add(rim(.15,.014,0,.075,.07),'#cbdb36').add(tube(.13,.09,0,.075,-.285),C.red);
    p.add(box(.055,.16,.065,0,-.12,-.12),'#4cab30').add(box(.055,.085,.065,.13,-.025,.12),C.dark);
    p.add(box(.04,.026,.20,0,.27,.24),C.dark).add(box(.025,.035,.05,0,.29,.31),C.silver);
    for(let i=0;i<3;i++){
      const x=(i-1)*.19;
      p.add(tube(.079,.31).rotateX(-Math.PI/2).translate(x,.28,-.29),C.yellow)
        .add(tube(.084,.047).rotateX(-Math.PI/2).translate(x,.26,-.29),C.dark)
        .add(tube(.066,.045).rotateX(-Math.PI/2).translate(x,.10,-.29),C.cream)
        .add(hose([[x,.11,-.29],[x,.04,-.32],[x,-.03,-.23],[x*.3,.02,-.18]],.020),C.dark);
    }
    return p.end();
  });
  ink(g,'zooka-bore',color,()=>new Parts().add(tube(.14,.005,0,.075,.365),'#ffffff').end());
  g.userData.breech=hardware(g,'zooka-breech',()=>new Parts().add(tube(.115,.055,0,.075,-.25),C.silver).end());
  g.userData.cartridge=hardware(g,'zooka-cartridge',()=>new Parts().add(tube(.072,.13),C.silver).add(rim(.075,.009,0,0,-.06),C.cream).end());
  g.userData.cartridge.visible=false;
  const flash=mesh(g,geometry('zooka-flash',()=>{const d=new THREE.SphereGeometry(1,16,8);d.userData.specialShared=true;return d;}),
    new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,depthWrite:false}),'zooka-flash');
  flash.position.set(0,.075,.41);flash.visible=false;flash.castShadow=false;g.userData.flash=flash;
  return sockets(g,[0,-.12,-.12],[.13,-.025,.12],[0,.075,.402]);
}
function createInkVac(color){
  const g=root('inkVac');
  hardware(g,'vac-nozzle',()=>{
    const p=new Parts();p.add(tube(.075,.22,0,.02,-.17),C.dark).add(box(.25,.18,.26,0,.02,.01),'#53d3d5')
      .add(pipe(.10,.077,.18,0,.02,.20),C.dark).add(rim(.101,.012,0,.02,.30),C.yellow);
    p.add(hose([[-.06,-.09,-.27],[-.06,-.01,-.27],[-.06,.12,-.14],[-.06,.13,-.04]],.012),'#53d3d5')
      .add(hose([[.08,.13,.03],[.08,.25,.03],[.08,.25,.15],[.08,.13,.15]],.012),'#53d3d5');
    for(let i=0;i<4;i++)p.add(box(.006,.07,.012,-.128,-.015,-.06+i*.038),C.dark);
    p.add(hose([[0,.02,-.28],[-.22,-.03,-.33],[-.26,-.18,-.52],[-.11,-.17,-.55]],.034),C.dark);
    return p.end();
  });
  ink(g,'vac-intake',color,()=>new Parts().add(tube(.077,.006,0,.02,.13),'#ffffff').end());
  return sockets(g,[-.06,-.01,-.21],[.08,.24,.09],[0,.02,.31]);
}
function createVacPack(color){
  const g=root('vac-pack');
  hardware(g,'vac-pack-hardware',()=>new Parts().add(orb(0,.07,-.01,.22,.25,.16),C.cream)
    .add(box(.34,.15,.22,0,-.20,0),'#53d3d5').add(box(.39,.04,.25,0,-.29,0),C.dark)
    .add(box(.035,.48,.035,-.20,-.03,.03),C.dark).add(box(.035,.48,.035,.20,-.03,.03),C.dark)
    .add(tube(.06,.04,0,.07,-.16),C.dark).end());
  g.userData.fill=ink(g,'vac-pack-window',color,()=>new Parts().add(box(.08,.24,.01,.16,.045,-.12),'#ffffff').end());
  return g;
}
function createStormDevice(color){
  const g=root('storm');
  hardware(g,'storm-canister',()=>{
    const p=new Parts().add(tube(.077,.19).rotateX(-Math.PI/2),C.dark)
      .add(rim(.078,.012).rotateX(Math.PI/2).translate(0,-.096,0),C.silver);
    for(let i=0;i<4;i++)p.add(box(.025,.23,.055,.085,0,0).rotateY(i*Math.PI/2),C.silver);
    p.add(box(.045,.035,.045,0,.12,0),C.dark).add(hose([[-.055,.10,0],[-.065,.19,0],[.055,.19,0],[.065,.10,0]],.010),C.dark);
    return p.end();
  });
  ink(g,'storm-canister-band',color,()=>new Parts().add(tube(.078,.11).rotateX(-Math.PI/2),'#ffffff').end());return sockets(g,[0,.17,0],[0,.17,0],[0,0,0]);
}
function createInkFist(color){
  const g=root('slam');
  ink(g,'splashdown-fist',color,()=>{
    const p=new Parts();p.add(box(.75,.48,.60,0,0,0),'#ffffff');
    for(let k=0;k<4;k++)p.add(orb(-.285+k*.19,.19,.205,.117,.155,.16),'#ffffff');
    p.add(orb(.35,-.02,.19,.19,.21,.18),'#ffffff');p.add(orb(.23,-.03,.36,.18,.13,.12),'#ffffff');
    p.add(orb(0,-.35,-.08,.27,.32,.24),'#ffffff');return p.end();
  });
  const energyGeo=geometry('splashdown-energy',()=>{const d=new THREE.SphereGeometry(1,20,12);d.userData.specialShared=true;return d;});
  const energy=mesh(g,energyGeo,new THREE.ShaderMaterial({uniforms:{color:{value:new THREE.Color(color)},age:{value:0}},
    vertexShader:`varying vec2 uv0;void main(){uv0=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform vec3 color;uniform float age;varying vec2 uv0;void main(){float band=pow(.5+.5*cos(uv0.y*22.+uv0.x*18.-age*9.),16.);float a=band*.6*sin(uv0.y*3.14159);gl_FragColor=vec4(mix(color,vec3(1.),.35),a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>}`,transparent:true,depthWrite:false,side:THREE.DoubleSide}),'splashdown-energy');
  energy.position.set(0,-.20,0);energy.scale.set(.48,.55,.43);energy.castShadow=false;g.userData.energy=energy;
  return g;
}

function createBubblerHardware(color){
  const g=root('bubbler'),emitter=root('bubbler-emitter');
  hardware(g,'bubbler-base',()=>new Parts().add(tube(.30,.09).rotateX(-Math.PI/2).translate(0,.08,0),C.dark)
    .add(box(.06,.22,.06,0,.63,0),C.cream).add(hose([[.22,.26,0],[.39,.32,0],[.37,.15,.10]],.016),C.dark).end());
  ink(g,'bubbler-launcher-body',color,()=>new Parts().add(lathe([[.12,0],[.30,.15],[.28,.22],[.16,.35],[.12,.41]],24),'#ffffff')
    .add(box(.17,.13,.14,0,.49,0),'#ffffff').end());
  hardware(emitter,'bubbler-propeller',()=>new Parts().add(tube(.25,.06).rotateX(-Math.PI/2).translate(0,.04,0),C.cream)
    .add(box(.36,.018,.045,0,.16,0),C.cream).add(box(.045,.018,.36,0,.16,0),C.cream).end());
  ink(emitter,'bubbler-tip',color,()=>new Parts().add(orb(0,-.07,0,.20,.13,.20),'#ffffff').end());
  g.add(emitter);
  const geo=geometry('bubbler-shell',()=>{const d=new THREE.SphereGeometry(1,40,20,0,Math.PI*2,0,Math.PI/2);d.userData.specialShared=true;return d;});
  const material=new THREE.ShaderMaterial({uniforms:{color:{value:new THREE.Color(color)},age:{value:0},health:{value:1}},
    vertexShader:`varying vec3 n;varying vec3 v;varying vec2 uv0;void main(){uv0=uv;vec4 p=modelViewMatrix*vec4(position,1.);v=-p.xyz;n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*p;}`,
    fragmentShader:`uniform vec3 color;uniform float age;uniform float health;varying vec3 n;varying vec3 v;varying vec2 uv0;
      void main(){float fres=pow(1.-abs(dot(normalize(n),normalize(v))),2.);float lines=pow(.5+.5*cos(uv0.y*50.+.3*sin(uv0.x*50.)-age*.4),32.);
      vec2 grid=fract(uv0*vec2(100.,45.))-.5;float mesh=1.-smoothstep(.09,.16,length(grid));float a=(.045+.24*fres+.11*lines+.055*mesh)*(.7+.3*health);
      gl_FragColor=vec4(color*(.85+.35*fres+.25*lines),a);#include <tonemapping_fragment>
      #include <colorspace_fragment>}`.replace(';#include',';\n#include'),transparent:true,depthWrite:false,side:THREE.DoubleSide});
  const shell=mesh(g,geo,material,'bubbler-field');shell.castShadow=false;shell.renderOrder=4;
  g.userData.shell=shell;g.userData.emitter=emitter;return g;
}
function createVacVortex(color,length,near,far){
  const geo=geometry('vac-vortex',()=>{const d=new THREE.CylinderGeometry(1,1,1,32,12,true);d.translate(0,.5,0);d.userData.specialShared=true;return d;});
  const mat=new THREE.ShaderMaterial({uniforms:{color:{value:new THREE.Color(color)},age:{value:0},near:{value:near},far:{value:far},extent:{value:length}},
    vertexShader:`uniform float near;uniform float far;uniform float extent;varying vec2 uv0;
      void main(){uv0=uv;vec3 p=position;p.xz*=mix(near,far,p.y);p.y*=extent;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader:`uniform vec3 color;uniform float age;varying vec2 uv0;void main(){float path=uv0.x*6.+uv0.y*2.+age*2.;
      float spiral=pow(.5+.5*cos(path*6.283185),10.);float dust=pow(.5+.5*sin(uv0.x*170.+uv0.y*110.+age*13.),20.);
      float edge=smoothstep(0.,.04,uv0.y)*(1.-smoothstep(.85,1.,uv0.y));gl_FragColor=vec4(color*(.8+spiral*.7),(.025+.24*spiral+.09*dust)*edge);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>}`,transparent:true,depthWrite:false,side:THREE.DoubleSide});
  const m=new THREE.Mesh(geo,mat);m.name='special:vac-vortex';m.frustumCulled=false;return m;
}
function createStormCloud(color){
  const g=root('storm-cloud'),geo=geometry('storm-puff',()=>{const d=new THREE.SphereGeometry(1,20,12);d.userData.specialShared=true;return d;});
  const mat=new THREE.MeshStandardMaterial({color:new THREE.Color(color).multiplyScalar(.56),roughness:.81,
    emissive:color,emissiveIntensity:.10});
  const puffs=new THREE.InstancedMesh(geo,mat,15);puffs.name='storm-cloud-puffs';puffs.userData.bob=0;puffs.castShadow=true;
  const transform=new THREE.Object3D();
  for(let i=0;i<15;i++){const angle=i*Math.PI*2/9,outer=i>0&&i<10,r=outer?2.1:i>9?.8:0;
    transform.position.set(Math.cos(angle)*r,i>9?.75:0,Math.sin(angle)*r);
    transform.scale.set(outer?1.45:1.6,i>9?1.0:.80,outer?1.45:1.6);transform.updateMatrix();puffs.setMatrixAt(i,transform.matrix);}
  puffs.instanceMatrix.needsUpdate=true;puffs.computeBoundingSphere();g.add(puffs);return g;
}
function createTacticooler(color){
  const g=root('tacticooler');
  hardware(g,'cooler-hardware',()=>{
    const p=new Parts();p.add(tube(.32,.07).rotateX(-Math.PI/2).translate(0,.94,0),C.dark)
      .add(tube(.32,.10).rotateX(-Math.PI/2).translate(0,.34,0),C.silver)
      .add(tube(.025,.22).rotateX(-Math.PI/2).translate(0,.17,0),C.silver)
      .add(tube(.14,.025).rotateX(-Math.PI/2).translate(0,.045,0),C.dark);
    for(let i=0;i<4;i++){
      const a=i*Math.PI/2,x=Math.cos(a)*.29,z=Math.sin(a)*.29;
      p.add(box(.022,.65,.025,x,.64,z),C.dark)
        .add(box(.21,.03,.04,.39,.52,0).rotateY(a),C.silver)
        .add(box(.04,.075,.07,.49,.52,0).rotateY(a),C.dark);
    }return p.end();
  });
  ink(g,'cooler-header',color,()=>new Parts().add(tube(.30,.17).rotateX(-Math.PI/2).translate(0,.82,0),'#ffffff').end());
  const glass=mesh(g,geometry('cooler-glass',()=>{const d=new THREE.CylinderGeometry(.28,.28,.41,24,1,true);d.translate(0,.565,0);d.userData.specialShared=true;return d;}),
    new THREE.MeshStandardMaterial({color:'#cbdab1',transparent:true,opacity:.22,roughness:.2,depthWrite:false,side:THREE.DoubleSide}),'cooler-glass');glass.castShadow=false;
  g.userData.drinks=[];
  for(let i=0;i<4;i++){
    const can=root('drink');hardware(can,'cooler-can',()=>new Parts().add(tube(.045,.15).rotateX(-Math.PI/2),C.silver)
      .add(box(.018,.005,.025,0,.08,0),C.dark).end());
    ink(can,'cooler-can-label',color,()=>new Parts().add(tube(.046,.11).rotateX(-Math.PI/2),'#ffffff').end());
    const a=i*Math.PI/2;can.position.set(Math.cos(a)*.41,.47,Math.sin(a)*.41);g.add(can);g.userData.drinks.push(can);
  }return g;
}

return {createTrizooka,createInkVac,createVacPack,createStormDevice,createInkFist,createBubblerHardware,createVacVortex,createStormCloud,createTacticooler};
}
function api(THREE){if(!factories.has(THREE))factories.set(THREE,factory(THREE));return factories.get(THREE);}
export function disposeSpecialModel(root){
  if(!root)return;root.removeFromParent?.();const mats=new Set();
  root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry&&!o.geometry.userData.specialShared)o.geometry.dispose();
    if(Array.isArray(o.material))for(const m of o.material)mats.add(m);else if(o.material)mats.add(o.material);});
  for(const m of mats)m.dispose();root.clear?.();
}
export function createTrizooka(color,THREE){return api(THREE).createTrizooka(color);}
export function createInkVac(color,THREE){return api(THREE).createInkVac(color);}
export function createVacPack(color,THREE){return api(THREE).createVacPack(color);}
export function createStormDevice(color,THREE){return api(THREE).createStormDevice(color);}
export function createInkFist(color,THREE){return api(THREE).createInkFist(color);}
export function createBubblerHardware(color,THREE){return api(THREE).createBubblerHardware(color);}
export function createStormCloud(color,THREE){return api(THREE).createStormCloud(color);}
export function createTacticooler(color,THREE){return api(THREE).createTacticooler(color);}
export function createVacVortex(color,length,near,far,THREE){return api(THREE).createVacVortex(color,length,near,far);}

// Program keepers. Special visuals are built on first use and the per-use ones
// (Ink Vac vortex, Big Bubbler field, slam fists, storm cloud, Tacticooler and
// the all-specials.mjs deployables) are disposed after every use. three.js
// deletes a program, and forgets the shader stage ids that key a ShaderMaterial
// program, when its last material is disposed, so each activation linked its
// programs again synchronously mid-match (measured: the Ink Vac intake frames
// stalled on getProgramParameter at every activation). One never-disposed
// instance of every factory, compiled with the kids' match-load warm-up against
// the same scene and HDR target, keeps those programs and stage ids alive:
// later instances, built from the same shader text and parameters, resolve to
// the cached programs. Nothing is added to the scene; like Character.warmAll,
// the one warm shadow pass is redrawn by the next frame's shadow update.
let programKeepers=null,keeperRT=null;
const keeperWarmFrame=new WeakMap();
export function specialProgramKeepers(THREE){
  if(programKeepers)return programKeepers;
  const f=api(THREE),g=new THREE.Group();g.name='special-program-keepers';
  for(const m of [f.createTrizooka(0xffffff),f.createInkVac(0xffffff),f.createVacPack(0xffffff),f.createStormDevice(0xffffff),
    f.createInkFist(0xffffff),f.createBubblerHardware(0xffffff),f.createVacVortex(0xffffff,1,.5,1),f.createStormCloud(0xffffff),
    f.createTacticooler(0xffffff)])g.add(m);
  // deployables (Splattercolor Screen, Wave Breaker, Super Chump, Inkstrike, Booyah Bomb, Crab Tank ball)
  for(const kind of WORLD_MESH_KINDS){const {geometry,material}=worldMeshParts(THREE,kind,0xffffff);const m=new THREE.Mesh(geometry,material);m.name='keeper:'+kind;g.add(m);}
  g.traverse(o=>{o.visible=true;});
  return programKeepers=g;
}
export function warmSpecialPrograms(THREE,G,renderer,camera,target){
  if(!renderer?.compileAsync||!camera||!target)return null;
  const frame=renderer.info?.render?.frame;
  if(keeperWarmFrame.get(target)===frame)return null;   // once per load batch (every kid's warmAll shares the frame)
  keeperWarmFrame.set(target,frame);
  const rt0=renderer.getRenderTarget();
  let p=null;
  try{
    // the match draws into the composer's HDR target: compile against one (same as Character.warmAll)
    renderer.setRenderTarget(G.post?.composer?.readBuffer||(keeperRT||(keeperRT=new THREE.WebGLRenderTarget(4,4,{type:THREE.HalfFloatType}))));
    p=renderer.compileAsync(specialProgramKeepers(THREE),camera,target);
  }catch(e){console.warn('[inkwave] special program warm',e);}
  finally{renderer.setRenderTarget(rt0);}
  // shadow-depth variants (e.g. the instanced storm cloud): one shadow pass of the keepers, as Character.warmAll does
  const sm=renderer.shadowMap,lights=[];
  if(sm?.enabled&&typeof sm.render==='function'&&target.traverseVisible)target.traverseVisible(o=>{if(o.isLight&&o.castShadow&&o.shadow)lights.push(o);});
  if(lights.length){
    const keepers=specialProgramKeepers(THREE),nu=sm.needsUpdate;keepers.updateMatrixWorld(true);
    try{sm.needsUpdate=true;sm.render(lights,keepers,camera);}catch(e){console.warn('[inkwave] special shadow warm',e);}
    finally{sm.needsUpdate=nu;}
  }
  return p?.catch?.(e=>console.warn('[inkwave] special program warm',e))??null;
}

// Observe the final native special owners. This layer never steps gameplay,
// changes a token/timer, authors a hit/paint row or dispatches a network event.
import { inkVacState } from './kit-ink-vac.mjs';
import { worldMeshParts, WORLD_MESH_KINDS } from './all-specials.mjs';
import { TRIZOOKA_CARTRIDGE } from './kit-trizooka.mjs';
import { FIST_TRAVEL, tripleSlamFistCenters } from './triple-slam-fists.mjs';
const PRESENTATION_INSTALL=Symbol.for('inkwave.s3.special-presentation.v1');
const presentationStates=new WeakMap(),presentationBlocked=new WeakMap(),clamp=(x)=>Math.max(0,Math.min(1,x));
export const SPECIAL_ART_STATUS='procedural S3 reference interpretation; retail meshes, shaders and skeletal curves unavailable';
function presentationShown(ch){for(let p=ch.root;p;p=p.parent)if(!p.visible)return false;return true;}
const presentationMap=ch=>ch?.[PRESENTATION_INSTALL]?.states||presentationStates;
const blockedMap=ch=>ch?.[PRESENTATION_INSTALL]?.blocked||presentationBlocked;
function mapped(ch){const a=ch.actor;if(!a||blockedMap(ch).get(ch)===a.specialActive||!a.alive||a.superJumpState||ch.dance||ch.s3SpecialPresentationEnabled===false||!ch.kidForm||!presentationShown(ch))return null;
  const id=a.specialActive?.id;return id==='trizooka'||id==='inkVac'||id==='slam'||id==='storm'&&a.specialActive.phase==='hold'?id:null;}
export function specialPresentationSnapshot(ch){const m=presentationMap(ch).get(ch);return m?{kind:m.kind,handError:m.error,
  heldVisible:!!m.model?.visible,fistsVisible:!!m.fists?.visible,ejects:m.ejects?.children.filter(x=>x.visible).length||0,status:SPECIAL_ART_STATUS}:null;}
function restore(ch,m){if(m.weapon){m.weapon.pivot.visible=m.weaponVisible;if(m.weapon.left)m.weapon.left.pivot.visible=m.leftVisible;m.weapon=null;}
  if(m.bomb){m.bomb.visible=m.bombVisible;m.bomb=null;}
  if(m.model)m.model.visible=false;if(m.pack)m.pack.visible=false;m.kind=null;m.error=0;}
function retire(ch){const m=presentationMap(ch).get(ch);if(!m)return;restore(ch,m);
  for(const g of m.models.values())disposeSpecialModel(g);disposeSpecialModel(m.pack);disposeSpecialModel(m.fists);disposeSpecialModel(m.ejects);presentationMap(ch).delete(ch);}
export function installSpecialPresentation({Character,Actor,Projectiles,THREE,G,CHARACTER_CHANNELS:C,CHARACTER_TIMERS:T},profile){
  if(!Character?.prototype||Character.prototype[PRESENTATION_INSTALL])return;
  Object.defineProperty(Character.prototype,PRESENTATION_INSTALL,{value:{states:presentationStates,blocked:presentationBlocked}});
  const cp=Character.prototype,update=cp.update,build=cp._buildPose,apply=cp._applyPose,dispose=cp.dispose;
  const muzzle=cp.getMuzzle,aimMuzzle=cp.getAimMuzzle,setWeapon=cp.setWeapon;
  const warmAll=cp.warmAll;
  if(typeof warmAll==='function')cp.warmAll=function(renderer=G.renderer,camera=G.camera,target=G.scene,...rest){
    const done=warmAll.call(this,renderer,camera,target,...rest);
    const keep=warmSpecialPrograms(THREE,G,renderer,camera,target);
    // the match-load fade (main.js _warmCharacters, 8 s cap) also waits for the keeper programs to link
    return keep&&typeof done?.then==='function'?done.then(v=>keep.then(()=>v)):done;
  };
  function presentationState(ch){let m=presentationMap(ch).get(ch);if(m)return m;
    m={kind:null,models:new Map(),model:null,weapon:null,error:0,shotAt:-Infinity,shotSerial:0,
      a:new THREE.Vector3(),b:new THREE.Vector3(),p:new THREE.Vector3(),dir:new THREE.Vector3(),q:new THREE.Quaternion(),handQ:new THREE.Quaternion(),
      worldQ:new THREE.Quaternion(),e:new THREE.Euler(),pole:new THREE.Vector3(),shoulders:[new THREE.Vector3(),new THREE.Vector3()],fistToken:null,centers:null,ejectI:0};presentationStates.set(ch,m);return m;}
  function model(ch,m,kind){let g=m.models.get(kind);if(!g){g=kind==='trizooka'?createTrizooka(ch.color,THREE):kind==='inkVac'?createInkVac(ch.color,THREE):createStormDevice(ch.color,THREE);
      m.models.set(kind,g);ch.kid.add(g);
      if(kind==='trizooka'&&G.scene){m.ejects=new THREE.Group();m.ejects.name='trizooka-ejected-cartridges';G.scene.add(m.ejects);
        for(let i=0;i<3;i++){const shell=g.userData.cartridge.clone();shell.material=shell.material.clone();shell.visible=false;
          shell.userData={birth:-Infinity,origin:new THREE.Vector3(),orientation:new THREE.Quaternion()};m.ejects.add(shell);}}
    }return g;}
  function hideMain(ch,m){
    if(m.weapon&&m.weapon!==ch.weapon)restore(ch,m);
    if(!m.weapon){m.weapon=ch.weapon;m.weaponVisible=ch.weapon.pivot.visible;m.leftVisible=ch.weapon.left?.pivot.visible;}
    ch.weapon.pivot.visible=false;if(ch.weapon.left)ch.weapon.left.pivot.visible=false;
    if(ch.bomb?.group){if(!m.bomb){m.bomb=ch.bomb.group;m.bombVisible=m.bomb.visible;}m.bomb.visible=false;}
  }
  function hold(ch,m,id){
    if(m.kind!==id){restore(ch,m);m.kind=id;m.model=model(ch,m,id);m.model.visible=true;}
    hideMain(ch,m);
    if(id==='inkVac'&&!m.pack){m.pack=createVacPack(ch.color,THREE);ch.bones.chest.add(m.pack);m.pack.position.set(0,-.055,-.19);}
    if(m.pack)m.pack.visible=id==='inkVac';
  }
  // A pair of fixed-radius hand constraints fits one rigid object to both native
  // arm spans. The two native solvers still own elbow bends and hand orientation.
  function fit(ch,m,g){
    const R=ch.limbs.armR,L=ch.limbs.armL,r=(R.a+R.b)*.999,l=(L.a+L.b)*.999;
    for(let side=0;side<2;side++){const limb=side?L:R;
      ch._kidXform(limb.up.parent,m.shoulders[side],m.handQ);m.shoulders[side].add(m.b.copy(limb.up.position).applyQuaternion(m.handQ));}
    for(let j=0;j<20;j++){
      for(let side=0;side<2;side++){
        const limb=side?L:R,socket=side?g.userData.handL:g.userData.handR;
        m.a.copy(m.shoulders[side]);
        m.b.copy(socket).applyQuaternion(g.quaternion).add(g.position).sub(m.a);
        const d=m.b.length(),radius=side?l:r;if(d>radius)g.position.addScaledVector(m.b,-(d-radius)/d);
      }
    }
    for(let side=0;side<2;side++){
      const limb=side?L:R,socket=side?g.userData.handL:g.userData.handR;
      m.p.copy(socket).applyQuaternion(g.quaternion).add(g.position);
      m.handQ.copy(g.quaternion).multiply(g.userData[side?'handQL':'handQR']);
      m.pole.set(side?.8:-.8,-.5,-.22);ch._solveLimb(limb,m.p,m.pole,m.handQ,1,side?0:1);
    }
    ch.kid.updateWorldMatrix(true,true);m.error=0;
    for(let side=0;side<2;side++){
      const socket=side?g.userData.gripL:g.userData.gripR,bone=side?ch.bones.handL:ch.bones.handR;
      m.a.copy(socket);g.localToWorld(m.a);m.b.copy(g.userData[side?'holeL':'holeR']);bone.localToWorld(m.b);m.error=Math.max(m.error,m.a.distanceTo(m.b));
    }
  }
  cp._buildPose=function(dt,input){const r=build.call(this,dt,input),id=mapped(this);if(id==='trizooka'||id==='inkVac'){
      const m=presentationState(this);hold(this,m,id);const P=this.P,kick=Math.exp(-14*Math.max(0,(G.time||0)-m.shotAt));
      P[C.IKR]=P[C.IKL]=P[C.LTW]=0;P[C.CHEST]+=.09-.13*kick;P[C.SPINE]+=.025;
      P[C.HANDPL]=P[C.HANDPR]=0;P[C.MODELR]=P[C.MODELR+1]=P[C.MODELR+2]=0;
      if(this.sourceMotion){this.sourceMotion.sourceUpper=false;this.sourceMotion.keepSourceArms=false;}
    }else if(id==='slam'){
      const m=presentationState(this);if(m.kind!=='slam'){restore(this,m);m.kind='slam';m.model=null;}hideMain(this,m);
      const P=this.P,fall=this.actor.specialActive.phase==='fall';
      P[C.IKR]=P[C.IKL]=P[C.LTW]=0;P[C.MODELR]=P[C.MODELR+1]=P[C.MODELR+2]=0;
      P[C.UARML]=fall?-1.6:-1.85;P[C.UARMR]=fall?-1.6:-1.85;
      P[C.UARML+2]=.65;P[C.UARMR+2]=-.65;P[C.FARML]=P[C.FARMR]=-.70;
      P[C.HANDPL]=P[C.HANDPR]=0;
      if(this.sourceMotion){this.sourceMotion.sourceUpper=false;this.sourceMotion.keepSourceArms=false;}
    }return r;};
  cp._applyPose=function(dt,input){const result=apply.call(this,dt,input),id=mapped(this),m=presentationMap(this).get(this);
    if(id==='trizooka'||id==='inkVac'){
      const s=presentationState(this);hold(this,s,id);const g=s.model,a=this.actor;
      this.kid.getWorldQuaternion(s.worldQ);s.dir.copy(a.aimDir).applyQuaternion(s.worldQ.invert()).normalize();
      s.q.setFromUnitVectors(s.a.set(0,0,1),s.dir);g.quaternion.copy(s.q);
      const kick=Math.exp(-14*Math.max(0,(G.time||0)-s.shotAt));g.position.set(-.11,.96,.25-.055*kick);fit(this,s,g);
      if(id==='trizooka'){g.userData.breech.position.z=-.018*kick;const flash=g.userData.flash,age=(G.time||0)-s.shotAt;flash.visible=age>=0&&age<.10;flash.material.opacity=.7*(1-clamp(age/.10));flash.scale.set(.11+.18*clamp(age/.10),.11+.18*clamp(age/.10),.15);}
      if(id==='inkVac'&&s.pack){const charge=inkVacState(a)?.charge||0;s.pack.userData.fill.scale.y=.10+.90*charge;}
      this._applyFingers(this.P,0);
    }else if(id==='storm'){
      const s=presentationState(this);hold(this,s,id);this.bones.handL.getWorldPosition(s.p);this.kid.worldToLocal(s.p);
      this.bones.handL.getWorldQuaternion(s.q);s.q.multiply(s.handQ.copy(s.model.userData.handQL).invert());this.kid.getWorldQuaternion(s.worldQ);
      s.model.quaternion.copy(s.worldQ.invert()).multiply(s.q);s.model.position.copy(s.p).sub(s.a.copy(s.model.userData.handL).applyQuaternion(s.model.quaternion));
    }else if(id==='slam'){const s=presentationState(this);hideMain(this,s);}
    else if(m)restore(this,m);
    return result;};
  function cartridge(ch,m){if(!m.ejects)return;
    const now=G.time||0;
    for(const shell of m.ejects.children){const d=shell.userData,rawAge=now-d.birth-TRIZOOKA_CARTRIDGE.ejectFrame/60,age=Math.max(0,rawAge);
      shell.visible=ch.actor?.alive&&ch.s3SpecialPresentationEnabled!==false&&presentationShown(ch)&&rawAge>=-1e-9&&age<TRIZOOKA_CARTRIDGE.lifeTimeFrame/60-1e-9;
      if(!shell.visible)continue;
      shell.position.copy(d.origin);m.dir.set(.60*age,.52*age-1.9*age*age,-.20*age).applyQuaternion(d.orientation);shell.position.add(m.dir);
      m.e.set(age*TRIZOOKA_CARTRIDGE.angular.x*Math.PI/180,0,age*TRIZOOKA_CARTRIDGE.angular.z*Math.PI/180);
      shell.quaternion.setFromEuler(m.e).premultiply(d.orientation);shell.material.transparent=true;
      shell.material.opacity=clamp((TRIZOOKA_CARTRIDGE.lifeTimeFrame/60-age)/(TRIZOOKA_CARTRIDGE.fadeOutFrame/60));
    }
  }
  function fists(ch,m){const a=ch.actor,s=a?.specialActive;
    let token=a?._s3TripleSlamFists;
    if(a?.remote){
      if(s?.id==='slam'&&['rise','hang','fall'].includes(s.phase)&&Number.isFinite(s.t)){
        if(m.remoteSource!==s){const scale=profile?.weaponsFidelityCompletion?.worldUnitsPerSourceUnit||1;
          m.remoteSource=s;m.remoteFist={origin:{x:a.pos.x,y:a.pos.y,z:a.pos.z},centers:tripleSlamFistCenters(a.pos,a.yaw,scale),remaining:null};}
        m.remotePhase=s.phase;
      }else if(m.remoteFist){
        if(m.remotePhase==='fall'&&a.alive){m.remoteLandedAt??=G.time||0;m.remoteFist.remaining=Math.max(0,FIST_TRAVEL-((G.time||0)-m.remoteLandedAt));}
        else m.remoteFist=null;
        if(m.remoteFist?.remaining===0)m.remoteFist=null;
      }
      token=m.remoteFist;
      if(!token){m.remoteSource=null;m.remoteLandedAt=null;}
    }
    const active=!!token&&a.alive&&presentationShown(ch)&&ch.s3SpecialPresentationEnabled!==false&&!a.superJumpState;
    if(!active){if(m.fists)m.fists.visible=false;m.fistToken=null;return;}
    if(!m.fists){m.fists=new THREE.Group();m.fists.name='splashdown-paired-fists';m.fists.add(createInkFist(ch.color,THREE),createInkFist(ch.color,THREE));G.scene?.add(m.fists);}
    if(m.fistToken!==token){m.fistToken=token;m.centers=token.centers||tripleSlamFistCenters(a.pos,a.yaw);m.fistYaw=a.yaw;
      m.ground=m.centers.map(c=>{const y=G.level?.groundHeight?.(c.x,c.z,c.y+8);return Number.isFinite(y)?y:c.y;});}
    m.fists.visible=true;
    for(let i=0;i<2;i++){
      const g=m.fists.children[i],c=m.centers[i],side=i?1:-1;
      const spread=s?.phase==='fall'?clamp(s.t/.25):token.remaining!=null?1:0;
      const delay=token.remaining==null?null:clamp(token.remaining/FIST_TRAVEL);
      const x=a.pos.x+side*.85*Math.cos(m.fistYaw)+.12*Math.sin(m.fistYaw),z=a.pos.z-side*.85*Math.sin(m.fistYaw)+.12*Math.cos(m.fistYaw);
      g.position.set(x+(c.x-x)*spread,delay==null?a.pos.y+1.0:m.ground[i]+.2+4*delay*delay,z+(c.z-z)*spread);
      g.rotation.set(delay==null?-.25:-Math.PI/2,m.fistYaw,side*.10);g.scale.set(side<0?1.1:-1.1,1.1,1.1);g.userData.energy.material.uniforms.age.value=G.time||0;
    }
  }
  cp.update=function(dt,input){const result=update.call(this,dt,input),m=presentationMap(this).get(this),a=this.actor;
    if(!a)return result;
    if(m){if(!mapped(this)&&m.kind)restore(this,m);cartridge(this,m);fists(this,m);}
    else if(a._s3TripleSlamFists||a.remote&&a.specialActive?.id==='slam')fists(this,presentationState(this));
    return result;};
  function shot(p){const ch=p?.owner?.character;
      if(p?.wid==='trizooka'&&(p.s3VolleyIndex||0)===0&&ch?.kid&&mapped(ch)==='trizooka'){const m=presentationState(ch);m.shotAt=G.time||0;m.shotSerial++;
        const g=model(ch,m,'trizooka'),shell=m.ejects?.children[m.ejectI++%3];
        if(shell){shell.userData.birth=m.shotAt;g.updateWorldMatrix(true,false);shell.userData.origin.set(.18,.075,-.23);g.localToWorld(shell.userData.origin);g.getWorldQuaternion(shell.userData.orientation);}}
  }
  if(Projectiles?.prototype){const pp=Projectiles.prototype,push=pp._push,ghost=pp.ghostProjectile;
    pp._push=function(p,...args){const result=push.call(this,p,...args);shot(p);return result;};
    pp.ghostProjectile=function(...args){const n=this.list.length,result=ghost.apply(this,args);if(this.list.length>n)shot(this.list.at(-1));return result;};}
  cp.getMuzzle=function(out){const m=presentationMap(this).get(this);if(mapped(this)==='trizooka'&&m?.kind==='trizooka'&&m.model){
      m.model.updateWorldMatrix(true,false);return m.model.localToWorld(out.copy(m.model.userData.muzzle));}return muzzle.call(this,out);};
  cp.getAimMuzzle=function(out,pitch){if(mapped(this)==='trizooka'&&presentationMap(this).get(this)?.kind==='trizooka'){this.getMuzzle(out);return true;}return aimMuzzle.call(this,out,pitch);};
  cp.setWeapon=function(...args){if(this.actor?.specialActive)presentationBlocked.set(this,this.actor.specialActive);retire(this);return setWeapon.apply(this,args);};
  if(Projectiles?.prototype){const pp=Projectiles.prototype,storm=pp.throwStorm,spawn=pp._spawnCloud,release=pp._releaseCloud;
    pp.throwStorm=function(...args){const n=this.bombs.length,result=storm.apply(this,args);for(let i=n;i<this.bombs.length;i++){
        const b=this.bombs[i];if(b.kind!=='storm')continue;const old=b.body,g=createStormDevice(G.teamColors[b.team],THREE);
        old.removeFromParent();old.material.dispose();b.mesh.add(g);b.body=g;
      }return result;};
    pp._spawnCloud=function(...args){const n=this.clouds.length,result=spawn.apply(this,args);for(let i=n;i<this.clouds.length;i++){
        const c=this.clouds[i],old=c.group,g=createStormCloud(G.teamColors[c.team],THREE),mats=new Set();
        old.traverse(o=>{if(o.material)mats.add(o.material);});for(const mat of mats)mat.dispose();
        const children=[...g.children];for(const child of children)old.add(child);for(const child of [...old.children])if(!children.includes(child))old.remove(child);
      }return result;};
    // InstancedMesh owns a GPU matrix buffer beyond its shared geometry. The
    // native cloud owner releases materials; retire the instance buffer once.
    pp._releaseCloud=function(c,...args){const live=c?.group&&!c._released,result=release.call(this,c,...args);
      if(live)c.group.traverse(o=>{if(o.isInstancedMesh)o.dispose();});return result;};
  }
  cp.dispose=function(...args){retire(this);return dispose.apply(this,args);};
  if(Actor?.prototype)for(const name of ['reset','splat']){const original=Actor.prototype[name];Actor.prototype[name]=function(...args){
      const result=original.apply(this,args);if(name==='reset'||!this.alive){presentationBlocked.delete(this.character);retire(this.character);}return result;};}
}
