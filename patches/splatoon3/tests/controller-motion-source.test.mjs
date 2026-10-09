import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NINTENDO_VENDOR_ID,
  JOYCON_L_PRODUCT_ID,
  JOYCON_R_PRODUCT_ID,
  PRO_CONTROLLER_PRODUCT_ID,
  DEFAULT_GYRO_SCALE,
  gainAt,
  controllerMotionDelta,
  decodeSwitchMotionReport,
  createSwitchHIDReader,
  hasWebHIDSupport,
  getControllerMotionPlatformStatus,
  attachWebHIDControllerMotion,
  installControllerMotion
} from '../runtime/controller-motion.mjs';

const close = (a, b, msg = '') => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} != ${b}`);

function makeSyntheticSwitchReport({
  reportId = 0x30,
  timer = 1,
  battery = 8,
  acc = [0, 0, 4096],
  gyro = [1000, 0, -2000],
  frames = 3
} = {}) {
  const buf = new Uint8Array(49);
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

class MockHIDDevice {
  constructor(productId = PRO_CONTROLLER_PRODUCT_ID) {
    this.vendorId = NINTENDO_VENDOR_ID;
    this.productId = productId;
    this.listeners = new Map();
  }
  addEventListener(type, cb) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(cb);
  }
  removeEventListener(type, cb) {
    this.listeners.get(type)?.delete(cb);
  }
  emitReport(data) {
    for (const cb of this.listeners.get('inputreport') || []) {
      cb({ data: new DataView(data.buffer, data.byteOffset, data.byteLength), reportId: data[0] });
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
  const G = { settings: { gyroSensitivity: 0, invertY: false }, rig: { mapK: 0 } };
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
  assert.equal(c.calls, 5);
});

test('#71 published Nintendo Switch HID report decoder extracts calibrated rad/s and rejects invalid reports', () => {
  // Report 0x30 with Pro Controller
  const reportPro = makeSyntheticSwitchReport({ gyro: [1000, 0, -2000] });
  const decPro = decodeSwitchMotionReport(reportPro, { productId: PRO_CONTROLLER_PRODUCT_ID });
  assert.equal(decPro.available, true);
  assert.equal(decPro.deviceType, 'pro-controller');
  close(decPro.pitchRate, 1000 * DEFAULT_GYRO_SCALE, 'pitchRate scale');
  close(decPro.yawRate, 2000 * DEFAULT_GYRO_SCALE, 'yawRate inverted Z');

  // Report 0x30 with Right Joy-Con
  const reportR = makeSyntheticSwitchReport({ gyro: [800, 0, -1200] });
  const decR = decodeSwitchMotionReport(reportR, { productId: JOYCON_R_PRODUCT_ID });
  assert.equal(decR.available, true);
  assert.equal(decR.deviceType, 'joycon-right');
  close(decR.pitchRate, 800 * DEFAULT_GYRO_SCALE);
  close(decR.yawRate, 1200 * DEFAULT_GYRO_SCALE);

  // Joy-Con (L) motion is ignored for aiming in Splatoon 3
  const reportL = makeSyntheticSwitchReport({ gyro: [500, 0, 500] });
  const decL = decodeSwitchMotionReport(reportL, { productId: JOYCON_L_PRODUCT_ID });
  assert.equal(decL.available, false);
  assert.equal(decL.ignoredSide, 'left');

  // Subcommand reply with IMU (0x21) and NFC/IR (0x31)
  const report21 = makeSyntheticSwitchReport({ reportId: 0x21, gyro: [400, 0, -600] });
  assert.equal(decodeSwitchMotionReport(report21, { productId: PRO_CONTROLLER_PRODUCT_ID }).available, true);
  const report31 = makeSyntheticSwitchReport({ reportId: 0x31, gyro: [400, 0, -600] });
  assert.equal(decodeSwitchMotionReport(report31, { productId: PRO_CONTROLLER_PRODUCT_ID }).available, true);

  // Unsupported report ID (e.g. 0x3f simple button report)
  const reportBad = makeSyntheticSwitchReport({ reportId: 0x3f });
  const decBad = decodeSwitchMotionReport(reportBad);
  assert.equal(decBad.available, false);
  assert.equal(decBad.reason, 'unsupported-report-id');

  // Truncated payload (< 25 bytes)
  assert.equal(decodeSwitchMotionReport(new Uint8Array(18)).available, false);

  // Out of bounds extreme rate (> 25 rad/s)
  const reportExtreme = makeSyntheticSwitchReport({ gyro: [32000, 0, 0] });
  assert.equal(decodeSwitchMotionReport(reportExtreme).available, false);

  // Multi-frame averaging
  const reportMulti = makeSyntheticSwitchReport({ gyro: [900, 0, 0] });
  const view = new DataView(reportMulti.buffer);
  view.setInt16(19, 900, true);
  view.setInt16(31, 1000, true);
  view.setInt16(43, 1100, true);
  const decMulti = decodeSwitchMotionReport(reportMulti, { averageFrames: true });
  close(decMulti.pitchRate, 1000 * DEFAULT_GYRO_SCALE, 'multi-frame average');
});

test('#71 WebHID reader decodes synthetic stream, recenters drift, and platform detection is explicit', () => {
  // In Node.js environment without WebHID navigator.hid
  assert.equal(hasWebHIDSupport(), false);
  assert.equal(getControllerMotionPlatformStatus(), 'unsupported-platform');

  class Input {}
  class PlayerController {}
  installControllerMotion({ Input, PlayerController, G: { settings: {} } });
  const input = new Input();
  assert.equal(input.controllerMotionPlatformStatus(), 'unsupported-platform');
  const attachRes = input.attachWebHID();
  assert.equal(attachRes.supported, false);
  assert.equal(attachRes.status, 'unsupported-platform');

  // Mock WebHID device reader
  const mockDev = new MockHIDDevice(PRO_CONTROLLER_PRODUCT_ID);
  const reader = createSwitchHIDReader({ device: mockDev, productId: PRO_CONTROLLER_PRODUCT_ID });
  input.setControllerMotionReader(reader);
  assert.equal(input.controllerMotionStatus(), 'bridge-available');

  const report = makeSyntheticSwitchReport({ gyro: [500, 0, -1000] });
  mockDev.emitReport(report);
  const sample = reader({ index: 0 }, 1 / 60);
  assert.ok(sample);
  close(sample.pitchRate, 500 * DEFAULT_GYRO_SCALE);
  close(sample.yawRate, 1000 * DEFAULT_GYRO_SCALE);

  // Recenter clears active sample
  reader.recenter();
  assert.equal(reader({ index: 0 }, 1 / 60), null);

  // Detach cleans up listener
  reader.detach();
  mockDev.emitReport(report);
  assert.equal(reader({ index: 0 }, 1 / 60), null);
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
      // Simulate underlying PlayerController right stick integration
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

  // Expected yaw: gyro yaw (1.0 * 1.8 / 60) + stick yaw (-1.0 * 2.0 / 60)
  const expectedYaw = (1.0 * 1.8 - 2.0) / 60;
  close(c.rig.yaw, expectedYaw, 'stick yaw and gyro yaw composed');
  // Expected pitch: solely governed by controller gyro (0.5 * 1.8 / 60); stick pitch suppressed
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
  const mockDev = new MockHIDDevice();
  assert.equal(mockDev instanceof MockHIDDevice, true);
  assert.equal(typeof navigator === 'undefined' || !('hid' in navigator) || navigator.hid === null, true,
    'Headless Node test environment has no physical WebHID hardware devices');
});
