# Collision revision producer contract

Base: `90bb98c2ffbbe0fdaf959001808d6dd43e085f90` (combined INKWAVE batch).
This change owns collision producers only; it does not install a reticle cache.

The production-composed `Level` initializes `collisionRevision` to a nonnegative
safe integer. `_addBlock()` advances it when a block is appended; `_buildHash()`
also advances it conservatively when the collision index is rebuilt. The
`NativeLevel` constructor inherits these hooks, including the final hash build
after it installs the source triangle world and static block table.

`RankedWorld` advances the level's revision after a changed Tower deck/pole
transform and bounds are coherent, and after disposal removes those colliders
or makes retained colliders non-solid. An unchanged transform, duplicate
dispose, raycast, ground query, paint update and query stamp do not advance it.
The added work is constant per mutation: no per-frame static-geometry scan.

Consumers may reuse only with the same owning world and a valid, unchanged
`Number.isSafeInteger(level.collisionRevision) && level.collisionRevision >= 0`.
They must still bind launch state, query owner/functions and `triangleWorld`
identity. `markCollisionChanged()` does not certify an unversioned object; an
invalid/exhausted revision becomes `undefined` instead of wrapping. Unknown
worlds and the separate Tacticooler collision view remain unversioned and need
conservative consumer admission. This signal covers the audited production
Level/NativeLevel block writers and ranked Tower, not arbitrary external writes
into public block/triangle buffers. Such writers must explicitly call
`markCollisionChanged()` or rebuild the collision index. No existing writer
was found that edits the static triangle arrays in place.

Writer audit: `inkwave-public/src/world/level.js` owns construction, append and
hash rebuild. `patches/native-stages/runtime/native-level.mjs` installs immutable
static source data at construction. `patches/splatoon3/runtime/ranked/world.mjs`
owns Tower append, route indexing, in-place center/axes/AABB changes and
removal/solid-disable. Tacticooler uses its independent temporary view and is
outside the level's terrain sweep. Whole-world publication/release replaces
world identity; it does not mutate the retained collision arrays in place.

Open-PR overlap lookup was attempted with `gh pr list --repo rhgrive3/actions
--state open --limit 30 --json number,title,headRefName,files`; GitHub GraphQL
returned HTTP 403 (`Post https://api.github.com/graphql: Forbidden`). No
alternate API route was used. The narrow owned source paths were announced
before editing; reticle consumer files are unchanged.

## Verification

`node --experimental-vm-modules --test
patches/native-stages/tests/collision-revision-producers.test.mjs`: 6 passed,
0 failed, 0 skipped. Tests call actual Level/NativeLevel append/hash methods and
RankedWorld constructor/beforeActors/update/dispose, and verify physical hits
and removal using real Physics/NativePhysics. They never fake a revision to
make an invalidation assertion pass. A custom unversioned world stays unknown.

Source and emitted checks are listed in `validation.json`. These are numerical
collision/lifecycle checks; they do not prove Nintendo UI behavior, original
visual agreement, a device FPS improvement or complete reticle acceptance.

The adapter preserves the immutable `inkwave-public/` snapshot. No media,
workflow, input, character model or reticle UI changes are included.
