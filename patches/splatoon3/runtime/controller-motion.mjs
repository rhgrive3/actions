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

// Subcommand & Report IDs per published dekuNukem and Linux hid-nintendo protocol
export const OUTPUT_REPORT_SUBCMD = 0x01;
export const SUBCMD_SET_INPUT_REPORT_MODE = 0x03;
export const SUBCMD_ENABLE_IMU = 0x40;
export const INPUT_REPORT_STANDARD_FULL = 0x30;

// Neutral rumble 8-byte packet as published in dekuNukem and hid-nintendo:
// HF freq 320Hz at 0 amplitude, LF freq 160Hz at 0 amplitude
export const NEUTRAL_RUMBLE = Object.freeze([0x00, 0x01, 0x40, 0x40, 0x00, 0x01, 0x40, 0x40]);

// Default maximum arrival age for motion samples before drift expiry (100 ms ≈ 6.7 missed packets at 66.7 Hz)
export const DEFAULT_SAMPLE_MAX_AGE_MS = 100;

const GUARD = Symbol.for('inkwave.s3.pad-motion.v1');
const zero = () => ({ yaw: 0, pitch: 0, available: false });

export function isSwitchDevice(device) {
  if (!device) return false;
  return device.vendorId === NINTENDO_VENDOR_ID &&
    (device.productId === JOYCON_R_PRODUCT_ID ||
     device.productId === PRO_CONTROLLER_PRODUCT_ID ||
     device.productId === JOYCON_GRIP_PRODUCT_ID);
}

let globalPacketNumber = 0;

export function buildSubcommandPacket(subcmd, args = [], packetNum = null) {
  const pNum = packetNum !== null ? (packetNum & 0x0f) : ((globalPacketNumber++) & 0x0f);
  const buf = new Uint8Array(10 + args.length);
  buf[0] = pNum;
  for (let i = 0; i < 8; i++) buf[1 + i] = NEUTRAL_RUMBLE[i];
  buf[9] = subcmd;
  for (let i = 0; i < args.length; i++) buf[10 + i] = args[i];
  return buf;
}

export async function sendSwitchSubcommand(device, subcmd, args = []) {
  if (!device || typeof device.sendReport !== 'function') {
    throw new TypeError('Device must support sendReport');
  }
  const payload = buildSubcommandPacket(subcmd, args);
  // WebHID sendReport takes reportId as first argument and payload (excluding reportId) as second argument
  return await device.sendReport(OUTPUT_REPORT_SUBCMD, payload);
}

export async function initializeSwitchHIDDevice(device) {
  if (!device) return { initialized: false, reason: 'no-device' };
  try {
    if (typeof device.open === 'function' && !device.opened) {
      await device.open();
    }
  } catch (err) {
    return { initialized: false, reason: 'open-failed', error: err };
  }

  // 1. Enable 6-Axis IMU sensor (subcommand 0x40, argument 0x01 = enable)
  try {
    await sendSwitchSubcommand(device, SUBCMD_ENABLE_IMU, [0x01]);
  } catch (err) {
    return { initialized: false, reason: 'enable-imu-failed', error: err };
  }

  // 2. Set input report mode to Standard Full Mode (subcommand 0x03, argument 0x30)
  try {
    await sendSwitchSubcommand(device, SUBCMD_SET_INPUT_REPORT_MODE, [INPUT_REPORT_STANDARD_FULL]);
  } catch (err) {
    return { initialized: false, reason: 'set-report-mode-failed', error: err };
  }

  return { initialized: true };
}

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
 * Decode Nintendo Switch HID input reports (0x30 standard full report, 0x31 NFC/IR report with IMU,
 * 0x32, 0x33) into calibrated angular velocities (rad/s).
 *
 * WebHID specification: event.data EXCLUDES the report ID byte. The report ID is supplied separately
 * via event.reportId (or options.reportId). If options.reportId is provided, payload starts at index 0.
 * If options.reportId is omitted, fallback checks payload[0] for raw wire captures.
 *
 * Primary specification (dekuNukem imu_sensor_notes.md): IMU reports are 0x30, 0x31, 0x32, 0x33.
 * Report 0x21 is a subcommand reply and is NOT an IMU stream.
 */
