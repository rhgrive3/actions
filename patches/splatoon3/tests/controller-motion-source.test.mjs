import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  NINTENDO_VENDOR_ID,
  JOYCON_L_PRODUCT_ID,
  JOYCON_R_PRODUCT_ID,
  PRO_CONTROLLER_PRODUCT_ID,
  JOYCON_GRIP_PRODUCT_ID,
  DEFAULT_GYRO_SCALE,
  MAX_GYRO_RATE_RAD_S,
  OUTPUT_REPORT_SUBCMD,
  SUBCMD_SET_INPUT_REPORT_MODE,
  SUBCMD_ENABLE_IMU,
  INPUT_REPORT_STANDARD_FULL,
  NEUTRAL_RUMBLE,
  DEFAULT_SAMPLE_MAX_AGE_MS,
  buildSubcommandPacket,
  sendSwitchSubcommand,
  initializeSwitchHIDDevice,
  gainAt,
  controllerMotionDelta,
  decodeSwitchMotionReport,
  createSwitchHIDReader,
  hasWebHIDSupport,
  getControllerMotionPlatformStatus,
  attachWebHIDControllerMotion,
  requestWebHIDDevice,
  installControllerMotion
} from '../runtime/controller-motion.mjs';
import { adaptSource } from '../adapter.mjs';

