#!/usr/bin/env python3
"""Diff 15-Oct-2026.xlsx vs prod DB: which unit codes exist / missing per sheet-project."""
import zipfile, re, json, subprocess
from xml.etree import ElementTree as ET

SRC = '/Users/macxstore/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/BBCE80A2-397A-4C7F-B86E-C49184FC1317/15-Oct-2026.xlsx'
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
COL = re.compile(r'[A-Z]+')

def col_index(ref):
    letters = COL.match(ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1

z = zipfile.ZipFile(SRC)
shared = []
ss = ET.fromstring(z.read('xl/sharedStrings.xml'))
for si in ss:
    shared.append(''.join(t.text or '' for t in si.findall('.//m:t', NS)))

wb = ET.fromstring(z.read('xl/workbook.xml'))
rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
relmap = {r.get('Id'): r.get('Target') for r in rels}
sheets = [(s.get('name'), relmap.get(s.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')))
          for s in wb.find('m:sheets', NS)]

out = {}
for name, target in sheets:
    target = target if target.startswith('xl/') else 'xl/' + target
    root = ET.fromstring(z.read(target))
    all_rows = list(root.find('m:sheetData', NS))
    header = None
    data = []
    for row in all_rows:
        cells = {}
        for c in row.findall('m:c', NS):
            t = c.get('t')
            v = c.find('m:v', NS)
            isv = c.find('m:is', NS)
            if t == 's' and v is not None:
                idx = int(v.text)
                val = shared[idx] if idx < len(shared) else None
            elif isv is not None:
                val = ''.join(x.text or '' for x in isv.findall('.//m:t', NS))
            elif v is not None:
                val = v.text
            else:
                val = None
            cells[col_index(c.get('r'))] = val
        vals = [v for v in cells.values() if v not in (None, '')]
        if header is None and len(vals) >= 4:
            header = cells
            continue
        if len(vals) >= 3:
            data.append(cells)
    if not header:
        continue
    maxc = max(header)
    rows = []
    for r in data:
        rows.append([r.get(i) for i in range(maxc + 1)])
    out[name] = rows

json.dump(out, open('/tmp/mv15-sheetdata.json', 'w'))
print('sheets captured:', [(k, len(v)) for k, v in out.items()])

# status/exclusion scan on shared strings & categories
cats = {}
statuses = {}
for sheet, rows in out.items():
    for r in rows:
        cat = (r[3] or '').strip() if len(r) > 3 else ''
        cats[cat] = cats.get(cat, 0) + 1
        st = (r[12] or '').strip() if len(r) > 12 else ''
        statuses[st] = statuses.get(st, 0) + 1
print('\nCATEGORIES:', json.dumps(cats, ensure_ascii=False))
print('\nDELIVERY STATUS:', json.dumps(statuses, ensure_ascii=False))
prices_bad = []
for sheet, rows in out.items():
    for r in rows:
        try:
            p = float(r[5] or 0)
        except (ValueError, TypeError, IndexError):
            prices_bad.append((sheet, r[2], r[5]))
            continue
        if p <= 0:
            prices_bad.append((sheet, r[2], r[5]))
print('\nZERO/BAD PRICES:', len(prices_bad), prices_bad[:10])
codes = [r[2] for rows in out.values() for r in rows]
print('\nTOTal codes:', len(codes), 'unique:', len(set(codes)))
