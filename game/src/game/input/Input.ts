import { CAMERA } from "../data/tuning";

/**
 * Touch-first input. Landscape layout:
 *  - left half: floating virtual stick
 *  - right half: drag to aim (coarse), gyro for fine aim
 *  - HTML buttons (fire/swim/jump/alt) report through setButton()
 * Gyro pipeline: raw rotationRate -> orientation normalisation -> bias -> deadzone -> velocity-dependent smoothing -> sensitivity -> delta
 */
export interface FrameLook { dYaw: number; dPitch: number }

export class Input {
  moveX = 0; moveY = 0;
  fire = false; swim = false; jump = false; alt = false;
  private look: FrameLook = { dYaw: 0, dPitch: 0 };
  stickActive = false; stickOrigin = { x: 0, y: 0 }; stickPos = { x: 0, y: 0 };
  private stickId: number | null = null;
  private lookId: number | null = null;
  private lastLook = { x: 0, y: 0 };
  private keys = new Set<string>();
  private pointerLocked = false;
  gyroEnabled = false; gyroAvailable = false;
  gyroSensitivity = 1.0; touchSensitivity = 1.0;
  private gyroBias = { a: 0, b: 0 }; private gyroSmooth = { a: 0, b: 0 };
  private gyroAccum = { yaw: 0, pitch: 0 };
  private motionHandler: ((e: DeviceMotionEvent) => void) | null = null;
  isTouch = navigator.maxTouchPoints > 0;
  private mouseAlt = false;
  private mouseFire = false;
  btn = { fire: false, swim: false, jump: false, alt: false };
  recenterRequested = false;
  onAnyInput?: () => void;

