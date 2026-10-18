#!/usr/bin/env python3
"""Extract normalized, connected puddle edges from the documented retail captures.

Usage: python scripts/extract-inkwave-ink-contours.py reference-directory output.json [--rectify-floor]
Images are comparison inputs, never runtime assets. This measures image-space silhouettes; --rectify-floor
uses equal floor guides to recover a relative plane. Neither mode supplies
Nintendo stencils, absolute world dimensions, or a measured wall profile. No ellipse is fitted.
"""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image

# Five consecutive, equally spaced floor guide lines, read from the capture.
# The 139.5 line is dimly lit; it is still visible across the right-hand floor.
# Frame/crop and principal X are recorded, not claimed as Nintendo camera data.
FLOOR_LINES_Y = [94.5, 139.5, 206.5, 320.0, 551.5]


def floor_calibration(lines=FLOOR_LINES_Y):
    import numpy as np
    index = np.arange(len(lines), dtype=float)
    ys = np.asarray(lines, dtype=float)
    # y = (a*z+b)/(c*z+1). Lateral inverse projection scales by c*z+1.
    matrix = np.column_stack((index, np.ones(len(lines)), -ys*index))
    a, b, c = np.linalg.lstsq(matrix, ys, rcond=None)[0]
    residual = (a*index+b)/(c*index+1)-ys
    if np.max(np.abs(residual)) > 1:
        raise ValueError('Floor guide calibration exceeds one capture pixel')
    return {'a': float(a), 'b': float(b), 'c': float(c),
            'guideY': list(lines), 'guideZ': list(range(len(lines))),
            'residualPixels': residual.tolist(), 'horizonY': float(a/c)}

SOURCES = [
    ('ink-blast', 'grizzblast.webp', 0, [95, 190, 410, 362], 'blue'),
]


def extract(path, frame, crop, color, rectify_floor=False):
    image = Image.open(path)
    image.seek(frame)
    pixels = image.convert('RGB')
    x0, y0, x1, y1 = crop
    candidates = set()
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b = pixels.getpixel((x, y))
            selected = b > r + 35 and b > g + 35 if color == 'blue' else g > r * 1.3 and g > b * 1.3 and g > 50
            if selected:
                candidates.add((x, y))
    # Detached satellites and HUD pixels must not enlarge the body envelope.
    components = []
    while candidates:
        stack = [candidates.pop()]
        component = set(stack)
        while stack:
            x, y = stack.pop()
            for q in [(x-1, y), (x+1, y), (x, y-1), (x, y+1)]:
                if q in candidates:
                    candidates.remove(q)
                    component.add(q)
                    stack.append(q)
        components.append(component)
    body = max(components, key=len)
    assert all(x0 < x < x1-1 and y0 < y < y1-1 for x, y in body), "Crop clips the connected body"
    rows = {}
    for x, y in body:
        rows.setdefault(y, []).append(x)
    lo, hi = min(rows), max(rows)
    left, right = min(x for x, _ in body), max(x for x, _ in body)
    cx, half = (left + right) / 2, (right - left) / 2
    calibration = None
    if rectify_floor:
        calibration = floor_calibration()
        a, b, c = (calibration[k] for k in ('a', 'b', 'c'))
        principal_x = pixels.width / 2
        calibration['principalX'] = principal_x
        def unproject(x, y):
            z = (b-y)/(c*y-a)
            return (x-principal_x)*(c*z+1), z
        spans = [(y, *unproject(min(xs), y), *unproject(max(xs), y)) for y, xs in rows.items()]
        minimum = min(v[1] for v in spans)
        maximum = max(v[3] for v in spans)
        cx, half = (minimum+maximum)/2, (maximum-minimum)/2
        near, far = unproject(principal_x, hi+1)[1], unproject(principal_x, lo-1)[1]
        calibration['normalizedBounds'] = [minimum, far, maximum, near]
    # Positive along is toward the target (up the capture). Zero endpoint
    # caps keep the measured body inside the existing source width/depth.
    sections = [[-1, 0, 0]]
    for y in range(hi, lo-1, -1):
        xs = rows.get(y)
        if not xs:
            continue
        if rectify_floor:
            left_x, z = unproject(min(xs), y)
            right_x, _ = unproject(max(xs), y)
            along = 2*(near-z)/(near-far)-1
        else:
            left_x, right_x = min(xs), max(xs)
            along = 2*(hi-y+1)/(hi-lo+2)-1
        sections.append([round(along, 8), round(max(0, cx-left_x)/half, 8),
                         round(max(0, right_x-cx)/half, 8)])
    sections.append([1, 0, 0])
    return sections, {'size': list(pixels.size), 'bounds': [left, lo, right, hi],
                      'connectedPixels': len(body), 'discardedComponents': len(components)-1,
                      **({'floorCalibration': calibration} if calibration else {})}


if __name__ == '__main__':
    root, output = Path(sys.argv[1]), Path(sys.argv[2])
    rectify_floor = '--rectify-floor' in sys.argv[3:]
    scope = ('Floor-projectively rectified body edges; principal X inferred from centered capture; no absolute scale or wall calibration.' if rectify_floor else 'Image-space body edge measurements; not official masks; holes and detached drops excluded.')
    result = {'scope': scope, 'profiles': {}}
    for kind, name, frame, crop, color in SOURCES:
        path = root / name
        sections, measurement = extract(path, frame, crop, color, rectify_floor)
        result['profiles'][kind+'-rectified' if rectify_floor else kind] = {'file': name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                                    'frame': frame, 'crop': crop, 'color': color,
                                    **measurement, 'sections': sections}
    output.write_text(json.dumps(result, indent=2) + '\n')
