// #71: Joy-Con / Pro Controller motion input path based on published
// Nintendo Switch HID protocol notes, SPI gyro calibration and nominal fallback scale.
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
// deku's nominal ±2000 dps range is about 34.9 rad/s; allow rounding margin.
// This is a sensor-range sanity bound, not an S3 gameplay value.
export const MAX_GYRO_RATE_RAD_S = 35;

// Subcommand & Report IDs per published dekuNukem and Linux hid-nintendo protocol
export const OUTPUT_REPORT_SUBCMD = 0x01;
export const SUBCMD_SET_INPUT_REPORT_MODE = 0x03;
export const SUBCMD_ENABLE_IMU = 0x40;
export const SUBCMD_SPI_FLASH_READ = 0x10;
export const INPUT_REPORT_STANDARD_FULL = 0x30;
export const IMU_FACTORY_CALIBRATION_ADDRESS = 0x6020;
export const IMU_USER_CALIBRATION_ADDRESS = 0x8026;
export const IMU_CALIBRATION_RECORD_SIZE = 24;
export const IMU_USER_CALIBRATION_BLOCK_SIZE = 26;
// Linux hid-nintendo waits up to one second for a synchronous SPI subcommand reply.
export const SPI_CALIBRATION_TIMEOUT_MS = 1000;

// Neutral rumble 8-byte packet as published in dekuNukem and hid-nintendo:
// HF freq 320Hz at 0 amplitude, LF freq 160Hz at 0 amplitude
export const NEUTRAL_RUMBLE = Object.freeze([0x00, 0x01, 0x40, 0x40, 0x00, 0x01, 0x40, 0x40]);

// Arrival-age safety bound chosen by this bridge; no Splatoon 3 timeout is published.
export const DEFAULT_SAMPLE_MAX_AGE_MS = 100;

const GUARD = Symbol.for('inkwave.s3.pad-motion.v1');
const zero = () => ({ yaw: 0, pitch: 0, available: false });
const DEG_TO_RAD = Math.PI / 180;
const USER_CAL_MAGIC = [0xb2, 0xa1];
const DEFAULT_GYRO_DPS_PER_COUNT = 0.070;

function dataViewOf(data) {
  if (data instanceof DataView) return data;
  if (ArrayBuffer.isView(data)) return new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return new DataView(data);
  return null;
}

function nominalGyroCalibration(reason) {
  return {
    status: 'nominal-fallback',
    source: 'nominal',
    reason,
    gyroOffsets: [0, 0, 0],
    gyroDpsPerCount: [DEFAULT_GYRO_DPS_PER_COUNT, DEFAULT_GYRO_DPS_PER_COUNT, DEFAULT_GYRO_DPS_PER_COUNT]
  };
}

/**
 * Parse the published 24-byte IMU calibration record. Acceleration data occupies
 * bytes 0..11; gyro offset and sensitivity words occupy bytes 12..23.
 */
export function parseSwitchGyroCalibration(data, source = 'factory') {
  const view = dataViewOf(data);
  if (!view || view.byteLength < IMU_CALIBRATION_RECORD_SIZE) {
    return { status: 'invalid', reason: 'calibration-record-too-short' };
  }
  const gyroOffsets = [];
  const gyroDpsPerCount = [];
  for (let axis = 0; axis < 3; axis++) {
    const gyroOffset = view.getInt16(12 + axis * 2, true);
    const gyroScale = view.getInt16(18 + axis * 2, true);
    const divisor = gyroScale - gyroOffset;
    if (gyroScale <= 0 || divisor <= 0) {
      return { status: 'invalid', reason: 'invalid-calibration-coefficient' };
    }
    // dekuNukem's LSM6DS3 ±2000 dps conversion: 936 / (scale - offset).
    const dpsPerCount = 936 / divisor;
    if (!Number.isFinite(dpsPerCount) || !(dpsPerCount > 0)) {
      return { status: 'invalid', reason: 'invalid-calibration-coefficient' };
    }
    gyroOffsets.push(gyroOffset);
    gyroDpsPerCount.push(dpsPerCount);
  }
  return { status: 'calibrated', source, gyroOffsets, gyroDpsPerCount };
}

function calibrationIsUsable(calibration) {
  return calibration?.status === 'calibrated' &&
    Array.isArray(calibration.gyroOffsets) && calibration.gyroOffsets.length === 3 &&
    Array.isArray(calibration.gyroDpsPerCount) && calibration.gyroDpsPerCount.length === 3 &&
    calibration.gyroOffsets.every(Number.isFinite) &&
    calibration.gyroDpsPerCount.every(value => Number.isFinite(value) && value > 0);
}

