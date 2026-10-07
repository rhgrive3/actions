// Build-only map ownership for the already calibrated DeviceMotion deltas.
import { replaceOnce } from './input-adapter.mjs';
export function adaptMapGyro(rel, code) {
  const patch=(before,after,label)=>{code=replaceOnce(code,before,after,'map gyro: '+label);};
  if(rel==='src/game/player.js') {
    patch('      this.input.mobile?.gyro?.discard();','      this.clearMapGyro();\n      this.input.mobile?.gyro?.discard();','disabled clears map queue');
    patch('    const mdx = mapUp ? 0 : inp.mouse.dx, mdy = mapUp ? 0 : inp.mouse.dy;', '    if (!touch?.gyro?.enabled) this.clearMapGyro();\n    const mdx = mapUp ? 0 : inp.mouse.dx, mdy = mapUp ? 0 : inp.mouse.dy;', 'OFF clears map queue');
    patch('      const g = touch.gyro.consume(this._gyro || (this._gyro = { yaw: 0, pitch: 0 }));','      const g = this.captureMapGyro(mapUp);','single sensor consumer');
    patch('    inp.mobile?.gyro?.discard?.();','    // Dead navigation routes motion after resolving whether the map is open.','defer dead motion consumption');
    patch('    this.mapHeld = this.respawnMapOpen();','    this.mapHeld = this.respawnMapOpen();\n    this.captureMapGyro(this.mapHeld);','dead map owns gyro');
    patch('    this.pendingRespawnJump = null;\n    this.padJumpTarget = null;', '    this.clearMapGyro();\n    this.pendingRespawnJump = null;\n    this.padJumpTarget = null;', 'lifecycle clears map motion');
    patch('      selected = true; this.pendingRespawnJump = null;', '      this._mapGyroYaw = this._mapGyroPitch = 0;\n      this._mapGyroCursor = false; this.mapGyroTarget = null;\n      selected = true; this.pendingRespawnJump = null;', 'D-pad remains explicit selection');
    patch('    const target = this.padJumpTarget;', '    if (!selected && this._mapGyroCursor) this.padJumpTarget = this.mapGyroTarget;\n    const target = this.padJumpTarget;', 'gyro hover uses existing confirmation');
    patch('  canRequestMapJump() {', METHODS+'\n  canRequestMapJump() {','map queue methods');
    patch('  resetCamera() {','  resetCamera() {\n    this.clearMapGyro();','reset clears gyro cursor');
  }
  if(rel==='src/ui/diorama.js') {
    patch('    // snap: nearest jumpable pin within reach', `    const navigation = G.match?.controller;
    const motion = navigation?.consumeMapGyro?.();
    if (motion && (motion.yaw || motion.pitch)) {
      // Re-project angular input through the existing camera lens; no Nintendo
      // sensitivity coefficient is assumed and no dt is applied a second time.
      const e = cam.projectionMatrix?.elements, fx=e?.[0], fy=e?.[5];
      if (Number.isFinite(fx) && fx > 0 && Number.isFinite(fy) && fy > 0) {
        const angle = (value, focal, delta, lo, hi) => {
          const a = Math.atan((value - .5) * 2 / focal) - delta;
          const bounded = clamp(a, Math.atan((lo-.5)*2/focal), Math.atan((hi-.5)*2/focal));
          return .5 + Math.tan(bounded) * focal / 2;
        };
        this.cx=angle(this.cx,fx,motion.yaw,.02,.98);
        this.cy=angle(this.cy,fy,motion.pitch,.04,.96);
        moved=true;this.hasCursor=true;navigation._mapGyroCursor=true;
      }
    }
    // snap: nearest jumpable pin within reach`, 'project gyro into map cursor');
    patch('    const cxp = this.cx * W, cyp = this.cy * H;', `    if (navigation?._mapGyroCursor) navigation.mapGyroTarget = best === 3 ? {spawn:true} :
      best >= 0 && this.pins[best].ok ? {actor:this.pins[best].target} : null;
    const cxp = this.cx * W, cyp = this.cy * H;`, 'share motion hover target identity');
  }
  return code;
}
const METHODS=`  clearMapGyro() {
    this._mapGyroYaw = this._mapGyroPitch = 0;
    this._mapGyroOpen = false; this._mapGyroCursor = false; this.mapGyroTarget = null;
  }

  captureMapGyro(open) {
    const mobile=this.input.mobile, gyro=mobile?.active && mobile.root && mobile.gyro;
    const zero={yaw:0,pitch:0};
    if (!gyro?.enabled) { this.clearMapGyro(); return zero; }
    open=!!open;
    if (open !== !!this._mapGyroOpen) {
      this.clearMapGyro(); this._mapGyroOpen=open; gyro.discard(); return zero;
    }
    const delta=gyro.consume(this._gyro || (this._gyro={yaw:0,pitch:0}));
    if (!open) return delta;
    this._mapGyroYaw=(this._mapGyroYaw || 0)+(Number.isFinite(delta.yaw)?delta.yaw:0);
    this._mapGyroPitch=(this._mapGyroPitch || 0)+(Number.isFinite(delta.pitch)?delta.pitch:0);
    return zero;
  }

  consumeMapGyro() {
    const result={yaw:this._mapGyroYaw || 0,pitch:this._mapGyroPitch || 0};
    this._mapGyroYaw=this._mapGyroPitch=0;
    return result;
  }
`;
