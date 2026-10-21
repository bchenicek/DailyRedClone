// Daily seeds, team generation for each mode, Red's team, and Red's AI.
import {moveIsNotUseless} from './viable';
declare const PS: any;

export type BaseMode = 'classic' | 'chaos' | 'random';
/** A mode id ending in "D" is the doubles version of that mode (each has its own daily team). */
export type Mode = BaseMode | 'classicD' | 'chaosD' | 'randomD';
export const baseMode = (m: Mode) => m.replace(/D$/, '') as BaseMode;
export const isDoublesMode = (m: Mode) => m.endsWith('D');
export type Difficulty = 'smart' | 'simple' | 'true';
export interface PoolEntry {
  name: string; num: number; types: string[]; bs: Record<string, number>; abilities: string[];
  gen: number; moves: string[]; w: number; forme: string; base: string;
  classic: {gen: number; role: string; moves: string[]; item: string; ability: string; evs: any; ivs: any};
}
export interface Pool { species: Record<string, PoolEntry>; items: string[] }
export interface PokemonSet {
  name: string; species: string; item: string; ability: string; moves: string[];
  level: number; evs: any; ivs: any; nature?: string; gender?: string;
}

// ---------- Dates and seeds ----------
export function localDateKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const EPOCH = Date.UTC(2026, 9, 15); // Day #1 = 2026-10-16
export function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000);
}
/** FNV-1a based string hash → four 16-bit words, the format Showdown's Gen 5 RNG takes. */
export function seedFor(text: string): string {
  const words: number[] = [];
  for (let k = 0; k < 4; k++) {
    let h = 0x811c9dc5 ^ (k * 0x9e3779b1);
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
    words.push(h & 0xffff);
  }
  return words.join(',');
}
export const battleSeed = (date: string, mode: Mode) => seedFor(`daily-red|${date}|${mode}|battle`);

// ---------- Team generation ----------
const EVS = {hp: 84, atk: 84, def: 84, spa: 84, spd: 84, spe: 84};
const IVS = {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31};

const CHAOS_SLOTS_FROM = '2026-10-19';
// From Oct 20, 2026 each Pokémon's moves are listed in a fixed order (earlier days keep theirs so saved replays still play back)
const MOVE_ORDER_FROM = '2026-10-20';
// From Oct 20, 2026 every Pokémon's gender is part of the day's team (by its species' real gender ratio), so it
// no longer depends on who leads; Red's six are all male. Earlier days keep the simulator's pick so replays match.
const GENDER_FROM = '2026-10-20';
/**
 * Sets without a nature get one of the five neutral natures (Hardy, Docile, Serious, Bashful, Quirky), picked from the
 * day and species. They change no stats and use none of the battle's luck, so every day, past ones included, plays the same.
 */
const NEUTRAL = ['Hardy', 'Docile', 'Serious', 'Bashful', 'Quirky'];
// From Oct 21, 2026 (and in every Endless run) your Pokémon get what the original Daily Red gives them: a random nature
// out of all 25 and random IVs from 25 to 31. Both come from their own seed, so the Pokémon, moves and battle luck don't change.
const RANDOM_NATURES_FROM = '2026-10-21';
/** Chaos: one damaging move of each of the Pokémon's types, from this date (Endless runs with the 's' flag). */
export const CHAOS_STAB_FROM = '2026-10-22';
/** Endless keys look like x<run id>-<battle number><flags>; returns the flags, or null for a daily date. */
export function endlessFlags(key: string): string | null { const m = /^x[^-]*-\d+([a-z]*)$/.exec(key); return m ? m[1] : null; }
const ALL_NATURES = ['Adamant', 'Bashful', 'Bold', 'Brave', 'Calm', 'Careful', 'Docile', 'Gentle', 'Hardy', 'Hasty', 'Impish', 'Jolly', 'Lax',
  'Lonely', 'Mild', 'Modest', 'Naive', 'Naughty', 'Quiet', 'Quirky', 'Rash', 'Relaxed', 'Sassy', 'Serious', 'Timid'];
