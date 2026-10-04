// Depends on the shared standard-controller mapping/reset owner in controls-adapter.
import { replaceOnce } from './input-adapter.mjs';
export function adaptNavigation(rel, code) {
  const patch=(before,after,label)=>{code=replaceOnce(code,before,after,'navigation: '+label);};
  if(rel==='src/game/player.js') {
    patch('    if (!this.enabled) {', `    if (!this.enabled) {
      this.padJumpTarget = null; this.padJumpIndex = -1;
      inp.mobile?.pressed?.delete('cameraReset');`, 'disabled navigation edges');
    patch('    // ---- move (camera relative)', `    if (touch?.wasPressed('cameraReset')) { this.resetCamera(); touch.pressed.delete('cameraReset'); }
    // ---- move (camera relative)`, 'shared touch reset');
    patch('    // super jump: while the map is open,', `    this.updatePadMapSelection(standardPad && usingPad);
    // super jump: while the map is open,`, 'map selection owner');
    for(const i of [14,12,15,13])patch(`inp.padPressed.has(${i})`, `(!standardPad && inp.padPressed.has(${i}))`, 'legacy raw d-pad '+i);
    patch('    this.input.mobile?.gyro?.resync?.();', `    this.assist.prevValid = false;
    if (this.input.mobile) this.input.mobile.lookDX = this.input.mobile.lookDY = 0;
    this.input.mobile?.gyro?.discard?.();
    this.input.mobile?.gyro?.resync?.();`, 'reset discards prior look and tracking');
    patch('  // One camera-reset owner:', `  updatePadMapSelection(standardPad) {
    const inp = this.input, a = this.a;
    if (!this.mapHeld || !standardPad) { this.padJumpTarget = null; this.padJumpIndex = -1; return; }
    const allies = G.actors.filter(o => o.team === a.team && o !== a);
    let selected = false;
    // W3C standard positions: D-pad left/up/right/down, right face = Nintendo A.
    const directions = [14, 12, 15, 13], confirm = 1;
    for (let i = 0; i < directions.length; i++) if (inp.padPressed.has(directions[i])) {
      this.padJumpTarget = i === 3 ? { spawn: true } : { actor: allies[i] || null };
      selected = true; inp.padPressed.delete(directions[i]);
    }
    const target = this.padJumpTarget;
    this.padJumpIndex = target?.spawn ? 3 : target?.actor ? allies.indexOf(target.actor) : -1;
    const accepted = inp.padPressed.has(confirm) || (selected && inp.padButton(confirm));
    if (!accepted) return;
    inp.padPressed.delete(confirm);
    if (!a.canSuperJump() || !target || this.padJumpIndex < 0) return;
    const destination = target.spawn ? G.level.spawnPads?.[a.team]?.clone() : target.actor;
    if (!destination || (!target.spawn && (!destination.alive || destination.superJumpState))) return;
    if (a.superJump(destination)) {
      this.padMapOpen = false; this.mapHeld = false;
      this.padJumpTarget = null; this.padJumpIndex = -1;
    }
  }

  // One camera-reset owner:`, 'selected target identity and confirmation');
  }
  if(rel==='src/core/mobile.js') {
    patch('  gyro:    {', "  cameraReset: { ax: 'r', ay: 't', dx: 0.33, dy: 0.08, d: 0.10, label: 'Camera reset', press: true },\n  gyro:    {", 'reset control');
    patch("const ORDER = ['stick', 'map', 'gyro', 'pause',", "const ORDER = ['stick', 'map', 'cameraReset', 'gyro', 'pause',", 'reset layout order');
    patch("['fire', 'squid', 'jump', 'sub', 'special', 'map', 'gyro', 'pause'].map", "['fire', 'squid', 'jump', 'sub', 'special', 'map', 'cameraReset', 'gyro', 'pause'].map", 'reset button markup');
    patch("for (const id of ['fire', 'jump', 'stick', 'squid', 'sub', 'special', 'map', 'gyro', 'pause'])", "for (const id of ['fire', 'jump', 'stick', 'squid', 'sub', 'special', 'map', 'cameraReset', 'gyro', 'pause'])", 'reset editor option');
    // Both the native labels and the appended layout editor have these entries.
    for(const [before,after]of [["gyro: 'ジャイロ', pause:","cameraReset: 'カメラリセット', gyro: 'ジャイロ', pause:"],["gyro: 'Gyro', pause:","cameraReset: 'Camera reset', gyro: 'Gyro', pause:"]]) {
      if(code.split(before).length!==3)throw Error('Navigation reset labels require native and layout entries');
      code=code.split(before).join(after);
    }
    patch("const GYRO_ICON =", `const CAMERA_RESET_ICON = '<svg class="iw-ico" viewBox="0 0 64 64" aria-hidden="true"><path d="M49 22 A22 22 0 1 0 52 40 M49 9 V24 H34" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="32" r="5" fill="currentColor"/></svg>';
const GYRO_ICON =`, 'reset icon');
    patch("id === 'gyro' ? GYRO_ICON : PAUSE_ICON", "id === 'cameraReset' ? CAMERA_RESET_ICON : id === 'gyro' ? GYRO_ICON : PAUSE_ICON", 'reset icon dispatch');
    patch("      if (id === 'gyro') this._toggleGyroFromTap();", "      if (id === 'gyro') this._toggleGyroFromTap();\n      if (id === 'cameraReset') this.pressed.add('cameraReset');", 'reset edge');
  }
  if(rel==='src/ui/hud.js') {
    patch('    const inp = G.input;\n    if (M.open && inp && inp.locked) {', `    const inp = G.input;
    const padChoice = M.open && inp?.lastDevice === 'pad' && inp.pad?.mapping === 'standard';
    if (L.padChoice && !padChoice) M.hover = -1;
    if (padChoice) M.hover = G.match?.controller?.padJumpIndex ?? -1;
    if (L.padChoice !== padChoice) {
      L.padChoice = padChoice;
      const foot = this.mapLegend.querySelector('.iw-lg__foot');
      if (foot) foot.innerHTML = padChoice
        ? (document.documentElement.lang === 'ja' ? '十字キーで選択 · 右のAボタンで確定 · Xで閉じる' : 'D-pad selects · right face A confirms · X closes')
        : richText('Press [1] – [4] or click · release [TAB] to cancel');
    }
    if (M.open && inp && inp.locked && !padChoice) {`, 'selected beacon highlight');
    patch("if (M.open !== L.curOn) { L.curOn = M.open; this.mapCursor.classList.toggle('is-on', !!(M.open && inp && inp.locked)); }", "const cursorOn = !!(M.open && inp && inp.locked && !padChoice);\n    if (cursorOn !== L.curOn) { L.curOn = cursorOn; this.mapCursor.classList.toggle('is-on', cursorOn); }", 'pad selection hides mouse cursor');
  }
  if(rel==='src/ui/menus.js') {
    patch("    if (mode === 'pad' && standardPad) rows.push(['Camera reset', null, '', T('Left face · Y on Nintendo'), '']);", "    if (mode === 'pad' && standardPad) {\n      rows.push(['Camera reset', null, '', T('Left face · Y on Nintendo'), '']);\n      rows.push(['Super Jump', null, '', T('D-pad selects · right face A confirms'), '']);\n    }\n    if (mode === 'touch') rows.push(['Camera reset', null, '', '', T('Camera reset button')]);", 'navigation guide');
  }
  return code;
}
