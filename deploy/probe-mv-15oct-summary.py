#!/usr/bin/env python3
"""Probe the owner's 15-Oct-2026.xlsx: sheet names, headers, row counts, sample rows."""
import zipfile, re
from xml.etree import ElementTree as ET

SRC = '/Users/macxstore/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/BBCE80A2-397A-4C7F-B86E-C49184FC1317/15-Oct-2026.xlsx'
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
EMU_COL = re.compile(r'[A-Z]+')

def col_index(ref):
    letters = EMU_COL.match(ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1

z = zipfile.ZipFile(SRC)
shared = []
ss = ET.fromstring(z.read('xl/sharedStrings.xml'))
for si in ss:
    texts = si.findall('.//m:t', NS)
    shared.append(''.join(t.text or '' for t in texts))

wb = ET.fromstring(z.read('xl/workbook.xml'))
rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
relmap = {r.get('Id'): r.get('Target') for r in rels}
sheets = [(s.get('name'), relmap.get(s.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')))
          for s in wb.find('m:sheets', NS)]

for name, target in sheets:
    target = target if target.startswith('xl/') else 'xl/' + target
    root = ET.fromstring(z.read(target))
    rows = root.find('m:sheetData', NS)
    all_rows = list(rows)
    print(f"\n===== SHEET: {name} | total_rows={len(all_rows)} =====")
    # find header-like row: first row with >=4 cells
    header = None
    data_rows = []
    for row in all_rows:
        cells = {}
        for c in row.findall('m:c', NS):
            t = c.get('t')
            v = c.find('m:v', NS)
            isv = c.find('m:is', NS)
            if t == 's' and v is not None:
                idx = int(v.text)
                val = shared[idx] if idx < len(shared) else f'<SS:{idx}>'
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
        data_rows.append(cells)
    if header is None:
        print(' NO HEADER FOUND — first 5 raw rows:')
        for row in all_rows[:5]:
            print('  ', [(c.get('r'), c.get('t'), (c.find('m:v', NS).text if c.find('m:v', NS) is not None else '')) for c in row][:12])
        continue
    maxc = max(header)
    hdr = [header.get(i) for i in range(maxc + 1)]
    print(f' HEADER: {hdr}')
    # count non-empty rows (>=3 filled cells)
    filled = [r for r in data_rows if len([v for v in r.values() if v not in (None, '')]) >= 3]
    print(f' data_rows(with >=3 filled cells): {len(filled)}')
    for r in filled[:3]:
        print('  ROW:', [r.get(i) for i in range(maxc + 1)])
