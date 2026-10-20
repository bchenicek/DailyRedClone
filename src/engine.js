// Browser entry for Pokémon Showdown's simulator: wires up the data files that
// Showdown normally loads from disk with dynamic require().
import * as Abilities from '/home/claude/ps/dist/data/abilities.js';
import * as Items from '/home/claude/ps/dist/data/items.js';
import * as Moves from '/home/claude/ps/dist/data/moves.js';
import * as Pokedex from '/home/claude/ps/dist/data/pokedex.js';
import * as TypeChart from '/home/claude/ps/dist/data/typechart.js';
import * as Conditions from '/home/claude/ps/dist/data/conditions.js';
import * as Rulesets from '/home/claude/ps/dist/data/rulesets.js';
import * as Scripts from '/home/claude/ps/dist/data/scripts.js';
import * as FormatsData from '/home/claude/ps/dist/data/formats-data.js';
import * as Natures from '/home/claude/ps/dist/data/natures.js';
import * as Aliases from '/home/claude/ps/dist/data/aliases.js';

const FORMATS = {Formats: [{
  name: '[Gen 9] Daily Red', mod: 'gen9', gameType: 'singles',
  ruleset: ['NatDex Mod', 'Terastal Clause', 'Endless Battle Clause'],
}, {
  name: '[Gen 9] Daily Red Doubles', mod: 'gen9', gameType: 'doubles',
  ruleset: ['NatDex Mod', 'Terastal Clause', 'Endless Battle Clause'],
}]};
const REG = {
  '/ps/data/abilities': Abilities, '/ps/data/items': Items, '/ps/data/moves': Moves,
  '/ps/data/pokedex': Pokedex, '/ps/data/typechart': TypeChart, '/ps/data/conditions': Conditions,
  '/ps/data/rulesets': Rulesets, '/ps/data/scripts': Scripts, '/ps/data/formats-data': FormatsData,
  '/ps/data/natures': Natures, '/ps/data/aliases': Aliases, '/ps/config/formats': FORMATS,
};
function norm(p) {
  const out = [];
  for (const part of String(p).replace(/\.js$/, '').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop(); else out.push(part);
  }
  return '/' + out.join('/');
}
globalThis.__dynreq = p => {
  const m = REG[norm(p)];
  if (m) return m;
  const e = new Error('Cannot find module ' + p); e.code = 'MODULE_NOT_FOUND'; throw e;
};

export {Dex, toID} from '/home/claude/ps/dist/sim/dex.js';
export {Battle} from '/home/claude/ps/dist/sim/battle.js';
export {PRNG} from '/home/claude/ps/dist/sim/prng.js';
