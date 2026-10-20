// Builds pool.json: the Pokémon pool, Classic sets, legal moves/abilities, item pool, descriptions.
const {Dex, Teams} = require('/home/claude/ps/dist/sim');
const fs = require('fs');
const dex = Dex.mod('gen9');
const EXCL_TAGS = ['Restricted Legendary', 'Sub-Legendary', 'Mythical', 'Ultra Beast'];

// ---- Pokémon pool: fully evolved, no legendaries/mythicals/UBs, no battle-only formes ----
const pool = [];
const chaosOnly = new Set(); // legendaries etc.: allowed in Chaos only
for (const s of dex.species.all()) {
  if (!s.exists || s.num <= 0) continue;
  if (['CAP', 'Custom', 'LGPE', 'Future', 'Unobtainable', 'Gigantamax'].includes(s.isNonstandard)) continue;
  if (s.evos && s.evos.length) continue;
  if (s.nfe) continue;
  if (s.battleOnly || s.isMega || s.isPrimal || s.isTotem || s.cosmeticFormes === undefined && false) continue;
  if (s.forme && /^(Mega|Gmax|Totem|Primal|Starter|Eternamax|Busted|Original|Antique|Masterpiece|Artisan|Bond|Ash)/.test(s.forme)) continue;
  const legend = s.tags.some(t => EXCL_TAGS.includes(t)) || ['Walking Wake', 'Iron Leaves', 'Gouging Fire', 'Raging Bolt', 'Iron Boulder', 'Iron Crown'].includes(s.baseSpecies);
  // Alternate forms are skipped, except legendaries' out-of-battle forms (Therian, Unbound, fusions…) for Chaos
  if (s.changesFrom && !(legend && !s.battleOnly && !s.requiredItem && !s.requiredItems && !s.isNonstandard)) continue;
  if (s.name === 'Meltan') continue; // not fully evolved (evolves into Melmetal)
  if (['Vivillon-Fancy','Vivillon-Pokeball','Squawkabilly-Blue','Squawkabilly-Yellow','Squawkabilly-White','Maushold-Four','Tatsugiri-Droopy','Tatsugiri-Stretchy','Dudunsparce-Three-Segment','Floette-Eternal','Basculin-Blue-Striped'].includes(s.name)) continue;
  if (/Totem/.test(s.forme) || s.name === 'Pichu-Spiky-eared') continue;
  { const b = dex.species.get(s.baseSpecies); if (s.forme && b.cosmeticFormes && b.cosmeticFormes.includes(s.name)) continue; }            // in-battle / item-dependent forms (e.g. Arceus types, Silvally, Zygarde)
  if (s.requiredItem || s.requiredItems) continue;
  if (s.name === 'Pikachu' || s.baseSpecies === 'Pikachu' && s.forme) continue;
  if (s.forme === 'Paldea-Combat' || s.forme === 'Paldea-Blaze' || s.forme === 'Paldea-Aqua') { /* keep Tauros forms */ }
  if (s.tags.some(t => EXCL_TAGS.includes(t)) ||
    ['Walking Wake', 'Iron Leaves', 'Gouging Fire', 'Raging Bolt', 'Iron Boulder', 'Iron Crown'].includes(s.baseSpecies)) chaosOnly.add(s.id);
  pool.push(s);
}

// ---- Legal moves: union of this species + prevos, restricted to the latest gen it appears in ----
function learnsetFor(s) {
  const out = {}; let cur = s;
  const seen = new Set();
  while (cur && cur.exists && !seen.has(cur.id)) {
    seen.add(cur.id);
    let ls = dex.data.Learnsets[cur.id];
    if ((!ls || !ls.learnset) && cur.changesFrom) ls = dex.data.Learnsets[dex.toID(cur.changesFrom)];
    if ((!ls || !ls.learnset) && cur.baseSpecies !== cur.name) ls = dex.data.Learnsets[dex.toID(cur.baseSpecies)];
    if (ls && ls.learnset) for (const [m, src] of Object.entries(ls.learnset)) (out[m] ||= []).push(...src);
    cur = cur.prevo ? dex.species.get(cur.prevo) : null;
  }
  return out;
}
function latestGenMoves(s) {
  const ls = learnsetFor(s);
  let maxGen = 0;
  for (const src of Object.values(ls)) for (const x of src) maxGen = Math.max(maxGen, +x[0]);
  const moves = [];
  for (const [m, src] of Object.entries(ls)) {
    if (!src.some(x => +x[0] === maxGen)) continue;
    const mv = dex.moves.get(m);
    if (!mv.exists || mv.isZ || mv.isMax || mv.isNonstandard === 'CAP' || mv.isNonstandard === 'LGPE') continue;
    moves.push(mv.id);
  }
  return {maxGen, moves: moves.sort()};
}