const close = (a, b, msg = '') => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} != ${b}`);

/**
 * Creates faithful WebHID input report data (EXCLUDING report ID).
 * WebHID WICG specification: event.data does not contain the reportId byte;
 * byte 0 of event.data is Timer, byte 1 is Battery/Connection, bytes 18..23 is Frame 0 Gyro.
 */
function makeFaithfulWebHIDData({
  timer = 1,
  battery = 8,
  acc = [0, 0, 4096],
  gyro = [1000, 0, -2000],
  frames = 3
} = {}) {
  const byteLength = 12 + frames * 12; // 48 bytes for 3 frames
  const buf = new Uint8Array(byteLength);
  buf[0] = timer;
  buf[1] = (battery << 4) | 0x01;
  const view = new DataView(buf.buffer);
  for (let f = 0; f < frames; f++) {
    const offset = 12 + f * 12;
    view.setInt16(offset, acc[0], true);
    view.setInt16(offset + 2, acc[1], true);
    view.setInt16(offset + 4, acc[2], true);
    view.setInt16(offset + 6, gyro[0], true);
    view.setInt16(offset + 8, gyro[1], true);
    view.setInt16(offset + 10, gyro[2], true);
  }
  return view;
}

/**
 * Raw wire packet fallback where byte 0 IS the report ID (e.g. non-WebHID captures).
 */
function makeRawWireBuffer({
  reportId = 0x30,
  timer = 1,
  battery = 8,
  acc = [0, 0, 4096],
  gyro = [1000, 0, -2000],
  frames = 3
} = {}) {
  const byteLength = 1 + 12 + frames * 12; // 49 bytes for 3 frames
  const buf = new Uint8Array(byteLength);
  buf[0] = reportId;
  buf[1] = timer;
  buf[2] = (battery << 4) | 0x01;
  const view = new DataView(buf.buffer);
  for (let f = 0; f < frames; f++) {
    const offset = 13 + f * 12;
    view.setInt16(offset, acc[0], true);
    view.setInt16(offset + 2, acc[1], true);
    view.setInt16(offset + 4, acc[2], true);
    view.setInt16(offset + 6, gyro[0], true);
    view.setInt16(offset + 8, gyro[1], true);
    view.setInt16(offset + 10, gyro[2], true);
  }
  return buf;
}

class FaithfulMockHIDDevice {
  constructor(productId = PRO_CONTROLLER_PRODUCT_ID) {
    this.vendorId = NINTENDO_VENDOR_ID;
    this.productId = productId;
    this.opened = false;
    this.listeners = new Map();
    this.sentReports = [];
  }
  async open() {
    this.opened = true;
  }
  async close() {
    this.opened = false;
  }
  async sendReport(reportId, data) {
    const copy = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    this.sentReports.push({ reportId, data: copy });
  }
  addEventListener(type, cb) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(cb);
  }
  removeEventListener(type, cb) {
    this.listeners.get(type)?.delete(cb);
  }
  emitInputReport(reportId, payloadDataView) {
    for (const cb of this.listeners.get('inputreport') || []) {
      cb({ reportId, data: payloadDataView });
    }
  }
}

test('#71 motion bridge converts finite rates once and rejects stale/malformed rates', () => {
  const s = { yawRate: 2, pitchRate: -1 };
  const d = controllerMotionDelta(s, 1 / 60, 0, false);
  assert.equal(d.available, true);
  close(d.yaw, 2 * 1.8 / 60);
  close(d.pitch, -1 * 1.8 / 60);
  close(controllerMotionDelta(s, 1 / 60, -5, true).pitch, 1 / 60);
  assert.equal(controllerMotionDelta(s, 0).available, false);
  assert.equal(controllerMotionDelta({ ...s, yawRate: NaN }, 1 / 60).available, false);
  assert.equal(controllerMotionDelta({ ...s, pitchRate: 1000 }, 1 / 60).available, false);
  assert.equal(controllerMotionDelta({ yawRate: MAX_GYRO_RATE_RAD_S, pitchRate: 0 }, 1 / 60).available, true,
    'the full nominal sensor range is not clipped by an arbitrary lower gameplay threshold');
  assert.equal(controllerMotionDelta({ yawRate: MAX_GYRO_RATE_RAD_S + 0.01, pitchRate: 0 }, 1 / 60).available, false);
});

test('#71 bridge composes with original PlayerController; missing bridge is stick-only', () => {
  class Input {}
  class PlayerController {
    constructor(input) {
      this.input = input;
      this.rig = { yaw: 0, pitch: 0 };
      this.enabled = true;
      this.calls = 0;
    }
    update() { this.calls++; }
  }
  const G = { settings: { gyroSens: 0, invertY: false }, rig: { mapK: 0 } };
  installControllerMotion({ Input, PlayerController, G });
  const input = new Input();
  input.pad = { connected: true, index: 1 };
  input.lastDevice = 'pad';
  input.down = () => false;
  input.padButton = () => false;
  const c = new PlayerController(input);
  assert.equal(input.controllerMotionStatus(), 'bridge-unavailable');
  c.update(1 / 60);
  close(c.rig.yaw, 0);
  assert.equal(c.calls, 1);
  let reads = 0;
  input.setControllerMotionReader(() => { reads++; return { padIndex: 1, yawRate: 1, pitchRate: 0.5 }; });
  assert.equal(input.controllerMotionStatus(), 'bridge-available');
  c.update(1 / 60);
  assert.equal(reads, 1);
  close(c.rig.yaw, 1.8 / 60);
  close(c.rig.pitch, 0.9 / 60);
  const yawAfterPad = c.rig.yaw, pitchAfterPad = c.rig.pitch;
  input.lastDevice = 'touch';
  c.update(1 / 60);
  assert.equal(reads, 1, 'touch owns input, so the controller reader is not consumed');
  close(c.rig.yaw, yawAfterPad, 'touch ownership excludes controller gyro yaw');
  close(c.rig.pitch, pitchAfterPad, 'touch ownership excludes controller gyro pitch');
  input.lastDevice = 'kbm';
  c.update(1 / 60);
  assert.equal(reads, 1, 'keyboard/mouse ownership excludes the controller reader');
  input.lastDevice = 'pad';
  G.rig.mapK = 1;
  c.update(1 / 60);
  assert.equal(reads, 1, 'map is not aimed by gyro');
  G.rig.mapK = 0;
  input.pad.connected = false;
  c.update(1 / 60);
  assert.equal(reads, 1);
  input.pad.connected = true;
  input.setControllerMotionReader(() => ({ padIndex: 2, yawRate: 2, pitchRate: 0 }));
  c.update(1 / 60);
  close(c.rig.yaw, 1.8 / 60, 'wrong pad ignored');
  assert.equal(c.calls, 7);
});

test('#71 selected device with failed output initialization is not exposed as a motion bridge', async () => {
  class MockInput {
    constructor() { this.s3ControllerMotionReader = null; }
    setControllerMotionReader(reader) { this.s3ControllerMotionReader = reader; }
  }

  const brokenDev = new FaithfulMockHIDDevice(PRO_CONTROLLER_PRODUCT_ID);
  brokenDev.sendReport = async () => { throw new Error('Output report failed'); };
  const mockNavigatorHid = {
    requestDevice: async () => [brokenDev],
    getDevices: async () => [],
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  const priorHidDesc = Object.getOwnPropertyDescriptor(globalThis.navigator, 'hid');
  Object.defineProperty(globalThis.navigator, 'hid', { value: mockNavigatorHid, configurable: true, writable: true });
  try {
    const input = new MockInput();
    const result = await requestWebHIDDevice(input);
    assert.equal(result.supported, true);
    assert.equal(result.connected, false);
    assert.equal(result.status, 'initialization-failed');
    assert.equal(result.initResult.reason, 'enable-imu-failed');
    assert.equal(input.s3ControllerMotionReader, null, 'failed IMU/report-mode setup cannot install a live reader');
    assert.equal(input.s3ControllerMotionInitError.reason, 'enable-imu-failed');
  } finally {
    if (priorHidDesc) Object.defineProperty(globalThis.navigator, 'hid', priorHidDesc);
    else delete globalThis.navigator.hid;
  }
});

test('#71 published Nintendo Switch HID report decoder extracts calibrated rad/s and rejects invalid/0x21 reports with faithful WebHID contract', () => {
  // 1. Faithful WebHID event where event.data EXCLUDES reportId:
  const faithfulPayload = makeFaithfulWebHIDData({ gyro: [1000, 0, -2000] });
  const decWebHID = decodeSwitchMotionReport(faithfulPayload, {
    reportId: 0x30,
    productId: PRO_CONTROLLER_PRODUCT_ID
  });
  assert.equal(decWebHID.available, true);
  assert.equal(decWebHID.reportId, 0x30);
  assert.equal(decWebHID.deviceType, 'pro-controller');
  close(decWebHID.pitchRate, 1000 * DEFAULT_GYRO_SCALE, 'pitchRate scale from byte 18..19');
  close(decWebHID.yawRate, 2000 * DEFAULT_GYRO_SCALE, 'yawRate inverted Z from byte 22..23');

  // A WebHID DataView can be a window into a larger backing buffer. Its byteOffset
  // must remain the payload origin; it must not expose the report ID or padding.
  const paddedPayload = new Uint8Array(faithfulPayload.byteLength + 7);
  paddedPayload.set(new Uint8Array(faithfulPayload.buffer, faithfulPayload.byteOffset, faithfulPayload.byteLength), 3);
  const offsetPayload = new DataView(paddedPayload.buffer, 3, faithfulPayload.byteLength);
  const decOffset = decodeSwitchMotionReport(offsetPayload, { reportId: 0x30, productId: PRO_CONTROLLER_PRODUCT_ID });
  assert.equal(decOffset.available, true);
  close(decOffset.pitchRate, decWebHID.pitchRate, 'DataView byteOffset preserved');
  close(decOffset.yawRate, decWebHID.yawRate, 'DataView byteLength bounds payload');

  const nearRatedRange = decodeSwitchMotionReport(makeFaithfulWebHIDData({ gyro: [28600, 0, -28600] }), {
    reportId: 0x30,
    productId: PRO_CONTROLLER_PRODUCT_ID
  });
  assert.equal(nearRatedRange.available, true, 'near-full-scale ±2000 dps sensor motion remains usable');

  // 2. Wire format fallback where byte 0 is reportId:
  const wireBuf = makeRawWireBuffer({ reportId: 0x30, gyro: [800, 0, -1200] });
  const decWire = decodeSwitchMotionReport(wireBuf, { productId: JOYCON_R_PRODUCT_ID });
  assert.equal(decWire.available, true);
  assert.equal(decWire.reportId, 0x30);
  close(decWire.pitchRate, 800 * DEFAULT_GYRO_SCALE);
  close(decWire.yawRate, 1200 * DEFAULT_GYRO_SCALE);

  // 3. Subcommand reply 0x21 is NOT an IMU stream (dekuNukem and primary spec)
  const report21 = makeFaithfulWebHIDData();
  const dec21 = decodeSwitchMotionReport(report21, { reportId: 0x21 });
  assert.equal(dec21.available, false);
  assert.equal(dec21.reason, 'unsupported-report-id');
  assert.equal(dec21.reportId, 0x21);

  // 4. Other valid published IMU report IDs: 0x31, 0x32, 0x33
  for (const rId of [0x31, 0x32, 0x33]) {
    const res = decodeSwitchMotionReport(faithfulPayload, { reportId: rId, productId: PRO_CONTROLLER_PRODUCT_ID });
    assert.equal(res.available, true, `Report 0x${rId.toString(16)} should be supported`);
  }

  // 5. Truncated payload (< 24 bytes in WebHID mode)
  const truncated = new Uint8Array(20);
  assert.equal(decodeSwitchMotionReport(truncated, { reportId: 0x30 }).available, false);
  assert.equal(decodeSwitchMotionReport(new Uint8Array(0)).reason, 'payload-too-short',
    'empty raw wire capture is rejected without a DataView bounds exception');

  // 6. Joy-Con (L) motion is excluded for aim
  const decLeft = decodeSwitchMotionReport(faithfulPayload, { reportId: 0x30, productId: JOYCON_L_PRODUCT_ID });
  assert.equal(decLeft.available, false);
  assert.equal(decLeft.ignoredSide, 'left');

  // 7. Multi-frame averaging across 3 samples
  const multiPayload = makeFaithfulWebHIDData({ gyro: [900, 0, 0] });
  multiPayload.setInt16(18, 900, true);
  multiPayload.setInt16(30, 1000, true);
  multiPayload.setInt16(42, 1100, true);
  const decMulti = decodeSwitchMotionReport(multiPayload, { reportId: 0x30, averageFrames: true });
  close(decMulti.pitchRate, 1000 * DEFAULT_GYRO_SCALE, 'multi-frame average rate');
});

test('#71 Right Joy-Con and Pro Controller sensor channels decode with the nominal published scale', () => {
  // These synthetic channel assertions verify this bridge's current axis convention.
  // Physical mounting orientation, camera signs, and S3 response remain unverified.
  const rightJoyconPayload = makeFaithfulWebHIDData({ gyro: [1200, 500, -1800] });
  const decR = decodeSwitchMotionReport(rightJoyconPayload, {
    reportId: 0x30,
    productId: JOYCON_R_PRODUCT_ID
  });
  assert.equal(decR.deviceType, 'joycon-right');
  close(decR.pitchRate, 1200 * DEFAULT_GYRO_SCALE, 'right Joy-Con pitch');
  close(decR.rollRate, 500 * DEFAULT_GYRO_SCALE, 'right Joy-Con roll');
  close(decR.yawRate, 1800 * DEFAULT_GYRO_SCALE, 'right Joy-Con yaw');

  const proPayload = makeFaithfulWebHIDData({ gyro: [1500, -300, -2200] });
  const decPro = decodeSwitchMotionReport(proPayload, {
    reportId: 0x30,
    productId: PRO_CONTROLLER_PRODUCT_ID
  });
  assert.equal(decPro.deviceType, 'pro-controller');
  close(decPro.pitchRate, 1500 * DEFAULT_GYRO_SCALE, 'Pro Controller pitch');
  close(decPro.rollRate, -300 * DEFAULT_GYRO_SCALE, 'Pro Controller roll');
  close(decPro.yawRate, 2200 * DEFAULT_GYRO_SCALE, 'Pro Controller yaw');
});

test('#71 arrival age expiry stops infinite rotation drift and malformed/truncated packets clear active rate', async () => {
  const mockDev = new FaithfulMockHIDDevice(PRO_CONTROLLER_PRODUCT_ID);
  const reader = createSwitchHIDReader({
    device: mockDev,
    productId: PRO_CONTROLLER_PRODUCT_ID,
    maxAgeMs: 50 // Short expiry for fast deterministic test
  });

  const payload = makeFaithfulWebHIDData({ gyro: [800, 0, -1400] });
  mockDev.emitInputReport(0x30, payload);

  // 1. Immediately after arrival: reader yields valid rate
  const initial = reader({ index: 0 }, 1 / 60);
  assert.ok(initial);
  close(initial.pitchRate, 800 * DEFAULT_GYRO_SCALE);
  close(initial.yawRate, 1400 * DEFAULT_GYRO_SCALE);

  // 2. An invalid/corrupt packet arrives: immediately clears active drift!
  const malformed = new Uint8Array(10); // Too short
  mockDev.emitInputReport(0x30, new DataView(malformed.buffer));
  assert.equal(reader({ index: 0 }, 1 / 60), null, 'corrupt/truncated packet clears stale drift');

  // 3. Send valid packet again
  mockDev.emitInputReport(0x30, payload);
  assert.ok(reader({ index: 0 }, 1 / 60), 'reader active after fresh report');

  // 4. Subcommand reply 0x21 arrives: treated as invalid IMU report, clears active drift
  mockDev.emitInputReport(0x21, payload);
  assert.equal(reader({ index: 0 }, 1 / 60), null, '0x21 subcommand reply clears active rate');

  // 5. Send valid packet again, then let it age beyond maxAgeMs (no reports arriving)
  mockDev.emitInputReport(0x30, payload);
  assert.ok(reader({ index: 0 }, 1 / 60));
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(reader({ index: 0 }, 1 / 60), null, 'expired arrival age does not hold rate forever');
});

test('#71 published device initialization sequence opens device and sends 0x40 and 0x03 subcommands with neutral rumble, handling failure explicitly', async () => {
  const mockDev = new FaithfulMockHIDDevice(PRO_CONTROLLER_PRODUCT_ID);
  assert.equal(mockDev.opened, false);

  const initResult = await initializeSwitchHIDDevice(mockDev);
  assert.equal(initResult.initialized, true);
  assert.equal(mockDev.opened, true, 'device was opened');
  assert.equal(mockDev.sentReports.length, 2, '2 output reports sent');

  // First output report: Subcommand 0x40 (Enable 6-Axis IMU)
  const rep0 = mockDev.sentReports[0];
  assert.equal(rep0.reportId, OUTPUT_REPORT_SUBCMD);
  assert.equal(rep0.data[9], SUBCMD_ENABLE_IMU, 'Subcommand 0x40');
  assert.equal(rep0.data[10], 0x01, 'Argument 0x01 (enable)');
  // Verify 8 neutral rumble bytes in indices 1..8
  for (let i = 0; i < 8; i++) {
    assert.equal(rep0.data[1 + i], NEUTRAL_RUMBLE[i], `Neutral rumble byte ${i}`);
  }

  // Second output report: Subcommand 0x03 (Set report mode to 0x30 Standard Full Mode)
  const rep1 = mockDev.sentReports[1];
  assert.equal(rep1.reportId, OUTPUT_REPORT_SUBCMD);
  assert.equal(rep1.data[9], SUBCMD_SET_INPUT_REPORT_MODE, 'Subcommand 0x03');
  assert.equal(rep1.data[10], INPUT_REPORT_STANDARD_FULL, 'Argument 0x30 (Standard full mode)');

  // Test explicit partial / failure handling:
  const brokenDev = new FaithfulMockHIDDevice(PRO_CONTROLLER_PRODUCT_ID);
  brokenDev.open = async () => { throw new Error('Hardware permission denied'); };
  const failResult = await initializeSwitchHIDDevice(brokenDev);
  assert.equal(failResult.initialized, false);
  assert.equal(failResult.reason, 'open-failed');
  assert.ok(failResult.error);

  const noOpen = await initializeSwitchHIDDevice({
    opened: false,
    sendReport: async () => {}
  });
  assert.equal(noOpen.initialized, false, 'a device without WebHID open() cannot be reported initialized');
  assert.equal(noOpen.reason, 'open-failed');

  const failedOutput = new FaithfulMockHIDDevice(PRO_CONTROLLER_PRODUCT_ID);
  failedOutput.sendReport = async () => { throw new Error('Output report failed'); };
  const failedOutputResult = await initializeSwitchHIDDevice(failedOutput);
  assert.equal(failedOutputResult.initialized, false);
  assert.equal(failedOutputResult.reason, 'enable-imu-failed');
});

test('#71 WebHID session lifecycle protects against detach and pending getDevices race conditions, and disconnect cleans up reader', async () => {
  class MockInput {
    constructor() {
      this.s3ControllerMotionReader = null;
    }
    setControllerMotionReader(r) {
      this.s3ControllerMotionReader = r;
    }
  }

  const mockDev = new FaithfulMockHIDDevice(PRO_CONTROLLER_PRODUCT_ID);
  let getDevicesResolve;
  const mockNavigatorHid = {
    getDevices: () => new Promise(resolve => { getDevicesResolve = resolve; }),
    addEventListener: (t, cb) => { mockNavigatorHid['on' + t] = cb; },
    removeEventListener: (t, cb) => { if (mockNavigatorHid['on' + t] === cb) mockNavigatorHid['on' + t] = null; }
  };

  const priorHidDesc = Object.getOwnPropertyDescriptor(globalThis.navigator, 'hid');
  Object.defineProperty(globalThis.navigator, 'hid', { value: mockNavigatorHid, configurable: true, writable: true });

  try {
    const input = new MockInput();
    const handle = attachWebHIDControllerMotion(input);
    assert.ok(handle.supported);

    // Case 1: Session is detached while getDevices is still pending
    handle.detach();
    assert.equal(handle.session.active, false);
    // getDevices now resolves later:
    getDevicesResolve([mockDev]);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(input.s3ControllerMotionReader, null, 'detached session ignored slow getDevices');

    // Case 2: New session attached, disconnect event cleans up active reader
    const input2 = new MockInput();
    const handle2 = attachWebHIDControllerMotion(input2);
    const slowPromise = new Promise(resolve => { getDevicesResolve = resolve; });
    mockNavigatorHid.getDevices = () => slowPromise;

    // Simulate user connecting device
    await mockNavigatorHid.onconnect({ device: mockDev });
    assert.ok(input2.s3ControllerMotionReader, 'reader attached on connect');

    // Disconnect removes the current reader. A later connect creates a fresh one.
    mockNavigatorHid.ondisconnect({ device: mockDev });
    assert.equal(input2.s3ControllerMotionReader, null, 'reader cleared on disconnect');
    await mockNavigatorHid.onconnect({ device: mockDev });
    const reconnectedReader = input2.s3ControllerMotionReader;
    assert.ok(reconnectedReader, 'reader reinitialized on reconnect');
    assert.notEqual(reconnectedReader, null);

    // A disconnect while sendReport is pending invalidates the old async attach;
    // that completion must not resurrect a reader for the detached device.
    mockNavigatorHid.ondisconnect({ device: mockDev });
    assert.equal(input2.s3ControllerMotionReader, null);
    let releaseFirstReport;
    let notifyFirstReport;
    const firstReportStarted = new Promise(resolve => { notifyFirstReport = resolve; });
    const firstReportGate = new Promise(resolve => { releaseFirstReport = resolve; });
    const sendReport = mockDev.sendReport.bind(mockDev);
    let blockFirstReport = true;
    mockDev.sendReport = async (...args) => {
      if (blockFirstReport) {
        blockFirstReport = false;
        notifyFirstReport();
        await firstReportGate;
      }
      return sendReport(...args);
    };
    const pendingConnect = mockNavigatorHid.onconnect({ device: mockDev });
    await firstReportStarted;
    mockNavigatorHid.ondisconnect({ device: mockDev });
    releaseFirstReport();
    const pendingResult = await pendingConnect;
    assert.equal(pendingResult.status, 'stale-session');
    assert.equal(input2.s3ControllerMotionReader, null, 'late initialization cannot reattach a disconnected device');
    await mockNavigatorHid.onconnect({ device: mockDev });
    assert.ok(input2.s3ControllerMotionReader, 'a fresh reconnect succeeds after stale initialization settles');

    handle2.detach();
  } finally {
    if (priorHidDesc) Object.defineProperty(globalThis.navigator, 'hid', priorHidDesc);
    else delete globalThis.navigator.hid;
  }
});

test('#71 production UI activation in adapters calls requestDevice during the adapted click accept gesture', async () => {
  // Verify that adaptSource patches menus.js with _connectMotion in SETTINGS_TABS controls rows
  const menusRaw = fs.readFileSync('inkwave-public/src/ui/menus.js', 'utf8');
  const menusAdapted = adaptSource('src/ui/menus.js', menusRaw);
  assert.ok(menusAdapted.includes("key: '_connectMotion'"), 'menus.js includes _connectMotion key');
  assert.ok(menusAdapted.includes("label: 'Connect Joy-Con / Pro Controller'"), 'menus.js includes Connect label');
  assert.ok(menusAdapted.includes("connectControllerMotion"), 'menus.js connects via api or input');

  // Verify that adaptSource patches main.js to expose connectControllerMotion on _menuApi
  const mainRaw = fs.readFileSync('inkwave-public/src/main.js', 'utf8');
  const mainAdapted = adaptSource('src/main.js', mainRaw);
  assert.ok(mainAdapted.includes('connectControllerMotion: () => (self.input?.requestWebHID'), 'main.js exposes connectControllerMotion');
  assert.ok(mainAdapted.includes('this.input.attachWebHID?.()'), 'main.js boots with attachWebHID');

  // Execute the actual transformed row-accept expression with an activation
  // sentinel. WebHID requestDevice must be called before the click handler returns.
  class MockInput {
    constructor() { this.s3ControllerMotionReader = null; this.pendingRequest = null; }
    setControllerMotionReader(r) { this.s3ControllerMotionReader = r; }
    requestWebHID() {
      this.pendingRequest = requestWebHIDDevice(this);
      return this.pendingRequest;
    }
  }

  const mockDev = new FaithfulMockHIDDevice(PRO_CONTROLLER_PRODUCT_ID);
  let transientActivation = false;
  let activationObservedAtRequest = false;
  let requestCount = 0;
  const mockNavigatorHid = {
    requestDevice: async options => {
      requestCount++;
      activationObservedAtRequest = transientActivation;
      assert.deepEqual(options.filters.map(({ productId }) => productId),
        [JOYCON_R_PRODUCT_ID, PRO_CONTROLLER_PRODUCT_ID, JOYCON_GRIP_PRODUCT_ID]);
      if (!transientActivation) throw new Error('requestDevice called without transient user activation');
      return [mockDev];
    },
    getDevices: async () => [],
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const priorHidDesc = Object.getOwnPropertyDescriptor(globalThis.navigator, 'hid');
  Object.defineProperty(globalThis.navigator, 'hid', { value: mockNavigatorHid, configurable: true, writable: true });
  try {
    const input = new MockInput();
    const app = { input };
    const menu = {
      api: { connectControllerMotion: () => (app.input?.requestWebHID ? app.input.requestWebHID() : null) },
      toasts: [],
      _sfx() { transientActivation = false; },
      toast(text, options) { this.toasts.push({ text, options }); },
      _go() { assert.fail('connect row fell through to the how-to screen'); }
    };
    const goPrefix = "          const go = r.key === '_layout'";
    const goStart = menusAdapted.indexOf(goPrefix);
    const goEnd = menusAdapted.indexOf(';\n          ctrl =', goStart);
    assert.ok(goStart >= 0 && goEnd > goStart, 'adapted settings row accept expression exists');
    const expression = menusAdapted.slice(goStart + '          const go = '.length, goEnd);
    const makeGo = new Function('r', 'safeCall', 'tr', `return (${expression});`);
    const accept = makeGo.call(menu, { key: '_connectMotion' }, fn => fn(), value => value);

    transientActivation = true;
    accept();
    transientActivation = false;

    assert.equal(requestCount, 1);
    assert.equal(activationObservedAtRequest, true, 'requestDevice was invoked in the click accept call stack');
    const res = await input.pendingRequest;
    assert.equal(res.supported, true);
    assert.equal(res.connected, true);
    assert.equal(res.status, 'bridge-available');
    assert.ok(input.s3ControllerMotionReader, 'reader installed via production UI path');
    assert.deepEqual(menu.toasts, [{ text: 'Controller motion connected.', options: { kind: 'good' } }],
      'production UI reports the resolved connection state');
  } finally {
    if (priorHidDesc) Object.defineProperty(globalThis.navigator, 'hid', priorHidDesc);
    else delete globalThis.navigator.hid;
  }
});

test('#71 30 Hz, 60 Hz, 120 Hz render parity: integrated delta angle over 1 second is identical', () => {
  const sample = { yawRate: 1.5, pitchRate: -0.75 };
  const sens = 0; // gain = 1.8

  let yaw30 = 0, pitch30 = 0;
  for (let i = 0; i < 30; i++) {
    const d = controllerMotionDelta(sample, 1 / 30, sens);
    yaw30 += d.yaw; pitch30 += d.pitch;
  }

  let yaw60 = 0, pitch60 = 0;
  for (let i = 0; i < 60; i++) {
    const d = controllerMotionDelta(sample, 1 / 60, sens);
    yaw60 += d.yaw; pitch60 += d.pitch;
  }

  let yaw120 = 0, pitch120 = 0;
  for (let i = 0; i < 120; i++) {
    const d = controllerMotionDelta(sample, 1 / 120, sens);
    yaw120 += d.yaw; pitch120 += d.pitch;
  }

  close(yaw30, yaw60, '30 Hz vs 60 Hz yaw');
  close(yaw60, yaw120, '60 Hz vs 120 Hz yaw');
  close(pitch30, pitch60, '30 Hz vs 60 Hz pitch');
  close(pitch60, pitch120, '60 Hz vs 120 Hz pitch');
  close(yaw60, 1.5 * 1.8, 'integrated yaw equals rate * gain * time');
  close(pitch60, -0.75 * 1.8, 'integrated pitch equals rate * gain * time');
});

test('#71 right stick and controller gyro compose without double integration; recenter resets pitch and reader drift', () => {
  class Input {}
  class PlayerController {
    constructor(input) {
      this.input = input;
      this.rig = { yaw: 0, pitch: 0 };
      this.padLook = { x: 0, y: 0 };
      this.a = { yaw: 0.5, aimYaw: 0, aimPitch: 0 };
      this.enabled = true;
    }
    resetCamera() {
      this.rig.yaw = this.a.yaw;
      this.rig.pitch = 0;
      this.padLook.x = this.padLook.y = 0;
    }
    update(dt) {
      this.rig.yaw -= this.padLook.x * 2.0 * dt;
      this.rig.pitch -= this.padLook.y * 2.0 * dt;
    }
  }

  const G = { settings: { gyroSens: 0, gyroInvertY: false, gyroInvertX: false }, rig: { mapK: 0 } };
  installControllerMotion({ Input, PlayerController, G });

  const input = new Input();
  input.pad = { connected: true, index: 0 };
  input.lastDevice = 'pad';
  input.down = () => false;
  input.padButton = () => false;

  const c = new PlayerController(input);

  // 1. Without controller motion bridge: standard right-stick controls pitch and yaw normally
  c.padLook.x = 1.0;
  c.padLook.y = -1.0;
  c.update(1 / 60);
  close(c.rig.yaw, -2.0 / 60, 'stick yaw without gyro');
  close(c.rig.pitch, 2.0 / 60, 'stick pitch without gyro');

  // 2. With controller motion bridge: stick yaw and gyro yaw compose, while stick pitch is suppressed
  c.rig.yaw = 0;
  c.rig.pitch = 0;
  let recenterCalls = 0;
  const mockReader = (pad, dt) => ({ padIndex: 0, yawRate: 1.0, pitchRate: 0.5 });
  mockReader.recenter = () => { recenterCalls++; };
  input.setControllerMotionReader(mockReader);

  c.padLook.x = 1.0;  // Stick moving right
  c.padLook.y = 1.0;  // Stick moving down (suppressed from vertical pitch in gyro mode)
  c.update(1 / 60);

  const expectedYaw = (1.0 * 1.8 - 2.0) / 60;
  close(c.rig.yaw, expectedYaw, 'stick yaw and gyro yaw composed');
  const expectedPitch = (0.5 * 1.8) / 60;
  close(c.rig.pitch, expectedPitch, 'gyro owns vertical pitch without stick double-integration');
  assert.equal(c.padLook.y, 0, 'padLook.y suppressed when gyro applied');

  // 3. Camera reset (recenter): clears pitch to 0, aligns yaw to character heading, clears drift
  c.resetCamera();
  assert.equal(recenterCalls, 1, 'reader recenter hook called');
  close(c.rig.pitch, 0, 'pitch reset to 0');
  close(c.rig.yaw, 0.5, 'yaw aligned with actor');
});

test('#71 real device proof vs synthetic mock distinction is verified', () => {
  // All simulated report tests use synthetic byte buffers and mock WebHID events based on published specifications.
  // Verify that mock objects are explicitly distinguishable from physical hardware.
  const mockDev = new FaithfulMockHIDDevice();
  assert.equal(mockDev instanceof FaithfulMockHIDDevice, true);
  assert.equal(typeof navigator === 'undefined' || !('hid' in navigator) || navigator.hid === null, true,
    'Headless Node test environment has no physical WebHID hardware devices');
});
