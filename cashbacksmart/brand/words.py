import json, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
font = TTFont('node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff2')
gs = font.getGlyphSet(); cmap = font.getBestCmap(); upm = font['head'].unitsPerEm
def word(text, x, y, size):
    sc = size / upm; cx = x; d = []
    for ch in text:
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        tp = TransformPen(pen, (sc, 0, 0, -sc, cx, y))
        gs[g].draw(tp)
        d.append(pen.getCommands())
        cx += gs[g].width * sc
    return {'d': ' '.join(d), 'width': cx - x}
print(json.dumps({t: word(t, 0, 0, 64) for t in sys.argv[1:]}))
