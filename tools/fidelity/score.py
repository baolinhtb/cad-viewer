#!/usr/bin/env python3
"""Pixel part of the fidelity harness, and the final score per sheet.

    python3 -I tools/fidelity/score.py <work-dir> <out-dir> [--label TEXT]

Reads (all written by run.mjs / extract-orig.mjs / the jest spec):
  <work>/orig-manifest.json, <work>/aci.json,
  <work>/render/<id>-orig-paper.png, <id>-orig-vp.png, <id>-gen.png,
  <work>/gen/gen-inventory.json, gen/inventory-scores.json,
  packages/cad-template-plugin/__tests__/fidelity/mo2-inventory.json
Writes to <out>: <to>-goc.png, <to>-sinh.png, <to>-diff.png,
  <to>-canh-nhau.png, diem.json, and appends diem-history.jsonl.

Scale: 10 px per paper millimetre on an A3 sheet (4200 x 2970).
Only PIL and numpy (already on the machine) — no new dependency.
"""
import datetime
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

PX = 10  # px per paper mm
W, H = 420 * PX, 297 * PX
# Drawing area of the sheet: inside the binding margin and above the title
# strip of the original sheets. The title block is an external reference
# missing from the DWG, so the frame/title area is scored by text only.
AREA = (25, 35, 410, 292)  # x0, y0, x1, y1 in paper mm
INK = 40  # any channel above this on the black background is ink
DILATE = 2  # px tolerance (0.2 mm paper)
WEIGHTS = {'S_hinh': 0.35, 'S_mau': 0.15, 'S_kiem': 0.15, 'S_chu': 0.20, 'S_dim': 0.15}

work, out = sys.argv[1], sys.argv[2]
label = sys.argv[sys.argv.index('--label') + 1] if '--label' in sys.argv else ''
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
os.makedirs(out, exist_ok=True)

manifest = json.load(open(os.path.join(work, 'orig-manifest.json')))
aci = np.array(json.load(open(os.path.join(work, 'aci.json'))), dtype=np.float32)  # 256 x 3
orig_inv = json.load(open(os.path.join(root, 'packages/cad-template-plugin/__tests__/fidelity/mo2-inventory.json')))
gen_inv = json.load(open(os.path.join(work, 'gen', 'gen-inventory.json')))
inv_scores = json.load(open(os.path.join(work, 'gen', 'inventory-scores.json')))


def rgb(path):
    return np.asarray(Image.open(path).convert('RGB'))


def fit(img, w, h):
    if img.shape[1] == w and img.shape[0] == h:
        return img
    return np.asarray(Image.fromarray(img).resize((w, h), Image.NEAREST))


def compose_orig(sheet):
    """Paper content rendered from its flattened copy, viewport pasted in."""
    canvas = fit(rgb(os.path.join(work, 'render', f"{sheet['id']}-orig-paper.png")), W, H).copy()
    vp = sheet['viewport']
    if vp:
        w, h = round(vp['w'] * PX), round(vp['h'] * PX)
        img = fit(rgb(os.path.join(work, 'render', f"{sheet['id']}-orig-vp.png")), w, h)
        x0 = round(vp['x'] * PX)
        y0 = round((297 - vp['y'] - vp['h']) * PX)
        canvas[y0:y0 + h, x0:x0 + w] = img
    return canvas