export function decodeSwitchMotionReport(data, options = {}) {
  const view = data instanceof DataView ? data :
    ArrayBuffer.isView(data) ? new DataView(data.buffer, data.byteOffset, data.byteLength) :
    data instanceof ArrayBuffer ? new DataView(data) : null;
  if (!view) {
    return { yawRate: 0, pitchRate: 0, available: false, reason: 'invalid-data-buffer' };
  }

  let reportId;
  let offset;
  if (options.reportId !== undefined && options.reportId !== null) {
    reportId = Number(options.reportId);
    offset = 0; // Faithful WebHID event: data starts at byte 0 (Timer)
  } else {
    // Raw wire buffer fallback where byte 0 contains the report ID
    reportId = view.getUint8(0);
    offset = 1;
  }

  // Published protocol: IMU stream reports are 0x30, 0x31, 0x32, 0x33.
  // Subcommand reply 0x21 does not provide periodic IMU motion.
  if (reportId !== 0x30 && reportId !== 0x31 && reportId !== 0x32 && reportId !== 0x33) {
    return { yawRate: 0, pitchRate: 0, available: false, reason: 'unsupported-report-id', reportId };
  }

  // Minimum payload length: 12 bytes header + 12 bytes IMU frame 0 = 24 bytes (relative to offset)
  if (view.byteLength < offset + 24) {
    return { yawRate: 0, pitchRate: 0, available: false, reason: 'payload-too-short', reportId };
  }

  const productId = options.productId ?? (options.device?.productId ?? null);
  // In Splatoon 3 two-handed Joy-Con play, aim motion is sourced exclusively from Joy-Con (R).
  if (productId === JOYCON_L_PRODUCT_ID || options.side === 'left') {
    return { yawRate: 0, pitchRate: 0, available: false, ignoredSide: 'left', reportId };
  }

  // IMU Frame 0 (relative to offset):
  // Accel: offset + 12..17: Accel X (12-13), Y (14-15), Z (16-17) (int16 LE)
  // Gyro:  offset + 18..23: Gyro 1 (18-19), Gyro 2 (20-21), Gyro 3 (22-23) (int16 LE)
  let rawG1 = view.getInt16(offset + 18, true);
  let rawG2 = view.getInt16(offset + 20, true);
  let rawG3 = view.getInt16(offset + 22, true);

  if (options.averageFrames && view.byteLength >= offset + 48) {
    rawG1 = (rawG1 + view.getInt16(offset + 30, true) + view.getInt16(offset + 42, true)) / 3;
    rawG2 = (rawG2 + view.getInt16(offset + 32, true) + view.getInt16(offset + 44, true)) / 3;
    rawG3 = (rawG3 + view.getInt16(offset + 34, true) + view.getInt16(offset + 46, true)) / 3;
  }

  const scale = Number.isFinite(options.scale) ? options.scale : DEFAULT_GYRO_SCALE;
  const biasX = Number.isFinite(options.biasX) ? options.biasX : 0;
  const biasY = Number.isFinite(options.biasY) ? options.biasY : 0;
  const biasZ = Number.isFinite(options.biasZ) ? options.biasZ : 0;

  const rateX = (rawG1 - biasX) * scale;
  const rateY = (rawG2 - biasY) * scale;
  const rateZ = (rawG3 - biasZ) * scale;

  // Coordinate mapping for aim:
  // For Right Joy-Con held upright in grip and Pro Controller:
  // Gyro 1 (X) is pitch rate (+up/-down)
  // Gyro 3 (Z) is yaw rate (around vertical axis, -rateZ for turn left = +yaw)
  const pitchRate = rateX;
  const yawRate = -rateZ;

  if (!Number.isFinite(yawRate) || !Number.isFinite(pitchRate) ||
      Math.abs(yawRate) > 25 || Math.abs(pitchRate) > 25) {
    return { yawRate: 0, pitchRate: 0, available: false, reason: 'rate-out-of-bounds' };
  }

  const timestamp = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

  return {
    yawRate,
    pitchRate,
    rollRate: rateY,
    available: true,
    reportId,
    timer: view.getUint8(offset + 0),
    battery: view.getUint8(offset + 1) >> 4,
    deviceType: productId === PRO_CONTROLLER_PRODUCT_ID ? 'pro-controller' : 'joycon-right',
    timestamp
  };
}

/**
 * Creates an HID motion reader from an HIDDevice or mock device.
 * Expiries stale drift after arrival age exceeded; invalid/truncated packet clears drift.
 */
