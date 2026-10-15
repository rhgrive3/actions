Native-world cancellation component diagnostic

Exact candidate efbdf888a9009d6024f39fa36ce359e775a3c799 versus native-world from parent 2b8bcb13df53158d78e3b5ff0dc82d49448ecdb6. Only source files and pinned Three are served; no production stage assets or full build.

Real software WebGL via Chromium SwiftShader: compileAsync, framebuffer render/readback, native RAF delivery, dispose events. Synthetic PaintSystem uses one plane/8x8 target, not production paint shaders. Level/physics/navigation/ink/display and UI dependencies are explicitly tiny controlled adapters. Compile/RAF completion is held at return boundaries; this does not measure native operation interruption.

Normal, shader-completion stale, RAF-delivery stale, and reentry are paired. Reentry checks identity and live resources of the newer world before releasing it. Resource counts reflect explicit disposal events, not GPU allocator or RSS reduction.

All page errors, console.error and failed requests are retained and must be absent through context closure. Failed partial results are saved before browser cleanup. Unknown resources and WebSockets are denied. No real-stage crash resolution, fullGame, hardware or iPad acceptance claim.