def text_boxes(texts, dims):
    """Approximate text extents (paper mm) for masking."""
    boxes = []
    items = [(t['t'], t['x'], t['y'], t['h'], t.get('r', 0), t.get('a', 0)) for t in texts]
    items += [(d['t'], d['tp'][0], d['tp'][1], 1.5, d.get('r', 0), 1) for d in dims if d.get('tp')]
    for s, x, y, h, r, a in items:
        if not h:
            continue
        w = max(1, len(s)) * 0.62 * h
        x0 = x - (w / 2 if a == 1 else w if a == 2 else 0)
        corners = [(x0, y - 0.3 * h), (x0 + w, y - 0.3 * h), (x0 + w, y + 1.2 * h), (x0, y + 1.2 * h)]
        rad = np.deg2rad(r or 0)
        cx, cy = x, y
        rot = [(cx + (px - cx) * np.cos(rad) - (py - cy) * np.sin(rad),
                cy + (px - cx) * np.sin(rad) + (py - cy) * np.cos(rad)) for px, py in corners]
        xs, ys = [p[0] for p in rot], [p[1] for p in rot]
        boxes.append((min(xs) - 0.5, min(ys) - 0.5, max(xs) + 0.5, max(ys) + 0.5))
    return boxes


def region_mask(boxes):
    m = Image.new('1', (W, H), 0)
    d = ImageDraw.Draw(m)
    x0, y0, x1, y1 = AREA
    d.rectangle([x0 * PX, (297 - y1) * PX, x1 * PX, (297 - y0) * PX], fill=1)
    for bx0, by0, bx1, by1 in boxes:
        d.rectangle([bx0 * PX, (297 - by1) * PX, bx1 * PX, (297 - by0) * PX], fill=0)
    return np.asarray(m, dtype=bool)


def dilate(mask, r=DILATE):
    out = mask.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx or dy:
                out |= np.roll(np.roll(mask, dy, 0), dx, 1)
    return out


def f1(o, g):
    no, ng = o.sum(), g.sum()
    if no == 0 and ng == 0:
        return 1.0, 1.0, 1.0
    p = (g & dilate(o)).sum() / ng if ng else 0.0
    r = (o & dilate(g)).sum() / no if no else 0.0
    return (2 * p * r / (p + r) if p + r else 0.0), float(p), float(r)


def classify(img, mask):
    """Nearest ACI index for every ink pixel (0 elsewhere)."""
    idx = np.zeros(mask.shape, dtype=np.int16)
    pix = img[mask].astype(np.float32)
    best = np.zeros(len(pix), dtype=np.int16)
    for start in range(0, len(pix), 200_000):
        chunk = pix[start:start + 200_000]
        d = ((chunk[:, None, :] - aci[None, 1:, :]) ** 2).sum(-1)
        best[start:start + len(chunk)] = d.argmin(1) + 1
    idx[mask] = best
    return idx


