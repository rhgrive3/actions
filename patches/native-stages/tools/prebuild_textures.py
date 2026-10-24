#!/usr/bin/env python3
"""Build-time twin of loadNativeTextures' browser-direct pixel inference.

Reads one JSON job list on stdin: [{"png": path, "roles": [...], "out": dir, "key": name}].
For every (texture, role) it writes the exact pixels the runtime would upload,
flipped to GL row order (createImageBitmap imageOrientation:'flipY'), and
prints the same inference the browser computes from the decoded canvas:
albedo alpha, normal encoding and roughness/opacity channel.

Canvas readback is premultiplied; getImageData returns unpremultiplied bytes.
The inference reproduces that round trip so thresholds see the browser's values.
"""
import json
import struct
import sys

import numpy as np
from PIL import Image


def png_color_type(path):
    with open(path, 'rb') as f:
        head = f.read(26)
    return head[25]


def canvas_readback(rgba):
    """Chrome 2D canvas: premultiply to 8 bits, unpremultiply on getImageData."""
    out = rgba.astype(np.int32).copy()
    a = out[..., 3:4]
    pm = np.floor(out[..., :3] * a / 255.0 + 0.5)
    with np.errstate(divide='ignore', invalid='ignore'):
        un = np.where(a > 0, np.minimum(255, np.floor(pm * 255.0 / np.maximum(a, 1) + 0.5)), 0)
    out[..., :3] = np.where(a == 255, out[..., :3], un)
    return out


def infer(path, rgba, role):
    px = canvas_readback(rgba)
    count = px.shape[0] * px.shape[1]
    if role == 'albedo':
        alpha = False
        if png_color_type(path) in (4, 6):
            alpha = bool((px[..., 3] < 250).any())
        return {'hasAlpha': alpha}
    if role == 'normal':
        r = px[..., 0].astype(np.float64)
        g = px[..., 1].astype(np.float64)
        mean2 = px[..., 2].sum()
        x = r / 127.5 - 1
        y = g / 127.5 - 1
        sx = np.where(px[..., 0] > 127, px[..., 0] - 256, px[..., 0]) / 127
        sy = np.where(px[..., 1] > 127, px[..., 1] - 256, px[..., 1]) / 127
        unorm = int((x * x + y * y > 1.02).sum())
        signed = int((sx * sx + sy * sy > 1.02).sum())
        if mean2 / count < 1:
            enc = 'signed-byte-rg' if signed / count + .1 < unorm / count else 'unorm-rg'
        else:
            enc = 'rgb'
        return {'normalEncoding': enc}
    if role in ('roughness', 'opacity'):
        r = px[..., 0]
        mean0 = r.sum()
        mean1 = px[..., 1].sum()
        lo0, hi0 = int(r.min()), int(r.max())
        ch = 'r' if mean1 / count < 1 and (mean0 / count > 2 or hi0 - lo0 > 4) else 'g'
        return {'channel': ch}
    return {}


def reconstruct_normal(rgba, encoding):
    """native-load.mjs: RG -> clamped XYZ in unorm RGB, opaque alpha."""
    px = canvas_readback(rgba)
    r = px[..., 0].astype(np.float64)
    g = px[..., 1].astype(np.float64)
    if encoding == 'signed-byte-rg':
        x = np.maximum(-1, np.where(px[..., 0] > 127, px[..., 0] - 256, px[..., 0]) / 127)
        y = np.maximum(-1, np.where(px[..., 1] > 127, px[..., 1] - 256, px[..., 1]) / 127)
    else:
        x = r / 127.5 - 1
        y = g / 127.5 - 1
    length = np.hypot(x, y)
    scale = np.where(length > .95, .95 / np.maximum(length, 1e-12), 1)
    x = x * scale
    y = y * scale
    z = np.sqrt(np.maximum(0, 1 - x * x - y * y))
    # JS Math.round: floor(v + .5)
    out = np.empty(px.shape, np.uint8)
    out[..., 0] = np.floor((x * .5 + .5) * 255 + .5)
    out[..., 1] = np.floor((y * .5 + .5) * 255 + .5)
    out[..., 2] = np.floor((z * .5 + .5) * 255 + .5)
    out[..., 3] = 255
    return out


def main():
    jobs = json.load(sys.stdin)
    results = []
    for job in jobs:
        img = Image.open(job['png'])
        rgba = np.asarray(img.convert('RGBA'))
        # GL row order: the runtime uploads ImageBitmap with flipY.
        flipped = rgba[::-1]
        entry = {'key': job['key'], 'width': img.width, 'height': img.height, 'roles': {}}
        for role in job['roles']:
            info = infer(job['png'], flipped, role)
            if role == 'normal' and info['normalEncoding'] != 'rgb':
                pixels = reconstruct_normal(flipped, info['normalEncoding'])
            else:
                pixels = flipped
            out = f"{job['out']}/{job['key']}.{role}.png"
            Image.fromarray(np.ascontiguousarray(pixels), 'RGBA').save(out, compress_level=1)
            entry['roles'][role] = {**info, 'png': out}
        results.append(entry)
    json.dump(results, sys.stdout)


if __name__ == '__main__':
    main()
