// #71: Joy-Con / Pro Controller motion input path based on published
// Nintendo Switch HID reverse-engineering protocol and ST LSM6DS3 IMU calibration.
// Standard Gamepad API exposes sticks/buttons but no IMU data; this module provides
// the report decoder, WebHID device bridge, platform detection, and PlayerController composition.

export const NINTENDO_VENDOR_ID = 0x057e;
export const JOYCON_L_PRODUCT_ID = 0x2006;
export const JOYCON_R_PRODUCT_ID = 0x2007;
export const PRO_CONTROLLER_PRODUCT_ID = 0x2009;
export const JOYCON_GRIP_PRODUCT_ID = 0x200e;

// ST LSM6DS3 nominal sensitivity for ±2000 dps full-scale: 70 mdps/LSB = 0.070 dps/LSB.
// Expressed in SI radians per second: 0.070 * (π / 180) ≈ 0.0012217304763960306 rad/s per LSB.
export const DEFAULT_GYRO_SCALE = 0.070 * (Math.PI / 180);

const GUARD = Symbol.for('inkwave.s3.pad-motion.v1');
const zero = () => ({ yaw: 0, pitch: 0, available: false });

export const gainAt = s => {
  const x = Math.max(-5, Math.min(5, Number.isFinite(s) ? s : 0));
  // Public controller-bridge measurements: -5 ~1x, 0 ~1.8x, +5 ~3x.
  // Linear interim interpolation is NOT a Nintendo internal curve.
  return x <= 0 ? 1 + (x + 5) * 0.16 : 1.8 + x * 0.24;
};

export function controllerMotionDelta(sample, dt, sensitivity = 0, invertY = false, invertX = false) {
  if (!sample || !(dt > 0) || dt > 0.25 || !Number.isFinite(sample.yawRate) || !Number.isFinite(sample.pitchRate)) {
    return zero();
  }
  if (Math.abs(sample.yawRate) > 25 || Math.abs(sample.pitchRate) > 25) return zero();
  const gain = gainAt(sensitivity);
  return {
    yaw: sample.yawRate * dt * gain * (invertX ? -1 : 1),
    pitch: sample.pitchRate * dt * gain * (invertY ? -1 : 1),
    available: true
  };
}

/**
 * Decode Nintendo Switch HID input reports (0x30 standard full report, 0x21 subcommand reply with IMU,
 * or 0x31 NFC/IR report with IMU) into calibrated angular velocities (rad/s).
 */
export function decodeSwitchMotionReport(data, options = {}) {
  const view = data instanceof DataView ? data :
    ArrayBuffer.isView(data) ? new DataView(data.buffer, data.byteOffset, data.byteLength) :
    data instanceof ArrayBuffer ? new DataView(data) : null;
  if (!view || view.byteLength < 25) {
    return { yawRate: 0, pitchRate: 0, available: false, reason: 'payload-too-short' };
  }
  const reportId = view.getUint8(0);
  if (reportId !== 0x30 && reportId !== 0x21 && reportId !== 0x31) {
    return { yawRate: 0, pitchRate: 0, available: false, reason: 'unsupported-report-id', reportId };
  }
  const productId = options.productId ?? (options.device?.productId ?? null);
  // In Splatoon 3 two-handed Joy-Con play, aim motion is sourced exclusively from Joy-Con (R).
  if (productId === JOYCON_L_PRODUCT_ID || options.side === 'left') {
    return { yawRate: 0, pitchRate: 0, available: false, ignoredSide: 'left', reportId };
  }

  // Frame 0 IMU data (bytes 13..24):
  // Accel: bytes 13-14 (X), 15-16 (Y), 17-18 (Z) (int16 LE)
  // Gyro:  bytes 19-20 (1), 21-22 (2), 23-24 (3) (int16 LE)
  let rawG1 = view.getInt16(19, true);
  let rawG2 = view.getInt16(21, true);
  let rawG3 = view.getInt16(23, true);

  if (options.averageFrames && view.byteLength >= 49) {
    rawG1 = (rawG1 + view.getInt16(31, true) + view.getInt16(43, true)) / 3;
    rawG2 = (rawG2 + view.getInt16(33, true) + view.getInt16(45, true)) / 3;
    rawG3 = (rawG3 + view.getInt16(35, true) + view.getInt16(47, true)) / 3;
  }

  const scale = Number.isFinite(options.scale) ? options.scale : DEFAULT_GYRO_SCALE;
  const biasX = Number.isFinite(options.biasX) ? options.biasX : 0;
  const biasY = Number.isFinite(options.biasY) ? options.biasY : 0;
  const biasZ = Number.isFinite(options.biasZ) ? options.biasZ : 0;

  const rateX = (rawG1 - biasX) * scale;
  const rateY = (rawG2 - biasY) * scale;
  const rateZ = (rawG3 - biasZ) * scale;

  // Coordinate mapping for aim:
  // For Right Joy-Con held upright in grip / Pro Controller:
  // Gyro 1 (X) is pitch rate (+up/-down)
  // Gyro 3 (Z) is yaw rate (around vertical axis, -rateZ for turn left)
  const pitchRate = rateX;
  const yawRate = -rateZ;

  if (!Number.isFinite(yawRate) || !Number.isFinite(pitchRate) ||
      Math.abs(yawRate) > 25 || Math.abs(pitchRate) > 25) {
    return { yawRate: 0, pitchRate: 0, available: false, reason: 'rate-out-of-bounds' };
  }

  return {
    yawRate,
    pitchRate,
    rollRate: rateY,
    available: true,
    reportId,
    timer: view.getUint8(1),
    battery: view.getUint8(2) >> 4,
    deviceType: productId === PRO_CONTROLLER_PRODUCT_ID ? 'pro-controller' : 'joycon-right'
  };
}

