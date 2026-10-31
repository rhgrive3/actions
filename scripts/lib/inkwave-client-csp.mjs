// Browser-enforced, static-document CSP for the published game.
// Do not use 'strict-dynamic' here: trusted modules must not bless arbitrary
// third-party <script> nodes inserted after game startup.
import { createHash } from 'node:crypto';

const INLINE_SCRIPTS = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const META_CSP = /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content="([^"]+)"\s*\/?\s*>/i;

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
  const policy = clientScriptPolicy(html);
  const secured = html.replace(/<head(?:\s[^>]*)?>/i,
    tag => tag + '\n<meta http-equiv="Content-Security-Policy" content="' + policy + '">');
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
