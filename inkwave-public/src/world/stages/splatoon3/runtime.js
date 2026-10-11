// Kinematic stage surfaces. Rendering, OBB collision and paint coordinates share one transform.
// Motion curves and all authored dimensions are provisional, NOT extracted Nintendo parameters.
import * as THREE from 'three';
import { G } from '../../../core/ctx.js';
import { GroundHit, Hit } from '../../../game/physics.js';
import { stageDescriptor } from './index.js';
import { StageScenery } from './scenery.js';

const v=new THREE.Vector3(), p=new THREE.Vector3(), q=new THREE.Quaternion();
const boxCorners=Array.from({length:8},(_,i)=>[i&1?1:-1,i&2?1:-1,i&4?1:-1]);
const finitePoint=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const ease=x=>x*x*(3-2*x);

export class StageRuntime {
  constructor(level,scene,paint,levelMaterial,grateMaterial,{scenery=true}={}) {
    this.level=level; this.scene=scene; this.paint=paint; level.stageRuntime=this;
    this.descriptor=stageDescriptor(level.layout.stageId,level.layout.layoutRule);
    this.group=new THREE.Group(); this.group.name='stage25-kinematics';
    this.controllers=new Map(); this.elapsed=0; this.epoch=0; this.ruleState={}; this.metrics={steps:0,maskMs:0,stepMs:0};
    this._support=new GroundHit(); this._ray=new Hit(); this._delta=new THREE.Matrix4();
    this.water=level.layout.gimmicks?.find(g=>g.type==='water-level')||null;
    this.waterY=this.water?.high??level.layout.hazard.waterY;
    this.glassMaterial=new THREE.MeshStandardMaterial({color:0xe2f9ff,vertexColors:true,transparent:true,opacity:0.28,roughness:0.18,metalness:0.18,depthWrite:false,side:THREE.DoubleSide});
    const glassGeo=level.buildGeometry(paint?.size||1,b=>b.glass&&!b.dynamic);
    if(glassGeo.index.count){this.glass=new THREE.Mesh(glassGeo,this.glassMaterial);this.glass.name='solid-uninkable-glass';this.glass.renderOrder=2;this.group.add(this.glass);}else glassGeo.dispose();
    for(const b of level.blocks) if(b.dynamic) {
      const d=b.dynamic;
      if(!finitePoint(d.pivot))throw new Error(`Invalid pivot ${d.id}`);
      let c=this.controllers.get(d.id);
      if(!c){c={id:d.id,def:d,blocks:[],faces:[],matrix:new THREE.Matrix4(),previous:new THREE.Matrix4(),value:0,poweredUntil:0,meshes:[]};this.controllers.set(d.id,c);}
      c.blocks.push({block:b,center:b.center.clone(),axes:b.axes.map(a=>a.clone()),aligned:b.aligned});
      for(const id of b.faces) if(id>=0) {const f=level.faces[id];c.faces.push({face:f,origin:f.origin.clone(),n:f.n.clone(),u:f.u.clone(),v:f.v.clone()});}
    }
    for(const c of this.controllers.values()) for(const type of ['solid','grate','glass']) {
      const geo=level.buildGeometry(paint?.size||1,b=>b.dynamic?.id===c.id&&(type==='glass'?b.glass:type==='grate'?b.grate:!b.grate&&!b.glass));
      if(!geo.index.count){geo.dispose();continue;}
      const mesh=new THREE.Mesh(geo,type==='glass'?this.glassMaterial:type==='grate'?grateMaterial:levelMaterial);
      mesh.name=`stage25:${c.id}:${type}`; mesh.matrixAutoUpdate=false; mesh.castShadow=type==='solid';mesh.receiveShadow=true;
      c.meshes.push(mesh); this.group.add(mesh);
    }
    this.conveyors=level.blocks.filter(b=>b.conveyor);
    this.actuators=level.blocks.filter(b=>b.actuator);
    this.scenery=scenery?new StageScenery(level):null;
    if(this.scenery)this.group.add(this.scenery.group);
    scene?.add(this.group);
    this._buildMaskCandidates();
    this.refreshPaintMasks();
  }
  reset() {
    this.elapsed=0;this.epoch++;this.ruleState={};
    for(const c of this.controllers.values()){c.value=0;c.poweredUntil=0;this._pose(c,0,0,false);}
    this.waterY=this.water?.high??this.level.layout.hazard.waterY;
    this.refreshPaintMasks(); this.metrics={steps:0,maskMs:0,stepMs:0};
  }
  setRuleState(state) {
    if(!state||typeof state!=='object')throw new TypeError('Stage rule state must be an object');
    if(state.zoneOwner!==undefined&&![null,0,1].includes(state.zoneOwner))throw new TypeError('zoneOwner must be 0, 1 or null');
    if(state.waterLow!==undefined&&typeof state.waterLow!=='boolean')throw new TypeError('waterLow must be boolean');
    if(state.waterLow&&!this.ruleState.waterLow)this.ruleState.waterDropAt=this.elapsed;
    if(state.waterLow===false)delete this.ruleState.waterDropAt;
    if(state.zoneOwner!==undefined)this.ruleState.zoneOwner=state.zoneOwner;
    if(state.waterLow!==undefined)this.ruleState.waterLow=state.waterLow;
  }
  snapshot(){return {descriptor:{...this.descriptor},elapsed:this.elapsed,ruleState:{...this.ruleState},controllers:[...this.controllers.values()].map(c=>({id:c.id,value:c.value,poweredUntil:c.poweredUntil}))};}
  restore(s) {
    if(s?.descriptor?.rule!==this.descriptor.rule||s?.descriptor?.schemaVersion!==1||s?.descriptor?.hash!==this.descriptor.hash||s?.descriptor?.stageId!==this.descriptor.stageId||s?.descriptor?.revision!==this.descriptor.revision||!Number.isFinite(s.elapsed)||s.elapsed<0)throw new Error('Incompatible stage state');
    if(!Array.isArray(s.controllers)||s.controllers.length!==this.controllers.size)throw new Error('Invalid controller state');
    const seen=new Set();for(const x of s.controllers){if(seen.has(x.id)||!this.controllers.has(x.id)||!Number.isFinite(x.value)||!Number.isFinite(x.poweredUntil))throw new Error('Invalid controller');seen.add(x.id);}
    const rs=s.ruleState||{};if(rs.zoneOwner!==undefined&&![null,0,1].includes(rs.zoneOwner))throw new Error('Invalid owner');
    if(rs.waterLow!==undefined&&typeof rs.waterLow!=='boolean')throw new Error('Invalid water flag');
    if(rs.waterDropAt!==undefined&&(!Number.isFinite(rs.waterDropAt)||rs.waterDropAt<0||rs.waterDropAt>s.elapsed))throw new Error('Invalid water epoch');
    this.elapsed=s.elapsed;this.ruleState={...rs};
    for(const x of s.controllers){const c=this.controllers.get(x.id);c.value=clamp(x.value,-1,1);c.poweredUntil=x.poweredUntil;this._pose(c,this.elapsed,0,false);}
    this._water();this.refreshPaintMasks();this.epoch++;
  }
  _fraction(d,t) {
    const period=Math.max(0.001,d.periodSeconds||20),half=period/2,travel=Math.min(half,d.transitionSeconds||half);
    const phase=((t+(d.phaseSeconds||0))%period+period)%period;
    // Hold, smooth travel, hold, return. Period and curves are explicitly unverified.
    return phase<half ? ease(clamp((phase-(half-travel))/travel,0,1)) : 1-ease(clamp((phase-(period-travel))/travel,0,1));
  }
  _pose(c,t,dt,carry=true) {
    const d=c.def,m=c.matrix;
    c.previous.copy(m);m.identity();
    if(d.kind==='rotate'||d.kind==='hinge') {
      const axis=d.axis?v.set(...d.axis).normalize():v.set(0,1,0);
      const angle=d.kind==='hinge'?(d.angle||0)*(0.5+0.5*Math.cos(2*Math.PI*t/(d.periodSeconds||40))):d.continuous?(d.angle||2*Math.PI)*t/(d.periodSeconds||24):(d.angle||0)*this._fraction(d,t);
      m.makeRotationAxis(axis,angle);p.set(...d.pivot);v.copy(p).applyMatrix4(m);m.setPosition(p.sub(v));
    } else {
      let f=this._fraction(d,t);
      if(d.kind==='controlled') {
        const target=d.control==='zoneOwner'?(this.ruleState.zoneOwner===0?1:this.ruleState.zoneOwner===1?-1:0):(c.poweredUntil>t?1:0);
        const len=Math.max(0.001,Math.hypot(...(d.offset||[0,0,0]))),speed=(target===0?d.returnSpeed:d.speed)||1;
        c.value+=clamp(target-c.value,-speed*dt/len,speed*dt/len);f=c.value;
      }
      if(d.offset)m.makeTranslation(d.offset[0]*f,d.offset[1]*f,d.offset[2]*f);
    }
    const changed=m.elements.some((x,i)=>Math.abs(x-c.previous.elements[i])>1e-9);
    if(!changed)return false;
    const riders=[];
    if(carry) for(const a of G.actors||[]) {
      if(!a.alive||!a.grounded||a.remote||a.superJumpState||a.climbing)continue;
      const hit=G.physics?.groundProbe(a.pos.x,a.pos.y,a.pos.z,0.12,0.16,0,this._support,a.form==='squid');
      if(hit?.hit&&c.blocks.some(x=>x.block.id===hit.block))riders.push(a);
    }
    q.setFromRotationMatrix(m);
    for(const original of c.blocks) {
      const b=original.block;b.center.copy(original.center).applyMatrix4(m);
      b.axes.forEach((a,i)=>a.copy(original.axes[i]).applyQuaternion(q));
      b.aligned=original.aligned&&Math.abs(b.axes[0].x)>0.999999&&Math.abs(b.axes[1].y)>0.999999&&Math.abs(b.axes[2].z)>0.999999;
      b.aabbMin.set(Infinity,Infinity,Infinity);b.aabbMax.set(-Infinity,-Infinity,-Infinity);
      for(const a of boxCorners){v.copy(b.center).addScaledVector(b.axes[0],a[0]*b.half.x).addScaledVector(b.axes[1],a[1]*b.half.y).addScaledVector(b.axes[2],a[2]*b.half.z);b.aabbMin.min(v);b.aabbMax.max(v);}
      this.level.reindexBlock(b);
    }
    for(const original of c.faces){const f=original.face;f.origin.copy(original.origin).applyMatrix4(m);f.n.copy(original.n).applyQuaternion(q);f.u.copy(original.u).applyQuaternion(q);f.v.copy(original.v).applyQuaternion(q);}
    for(const mesh of c.meshes){mesh.matrix.copy(m);mesh.matrixWorldNeedsUpdate=true;}
    if(riders.length){this._delta.copy(c.previous).invert().premultiply(m);for(const a of riders){a.pos.applyMatrix4(this._delta);}}
    return true;
  }
  _water() {
    if(!this.water)return false;
    const g=this.water,at=this.ruleState.waterDropAt??(this.level.layout.layoutRule==='turf'?g.turfDropSeconds:Infinity);
    const f=ease(clamp((this.elapsed-at)/(g.transitionSeconds||1),0,1)),y=g.high+(g.low-g.high)*f;
    const changed=Math.abs(y-this.waterY)>1e-9;this.waterY=y;
    if(G.env?.sea&&this._env===G.env)G.env.sea.position.y=y;
    return changed;
  }
  step(dt,match) {
    if(!Number.isFinite(dt)||dt<=0||match?.paused||match?.state==='results')return;
    const started=performance.now();this.elapsed+=Math.min(dt,0.25);
    let dirty=this._water();
    for(const c of this.controllers.values())dirty=this._pose(c,this.elapsed,dt)||dirty;
    if(this.conveyors.length) for(const a of G.actors||[]) {
      if(!a.alive||!a.grounded||a.remote||a.superJumpState||a.climbing)continue;
      const hit=G.physics?.groundProbe(a.pos.x,a.pos.y,a.pos.z,0.12,0.18,0,this._support,a.form==='squid');
      const b=hit?.hit&&this.level.blocks[hit.block];if(!b?.conveyor)continue;
      a.pos.addScaledVector(v.set(...b.conveyor.velocity),dt);
    }
    if(dirty){this.refreshPaintMasks();this.epoch++;}
    this.metrics.steps++;this.metrics.stepMs+=performance.now()-started;
  }
  /** Called only after the existing network mute gate; replicated paint events reach the same actuator. */
  onPaintContact(center,radius,team,opts={}) {
    if(opts.cosmetic||!center||!(radius>0))return false;
    let best=null,dist=Infinity;
    for(const b of this.actuators){
      G.physics?.closestOnBlock(b,center,p);const d=p.distanceToSquared(center);
      // Contact, not an explosion-sized activation volume behind a wall.
      if(d<dist&&d<=0.18*0.18){best=b;dist=d;}
    }
    if(!best)return false;
    const c=this.controllers.get(best.actuator);if(!c)return false;
    c.poweredUntil=Math.max(c.poweredUntil,this.elapsed+(c.def.decaySeconds||2));return true;
  }
  isHazard(pos) {
    const h=this.level.layout.hazard;
    if(h.kind==='water'&&pos.y<this.waterY-0.1)return true;
    return pos.y<h.killY;
  }
  _buildMaskCandidates() {
    // Bounds of every kinematic sweep. Never drop masks because a platform moves beyond its initial AABB.
    const ranges=[];
    for(const c of this.controllers.values()){
      const min=new THREE.Vector3(Infinity,Infinity,Infinity),max=new THREE.Vector3(-Infinity,-Infinity,-Infinity);
      for(const {block:b} of c.blocks){min.min(b.aabbMin);max.max(b.aabbMax);}
      const d=c.def;
      if(d.offset){for(let i=0;i<3;i++){min.setComponent(i,min.getComponent(i)-Math.abs(d.offset[i]));max.setComponent(i,max.getComponent(i)+Math.abs(d.offset[i]));}}
      else {const pivot=new THREE.Vector3(...d.pivot),r=Math.max(min.distanceTo(pivot),max.distanceTo(pivot));min.copy(pivot).addScalar(-r);max.copy(pivot).addScalar(r);}
      ranges.push({min,max});
    }
    this.navRanges=ranges;
    this.maskFaces=(this.paint?.paintFaces||[]).filter(f=>{
      if(this.water||this.level.blocks[f.block].dynamic)return true;
      const b=this.level.blocks[f.block];return ranges.some(r=>b.aabbMax.x>=r.min.x&&b.aabbMin.x<=r.max.x&&b.aabbMax.z>=r.min.z&&b.aabbMin.z<=r.max.z&&b.aabbMax.y>=r.min.y&&b.aabbMin.y<=r.max.y);
    });
  }
  refreshPaintMasks() {
    const paint=this.paint;if(!paint?.dead)return;
    const started=performance.now(),level=this.level;let changed=false;
    for(const f of this.maskFaces){
      for(let j=0;j<f.nv;j++)for(let i=0;i<f.nu;i++){
        const u=(i+0.5)*f.cu,w=(j+0.5)*f.cv,k=f.grid+j*f.nu+i;
        p.copy(f.origin).addScaledVector(f.u,u).addScaledVector(f.v,w).addScaledVector(f.n,0.06);
        const dead=!level.faceContainsUV(f,u,w)||level.pointInside(p,0,f.block)||(level.layout.hazard.kind==='water'&&p.y<this.waterY);
        if(+dead===paint.dead[k])continue;
        const delta=dead?-1:1;paint.dead[k]=+dead;changed=true;
        if(f.turf){paint.turfTotal+=delta;paint.turfArea+=delta*f.cu*f.cv;const owner=paint.grid[k];if(owner)paint.counts[owner-1]+=delta;}
      }
    }
    if(changed)paint.version++;
    this.metrics.maskMs+=performance.now()-started;
  }
  affectsNavigation(x,y,z) {
    return !!this.water || (this.navRanges||[]).some(r=>x>=r.min.x-1&&x<=r.max.x+1&&z>=r.min.z-1&&z<=r.max.z+1&&y>=r.min.y-2&&y<=r.max.y+2);
  }
  rebuildAtlasGeometry(size) {
    // Build in the controller's current world pose, then convert all geometric attributes back
    // to its rest space. Merely applying inverse matrix to position leaves faceTan wrong.
    const inv=new THREE.Matrix4();
    for(const c of this.controllers.values()) for(const mesh of c.meshes) {
      const type=mesh.name.split(':').at(-1);
      const geo=this.level.buildGeometry(size,b=>b.dynamic?.id===c.id&&(type==='glass'?b.glass:type==='grate'?b.grate:!b.grate&&!b.glass));
      inv.copy(c.matrix).invert();geo.applyMatrix4(inv);
      const tangent=geo.getAttribute('faceTan');
      for(let i=0;i<tangent.count;i++){v.fromBufferAttribute(tangent,i).transformDirection(inv);tangent.setXYZ(i,v.x,v.y,v.z);}
      mesh.geometry.dispose();mesh.geometry=geo;
    }
    if(this.glass){this.glass.geometry.dispose();this.glass.geometry=this.level.buildGeometry(size,b=>b.glass&&!b.dynamic);}
  }
  applyEnvironment(env) {
    if(!env)return;
    if(this._env!==env){this._env=env;this._restore=[];this._envSeen=new WeakSet();this._seaY=env.sea?.position.y;this._seaVisible=env.sea?.visible;}
    // Dock meshes are regenerated in-place on quality/theme changes. Hide new children too.
    for(const child of env.root?.children||[]) {
      if(child===env.sky||child===env.sea||child.isLight||/sky|sea|water|sun/i.test(child.name))continue;
      if(!this._envSeen.has(child)){this._envSeen.add(child);this._restore.push([child,child.visible]);}
      child.visible=false;
    }
    if(env.sea){env.sea.visible=this.level.layout.hazard.kind==='water';env.sea.position.y=this.waterY;}
  }
  dispose() {
    for(const [object,visible] of this._restore||[])object.visible=visible;
    if(this._env?.sea){this._env.sea.position.y=this._seaY??this._env.sea.position.y;this._env.sea.visible=this._seaVisible??true;}
    if(this.level.stageRuntime===this)this.level.stageRuntime=null;
    this.scene?.remove(this.group);for(const c of this.controllers.values())for(const m of c.meshes)m.geometry.dispose();this.glass?.geometry.dispose();this.glassMaterial.dispose();this.scenery?.dispose();
  }
}