/**
 * Creates an HID motion reader from an HIDDevice or mock device.
 */
export function createSwitchHIDReader(deviceOrOptions = {}) {
  let latestSample = null;
  const options = typeof deviceOrOptions === 'object' && deviceOrOptions !== null ? deviceOrOptions : {};
  const device = options.device || (typeof options.addEventListener === 'function' ? options : null);
  const productId = options.productId ?? (device?.productId ?? PRO_CONTROLLER_PRODUCT_ID);

  function handleInputReport(event) {
    if (!event?.data) return;
    const sample = decodeSwitchMotionReport(event.data, {
      ...options,
      productId,
      reportId: event.reportId
    });
    if (sample.available) {
      latestSample = sample;
    }
  }

  if (device) {
    if (typeof device.addEventListener === 'function') {
      device.addEventListener('inputreport', handleInputReport);
    } else {
      device.oninputreport = handleInputReport;
    }
  }

  const reader = function(pad, dt) {
    if (!latestSample || !latestSample.available) return null;
    return {
      yawRate: latestSample.yawRate,
      pitchRate: latestSample.pitchRate,
      padIndex: options.padIndex ?? (pad?.index ?? undefined)
    };
  };

  reader.recenter = function() {
    latestSample = null;
  };
  reader.feedReport = function(data) {
    const sample = decodeSwitchMotionReport(data, { ...options, productId });
    if (sample.available) latestSample = sample;
    return sample;
  };
  reader.detach = function() {
    if (device && typeof device.removeEventListener === 'function') {
      device.removeEventListener('inputreport', handleInputReport);
    } else if (device) {
      device.oninputreport = null;
    }
    latestSample = null;
  };
  reader.device = device;
  return reader;
}

export function hasWebHIDSupport() {
  return typeof navigator !== 'undefined' && typeof navigator.hid === 'object' && navigator.hid !== null;
}

export function getControllerMotionPlatformStatus() {
  if (!hasWebHIDSupport()) return 'unsupported-platform';
  return 'supported';
}

export function attachWebHIDControllerMotion(input, options = {}) {
  if (!input) throw new TypeError('Input instance required');
  if (!hasWebHIDSupport()) {
    input.s3ControllerMotionPlatform = 'unsupported-platform';
    return { supported: false, status: 'unsupported-platform' };
  }
  input.s3ControllerMotionPlatform = 'supported';
  const navHid = navigator.hid;

  if (typeof navHid.getDevices === 'function') {
    navHid.getDevices().then(devices => {
      const match = devices.find(d => d.vendorId === NINTENDO_VENDOR_ID &&
        (d.productId === JOYCON_R_PRODUCT_ID || d.productId === PRO_CONTROLLER_PRODUCT_ID || d.productId === JOYCON_GRIP_PRODUCT_ID));
      if (match && !input.s3ControllerMotionReader) {
        const reader = createSwitchHIDReader({ device: match, productId: match.productId, ...options });
        input.setControllerMotionReader(reader);
      }
    }).catch(() => {});
  }

  const onConnect = (e) => {
    const d = e?.device;
    if (d && d.vendorId === NINTENDO_VENDOR_ID &&
      (d.productId === JOYCON_R_PRODUCT_ID || d.productId === PRO_CONTROLLER_PRODUCT_ID || d.productId === JOYCON_GRIP_PRODUCT_ID)) {
      if (!input.s3ControllerMotionReader) {
        const reader = createSwitchHIDReader({ device: d, productId: d.productId, ...options });
        input.setControllerMotionReader(reader);
      }
    }
  };
  const onDisconnect = (e) => {
    const d = e?.device;
    if (d && input.s3ControllerMotionReader?.device === d) {
      input.s3ControllerMotionReader.detach();
      input.setControllerMotionReader(null);
    }
  };

  if (typeof navHid.addEventListener === 'function') {
    navHid.addEventListener('connect', onConnect);
    navHid.addEventListener('disconnect', onDisconnect);
  }

  return {
    supported: true,
    status: input.s3ControllerMotionReader ? 'bridge-available' : 'listening',
    detach: () => {
      if (typeof navHid.removeEventListener === 'function') {
        navHid.removeEventListener('connect', onConnect);
        navHid.removeEventListener('disconnect', onDisconnect);
      }
      if (input.s3ControllerMotionReader) {
        input.s3ControllerMotionReader.detach();
        input.setControllerMotionReader(null);
      }
    }
  };
}

