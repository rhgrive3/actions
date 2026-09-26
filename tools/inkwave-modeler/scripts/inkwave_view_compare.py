"""Five-view Three.js vs Blender comparison for the INKWAVE migration.

python3 scripts/inkwave_view_compare.py --three <dir with three_{view}_{mask,beauty}.png> \
  --blender <dir with blender_{view}_mask.png + blender_{view}_beauty.exr> --out <dir> [--docs <dir>]

Silhouette: IoU of the binarised masks, as rendered and after the best integer registration (|shift| <= 20 px).
Shading: Blender writes scene-linear EXR; this applies the runtime's exact output transform (three r159
ACESFilmicToneMapping at toneMappingExposure 0.92, then sRGB) and composites over the runtime's QA clear colour
#b4b6bd with the Blender coverage mask, so both sides go through one colour pipeline and only shading differs.
Colour metrics are measured inside the intersection of both silhouettes.
"""
import argparse
import json
import os
from pathlib import Path

os.environ.setdefault('OPENCV_IO_ENABLE_OPENEXR', '1')
import cv2  # noqa: E402  (the env flag must be set before import)
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

VIEWS = ('front', 'right', 'back', 'left', 'perspective')
EXPOSURE = 0.92
BACKGROUND = np.array([0xb4, 0xb6, 0xbd], np.float64) / 255.0
# GLSL mat3 constructors take columns; these rows are those columns, so `rgb @ M` is the shader's `M * rgb`.
ACES_IN = np.array([[0.59719, 0.07600, 0.02840], [0.35458, 0.90834, 0.13383], [0.04823, 0.01566, 0.83777]])
ACES_OUT = np.array([[1.60475, -0.10208, -0.00327], [-0.53108, 1.10813, -0.07276], [-0.07367, -0.00605, 1.07602]])


def aces_filmic(linear):
    color = linear * (EXPOSURE / 0.6)
    color = color @ ACES_IN
    a = color * (color + 0.0245786) - 0.000090537
    b = color * (0.983729 * color + 0.4329510) + 0.238081
    return np.clip((a / b) @ ACES_OUT, 0.0, 1.0)


def srgb_encode(linear):
    linear = np.clip(linear, 0.0, 1.0)
    return np.where(linear <= 0.0031308, linear * 12.92, 1.055 * np.power(linear, 1 / 2.4) - 0.055)


def load_png(path):
    return np.asarray(Image.open(path).convert('RGB'), np.float64) / 255.0


def load_exr(path):
    data = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if data is None:
        raise FileNotFoundError(path)
    return data[:, :, 2::-1].astype(np.float64)  # BGR(A) -> RGB


def iou(a, b):
    union = np.logical_or(a, b).sum()
    return float(np.logical_and(a, b).sum() / union) if union else 1.0


def shifted(mask, dx, dy):
    out = np.zeros_like(mask)
    h, w = mask.shape
    out[max(dy, 0):h + min(dy, 0), max(dx, 0):w + min(dx, 0)] = mask[max(-dy, 0):h + min(-dy, 0), max(-dx, 0):w + min(-dx, 0)]
    return out


def best_registration(reference, moving, radius=20):
    best = (iou(reference, moving), 0, 0)
    for dy in range(-radius, radius + 1, 2):
        for dx in range(-radius, radius + 1, 2):
            best = max(best, (iou(reference, shifted(moving, dx, dy)), dx, dy))
    _, cx, cy = best
    for dy in range(cy - 1, cy + 2):
        for dx in range(cx - 1, cx + 2):
            best = max(best, (iou(reference, shifted(moving, dx, dy)), dx, dy))
    return best


def luminance(rgb):
    return rgb @ np.array([0.2126, 0.7152, 0.0722])


def region_stats(three, blender, region):
    if not region.any():
        return None
    t, b = three[region], blender[region]
    return {'pixels': int(region.sum()),
            'mean_abs_rgb_8bit': round(float(np.abs(t - b).mean() * 255), 2),
            'three_mean_luma': round(float(luminance(t).mean()), 4),
            'blender_mean_luma': round(float(luminance(b).mean()), 4),
            'luma_ratio_blender_over_three': round(float(luminance(b).mean() / max(luminance(t).mean(), 1e-6)), 3),
            'three_mean_rgb': [round(float(v), 3) for v in t.mean(axis=0)],
            'blender_mean_rgb': [round(float(v), 3) for v in b.mean(axis=0)]}


