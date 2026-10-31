# INKWAVE browser CSP and bot entry gate

This release protection is not DRM. Browser F12/DevTools and the ability to save
received JavaScript cannot be fully disabled.

## Script policy

The production build adds a CSP meta tag before any game script. SHA-256 hashes
authorize the existing inline boot scripts and import map. Same-origin scripts,
including the game's dynamic imports, remain allowed. Third-party script
injection, arbitrary inline scripts and eval are refused. Blob-backed Workers
remain permitted via worker-src, without allowing blob scripts globally.

The Cloudflare production build duplicates the policy in an HTTP CSP header.
GitHub Pages uses the HTML meta policy because repository-defined response
headers are not available there. Cosmetic F12/Ctrl+Shift+I/Ctrl+U keyboard
interception does not prevent opening DevTools via browser menus.

## Safari, Chrome, Microsoft Edge, installed WebApp only

The Cloudflare site now defaults to BROWSER_ALLOWLIST_ENABLED = "true".
Requests for static game files are checked **before** the optional Turnstile
challenge. The production HTML has a separate CSP-hashed startup guard, so
GitHub Pages also displays a browser-unsupported screen instead of starting
the game on known unsupported browsers.

Permitted:
- Safari on macOS, iOS and iPadOS.
- Google Chrome on Windows, macOS, Linux and Android; CriOS on iOS/iPadOS.
- Microsoft Edge on Windows, macOS, Linux, Android (EdgA) and iOS/iPadOS
  (EdgiOS); installed Edge WebApps are permitted too.
- Installed Safari/Chrome/Edge PWAs. An iOS home-screen WebApp can omit the Safari
  token: the edge admits that WebKit Mobile UA candidate, but the startup
  guard requires navigator.standalone or display-mode: standalone.

Denied when identifiable: Firefox/FxiOS, Opera, Samsung Internet,
other distinctly branded browsers, embedded Android WebViews, identifiable
in-app browsers, unknown UAs and command-line clients without a suitable UA.
WebView apps on iOS can imitate standalone WebApps at HTTP level; the client
guard blocks ordinary non-standalone views.

Limitations: browser names/standalone flags are spoofable, and some Chromium
forks identify indistinguishably as Chrome. Do not use browser filtering as
authentication, copyright protection or bot detection. Separately validate
real iPad Home Screen and Android installed PWA flows, including Edge,
before public launch.
The Cloudflare filter applies to static game files, not /api/account/*.
A browser family policy cannot override local PWA caches already downloaded.

To temporarily revert the Cloudflare side for compatibility, set
BROWSER_ALLOWLIST_ENABLED = "false" and redeploy; the build-time startup guard
continues to apply to new HTML. Reverting both requires rebuilding without
the guard rather than modifying locked upstream game HTML.

## Enable bot gate on Cloudflare Workers (optional, initially OFF)

1. Create a Cloudflare Turnstile widget restricted to the production hostname.
   The verification action is inkwave_access.
2. Set the public TURNSTILE_SITE_KEY in account/wrangler.toml.
3. In the account directory, run:
   - npx wrangler secret put TURNSTILE_SECRET_KEY
   - npx wrangler secret put BOT_GATE_HMAC_KEY
   Use a randomly generated secret for the HMAC key, never a committed value.
4. Change BOT_GATE_ENABLED in account/wrangler.toml from false to true.
5. From the repo root: npm ci, npm run test:account, npm run build:prod.
   Then deploy the Cloudflare Worker once real-browser checks pass.
6. Configure Cloudflare WAF rate limiting for /__inkwave-access/verify.
   The Worker itself does not provide a distributed rate limiter.

The Worker checks all game asset paths, not just the homepage. Unverified
navigations redirect to the Turnstile page; unverified direct script URLs get
403. Server-side Siteverify must confirm success, hostname and action. An
HttpOnly, Secure, SameSite=Lax, 12-hour HMAC session cookie grants access.
Missing keys fail closed with 503. Account API routes remain separate.

All assets pass through the Worker, including when the gate is disabled.
Measure cold-start latency and Worker consumption. Cached PWA assets can
still work offline; the gate does not revoke already cached downloads.

## Required checks

Run node --test account/tests/site-protection.test.mjs, npm run test:account,
npm run build:prod and the production startup-budget check. On devices, verify
Three.js, KTX workers, WebGL shaders, audio worklets, dynamic imports,
gyro, multiplayer, signup and offline cache. Verify CSP rejects injected
external Eruda script tags while the legitimate modules still work.

Cloudflare gating is bypassed if GitHub Pages or another mirror continues
serving the same files publicly. The existing public GitHub source remains
available until the repository visibility and historical copies are separately
addressed. Authenticated visitors can still save all scripts they receive.