// ---- Classic sets: Showdown Random Battle sets (newest gen that has the Pokémon) ----
const gens = [9, 8, 7, 6, 5, 4, 3];
const setsByGen = {};
for (const g of gens) setsByGen[g] = JSON.parse(fs.readFileSync(`/home/claude/ps/data/random-battles/gen${g}/sets.json`));
const BAD_ITEM = it => { const i = dex.items.get(it); return !i.exists || i.megaStone || i.zMove || i.id === 'eviolite' || i.isGem; };
function classicSet(s) {
  for (const g of gens) {
    const sd = setsByGen[g];
    if (!sd[s.id]) continue;
    // static set: same seed per species every day
    const seed = [s.num & 0xffff, 7, 11, 13];
    const gen = Teams.getGenerator(`gen${g}randombattle`, seed);
    let set;
    try { set = gen.randomSet(Dex.forGen(g).species.get(s.id), {}, false, false); }
    catch (e) { try { set = gen.randomSet(Dex.forGen(g).species.get(s.id), {}, false); } catch (e2) { continue; } }
    if (!set || !set.moves || set.moves.length < 1) continue;
    let moves = set.moves.map(m => dex.moves.get(m).id).filter(m => dex.moves.get(m).exists);
    // Hidden Power keeps working in NatDex; strip any type suffix casing
    let item = set.item;
    if (BAD_ITEM(item)) item = set.moves.some(m => dex.moves.get(m).category === 'Status') ? 'Leftovers' : 'Life Orb';
    let ability = set.ability;
    if (!Object.values(s.abilities).includes(ability)) ability = s.abilities[0];
    return {gen: g, role: set.role || '', moves, item: dex.items.get(item).name, ability, evs: set.evs, ivs: set.ivs};
  }
  return null;
}

// ---- Classic doubles sets: Showdown Random Doubles sets (gen 9 only); falls back to the singles set ----
const doublesSets = JSON.parse(fs.readFileSync('/home/claude/ps/data/random-battles/gen9/doubles-sets.json'));
function classicDoublesSet(s) {
  const id = doublesSets[s.id] ? s.id : (doublesSets[dex.toID(s.baseSpecies)] ? dex.toID(s.baseSpecies) : null);
  if (!id) return null;
  // Showdown builds each set from a movepool at random; try several and prefer one with Protect (or a variant)
  let set;
  for (let k = 0; k < 30; k++) {
    const gen = Teams.getGenerator('gen9randomdoublesbattle', [s.num & 0xffff, 5, 9, 17 + k]);
    let t; try { t = gen.randomSet(Dex.forGen(9).species.get(id), {}, false, true); } catch (e) { if (k === 0) return null; continue; }
    if (!t || !t.moves || !t.moves.length) { if (k === 0) return null; continue; }
    if (!set) set = t;
    if (t.moves.some(m => PROTECTS.has(dex.toID(m)))) { set = t; break; }
  }
  if (!set) return null;
  const moves = set.moves.map(m => dex.moves.get(m).id).filter(m => dex.moves.get(m).exists);
  let item = set.item;
  if (BAD_ITEM(item)) item = 'Sitrus Berry';
  let ability = set.ability;
  if (!Object.values(s.abilities).includes(ability)) ability = s.abilities[0];
  return {gen: 9, role: set.role || '', moves, item: dex.items.get(item).name, ability, evs: set.evs, ivs: set.ivs};
}