  constructor(private el: HTMLElement) {
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", this.onDown, { passive: false });
    el.addEventListener("pointermove", this.onMove, { passive: false });
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onUp);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => { this.keys.add(e.code); if (e.code === "Space") e.preventDefault(); });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
    document.addEventListener("pointerlockchange", () => { this.pointerLocked = document.pointerLockElement === el; });
    el.addEventListener("mousemove", (e) => { if (this.pointerLocked) { this.look.dYaw += e.movementX * CAMERA.mouseSensitivity * (Math.PI / 180); this.look.dPitch -= e.movementY * CAMERA.mouseSensitivity * (Math.PI / 180); } });
    el.addEventListener("mousedown", (e) => {
      if (e.button === 0) { this.mouseFire = true; if (!this.pointerLocked && this.lockWanted) this.requestPointerLock(); }
      if (e.button === 2) this.mouseAlt = true;
    });
    window.addEventListener("mouseup", (e) => { if (e.button === 0) this.mouseFire = false; if (e.button === 2) this.mouseAlt = false; });
    this.gyroAvailable = typeof DeviceMotionEvent !== "undefined";
  }

  lockWanted = false;
  requestPointerLock() {
    try { const r = (this.el as any).requestPointerLock?.(); if (r && typeof r.catch === "function") r.catch(() => { /* gesture required */ }); } catch { /* unsupported */ }
  }

  private onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse") { this.onAnyInput?.(); return; }
    this.isTouch = true; this.onAnyInput?.();
    e.preventDefault();
    const w = window.innerWidth;
    if (e.clientX < w * 0.42 && this.stickId === null) {
      this.stickId = e.pointerId; this.stickActive = true;
      this.stickOrigin = { x: e.clientX, y: e.clientY }; this.stickPos = { x: e.clientX, y: e.clientY };
    } else if (this.lookId === null) {
      this.lookId = e.pointerId; this.lastLook = { x: e.clientX, y: e.clientY };
    }
  };
  private onMove = (e: PointerEvent) => {
    if (e.pointerType === "mouse") return;
    e.preventDefault();
    if (e.pointerId === this.stickId) {
      this.stickPos = { x: e.clientX, y: e.clientY };
      const R = 56;
      let dx = (e.clientX - this.stickOrigin.x) / R, dy = (e.clientY - this.stickOrigin.y) / R;
      const l = Math.hypot(dx, dy);
      if (l > 1) { // floating stick follows the thumb
        this.stickOrigin.x = e.clientX - dx / l * R; this.stickOrigin.y = e.clientY - dy / l * R; dx /= l; dy /= l;
      }
      this.moveX = dx; this.moveY = -dy;
    } else if (e.pointerId === this.lookId) {
      const dx = e.clientX - this.lastLook.x, dy = e.clientY - this.lastLook.y;
      this.lastLook = { x: e.clientX, y: e.clientY };
      const s = CAMERA.touchSensitivity * this.touchSensitivity * (Math.PI / 180);
      this.look.dYaw += dx * s; this.look.dPitch -= dy * s * 0.85;
    }
  };
  private onUp = (e: PointerEvent) => {
    if (e.pointerId === this.stickId) { this.stickId = null; this.stickActive = false; this.moveX = 0; this.moveY = 0; }
    if (e.pointerId === this.lookId) this.lookId = null;
  };

  setButton(name: "fire" | "swim" | "jump" | "alt", down: boolean) {
    this.onAnyInput?.();
    this.btn[name] = down;
    (this as any)[name] = down;
  }

  async enableGyro(): Promise<boolean> {
    const DME = DeviceMotionEvent as any;
    try {
      if (typeof DME?.requestPermission === "function") {
        const r = await DME.requestPermission();
        if (r !== "granted") return false;
      }
    } catch { return false; }
    if (this.motionHandler) window.removeEventListener("devicemotion", this.motionHandler);
    this.motionHandler = (e: DeviceMotionEvent) => {
      const rr = e.rotationRate; if (!rr) return;
      const dt = (e.interval && e.interval < 1 ? e.interval : 1 / 60);
      // landscape normalisation: when the phone is held landscape, yaw ≈ beta axis (or alpha depending on orientation angle)
      const ang = (screen.orientation?.angle ?? (window as any).orientation ?? 0) as number;
      let yawRate = 0, pitchRate = 0;
      const a = (rr.alpha ?? 0), b = (rr.beta ?? 0), g = (rr.gamma ?? 0);
      if (ang === 90) { yawRate = -b; pitchRate = a; }
      else if (ang === -90 || ang === 270) { yawRate = b; pitchRate = -a; }
      else { yawRate = a; pitchRate = -b; }
      void g;
      // bias estimation (slow) + deadzone + velocity dependent smoothing
      this.gyroBias.a += (yawRate - this.gyroBias.a) * 0.002; this.gyroBias.b += (pitchRate - this.gyroBias.b) * 0.002;
      let y = yawRate - this.gyroBias.a, p = pitchRate - this.gyroBias.b;
      const dz = 0.6; // deg/s
      y = Math.abs(y) < dz ? 0 : y - Math.sign(y) * dz; p = Math.abs(p) < dz ? 0 : p - Math.sign(p) * dz;
      const speed = Math.hypot(y, p);
      const k = speed > 40 ? 0.85 : speed > 10 ? 0.6 : 0.35; // fast motion = less smoothing
      this.gyroSmooth.a += (y - this.gyroSmooth.a) * k; this.gyroSmooth.b += (p - this.gyroSmooth.b) * k;
      const sens = CAMERA.gyroSensitivity * this.gyroSensitivity * (Math.PI / 180);
      this.gyroAccum.yaw += -this.gyroSmooth.a * dt * sens;
      this.gyroAccum.pitch += this.gyroSmooth.b * dt * sens;
    };
    window.addEventListener("devicemotion", this.motionHandler);
    this.gyroEnabled = true;
    return true;
  }
  disableGyro() { if (this.motionHandler) window.removeEventListener("devicemotion", this.motionHandler); this.motionHandler = null; this.gyroEnabled = false; }

  /** Consume accumulated look deltas (radians). */
  consumeLook(out: FrameLook) {
    out.dYaw = this.look.dYaw + this.gyroAccum.yaw; out.dPitch = this.look.dPitch + this.gyroAccum.pitch;
    this.look.dYaw = this.look.dPitch = 0; this.gyroAccum.yaw = this.gyroAccum.pitch = 0;
    // keyboard look (arrow keys)
    const ks = 2.2 / 60;
    if (this.keys.has("ArrowLeft")) out.dYaw -= ks; if (this.keys.has("ArrowRight")) out.dYaw += ks;
    if (this.keys.has("ArrowUp")) out.dPitch += ks; if (this.keys.has("ArrowDown")) out.dPitch -= ks;
  }

  /** Poll keyboard into the movement/button state (desktop debug). Touch buttons OR keyboard. */
  pollKeyboard() {
    let x = 0, y = 0;
    if (this.keys.has("KeyA")) x -= 1; if (this.keys.has("KeyD")) x += 1;
    if (this.keys.has("KeyW")) y += 1; if (this.keys.has("KeyS")) y -= 1;
    if (!this.stickActive) { this.moveX = x; this.moveY = y; }
    this.swim = this.btn.swim || this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.keys.has("KeyE");
    this.jump = this.btn.jump || this.keys.has("Space");
    this.alt = this.btn.alt || this.keys.has("KeyQ") || this.mouseAlt;
    this.fire = this.btn.fire || this.mouseFire;
  }
}
