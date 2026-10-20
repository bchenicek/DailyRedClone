import json, csv, re, os, sys
from PIL import Image
pool = json.load(open('/home/claude/dailyred/build/pool.json'))
ids = {r['identifier']: int(r['id']) for r in csv.DictReader(open('/home/claude/pokeapi/data/v2/csv/pokemon.csv'))}
SPECIAL = {'-dusk-mane': '-dusk', '-dawn-wings': '-dawn', '-f': '-female', '-paldea-combat': '-paldea-combat-breed', '-paldea-blaze': '-paldea-blaze-breed', '-paldea-aqua': '-paldea-aqua-breed'}
entries = dict(pool['species'])
for sid, num in [('mudkip',258),('pikachu',25),('espeon',196),('snorlax',143),('venusaur',3),('charizard',6),('blastoise',9)]:
    entries.setdefault(sid, {'name': sid.title(), 'num': num, 'forme': ''})
# Forms a Pokémon can change into mid-battle (Palafin-Hero, Aegislash-Blade, Mimikyu-Busted, ...) need sprites too
BATTLE_FORMS = ['Palafin-Hero', 'Aegislash-Blade', 'Castform-Sunny', 'Castform-Rainy', 'Castform-Snowy', 'Cherrim-Sunshine',
  'Darmanitan-Zen', 'Darmanitan-Galar-Zen', 'Meloetta-Pirouette', 'Greninja-Ash', 'Zygarde-Complete', 'Wishiwashi-School',
  'Minior-Meteor', 'Mimikyu-Busted', 'Necrozma-Ultra', 'Cramorant-Gulping', 'Cramorant-Gorging', 'Eiscue-Noice',
  'Morpeko-Hangry', 'Zacian-Crowned', 'Zamazenta-Crowned', 'Terapagos-Terastal']
for n in BATTLE_FORMS:
    sid = re.sub(r'[^a-z0-9]', '', n.lower())
    base = re.sub(r'[^a-z0-9]', '', n.split('-')[0].lower())
    num = next((e['num'] for e in pool['species'].values() if re.sub(r'[^a-z0-9]', '', e['name'].lower()) == base), None)
    if num: entries.setdefault(sid, {'name': n, 'num': num, 'forme': n.split('-', 1)[1]})
FRONT, BACK = '/home/claude/pokesprites/sprites/pokemon/', '/home/claude/pokesprites/sprites/pokemon/back/'
mapping, miss = {}, []
for sid, s in entries.items():
    if not s['forme']:
        pid = s['num']
    else:
        ident = re.sub(r"[^a-z0-9-]", '', s['name'].lower().replace(' ', '-'))
        for k, v in SPECIAL.items():
            if ident.endswith(k): ident = ident[:-len(k)] + v
        pid = ids.get(ident)
        if pid is None:
            # try prefix match (e.g. gourgeist-small)
            cands = [i for n, i in ids.items() if n.startswith(ident)]
            pid = cands[0] if cands else None
    if pid is None or not os.path.exists(f'{FRONT}{pid}.png'):
        miss.append((s['name'], pid)); pid = s['num']
    mapping[sid] = pid
print('missing', miss)
keys = sorted(mapping)
C, CELL = 24, 96
rows = (len(keys) + C - 1) // C
front = Image.new('RGBA', (C*CELL, rows*CELL)); back = Image.new('RGBA', (C*CELL, rows*CELL))
index, noback = {}, []
for i, sid in enumerate(keys):
    pid = mapping[sid]; x, y = (i % C)*CELL, (i // C)*CELL
    f = Image.open(f'{FRONT}{pid}.png').convert('RGBA')
    front.paste(f.resize((CELL, CELL), Image.NEAREST) if f.size != (CELL, CELL) else f, (x, y))
    bp = f'{BACK}{pid}.png'
    if os.path.exists(bp):
        b = Image.open(bp).convert('RGBA'); back.paste(b.resize((CELL, CELL), Image.NEAREST) if b.size != (CELL,CELL) else b, (x, y))
    else:
        back.paste(f.transpose(Image.FLIP_LEFT_RIGHT), (x, y)); noback.append(sid)
    index[sid] = i
front.save('/home/claude/dailyred/assets/front.png', optimize=True)
back.save('/home/claude/dailyred/assets/back.png', optimize=True)
import hashlib
ver = hashlib.sha1(open('/home/claude/dailyred/assets/front.png', 'rb').read() + open('/home/claude/dailyred/assets/back.png', 'rb').read()).hexdigest()[:10]
# 'v' versions the sheet URLs, so a cached older sheet is never paired with this index
json.dump({'cols': C, 'cell': CELL, 'rows': rows, 'v': ver, 'index': index}, open('/home/claude/dailyred/build/sprites.json', 'w'))
print(len(keys), 'noback', len(noback))
