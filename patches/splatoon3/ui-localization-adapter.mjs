import { parse } from '../loading-cache/vendor/acorn.mjs';

// Translate UI-owned text at its update site. A DOM observer would repeatedly
// scan the live HUD and could rewrite player names or chat messages.
export function adaptUiLocalization(rel, code) {
  if (rel === 'patches/splatoon3/bootstrap.mjs') {
    const anchor = "  await import('../../src/main.js');";
    if (!code.includes(anchor)) throw Error('Missing final content localization anchor');
    return "import { localizeGameContent } from './runtime/content-language.mjs';\n" + code.replace(anchor, '  localizeGameContent(context);\n' + anchor);
  }
  if (rel === 'src/i18n.js') {
    if (!code.includes('const JA = {')) throw Error('Missing Japanese dictionary anchor');
    const dictionary = parse(code,{ecmaVersion:'latest',sourceType:'module'}).body.find(node=>node.type==='VariableDeclaration'&&node.declarations[0]?.id.name==='JA').declarations[0].init;
    code = code.slice(0,dictionary.end-1)+'\n  ...UI_JA,\n'+code.slice(dictionary.end-1);
    code = code.replace('if (out == null && isJa) out = JA[s];', 'if (out == null) out = isJa ? JA[s] : UI_EN[s];');
    code = code.replace('if (!isJa) return s;\n  const v = JA[s];', 'if (!isJa) return UI_EN[s] ?? s;\n  const v = JA[s];');
    return "import { makeUiTranslator, UI_JA, UI_EN } from '../patches/splatoon3/runtime/ui-strings.mjs';\n" + code + '\nexport const tu = makeUiTranslator(t, JA, isJa);\n';
  }
  if (rel === 'src/ui/news.js') {
    // h() localises each literal text child; keep the bullet's separator out of its text so the text matches an entry.
    const bullet = "h('span', null, h('b', null, b), ` — ${t}`)";
    if (!code.includes(bullet)) throw Error('Missing update news bullet localization anchor');
    return code.replace(bullet, "h('span', null, h('b', null, b), ' — ', t)");
  }
  if (!/^src\/ui\/(menus|menu-art|hud|hud-boss|diorama)\.js$/.test(rel)) return code;
  if (rel === 'src/ui/menus.js' && code.includes('const TITLE_ADJ =')) {
    const title = 'return `${TITLE_ADJ[x % TITLE_ADJ.length]} ${TITLE_NOUN[(x >>> 8) % TITLE_NOUN.length]}`;';
    if (!code.includes(title)) throw Error('Missing authored splashtag localization anchor');
    code = code.replace(title, "return LANG === 'ja' ? tr(TITLE_ADJ[x % TITLE_ADJ.length]) + tr(TITLE_NOUN[(x >>> 8) % TITLE_NOUN.length]) : `${TITLE_ADJ[x % TITLE_ADJ.length]} ${TITLE_NOUN[(x >>> 8) % TITLE_NOUN.length]}`;");
    const errorToast = "this.toast(E ? `${E.title[0]}${E.title.slice(1).toLowerCase()} — ${E.text.split('.')[0]}.` : msg,";
    if (!code.includes(errorToast)) throw Error('Missing room error localization anchor');
    code = code.replace(errorToast, "this.toast(E ? `${tr(E.title)} — ${tr(E.text)}` : tr(msg),");
    code = code.replace('`${E.title} — ${E.text}`', '`${tr(E.title)} — ${tr(E.text)}`');
    code = code.replace("host ? host.name : 'The host'", "host ? host.name : tr('The host')");

  }
  const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' }), changes = [];
  const ownedValues = new Set(['hint','txt','E.title','E.text','m.blurb || \'\'','w.blurb || \'\'','sp.blurb || \'\'','info[v]?.text || \'\'','MOVE_LABELS[id] || id.toUpperCase()']);
  const ownedTargets = /^(?:hintEl|errTitle|errText|createStatus|statusTxt|botsNote|readySub|startSub|cap|blurb|blurbEl|spBlurb|kind|appearanceLabel)\.textContent$/;
  const translated = node => node?.type === 'CallExpression' && ['t','tr','tu'].includes(node.callee?.name);
  const hasEnglish = node => {
    if (!node || translated(node)) return false;
    if (node.type === 'Literal') return typeof node.value === 'string' && /[A-Za-z]/.test(node.value);
    if (node.type === 'TemplateLiteral') return node.quasis.some(q => /[A-Za-z]/.test(q.value.cooked || ''));
    if (node.type === 'BinaryExpression' && node.operator === '+') return hasEnglish(node.left) || hasEnglish(node.right);
    return false;
  };
  function wrap(node) { changes.push([node.start,node.end,'tu('+code.slice(node.start,node.end)+')']); }
  function text(node) {
    if (!node || translated(node)) return;
    if (node.type === 'ConditionalExpression') { text(node.consequent); text(node.alternate); }
    else if (node.type === 'LogicalExpression' && ['||','??'].includes(node.operator)) { text(node.left); text(node.right); }
    else if (hasEnglish(node)) wrap(node);
  }
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'AssignmentExpression' && node.operator === '=' && node.left.type === 'MemberExpression' && node.left.property.name === 'textContent') {
      const target=code.slice(node.left.start,node.left.end),value=code.slice(node.right.start,node.right.end);
      if (/style|Style/.test(target)) return;
      if (!translated(node.right) && (ownedTargets.test(target) || ownedValues.has(value))) wrap(node.right);
      else text(node.right);
      return;
    }
    if (node.type === 'CallExpression') {
      if (node.callee.type==='MemberExpression' && node.callee.property.name==='toast') text(node.arguments[0]);
      if (node.callee.name==='h') for (const arg of node.arguments.slice(2)) if (arg.type !== 'Literal') text(arg);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(ast);
  // A template may contain another UI call. Keep the outer edit only.
  const edits=changes.sort((a,b)=>a[0]-b[0]||b[1]-a[1]).filter((edit,i,all)=>!all.slice(0,i).some(prior=>prior[0]<=edit[0]&&prior[1]>=edit[1]));
  for (const [start,end,value] of edits.reverse()) code=code.slice(0,start)+value+code.slice(end);
  return edits.length ? "import { tu } from '../i18n.js';\n"+code : code;
}
