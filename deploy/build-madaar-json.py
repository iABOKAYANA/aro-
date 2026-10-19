#!/usr/bin/env python3
"""Build deploy/madaar-availability-2026-10-18.json from the owner's xlsx rows:
route every row to its catalog project + attach new-project metadata."""
import json

rows = json.load(open('/tmp/madaar-rows.json'))

# (neighborhood, cluster) → catalog route. Verified against prod catalog:
# exact min-price matches noted where they hold (Solis/Diya/Vela/Elea/Hillage),
# plus conclusive name identity for Ogma/Ophelia. Clusters WITHOUT catalog
# entries become new published projects (owner's standing policy); Sokhna
# clusters stay inside the Sokhna parent as phases, as do Hillage villages.
ROUTE = {
    ('Azha North', 'Ogma'):     {'slug': '1601-ogma',   'phase': None, 'new': None},
    ('Azha North', 'Ophelia'):  {'slug': '2030-ophelia---azha-ras-el-hekma', 'phase': None, 'new': None},
    ('Azha North', 'Diya'):     {'slug': '2164-diya-azha-ras-el-hekma', 'phase': None, 'new': None},
    ('Azha North', 'Vela'):     {'slug': '2165-vela-azha-ras-el-hekma', 'phase': None, 'new': None},
    ('Azha North', 'Elea'):     {'slug': '2437-elea-azha-north', 'phase': None, 'new': None},
    ('Azha North', 'Solis'):    {'slug': '2749-solisn-azha-ras-el-hekma', 'phase': None, 'new': None},
    ('Azha North', 'Lunas'):    {'slug': None, 'new': {'slug': 'lunas-azha-ras-el-hekma', 'name': 'Lunas - Azha Ras El Hekma', 'ar': 'لوناس - أزها راس الحكمة', 'parent': '757-azha-north-coast'}},
    ('Azha North', 'Velais'):   {'slug': None, 'new': {'slug': 'velais-azha-ras-el-hekma', 'name': 'Velais - Azha Ras El Hekma', 'ar': 'ڤيليس - أزها راس الحكمة', 'parent': '757-azha-north-coast'}},
    ('Azha North', 'Sea Veil'): {'slug': None, 'new': {'slug': 'sea-veil-azha-ras-el-hekma', 'name': 'Sea Veil - Azha Ras El Hekma', 'ar': 'سي ڤيل - أزها راس الحكمة', 'parent': '757-azha-north-coast'}},
    ('Azha Sokhna', 'Lacerta'):      {'slug': '88-azha', 'phase': 'Lacerta', 'new': None},
    ('Azha Sokhna', 'AQ Residence'): {'slug': '88-azha', 'phase': 'AQ Residence', 'new': None},
    ('The Hillage', 'Village C'):    {'slug': '2139-the-hillage', 'phase': 'Village C', 'new': None},
    ('The Hillage', 'Village D'):    {'slug': '2139-the-hillage', 'phase': 'Village D', 'new': None},
}

UNITTYPE = {
    'Standalone': 'VILLA',
    'Twin': 'VILLA',
    'Family House': 'VILLA',
    'Chalet': 'CHALET',
    'Penthouse': 'PENTHOUSE',
    'Town': 'TOWNHOUSE',
    'Apartment': 'APARTMENT',
}
AR_CAT = {
    'Standalone': 'فيلا مستقلة',
    'Twin': 'توين هاوس',
    'Family House': 'فاميلي هاوس',
    'Chalet': 'شاليه',
    'Penthouse': 'بنتهاوس',
    'Town': 'تاون هاوس',
    'Apartment': 'شقة',
}

out_rows = []
skipped = []
for r in rows:
    key = (r['neighborhood'], r['cluster'])
    route = ROUTE.get(key)
    if not route:
        skipped.append(key)
        continue
    ut = UNITTYPE.get(r['category'])
    if not ut:
        skipped.append(r['unitcode'])
        continue
    if route['new']:
        slug = route['new']['slug']; phase = None
    else:
        slug = route['slug']; phase = route.get('phase')
    out_rows.append({
        'slug': slug,
        'phase': phase,
        'unitNumber': r['unitcode'],
        'nameEn': f"{r['category']} {r['type']} · {int(r['area'])} sqm",
        'nameAr': f"{AR_CAT[r['category']]} {r['type']} · {int(r['area'])} م²",
        'unitType': ut,
        'beds': int(r['rooms']) if r['rooms'] else None,
        'area': int(r['area']),
        'garden': int(r['garden']) if r['garden'] else None,
        'price': round(r['price']),
        'building': r['building'],
    })

assert not skipped, skipped[:20]
assert len(out_rows) == 135, len(out_rows)

newProjects = {}
for r in out_rows:
    pass
for (nb, cl), route in ROUTE.items():
    if route['new']:
        newProjects[route['new']['slug']] = route['new']

json.dump({'rows': out_rows, 'newProjects': newProjects}, open('/Users/macxstore/Desktop/GHAYA/GHAYA_ESTATE_APP/deploy/madaar-availability-2026-10-18.json', 'w'), ensure_ascii=False, indent=1)

from collections import Counter
c = Counter(r['slug'] for r in out_rows)
print('rows per project:')
for k, v in sorted(c.items()):
    print(' ', k, v)
print('new projects:', list(newProjects))
