#!/usr/bin/env python3
"""Probe Madaar all-projects availability xlsx: headers, rows, sample values, PII scan."""
import zipfile, re, json
from xml.etree import ElementTree as ET

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
rows_xml = list(root.find('m:sheetData', NS))
print('total rows:', len(rows_xml))

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

parsed = [read_row(r) for r in rows_xml]
filled = [r for r in parsed if len([v for v in r.values() if v not in (None, '')]) >= 2]
print('filled rows:', len(filled))
for i, r in enumerate(parsed[:8]):
    maxc = max(r) if r else 0
    print(f'row{i}:', [(k, r[k]) for k in sorted(r) if r[k] not in (None, '')][:14])
print('...')
for i, r in enumerate(filled[8:28], start=8):
    maxc = max(r) if r else 0
    print(f'r{i}:', [(k, r[k]) for k in sorted(r) if r[k] not in (None, '')][:14])
# PII scan
phone = re.compile(r'(\+?20)?\s?1[0-2]\d{8}|0?1[0-2]\d{8}|@')
hits = [(i, k, v) for i, r in enumerate(parsed) for k, v in r.items() if v and phone.search(str(v))]
print('PII-like hits:', len(hits), hits[:10])
# distinct project names guess: dump distinct values of first 3 columns
from collections import Counter
c1 = Counter((r.get(0) or '') for r in filled)
c2 = Counter((r.get(1) or '') for r in filled)
c3 = Counter((r.get(2) or '') for r in filled)
print('col0 distinct:', list(c1.items())[:15])
print('col1 distinct:', list(c2.items())[:20])
print('col2 distinct:', list(c3.items())[:20])
