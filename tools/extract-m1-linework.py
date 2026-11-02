"""Extract the three M1 reinforcement panels from a LibreDWG convertEx JSON.

Usage: python3 tools/extract-m1-linework.py database.json source.dwg output.json
The output is reference linework, not a parametric reinforcement design.
"""
import hashlib
import json
import math
import re
import sys

data = json.load(open(sys.argv[1]))['database']
blocks = {b['name']: b for b in data['tables']['BLOCK_RECORD']['entries']}
# TCVN3 text from this drawing's VNArial styles; leave existing Unicode alone.
legacy = 'µ¸¶·¹¨»¾¼½Æ©ÇÊÈÉË®ÌÐÎÏÑªÒÕÓÔÖ×ÝØÜÞßãáâä«åèæçé¬êíëìîïóñòô\xadõøö÷ùúûüþ§¡¢£¤¥¦'
unicode = 'àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳỷỹỵĐĂÂÊÔƠƯ'
translation = str.maketrans(dict(zip(legacy, unicode)))


def multiply(a, b):
    return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
            a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
            a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]]


def point(p, t):
    return [round(t[0]*p['x']+t[2]*p['y']+t[4], 3),
            round(t[1]*p['x']+t[3]*p['y']+t[5], 3)]


operations = []


def walk(entities, t=(1, 0, 0, 1, 0, 0), depth=0):
    if depth > 10:
        raise ValueError('Cyclic block reference')
    for e in entities:
        kind = e.get('type')
        op = None
        if not e.get('isVisible', True):
            continue
        if kind == 'INSERT' and e['name'] in blocks:
            b = blocks[e['name']]
            p, bp = e['insertionPoint'], b.get('basePoint', {})
            c, s = math.cos(e.get('rotation', 0)), math.sin(e.get('rotation', 0))
            sx, sy = e.get('xScale', 1), e.get('yScale', 1)
            q = multiply([sx*c, sx*s, -sy*s, sy*c, p['x'], p['y']],
                         [1, 0, 0, 1, -bp.get('x', 0), -bp.get('y', 0)])
            walk(b['entities'], multiply(t, q), depth+1)
            walk(e.get('attribs', []), t, depth+1)
            continue
        if kind == 'DIMENSION' and e.get('name') in blocks:
            walk(blocks[e['name']]['entities'], t, depth+1)
            continue
        if kind == 'LINE':
            op = {'kind': 'path', 'points': [point(e['startPoint'], t), point(e['endPoint'], t)]}
        elif kind in ('LWPOLYLINE', 'POLYLINE_2D', 'LEADER'):
            if len(e.get('vertices', [])) > 1:
                op = {'kind': 'path', 'points': [point(p, t) for p in e['vertices']],
                      'closed': bool(e.get('flag', 0) & 1)}
        elif kind in ('CIRCLE', 'ARC') and 'x' in e.get('center', {}):
            c, r = e['center'], e['radius']
            a, b = e.get('startAngle', 0), e.get('endAngle', 2*math.pi)
            while b < a:
                b += 2*math.pi
            op = {'kind': 'path', 'closed': kind == 'CIRCLE', 'points': [
                point({'x': c['x']+r*math.cos(a+(b-a)*i/32),
                       'y': c['y']+r*math.sin(a+(b-a)*i/32)}, t) for i in range(33)]}
        elif kind in ('TEXT', 'ATTRIB', 'MTEXT'):
            q = e.get('text', {}) if isinstance(e.get('text'), dict) else e
            p = q.get('startPoint', e.get('insertionPoint', {}))
            text = q.get('text', '')
            style = e.get('styleName', q.get('styleName', '')).lower()
            if any(s in style for s in ('vn', 'arialh', 'arialn')):
                text = text.translate(translation)
            text = re.sub(r'\\f[^;]*;', '', text)
            text = re.sub(r'%%[uU]', '', text).replace('\\A1;', '').replace('\\X', ' ').replace('\\P', ' ').replace('{', '').replace('}', '')
            if text and 'x' in p:
                op = {'kind': 'text', 'at': point(p, t), 'text': text,
                      'height': round(q.get('textHeight', 150)*math.hypot(t[0], t[1]), 3)}
        if op:
            op['sourceHandle'] = e.get('handle')
            operations.append(op)


walk([e for e in data['entities'] if e.get('ownerBlockRecordSoftId') == '1F'])
windows = {'main': (349000, -71500, 385000, -44500),
           'left': (388000, -71000, 424000, -43500),
           'right': (311000, -71000, 347000, -43500)}
views = {}
for name, (x0, y0, x1, y1) in windows.items():
    selected = []
    for op in operations:
        pts = op.get('points', [op.get('at')])
        if not all(x0 <= x <= x1 and y0 <= y <= y1 for x, y in pts):
            continue
        q = dict(op)
        if q['kind'] == 'text':
            q['at'] = [round(q['at'][0]-x0, 3), round(q['at'][1]-y0, 3)]
        else:
            q['points'] = [[round(x-x0, 3), round(y-y0, 3)] for x, y in q['points']]
        selected.append(q)
    views[name] = {'width': x1-x0, 'height': y1-y0, 'ops': selected}
result = {'source': '02. BTC- mo_2.dwg',
          'sha256': hashlib.sha256(open(sys.argv[2], 'rb').read()).hexdigest(),
          'note': 'Reference linework only. Arcs sampled; fills omitted. Not a fabrication model. Never scale to changed geometry.',
          'views': views}
with open(sys.argv[3], 'w') as output:
    json.dump(result, output, ensure_ascii=False, separators=(',', ':'))
print({k: len(v['ops']) for k, v in views.items()})
