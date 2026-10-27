# Additive Hissen first-birth QA candidate

Base: `8bcc34ac3d9d4713e45490bce1778d1c6d588be2`; separate future-head QA branch. No shipping runtime, pose, scale, material, visibility or size change. No browser was attempted here, no manual CI was launched and no current frozen publication was changed. **This is not Hissen size/morphology completion or ordinary-input acceptance.**

## Inspected capture coverage

| Existing automatic evidence | Actual scenario / files | Hissen applicability |
|---|---|---|
| Motion catalog,27 scenarios | `dualies-roll-lock-interrupt-native.json`, `dualies-roll-lock-interrupt-110.png` etc; rig-focused orthographic render/hidden-rig pairs | Real Dualies action/rig evidence, not per-projectile silhouette or projection measurements. No Hissen scenario. |
| Charger in motion catalog | `native-storm-deploy-native.json`; Charger switch during `lifecycle-interruptions` | Storm/switch presentation, not a Charger main charge/shot-radius capture. |
| Separate52 projectile views | `slosher9__F5__side.png`, `slosher9__F15__front.png`, `floor-slosher9…`, `floor-washtub…` in `projectile-capture-after-H` | `visualSetup` selects native **Bucket** `slosher`, not Hissen. Other cases are Shooter/Roller/Explosher, not Charger or Dualies. Existing result has camera pose/FOV, focus/source-radius bounds, projected centers, physical traces and hashed crops—but no Hissen pixels. |

These files and the52-view workflow remain unchanged by this candidate. Therefore the currently frozen head's forthcoming artifacts cannot silently close Hissen main-size comparison.

## Existing own pixels inspected

The already tracked historical own image `reports/tri-slosher-floor-main7e-20261023/native-after/sim18.png` was read from its local Git object and inspected. SHA-256 `3193f9c925274c2a96d6a978e94999f7fc57503ba795e90516bc1f9f39c0c7a2` matches its saved receipt. Its companion `native-browser.json` records full camera matrices/projection, settings/style/gear, physical unit/index/seed/age/position traces and four floor-child matrices.

It is an old controlled native-frame capture at content `2042ffbb…`, **not current-head browser proof**. The screenshot is18 ticks after Fire press, but its leading main is only6F old and side units2/3 are3F old. Their recorded centers project to approximately(418.16,413.86)/(521.19,414.10) at960×640. Visible-wing diagnostic color regions measure at least48×71 and86×83 pixels, but touch their diagnostic ROI/character occlusion limits; they are not complete lobe dimensions or a valid rescale target.

The separately viewed existing private reference shows broad perforated main sheets, but its individual lobe birth/depth/camera/version/gear are not established. Its partial frame570 upper-volley width199px cannot be equated to one own lobe. No original-game media, private URL, copied screenshot or new multiplier is added here.

## New opt-in observation

Executable route, from the source checkout with its immutable site:

```sh
node scripts/check-inkwave-trislosher-native-matched.mjs <site> <new-evidence-directory> --measure-main
```

The existing trusted menu entry is followed by the **inherited controlled replay**: debug freeze/step, actor placement, camera setup, seeded RNG and explicit time reset. None is relabeled ordinary-input firing. The new observer itself delegates native volume submissions once and only reads the resulting visible-flag/count-admitted slots; it never hides a lobe, rewrites an instance, resizes a body or changes budgets/physics.

- Detect the first active admitted Hissen main record, retaining its observed tick/seed/unit/index/age; pending/delayed records cannot become the time origin.
- Capture5/7/9 fixed native ticks after that observation, bounded to120 ticks if no birth arrives. The single controlled Fire hold is released after first observed birth.
- Keep the real game renderer and actual current volume/LOD selection. Await only already existing native asset requests; this is not cold-first-shot readiness evidence.
- Read actual opaque/fringe mesh slot ranges, per-source unit/index/seed/age/position, instance/world matrices, indexed geometry and screen projection, camera matrix/FOV/aspect, loaded assets and native budget metrics.
- Label projected indexed bounds as a **geometry envelope, not alpha/depth-tested visible pixel silhouette**. No hidden-object difference image is produced. Actual PNG inspection is still required to measure visible lobe pixels and occlusion.
- Hash the raw PNGs and manifest/artifacts, record actual Git checkout/harness/observer identity, and require time/main/drop/camera state unchanged across each screenshot. Restore observer wrappers before closing.

Output files are `native-browser.json` and `main-birth-f05.png`, `main-birth-f07.png`, `main-birth-f09.png`. Each frame links its PNG digest to physical traces and `mainObservation.draws`. The default invocation without the flag keeps the historical absolute18F/release12 contract and `sim18.png` naming; an executed scheduling regression protects that path.

## Automatic future-head route

One additive step follows the unchanged full motion catalog in the existing `validate-inkwave-update.yml` **catalog** browser lane. It runs the observer unit tests and the opt-in command against the same `.built-site/_site`, writing `$CI_STORAGE/evidence/hissen-main/`. Existing normal PR triggers and artifact upload are reused; no new dispatch, workflow, current-head rerun or replacement of52 views is introduced.

A successful future normal catalog job must include `hissen-main/native-browser.json` in its exact-head `ci-result.json` checks, with matching manifest content and `sourceIdentity.checkoutSha == SOURCE_SHA`. Inspect artifact `inkwave-browser-catalog-H`, folder `hissen-main/`, for the PNGs and full result. The inherited offload/job-selection policy is unchanged: a skipped catalog lane is **not** Hissen evidence.

Then use each draw's unit/seed/age, actual selected mesh and camera projection to locate that lobe in its PNG and compare corresponding private reference phases. An accepted size correction still needs a stable measured discrepancy after phase/depth/camera/occlusion controls. No such correction is asserted by this QA change.

## Local verification and remaining gate

`local-tests.txt` records **83/83** relevant source/CI/workflow tests, including **14** new controlled observer/scheduling tests; zero failures/skips. Native Three geometry is used for projection checks, but the submission owner is inert and no GPU/browser ran. Syntax checks, YAML parsing and `git diff --check` pass. Shipping source/build hooks and the separate52-view workflow are byte-for-byte unchanged from the base.

First actual browser execution of the new opt-in route remains pending future reviewed automatic CI. Source tests do not establish new PNGs, ordinary-input gameplay, retail timing, Hissen main-size agreement or floor-child morphology.

Observer cleanup follow-up: the first QA candidate restored function references by assignment, which could leave own shadows for originally inherited native methods. The follow-up preserves original own descriptors exactly or deletes temporary own shadows, refuses unrelated replacement ownership, and rejects read-only own methods before any partial installation. New tests cover prototype methods, nondefault own descriptors and replacement/read-only controls. The original candidate commit remains immutable; its previous review does not stand in for review of this fix.
