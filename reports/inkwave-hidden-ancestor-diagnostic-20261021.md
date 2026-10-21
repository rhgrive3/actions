# Focused hidden-ancestor diagnosis

Direct parent: PR1762 head 1f9b0c3ae9908e48fc51c2025aecbc6b259cb369.
PR1762 and PR1765 remain unchanged. No model, hair, animation, shader, gameplay, visibility, input, camera, threshold, or fallback changes.

## Evidence motivating this reproduction
PR1762 active job119399446044 failed at2026-10-21T19:37:38Z with flow-squid pixels0 after actual source readiness. Its source owner was ready/active/sameOwner, Player00/Sqd_Walk. CPU bounds were unavailable (unsupportedMeshes1), so no frustum or occlusion conclusion is justified.
Catalog job119399446000 failed at19:48:32Z on three empty collectors. Recorded swim frames had24 indexed meshes and12 locally visible but0 native-ancestor-visible meshes. This is not proof of malformed vertices.

## Diagnostic-only merge
Retains1762 readiness wait, owner/clip guards, CPU bounds and all old failure gates.
Integrates previously independently reviewed bounded catalog owner/ancestor diagnostics.
Adds the same read-only owner/model/kid/squid visibility, scale, form weights, active clip and known-role ancestor chains to failed detail frames.
Splits CPU unsupported counts into instanced, missing index and missing native vertex API. These counters can overlap for one mesh; they are not accepted geometry or draw totals.
No arbitrary object names are copied. At most2 unique ancestor chains of8 roles and4 human clips per row; stdout rows use a7000 ASCII byte budget plus fixed envelope below8KiB. Existing full stdout is not claimed bounded.

## Execution
One push-only dedicated branch job runs the existing detail and catalog scripts. The catalog step still runs after a detail failure, and either failed capture keeps the job failed. No broad PR workflow is deliberately triggered; no PR is opened yet.
Git parent/head and an8-path QA allowlist are checked before the build.
27 test bodies (11 readiness/bounds plus16 summaries) passed limited pure V8 execution. Actual Node/browser validation remains pending.
Not merged; this is diagnosis, not visual correction or accepted blank output.
