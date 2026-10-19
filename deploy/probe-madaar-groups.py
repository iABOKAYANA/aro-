#!/usr/bin/env python3
"""Full group-level summary of Madaar xlsx + extract rows to JSON."""
import zipfile, re, json
from xml.etree import ElementTree as ET
from collections import defaultdict

SRC = '/Users/macxstore/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/AC95FBE6-D149-4454-A337-15EF69854228/Madaar - All Projects Availability.xlsx'
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
root = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))

def read_row(row):
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
    return cells

rows = []
for r in map(read_row, root.find('m:sheetData', NS)):
    if r.get(0) in (None, '', 'Neighborhood'):
        continue
    clean = lambda s: re.sub(r'\s+', ' ', (s or '').strip())
    rows.append({
        'neighborhood': clean(r.get(0)),
        'cluster': clean(r.get(1)),
        'building': clean(r.get(2)),
        'category': clean(r.get(3)),
        'unitcode': clean(r.get(4)),
        'type': clean(r.get(5)),
        'price': float(r.get(6) or 0),
        'area': float(r.get(7) or 0),
        'garden': float(r.get(8) or 0),
        'rooms': r.get(9),
    })

groups = defaultdict(list)
for r in rows:
    groups[(r['neighborhood'], r['cluster'])].append(r)
for (nb, cl), rs in sorted(groups.items()):
    cats = defaultdict(int)
    for r in rs: cats[r['category']] += 1
    bad = [r for r in rs if r['price'] <= 0 or r['area'] <= 0]
    dupcodes = len(rs) - len(set(r['unitcode'] for r in rs))
    print(f'{nb:14s} | {cl:14s} rows={len(rs):3d} price {min(x["price"] for x in rs):>13,.0f}–{max(x["price"] for x in rs):>14,.0f} cats={dict(cats)} bad={len(bad)} dup={dupcodes}')

bad_rows = [r for r in rows if r['price'] <= 0 or r['area'] <= 0]
print('\nbad rows:', len(bad_rows), json.dumps(bad_rows[:6], ensure_ascii=False))
allcodes = [r['unitcode'] for r in rows]
print('total:', len(rows), 'unique codes:', len(set(allcodes)))
print('\nSokhna rows:', json.dumps([r for r in rows if r['neighborhood']=='Azha Sokhna'], ensure_ascii=False, indent=1)[:800])
json.dump(rows, open('/tmp/madaar-rows.json', 'w'))
print('\nsaved /tmp/madaar-rows.json')