export function createSwitchHIDReader(deviceOrOptions = {}) {
  let latestSample = null;
  const options = typeof deviceOrOptions === 'object' && deviceOrOptions !== null ? deviceOrOptions : {};
  const device = options.device || (typeof options.addEventListener === 'function' ? options : null);
  const productId = options.productId ?? (device?.productId ?? PRO_CONTROLLER_PRODUCT_ID);
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_SAMPLE_MAX_AGE_MS;

  function handleInputReport(event) {
    if (!event?.data) {
      latestSample = null;
      return;
    }
    const sample = decodeSwitchMotionReport(event.data, {
      ...options,
      productId,
      reportId: event.reportId
    });
    if (sample.available) {
      latestSample = sample;
    } else {
      // Invalid or truncated packet immediately clears active drift
      latestSample = null;
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
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    if (now - (latestSample.timestamp || 0) > maxAgeMs) {
      // Sample expired: do not hold nonzero rate forever
      latestSample = null;
      return null;
    }
    return {
      yawRate: latestSample.yawRate,
      pitchRate: latestSample.pitchRate,
      padIndex: options.padIndex ?? (pad?.index ?? undefined)
    };
  };

  reader.recenter = function() {
    latestSample = null;
  };
  reader.feedReport = function(data, reportId = null) {
    const opt = { ...options, productId };
    if (reportId !== null) opt.reportId = reportId;
    const sample = decodeSwitchMotionReport(data, opt);
    latestSample = sample.available ? sample : null;
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

  // Lifecycle session guards against pending getDevices() or reconnect race condition
  const session = { active: true };
  input._s3WebHIDSession = session;

  if (typeof navHid.getDevices === 'function') {
    navHid.getDevices().then(async devices => {
      if (!session.active || input._s3WebHIDSession !== session) return;
      if (input.s3ControllerMotionReader) return;
      const match = devices.find(d => isSwitchDevice(d));
      if (match && session.active && !input.s3ControllerMotionReader) {
        const initRes = await initializeSwitchHIDDevice(match);
        if (!session.active || input._s3WebHIDSession !== session) return;
        if (input.s3ControllerMotionReader) return;
        const reader = createSwitchHIDReader({ device: match, productId: match.productId, ...options });
        reader.initResult = initRes;
        input.setControllerMotionReader(reader);
      }
    }).catch(() => {});
  }

  const onConnect = async (e) => {
    const d = e?.device;
    if (session.active && input._s3WebHIDSession === session && isSwitchDevice(d)) {
      if (!input.s3ControllerMotionReader) {
        const initRes = await initializeSwitchHIDDevice(d);
        if (!session.active || input._s3WebHIDSession !== session) return;
        if (input.s3ControllerMotionReader) return;
        const reader = createSwitchHIDReader({ device: d, productId: d.productId, ...options });
        reader.initResult = initRes;
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
    session,
    status: input.s3ControllerMotionReader ? 'bridge-available' : 'listening',
    detach: () => {
      session.active = false;
      if (input._s3WebHIDSession === session) {
        input._s3WebHIDSession = null;
      }
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

export async function requestWebHIDDevice(input, options = {}) {
  if (!input) throw new TypeError('Input instance required');
  if (!hasWebHIDSupport()) {
    input.s3ControllerMotionPlatform = 'unsupported-platform';
    return { supported: false, status: 'unsupported-platform' };
  }
  const navHid = navigator.hid;
  if (typeof navHid.requestDevice !== 'function') {
    return { supported: true, status: 'request-unsupported' };
  }

  try {
    const devices = await navHid.requestDevice({
      filters: [
        { vendorId: NINTENDO_VENDOR_ID, productId: JOYCON_R_PRODUCT_ID },
        { vendorId: NINTENDO_VENDOR_ID, productId: PRO_CONTROLLER_PRODUCT_ID },
        { vendorId: NINTENDO_VENDOR_ID, productId: JOYCON_GRIP_PRODUCT_ID }
      ]
    });
    if (!devices || devices.length === 0) {
      return { supported: true, connected: false, status: 'no-device-selected' };
    }
    const device = devices[0];
    if (!input._s3WebHIDSession?.active) {
      attachWebHIDControllerMotion(input, options);
    }
    if (input.s3ControllerMotionReader) {
      input.s3ControllerMotionReader.detach();
      input.setControllerMotionReader(null);
    }
    const initRes = await initializeSwitchHIDDevice(device);
    const reader = createSwitchHIDReader({ device, productId: device.productId, ...options });
    reader.initResult = initRes;
    input.setControllerMotionReader(reader);
    return {
      supported: true,
      connected: true,
      device,
      initResult: initRes,
      status: 'bridge-available'
    };
  } catch (err) {
    return { supported: true, connected: false, error: err, status: 'request-error' };
  }
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
  proto.requestWebHID = function(options) {
    return requestWebHIDDevice(this, options);
  };
  proto.decodeSwitchMotionReport = decodeSwitchMotionReport;
  proto.createSwitchHIDReader = createSwitchHIDReader;
  proto.initializeSwitchHIDDevice = initializeSwitchHIDDevice;
  proto.sendSwitchSubcommand = sendSwitchSubcommand;

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