/** Read one SPI flash range through the published 0x10 subcommand / 0x21 reply. */
function readSwitchSPIFlash(device, address, size, { signal, timeoutMs = SPI_CALIBRATION_TIMEOUT_MS } = {}) {
  if (!device || typeof device.addEventListener !== 'function') {
    return Promise.reject(new Error('SPI input-report listener unavailable'));
  }
  if (signal?.aborted) return Promise.reject(Object.assign(new Error('SPI read aborted'), { name: 'AbortError' }));

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, bytes) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      device.removeEventListener?.('inputreport', onReport);
      signal?.removeEventListener?.('abort', onAbort);
      if (error) reject(error);
      else resolve(bytes);
    };
    const onAbort = () => finish(Object.assign(new Error('SPI read aborted'), { name: 'AbortError' }));
    const onReport = event => {
      if (event?.reportId !== 0x21) return;
      const view = dataViewOf(event.data);
      // WebHID omits reportId: timer/battery/buttons/sticks/vibrator are 0..11,
      // then reply ack=12, subcommand=13 and SPI reply data begins at 14.
      if (!view || view.byteLength < 14 || view.getUint8(13) !== SUBCMD_SPI_FLASH_READ) return;
      if ((view.getUint8(12) & 0x80) === 0) {
        finish(new Error('SPI read rejected by controller'));
        return;
      }
      const dataStart = 19; // reply data[5], after echoed address (4) and size (1)
      if (view.byteLength < dataStart + size) {
        finish(new Error('SPI reply is truncated'));
        return;
      }
      const echoedAddress = view.getUint32(14, true);
      const echoedSize = view.getUint8(18);
      if (echoedAddress !== address || echoedSize !== size) {
        finish(new Error('SPI reply range did not match request'));
        return;
      }
      const bytes = new Uint8Array(size);
      for (let i = 0; i < size; i++) bytes[i] = view.getUint8(dataStart + i);
      finish(null, bytes);
    };
    const timer = setTimeout(() => finish(new Error('SPI read timed out')), Math.max(1, timeoutMs));
    device.addEventListener('inputreport', onReport);
    signal?.addEventListener?.('abort', onAbort, { once: true });
    const args = [
      address & 0xff,
      (address >>> 8) & 0xff,
      (address >>> 16) & 0xff,
      (address >>> 24) & 0xff,
      size & 0xff
    ];
    sendSwitchSubcommand(device, SUBCMD_SPI_FLASH_READ, args).catch(error => finish(error));
  });
}

/**
 * Prefer user calibration when its B2 A1 marker is present, otherwise use factory
 * calibration. Unsupported SPI, malformed records and timeouts keep a nominal
 * zero-offset LSM6DS3 conversion and are returned as an explicit status.
 */
export async function loadSwitchGyroCalibration(device, options = {}) {
  const { signal, timeoutMs = SPI_CALIBRATION_TIMEOUT_MS } = options;
  let userBlock = null;
  let userReadError = null;
  try {
    userBlock = await readSwitchSPIFlash(device, IMU_USER_CALIBRATION_ADDRESS,
      IMU_USER_CALIBRATION_BLOCK_SIZE, { signal, timeoutMs });
  } catch (error) {
    userReadError = error;
  }
  if (signal?.aborted) return nominalGyroCalibration('aborted');

  if (userBlock && userBlock[0] === USER_CAL_MAGIC[0] && userBlock[1] === USER_CAL_MAGIC[1]) {
    const userCalibration = parseSwitchGyroCalibration(userBlock.subarray(2), 'user');
    if (userCalibration.status === 'calibrated') return userCalibration;
  }

  try {
    const factoryBytes = await readSwitchSPIFlash(device, IMU_FACTORY_CALIBRATION_ADDRESS,
      IMU_CALIBRATION_RECORD_SIZE, { signal, timeoutMs });
    const factoryCalibration = parseSwitchGyroCalibration(factoryBytes, 'factory');
    if (factoryCalibration.status === 'calibrated') return factoryCalibration;
    return nominalGyroCalibration(factoryCalibration.reason || 'invalid-calibration-data');
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') return nominalGyroCalibration('aborted');
    return nominalGyroCalibration(userReadError || error ? 'spi-calibration-unavailable' : 'invalid-calibration-data');
  }
}

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