const PROTECTS = new Set(['protect', 'detect', 'spikyshield', 'kingsshield', 'banefulbunker', 'silktrap', 'burningbulwark', 'obstruct', 'maxguard']);
// Singles-only moves, swapped out first when a doubles set needs Protect
const SINGLES_ONLY = ['terablast', 'stealthrock', 'spikes', 'toxicspikes', 'stickyweb', 'defog', 'rapidspin', 'mortalspin', 'courtchange', 'whirlwind', 'roar', 'dragontail', 'circlethrow', 'teleport', 'partingshot', 'flipturn', 'uturn', 'voltswitch', 'chillyreception', 'shedtail', 'substitute', 'toxic', 'haze', 'clearsmog', 'pursuit', 'rest', 'sleeptalk'];
/** For Pokémon without a Showdown doubles set: the Classic set with Protect in place of its least doubles-friendly move. */
function protectVariant(c, legal, types) {
  if (!c || !legal.includes('protect') || c.moves.some(m => PROTECTS.has(m))) return null;
  const it = dex.items.get(c.item);
  if (it.isChoice || it.id === 'assaultvest') return null;
  const moves = c.moves.slice(0, 4);
  let drop = SINGLES_ONLY.map(m => moves.indexOf(m)).find(i => i >= 0);
  if (drop === undefined) {
    // otherwise the weakest attack (status moves usually define the set, so they stay)
    // Otherwise the weakest attack (counting STAB), as long as at least one other attack stays; else a status move
    const power = mv => { const special = {return: 102, frustration: 102, knockoff: 97, facade: /orb/i.test(c.item) ? 140 : 70}; const p = special[mv.id] || mv.basePower || 80; return p * (types.includes(mv.type) ? 1.5 : 1); };
    const attacks = moves.map((m, i) => [i, dex.moves.get(m)]).filter(([, mv]) => mv.category !== 'Status');
    if (attacks.length >= 2) drop = attacks.reduce((a, b) => power(b[1]) < power(a[1]) ? b : a)[0];
    else drop = moves.findIndex(m => dex.moves.get(m).category === 'Status');
    if (drop < 0) drop = moves.length - 1;
  }
  if (moves.length < 4) moves.push('protect'); else moves[drop] = 'protect';
  return {...c, moves, role: 'Doubles (Protect added)'};
}

// ---- Item pool (held items with a battle effect) ----
const NO_EFFECT_KEYS = new Set(['name','num','gen','spritenum','fling','desc','shortDesc','isNonstandard','naturalGift','id','fullname','effectType','exists','kind','sourceEffect','status','duration','noCopy','affectsFainted','sourceEffect','isBerry','isGem','isPokeball','isChoice','megaStone','megaEvolves','zMove','zMoveType','zMoveFrom','itemUser','forcedForme','onPlate','onMemory','onDrive','ignoreKlutz','boosts','condition','rating','realMove','infiltrates','isBreakable']);
const items = [];
for (const it of dex.items.all()) {
  if (!it.exists || it.isPokeball || it.megaStone || it.zMove || it.isGem) continue;
  if (['CAP', 'Custom', 'LGPE', 'Unobtainable'].includes(it.isNonstandard)) continue;
  if (it.id === 'eviolite' || it.itemUser || it.onDrive || it.onMemory || it.forcedForme) continue;
  if (['redorb','blueorb','rustedsword','rustedshield','boosterenergy'].includes(it.id) && it.id !== 'boosterenergy') continue;
  if (it.gen === 2 && it.isNonstandard === 'Past') continue;
  const effectful = Object.keys(it).some(k => !NO_EFFECT_KEYS.has(k) && it[k] !== false && typeof it[k] !== 'undefined' && (k.startsWith('on') || k === 'boosts' || k === 'isChoice'))
    || it.isChoice || it.onPlate;
  if (!effectful) continue;
  items.push(it.name);
}

