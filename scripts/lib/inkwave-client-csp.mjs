// Browser-enforced, static-document CSP for the published game.
// Do not use 'strict-dynamic' here: trusted modules must not bless arbitrary
// third-party <script> nodes inserted after game startup.
import { createHash } from 'node:crypto';
import { inkwaveBrowserGuardScript } from './inkwave-browser-policy.mjs';

const INLINE_SCRIPTS = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const META_CSP = /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content="([^"]+)"\s*\/?\s*>/i;
// Keep the document's leading encoding declaration before the larger guard.
// HTML's encoding prescan only examines the first 1024 bytes.
const HEAD_PREFIX = /<head(?:\s[^>]*)?>\s*(?:<meta\s+charset\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)\s*>\s*)?/i;

export function clientScriptPolicy(html) {
  if (typeof html !== 'string' || !/<head(?:\s[^>]*)?>/i.test(html))
    throw new Error('INKWAVE CSP: expected an HTML document');
  const hashes = new Set();
  for (const match of html.matchAll(INLINE_SCRIPTS)) {
    const [, attributes, source] = match;
    if (/\bsrc\s*=/i.test(attributes) || !source.trim()) continue;
    const type = /\btype\s*=\s*(["'])([^"']+)\1/i.exec(attributes)?.[2]?.toLowerCase() || '';
    // Import maps participate in CSP too. Ignore inert JSON payloads.
    if (type && !['module', 'importmap', 'text/javascript', 'application/javascript'].includes(type)) continue;
    hashes.add("'sha256-" + createHash('sha256').update(source, 'utf8').digest('base64') + "'");
  }
  return [
    "script-src 'self' 'wasm-unsafe-eval'" + (hashes.size ? ' ' + [...hashes].join(' ') : ''),
    "script-src-attr 'none'",
    // KTX2/Three and other genuine game workers may be constructed from Blob URLs.
    "worker-src 'self' blob:",
    "object-src 'none'",
    // The versioned game uses an intentional relative <base> element.
    "base-uri 'self'",
  ].join('; ');
}

export function protectGameHtml(html) {
  if (META_CSP.test(html)) throw new Error('INKWAVE CSP: already installed');
  // Keep upstream index.html byte-identical to its compatibility lock. This
  // browser-dependent shortcut deterrent is inserted only into the built HTML.
  // It is not a security boundary: browser menus can always open DevTools.
  const shortcutScript = `<script>
window.addEventListener('keydown',event=>{
 const key=event.key.toLowerCase();
 const inspect=event.key==='F12'||
  ((event.ctrlKey||event.metaKey)&&event.shiftKey&&['i','j','c'].includes(key))||
  (event.metaKey&&event.altKey&&['i','j','c'].includes(key))||
  (event.ctrlKey&&!event.shiftKey&&key==='u');
 if(inspect){event.preventDefault();event.stopImmediatePropagation();}
},true);
</script>`;
  if (!html.includes('</body>')) throw new Error('INKWAVE CSP: missing body end');
  // This executes before the original import map and game entry, and its
  // exact contents join the CSP hash set below. The edge checks UA too.
  const guarded = html
    .replace('</body>', shortcutScript + '\n</body>')
    .replace(HEAD_PREFIX, prefix => prefix + '\n<script>' + inkwaveBrowserGuardScript() + '</script>');
  const policy = clientScriptPolicy(guarded);
  const secured = guarded.replace(HEAD_PREFIX,
    prefix => prefix + '\n<meta http-equiv="Content-Security-Policy" content="' + policy + '">');
  if (secured === html) throw new Error('INKWAVE CSP: missing head');
  return { html: secured, policy };
}

export function embeddedGameCsp(html) {
  const found = META_CSP.exec(html);
  if (!found) throw new Error('INKWAVE CSP: missing policy in built HTML');
  // Headers have a 2,000 character maximum line length on Cloudflare.
  if (found[1].length > 1800) throw new Error('INKWAVE CSP: header too long');
  return found[1];
}