export async function initializeSwitchHIDDevice(device, options = {}) {
  if (!device) return { initialized: false, reason: 'no-device' };
  try {
    if (typeof device.open !== 'function') throw new TypeError('Device must support open');
    if (!device.opened) await device.open();
  } catch (err) {
    return { initialized: false, reason: 'open-failed', error: err };
  }

  // 1. Enable 6-Axis IMU sensor (subcommand 0x40, argument 0x01 = enable)
  try {
    await sendSwitchSubcommand(device, SUBCMD_ENABLE_IMU, [0x01]);
  } catch (err) {
    return { initialized: false, reason: 'enable-imu-failed', error: err };
  }
  if (options.signal?.aborted) return { initialized: false, reason: 'aborted' };

  // 2. Set input report mode to Standard Full Mode (subcommand 0x03, argument 0x30)
  try {
    await sendSwitchSubcommand(device, SUBCMD_SET_INPUT_REPORT_MODE, [INPUT_REPORT_STANDARD_FULL]);
  } catch (err) {
    return { initialized: false, reason: 'set-report-mode-failed', error: err };
  }
  if (options.signal?.aborted) return { initialized: false, reason: 'aborted' };

  const calibration = await loadSwitchGyroCalibration(device, options);
  return { initialized: true, calibration };
}

export const gainAt = s => {
  const x = Math.max(-5, Math.min(5, Number.isFinite(s) ? s : 0));
  // Provisional INKWAVE controller mapping; this is not a published Nintendo response curve.
  return x <= 0 ? 1 + (x + 5) * 0.16 : 1.8 + x * 0.24;
};

export function controllerMotionDelta(sample, dt, sensitivity = 0, invertY = false, invertX = false) {
  if (!sample || !(dt > 0) || dt > 0.25 || !Number.isFinite(sample.yawRate) || !Number.isFinite(sample.pitchRate)) {
    return zero();
  }
  if (Math.abs(sample.yawRate) > MAX_GYRO_RATE_RAD_S || Math.abs(sample.pitchRate) > MAX_GYRO_RATE_RAD_S) return zero();
  const gain = gainAt(sensitivity);
  return {
    yaw: sample.yawRate * dt * gain * (invertX ? -1 : 1),
    pitch: sample.pitchRate * dt * gain * (invertY ? -1 : 1),
    available: true
  };
}

/**
 * Decode Nintendo Switch HID input reports (0x30 standard full report, 0x31 NFC/IR report with IMU,
 * 0x32, 0x33) into angular velocities (rad/s), using the per-device SPI record when supplied.
 *
 * WebHID specification: event.data EXCLUDES the report ID byte. The report ID is supplied separately
 * via event.reportId (or options.reportId). If options.reportId is provided, payload starts at index 0.
 * If options.reportId is omitted, fallback checks payload[0] for raw wire captures.
 *
 * Primary specification (dekuNukem imu_sensor_notes.md): IMU reports are 0x30, 0x31, 0x32, 0x33.
 * Report 0x21 is a subcommand reply and is NOT an IMU stream.
 */
export function decodeSwitchMotionReport(data, options = {}) {
  const view = dataViewOf(data);
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
    if (view.byteLength < 1) {
      return { yawRate: 0, pitchRate: 0, available: false, reason: 'payload-too-short' };
    }
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
  // This bridge excludes an explicitly identified Joy-Con (L); S3 sensor fusion behavior is unverified.
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

  const gyroCalibration = calibrationIsUsable(options.gyroCalibration) ? options.gyroCalibration : null;
  const nominalScale = Number.isFinite(options.scale) ? options.scale : DEFAULT_GYRO_SCALE;
  const nominalBias = [options.biasX, options.biasY, options.biasZ].map(value => Number.isFinite(value) ? value : 0);
  const rawGyro = [rawG1, rawG2, rawG3];
  const rate = rawGyro.map((raw, axis) => gyroCalibration
    ? (raw - gyroCalibration.gyroOffsets[axis]) * gyroCalibration.gyroDpsPerCount[axis] * DEG_TO_RAD
    : (raw - nominalBias[axis]) * nominalScale);
  const [rateX, rateY, rateZ] = rate;

  // Provisional bridge convention: Gyro 1 maps to pitch and inverted Gyro 3 to yaw.
  // Controller mounting orientation/signs and Splatoon 3's mapping are unverified.
  const pitchRate = rateX;
  const yawRate = -rateZ;

  if (!Number.isFinite(yawRate) || !Number.isFinite(pitchRate) ||
      Math.abs(yawRate) > MAX_GYRO_RATE_RAD_S || Math.abs(pitchRate) > MAX_GYRO_RATE_RAD_S) {
    return { yawRate: 0, pitchRate: 0, available: false, reason: 'rate-out-of-bounds' };
  }

  const timestamp = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

  return {
    yawRate,
    pitchRate,
    rollRate: rateY,
    available: true,
    reportId,
    calibrationSource: gyroCalibration?.source || 'nominal',
    calibrationStatus: gyroCalibration ? 'calibrated' : 'nominal-fallback',
    timer: view.getUint8(offset + 0),
    battery: view.getUint8(offset + 1) >> 4,
    deviceType: productId === PRO_CONTROLLER_PRODUCT_ID ? 'pro-controller' : 'joycon-right',
    timestamp
  };
}

