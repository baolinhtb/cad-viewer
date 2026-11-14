"""Extract the M1 arrangement and three reinforcement panels from a LibreDWG convertEx JSON.

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
# The same table, with font-aware rules, is in the TypeScript SDK:
# packages/cad-template-sdk/src/AcTpVnText.ts (acTpDecodeVnText).
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


# Keep source drawing units. Curves are tessellated to <= 2 mm sagitta.
operations = []
unsupported = {}
layers = {b['name']: b for b in data['tables']['LAYER']['entries']}

def arc(center, rx, ry, start, end, ccw=True, rotation=0):
    if ccw:
        while end <= start: end += 2*math.pi
    else:
        while end >= start: end -= 2*math.pi
    step = min(math.pi/18, 2*math.acos(max(-1, 1-2/max(abs(rx), abs(ry), 2))))
    count = max(2, math.ceil(abs(end-start)/step))
    c, s = math.cos(rotation), math.sin(rotation)
    return [{'x': center['x']+rx*math.cos(a)*c-ry*math.sin(a)*s,
             'y': center['y']+rx*math.cos(a)*s+ry*math.sin(a)*c}
            for a in [start+(end-start)*i/count for i in range(count+1)]]

def poly(vertices, closed=False):
    result = []
    for i, a in enumerate(vertices):
        result.append(a)
        if i == len(vertices)-1 and not closed: break
        b = vertices[(i+1)%len(vertices)]
        bulge = a.get('bulge', 0)
        chord = math.hypot(b['x']-a['x'], b['y']-a['y'])
        if abs(bulge) > 1e-9 and chord > 1e-9:
            dx, dy = b['x']-a['x'], b['y']-a['y']
            k = (1-bulge*bulge)/(4*bulge)
            center = {'x': (a['x']+b['x'])/2-dy*k, 'y': (a['y']+b['y'])/2+dx*k}
            r = chord*(1+bulge*bulge)/(4*abs(bulge))
            angle = math.atan2(a['y']-center['y'], a['x']-center['x'])
            result.extend(arc(center,r,r,angle,angle+4*math.atan(bulge),bulge>0)[1:-1])
    return result

def loops(e):
    result=[]
    for boundary in e.get('boundaryPaths', []):
        pts=[]
        if 'vertices' in boundary: pts=poly(boundary['vertices'], True)
        for edge in boundary.get('edges', []):
            typ=edge['type']
            if typ==1: pts.extend([edge['start'],edge['end']])
            elif typ==2:
                pts.extend(arc(edge['center'],edge['radius'],edge['radius'],edge['startAngle'],edge['endAngle'],bool(edge.get('isCCW',1))))
            elif typ==3:
                axis=edge['end'];r=math.hypot(axis['x'],axis['y'])
                pts.extend(arc(edge['center'],r,r*edge['lengthOfMinorAxis'],edge['startAngle'],edge['endAngle'],bool(edge.get('isCCW',1)),math.atan2(axis['y'],axis['x'])))
            else: raise ValueError('Unsupported hatch edge '+str(typ))
        clean=[]
        for p in pts:
            if not clean or math.hypot(p['x']-clean[-1]['x'],p['y']-clean[-1]['y'])>1e-6: clean.append(p)
        if len(clean)>2:result.append(clean)
    return result

# Clip the drawing's own pattern definition against all boundaries (even-odd
# crossings preserve islands). No substitution of custom material symbols.
def hatch_lines(e, boundaries):
    for definition in e.get('definitionLines', []):
        angle=definition['angle'];u=(math.cos(angle),math.sin(angle));v=(-u[1],u[0])
        base=definition['base'];offset=definition['offset']
        step=offset['x']*v[0]+offset['y']*v[1]
        if abs(step)<1e-9:continue
        ranges=[((p['x']-base['x'])*v[0]+(p['y']-base['y'])*v[1])/step for loop in boundaries for p in loop]
        for k in range(math.floor(min(ranges))-1, math.ceil(max(ranges))+2):
            origin=(base['x']+k*offset['x'],base['y']+k*offset['y'])
            crossings=[]
            for loop in boundaries:
                for a,b in zip(loop,loop[1:]+loop[:1]):
                    ay=(a['x']-origin[0])*v[0]+(a['y']-origin[1])*v[1]
                    by=(b['x']-origin[0])*v[0]+(b['y']-origin[1])*v[1]
                    if (ay<=0<by) or (by<=0<ay):
                        f=-ay/(by-ay)
                        crossings.append((a['x']+(b['x']-a['x'])*f-origin[0])*u[0]+(a['y']+(b['y']-a['y'])*f-origin[1])*u[1])
            crossings.sort()
            for lo,hi in zip(crossings[::2],crossings[1::2]):
                intervals=[(lo,hi)]
                dashes=definition.get('dashLengths',[]);period=sum(abs(d) for d in dashes)
                if period>1e-9:
                    intervals=[]
                    for cycle in range(math.floor(lo/period),math.ceil(hi/period)+1):
                        t=cycle*period
                        for d in dashes:
                            end=t+abs(d)
                            if d>=0 and end>=lo and t<=hi:intervals.append((max(lo,t),min(hi,end if d else t+0.5)))
                            t=end
                for a,b in intervals:
                    if b>a:yield [{'x':origin[0]+a*u[0],'y':origin[1]+a*u[1]}, {'x':origin[0]+b*u[0],'y':origin[1]+b*u[1]}]

def walk(entities, t=(1,0,0,1,0,0), depth=0, parent_role=None, parent_layer='0', parent_color=7):
    if depth>10:raise ValueError('Cyclic block reference')
    for e in entities:
        if not e.get('isVisible',True):continue
        kind=e.get('type'); layer=e.get('layer','0');layer=parent_layer if layer=='0' else layer
        color=e.get('colorIndex',256)
        if color==0:color=parent_color
        if color==256:color=layers.get(layer,{}).get('colorIndex',7)
        role=parent_role or ('duong_tim' if any(n in layer.lower() for n in ['tim','center','truc']) else None)
        def emit(op):
            op.update(sourceHandle=e.get('handle'),sourceType=kind,sourceLayer=layer,
                      role=role or ('ghi_chu' if op['kind']=='text' else 'geometry'),color=color)
            operations.append(op)
        if kind=='INSERT' and e['name'] in blocks:
            b=blocks[e['name']];p=e['insertionPoint'];bp=b.get('basePoint',{})
            c,s=math.cos(e.get('rotation',0)),math.sin(e.get('rotation',0));sx,sy=e.get('xScale',1),e.get('yScale',1)
            q=multiply([sx*c,sx*s,-sy*s,sy*c,p['x'],p['y']],[1,0,0,1,-bp.get('x',0),-bp.get('y',0)])
            walk(b.get('entities',[]),multiply(t,q),depth+1,role,layer,color)
            walk(e.get('attribs',[]),t,depth+1,role,layer,color);continue
        if kind=='DIMENSION' and e.get('name') in blocks:
            walk(blocks[e['name']]['entities'],t,depth+1,'kich_thuoc',layer,color);continue
        if kind=='LINE':emit({'kind':'path','points':[point(e['startPoint'],t),point(e['endPoint'],t)]})
        elif kind in ('LWPOLYLINE','POLYLINE_2D','POLYLINE2D','LEADER'):
            closed=bool(e.get('flag',0)&1);pts=poly(e.get('vertices',[]),closed)
            if len(pts)>1:emit({'kind':'path','points':[point(p,t) for p in pts],'closed':closed})
        elif kind in ('CIRCLE','ARC'):
            c=e.get('center',e.get('centerPoint',{}))
            if 'x' in c:emit({'kind':'path','closed':kind=='CIRCLE','points':[point(p,t) for p in arc(c,e['radius'],e['radius'],e.get('startAngle',0),e.get('endAngle',2*math.pi))]})
        elif kind=='SPLINE':
            cp=e.get('controlPoints',[]); knots=e.get('knots',[]);degree=e.get('degree',3)
            weights=e.get('weights') or [1]*len(cp)
            def evaluate(u):
                span=next((i for i in range(degree,len(cp)) if knots[i]<=u<knots[i+1]),len(cp)-1)
                d=[[cp[j]['x']*weights[j],cp[j]['y']*weights[j],weights[j]] for j in range(span-degree,span+1)]
                for r in range(1,degree+1):
                    for j in range(degree,r-1,-1):
                        i=span-degree+j;den=knots[i+degree-r+1]-knots[i]
                        alpha=(u-knots[i])/den if den else 0
                        d[j]=[(1-alpha)*a+alpha*b for a,b in zip(d[j-1],d[j])]
                return {'x':d[degree][0]/d[degree][2],'y':d[degree][1]/d[degree][2]}
            if cp and knots:
                lo,hi=knots[degree],knots[len(cp)]
                emit({'kind':'path','points':[point(evaluate(lo+(hi-lo)*i/256),t) for i in range(257)]})
        elif kind=='SOLID':
            pts=[e[k] for k in ['corner1','corner2','corner4','corner3']]
            emit({'kind':'fill','loops':[[point(p,t) for p in pts]]})
        elif kind=='HATCH':
            boundaries=loops(e)
            if e.get('solidFill'):emit({'kind':'fill','loops':[[point(p,t) for p in loop] for loop in boundaries]})
            else:
                for pts in hatch_lines(e,boundaries):emit({'kind':'path','points':[point(p,t) for p in pts]})
        elif kind in ('TEXT','ATTRIB','MTEXT'):
            q=e.get('text',{}) if isinstance(e.get('text'),dict) else e
            h=q.get('halign',0); p=q.get('endPoint') if h in [1,2] else q.get('startPoint',e.get('insertionPoint',{}))
            if not p or 'x' not in p:continue
            label=q.get('text','');style=e.get('styleName',q.get('styleName','')).lower()
            if any(s in style for s in ['vn','arialh','arialn']):label=label.translate(translation)
            label=re.sub(r'\\[fF][^;]*;','',label)
            label=re.sub(r'\\[ACFHQTWacfhqtw][^;]*;','',label)
            label=re.sub(r'%%[uU]','',label).replace('%%c','Ø').replace('%%d','°').replace('\\X',' ').replace('\\P',' ').replace('{','').replace('}','')
            if label:
                direction=q.get('direction')
                angle=math.atan2(direction['y'],direction['x']) if direction else q.get('rotation',0)
                rotation=math.degrees(math.atan2(t[1]*math.cos(angle)+t[3]*math.sin(angle),t[0]*math.cos(angle)+t[2]*math.sin(angle)))
                emit({'kind':'text','at':point(p,t),'text':label,'height':round(q.get('textHeight',150)*math.hypot(t[2],t[3]),3),'rotation':round(rotation,6),'align':h if h in [1,2] else 0,'widthFactor':q.get('xScale',1)})
        elif kind not in ('POINT','XLINE','ATTDEF'):
            unsupported[kind]=unsupported.get(kind,0)+1

walk([e for e in data['entities'] if e.get('ownerBlockRecordSoftId')=='1F'])
windows={'general':(337000,-13000,409000,18000),
         'main':(349000,-71500,385000,-44500),'left':(388000,-71000,424000,-43500),'right':(311000,-71000,347000,-43500)}
views={}
for name,(x0,y0,x1,y1) in windows.items():
    selected=[]
    for op in operations:
        pts=op.get('points') or ([p for loop in op['loops'] for p in loop] if 'loops' in op else [op['at']])
        if not pts or not all(x0<=x<=x1 and y0<=y<=y1 for x,y in pts):continue
        q=dict(op)
        shift=lambda p:[round(p[0]-x0,3),round(p[1]-y0,3)]
        if 'at' in q:q['at']=shift(q['at'])
        if 'points' in q:q['points']=[shift(p) for p in q['points']]
        if 'loops' in q:q['loops']=[[shift(p) for p in loop] for loop in q['loops']]
        selected.append(q)
    views[name]={'width':x1-x0,'height':y1-y0,'ops':selected}
result={'source':'02. BTC- mo_2.dwg','sha256':hashlib.sha256(open(sys.argv[2],'rb').read()).hexdigest(),
        'note':'Source M1 panels in original units. Arcs tessellated at 2 mm sagitta; splines sampled at 256 intervals; source hatch patterns clipped to boundaries. Not a redesigned reinforcement model.',
        'unsupportedModelTypes':unsupported,'views':views}
with open(sys.argv[3],'w') as output:json.dump(result,output,ensure_ascii=False,separators=(',',':'))
print({k:len(v['ops']) for k,v in views.items()},'unsupported outside/inside windows',unsupported)
