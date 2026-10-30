// Build-only online entry ownership. No clipboard I/O, relay, geometry or theme
// changes: this only retires stale reads when a newer user action owns entry.
export function adaptOnlineAsyncEntry(rel, code) {
  if (rel !== 'src/ui/menus.js') return code;
  const start = code.indexOf('  _scr_online() {');
  const end = code.indexOf('  // ================================================================ SCREEN: lobby', start);
  if (start < 0 || end < 0) throw new Error('online async entry: screen anchors missing');
  let online = code.slice(start, end);
  if (online.includes('clipboardRevision')) throw new Error('online async entry: repeated transform');
  const once = (before, after, label) => {
    if (online.split(before).length !== 2) throw new Error('online async entry: expected one ' + label);
    online = online.replace(before, after);
  };
  once('    const nameRow = this._nameRow();', '    const nameRow = this._nameRow();\n    nameRow._input.addEventListener(\'focus\', () => { st.clipboardRevision++; clearTimeout(st.autoT); });', 'name edit ownership');
  once("input: 'kbm', alive: true, errT: 0", "input: 'kbm', alive: true, errT: 0, clipboardRevision: 0", 'state');
  once("    const exitEntry = () => { clearError();", "    const exitEntry = () => { st.clipboardRevision++; clearTimeout(st.autoT); clearError();", 'entry cancellation');
  for (const name of ['type = (c)', 'backspace = ()']) {
    once(`    const ${name} => {\n      if (st.busy) return;`, `    const ${name} => {\n      if (st.busy) return;\n      st.clipboardRevision++;`, name);
  }
  once('    const type = (c) => {\n      if (st.busy) return;\n      st.clipboardRevision++;', '    const type = (c) => {\n      if (st.busy) return;\n      st.clipboardRevision++;\n      clearTimeout(st.autoT);', 'new keyboard timer ownership');
  once('    const cycle = (d) => {\n      clearError();', '    const cycle = (d) => {\n      st.clipboardRevision++;\n      clearTimeout(st.autoT);\n      clearError();', 'pad edit');
  once('    const padAccept = () => {', '    const padAccept = () => {\n      st.clipboardRevision++;\n      clearTimeout(st.autoT);', 'pad confirm');
  once('    const pasteCode = (text, autoJoin = true) => {', '    const pasteCode = (text, autoJoin = true) => {\n      if (st.busy) return;\n      st.clipboardRevision++;\n      clearTimeout(st.autoT);', 'paste ownership');
  once('    const readClipboard = () => {', '    const readClipboard = () => {\n      if (st.busy) return;\n      clearTimeout(st.autoT);\n      const revision = ++st.clipboardRevision;\n      const ownsEntry = () => st.alive && !st.busy && revision === st.clipboardRevision;', 'clipboard request generation');
  once('if (st.alive && !st.busy) pasteCode(text, !touchEntry);', 'if (ownsEntry()) pasteCode(text, !touchEntry);', 'clipboard success');
  once('if (st.alive && !st.busy) fallback();', 'if (ownsEntry()) fallback();', 'clipboard rejection');
  for (const name of ['doJoin', 'doCreate']) {
    once(`    const ${name} = async () => {\n      if (st.busy) return;`, `    const ${name} = async () => {\n      if (st.busy) return;\n      st.clipboardRevision++;`, name + ' ownership');
  }
  once('    const doCreate = async () => {\n      if (st.busy) return;\n      st.clipboardRevision++;', '    const doCreate = async () => {\n      if (st.busy) return;\n      st.clipboardRevision++;\n      clearTimeout(st.autoT);', 'create timer ownership');
  once('    const cancelConnect = () => {\n      st.token++;', '    const cancelConnect = () => {\n      st.clipboardRevision++;\n      st.token++;', 'connect cancellation');
  once("    codeInput.addEventListener('input', () => {\n      if (st.busy) return;", "    codeInput.addEventListener('input', () => {\n      if (st.busy) return;\n      st.clipboardRevision++;", 'native edit');
  once("if (k === 'Delete') { st.code[st.caret] = '';", "if (k === 'Delete') { st.clipboardRevision++; st.code[st.caret] = '';", 'keyboard delete');
  once("if (dir === 'alt') { st.code = ['', '', '', '', ''];", "if (dir === 'alt') { st.clipboardRevision++; st.code = ['', '', '', '', ''];", 'controller clear');
  return code.slice(0, start) + online + code.slice(end);
}
