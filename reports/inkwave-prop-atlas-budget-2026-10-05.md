# INKWAVE #516: constrained prop atlas budget

Baseline83d6b088246f760a34d0921c118482bca7cde777. Native PropKit allocated a2048-square CanvasTexture at all quality tiers. The presentation adapter uses a1024-square source for LOW or actual touch-mobile state, retaining2048 for unconstrained desktop. This is an INKWAVE resource policy, not a sourced Nintendo resolution.

Atlas regions and UV normalization retain their2048 logical coordinate space. Every redraw saves/restores Canvas2D state and sets the current raster/logical transform, including font-ready redraws, so scale cannot compound. No second2048 source is retained. The original canvas remains the texture image for context restoration. Native materials continue using the same texture object.

On build/update after a quality or touch-state change, native Texture.dispose retires the old GPU allocation; the same canvas is resized/redrawn and native Three recreates the texture on upload. Repeated unchanged frames have no resize/disposal. The existing disposed/font callback guard prevents resurrection and teardown drops the extra redraw closure. Geometry, collisions, seed, detail policy and gameplay values are unchanged. The adapter composes with #526 and with the pending #493 PropKit clear/detail/rebuild path.

Focused native tests cover low/touch/desktop dimensions, raw negative control, repeated draw transforms, font-ready behavior, high→low→high→touch handoff, disposal events and stable material bindings, headless path and native geometry/UV/collider parity. Parent completed the source after the external lane stalled for15min with no tracked code; its reasoning remains preserved as handoff evidence.

Pixel dimensions/disposal events establish structural budgets. They do not measure Safari/native-device heap/GPU bytes, power, heat, Nintendo pixel fidelity or physical readability. Built Chromium GPU upload/context-restoration evidence and canonical CI are recorded separately at the final batch head.
