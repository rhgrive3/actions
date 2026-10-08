#!/usr/bin/env python3
"""Builds the two HUD fonts shipped with the Splatoon 3 HUD look (presentation only).

  iw-s3-digits.woff2   original timer numerals: condensed, heavy, chamfered corners,
                       drawn here as polygons to follow the shape seen in the
                       2026-10-08 Splatoon 3 recording (no Nintendo glyph data).
  iw-s3-jp.woff2       subset of M PLUS Rounded 1c Black (SIL OFL 1.1, see OFL.txt):
                       kana, CJK punctuation, full-width forms and the kanji used by
                       the in-match UI strings.

Usage: python3 build-hud-fonts.py <MPLUSRounded1c-Black.ttf> <out dir> [kanji source files...]
Needs fonttools + brotli.
"""
import sys, re, pathlib
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools import subset

UPM, H, W, T, C = 1000, 740, 400, 122, 64
M0, M1 = 309, 431          # middle bar
ADV, COLON_ADV = 500, 240

def area(p):
    return sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p))) / 2

def octa(x0, y0, x1, y1, c):
    return [(x0 + c, y0), (x1 - c, y0), (x1, y0 + c), (x1, y1 - c), (x1 - c, y1), (x0 + c, y1), (x0, y1 - c), (x0, y0 + c)]

DIGITS = {
    '0': ([octa(0, 0, W, H, C)], [octa(T, T, W - T, H - T, 24)]),
    '1': ([[(190, 0), (330, 0), (330, H), (175, H), (60, H - 115), (60, H - 235), (190, H - 235)]], []),
    '2': ([[(0, 0), (W, 0), (W, T), (T, T), (T, M0), (W - C, M0), (W, M0 + C), (W, H - C), (W - C, H), (C, H), (0, H - C),
            (0, H - T - 40), (T, H - T - 40), (T, H - T), (W - T, H - T), (W - T, M1), (C, M1), (0, M1 - C)]], []),
    '3': ([[(C, 0), (W - C, 0), (W, C), (W, H - C), (W - C, H), (0, H), (0, H - T), (W - T, H - T), (W - T, M1), (90, M1),
            (90, M0), (W - T, M0), (W - T, T), (0, T), (0, C)]], []),
    '4': ([[(W - T, 0), (W, 0), (W, H), (W - T, H), (W - T, M1), (T, M1), (T, H), (0, H), (0, M0 + C), (C, M0), (W - T, M0)]], []),
    '5': ([[(0, H), (W, H), (W, H - T), (T, H - T), (T, M1), (W - C, M1), (W, M1 - C), (W, C), (W - C, 0), (0, 0), (0, T),
            (W - T, T), (W - T, M0), (0, M0)]], []),
    '6': ([[(C, 0), (W - C, 0), (W, C), (W, M1 - C), (W - C, M1), (T, M1), (T, H - T), (W, H - T), (W, H), (C, H), (0, H - C), (0, C)]],
          [[(T, T), (W - T, T), (W - T, M0), (T, M0)]]),
    '7': ([[(0, H - T), (0, H), (W - C, H), (W, H - C), (W, 0), (W - T, 0), (W - T, H - T)]], []),
    '8': ([octa(0, 0, W, H, C)], [[(T, T), (W - T, T), (W - T, M0), (T, M0)], [(T, M1), (W - T, M1), (W - T, H - T), (T, H - T)]]),
    '9': ([[(W - C, H), (C, H), (0, H - C), (0, M0 + C), (C, M0), (W - T, M0), (W - T, T), (0, T), (0, 0), (W - C, 0), (W, C), (W, H - C)]],
          [[(T, M1), (W - T, M1), (W - T, H - T), (T, H - T)]]),
}

def glyph(outers, holes, dx):
    pen = TTGlyphPen(None)
    for poly, outer in [(p, True) for p in outers] + [(p, False) for p in holes]:
        pts = [(x + dx, y) for x, y in poly]
        # TrueType: outer contours clockwise (negative area in y-up), counters counter-clockwise.
        if (area(pts) < 0) != outer: pts = pts[::-1]
        pen.moveTo(pts[0])
        for p in pts[1:]: pen.lineTo(p)
        pen.closePath()
    return pen.glyph()

def digits(out):
    order = ['.notdef', 'space', 'colon'] + [f'd{d}' for d in '0123456789']
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    cmap = {32: 'space', 58: 'colon', **{ord(d): f'd{d}' for d in '0123456789'}}
    fb.setupCharacterMap(cmap)
    q = 112
    glyphs = {'.notdef': TTGlyphPen(None).glyph(), 'space': TTGlyphPen(None).glyph(),
              'colon': glyph([[(0, 140), (q, 140), (q, 140 + q), (0, 140 + q)], [(0, 470), (q, 470), (q, 470 + q), (0, 470 + q)]], [], (COLON_ADV - q) // 2)}
    for d, (outers, holes) in DIGITS.items(): glyphs[f'd{d}'] = glyph(outers, holes, (ADV - W) // 2)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics({n: (COLON_ADV if n == 'colon' else 300 if n == 'space' else ADV, 0) for n in order})
    fb.setupHorizontalHeader(ascent=860, descent=-140)
    fb.setupNameTable({'familyName': 'IW S3 Digits', 'styleName': 'Regular'})
    fb.setupOS2(sTypoAscender=860, sTypoDescender=-140, usWinAscent=860, usWinDescent=140)
    fb.setupPost()
    fb.font.flavor = 'woff2'
    fb.save(out)

def jp(src, out, sources):
    text = ''.join(pathlib.Path(f).read_text(encoding='utf8') for f in sources)
    kanji = sorted({c for c in text if '一' <= c <= '鿿'})
    unicodes = list(range(0x3000, 0x3040)) + list(range(0x3041, 0x3100)) + list(range(0xFF01, 0xFF5F)) + [ord(c) for c in kanji]
    opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = ['*']; opts.name_IDs = ['*']; opts.notdef_outline = True
    font = subset.load_font(src, opts)
    sub = subset.Subsetter(opts); sub.populate(unicodes=unicodes); sub.subset(font)
    subset.save_font(font, out, opts)
    return len(kanji)

if __name__ == '__main__':
    src, outdir, *sources = sys.argv[1:]
    outdir = pathlib.Path(outdir)
    digits(str(outdir / 'iw-s3-digits.woff2'))
    n = jp(src, str(outdir / 'iw-s3-jp.woff2'), sources)
    print('kanji', n)
