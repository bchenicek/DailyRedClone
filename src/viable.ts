// Port of Pokémon Showdown teambuilder's "Usually useless moves" check
// (pokemon-showdown-client, battle-dex-search.ts, moveIsNotUseless), singles, Gen 9 National Dex.
declare const PS: any;

const GOOD_STATUS_MOVES = ['acidarmor', 'agility', 'aromatherapy', 'auroraveil', 'autotomize', 'banefulbunker', 'batonpass', 'bellydrum', 'bulkup', 'burningbulwark', 'calmmind', 'chillyreception', 'clangoroussoul', 'coil', 'cottonguard', 'courtchange', 'curse', 'defog', 'destinybond', 'detect', 'disable', 'dragondance', 'encore', 'extremeevoboost', 'filletaway', 'geomancy', 'glare', 'haze', 'healbell', 'healingwish', 'healorder', 'heartswap', 'honeclaws', 'kingsshield', 'leechseed', 'lightscreen', 'lovelykiss', 'lunardance', 'magiccoat', 'maxguard', 'memento', 'milkdrink', 'moonlight', 'morningsun', 'nastyplot', 'naturesmadness', 'noretreat', 'obstruct', 'painsplit', 'partingshot', 'perishsong', 'protect', 'quiverdance', 'recover', 'reflect', 'reflecttype', 'rest', 'revivalblessing', 'roar', 'rockpolish', 'roost', 'shedtail', 'shellsmash', 'shiftgear', 'shoreup', 'silktrap', 'slackoff', 'sleeppowder', 'sleeptalk', 'softboiled', 'spikes', 'spikyshield', 'spore', 'stealthrock', 'stickyweb', 'strengthsap', 'substitute', 'switcheroo', 'swordsdance', 'synthesis', 'tailglow', 'tailwind', 'taunt', 'thunderwave', 'tidyup', 'toxic', 'transform', 'trick', 'victorydance', 'whirlwind', 'willowisp', 'wish', 'yawn'];
const GOOD_WEAK_MOVES = ['accelerock', 'acrobatics', 'aquacutter', 'avalanche', 'barbbarrage', 'bonemerang', 'bouncybubble', 'bulletpunch', 'buzzybuzz', 'ceaselessedge', 'circlethrow', 'clearsmog', 'doubleironbash', 'dragondarts', 'dragontail', 'drainingkiss', 'endeavor', 'facade', 'firefang', 'flipturn', 'flowertrick', 'freezedry', 'frustration', 'geargrind', 'gigadrain', 'grassknot', 'gyroball', 'icefang', 'iceshard', 'iciclespear', 'infernalparade', 'knockoff', 'lastrespects', 'lowkick', 'machpunch', 'mortalspin', 'mysticalpower', 'naturesmadness', 'nightshade', 'nuzzle', 'pikapapow', 'populationbomb', 'psychocut', 'psyshieldbash', 'pursuit', 'quickattack', 'ragefist', 'rapidspin', 'return', 'rockblast', 'ruination', 'saltcure', 'scorchingsands', 'seismictoss', 'shadowclaw', 'shadowsneak', 'sizzlyslide', 'stoneaxe', 'storedpower', 'stormthrow', 'suckerpunch', 'superfang', 'surgingstrikes', 'tachyoncutter', 'tailslap', 'thunderclap', 'tripleaxel', 'tripledive', 'twinbeam', 'uturn', 'vacuumwave', 'veeveevolley', 'voltswitch', 'watershuriken', 'weatherball'];
const BAD_STRONG_MOVES = ['belch', 'burnup', 'crushclaw', 'dragonrush', 'dreameater', 'eggbomb', 'firepledge', 'flyingpress', 'futuresight', 'grasspledge', 'hyperbeam', 'hyperfang', 'hyperspacehole', 'jawlock', 'landswrath', 'megakick', 'megapunch', 'mistyexplosion', 'muddywater', 'nightdaze', 'pollenpuff', 'rockclimb', 'selfdestruct', 'shelltrap', 'skyuppercut', 'slam', 'strength', 'submission', 'synchronoise', 'takedown', 'thrash', 'uproar', 'waterpledge'];

