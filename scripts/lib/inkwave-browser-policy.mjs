// Best-effort browser-family allowlist shared by the Cloudflare edge and the
// build-time HTML startup guard. UA / standalone flags are client assertions;
// neither is a secure browser attestation or an anti-bot authentication factor.
export function classifyInkwaveBrowser(userAgent) {
  if (typeof userAgent !== 'string' || userAgent.length < 20 || userAgent.length > 4096)
    return 'blocked';
  // Most Chromium-derived browsers include Chrome/ or Safari/ as compatibility
  // tokens. Exclude their own identifying tokens before accepting those.
  if (/(?:\b(?:Edg(?:e|A|iOS)?|OPR|OPiOS|Opera|Firefox|FxiOS|SamsungBrowser|UCBrowser|DuckDuckGo|YaBrowser|Vivaldi|MiuiBrowser|Puffin|GSA|FBAN|FBAV|Instagram|MicroMessenger|Line|Chromium|Silk|Whale|Focus|CriOSWebView)\/|\b(?:FB_IAB|wv)\b)/i.test(userAgent))
    return 'blocked';
  // Chrome PWA carries a Chrome UA; iOS Chrome uses CriOS. Accept HeadlessChrome
  // for automated browser regression suites; bots must be addressed separately.
  if (/\b(?:Chrome|CriOS|HeadlessChrome)\/\d+/i.test(userAgent))
    return 'chrome';
  // Real Safari has both Version/ and Safari/ along with AppleWebKit.
  if (/\bAppleWebKit\/[\d.]+/i.test(userAgent) &&
      /\bVersion\/\d+/i.test(userAgent) && /\bSafari\/[\d.]+/i.test(userAgent))
    return 'safari';
  // iOS home-screen web apps can expose only the WebKit + Mobile/ tokens.
  // Ordinary WKWebView hosts look identical at HTTP level: the client startup
  // guard requires an actual standalone display mode before running the game.
  if (/\bAppleWebKit\/[\d.]+/i.test(userAgent) &&
      /\bMobile\/[A-Za-z0-9]+/i.test(userAgent) &&
      /\b(?:iPhone|iPad|iPod|Macintosh)\b/i.test(userAgent) &&
      !/\b(?:Safari|Version|Chrome|CriOS)\//i.test(userAgent))
    return 'ios-webapp-candidate';
  return 'blocked';
}

export function inkwaveBrowserPermitted(userAgent, standalone = false) {
  const type = classifyInkwaveBrowser(userAgent);
  return type === 'safari' || type === 'chrome' ||
    (type === 'ios-webapp-candidate' && standalone === true);
}

export const INKWAVE_UNSUPPORTED_BROWSER_HTML = '<!doctype html><html lang="ja"><head>' +
  '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>INKWAVE 対応ブラウザ</title>' +
  '<style>body{margin:0;min-height:100vh;background:#101525;color:#fff;' +
  'font:16px/1.65 system-ui,sans-serif;display:grid;place-items:center}' +
  'main{max-width:520px;padding:32px;text-align:center}' +
  'h1{font-size:24px}p{color:#dde2f4}</style></head><body><main>' +
  '<h1>このブラウザでは起動できません</h1>' +
  '<p>Safari・Google Chrome、またはホーム画面に追加した対応Webアプリから開いてください。</p>' +
  '</main></body></html>';

// Inject before the import map and the game entry. Its contents are hashed by
// the existing CSP generator; it does not run every frame. The document.write
// fallback intentionally replaces the pending document before scripts execute.
export function inkwaveBrowserGuardScript() {
  return '(function(){' +
    'const classify=' + classifyInkwaveBrowser.toString() + ';' +
    'const mode=classify(navigator.userAgent);' +
    'const standalone=navigator.standalone===true||' +
    '(typeof matchMedia==="function"&&matchMedia("(display-mode: standalone)").matches);' +
    'if(mode==="safari"||mode==="chrome"||' +
    '(mode==="ios-webapp-candidate"&&standalone))return;' +
    'document.open();document.write(' + JSON.stringify(INKWAVE_UNSUPPORTED_BROWSER_HTML) + ');' +
    'document.close();if(typeof window.stop==="function")window.stop();' +
  '})();';
}