/**
 * Creates an HID motion reader from an HIDDevice or mock device.
 * Expires stale angle-rate samples; invalid/truncated packets clear the current sample.
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

  // Drop a pre-boundary rate without recalibrating or closing the device.
  reader.discard = function() {
    latestSample = null;
  };
  reader.recenter = reader.discard;
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
  const priorSession = input._s3WebHIDSession;
  if (priorSession?.active && priorSession.handle) return priorSession.handle;
  input.s3ControllerMotionPlatform = 'supported';
  const navHid = navigator.hid;

  // Keep per-device generations so a disconnect invalidates any open/sendReport
  // operation that is still pending when the device goes away.
  const session = {
    active: true,
    status: 'listening',
    reader: null,
    epochs: new Map(),
    pending: new Map(),
    disconnectedDevices: new WeakSet()
  };
  input._s3WebHIDSession = session;

  const isCurrent = () => session.active && input._s3WebHIDSession === session;
  const epochOf = device => session.epochs.get(device) || 0;
  const bumpEpoch = device => {
    const epoch = epochOf(device) + 1;
    session.epochs.set(device, epoch);
    return epoch;
  };

  const connectDevice = (device, epoch = epochOf(device), { replace = false } = {}) => {
    if (!isCurrent() || !isSwitchDevice(device) || session.disconnectedDevices.has(device)) {
      return Promise.resolve({ connected: false, status: 'stale-session' });
    }
    const activeReader = input.s3ControllerMotionReader;
    if (activeReader?.device === device) {
      session.reader = activeReader;
      session.status = 'bridge-available';
      return Promise.resolve({ connected: true, status: 'bridge-available', device, reader: activeReader,
        initResult: activeReader.initResult || { initialized: true } });
    }

    const pending = session.pending.get(device);
    if (pending?.epoch === epoch) {
      if (replace) pending.replace = true;
      return pending.promise;
    }

    const pendingState = { epoch, replace, controller: new AbortController(), promise: null };
    session.status = 'initializing';
    const promise = (async () => {
      const initResult = await initializeSwitchHIDDevice(device, { ...options, signal: pendingState.controller.signal });
      if (!isCurrent() || epochOf(device) !== epoch || session.disconnectedDevices.has(device)) {
        return { connected: false, status: 'stale-session', device, initResult };
      }
      if (!initResult.initialized) {
        input.s3ControllerMotionInitError = initResult;
        session.status = 'initialization-failed';
        return { connected: false, status: 'initialization-failed', device, initResult };
      }

      const previousReader = input.s3ControllerMotionReader;
      if (previousReader && previousReader.device !== device && !pendingState.replace) {
        session.status = 'bridge-available';
        return { connected: false, status: 'another-device-active', device, initResult };
      }
      if (previousReader && previousReader.device !== device) {
        previousReader.detach?.();
        if (input.s3ControllerMotionReader === previousReader) input.setControllerMotionReader(null);
      }

      const reader = createSwitchHIDReader({ device, productId: device.productId, ...options,
        gyroCalibration: initResult.calibration });
      reader.initResult = initResult;
      session.reader = reader;
      input.s3ControllerMotionInitError = null;
      input.setControllerMotionReader(reader);
      session.status = 'bridge-available';
      return { connected: true, status: 'bridge-available', device, reader, initResult };
    })();
    pendingState.promise = promise;
    session.pending.set(device, pendingState);
    promise.finally(() => {
      if (session.pending.get(device) === pendingState) session.pending.delete(device);
    }).catch(() => {});
    return promise;
  };
  session.connectDevice = connectDevice;
  session.epochOf = epochOf;
  session.bumpEpoch = bumpEpoch;

  if (typeof navHid.getDevices === 'function') {
    navHid.getDevices().then(async devices => {
      if (!isCurrent()) return;
      if (input.s3ControllerMotionReader) return;
      const match = devices.find(d => isSwitchDevice(d));
      if (match && !input.s3ControllerMotionReader) await connectDevice(match, epochOf(match));
    }).catch(() => {});
  }

  const onConnect = (e) => {
    const d = e?.device;
    if (!isCurrent() || !isSwitchDevice(d)) return;
      if (input.s3ControllerMotionReader && input.s3ControllerMotionReader.device !== d) return;
    const pending = session.pending.get(d);
    if (pending?.epoch === epochOf(d)) return pending.promise;
    session.disconnectedDevices.delete(d);
    return connectDevice(d, bumpEpoch(d));
  };
  const onDisconnect = (e) => {
    const d = e?.device;
    if (!isCurrent() || !d) return;
    session.disconnectedDevices.add(d);
    bumpEpoch(d);
    session.pending.get(d)?.controller?.abort();
    const reader = input.s3ControllerMotionReader;
    if (reader?.device === d) {
      reader.detach?.();
      if (input.s3ControllerMotionReader === reader) input.setControllerMotionReader(null);
      if (session.reader === reader) session.reader = null;
    }
    session.status = 'disconnected';
  };

  if (typeof navHid.addEventListener === 'function') {
    navHid.addEventListener('connect', onConnect);
    navHid.addEventListener('disconnect', onDisconnect);
  }

  const handle = {
    supported: true,
    session,
    status: session.status,
    detach: () => {
      session.active = false;
      if (input._s3WebHIDSession === session) {
        input._s3WebHIDSession = null;
      }
      if (typeof navHid.removeEventListener === 'function') {
        navHid.removeEventListener('connect', onConnect);
        navHid.removeEventListener('disconnect', onDisconnect);
      }
      for (const pending of session.pending.values()) pending.controller?.abort();
      const reader = session.reader;
      if (reader && input.s3ControllerMotionReader === reader) {
        reader.detach?.();
        input.setControllerMotionReader(null);
      }
    }
  };
  session.handle = handle;
  return handle;
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
    const device = devices.find(isSwitchDevice);
    if (!device) {
      return { supported: true, connected: false, status: 'unsupported-device' };
    }
    if (!input._s3WebHIDSession?.active) {
      attachWebHIDControllerMotion(input, options);
    }
    const session = input._s3WebHIDSession;
    session.disconnectedDevices.delete(device);
    const pending = session.pending.get(device);
    const epoch = pending?.epoch ?? session.bumpEpoch(device);
    return { supported: true, device, ...(await session.connectDevice(device, epoch, { replace: true })) };
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
    if (this.s3ControllerMotionInitError) return 'initialization-failed';
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

  // Some takeovers freeze simulation or open and close between fixed ticks.
  // Clear the sample at their existing cancellation boundary as well.
  for (const name of ['cancelForMenuTakeover', 'cancelForMapTakeover']) {
    const cancel = PlayerController.prototype[name];
    if (typeof cancel !== 'function') continue;
    PlayerController.prototype[name] = function (...args) {
      try { this.input?.s3ControllerMotionReader?.discard?.(); } catch {}
      return cancel.apply(this, args);
    };
  }

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
    const ownsAim = this.enabled && pad?.connected && input?.lastDevice === 'pad' && G.settings?.gyro !== false;
    // Let the shared native map owner consume opening/closing/cancel edges
    // before gyro writes. Native update calls it again, but consumed edges
    // cannot toggle twice. Do not independently reinterpret held buttons.
    const sharedMap = typeof this.updateMapInput === 'function';
    if (sharedMap) this.updateMapInput();
    const mapUp = (G.rig?.mapK ?? 0) > 0.05 || (sharedMap ? this.mapHeld :
      input?.down?.('Tab') || input?.down?.('KeyM') || input?.padButton?.(8) ||
      !!input?.mobile?.mapOpen);
    if (reader && (!ownsAim || mapUp)) {
      // A short pause/map/device handoff may finish before arrival-age expiry.
      // Do not replay its last pre-boundary angular rate when aiming resumes.
      try { reader.discard?.(); } catch {}
    }
    if (ownsAim && reader && dt > 0) {
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
    // For this INKWAVE composition, a valid controller gyro sample suppresses this
    // tick's right-stick pitch contribution to avoid applying pitch twice. S3 parity
    // for controller axis ownership has not been verified.
    if (gyroApplied && !this._s3RecenteredThisTick && gyroPitch !== undefined && this.rig) {
      this.rig.pitch = Math.max(-1.05, Math.min(1.15, gyroPitch));
      if (this.padLook) this.padLook.y = 0;
      if (this.a) { this.a.aimPitch = this.rig.pitch; this.a.aimYaw = this.rig.yaw; }
    }
    return res;
  };
}
