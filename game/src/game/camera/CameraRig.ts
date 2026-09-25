import * as THREE from "three";
import { CAMERA } from "../data/tuning";
import { Player } from "../entities/Player";
import { World, RayHit } from "../physics/World";
import { aimDir } from "../weapons/WeaponSystem";

/**
 * Camera rig chain: Player -> AimRig(yaw/pitch, instant) -> BodyFollow(second-order spring, separate X/Z vs Y)
 *  -> CameraTarget(shoulder offset) -> CollisionRig(sphere-cast pull-in) -> PresentationRig(recoil/shake/FOV) -> Camera
 */
class SecondOrder {
  y = 0; yd = 0;
  constructor(public f: number, public zeta = 1.0) {}
  update(x: number, dt: number) {
    const w = 2 * Math.PI * this.f;
    const k1 = this.zeta / (Math.PI * this.f), k2 = 1 / (w * w);
    const k2s = Math.max(k2, (dt * dt) / 2 + (dt * k1) / 2, dt * k1);
    this.y += dt * this.yd;
    this.yd += (dt * (x - this.y - k1 * this.yd)) / k2s;
    return this.y;
  }
  reset(v: number) { this.y = v; this.yd = 0; }
}

const _hit: RayHit = { t: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), box: null!, face: 0 };
const _dir = new THREE.Vector3(), _pivot = new THREE.Vector3(), _desired = new THREE.Vector3(), _right = new THREE.Vector3(), _fwd = new THREE.Vector3();

export class CameraRig {
  camera: THREE.PerspectiveCamera;
  yaw = 0; pitch = 0;
  private fx = new SecondOrder(CAMERA.horizontalFrequency, 1.0);
  private fz = new SecondOrder(CAMERA.horizontalFrequency, 1.0);
  private fy = new SecondOrder(CAMERA.verticalFrequency, 1.0);
  private dist = new SecondOrder(4, 1);
  private fovS = new SecondOrder(3, 1);
  shake = 0; recoil = 0;
  position = new THREE.Vector3();
  aimOrigin = new THREE.Vector3();
  private initialised = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, aspect, 0.1, 600);
    this.dist.reset(CAMERA.distance); this.fovS.reset(CAMERA.fov);
  }

  snapTo(p: Player) {
    this.yaw = p.aimYaw; this.pitch = 0;
    this.fx.reset(p.pos.x); this.fz.reset(p.pos.z); this.fy.reset(p.pos.y);
    this.initialised = true;
  }

  addLook(dYaw: number, dPitch: number) {
    this.yaw -= dYaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, THREE.MathUtils.degToRad(CAMERA.pitchMin), THREE.MathUtils.degToRad(CAMERA.pitchMax));
  }

  update(p: Player, world: World, dt: number, renderPos: THREE.Vector3) {
    if (!this.initialised) this.snapTo(p);
    // body follow (vertical is softer: jumps do not drag the camera 1:1)
    const px = this.fx.update(renderPos.x, dt), pz = this.fz.update(renderPos.z, dt);
    let targetY = renderPos.y;
    if (!p.grounded && p.vel.y > 0) targetY = Math.min(renderPos.y, this.fy.y + 0.35); // rising: lag more
    const py = this.fy.update(targetY, dt);
    const squid = p.squidBlend;
    const hOff = THREE.MathUtils.lerp(CAMERA.heightOffset, CAMERA.swimHeightOffset, squid);
    const wantDist = THREE.MathUtils.lerp(CAMERA.distance, CAMERA.swimDistance, squid) + (p.wr.charging ? -0.3 : 0);
    _pivot.set(px, py + hOff, pz);
    aimDir(this.yaw, this.pitch, _dir);
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _pivot.addScaledVector(_right, CAMERA.shoulderOffset);
    // collision: cast from pivot backwards
    _desired.copy(_dir).multiplyScalar(-1);
    let d = wantDist;
    if (world.raycast(_pivot, _desired, wantDist + CAMERA.collisionRadius, _hit)) d = Math.max(CAMERA.minDistance, _hit.t - CAMERA.collisionRadius);
    // pulled-in distance snaps quickly, restores slowly
    if (d < this.dist.y) this.dist.reset(d); else this.dist.update(d, dt);
    this.position.copy(_pivot).addScaledVector(_desired, this.dist.y);
    // presentation: recoil kick + shake
    this.recoil = Math.max(0, this.recoil - dt * 8);
    this.shake = Math.max(0, this.shake - dt * 4);
    const sh = this.shake * 0.05;
    const kick = this.recoil * 0.008;
    this.camera.position.copy(this.position);
    this.camera.position.x += (Math.random() - 0.5) * sh; this.camera.position.y += (Math.random() - 0.5) * sh;
    const lookPitch = this.pitch + kick;
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw; this.camera.rotation.x = lookPitch;
    const fov = this.fovS.update(CAMERA.fov + (p.wr.charging ? CAMERA.chargerFovAdd * p.wr.charge : 0) + (p.state === "SWIM_FAST" ? 3 : 0), dt);
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    // aim origin used by weapons so shots land at the reticle
    this.aimOrigin.copy(this.camera.position);
    _fwd.copy(_dir);
    p.aimOrigin = this.aimOrigin;
  }
}