def label(image, text):
    canvas = Image.fromarray(image)
    draw = ImageDraw.Draw(canvas)
    draw.rectangle([0, 0, canvas.width, 18], fill=(20, 22, 28))
    draw.text((6, 3), text, fill=(235, 240, 245))
    return np.asarray(canvas)


def to8(image):
    return (np.clip(image, 0, 1) * 255 + 0.5).astype(np.uint8)


def compare_view(view, three_dir, blender_dir, out_dir):
    three_mask = load_png(three_dir / f'three_{view}_mask.png')[:, :, 0] > 0.5
    blender_cover = load_png(blender_dir / f'blender_{view}_mask.png')[:, :, 0]
    blender_mask = blender_cover > 0.5
    three = load_png(three_dir / f'three_{view}_beauty.png')
    linear = load_exr(blender_dir / f'blender_{view}_beauty.exr')
    if three.shape[:2] != linear.shape[:2] or three_mask.shape != blender_mask.shape:
        raise ValueError(f'{view}: image sizes differ {three.shape} {linear.shape} {three_mask.shape} {blender_mask.shape}')
    display = srgb_encode(aces_filmic(linear))
    alpha = blender_cover[:, :, None]
    blender = display * alpha + BACKGROUND * (1 - alpha)
    Image.fromarray(to8(blender)).save(out_dir / f'blender_{view}_beauty.png')
    raw = iou(three_mask, blender_mask)
    registered, dx, dy = best_registration(three_mask, blender_mask)
    aligned_mask = shifted(blender_mask, dx, dy)
    aligned = np.stack([shifted(blender[:, :, c], dx, dy) for c in range(3)], axis=-1)
    both = three_mask & aligned_mask
    rows = np.where(both.any(axis=1))[0]
    head = both.copy()
    if len(rows):  # top 16% of the figure: hair crown down to the chin in every view
        head[rows[0] + int(0.16 * (rows[-1] - rows[0])):] = False
    diff = np.abs(three - aligned).mean(axis=2)
    heat = cv2.applyColorMap(to8(np.clip(diff * 4, 0, 1)), cv2.COLORMAP_INFERNO)[:, :, ::-1]
    heat[~(three_mask | aligned_mask)] = (heat[~(three_mask | aligned_mask)] * 0.25).astype(np.uint8)
    sheet = np.concatenate([label(to8(three), f'Three.js {view}'), label(to8(aligned), f'Blender Cycles {view}'),
                            label(heat, 'abs diff x4')], axis=1)
    Image.fromarray(sheet).save(out_dir / f'compare_{view}.png')
    return {'view': view, 'size': list(three_mask.shape[::-1]), 'mask_iou': round(raw, 5),
            'mask_iou_registered': round(registered, 5), 'registration_px': [dx, dy],
            'figure': region_stats(three, aligned, both), 'head': region_stats(three, aligned, head)}


def contact_sheet(out_dir, docs_dir, width=1500):
    rows = []
    for view in VIEWS:
        sheet = Image.open(out_dir / f'compare_{view}.png')
        rows.append(sheet.resize((width, round(sheet.height * width / sheet.width)), Image.LANCZOS))
    docs_dir.mkdir(parents=True, exist_ok=True)
    for view, row in zip(VIEWS, rows):
        row.convert('RGB').save(docs_dir / f'compare_{view}.jpg', quality=86, optimize=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--three', type=Path, required=True)
    parser.add_argument('--blender', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--docs', type=Path, help='also write compact JPEG comparisons here')
    opts = parser.parse_args()
    opts.out.mkdir(parents=True, exist_ok=True)
    results = [compare_view(view, opts.three, opts.blender, opts.out) for view in VIEWS]
    report = {'tone_mapping': f'three r159 ACESFilmic, exposure {EXPOSURE}, sRGB', 'views': results}
    (opts.out / 'view_compare.json').write_text(json.dumps(report, indent=2))
    if opts.docs:
        contact_sheet(opts.out, opts.docs)
        (opts.docs / 'view_compare.json').write_text(json.dumps(report, indent=2))
    for r in results:
        f, h = r['figure'], r['head']
        print(f"{r['view']:<12} IoU {r['mask_iou']:.4f} (registered {r['mask_iou_registered']:.4f} @ {r['registration_px']}) "
              f"figure dRGB {f['mean_abs_rgb_8bit']:.1f}/255 luma B/T {f['luma_ratio_blender_over_three']:.3f} "
              f"head dRGB {h['mean_abs_rgb_8bit']:.1f} luma B/T {h['luma_ratio_blender_over_three']:.3f}")


if __name__ == '__main__':
    main()