function withNatures(team: PokemonSet[], date: string, mode: Mode) {
  // Classic keeps neutral natures. Endless runs started before this rule (keys without the 'c' suffix) keep random ones to the end.
  const legacyEndless = endlessFlags(date) !== null && !endlessFlags(date)!.includes('c');
  const randomNatures = date >= RANDOM_NATURES_FROM && !isMudkipDay(date, mode) && (baseMode(mode) !== 'classic' || legacyEndless);
  if (randomNatures) return team.map(s => {
    const prng = new PS.PRNG(seedFor(`daily-red|${date}|${baseMode(mode)}|${s.species}|nature`));
    const nature = ALL_NATURES[prng.random(ALL_NATURES.length)];
    const ivs: Record<string, number> = {};
    // keep deliberate low IVs from a set (0 Attack on special attackers, 0 Speed for Trick Room)
    for (const k of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) ivs[k] = (s.ivs?.[k] ?? 31) < 25 ? s.ivs[k] : 25 + prng.random(7);
    return {...s, nature, ivs};
  });
  return team.map(s => {
    if (s.nature) return s;
    let h = 0; for (const c of `${date}|${baseMode(mode)}|${s.species}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return {...s, nature: NEUTRAL[h % NEUTRAL.length]};
  });
}
function withGenders(team: PokemonSet[], date: string, mode: Mode) {
  if (date < GENDER_FROM) return team;
  return team.map(s => {
    const sp = PS.Dex.species.get(s.species);
    if (sp.gender) return {...s, gender: sp.gender};
    const r = new PS.PRNG(seedFor(`daily-red|${date}|${baseMode(mode)}|${sp.id}|gender`)).random();
    return {...s, gender: r < (sp.genderRatio?.M ?? 0.5) ? 'M' : 'F'};
  });
}
const PROTECTS = ['protect', 'detect', 'kingsshield', 'spikyshield', 'banefulbunker', 'obstruct', 'silktrap', 'burningbulwark', 'maxguard'];
const UNTARGETED = ['self', 'allySide', 'allyTeam', 'allies', 'all', 'foeSide', 'scripted'];
/**
 * Attacks first (own primary type, then secondary, then others), then status moves aimed at a Pokémon,
 * then status moves with no target (Swords Dance, Follow Me, weather...), each in the same type order; Protect last.
 */
function moveRank(set: PokemonSet, id: string) {
  const mv = PS.Dex.moves.get(id);
  if (PROTECTS.includes(mv.id)) return 99;
  const types: string[] = PS.Dex.species.get(set.species).types;
  const type = mv.id === 'hiddenpower' ? PS.Dex.getHiddenPower(set.ivs || {}).type : mv.type;
  const t = type === types[0] ? 0 : type === types[1] ? 1 : 2;
  const group = mv.category !== 'Status' ? 0 : UNTARGETED.includes(mv.target) ? 2 : 1;
  return group * 3 + t;
}
function ordered(team: PokemonSet[], date: string) {
  if (date < MOVE_ORDER_FROM) return team;
  return team.map(s => ({...s, moves: s.moves.map((m, i) => [m, i] as const).sort((a, b) => moveRank(s, a[0]) - moveRank(s, b[0]) || a[1] - b[1]).map(x => x[0])}));
}
const RANDOM_STAB_FROM = '2026-10-18';
export function generateTeam(pool: Pool, date: string, mode: Mode): PokemonSet[] {
  // Singles and Doubles share one team per mode (difficulty never affects the team)
  if (isMudkipDay(date, mode)) return ordered(mudkipTeam(), date);
  const prng = new PS.PRNG(seedFor(`daily-red|${date}|${baseMode(mode)}|team`));
  // Legendaries, Mythicals, Ultra Beasts and legendary Paradox Pokémon: Chaos only, from Oct 18, 2026
  // (earlier days keep the pool they were played with, so replays match)
  const allowLegends = baseMode(mode) === 'chaos' && date >= '2026-10-18';
  const ids = Object.keys(pool.species).filter(id => allowLegends || !(pool.species[id] as any).chaosOnly).sort();
  let picked: string[] = []; const bases = new Set<string>();
  const add = (list: string[]) => { for (let k = 0; k < 1000; k++) { const id = list[prng.random(list.length)]; const e = pool.species[id]; if (bases.has(e.base)) continue; bases.add(e.base); picked.push(id); return; } };
  if (baseMode(mode) === 'chaos' && date >= CHAOS_SLOTS_FROM) {
    // Chaos from Oct 19, 2026: at least one Legendary or Mythical and at least one Pokémon with BST 450 or lower,
    // plus four more from the whole pool; then shuffled so neither special pick is always in the same slot
    const isLegend = (id: string) => PS.Dex.species.get(pool.species[id].name).tags.some((t: string) => /Legendary|Mythical/.test(t));
    const bst = (id: string) => Object.values(pool.species[id].bs as Record<string, number>).reduce((a, b) => a + b, 0);
    add(ids.filter(isLegend));
    add(ids.filter(id => bst(id) <= 450 && !isLegend(id)));
    while (picked.length < 6) add(ids); // the other four can be anything, including more of either
    picked = sample(picked, 6, prng);
  } else {
    while (picked.length < 6) add(ids);
  }
  // Same Pokémon in Singles and Doubles; Classic Doubles swaps in Showdown's doubles set where one exists
  const fl = endlessFlags(date);
  const stab = baseMode(mode) === 'random' ? date >= RANDOM_STAB_FROM
    : baseMode(mode) === 'chaos' && (fl === null ? date >= CHAOS_STAB_FROM : fl.includes('s'));
  return withGenders(ordered(withNatures(picked.map(id => makeSet(pool, id, baseMode(mode), prng, isDoublesMode(mode), stab)), date, mode), date), date, mode);
}

function makeSet(pool: Pool, id: string, mode: BaseMode, prng: any, doubles = false, stab = false): PokemonSet {
  const e = pool.species[id];
  // Showdown shortens a nickname that equals the species to the base name; a zero-width space keeps the full form name
  const base = {name: e.forme ? e.name + '\u200b' : e.name, species: e.name, level: 100};
  if (mode === 'classic') {
    const c = (doubles && (e as any).classicD) || e.classic;
    // Same EV rule as every mode: 252 in the two best stats (Trick Room sets with 0 Speed IVs never put EVs in Speed)
    const ivs = {...IVS, ...c.ivs}; const moves = c.moves.slice(0, 4);
    return {...base, item: c.item, ability: c.ability, moves, evs: focusedEVs(e.bs, moves, ivs.spe === 0 ? ['spe'] : []), ivs};
  }
  const ability = e.abilities[prng.random(e.abilities.length)];
  const item = pool.items[prng.random(pool.items.length)];
  const legal = e.moves.filter(m => m !== 'struggle');
  let moves: string[];
  if (mode === 'chaos' && stab) {
    // Chaos from Oct 22, 2026: a damaging move of each of the Pokémon's own types first, then any legal moves
    const types = PS.Dex.species.get(e.name).types as string[];
    const shuffled = sample(legal, legal.length, prng);
    moves = [];
    for (const t of types) {
      const pick = shuffled.find(m => { const mv = PS.Dex.moves.get(m); return mv.category !== 'Status' && mv.type === t && !m.startsWith('hiddenpower') && !moves.includes(m); });
      if (pick) moves.push(pick);
    }
    for (const m of shuffled) { if (moves.length >= 4) break; if (!moves.includes(m)) moves.push(m); }
  } else if (mode === 'chaos') {
    moves = sample(legal, Math.min(4, legal.length), prng);
  } else {
    const species = PS.Dex.species.get(e.name);
    const aid = PS.toID(ability), iid = PS.toID(item);
    const shuffled = sample(legal, legal.length, prng);
    moves = [];
    if (stab) {
      // Random from Oct 18, 2026: one damaging move of each of the Pokémon's own types (a useful one when possible)
      for (const t of species.types as string[]) {
        const ofType = (m: string) => { const mv = PS.Dex.moves.get(m); return mv.category !== 'Status' && mv.type === t && !m.startsWith('hiddenpower') && !moves.includes(m); };
        const pick = shuffled.find(m => ofType(m) && moveIsNotUseless(m, species, moves, aid, iid)) || shuffled.find(ofType);
        if (pick) moves.push(pick);
      }
    }
    for (const m of shuffled) {
      if (moves.length >= 4) break;
      if (moves.includes(m)) continue;
      if (m.startsWith('hiddenpower') && moves.some(x => x.startsWith('hiddenpower'))) continue;
      if (moveIsNotUseless(m, species, moves, aid, iid)) moves.push(m);
    }
    if (moves.length < 4) {
      // Not enough viable moves: fill with the strongest remaining attacks
      const rest = legal.filter(m => !moves.includes(m))
        .sort((a, b) => (PS.Dex.moves.get(b).basePower - PS.Dex.moves.get(a).basePower) || (a < b ? -1 : 1));
      moves.push(...rest.slice(0, 4 - moves.length));
    }
  }
  return {...base, item, ability, moves, evs: focusedEVs(e.bs, moves), ivs: {...IVS}};
}

/**
 * EVs as the original Daily Red trains your team: 252 into each of the two highest base stats and the
 * last 6 into HP (or the third-best stat if HP is one of the two). Attack and Sp. Atk only count when a
 * damaging move actually uses them.
 */
export function focusedEVs(bs: Record<string, number>, moves: string[], skip: string[] = []) {
  const uses = {atk: false, spa: false};
  for (const id of moves) {
    const mv = PS.Dex.moves.get(id);
    if (!mv.exists || mv.category === 'Status' || id === 'foulplay') continue;
    if (id === 'bodypress') continue;
    if (mv.category === 'Physical') uses.atk = true; else uses.spa = true;
  }
  const order = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const ranked = order.filter(k => !skip.includes(k) && (k !== 'atk' || uses.atk) && (k !== 'spa' || uses.spa))
    .sort((a, b) => bs[b] - bs[a] || order.indexOf(a) - order.indexOf(b));
  const evs: Record<string, number> = {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
  evs[ranked[0]] = 252; evs[ranked[1]] = 252;
  const rest = ranked[0] === 'hp' || ranked[1] === 'hp' ? ranked[2] : 'hp';
  if (rest) evs[rest] += 6;
  return evs;
}

function sample<T>(arr: T[], n: number, prng: any): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = prng.random(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

// ---------- April 1st: Classic is six Mudkip ----------
function mudkipTeam(): PokemonSet[] {
  const iv = {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31};
  const mk = (name: string, nature: string, item: string, ability: string, moves: string[], evs: Record<string, number>): PokemonSet =>
    ({name, species: 'Mudkip', level: 100, nature, item, ability, moves, evs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...evs}, ivs: {...iv}});
  return [
    mk('Mudkip', 'Adamant', 'Eviolite', 'Torrent', ['liquidation', 'rockslide', 'lowkick', 'protect'], {hp: 252, atk: 252, def: 4}),
    mk('Mudkipz', 'Modest', 'Eviolite', 'Torrent', ['surf', 'icebeam', 'earthpower', 'sludgewave'], {hp: 252, spa: 252, spd: 4}),
    mk('Mudkip Jr.', 'Careful', 'Eviolite', 'Damp', ['curse', 'rest', 'sleeptalk', 'bodyslam'], {hp: 252, def: 4, spd: 252}),
    mk('Big Mudkip', 'Modest', 'Choice Specs', 'Torrent', ['hydropump', 'blizzard', 'earthpower', 'mirrorcoat'], {hp: 4, spa: 252, spe: 252}),
    mk('Sir Mudkip', 'Bold', 'Eviolite', 'Damp', ['yawn', 'protect', 'chillingwater', 'counter'], {hp: 252, def: 252, spd: 4}),
    mk('Mudkip?', 'Jolly', 'Focus Sash', 'Torrent', ['endeavor', 'endure', 'liquidation', 'rocktomb'], {hp: 4, atk: 252, spe: 252}),
  ];
}

// ---------- Red ----------
// Red's EVs are the ones the original Daily Red (amoi.builds) gives him.
export const RED_TEAM: PokemonSet[] = [
  {name: 'Pikachu', species: 'Pikachu', item: 'Light Ball', ability: 'Lightning Rod', level: 100, nature: 'Hasty',
    moves: ['thunderbolt', 'surf', 'grassknot', 'fakeout'], evs: {hp: 0, atk: 124, def: 0, spa: 132, spd: 0, spe: 252}, ivs: {...IVS}},
  {name: 'Espeon', species: 'Espeon', item: 'Life Orb', ability: 'Magic Bounce', level: 100, nature: 'Timid',
    moves: ['psychic', 'shadowball', 'dazzlinggleam', 'calmmind'], evs: {hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252}, ivs: {...IVS}},
  {name: 'Snorlax', species: 'Snorlax', item: 'Leftovers', ability: 'Thick Fat', level: 100, nature: 'Adamant',
    moves: ['bodyslam', 'earthquake', 'crunch', 'curse'], evs: {hp: 252, atk: 252, def: 4, spa: 0, spd: 0, spe: 0}, ivs: {...IVS}},
  {name: 'Venusaur', species: 'Venusaur', item: 'Black Sludge', ability: 'Overgrow', level: 100, nature: 'Modest',
    moves: ['gigadrain', 'sludgebomb', 'earthpower', 'sleeppowder'], evs: {hp: 252, atk: 0, def: 0, spa: 252, spd: 0, spe: 4}, ivs: {...IVS}},
  {name: 'Charizard', species: 'Charizard', item: 'Heavy-Duty Boots', ability: 'Blaze', level: 100, nature: 'Timid',
    moves: ['flamethrower', 'airslash', 'focusblast', 'dragonpulse'], evs: {hp: 0, atk: 4, def: 0, spa: 252, spd: 0, spe: 252}, ivs: {...IVS}},
  {name: 'Blastoise', species: 'Blastoise', item: 'White Herb', ability: 'Torrent', level: 100, nature: 'Modest',
    moves: ['shellsmash', 'hydropump', 'icebeam', 'darkpulse'], evs: {hp: 252, atk: 0, def: 0, spa: 252, spd: 0, spe: 4}, ivs: {...IVS}},
];

// Red's doubles sets: same six and EVs, with Protect and spread moves. He leads Pikachu + Espeon.
const R = (i: number, moves: string[], item?: string) => ({...RED_TEAM[i], moves, item: item || RED_TEAM[i].item});
export const RED_TEAM_DOUBLES: PokemonSet[] = [
  R(0, ['fakeout', 'thunderbolt', 'grassknot', 'protect']),
  R(1, ['psychic', 'dazzlinggleam', 'shadowball', 'protect']),
  R(2, ['bodyslam', 'highhorsepower', 'curse', 'protect']),
  R(3, ['sleeppowder', 'sludgebomb', 'gigadrain', 'protect']),
  R(4, ['heatwave', 'airslash', 'dragonpulse', 'protect'], 'Charcoal'),
  R(5, ['shellsmash', 'muddywater', 'icebeam', 'protect']),
];

// ---------- Battle helpers ----------
/** April Fools' 2027 (Classic, both formats): six Mudkip for you, and Red's whole team at level 1. */
export const isMudkipDay = (date: string, mode: Mode) => baseMode(mode) === 'classic' && date === '2027-04-01';
export function redTeamFor(date: string, mode: Mode): PokemonSet[] {
  let t = isDoublesMode(mode) ? RED_TEAM_DOUBLES : RED_TEAM;
  if (date >= GENDER_FROM) t = t.map(s => ({...s, gender: 'M'}));
  return isMudkipDay(date, mode) ? t.map(s => ({...s, level: 1})) : t;
}
export function newBattle(team: PokemonSet[], seed: string, doubles = false, red?: PokemonSet[]) {
  const b = new PS.Battle({formatid: doubles ? 'gen9dailyreddoubles' : 'gen9dailyred', seed});
  b.setPlayer('p1', {name: 'You', team});
  b.setPlayer('p2', {name: 'RED', team: red || (doubles ? RED_TEAM_DOUBLES : RED_TEAM)});
  // Red's six are always male, as in the games. Set after the team is built so the battle's luck is unchanged
  // on days when the simulator still picked genders itself (before Oct 20, 2026).
  for (const p of b.sides[1].pokemon) if (p.gender !== 'M' && p.species.gender !== 'N' && !p.species.gender) p.gender = 'M';
  return b;
}


/** Stat with boosts and the common item/ability modifiers, without running battle events. */
export function stat(p: any, s: string): number {
  let v = p.getStat(s, false, true);
  const it = p.item, ab = p.ability;
  if (s === 'atk') { if (it === 'choiceband') v *= 1.5; if (ab === 'hugepower' || ab === 'purepower') v *= 2; if (ab === 'hustle') v *= 1.5; if (ab === 'guts' && p.status) v *= 1.5; }
  if (s === 'spa' && it === 'choicespecs') v *= 1.5;
  if ((s === 'atk' || s === 'spa') && it === 'lightball' && p.baseSpecies.baseSpecies === 'Pikachu') v *= 2;
  if (s === 'spd' && it === 'assaultvest') v *= 1.5;
  if (s === 'def' && ab === 'furcoat') v *= 2;
  if (s === 'spe') { if (it === 'choicescarf') v *= 1.5; if (it === 'ironball' || it === 'machobrace' || it.startsWith('power')) v *= 0.5; if (p.status === 'par' && ab !== 'quickfeet') v *= 0.5; }
  return Math.floor(v);
}

const ABSORB: Record<string, string[]> = {
  Electric: ['voltabsorb', 'lightningrod', 'motordrive'], Water: ['waterabsorb', 'stormdrain', 'dryskin'],
  Fire: ['flashfire', 'wellbakedbody'], Grass: ['sapsipper'], Ground: ['eartheater'],
};
const FIXED_MULTI: Record<string, number> = {doublekick: 2, dualchop: 2, twineedle: 2, bonemerang: 2, doublehit: 2, dualwingbeat: 2, geargrind: 2, dragondarts: 2, tachyoncutter: 2, twinbeam: 2, surgingstrikes: 3, tripledive: 3, tripleaxel: 5, triplekick: 4, populationbomb: 7};

/** Expected damage of a move as an absolute HP amount (rough, side-effect free). */
export function estimateDamage(battle: any, att: any, def: any, moveid: string): number {
  const move = battle.dex.moves.get(moveid);
  if (!move.exists || move.category === 'Status') return 0;
  const type = move.type;
  if (!def.runImmunity(type) && !(type === 'Ground' && def.hasItem?.('ironball'))) return 0;
  const defAb = def.ability, attAb = att.ability;
  if (ABSORB[type]?.includes(defAb) && attAb !== 'moldbreaker') return 0;
  if (move.flags?.sound && defAb === 'soundproof') return 0;
  if (move.flags?.bullet && defAb === 'bulletproof') return 0;
  if (moveid === 'fakeout' && att.activeMoveActions > 0) return 0;
  if (move.damage === 'level') return att.level;
  if (typeof move.damage === 'number') return move.damage;
  if (moveid === 'superfang' || moveid === 'ruination' || moveid === 'naturesmadness') return Math.floor(def.hp / 2);
  if (move.ohko) return 0;
  let bp = move.basePower;
  try {
    if (move.basePowerCallback) {
      const active = battle.dex.getActiveMove(moveid);
      bp = move.basePowerCallback.call(battle, att, def, active) || bp;
    }
  } catch { /* fall back to listed power */ }
  if (!bp) return 0;
  const eff = battle.dex.getEffectiveness(type, def);
  const mult = Math.pow(2, eff);
  if (defAb === 'wonderguard' && mult <= 1) return 0;
  const physical = move.category === 'Physical' || moveid === 'psyshock' || moveid === 'psystrike' || moveid === 'secretsword';
  const atkStat = move.category === 'Physical' ? 'atk' : 'spa';
  const defStat = physical ? 'def' : 'spd';
  let a = moveid === 'bodypress' ? stat(att, 'def') : moveid === 'foulplay' ? stat(def, 'atk') : stat(att, atkStat);
  let d = stat(def, defStat);
  a = Math.max(1, a); d = Math.max(1, d);
  let dmg = Math.floor(Math.floor(Math.floor((2 * att.level) / 5 + 2) * bp * a / d) / 50) + 2;
  if (att.hasType(type)) dmg *= attAb === 'adaptability' ? 2 : 1.5;
  dmg *= mult;
  if (att.status === 'brn' && move.category === 'Physical' && attAb !== 'guts' && moveid !== 'facade') dmg *= 0.5;
  const w = battle.field.effectiveWeather();
  if ((w === 'sunnyday' || w === 'desolateland') && type === 'Fire') dmg *= 1.5;
  if ((w === 'sunnyday' || w === 'desolateland') && type === 'Water') dmg *= 0.5;
  if ((w === 'raindance' || w === 'primordialsea') && type === 'Water') dmg *= 1.5;
  if ((w === 'raindance' || w === 'primordialsea') && type === 'Fire') dmg *= 0.5;
  if (att.item === 'lifeorb') dmg *= 1.3;
  if (att.item === 'expertbelt' && mult > 1) dmg *= 1.2;
  if (defAb === 'thickfat' && (type === 'Fire' || type === 'Ice')) dmg *= 0.5;
  if ((defAb === 'multiscale' || defAb === 'shadowshield') && def.hp === def.maxhp) dmg *= 0.5;
  if ((defAb === 'filter' || defAb === 'solidrock' || defAb === 'prismarmor') && mult > 1) dmg *= 0.75;
  let hits = 1;
  if (FIXED_MULTI[moveid]) hits = FIXED_MULTI[moveid];
  else if (Array.isArray(move.multihit)) hits = attAb === 'skilllink' ? move.multihit[1] : (att.item === 'loadeddice' ? 4 : 3);
  else if (typeof move.multihit === 'number') hits = move.multihit;
  dmg *= hits;
  const acc = move.accuracy === true || attAb === 'noguard' || defAb === 'noguard' ? 1 : (move.accuracy / 100);
  return Math.floor(dmg * 0.925 * acc);
}

function bestDamage(battle: any, att: any, def: any): {dmg: number; move: string} {
  let best = {dmg: 0, move: ''};
  for (const slot of att.moveSlots) {
    if (slot.disabled || slot.pp <= 0) continue;
    const d = estimateDamage(battle, att, def, slot.id);
    if (d > best.dmg) best = {dmg: d, move: slot.id};
  }
  return best;
}

// ---------- Red's AI ----------
const SETUP: Record<string, string> = {curse: 'atk', calmmind: 'spa', shellsmash: 'spa', swordsdance: 'atk', nastyplot: 'spa', dragondance: 'atk', bulkup: 'atk', quiverdance: 'spa'};
const SLEEP_MOVES = ['sleeppowder', 'spore', 'hypnosis', 'lovelykiss', 'sing', 'grasswhistle', 'darkvoid', 'yawn'];

export function redChoice(battle: any, diff: Difficulty, memo: {lastSwitchTurn: number; protectTurn?: Record<number, number>}): string {
  if (diff === 'true') return trueRedChoice(battle);
  return aiChoice(battle, diff, memo, 1);
}

/** Simple/Smart decision for side si (1 = Red). True Red also uses this to play out future turns for both sides. */
export function aiChoice(battle: any, diff: Difficulty, memo: {lastSwitchTurn: number; protectTurn?: Record<number, number>}, si: number): string {
  if (battle.gameType === 'doubles') return redChoiceDoubles(battle, diff, memo, si);
  const side = battle.sides[si];
  const req = side.activeRequest;
  const foe = battle.sides[1 - si].active[0];
  if (req?.forceSwitch) return 'switch ' + (pickReplacement(battle, diff, si) + 1);
  const me = side.active[0];
  const opts = (req?.active?.[0]?.moves || []).map((m: any, i: number) => ({...m, slot: i + 1}))
    .filter((m: any) => !m.disabled && (m.pp === undefined || m.pp > 0));
  if (!opts.length) return 'move 1';
  if (!foe || foe.fainted) return `move ${opts[0].slot}`;

  if (diff === 'simple') {
    let best = opts[0], bestD = -1;
    for (const o of opts) { const d = estimateDamage(battle, me, foe, o.id); if (d > bestD) { bestD = d; best = o; } }
    return `move ${best.slot}`;
  }

  // ---- Smart ----
  const mySpe = stat(me, 'spe'), foeSpe = stat(foe, 'spe');
  const faster = battle.field.getPseudoWeather('trickroom') ? mySpe < foeSpe : mySpe > foeSpe;
  const threat = bestDamage(battle, foe, me).dmg;
  const willDie = threat >= me.hp;
  const firstTurnOut = me.activeMoveActions === 0;

  let best = opts[0], bestScore = -Infinity;
  for (const o of opts) {
    const id = o.id; const mv = battle.dex.moves.get(id);
    let s = 0;
    if (mv.category !== 'Status') {
      const d = estimateDamage(battle, me, foe, id);
      if (d >= foe.hp) {
        s = 1000 + (mv.priority > 0 ? 100 : 0) + (mv.accuracy === true ? 100 : mv.accuracy) / 10;
        if (willDie && !faster && mv.priority <= 0) s = 400; // would faint before landing it
      } else {
        s = (d / foe.maxhp) * 100;
        if (id === 'fakeout' && firstTurnOut && d > 0 && foe.ability !== 'innerfocus') s = Math.max(s, 160);
      }
    } else if (SETUP[id]) {
      const stat = SETUP[id];
      const boosted = me.boosts[stat] >= (id === 'shellsmash' ? 1 : 2);
      if (!boosted && !willDie && threat < me.hp * 0.45 && me.hp > me.maxhp * 0.55) s = 140;
    } else if (SLEEP_MOVES.includes(id)) {
      const foeSideAsleep = battle.sides[1 - si].pokemon.some((p: any) => p.status === 'slp' && !p.fainted);
      const immune = foe.status || foe.hasType('Grass') && mv.flags?.powder ||
        ['insomnia', 'vitalspirit', 'sweetveil', 'overcoat', 'comatose', 'purifyingsalt', 'goodasgold'].includes(foe.ability) ||
        foe.item === 'safetygoggles' && mv.flags?.powder || battle.field.isTerrain('electricterrain') || battle.field.isTerrain('mistyterrain');
      if (!immune && !foeSideAsleep && !(willDie && !faster)) s = 150;
    } else if (id === 'rest') {
      if (me.status !== 'slp' && me.hp < me.maxhp * 0.4 && !willDie) s = 180;
    }
    if (s > bestScore) { bestScore = s; best = o; }
  }

  // Consider switching out of a losing matchup
  const turn = battle.turn;
  const canSwitch = !req?.active?.[0]?.trapped && turn - memo.lastSwitchTurn > 2;
  const losing = (willDie && !faster && bestScore < 1000) || bestScore < 8;
  if (canSwitch && losing && me.hp > me.maxhp * 0.3) {
    let pick = -1, pickScore = -Infinity;
    side.pokemon.forEach((p: any, i: number) => {
      if (i === 0 || p.fainted || p.isActive) return;
      const taken = bestDamage(battle, foe, p).dmg / p.maxhp;
      if (taken > 0.4) return;
      const dealt = bestDamage(battle, p, foe).dmg / foe.maxhp;
      const score = dealt - taken;
      if (score > pickScore) { pickScore = score; pick = i; }
    });
    if (pick > 0) { memo.lastSwitchTurn = turn; return `switch ${pick + 1}`; }
  }
  return `move ${best.slot}`;
}

function pickReplacement(battle: any, diff: Difficulty, si = 1): number {
  const side = battle.sides[si]; const foe = battle.sides[1 - si].active[0];
  const alive = side.pokemon.map((p: any, i: number) => ({p, i})).filter(({p, i}: any) => i > 0 && !p.fainted);
  if (!alive.length) return 1;
  if (diff === 'simple' || !foe || foe.fainted) {
    // team order (by original slot)
    const order = (p: any) => si === 1 ? RED_TEAM.findIndex(r => r.species === p.species.name) : side.team.findIndex((t: any) => t.name === p.name);
    alive.sort((a: any, b: any) => order(a.p) - order(b.p));
    return alive[0].i;
  }
  let best = alive[0].i, bestScore = -Infinity;
  for (const {p, i} of alive) {
    const dealt = bestDamage(battle, p, foe).dmg / Math.max(1, foe.hp);
    const taken = bestDamage(battle, foe, p).dmg / p.hp;
    const faster = stat(p, 'spe') > stat(foe, 'spe');
    let s = Math.min(dealt, 1.2) - Math.min(taken, 1.2) + (faster && dealt >= 1 ? 1 : 0) + (faster ? 0.1 : 0);
    if (s > bestScore) { bestScore = s; best = i; }
  }
  return best;
}

/** Best attacker on your team vs each of Red's Pokémon, and Red's best hit back. */
export function matchups(team: PokemonSet[]) {
  const b = newBattle(team, '1,2,3,4');
  const mine = b.sides[0].pokemon, reds = b.sides[1].pokemon;
  return reds.map((r: any) => {
    let best = {who: '', move: '', pct: 0};
    for (const p of mine) {
      const d = bestDamage(b, p, r);
      const pct = d.dmg / r.maxhp * 100;
      if (pct > best.pct) best = {who: p.species.name, move: b.dex.moves.get(d.move).name, pct};
    }
    let worst = {who: '', move: '', pct: 0};
    for (const p of mine) {
      const d = bestDamage(b, r, p);
      const pct = d.dmg / p.maxhp * 100;
      if (pct > worst.pct) worst = {who: p.species.name, move: b.dex.moves.get(d.move).name, pct};
    }
    return {red: r.species.name, best, worst};
  });
}


// ---------- Red's doubles AI ----------
const SPREAD_FOES = ['allAdjacentFoes'];
const SPREAD_ALL = ['allAdjacent'];
const SINGLE_TARGET = ['normal', 'any', 'adjacentFoe', 'randomNormal'];

function redChoiceDoubles(battle: any, diff: Difficulty, memo: {protectTurn?: Record<number, number>}, si = 1): string {
  const side = battle.sides[si]; const req = side.activeRequest;
  const foes: any[] = battle.sides[1 - si].active;
  memo.protectTurn ||= {};
  if (req?.forceSwitch) {
    const used = new Set<number>();
    return req.forceSwitch.map((must: boolean, slot: number) => {
      if (!must) return 'pass';
      const i = pickReplacementDoubles(battle, diff, used, si);
      if (i < 0) return 'pass';
      used.add(i); return `switch ${i + 1}`;
    }).join(', ');
  }
  const planned: Record<number, number> = {};   // foe slot -> damage already aimed at it this turn
  const out: string[] = [];
  (req?.active || []).forEach((slotReq: any, slot: number) => {
    const me = side.active[slot];
    if (!me || me.fainted || slotReq?.commanding) { out.push('pass'); return; }
    const opts = (slotReq.moves || []).map((m: any, i: number) => ({...m, slot: i + 1}))
      .filter((m: any) => !m.disabled && (m.pp === undefined || m.pp > 0));
    if (!opts.length) { out.push('move 1'); return; }
    const ally = side.active[1 - slot];
    const liveFoes = foes.map((f: any, i: number) => ({f, i})).filter(({f}) => f && !f.fainted);
    const threat = liveFoes.reduce((t, {f}) => t + bestDamage(battle, f, me).dmg, 0);
    let best = {score: -Infinity, choice: `move ${opts[0].slot}`, target: -1, dmg: 0};
    for (const o of opts) {
      const mv = battle.dex.moves.get(o.id); const tgt = o.target || mv.target;
      const consider = (score: number, choice: string, target = -1, dmg = 0) => { if (score > best.score) best = {score, choice, target, dmg}; };
      if (mv.category !== 'Status') {
        if (SPREAD_FOES.includes(tgt) || SPREAD_ALL.includes(tgt)) {
          let sc = 0;
          for (const {f, i} of liveFoes) {
            const d = estimateDamage(battle, me, f, o.id) * (liveFoes.length > 1 ? 0.75 : 1);
            const left = Math.max(1, f.hp - (planned[i] || 0));
            sc += Math.min(1.2, d / left) * 100 + (d >= left ? 60 : 0);
          }
          if (SPREAD_ALL.includes(tgt) && ally && !ally.fainted) {
            const d = estimateDamage(battle, me, ally, o.id) * 0.75;
            sc -= Math.min(1.5, d / Math.max(1, ally.hp)) * 160;
          }
          consider(sc, `move ${o.slot}`);
        } else {
          for (const {f, i} of liveFoes) {
            let d = estimateDamage(battle, me, f, o.id);
            if (o.id === 'fakeout' && me.activeMoveActions > 0) d = 0;
            const left = Math.max(1, f.hp - (planned[i] || 0));
            let sc = Math.min(1.2, d / left) * 100 + (d >= left ? 80 : 0);
            if (diff === 'smart') {
              if (d >= left && mv.priority > 0) sc += 40;
              if (o.id === 'fakeout' && d > 0 && f.ability !== 'innerfocus') sc = Math.max(sc, 130 + bestDamage(battle, f, me).dmg / Math.max(1, me.hp) * 20);
            }
            const target = SINGLE_TARGET.includes(tgt) || tgt === 'any' ? ` ${i + 1}` : '';
            consider(sc, `move ${o.slot}${target}`, i, d);
          }
        }
        continue;
      }
      if (diff === 'simple') { consider(-50, `move ${o.slot}`); continue; }
      // Smart status choices
      if (o.id === 'protect' || o.id === 'detect') {
        const last = memo.protectTurn![slot];
        if (threat >= me.hp * 0.7 && last !== battle.turn - 1) consider(95, `move ${o.slot}`);
        continue;
      }
      if (SETUP[o.id]) {
        const boosted = me.boosts[SETUP[o.id]] >= (o.id === 'shellsmash' ? 1 : 2);
        if (!boosted && threat < me.hp * 0.4 && me.hp > me.maxhp * 0.6) consider(110, `move ${o.slot}`);
        continue;
      }
      if (SLEEP_MOVES.includes(o.id)) {
        const anyAsleep = battle.sides[1 - si].pokemon.some((p: any) => p.status === 'slp' && !p.fainted);
        if (anyAsleep) continue;
        for (const {f, i} of liveFoes) {
          const immune = f.status || f.hasType('Grass') && mv.flags?.powder || f.item === 'safetygoggles' && mv.flags?.powder ||
            ['insomnia', 'vitalspirit', 'sweetveil', 'overcoat', 'comatose', 'purifyingsalt', 'goodasgold'].includes(f.ability);
          if (!immune) consider(105 + bestDamage(battle, f, me).dmg / Math.max(1, me.hp) * 30, `move ${o.slot} ${i + 1}`, i);
        }
        continue;
      }
      consider(-50, `move ${o.slot}`);
    }
    if (best.target >= 0) planned[best.target] = (planned[best.target] || 0) + best.dmg;
    if (/^move \d/.test(best.choice)) {
      const mid = opts.find((o: any) => best.choice.startsWith(`move ${o.slot}`))?.id;
      if (mid === 'protect' || mid === 'detect') memo.protectTurn![slot] = battle.turn;
    }
    out.push(best.choice);
  });
  return out.join(', ');
}

function pickReplacementDoubles(battle: any, diff: Difficulty, used: Set<number>, si = 1): number {
  const side = battle.sides[si];
  const bench = side.pokemon.map((p: any, i: number) => ({p, i})).filter(({p, i}: any) => i >= side.active.length && !p.fainted && !used.has(i));
  if (!bench.length) return -1;
  if (diff === 'simple') {
    const order = (p: any) => si === 1 ? RED_TEAM.findIndex(r => r.species === p.species.name) : side.team.findIndex((t: any) => t.name === p.name);
    bench.sort((a: any, b: any) => order(a.p) - order(b.p));
    return bench[0].i;
  }
  const foes = battle.sides[1 - si].active.filter((f: any) => f && !f.fainted);
  let best = bench[0].i, bestScore = -Infinity;
  for (const {p, i} of bench) {
    let s = 0;
    for (const f of foes) s += Math.min(bestDamage(battle, p, f).dmg / Math.max(1, f.hp), 1.2) - Math.min(bestDamage(battle, f, p).dmg / p.hp, 1.2);
    if (s > bestScore) { bestScore = s; best = i; }
  }
  return best;
}


// ---------- True Red ----------
// For every option Red has, and every reply you could make, True Red plays the turn out on a copy of the battle and
// scores the result: Pokémon left and their HP, status, stat boosts, hazards, and who wins the next exchange on the
// field. Your replies are weighted toward the ones that are best for you. When several of Red's options come out
// about even, he goes with what Smart Red would do. The copies use their own luck (never the real battle's), and the
// same position always gives the same choice, so replays and resumed battles play out identically.
// Settings were picked by playing hundreds of test battles against computer stand-ins for the player.
/** Search settings (fixed, so every device makes the same choices). */
export const TR = {extra: 0, refineTop: 0, refineSamples: 0, minW: 0.6, crn: true, nash: false, samples: 1, tau: 1, tie: 0.2, swCost: 0, model: false, blend: 0, mw: 0.5, bw: 0.15};
const trCache = new Map<string, string>();
/** Where True Red's past decisions are remembered (the page swaps in one that survives a reload). */
export const trStore = {get: (k: string): string | undefined => trCache.get(k), set: (k: string, v: string) => { if (trCache.size > 3000) trCache.clear(); trCache.set(k, v); }};
function hashText(t: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0; h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0; }
  return h1.toString(36) + h2.toString(36);
}

function trOptions(b: any, si: number): string[] {
  const side = b.sides[si]; const req = side.activeRequest;
  if (!req || req.wait || side.isChoiceDone()) return [];
  const foeSide = b.sides[1 - si];
  const nAct = side.active.length;
  const bench = side.pokemon.map((p: any, i: number) => ({p, i})).filter(({p, i}: any) => i >= nAct && !p.fainted);
  if (b.gameType !== 'doubles') {
    if (req.forceSwitch) return bench.map(({i}: any) => `switch ${i + 1}`);
    const r = req.active?.[0]; if (!r) return ['default'];
    const moves = (r.moves || []).map((m: any, i: number) => ({m, i})).filter(({m}: any) => !m.disabled && (m.pp === undefined || m.pp > 0))
      .map(({i}: any) => `move ${i + 1}`);
    const sw = r.trapped || r.maybeTrapped ? [] : bench.map(({i}: any) => `switch ${i + 1}`);
    const all = [...moves, ...sw];
    return all.length ? all : ['default'];
  }
  // Doubles: the best few options for each slot (by a quick estimate), combined
  const slotOpts: {c: string; s: number; sw?: number}[][] = [];
  for (let k = 0; k < nAct; k++) {
    const mon = side.active[k];
    if (req.forceSwitch) {
      if (!req.forceSwitch[k]) { slotOpts.push([{c: 'pass', s: 0}]); continue; }
      const o = bench.map(({p, i}: any) => ({c: `switch ${i + 1}`, s: trMatchup(b, p, foeSide), sw: i}));
      slotOpts.push(o.length ? o : [{c: 'pass', s: 0}]); continue;
    }
    const r = req.active?.[k];
    if (!r || !mon || mon.fainted || r.commanding) { slotOpts.push([{c: 'pass', s: 0}]); continue; }
    const o: {c: string; s: number; sw?: number}[] = [];
    const foes = foeSide.active.map((f: any, j: number) => ({f, j})).filter(({f}: any) => f && !f.fainted);
    (r.moves || []).forEach((m: any, i: number) => {
      if (m.disabled || (m.pp !== undefined && m.pp <= 0)) return;
      const mv = b.dex.moves.get(m.id); const tgt = m.target || mv.target;
      if (mv.category === 'Status') { o.push({c: `move ${i + 1}`, s: ['protect', 'detect'].includes(m.id) ? 0.45 : 0.35}); return; }
      if (['normal', 'any', 'adjacentFoe'].includes(tgt)) {
        for (const {f, j} of foes) { const d = estimateDamage(b, mon, f, m.id); o.push({c: `move ${i + 1} ${j + 1}`, s: Math.min(1.2, d / Math.max(1, f.hp)) + (d >= f.hp ? 0.5 : 0)}); }
      } else {
        let s = 0; for (const {f} of foes) { const d = estimateDamage(b, mon, f, m.id) * 0.75; s += Math.min(1.2, d / Math.max(1, f.hp)) + (d >= f.hp ? 0.5 : 0); }
        o.push({c: `move ${i + 1}`, s});
      }
    });
    if (!(r.trapped || r.maybeTrapped)) for (const {p, i} of bench) o.push({c: `switch ${i + 1}`, s: trMatchup(b, p, foeSide) * 0.5, sw: i});
    o.sort((x, y) => y.s - x.s);
    slotOpts.push(o.slice(0, 3).length ? o.slice(0, 3) : [{c: 'default', s: 0}]);
  }
  const out: string[] = [];
  const combine = (k: number, acc: {c: string; sw?: number}[]) => {
    if (k === slotOpts.length) { out.push(acc.map(x => x.c).join(', ')); return; }
    for (const x of slotOpts[k]) { if (x.sw !== undefined && acc.some(a => a.sw === x.sw)) continue; combine(k + 1, [...acc, x]); }
  };
  combine(0, []);
  return out.length ? out : ['default'];
}

function trMatchup(b: any, p: any, foeSide: any): number {
  let s = 0;
  for (const f of foeSide.active) if (f && !f.fainted) s += Math.min(bestDamage(b, p, f).dmg / Math.max(1, f.hp), 1.2) - Math.min(bestDamage(b, f, p).dmg / Math.max(1, p.hp), 1.2);
  return s;
}

const STATUS_COST: Record<string, number> = {slp: 0.35, frz: 0.45, par: 0.2, brn: 0.15, psn: 0.12, tox: 0.2};
/** How good the position is for Red: Pokémon left, their HP, status, stat changes and hazards. */
function trEval(c: any, cfg = TR): number {
  if (c.ended) return c.winner === 'RED' ? 1000 : c.winner === 'You' ? -1000 : 0;
  let matchup = 0;
  if (cfg.mw > 0) {
    // Who wins the next exchange between the Pokémon on the field: damage each can do, and who moves first
    const tr = c.field.getPseudoWeather?.('trickroom');
    for (const a of c.sides[1].active) for (const p of c.sides[0].active) {
      if (!a || !p || a.fainted || p.fainted) continue;
      const da = Math.min(1, bestDamage(c, a, p).dmg / Math.max(1, p.hp)), dp = Math.min(1, bestDamage(c, p, a).dmg / Math.max(1, a.hp));
      const sa = stat(a, 'spe'), sp = stat(p, 'spe'); const aFirst = tr ? sa < sp : sa > sp;
      let m = da - dp;
      if (da >= 1 && (aFirst || dp < 1)) m += 0.6;
      if (dp >= 1 && (!aFirst || da < 1)) m -= 0.6;
      matchup += m;
    }
    matchup /= Math.max(1, c.sides[0].active.length);
  }
  const val = (side: any) => {
    let v = 0, alive = 0;
    for (const p of side.pokemon) {
      if (p.fainted || p.hp <= 0) continue;
      alive++; v += 1 + p.hp / p.maxhp - (STATUS_COST[p.status] || 0);
    }
    for (const p of side.active) if (p && !p.fainted) {
      let bs = 0; for (const k of ['atk', 'def', 'spa', 'spd', 'spe']) bs += (p.boosts[k] || 0) * (k === 'atk' || k === 'spa' || k === 'spe' ? cfg.bw : 0.08);
      v += Math.max(-0.8, Math.min(0.8, bs));
      if (p.volatiles?.substitute) v += 0.15;
    }
    const sc = side.sideConditions || {};
    if (sc.stealthrock) v -= 0.06 * alive;
    if (sc.spikes) v -= 0.04 * alive * (sc.spikes.layers || 1);
    if (sc.toxicspikes) v -= 0.05 * alive;
    if (sc.stickyweb) v -= 0.04 * alive;
    if (sc.reflect || sc.lightscreen || sc.auroraveil) v += 0.15;
    if (sc.tailwind) v += 0.15;
    return v;
  };
  return val(c.sides[1]) - val(c.sides[0]) + cfg.mw * matchup;
}

function trChoose(c: any, si: number, choice: string) {
  try { if (c.choose(si === 0 ? 'p1' : 'p2', choice)) return; } catch { /* fall through */ }
  try { c.choose(si === 0 ? 'p1' : 'p2', 'default'); } catch { /* ignore */ }
}

/** Play the given choices, then a few more turns with Smart judgement on both sides, and score the result. */
export function trPlayout(snap: string, si: number, mine: string, theirs: string | null, seed: string, cfg = TR): number {
  // A fresh copy from text: copying the live object directly would share its log with the real battle
  const c = PS.Battle.fromJSON(snap);
  c.prng = new PS.PRNG(seedFor(seed));
  c.send = () => {};
  const t0 = c.turn;
  trChoose(c, si, mine);
  if (theirs !== null) trChoose(c, 1 - si, theirs);
  const memos = [{lastSwitchTurn: -9}, {lastSwitchTurn: -9}];
  for (let g = 0; g < 60 && !c.ended && c.turn < t0 + 1 + cfg.extra; g++) {
    let acted = false;
    for (const k of [1, 0]) {
      const side = c.sides[k];
      if (side.requestState && !side.isChoiceDone()) { trChoose(c, k, aiChoice(c, 'smart', memos[k], k)); acted = true; break; }
    }
    if (!acted) break;
  }
  return si === 1 ? trEval(c, cfg) : -trEval(c, cfg);
}

/** Fictitious play on a payoff table (rows: our options, columns: replies); returns our mix of options. */
function solveMix(M: number[][]): number[] {
  const R = M.length, C = M[0].length;
  const rowCount = new Array(R).fill(0), colCount = new Array(C).fill(0);
  const rowPay = new Array(R).fill(0), colPay = new Array(C).fill(0);
  let r = 0;
  for (let it = 0; it < 400; it++) {
    rowCount[r]++;
    for (let j = 0; j < C; j++) colPay[j] += M[r][j];
    let c = 0; for (let j = 1; j < C; j++) if (colPay[j] < colPay[c] - 1e-9) c = j;
    colCount[c]++;
    for (let i = 0; i < R; i++) rowPay[i] += M[i][c];
    r = 0; for (let i = 1; i < R; i++) if (rowPay[i] > rowPay[r] + 1e-9) r = i;
  }
  return rowCount.map(x => x / 400);
}

/** Search-based choice for side si (1 = Red). */
export function searchChoice(b: any, si: number, cfg: typeof TR = TR): string {
  const mine = trOptions(b, si);
  if (mine.length <= 1) return mine[0] || 'default';
  const yours = trOptions(b, 1 - si);
  const snap = JSON.stringify(b.toJSON());
  const key = `${hashText(snap.length + '|' + b.inputLog.join('\n'))}|${si}`;
  // Assume the other side answers well: weigh the worst outcome most, and the next-worst replies too
  const judge = (vals: number[]) => {
    vals.sort((x, y) => x - y);
    if (cfg.tau > 0) { // the other side leans toward its best replies, but not always the single best one
      const w = vals.map(v => Math.exp(-(v - vals[0]) / cfg.tau)); const sw = w.reduce((a, b) => a + b, 0);
      return vals.reduce((s, v, i) => s + v * w[i], 0) / sw;
    }
    const low = vals.slice(0, 3); return cfg.minW * vals[0] + (1 - cfg.minW) * low.reduce((s, v) => s + v, 0) / low.length;
  };
  const outcome = (r: string, y: string | null, k: number) => {
    // With common luck (crn) every option is tried against the same luck, so differences come from the choices
    let v = 0; for (let i = 0; i <= k; i++) v += trPlayout(snap, si, r, y, cfg.crn ? `tr|${key}|${i}` : `tr|${key}|${r}|${y}|${i}`, cfg); return v / (k + 1);
  };
  if (cfg.nash && yours.length) {
    // Payoff table for every pair of choices, then the mix of options that does best against any reply
    const M = mine.map(r => yours.map(y => outcome(r, y, cfg.samples - 1)));
    const mix = solveMix(M);
    let bi = 0; for (let i = 1; i < mix.length; i++) if (mix[i] > mix[bi] + 1e-9) bi = i;
    return mine[bi];
  }
  if (cfg.model && yours.length) { // test mode: assume the other side plays exactly like Smart
    const y = aiChoice(b, 'smart', {lastSwitchTurn: -9}, 1 - si);
    const sc = mine.map(r => ({r, score: outcome(r, y, cfg.samples - 1)}));
    return sc.reduce((a, x) => (x.score > a.score + 1e-9 ? x : a)).r;
  }
  // The reply a sensible player would most likely make (Smart's pick), blended with the strongest replies
  const likely = cfg.blend > 0 && yours.length ? aiChoice(b, 'smart', {lastSwitchTurn: -9}, 1 - si) : null;
  const scored = mine.map(r => {
    if (!yours.length) return {r, score: outcome(r, null, cfg.samples - 1)};
    const vals = yours.map(y => outcome(r, y, cfg.samples - 1));
    const li = likely ? yours.indexOf(likely) : -1;
    const soft = judge([...vals]);
    return {r, score: li >= 0 ? cfg.blend * vals[li] + (1 - cfg.blend) * soft : soft};
  });
  // Look again, with more luck samples, at the options that came out on top
  if (cfg.refineTop > 0 && cfg.refineSamples > 0) {
    const top = [...scored].sort((a, b) => b.score - a.score).slice(0, cfg.refineTop);
    for (const t of top) t.score = yours.length ? judge(yours.map(y => outcome(t.r, y, cfg.refineSamples))) : outcome(t.r, null, cfg.refineSamples);
  }
  // Switching costs a turn; and between near-equal options, go with what Smart judgement would do
  for (const x of scored) if (/^switch/.test(x.r) && !b.sides[si].activeRequest?.forceSwitch) x.score -= cfg.swCost;
  const top = Math.max(...scored.map(x => x.score));
  const near = scored.filter(x => x.score >= top - cfg.tie);
  let best = near[0].r;
  if (near.length > 1) {
    const pref = aiChoice(b, 'smart', {lastSwitchTurn: -9}, si);
    if (near.some(x => x.r === pref)) best = pref;
    else best = near.reduce((a, x) => (x.score > a.score ? x : a)).r;
  }
  return best;
}

export function trueRedChoice(b: any): string {
  const key = `${hashText(b.inputLog.join('\n'))}|${b.inputLog.length}|${b.turn}`;
  const hit = trStore.get(key); if (hit) return hit;
  const best = searchChoice(b, 1);
  trStore.set(key, best);
  return best;
}
