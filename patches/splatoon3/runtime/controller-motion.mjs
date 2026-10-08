// #71: optional controller-motion input from a user-authorized HID/driver
// bridge. The standard Gamepad API does not expose Joy-Con/Pro gyro data.
// No bridge: no motion, no polling, and existing stick/touch remains unchanged.
const GUARD=Symbol.for('inkwave.s3.pad-motion.v1');
const zero=()=>({yaw:0,pitch:0,available:false});
const gainAt=s=> {
  const x=Math.max(-5,Math.min(5,Number.isFinite(s)?s:0));
  // Public controller-bridge measurements: -5 ~1x, 0 ~1.8x, +5 ~3x.
  // Linear interim interpolation is NOT a Nintendo internal curve.
  return x<=0?1+(x+5)*.16:1.8+x*.24;
};
export function controllerMotionDelta(sample,dt,sensitivity=0,invertY=false) {
  if (!sample || !(dt>0) || dt>0.25 || !Number.isFinite(sample.yawRate)
      || !Number.isFinite(sample.pitchRate)) return zero();
  if (Math.abs(sample.yawRate)>25 || Math.abs(sample.pitchRate)>25) return zero();
  const gain=gainAt(sensitivity);
  return {yaw:sample.yawRate*dt*gain,
    pitch:sample.pitchRate*dt*gain*(invertY?-1:1),available:true};
}
export function installControllerMotion({Input,PlayerController,G}) {
  if (!Input?.prototype || !PlayerController?.prototype) throw Error('pad-motion requires Input and PlayerController');
  const proto=Input.prototype;
  if (Object.hasOwn(proto,GUARD)) return;
  Object.defineProperty(proto,GUARD,{value:true});
  proto.setControllerMotionReader=function(reader) {
    if (reader!==null && reader!==undefined && typeof reader!=='function') throw TypeError('pad gyro reader');
    this.s3ControllerMotionReader=reader||null;
  };
  proto.controllerMotionStatus=function() {
    return this.s3ControllerMotionReader?'bridge-available':'bridge-unavailable';
  };
  const prior=PlayerController.prototype.update;
  PlayerController.prototype.update=function(dt) {
    const input=this.input,pad=input?.pad,reader=input?.s3ControllerMotionReader;
    if (this.enabled && reader && pad?.connected && input.lastDevice==='pad' && dt>0) {
      const mapUp=(G.rig?.mapK??0)>.05 || input.down?.('Tab') ||
        input.down?.('KeyM') || input.padButton?.(8) ||
        !!input.mobile?.mapOpen;
      if (!mapUp) {
        let sample=null;
        try { sample=reader(pad,dt); } catch { sample=null; }
        if (sample && (sample.padIndex===undefined || sample.padIndex===pad.index)) {
          const d=controllerMotionDelta(sample,dt,G.settings?.gyroSensitivity??0,G.settings?.invertY);
          if (d.available) {
            this.rig.yaw+=d.yaw;
            this.rig.pitch=Math.max(-1.05,Math.min(1.15,this.rig.pitch+d.pitch));
          }
        }
      }
    }
    return prior.call(this,dt);
  };
}