export function moveIsNotUseless(id: string, species: any, moves: string[], abilityid: string, itemid: string): boolean {
  const gen = 9;
  const has = (m: string) => moves.includes(m);
  switch (id) {
  case 'fakeout': case 'flamecharge': case 'nuzzle': case 'poweruppunch': case 'trailblaze':
    return abilityid !== 'sheerforce';
  case 'solarbeam': case 'solarblade':
    return ['desolateland', 'drought', 'chlorophyll', 'orichalcumpulse'].includes(abilityid) || itemid === 'powerherb';
  case 'dynamicpunch': case 'grasswhistle': case 'inferno': case 'sing':
    return abilityid === 'noguard';
  case 'heatcrash': case 'heavyslam':
    return species.weightkg >= (species.evos?.length ? 75 : 130);
  case 'aerialace': return ['technician', 'toughclaws'].includes(abilityid) && !has('bravebird');
  case 'ancientpower': return ['serenegrace', 'technician'].includes(abilityid) || !has('powergem');
  case 'aquajet': return !has('jetpunch');
  case 'aurawheel': return species.baseSpecies === 'Morpeko';
  case 'axekick': return !has('highjumpkick');
  case 'barrier': return !has('acidarmor');
  case 'bellydrum': return has('aquajet') || has('jetpunch') || has('extremespeed') || ['iceface', 'unburden'].includes(abilityid);
  case 'bulletseed': return ['skilllink', 'technician'].includes(abilityid);
  case 'chillingwater': return !has('scald');
  case 'counter': case 'mirrorcoat': return species.baseStats.hp >= 65;
  case 'dazzlinggleam': return !has('alluringvoice');
  case 'darkvoid': return false;
  case 'dualwingbeat': return abilityid === 'technician' || !has('drillpeck');
  case 'electroshot': return true;
  case 'feint': return abilityid === 'refrigerate';
  case 'futuresight': return true;
  case 'grassyglide': return abilityid === 'grassysurge';
  case 'gyroball': return species.baseStats.spe <= 60;
  case 'headbutt': return abilityid === 'serenegrace';
  case 'hex': return !has('infernalparade');
  case 'hiddenpowerelectric': return !has('thunderbolt');
  case 'hiddenpowerfighting': return !has('aurasphere') && !has('focusblast');
  case 'hiddenpowerfire': return !has('flamethrower') && !has('mysticalfire') && !has('burningjealousy') && !has('incinerate');
  case 'hiddenpowergrass': return !has('energyball') && !has('grassknot') && !has('gigadrain');
  case 'hiddenpowerice': return !has('aurorabeam') && !has('glaciate');
  case 'hiddenpowerflying': case 'hiddenpowerbug': return false;
  case 'hiddenpowerpsychic': return species.baseSpecies === 'Unown';
  case 'hyperspacefury': return species.id === 'hoopaunbound';
  case 'hypnosis': return abilityid === 'baddreams';
  case 'icepunch': return !has('icespinner') || ['sheerforce', 'ironfist'].includes(abilityid) || itemid === 'punchingglove';
  case 'iciclecrash': return !has('mountaingale');
  case 'iciclespear': return true;
  case 'icywind': return species.baseSpecies === 'Keldeo';
  case 'incinerate': return !has('flamethrower') && !has('mysticalfire') && !has('burningjealousy');
  case 'infestation': return has('stickyweb');
  case 'irondefense': return !has('acidarmor') && !has('barrier');
  case 'irontail': return !has('ironhead') && !has('gunkshot') && !has('poisonjab');
  case 'jumpkick': return !has('highjumpkick') && !has('axekick');
  case 'lastresort': return moves.length < 3;
  case 'leafblade': return true;
  case 'leechlife': return true;
  case 'magiccoat': return true;
  case 'meteorbeam': return true;
  case 'mysticalfire': return !has('flamethrower');
  case 'naturepower': return false;
  case 'needlearm': return false;
  case 'nightslash': return !has('crunch') && !has('knockoff');
  case 'outrage': return !has('glaiverush');
  case 'petaldance': return abilityid === 'owntempo';
  case 'phantomforce': return !has('poltergeist') && !has('shadowclaw');
  case 'poisonfang': return species.types.includes('Poison') && !has('gunkshot') && !has('poisonjab');
  case 'raindance': return false;
  case 'relicsong': return species.id === 'meloetta';
  case 'refresh': return !has('aromatherapy') && !has('healbell');
  case 'risingvoltage': return abilityid === 'electricsurge' || abilityid === 'hadronengine';
  case 'rocktomb': return abilityid === 'technician';
  case 'selfdestruct': return false;
  case 'shadowpunch': return abilityid === 'ironfist' && !has('ragefist');
  case 'shelter': return !has('acidarmor') && !has('irondefense');
  case 'skyuppercut': return false;
  case 'smackdown': return species.types.includes('Ground');
  case 'smartstrike': return species.types.includes('Steel') && !has('ironhead');
  case 'soak': return abilityid === 'unaware';
  case 'steelwing': return !has('ironhead');
  case 'stompingtantrum': return !has('earthquake') && !has('drillrun');
  case 'stunspore': return !has('thunderwave');
  case 'sunnyday': return false;
  case 'technoblast': return itemid.endsWith('drive');
  case 'teleport': return true;
  case 'temperflare': return !has('flareblitz') && !has('pyroball') && !has('sacredfire') && !has('bitterblade') && !has('firepunch');
  case 'terrainpulse': case 'waterpulse': return ['megalauncher', 'technician'].includes(abilityid) && !has('originpulse');
  case 'thief': return false;
  case 'toxicspikes': return abilityid !== 'toxicdebris';
  case 'triattack': return true;
  case 'trickroom': return species.baseStats.spe <= 100;
  case 'wildcharge': return !has('supercellslam');
  case 'zapcannon': return abilityid === 'noguard';
  }
  const move = PS.Dex.moves.get(id);
  if (!move.exists) return true;
  if (move.category === 'Status') return GOOD_STATUS_MOVES.includes(id);
  if (move.basePower < 75) return GOOD_WEAK_MOVES.includes(id) || (abilityid === 'technician' && move.basePower === 60);
  if (id === 'skydrop') return true;
  if (move.flags['charge']) return itemid === 'powerherb';
  if (move.flags['recharge']) return false;
  if (move.flags['slicing'] && abilityid === 'sharpness') return true;
  void gen;
  return !BAD_STRONG_MOVES.includes(id);
}
