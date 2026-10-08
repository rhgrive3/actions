import { replaceOnce } from './input-adapter.mjs';

const INPUT_REL = 'src/core/input.js';
const JOYCON_HELPERS = String.raw`
// Chromium's native Gamepad.id includes these Nintendo vendor/product fields.
// Its standard-mapped standalone Joy-Con shape is 17 buttons and 2 axes.
const INKWAVE_JOYCON_BUTTON_COUNT = 17;
const INKWAVE_JOYCON_AXIS_COUNT = 2;
const INKWAVE_JOYCON_L_ID = /Vendor:\s*057e\s+Product:\s*2006\b/i;
const INKWAVE_JOYCON_R_ID = /Vendor:\s*057e\s+Product:\s*2007\b/i;
function inkwaveIsJoyCon(pad, side) {
  const id = side === 'L' ? INKWAVE_JOYCON_L_ID : INKWAVE_JOYCON_R_ID;
  return !!pad && pad.connected === true && pad.mapping === 'standard' && Number.isInteger(pad.index) &&
    typeof pad.id === 'string' && id.test(pad.id) &&
    pad.axes?.length === INKWAVE_JOYCON_AXIS_COUNT && pad.buttons?.length === INKWAVE_JOYCON_BUTTON_COUNT;
}
function inkwaveJoyConButton(pad, index) {
  const source = pad.buttons?.[index];
  if (!source) return { pressed: false, touched: false, value: 0 };
  const value = Number.isFinite(source.value) ? source.value : (source.pressed ? 1 : 0);
  return { pressed: !!source.pressed, touched: !!source.touched, value };
}
function inkwaveJoyConPair(left, right) {
  const buttons = Array.from({ length: Math.max(22, left.buttons.length, right.buttons.length) },
    () => ({ pressed: false, touched: false, value: 0 }));
  const copy = (source, from, to) => { buttons[to] = inkwaveJoyConButton(source, from); };

  // Chromium maps an individual Joy-Con into the horizontal Standard Gamepad layout.
  // Restore the vertical two-handed grip positions before exposing one standard pad.
  for (const [from, to] of [[0, 14], [1, 13], [2, 12], [3, 15], [8, 4], [9, 8], [10, 10], [16, 17], [6, 6], [4, 18], [5, 19]]) copy(left, from, to);
  for (const [from, to] of [[2, 0], [0, 1], [3, 2], [1, 3], [8, 5], [7, 7], [9, 9], [10, 11], [16, 16], [4, 20], [5, 21]]) copy(right, from, to);

  const axis = (pad, index) => Number.isFinite(pad.axes[index]) ? pad.axes[index] : 0;
  return {
    index: left.index,
    id: 'INKWAVE paired Joy-Con L[' + left.index + ':' + left.id + '] R[' + right.index + ':' + right.id + ']',
    connected: true,
    mapping: 'standard',
    // Undo Chromium's documented horizontal rotation for each standalone Joy-Con.
    axes: [-axis(left, 1), axis(left, 0), axis(right, 1), -axis(right, 0)],
    buttons,
    timestamp: Math.max(Number.isFinite(left.timestamp) ? left.timestamp : 0, Number.isFinite(right.timestamp) ? right.timestamp : 0),
    vibrationActuator: left.vibrationActuator || right.vibrationActuator || null,
    _inkwaveJoyconPair: true,
    _inkwaveJoyconIndices: [left.index, right.index],
  };
}
`;

const SELECT_PAD = `    let pad = null;
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') { pad = p; break; }
    if (!pad) for (const p of pads) if (p && p.connected) { pad = p; break; }`;
const SELECT_PAD_COMPOSED = `    const connectedPads = [];
    for (const p of pads) if (p && p.connected) connectedPads.push(p);
    const leftPads = connectedPads.filter(p => inkwaveIsJoyCon(p, 'L'));
    const rightPads = connectedPads.filter(p => inkwaveIsJoyCon(p, 'R'));
    const standardPad = connectedPads.find(p => p.mapping === 'standard' && !inkwaveIsJoyCon(p, 'L') && !inkwaveIsJoyCon(p, 'R'));
    let pad = null;
    if (standardPad) pad = standardPad;
    else if (leftPads.length === 1 && rightPads.length === 1 && leftPads[0].index !== rightPads[0].index) {
      pad = inkwaveJoyConPair(leftPads[0], rightPads[0]);
    } else {
      for (const p of connectedPads) if (p.mapping === 'standard') { pad = p; break; }
      if (!pad) pad = connectedPads[0] || null;
    }`;

export function adaptJoyConPair(rel, code) {
  if (rel !== INPUT_REL) return code;
  code = replaceOnce(code, 'export class Input {', JOYCON_HELPERS + '\nexport class Input {', 'known split Joy-Con identity and standard layout');
  return replaceOnce(code, SELECT_PAD, SELECT_PAD_COMPOSED, 'compatible left/right Joy-Con composition');
}
