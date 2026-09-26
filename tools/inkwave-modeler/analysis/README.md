# INKWAVE modeler — face analysis toolkit

Scripts used for the face-matching pass (see `../docs/face-refinement/README.md`).
They render the modeler headlessly and compare it with the reference sheets.

## Setup (once)

```bash
pip install numpy pillow opencv-python-headless scipy matplotlib mediapipe
pip install torch --index-url https://download.pytorch.org/whl/cpu      # Sapiens only
apt-get install -y libegl1 libgles2                                     # MediaPipe on headless Linux
cd tools/inkwave-modeler/analysis
curl -sSLo three.min.js https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.min.js
curl -sSLo face_landmarker.task https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task
for v in front side back; do python3 -c "from PIL import Image; Image.open('../docs/face-refinement/refs/ref_$v.jpg').save('ref_${v}_hi.png')"; done
python3 -c "from PIL import Image; Image.open('../docs/face-refinement/refs/ref_three_quarter.jpg').save('ref_34_hi.png')"
cp ../INKWAVE_AI_MODELER_FINAL.html work.html
# Sapiens 1B normals (4.4 GB): huggingface facebook/sapiens-normal-1b-torchscript → export SAPIENS_PT=<path>
```

Playwright with the preinstalled Chromium (`/opt/node22/lib/node_modules/playwright`) is used by the `.mjs` scripts;
adjust the import path if Playwright lives elsewhere.

## Scripts

| Script | What it does |
|---|---|
| `render.mjs file.html prefix jobs.json` | Boots the modeler, runs render jobs through `window.__INKWAVE_QA` (`render` = calibrated ortho view in reference-pixel space, `renderPersp` = orbit camera, optional `only` part filter, optional `profile` patch) |
| `review.py prefix out.png` | Review sheet: reference vs model for front / 3-4 / side. The model is warped into the reference frame by a landmark similarity fit; clay columns = Sapiens normals of the reference and true normals of the model. Needs `jobs_review.json` renders |
| `lm.py`, `lmcmp.py` | MediaPipe Face Landmarker (478 pts) on crops; per-feature landmark offsets in mm |
| `pose.py`, `camfit.py` | Head pose from landmarks; grid search for the orbit camera that matches the 3-4 and side sheets (best: 3-4 az −0.35 el −0.28, side az −0.95 el −0.15) |
| `sapiens.py img x0,y0,x1,y1 out` | Meta Sapiens-1B surface normals for a crop (CPU ≈ 60–90 s) |
| `integ.py`, `depthcmp.py`, `plotdepth.py` | Normals → depth (sparse Poisson least squares) inside the face oval; ref-vs-model depth profiles |
| `proj.py` | Head-local ↔ front reference pixel projection (head pose of the reference preset) |
| `earfit.py` | Least-squares fit of the ear-tip direction to the tip seen in the front, 3-4 and side sheets |
| `eyeseg.py` | Eye-opening segmentation on the front sheet |
| `eyesheet.py`, `earsheet.sh`, `compare.py`, `cmp2.py`, `nviz.py` | Close-up comparison sheets |
| `smoke.mjs file.html` | Regression smoke test: every preset, slot sweep (eyes/brows/skin/headgear/baseBody), shape extremes; reports page errors |