// ---- Assemble ----
const out = {species: {}, items: items.sort()};
let noClassic = [];
for (const s of pool) {
  const {maxGen, moves} = latestGenMoves(s);
  if (!moves.length) continue;
  let c = classicSet(s);
  if (!c && s.forme) { c = classicSet(dex.species.get(s.baseSpecies)); if (c && !Object.values(s.abilities).includes(c.ability)) c.ability = s.abilities[0]; }
  const banned = chaosOnly.has(s.id);
  let cd = classicDoublesSet(s);
  cd = (cd && protectVariant(cd, moves, s.types)) || cd || protectVariant(c, moves, s.types);
  if (!c && !banned) { noClassic.push(s.name); continue; }
  out.species[s.id] = {
    name: s.name, num: s.num, types: s.types, bs: s.baseStats, abilities: [...new Set(Object.values(s.abilities))],
    gen: maxGen, moves, classic: c, w: s.weightkg, forme: s.forme || '', base: s.baseSpecies, ...(banned ? {chaosOnly: true} : {}), ...(cd ? {classicD: cd} : {}),
  };
}
fs.writeFileSync(process.argv[2], JSON.stringify(out));
console.log('pool', Object.keys(out.species).length, 'items', items.length, 'noClassic', noClassic.length, noClassic.join(', '));

// ---- Descriptions + battle message text ----
const T = n => require(`/home/claude/ps/dist/data/text/${n}.js`);
const MovesText = T('moves').MovesText, AbilitiesText = T('abilities').AbilitiesText, ItemsText = T('items').ItemsText, DefaultText = T('default').DefaultText;
const strip = tbl => { const o = {}; for (const [id, e] of Object.entries(tbl)) { const c = {}; for (const [k, v] of Object.entries(e)) { if (k === 'desc' || k === 'shortDesc') continue; if (typeof v === 'object') { const g = {}; for (const [k2, v2] of Object.entries(v)) if (k2 !== 'desc' && k2 !== 'shortDesc') g[k2] = v2; if (Object.keys(g).length) c[k] = g; } else c[k] = v; } o[id] = c; } return o; };
fs.writeFileSync('/home/claude/dailyred/build/battletext.json', JSON.stringify({Default: DefaultText, Moves: strip(MovesText), Abilities: strip(AbilitiesText), Items: strip(ItemsText)}));
const desc = {m: {}, a: {}, i: {}};
const RED_MOVES = ['protect','heatwave','muddywater','highhorsepower','expandingforce','electroweb','followme','helpinghand','thunderbolt','surf','grassknot','fakeout','psychic','shadowball','dazzlinggleam','calmmind','bodyslam','earthquake','crunch','curse','gigadrain','sludgebomb','earthpower','sleeppowder','flamethrower','airslash','focusblast','dragonpulse','shellsmash','hydropump','icebeam','darkpulse'];
const allMoves = new Set(RED_MOVES); for (const s of Object.values(out.species)) { s.moves.forEach(m => allMoves.add(m)); (s.classic?.moves || []).forEach(m => allMoves.add(m)); (s.classicD?.moves || []).forEach(m => allMoves.add(m)); }
for (const m of allMoves) { const t = MovesText[m]; desc.m[m] = (t && (t.shortDesc || t.desc)) || ''; }
for (const s of Object.values(out.species)) for (const a of s.abilities) { const id = dex.toID(a); const t = AbilitiesText[id]; desc.a[id] = (t && (t.shortDesc || t.desc)) || ''; }
for (const i of [...out.items, 'Light Ball', 'Leftovers', 'Black Sludge', 'Heavy-Duty Boots', 'White Herb']) { const id = dex.toID(i); const t = ItemsText[id]; desc.i[id] = (t && (t.shortDesc || t.desc)) || ''; }
for (const s of Object.values(out.species)) { for (const c of [s.classic, s.classicD]) { if (!c) continue; const id = dex.toID(c.item); if (!(id in desc.i)) { const t = ItemsText[id]; desc.i[id] = (t && (t.shortDesc || t.desc)) || ''; } } }
['static','lightningrod','magicbounce','thickfat','chlorophyll','blaze','torrent','overgrow','synchronize','immunity'].forEach(id => { const t = AbilitiesText[id]; desc.a[id] = (t && (t.shortDesc || t.desc)) || ''; });
fs.writeFileSync('/home/claude/dailyred/build/desc.json', JSON.stringify(desc));
console.log('text written', fs.statSync('/home/claude/dailyred/build/battletext.json').size, fs.statSync('/home/claude/dailyred/build/desc.json').size);