results = []
for sheet, inv_o, inv_g, sc in zip(manifest['sheets'], orig_inv['sheets'], gen_inv['sheets'], inv_scores['sheets']):
    sid = sheet['id']
    orig = compose_orig(sheet)
    gen = fit(rgb(os.path.join(work, 'render', f'{sid}-gen.png')), W, H)
    keep = region_mask(text_boxes(inv_o['texts'], inv_o['dims']) + text_boxes(inv_g['texts'], inv_g['dims']))
    ink_o = (orig.max(-1) > INK) & keep
    ink_g = (gen.max(-1) > INK) & keep
    s_hinh, prec, rec = f1(ink_o, ink_g)

    co, cg = classify(orig, ink_o), classify(gen, ink_g)
    colours = {}
    total = ink_o.sum()
    s_mau = 0.0
    for c in np.unique(co[ink_o]):
        share = (co == c).sum() / total
        fc, _, _ = f1(co == c, cg == c)
        colours[int(c)] = {'ty_le': round(float(share), 4), 'F1': round(float(fc), 4)}
        s_mau += share * fc
    if total == 0:
        s_mau = 1.0 if ink_g.sum() == 0 else 0.0

    parts = {
        'S_hinh': round(float(s_hinh), 4),
        'S_mau': round(float(s_mau), 4),
        'S_kiem': round(sc['S_kiem'], 4),
        'S_chu': round(sc['S_chu'], 4),
        'S_dim': round(sc['S_dim'], 4),
    }
    total_score = sum(WEIGHTS[k] * v for k, v in parts.items())
    results.append({
        'to': sid,
        'to_sinh': sc['gen'],
        **parts,
        'DIEM': round(total_score, 4),
        'pixel': {'precision': round(prec, 4), 'recall': round(rec, 4),
                  'muc_goc': int(ink_o.sum()), 'muc_sinh': int(ink_g.sum())},
        'mau': colours,
        'kiem_ke': sc['detail'],
    })

    # Images: original, generated, diff (red: original only, green:
    # generated only, grey: both), and side by side.
    Image.fromarray(orig).save(os.path.join(out, f'{sid}-goc.png'), optimize=True)
    Image.fromarray(gen).save(os.path.join(out, f'{sid}-sinh.png'), optimize=True)
    ao, ag = orig.max(-1) > INK, gen.max(-1) > INK
    diff = np.zeros((H, W, 3), dtype=np.uint8)
    diff[ao & ~dilate(ag)] = (230, 40, 40)
    diff[ag & ~dilate(ao)] = (40, 200, 60)
    both = ao & dilate(ag) | ag & dilate(ao)
    diff[both] = (150, 150, 150)
    # Scored region outline, so what was left out is visible.
    x0, y0, x1, y1 = AREA
    dimg = Image.fromarray(diff)
    ImageDraw.Draw(dimg).rectangle([x0 * PX, (297 - y1) * PX, x1 * PX, (297 - y0) * PX], outline=(60, 90, 200), width=3)
    dimg.save(os.path.join(out, f'{sid}-diff.png'), optimize=True)
    half = (W // 2, H // 2)
    strip = Image.new('RGB', (half[0] * 3 + 40, half[1] + 70), (25, 25, 25))
    d = ImageDraw.Draw(strip)
    for i, (title, im) in enumerate([('GỐC (mo_2)', Image.fromarray(orig)),
                                     (f"SINH ({sc['gen']})", Image.fromarray(gen)),
                                     ('KHÁC (đỏ: chỉ gốc · xanh: chỉ sinh)', dimg)]):
        strip.paste(im.resize(half, Image.LANCZOS), (i * (half[0] + 20), 70))
        d.text((i * (half[0] + 20) + 10, 20), f'{sid} — {title}', fill=(240, 240, 240))
    d.text((10, 48), '  '.join(f'{k}={v}' for k, v in parts.items()) + f'  ĐIỂM={round(total_score, 4)}',
           fill=(255, 220, 120))
    strip.save(os.path.join(out, f'{sid}-canh-nhau.png'), optimize=True)

report = {
    'thoi_diem': datetime.datetime.now().isoformat(timespec='seconds'),
    'phien_ban_sinh': inv_scores.get('version'),
    'nhan': label,
    'trong_so': WEIGHTS,
    'thang_do': '10 px/mm giấy, tờ A3 4200x2970; dung sai 2 px; vùng chấm pixel = vùng hình (x 25–410, y 35–292 mm), đã che chữ',
    'cac_to': results,
    'trung_binh': round(sum(r['DIEM'] for r in results) / len(results), 4),
}
json.dump(report, open(os.path.join(out, 'diem.json'), 'w'), ensure_ascii=False, indent=1)
with open(os.path.join(out, 'diem-history.jsonl'), 'a') as h:
    h.write(json.dumps({k: report[k] for k in ('thoi_diem', 'phien_ban_sinh', 'nhan', 'trung_binh')} |
                       {'cac_to': [{k: r[k] for k in ('to', 'S_hinh', 'S_mau', 'S_kiem', 'S_chu', 'S_dim', 'DIEM')}
                                   for r in results]}, ensure_ascii=False) + '\n')
for r in results:
    print(f"{r['to']} ({r['to_sinh']}): " + '  '.join(f"{k}={r[k]:.3f}" for k in WEIGHTS) + f"  ĐIỂM={r['DIEM']:.3f}")
print(f"Trung bình ĐIỂM = {report['trung_binh']:.3f}")