export function installControllerMotion({ Input, PlayerController, G }) {
  if (!Input?.prototype || !PlayerController?.prototype) throw Error('pad-motion requires Input and PlayerController');
  const proto = Input.prototype;
  if (Object.hasOwn(proto, GUARD)) return;
  Object.defineProperty(proto, GUARD, { value: true });

  proto.setControllerMotionReader = function(reader) {
    if (reader !== null && reader !== undefined && typeof reader !== 'function') throw TypeError('pad gyro reader');
    this.s3ControllerMotionReader = reader || null;
  };
  proto.controllerMotionStatus = function() {
    return this.s3ControllerMotionReader ? 'bridge-available' : 'bridge-unavailable';
  };
  proto.controllerMotionPlatformStatus = function() {
    if (this.s3ControllerMotionReader) return 'bridge-available';
    if (!hasWebHIDSupport()) return 'unsupported-platform';
    return 'supported-disconnected';
  };
  proto.attachWebHID = function(options) {
    return attachWebHIDControllerMotion(this, options);
  };
  proto.decodeSwitchMotionReport = decodeSwitchMotionReport;
  proto.createSwitchHIDReader = createSwitchHIDReader;

  const priorReset = PlayerController.prototype.resetCamera;
  if (priorReset) {
    PlayerController.prototype.resetCamera = function() {
      this._s3RecenteredThisTick = true;
      const reader = this.input?.s3ControllerMotionReader;
      if (typeof reader?.recenter === 'function') {
        try { reader.recenter(); } catch {}
      } else if (typeof reader?.reset === 'function') {
        try { reader.reset(); } catch {}
      }
      return priorReset.apply(this, arguments);
    };
  }

  const prior = PlayerController.prototype.update;
  PlayerController.prototype.update = function(dt) {
    this._s3RecenteredThisTick = false;
    const input = this.input, pad = input?.pad, reader = input?.s3ControllerMotionReader;
    let gyroApplied = false;
    if (this.enabled && reader && pad?.connected && input.lastDevice === 'pad' && dt > 0) {
      const mapUp = (G.rig?.mapK ?? 0) > 0.05 || input.down?.('Tab') ||
        input.down?.('KeyM') || input.padButton?.(8) ||
        !!input.mobile?.mapOpen;
      if (!mapUp) {
        let sample = null;
        try { sample = reader(pad, dt); } catch { sample = null; }
        if (sample && (sample.padIndex === undefined || sample.padIndex === pad.index)) {
          const d = controllerMotionDelta(sample, dt, G.settings?.gyroSens ?? 0,
            G.settings?.gyroInvertY, G.settings?.gyroInvertX);
          if (d.available) {
            this.rig.yaw += d.yaw;
            this.rig.pitch = Math.max(-1.05, Math.min(1.15, this.rig.pitch + d.pitch));
            gyroApplied = true;
          }
        }
      }
    }
    const gyroPitch = this.rig?.pitch;
    const res = prior.call(this, dt);
    // In Splatoon 3 reference controller play, controller gyro owns vertical pitch,
    // while right-stick provides coarse horizontal yaw only.
    // Suppress right-stick vertical double-integration when controller gyro was applied,
    // unless a recenter/reset occurred on this tick.
    if (gyroApplied && !this._s3RecenteredThisTick && gyroPitch !== undefined && this.rig) {
      this.rig.pitch = Math.max(-1.05, Math.min(1.15, gyroPitch));
      if (this.padLook) this.padLook.y = 0;
      if (this.a) { this.a.aimPitch = this.rig.pitch; this.a.aimYaw = this.rig.yaw; }
    }
    return res;
  };
}
