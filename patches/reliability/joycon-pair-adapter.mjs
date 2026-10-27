import { replaceOnce } from './input-adapter.mjs';

const INPUT_REL = 'src/core/input.js';
const JOYCON_HELPERS = String.raw`
// Chromium's native Gamepad.id includes these Nintendo vendor/product fields.
// Its standard-mapped standalone Joy-Con shape is 17 buttons and 2 axes.
const INKWAVE_JOYCON_BUTTON_COUNT = 17;
const INKWAVE_JOYCON_AXIS_COUNT = 2;
const INKWAVE_JOYCON_L_ID = /Vendor:\s*057e\s+Product:\s*2006\b/i;
const INKWAVE_JOYCON_R_ID = /Vendor:\s*057e\s+Product:\s*2007\b/i;
// Each composite slot is written exactly once; mappings are shared constants,
// not per-poll arrays/closures. Native Gamepad snapshots are never retained.
const INKWAVE_JOYCON_L_BUTTONS = [0, 14, 1, 13, 2, 12, 3, 15, 8, 4, 9, 8, 10, 10, 16, 17, 6, 6, 4, 18, 5, 19];
const INKWAVE_JOYCON_R_BUTTONS = [2, 0, 0, 1, 3, 2, 1, 3, 8, 5, 7, 7, 9, 9, 10, 11, 16, 16, 4, 20, 5, 21];
function inkwaveIsJoyCon(pad, side) {
  const id = side === 'L' ? INKWAVE_JOYCON_L_ID : INKWAVE_JOYCON_R_ID;
  return !!pad && pad.connected === true && pad.mapping === 'standard' && Number.isInteger(pad.index) &&
    typeof pad.id === 'string' && id.test(pad.id) &&
    pad.axes?.length === INKWAVE_JOYCON_AXIS_COUNT && pad.buttons?.length === INKWAVE_JOYCON_BUTTON_COUNT;
}
function inkwaveCopyJoyConButtons(pad, mapping, buttons) {
  for (let i = 0; i < mapping.length; i += 2) {
    const source = pad.buttons?.[mapping[i]], target = buttons[mapping[i + 1]];
    target.pressed = !!source?.pressed;
    target.touched = !!source?.touched;
    target.value = Number.isFinite(source?.value) ? source.value : (source?.pressed ? 1 : 0);
  }
}
function inkwaveJoyConAxis(pad, index) {
  return Number.isFinite(pad.axes[index]) ? pad.axes[index] : 0;
}
function inkwaveJoyConPair(left, right, previous) {
  const samePair = previous?._inkwaveJoyconPair &&
    previous._inkwaveJoyconIndices[0] === left.index && previous._inkwaveJoyconIndices[1] === right.index &&
    previous._inkwaveJoyconIds[0] === left.id && previous._inkwaveJoyconIds[1] === right.id;
  const pair = samePair ? previous : {
    index: left.index,
    id: 'INKWAVE paired Joy-Con L[' + left.index + ':' + left.id + '] R[' + right.index + ':' + right.id + ']',
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 22 }, () => ({ pressed: false, touched: false, value: 0 })),
    timestamp: 0,
    vibrationActuator: null,
    _inkwaveJoyconPair: true,
    _inkwaveJoyconIndices: [left.index, right.index],
    _inkwaveJoyconIds: [left.id, right.id],
  };
  // Reuse the pair only for the same device identities. Disappearance or a
  // replacement still flows through the existing cancellation/neutral gate.
  inkwaveCopyJoyConButtons(left, INKWAVE_JOYCON_L_BUTTONS, pair.buttons);
  inkwaveCopyJoyConButtons(right, INKWAVE_JOYCON_R_BUTTONS, pair.buttons);
  pair.axes[0] = -inkwaveJoyConAxis(left, 1); pair.axes[1] = inkwaveJoyConAxis(left, 0);
  pair.axes[2] = inkwaveJoyConAxis(right, 1); pair.axes[3] = -inkwaveJoyConAxis(right, 0);
  pair.timestamp = Math.max(Number.isFinite(left.timestamp) ? left.timestamp : 0, Number.isFinite(right.timestamp) ? right.timestamp : 0);
  pair.vibrationActuator = left.vibrationActuator || right.vibrationActuator || null;
  return pair;
}
`;

const SELECT_PAD = `    let pad = null;
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') { pad = p; break; }
    if (!pad) for (const p of pads) if (p && p.connected) { pad = p; break; }`;
const SELECT_PAD_COMPOSED = `    const connectedPads = [];
    for (const p of pads) if (p && p.connected) connectedPads.push(p);
    const leftPads = connectedPads.length ? connectedPads.filter(p => inkwaveIsJoyCon(p, 'L')) : connectedPads;
    const rightPads = connectedPads.length ? connectedPads.filter(p => inkwaveIsJoyCon(p, 'R')) : connectedPads;
    const standardPad = connectedPads.find(p => p.mapping === 'standard' && !inkwaveIsJoyCon(p, 'L') && !inkwaveIsJoyCon(p, 'R'));
    let pad = null;
    if (standardPad) pad = standardPad;
    else if (leftPads.length === 1 && rightPads.length === 1 && leftPads[0].index !== rightPads[0].index) {
      pad = inkwaveJoyConPair(leftPads[0], rightPads[0], this.pad);
    } else {
      for (const p of connectedPads) if (p.mapping === 'standard') { pad = p; break; }
      if (!pad) pad = connectedPads[0] || null;
    }`;

export function adaptJoyConPair(rel, code) {
  if (rel !== INPUT_REL) return code;
  code = replaceOnce(code, 'export class Input {', JOYCON_HELPERS + '\nexport class Input {', 'known split Joy-Con identity and standard layout');
  return replaceOnce(code, SELECT_PAD, SELECT_PAD_COMPOSED, 'compatible left/right Joy-Con composition');
}
