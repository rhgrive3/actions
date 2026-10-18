#!/usr/bin/env python3
"""Extract normalized, connected puddle edges from the documented retail captures.

Usage: python scripts/extract-inkwave-ink-contours.py reference-directory output.json
Images are comparison inputs, never runtime assets. This measures image-space
silhouettes, not Nintendo stencils or world dimensions. No ellipse is fitted.
"""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image

SOURCES = [
    ('ink-blast', 'grizzblast.webp', 0, [95, 190, 410, 362], 'blue'),
]


def extract(path, frame, crop, color):
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
    # Positive along is toward the target (up the capture). Zero endpoint
    # caps keep the measured body inside the existing source width/depth.
    sections = [[-1, 0, 0]]
    for y in range(hi, lo-1, -1):
        xs = rows.get(y)
        if not xs:
            continue
        sections.append([round(2*(hi-y+1)/(hi-lo+2)-1, 8),
                         round(max(0, cx-min(xs))/half, 8),
                         round(max(0, max(xs)-cx)/half, 8)])
    sections.append([1, 0, 0])
    return sections, {'size': list(pixels.size), 'bounds': [left, lo, right, hi],
                      'connectedPixels': len(body), 'discardedComponents': len(components)-1}


if __name__ == '__main__':
    root, output = Path(sys.argv[1]), Path(sys.argv[2])
    result = {'scope': 'Image-space body edge measurements; not official masks; holes and detached drops excluded.', 'profiles': {}}
    for kind, name, frame, crop, color in SOURCES:
        path = root / name
        sections, measurement = extract(path, frame, crop, color)
        result['profiles'][kind] = {'file': name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                                    'frame': frame, 'crop': crop, 'color': color,
                                    **measurement, 'sections': sections}
    output.write_text(json.dumps(result, indent=2) + '\n')
