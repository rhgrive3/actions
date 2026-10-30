# Additional distinct frontend screenshot states

QA-only supplement to PR1931. Fixed product: `379533f541d86346a068e397f879cb6c13590ffd`; no product modifications or main merge intended.

CSS viewport/DPR1: phone390x844,844x390; iPad mini744x1133,1133x744. Chromium emulation, not physical-device/Safari certification.

- Editor batch (4 sizes,5 images each): actual touch layout editor via Settings; native stick selector and expanded X/Y position disclosure; synthetic storage-save failure (only touch-layout key, restored immediately); Cancel restores prior layout; first press of settings reset confirmation (not accepted). No layout or settings persistence requested.
- Variant batch (4 sizes,20 images each): repository offline menu fixture; code entry, held connecting Promise, six local API error outcomes; six synthetic loss/failed results; online guest/host results plus leave confirmation; online pause plus leave confirmation; connection-loss handler. None are proof of a real online room, connection or match result. No real room is created/joined.
- Battle batch (2 landscape sizes,4 images each): actual local Turf bot match started through existing API,20 simulated seconds, source-supported autopilot. HUD,pause,unaccepted quit confirmation,actual final result. No injected winner/result/time. Portrait remains the existing rotate-to-landscape prompt already captured, not forcibly bypassed.

Only loopback GET/HEAD HTTP requests are permitted and WebSockets are disabled in the isolated browser context. Product files, CSS and capture pixels are not rewritten. Every output is a native browser JPEG quality80 with bytes,SHA256,SOF dimensions and scope metadata.2.5MiB job-log transport budget; every original also stays in the artifact even if omitted from log transport.

This closes distinct-state omissions, not every weapon,slider,text value,language,device/browser or live-network permutation. Scroll-range coverage belongs to the separate gap QA. Any timeout/missing state remains explicit and keeps its manifest incomplete.
