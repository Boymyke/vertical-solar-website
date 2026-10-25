# Builds the vector logo (logo.svg + inline symbol) from Lexend glyph outlines.
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
import math, os

src = 'node_modules/@fontsource-variable/lexend/files/lexend-latin-wght-normal.woff2'
def font(w):
    f = TTFont(src); instantiateVariableFont(f, {"wght": w}, inplace=True); return f

def text_path(f, text, x0, base, size, track=0):
    gs = f.getGlyphSet(); cmap = f.getBestCmap(); upm = f['head'].unitsPerEm
    s = size / upm; pen = SVGPathPen(gs); x = x0
    bp = BoundsPen(gs)
    for ch in text:
        g = cmap[ord(ch)]
        tp = TransformPen(pen, (s, 0, 0, -s, x, base)); gs[g].draw(tp)
        x += gs[g].width * s + track
    return pen.getCommands(), x

v = font(650); so = font(800)
pv, xv = text_path(v, 'vertical', 0, 92, 112, -3)
ps, xs = text_path(so, 'solar', 112, 196, 128, -5)
# sun: outlined 8-point burst
cx, cy, R, r = 506, 84, 76, 42
pts = []
for i in range(16):
    ang = -math.pi/2 + i*math.pi/8
    rad = R if i % 2 == 0 else r
    if i in (10, 12): rad *= 0.82
    pts.append((cx + rad*math.cos(ang), cy + rad*math.sin(ang)))
star = 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pts) + ' Z'
W = max(xs, cx + R + 8); H = 210
inner = f'''<path class="l-vertical" d="{pv}"/><path class="l-solar" d="{ps}"/><path class="l-sun" fill="none" stroke="#88D23F" stroke-width="11" stroke-linejoin="round" d="{star}" style="fill:none"/>'''
open('public/assets/img/logo.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -8 {W+8:.0f} {H+8}" role="img" aria-label="Vertical Solar"><style>.l-vertical{{fill:#282358}}.l-solar{{fill:#88D23F}}</style>{inner}</svg>')
open('scripts/logo-inline.txt','w').write(f'<svg viewBox="-4 -8 {W+8:.0f} {H+8}" aria-hidden="true" focusable="false">{inner}</svg>')
# Mark only (sun) for favicons
open('public/assets/img/mark.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" rx="36" fill="#282358"/><g transform="translate(-440,10)"><path fill="none" stroke="#88D23F" stroke-width="12" stroke-linejoin="round" d="{star}"/></g></svg>')
print(W, H)
