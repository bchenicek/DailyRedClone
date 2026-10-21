import {generateTeam, newBattle, redTeamFor, redChoice, battleSeed, localDateKey, dayNumber, stat, baseMode, isDoublesMode, type BaseMode,
  type Mode, type Difficulty, type Pool, type PokemonSet} from './game';
import {BattleTextParser} from './textparser';
import {packReplay, unpackReplay, bestAttempt, loadAttempts, addAttempt, attemptsFor, computeStats, isFlawless, store, save, cloudInit, cloudSet, cloudDel, onSyncChange, syncState, BOARD, MY_ID, NAMES, onBoardChange, summarize, publishSummary, type Attempt, type DaySummary} from './stats';
declare const PS: any;

// ---------------- Data ----------------
let POOL: Pool; let DESC: {m: Record<string, string>; a: Record<string, string>; i: Record<string, string>};
let SPR: {cols: number; cell: number; rows: number; index: Record<string, number>};

const $ = (sel: string, root: ParentNode = document) => root.querySelector(sel) as HTMLElement;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]!));
const toID = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

const MODES: {id: BaseMode; label: string; blurb: string}[] = [
  {id: 'classic', label: 'Classic', blurb: 'Curated competitive sets from Showdown Random Battles.'},
  {id: 'random', label: 'Random', blurb: 'Random ability and item, with moves that are usually useful.'},
  {id: 'chaos', label: 'Chaos', blurb: 'Any legal moves, any ability, any held item. At least one Legendary or Mythical every day.'},
];
const DIFFS: {id: Difficulty; label: string; blurb: string}[] = [
  {id: 'simple', label: 'Simple', blurb: 'Red always uses his hardest-hitting move and never switches.'},
  {id: 'smart', label: 'Smart', blurb: 'Red sets up, puts you to sleep, and switches out of bad matchups.'},
];
const FMTS = [{id: 'singles', label: 'Singles'}, {id: 'doubles', label: 'Doubles'}];
/** Label and blurb for a full mode id such as "chaosD" (Chaos Doubles). */
function modeInfo(m: Mode) {
  const b = MODES.find(x => x.id === baseMode(m))!;
  return isDoublesMode(m) ? {...b, label: b.label + ' Doubles', blurb: b.blurb + ' Two Pokémon per side.'} : b;
}
const withFmt = (b: BaseMode, doubles: boolean) => (doubles ? b + 'D' : b) as Mode;
const STATUS_NAME: Record<string, string> = {psn: 'PSN', tox: 'TOX', brn: 'BRN', par: 'PAR', slp: 'SLP', frz: 'FRZ'};

// ---------------- Prefs ----------------
interface Prefs { mode: Mode; diff: Difficulty; fast: boolean; leads: Record<string, number>; t?: number }
const PREFS_KEY = 'dailyred:v1:prefs';
const prefs: Prefs = {mode: 'classic', diff: 'smart', fast: false, leads: {}, ...store(PREFS_KEY, {})};
const savePrefs = () => {
  prefs.t = Date.now(); const ctx = watching?.prev || endlessCtx?.prev;
  let p: Prefs = ctx ? {...prefs, mode: ctx.mode, diff: ctx.diff, ...('leads' in ctx ? {leads: {...(ctx as any).leads}} : {})} : prefs;
  // Keep the leads picked for the endless battle in progress (so they survive a reload), and drop older endless ones
  const cur = erun && !erun.over ? `${runKey(erun)}:` : null;
  const leads: Record<string, number> = {};
  for (const [k, v] of Object.entries(p.leads)) if (!k.startsWith('x')) leads[k] = v;
  if (cur) for (const [k, v] of Object.entries(prefs.leads)) if (k.startsWith(cur)) leads[k] = v;
  p = {...p, leads}; if (ctx && 'leads' in ctx) (ctx as any).leads = {...leads}; save(PREFS_KEY, p); cloudSet('prefs', {...p}); };
// In-progress battle: one record per day, mode and difficulty
const curId = () => `cur2_${today}_${prefs.mode}_${prefs.diff}`;
function saveCurrent(v: {lead: number | number[]; choices: string[]}) { if (practice) return; const t = Date.now(); save(currentKey(), {...v, t}); cloudSet(curId(), {...v, t}); }
function clearCurrent() { if (practice) return; try { localStorage.removeItem(currentKey()); } catch { /* ignore */ } cloudDel(curId()); }

// ---------------- App state ----------------
let today = localDateKey();
/** A past day being replayed (never counted). null = today's real battle. */
let practice: string | null = null;
const playDate = () => practice || today;
const FIRST_DAY = '2026-10-16';
let team: PokemonSet[] = [];
let tab: 'play' | 'stats' | 'friends' | 'how' | 'endless' = 'play';
const currentKey = () => `dailyred:v2:current:${today}:${prefs.mode}:${prefs.diff}`; // v2: new EV spreads, older unfinished battles no longer replay
/** What the Stats and Friends tabs show. Follows the Play tab, but can be changed there freely, even mid-battle. */
const view = {mode: prefs.mode as Mode, diff: prefs.diff as Difficulty};
const sel = () => (tab === 'play' ? prefs : view);
const leadKey = () => `${playDate()}:${prefs.mode}`;
const leadIdx = () => Math.min(5, prefs.leads[leadKey()] ?? 0);
/** Your lead(s): one in singles, two in doubles (the second is stored next to the first). */
function leadList(): number[] {
  const a = leadIdx();
  if (!isDoublesMode(prefs.mode)) return [a];
  let b = Math.min(5, prefs.leads[leadKey() + ':b'] ?? (a === 0 ? 1 : 0));
  if (b === a) b = a === 0 ? 1 : 0;
  return [a, b];
}

interface MonView {form?: string; gender?: string; sub?: boolean; species: string; name: string; level: number; hp: number; maxhp: number; status: string; fainted: boolean; boosts: Record<string, number>}
interface SideView { active: string[]; mons: Record<string, MonView>; order: string[] }
interface Session {
  endless?: boolean;
  watch?: {id: string; date: string; key: string; who: string; choices: string[]; i: number; paused?: boolean; lead: number | number[]; turns: number[]};
  battle: any; memo: {lastSwitchTurn: number}; choices: string[]; logIndex: number;
  view: {p1: SideView; p2: SideView; weather: string; turn?: number};
  messages: string[]; queue: string[][]; playing: boolean; parser: any;
  lead: number | number[]; doubles: boolean; ended: boolean; recorded: boolean;
  kos: Record<string, number>; redKos: Record<string, number>; fainted: string[];
}
let S: Session | null = null;

// ---------------- Sprites ----------------
function sprite(species: string, back = false, size = 96, extra = '') {
  const id = toID(species); const i = SPR.index[id] ?? SPR.index[toID(species.split('-')[0])];
  if (i === undefined) return `<span class="spr" style="--s:${size}px"></span>`;
  return `<span class="spr ${back ? 'bk' : ''} ${extra}" role="img" aria-label="${esc(species)}" style="--s:${size}px;--c:${i % SPR.cols};--r:${Math.floor(i / SPR.cols)}"></span>`;
}
/** The Substitute doll shown in place of a Pokémon hiding behind one. */
const subSprite = (back: boolean, extra: string) => `<span class="spr subst ${back ? 'bk' : ''} ${extra}" role="img" aria-label="Substitute" style="--s:96px"></span>`;
const typeBadge = (t: string) => `<span class="type t-${toID(t)}">${esc(t)}</span>`;
/** ♂ / ♀ after a name (the variation selector keeps iPhones from drawing them as emoji). */
const genderMark = (g?: string) => g === 'M' ? '<span class="gd m" title="Male">\u2642\uFE0E</span>' : g === 'F' ? '<span class="gd f" title="Female">\u2640\uFE0E</span>' : '';
const statusBadge = (s: string) => s && STATUS_NAME[s] ? `<span class="status s-${s}">${STATUS_NAME[s]}</span>` : '';

function moveName(id: string, ivs?: any) {
  const mv = PS.Dex.moves.get(id);
  if (mv.id === 'hiddenpower' && ivs) { const t = PS.Dex.getHiddenPower(ivs).type; return {name: `Hidden Power ${t}`, type: t}; }
  return {name: mv.name, type: mv.type};
}
// ---------------- Team ----------------
function rebuildTeam() {
  team = generateTeam(POOL, playDate(), prefs.mode);
}
function orderedTeam(lead: number | number[]) {
  const leads = Array.isArray(lead) ? lead : [lead];
  return [...leads.map(i => team[i]), ...team.filter((_, i) => !leads.includes(i))];
}

// ---------------- Battle session ----------------
function emptySide(): SideView { return {active: [], mons: {}, order: []}; }

function startSession(lead: number | number[], replay: string[] = []) {
  const doubles = isDoublesMode(prefs.mode);
  const battle = newBattle(orderedTeam(lead), battleSeed(playDate(), prefs.mode), doubles, redTeamFor(playDate(), prefs.mode));
  const parser = new BattleTextParser('p1');
  S = {battle, memo: {lastSwitchTurn: -9}, choices: [], logIndex: 0, view: {p1: emptySide(), p2: emptySide(), weather: ''},
    messages: [], queue: [], playing: false, parser, lead, doubles, ended: false, recorded: false, kos: {}, redKos: {}, fainted: []};
  for (const [sid, side] of [['p1', battle.sides[0]], ['p2', battle.sides[1]]] as const) {
    for (const p of side.pokemon) {
      const ident = `${sid}: ${p.name}`;
      S.view[sid].mons[ident] = {gender: p.gender, species: p.species.name, name: p.name, level: p.level, hp: p.maxhp, maxhp: p.maxhp, status: '', fainted: false, boosts: {}};
      S.view[sid].order.push(ident);
    }
  }
  pump();
  for (const c of replay) { if (battle.ended) break; S.choices.push(c); battle.choose('p1', c); pump(); }
  // Fast-forward the log without animation
  const lines = collectLines();
  for (const l of lines) applyLine(l, true);
  S.messages = S.messages.slice(-60);
  if (battle.ended) finish();
}

/** Let Red make every choice he owes. */
function pump() {
  const b = S!.battle; let guard = 0;
  while (!b.ended && guard++ < 10) {
    const s2 = b.sides[1];
    if (s2.requestState && !s2.isChoiceDone()) { b.choose('p2', redChoice(b, prefs.diff, S!.memo)); continue; }
    break;
  }
}

function collectLines(): string[][] {
  const b = S!.battle; const out: string[][] = [];
  const log: string[] = b.log;
  for (let i = S!.logIndex; i < log.length; i++) {
    const line = log[i];
    if (line.startsWith('|split|')) { out.push([log[i + 1]]); i += 2; continue; } // secret line, skip public copy
    out.push([line]);
  }
  S!.logIndex = log.length;
  return out;
}

function parseHP(str: string) {
  const [hpPart, status] = (str || '').split(' ');
  if (hpPart === '0' || hpPart?.startsWith('0 ')) return {hp: 0, max: 0, status: status === 'fnt' ? '' : status || ''};
  const [hp, max] = hpPart.split('/').map(Number);
  return {hp: hp || 0, max: max || 0, status: status && status !== 'fnt' ? status : ''};
}
const sideOf = (ident: string) => (ident || '').slice(0, 2) as 'p1' | 'p2';
const normIdent = (ident: string) => ident.replace(/^(p[12])[a-z]?:/, '$1:');
const lastMoveBy: Record<string, string> = {p1: '', p2: ''};
const posOf = (ident: string) => Math.max(0, 'abc'.indexOf((ident || '')[2] || 'a'));

function applyLine([line]: string[], silent = false) {
  if (!line || !S) return;
  const {args, kwArgs} = BattleTextParser.parseBattleLine(line);
  const cmd = args[0];
  const v = S.view;
  const mon = (ident: string) => v[sideOf(ident)]?.mons[normIdent(ident)];
  switch (cmd) {
  case 'switch': case 'drag': case 'replace': {
    const sd = sideOf(args[1]); const id = normIdent(args[1]); const m = mon(args[1]);
    // A substitute only survives a switch through Baton Pass (kept) or Shed Tail (made for the incoming Pokémon)
    const prev = v[sd].mons[v[sd].active[posOf(args[1])] || ''];
    const passed = cmd === 'switch' && (lastMoveBy[sd] === 'Shed Tail' || (lastMoveBy[sd] === 'Baton Pass' && !!prev?.sub));
    const prevSub = !!prev?.sub;
    if (prev && prev !== m) prev.sub = false;
    if (m && cmd !== 'replace') m.sub = passed;
    if (cmd === 'replace') {
      // Illusion broke: everything that happened "to" the disguise really happened to this Pokémon (e.g. Zoroark),
      // so it takes over the disguise's HP, status, boosts and substitute; the disguised Pokémon gets its real state back
      if (m && prev && prev !== m) {
        m.hp = prev.maxhp ? Math.round(prev.hp / prev.maxhp * m.maxhp) : m.hp; m.status = prev.status; m.boosts = prev.boosts; m.sub = prevSub;
        const real = S.battle.sides[sd === 'p1' ? 0 : 1].pokemon.find((p: any) => `${sd}: ${p.name}` === normIdent(v[sd].active[posOf(args[1])]));
        prev.boosts = {}; prev.sub = false;
        if (real) { prev.hp = real.fainted ? 0 : Math.round(real.hp / real.maxhp * prev.maxhp); prev.status = real.status || ''; }
      }
    } else if (m) { if (args[2]) m.form = args[2].split(',')[0]; const h = parseHP(args[3]); m.hp = h.hp; if (h.max) m.maxhp = h.max; m.status = h.status; m.boosts = {}; }
    v[sd].active[posOf(args[1])] = id;
    break;
  }
  case 'swap': {
    const sd = sideOf(args[1]); const act = v[sd].active; const from = posOf(args[1]), to = +args[2];
    if (!isNaN(to)) { const t = act[to]; act[to] = act[from]; act[from] = t; }
    break;
  }
  case '-damage': case '-heal': case '-sethp': {
    const m = mon(args[1]); if (m) { const h = parseHP(args[2]); m.hp = h.hp; if (h.max) m.maxhp = h.max; m.status = h.status; }
    break;
  }
  case '-status': { const m = mon(args[1]); if (m) m.status = args[2]; break; }
  case '-curestatus': { const m = mon(args[1]); if (m) m.status = ''; break; }
  case '-cureteam': { for (const m of Object.values(v[sideOf(args[1])].mons)) m.status = ''; break; }
  case 'move': lastMoveBy[sideOf(args[1])] = args[2]; break;
  // Form changes (Palafin-Hero, Aegislash-Blade, Mimikyu-Busted...) swap the sprite
  case 'detailschange': case '-formechange': { const m = mon(args[1]); if (m && args[2]) m.form = args[2].split(',')[0]; break; }
  case 'turn': lastMoveBy.p1 = lastMoveBy.p2 = ''; break;
  case '-start': case '-end': if (/Substitute/.test(args[2] || '')) { const m = mon(args[1]); if (m) m.sub = cmd === '-start'; } break;
  case 'faint': {
    const m = mon(args[1]); if (m) { m.hp = 0; m.fainted = true; m.status = ''; m.sub = false; }
    break;
  }
  case '-boost': case '-unboost': {
    const m = mon(args[1]); if (!m) break; const n = (+args[3] || 0) * (cmd === '-boost' ? 1 : -1);
    m.boosts[args[2]] = Math.max(-6, Math.min(6, (m.boosts[args[2]] || 0) + n)); break;
  }
  case '-setboost': { const m = mon(args[1]); if (m) m.boosts[args[2]] = +args[3]; break; }
  case '-clearnegativeboost': { const m = mon(args[1]); if (m) for (const k of Object.keys(m.boosts)) if (m.boosts[k] < 0) delete m.boosts[k]; break; }
  case '-clearboost': { const m = mon(args[1]); if (m) m.boosts = {}; break; }
  case '-clearallboost': for (const sd of ['p1', 'p2'] as const) for (const m of Object.values(v[sd].mons)) m.boosts = {}; break;
  case '-invertboost': { const m = mon(args[1]); if (m) for (const k of Object.keys(m.boosts)) m.boosts[k] = -m.boosts[k]; break; }
  case '-copyboost': { const m = mon(args[1]), src = mon(args[2]); if (m && src) m.boosts = {...src.boosts}; break; }
  case '-swapboost': { const a = mon(args[1]), c = mon(args[2]); if (a && c) { const t = a.boosts; a.boosts = c.boosts; c.boosts = t; } break; }
  case '-weather':
    // The text parser needs to know which weather ended (Showdown's client passes it along the same way)
    if ((args[1] === 'none' || !args[1]) && !kwArgs.from && v.weather) kwArgs.from = v.weather;
    v.weather = args[1] === 'none' ? '' : args[1]; break;
  }
  let msg = '';
  try { msg = kwArgs.silent !== undefined ? '' : S.parser.parseArgs(args, kwArgs) || ''; } catch { msg = ''; }
  msg = msg.replace(/\|/g, '').trim();
  if (msg && !msg.startsWith('==')) {
    for (const part of msg.split('\n').map(x => x.trim()).filter(Boolean)) S.messages.push(part);
  }
  if (cmd === 'turn') { S.messages.push(`— Turn ${args[1]} —`); S.view.turn = +args[1]; }
  void silent;
}

function choose(choice: string) {
  if (!S || S.playing || S.ended) return;
  const b = S.battle;
  const s1 = b.sides[0];
  if (!s1.requestState || s1.isChoiceDone()) return;
  try { b.choose('p1', choice); } catch (e) { console.error(e); return; }
  S.choices.push(choice);
  pump();
  saveCurrent({lead: S.lead, choices: S.choices});
  if (S.endless && erun) { erun.choices = S.choices.slice(); erun.lead = S.lead; saveRun(); }
  S.queue.push(...collectLines());
  playQueue();
}

let advance: (() => void) | null = null;
function playQueue() {
  if (!S) return;
  S.playing = true; renderBattle();
  const step = () => {
    if (!S) return;
    if (!S.queue.length) {
      S.playing = false;
      if (S.battle.ended) { finish(); render(); return; }
      if (S.watch) { if (S.watch.paused) resumeFn = watchStep; else watchTimer = setTimeout(watchStep, prefs.fast ? 250 : 600); renderBattle(); return; }
      renderBattle(); return;
    }
    const line = S.queue.shift()!;
    const before = S.messages.length;
    applyLine(line);
    renderBattle();
    const shown = S.messages.length > before;
    const cmd = (line[0] || '').split('|')[1] || '';
    const major = ['move', 'switch', 'drag', 'faint', '-damage', '-heal', 'cant', '-status', 'turn'].includes(cmd) || shown;
    const hpChange = cmd === '-damage' || cmd === '-heal' || cmd === '-sethp';
    const wait = !major ? 0 : hpChange ? (prefs.fast ? 380 : 800) : shown ? (prefs.fast ? 400 : 800) : prefs.fast ? 100 : 250;
    if (!wait) { step(); return; }
    if (S.watch?.paused) { resumeFn = step; return; }
    stepTimer = setTimeout(() => { advance = null; step(); }, wait);
    advance = () => { clearTimeout(stepTimer); advance = null; step(); };
  };
  step();
}
// Replays can be paused: whatever was due to happen next waits in resumeFn until playback resumes
let stepTimer: any = null, resumeFn: (() => void) | null = null;
function togglePause() {
  const w = S?.watch; if (!w || S!.ended) return;
  if (!w.paused) {
    w.paused = true;
    if (advance) { clearTimeout(stepTimer); advance = null; resumeFn = playQueueResume; }
    else if (watchTimer) { clearTimeout(watchTimer); watchTimer = null; resumeFn = watchStep; }
  } else {
    w.paused = false;
    const f = resumeFn; resumeFn = null;
    if (f) setTimeout(f, 120);
    else if (!S!.playing && !S!.battle.ended) watchTimer = setTimeout(watchStep, 120);
  }
  renderBattle();
}
/** Continue a paused message queue from where it stopped. */
function playQueueResume() { if (S) { if (S.queue.length) playQueue(); else { S.playing = false; if (S.battle.ended) { finish(); render(); } else if (S.watch) watchStep(); } } }

function finish() {
  if (!S || S.recorded) return;
  S.ended = true;
  const b = S.battle;
  // Tally KOs from the full log
  tallyKOs();
  if (S.endless) { S.recorded = true; endlessBattleOver(b.winner === 'You'); return; }
  if (practice) { S.recorded = true; return; }
  if (!S.recorded) {
    S.recorded = true;
    const prior = attemptsFor(loadAttempts(), today, prefs.mode, prefs.diff).length;
    const a: Attempt = {date: today, mode: prefs.mode, diff: prefs.diff, n: prior + 1,
      result: b.winner === 'You' ? 'win' : 'loss',
      lost: b.sides[0].pokemon.filter((p: any) => p.fainted).length,
      redLeft: b.sides[1].pokemon.filter((p: any) => !p.fainted).length,
      turns: b.turn, lead: leadNames(), at: Date.now(),
      kos: S.kos, fainted: S.fainted, redKos: S.redKos, rp: packReplay(Array.isArray(S.lead) ? S.lead : [S.lead], S.choices)};
    addAttempt(a);
    (S as any).attempt = a;
    clearCurrent();
  }
}

const leadNames = () => orderedTeam(S!.lead).slice(0, S!.doubles ? 2 : 1).map(s => s.species).join(' & ');
function tallyKOs() {
  if (!S) return;
  const log: string[] = S.battle.log; let lastMover: Record<string, string> = {};
  const kos: Record<string, number> = {}, redKos: Record<string, number> = {}, fainted: string[] = [];
  const nameToSpecies = (ident: string) => S!.view[sideOf(ident)].mons[normIdent(ident)]?.species || ident;
  let lastAttacker = '';
  for (const line of log) {
    const parts = line.split('|');
    if (parts[1] === 'move') { lastAttacker = parts[2]; lastMover[sideOf(parts[2])] = parts[2]; }
    if (parts[1] === 'switch' || parts[1] === 'drag') { /* keep */ }
    if (parts[1] === 'faint') {
      const victim = parts[2]; const vs = sideOf(victim);
      const killer = sideOf(lastAttacker) !== vs ? lastAttacker : (lastMover[vs === 'p1' ? 'p2' : 'p1'] || '');
      if (vs === 'p1') { fainted.push(nameToSpecies(victim)); if (killer) { const k = nameToSpecies(killer); redKos[k] = (redKos[k] || 0) + 1; } }
      else if (killer) { const k = nameToSpecies(killer); kos[k] = (kos[k] || 0) + 1; }
    }
    if (parts[1] === 'turn') lastAttacker = '';
  }
  S.kos = kos; S.redKos = redKos; S.fainted = fainted;
}

function forfeitAndRetry(record: boolean) {
  if (S?.endless) { if (!S.ended) { tallyKOs(); endlessBattleOver(false); } S = null; render(); return; }
  if (S && !S.ended && record && S.choices.length && !practice) {
    const b = S.battle; tallyKOs();
    const prior = attemptsFor(loadAttempts(), today, prefs.mode, prefs.diff).length;
    addAttempt({date: today, mode: prefs.mode, diff: prefs.diff, n: prior + 1, result: 'forfeit',
      lost: b.sides[0].pokemon.filter((p: any) => p.fainted).length, redLeft: b.sides[1].pokemon.filter((p: any) => !p.fainted).length,
      turns: b.turn, lead: leadNames(), at: Date.now(), kos: S.kos, fainted: S.fainted, redKos: S.redKos});
  }
  clearCurrent();
  S = null; render();
}

// ---------------- Rendering ----------------
function render() {
  keepAwake();
  const root = $('#app');
  const y = window.scrollY;
  const open = new Set([...document.querySelectorAll('details[open]')].map(d => d.id || ''));
  const keepMoreOpen = [...document.querySelectorAll('details.more')].map(d => (d as HTMLDetailsElement).open);
  root.innerHTML = `
    ${headerHTML()}
    <main class="wrap">
      ${tab === 'endless' ? endlessHTML() : tab === 'play' ? playHTML() : tab === 'stats' ? statsHTML() : tab === 'friends' ? friendsPageHTML() : howHTML()}
    </main>
    <footer class="wrap foot">Unofficial fan project. Battles run on Pokémon Showdown's simulator (Gen 9, National Dex rules, no Mega Evolution or Terastallization). Pokémon and sprites © Nintendo, Creatures Inc. and GAME FREAK inc.</footer>`;
  if ((tab === 'play' || tab === 'endless') && S) renderBattle();
  for (const id of open) if (id) { const d = document.getElementById(id) as HTMLDetailsElement | null; if (d) d.open = true; }
  document.querySelectorAll('details.more').forEach((d, i) => { if (keepMoreOpen[i]) (d as HTMLDetailsElement).open = true; });
  window.scrollTo(0, y);
  nameFriends();
  bindCountdown();
}

function headerHTML() {
  const [y, mo, d] = today.split('-').map(Number);
  const date = new Date(y, mo - 1, d).toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
  return `<header class="top"><div class="wrap topin">
    <h1 class="logo">DAILY <span>RED</span></h1>
    <div class="dl">No. ${dayNumber(today)}, ${esc(date)}<br><span id="cd"></span></div>
    <nav class="tabs" role="tablist">
      ${(['play', 'endless', 'stats', 'friends', 'how'] as const).map(t => `<button role="tab" id="tab-${t}" aria-selected="${tab === t}" data-tab="${t}">${{play: 'Play', endless: 'Endless', stats: 'Stats', friends: 'Friends', how: 'How to play'}[t]}</button>`).join('')}
    </nav></div></header>`;
}

const busy = () => !!S && !S.ended;
function controlsHTML() {
  if (tab !== 'play') return `<section class="controls">
    <div class="ctl"><span class="lbl">Mode</span>${seg('vmode', MODES, baseMode(view.mode))}</div>
    <div class="ctl"><span class="lbl">Format</span>${seg('vfmt', FMTS, isDoublesMode(view.mode) ? 'doubles' : 'singles')}</div>
    <div class="ctl"><span class="lbl">Red</span>${seg('vdiff', DIFFS, view.diff)}</div>
  </section>`;
  return `<section class="controls">
    <div class="ctl"><span class="lbl">Mode</span>${seg('mode', MODES, baseMode(prefs.mode), busy())}</div>
    <div class="ctl"><span class="lbl">Format</span>${seg('fmt', FMTS, isDoublesMode(prefs.mode) ? 'doubles' : 'singles', busy())}</div>
    <div class="ctl"><span class="lbl">Red</span>${seg('diff', DIFFS, prefs.diff, busy())}</div>
  </section>${busy() ? '<p class="hint lockhint">Finish or restart this battle to change mode, format or difficulty.</p>' : ''}`;
}
function seg(name: string, items: {id: string; label: string}[], val: string, disabled = false) {
  return `<div class="seg" role="radiogroup" aria-label="${name}">${items.map(i =>
    `<button role="radio" id="${name}-${i.id}" aria-checked="${i.id === val}" data-${name}="${i.id}" ${disabled ? 'disabled' : ''}>${i.label}</button>`).join('')}</div>`;
}

function refreshSummary() {
  const el = document.getElementById('today'); if (el) el.outerHTML = todaySummary();
  const ctl = document.querySelector('.controls'); if (ctl) ctl.outerHTML = controlsHTML();
}
function todaySummary() {
  const list = attemptsFor(loadAttempts(), today, prefs.mode, prefs.diff);
  const fl = list.find(isFlawless);
  const first = list[0];
  const pills = list.slice(-12).map(a => `<span class="pip ${a.result === 'win' ? (a.lost === 0 ? 'p-flaw' : 'p-win') : a.result === 'forfeit' ? 'p-ff' : 'p-loss'}" title="Attempt ${a.n}: ${a.result === 'forfeit' ? 'restarted' : a.result}${a.result === 'win' ? `, lost ${a.lost}` : ''}"></span>`).join('');
  return `<div class="today" id="today">
    <div><span class="lbl">Attempt</span><b class="num">${list.length + (S && !S.ended ? 1 : S?.ended ? 0 : 1)}</b></div>
    <div><span class="lbl">First try</span><b>${first ? (first.result === 'win' ? `Won${first.lost ? `, lost ${first.lost}` : ', flawless'}` : first.result === 'forfeit' ? 'Retried' : 'Lost') : '—'}</b></div>
    <div><span class="lbl">Flawless</span><b>${fl ? `Attempt ${fl.n}` : 'Not yet'}</b></div>
    <div class="pips" aria-label="Today's attempts">${pills}</div>
  </div>`;
}

const niceDate = (d: string) => new Date(d + 'T12:00').toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
function pastDays() {
  const out: string[] = [];
  const [y, m, d] = today.split('-').map(Number);
  for (let i = 1; ; i++) { const k = ymdOf(new Date(y, m - 1, d - i)); if (k < FIRST_DAY) break; out.push(k); }
  return out;
}
const ymdOf = (t: Date) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
function pastPickerHTML() {
  const days = pastDays();
  if (!days.length) return '';
  return `<div class="pastpick"><label for="pastday">Replay a past day</label>
    <span class="selwrap"><select id="pastday"><option value="">Choose a day…</option>${days.map(d => `<option value="${d}">No. ${dayNumber(d)} · ${esc(niceDate(d))}</option>`).join('')}</select></span></div>`;
}
// ---------------- Watching a friend's (or your own) best attempt ----------------
let watching: null | {prev: {S: Session | null; practice: string | null; mode: Mode; diff: Difficulty; tab: 'play' | 'stats' | 'friends' | 'how' | 'endless'; lead: Record<string, number>}} = null;
let watchTimer: any = null;
/** Packed replay for a player's best attempt that day, or '' (your own comes from this device's attempts). */
function replayOf(id: string, date: string, key: string): string {
  if (id === (MY_ID || 'me')) { const [mode, diff] = key.split('_'); return bestAttempt(attemptsFor(loadAttempts(), date, mode as Mode, diff as Difficulty))?.rp || ''; }
  return BOARD[id]?.rp?.[date]?.[key] || '';
}
function startWatch(id: string, date: string, key: string) {
  if (S?.playing) return;
  const packed = replayOf(id, date, key); if (!packed) return;
  const {lead, choices} = unpackReplay(packed);
  const [mode, diff] = key.split('_') as [Mode, Difficulty];
  if (!watching) watching = {prev: {S, practice, mode: prefs.mode, diff: prefs.diff, tab, lead: {...prefs.leads}}};
  clearTimeout(watchTimer); clearTimeout(stepTimer); advance = null; resumeFn = null;
  practice = date; prefs.mode = mode; prefs.diff = diff; tab = 'play';
  rebuildTeam(); resetUI();
  const l = isDoublesMode(mode) ? lead : lead[0];
  startSession(l);
  const me = id === (MY_ID || 'me');
  S!.watch = {id, date, key, who: me ? 'Your' : `${friendName(id)}'s`, choices, i: 0, lead: l, turns: replayTurns(l, choices)};
  render(); window.scrollTo(0, 0);
  watchTimer = setTimeout(watchStep, 900);
}
/** Battle turn reached after each number of choices (index 0 = before any), so the replay can jump between turns. */
function replayTurns(lead: number | number[], choices: string[]) {
  const b = newBattle(orderedTeam(lead), battleSeed(playDate(), prefs.mode), isDoublesMode(prefs.mode), redTeamFor(playDate(), prefs.mode));
  const memo = {lastSwitchTurn: -9};
  const red = () => { for (let g = 0; g < 10 && !b.ended; g++) { const s2 = b.sides[1]; if (s2.requestState && !s2.isChoiceDone()) b.choose('p2', redChoice(b, prefs.diff, memo)); else break; } };
  red(); const turns = [b.turn];
  for (const c of choices) { try { b.choose('p1', c); } catch { break; } red(); turns.push(b.turn); }
  return turns;
}
/** Jump the replay to just after `k` choices, instantly; keeps playing or paused as it was. */
function seekWatch(k: number) {
  const w = S?.watch; if (!w) return;
  clearTimeout(watchTimer); clearTimeout(stepTimer); watchTimer = null; advance = null; resumeFn = null;
  k = Math.max(0, Math.min(w.choices.length, k));
  startSession(w.lead, w.choices.slice(0, k));
  S!.watch = {...w, i: k};
  render();
  if (!S!.battle.ended) { if (w.paused) resumeFn = watchStep; else watchTimer = setTimeout(watchStep, 500); }
}
function replayControl(what: string) {
  const w = S?.watch; if (!w) return;
  const pos = S!.playing ? Math.max(0, w.i - 1) : w.i; // choices whose turn is fully shown
  const t = w.turns[pos] ?? 1;
  if (what === 'toggle') { if (S!.ended) seekWatch(0); else togglePause(); return; }
  if (what === 'first') return seekWatch(0);
  if (what === 'end') return seekWatch(w.choices.length);
  if (what === 'prev') { const target = Math.max(1, t - 1); return seekWatch(Math.max(0, w.turns.findIndex(x => x >= target))); }
  if (what === 'skip') { let k = w.turns.findIndex((x, i) => i > pos && x > t); if (k < 0) k = w.choices.length; return seekWatch(k); }
}
const ICON: Record<string, string> = {
  first: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="2" height="10"/><path d="M9 3 4 8l5 5zM15 3l-5 5 5 5z"/></svg>',
  prev: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3 3 8l5 5zM14 3 9 8l5 5z"/></svg>',
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11L13 8z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3" width="3" height="10"/><rect x="9.5" y="3" width="3" height="10"/></svg>',
  skip: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3l5 5-5 5zM8 3l5 5-5 5z"/></svg>',
  end: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 3l5 5-5 5zM7 3l5 5-5 5z"/><rect x="12" y="3" width="2" height="10"/></svg>',
};
function replayBarHTML() {
  const w = S?.watch; if (!w) return '';
  const ended = S!.ended && !S!.playing;
  const playing = !w.paused && !ended;
  const btn = (id: string, icon: string, label: string, dis = false) => `<button class="rc" data-rc="${id}" ${dis ? 'disabled' : ''} aria-label="${label}">${ICON[icon]}<span>${label}</span></button>`;
  const atStart = w.i === 0 && !S!.playing;
  return `<div class="replaybar" role="toolbar" aria-label="Replay controls">
    ${btn('first', 'first', 'First turn', atStart)}${btn('prev', 'prev', 'Prev turn', atStart)}
    ${btn('toggle', playing ? 'pause' : 'play', ended ? 'Replay' : playing ? 'Pause' : 'Play')}
    ${btn('skip', 'skip', 'Skip turn', ended)}${btn('end', 'end', 'Skip to end', ended)}
  </div>`;
}
function watchStep() {
  if (!S?.watch || S.playing || S.battle.ended) return;
  const c = S.watch.choices[S.watch.i++];
  if (c === undefined) return;
  try { S.battle.choose('p1', c); } catch (e) { console.error('replay choice failed', c, e); return; }
  S.choices.push(c); pump();
  S.queue.push(...collectLines()); playQueue();
}
function exitWatch(rerender: boolean) {
  if (!watching) return;
  clearTimeout(watchTimer); clearTimeout(stepTimer); advance = null; resumeFn = null;
  const p = watching.prev; watching = null;
  S = p.S; practice = p.practice; prefs.mode = p.mode; prefs.diff = p.diff; prefs.leads = p.lead;
  rebuildTeam(); resetUI();
  tab = p.tab === 'play' ? 'friends' : p.tab;
  if (rerender) { render(); document.getElementById('calendar')?.scrollIntoView({block: 'start'}); }
}
function watchBanner() {
  const w = S!.watch!;
  return `<div class="practice" id="practice"><div><span class="lbl">Replay</span><b>${esc(w.who)} best · No. ${dayNumber(w.date)} · ${esc(modeInfo(prefs.mode).label)} · ${esc(DIFFS.find(d => d.id === prefs.diff)!.label)}</b><span class="hint">Use the controls under the battle to pause or jump between turns. Nothing here is counted.</span></div>
    <button class="ghost" id="watch-exit">Back to friends</button></div>`;
}
function practiceBanner() {
  return `<div class="practice" id="practice"><div><span class="lbl">Practice</span><b>No. ${dayNumber(practice!)} · ${esc(niceDate(practice!))}</b><span class="hint">Doesn't count toward stats, attempts or the Friends board.</span></div>
    <button class="ghost" id="back-today" ${busy() ? 'disabled' : ''}>Back to today</button></div>`;
}
function startPractice(date: string) {
  if (busy()) return;
  practice = date === today ? null : date;
  S = null; resetUI(); rebuildTeam(); if (!practice) restore();
  tab = 'play'; render(); window.scrollTo(0, 0);
}
// ---------------- Endless mode ----------------
// A run is a chain of battles against Red, each with a fresh random team. Win and you get a new team; lose and the
// run is over. Teams and luck come from a random run id instead of the date, so every run is different.
interface EndlessRun {
  id: string; mode: Mode; diff: Difficulty; n: number; wins: number; lost: number[]; turns: number[];
  started: number; lead?: number | number[]; choices: string[]; over?: boolean; cleared?: number; t?: number; cn?: boolean; ended?: number; lastTeam?: string[]; redLeft?: number;
}
interface EndlessDone { id: string; mode: Mode; diff: Difficulty; wins: number; lost: number[]; started: number; ended: number; lastTeam?: string[]; redLeft?: number }
const ERUN_KEY = 'dailyred:v1:endless:run', EDONE_KEY = 'dailyred:v1:endless:runs', EPREFS_KEY = 'dailyred:v1:endless:prefs';
let erun: EndlessRun | null = store<EndlessRun | null>(ERUN_KEY, null);
let edone: EndlessDone[] = store<EndlessDone[]>(EDONE_KEY, []);
const eprefs: {mode: Mode; diff: Difficulty} = {mode: 'classic', diff: 'smart', ...store(EPREFS_KEY, {})};
let endlessCtx: null | {prev: {S: Session | null; practice: string | null; mode: Mode; diff: Difficulty; leads: Record<string, number>}} = null;
const runKey = (r: EndlessRun) => `x${r.id}-${r.n}${r.cn ? 'c' : ''}`; // sorts after every date, so all of today's team rules apply
/** Save the run on this device and back it up to the account, so another device can carry on with it. */
const saveRun = () => { if (erun) erun.t = Date.now(); save(ERUN_KEY, erun); if (erun) cloudSet('endless_cur', {...erun}); };
const saveDone = () => { save(EDONE_KEY, edone); cloudSet('endless_runs', {list: edone.slice(-500)}); };

/** Point the shared battle code at the run's current battle (team, luck, mode). */
function applyRun() {
  if (!erun) { practice = 'x-setup'; return; }
  practice = runKey(erun); prefs.mode = erun.mode; prefs.diff = erun.diff;
  rebuildTeam();
}
/** Stop any battle animation and apply what's left of it instantly (used when switching between daily and endless). */
function settleBattle() {
  clearTimeout(stepTimer); clearTimeout(watchTimer); advance = null; resumeFn = null;
  if (S?.playing) { while (S.queue.length) applyLine(S.queue.shift()!, true); S.playing = false; if (S.battle.ended) finish(); }
}
function enterEndless() {
  settleBattle();
  if (!endlessCtx) endlessCtx = {prev: {S, practice, mode: prefs.mode, diff: prefs.diff, leads: {...prefs.leads}}};
  S = null; resetUI();
  if (erun && !erun.over && erun.cleared === erun.n) { erun.n++; erun.choices = []; delete erun.lead; saveRun(); } // won the last battle: on to the next team
  applyRun();
  if (erun && !erun.over && erun.choices.length && erun.lead !== undefined) {
    try { startSession(erun.lead, erun.choices); S!.endless = true; } catch (e) { console.error(e); S = null; }
  }
}
function exitEndless() {
  if (!endlessCtx) return;
  settleBattle();
  const p = endlessCtx.prev; endlessCtx = null;
  S = p.S; practice = p.practice; prefs.mode = p.mode; prefs.diff = p.diff; prefs.leads = p.leads;
  resetUI(); rebuildTeam();
}
function startRun() {
  erun = {id: Math.random().toString(36).slice(2, 10), mode: eprefs.mode, diff: eprefs.diff, n: 1, wins: 0, lost: [], turns: [], started: Date.now(), choices: [], cn: true};
  saveRun(); S = null; resetUI(); applyRun();
}
function endRun() {
  if (!erun || erun.over) return;
  erun.over = true; erun.ended = Date.now(); erun.choices = [];
  edone.push({id: erun.id, mode: erun.mode, diff: erun.diff, wins: erun.wins, lost: erun.lost, started: erun.started, ended: erun.ended, lastTeam: erun.lastTeam, redLeft: erun.redLeft});
  saveRun(); saveDone();
}
/** Called when a battle in the run ends (or is forfeited). */
function endlessBattleOver(won: boolean) {
  if (!erun || !S) return;
  const b = S.battle;
  erun.turns.push(b.turn); erun.choices = [];
  if (won) { erun.wins++; erun.cleared = erun.n; erun.lost.push(b.sides[0].pokemon.filter((p: any) => p.fainted).length); saveRun(); }
  else { erun.lastTeam = team.map(t => t.species); erun.redLeft = b.sides[1].pokemon.filter((p: any) => !p.fainted).length; endRun(); }
}
function nextBattle() {
  if (!erun || erun.over || erun.cleared !== erun.n) return;
  erun.n++; erun.choices = []; delete erun.lead; saveRun();
  S = null; resetUI(); applyRun();
}

function endlessStats(mode: Mode, diff: Difficulty) {
  const runs = edone.filter(r => r.mode === mode && r.diff === diff);
  const wins = runs.reduce((s, r) => s + r.wins, 0);
  const lostAll = runs.flatMap(r => r.lost);
  return {runs: runs.length, best: runs.length ? Math.max(...runs.map(r => r.wins)) : 0,
    avg: runs.length ? wins / runs.length : null, wins, avgLost: lostAll.length ? lostAll.reduce((a, b) => a + b, 0) / lostAll.length : null,
    flawless: lostAll.filter(x => x === 0).length, recent: runs.slice(-8).reverse(),
    // most flawless wins in a row within one run
    flawlessStreak: Math.max(0, ...runs.map(r => { let best = 0, cur = 0; for (const l of r.lost) { cur = l === 0 ? cur + 1 : 0; best = Math.max(best, cur); } return best; }))};
}
function endlessStatsHTML(mode: Mode, diff: Difficulty) {
  const st = endlessStats(mode, diff);
  const tile = (label: string, value: string, sub = '') => `<div class="tile"><span class="lbl">${label}</span><b class="num">${value}</b>${sub ? `<span class="tsub">${sub}</span>` : ''}</div>`;
  const n1 = (x: number | null) => x === null ? '—' : x.toFixed(1);
  return `<section class="block"><p class="hint">A streak is the number of battles won in a row before a run ends.</p>
    ${st.runs ? `<section class="tiles">
      ${tile('Longest streak', String(st.best), `${st.runs} ${st.runs === 1 ? 'run' : 'runs'}`)}
      ${tile('Average streak', n1(st.avg), `${st.wins} ${st.wins === 1 ? 'win' : 'wins'} total`)}
      ${tile('Pokémon lost per win', n1(st.avgLost), `${st.flawless} flawless ${st.flawless === 1 ? 'win' : 'wins'}`)}
      ${tile('Longest flawless streak', String(st.flawlessStreak), 'flawless wins in a row')}
    </section>
    <div class="tablewrap"><table class="days"><thead><tr><th>Run ended</th><th>Streak</th><th>Lost per win</th></tr></thead><tbody>
      ${st.recent.map(r => `<tr><td>${esc(new Date(r.ended).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}))}</td><td class="num">${r.wins}</td><td class="num">${r.lost.length ? (r.lost.reduce((a, b) => a + b, 0) / r.lost.length).toFixed(1) : '—'}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="empty"><h2>No endless runs yet in ${modeInfo(mode).label} · ${DIFFS.find(d => d.id === diff)!.label}</h2><p>Finish a run on the Endless tab and your longest streak, average streak and Pokémon lost per win will show up here.</p></div>`}
  </section>`;
}
function endlessHTML() {
  const setup = !erun || erun.over;
  const mode = setup ? eprefs.mode : erun!.mode, diff = setup ? eprefs.diff : erun!.diff;
  if (setup) {
    const last = erun?.over ? erun : null;
    return `<section class="block endless-intro"><h2>Endless</h2>
      <p class="hint">A fresh random team for every battle. Beat Red and you get a new six; lose once and the run is over. Separate from the daily battle: it doesn't use today's team and doesn't count toward your daily stats.</p></section>
      ${last ? `<section class="result ${last.wins ? 'win' : 'loss'}"><p class="rk">Endless · ${esc(modeInfo(last.mode).label.toLowerCase())} · ${esc(DIFFS.find(d => d.id === last.diff)!.label.toLowerCase())}</p>
        <h3 class="rh">RUN OVER.</h3><p class="rs">Streak of ${last.wins} ${last.wins === 1 ? 'win' : 'wins'}${last.lastTeam ? `. Your last team (${esc(last.lastTeam.join(', '))}) took down ${6 - (last.redLeft ?? 6)} of Red's 6.` : '.'}</p></section>` : ''}
      <section class="controls">
        <div class="ctl"><span class="lbl">Mode</span>${seg('emode', MODES, baseMode(eprefs.mode))}</div>
        <div class="ctl"><span class="lbl">Format</span>${seg('efmt', FMTS, isDoublesMode(eprefs.mode) ? 'doubles' : 'singles')}</div>
        <div class="ctl"><span class="lbl">Red</span>${seg('ediff', DIFFS, eprefs.diff)}</div>
      </section>
      <section class="prebattle"><button class="go" id="e-start">${last ? 'Start a new run' : 'Start a run'}</button>
        <p class="note">Each battle's luck is new, so a run can't be replayed. Progress is saved if you leave mid-run.</p></section>`;
  }
  const r = erun!;
  const leads = leadList(); const dbl = isDoublesMode(r.mode);
  const gd = teamGenders(S ? S.lead : dbl ? leads : leads[0]);
  const head = `<div class="practice endless-bar"><div><span class="lbl">Endless run</span><b>Battle ${r.n}</b><span class="hint">${esc(modeInfo(r.mode).label)} · ${esc(DIFFS.find(d => d.id === r.diff)!.label)}</span></div>
    ${S ? '' : '<button class="ghost" id="e-quit">End run</button>'}</div>`;
  return `${head}
    ${S ? '<section id="battle" class="battle"></section>' : `<section class="prebattle">
      <div class="vs"><div class="vsmon">${redTeamFor(playDate(), prefs.mode).slice(0, leads.length).map(s => sprite(s.species, false, dbl ? 72 : 96)).join('')}<div><span class="lbl">Red leads with</span><b>${redTeamFor(playDate(), prefs.mode).slice(0, leads.length).map(s => esc(s.species)).join(' &amp; ')}</b></div></div>
      <div class="vsx" aria-hidden="true">vs</div>
      <div class="vsmon">${leads.map(i => sprite(team[i].species, false, dbl ? 72 : 96)).join('')}<div><span class="lbl">${dbl ? 'Your leads' : 'Your lead'}</span><b>${leads.map(i => esc(team[i].species)).join(' &amp; ')}</b></div></div></div>
      <button class="go" id="e-battle">Battle Red</button></section>`}
    <section class="block"><h2>Battle ${r.n} team</h2>
      <p class="hint">${S && !S.ended ? 'Your six for this battle.' : dbl ? 'Pick Lead 1 and Lead 2.' : 'Tap "Set as lead" to choose who goes out first.'}</p>
      <div class="team">${team.map((s, i) => monCard(s, i, leads, !!S && !S.ended, gd.mine[i])).join('')}</div></section>
    <details class="block" id="redteam"><summary><h2>Red's team</h2><span class="hint">${dbl ? 'Always the same six, with doubles moves. He always leads with Pikachu and Espeon.' : 'Always the same six. He always leads with Pikachu.'}</span></summary>
      <div class="team red">${redTeamFor(playDate(), prefs.mode).map((s, i) => monCard(s, -1, i < leads.length ? [-1] : [], true, gd.red[i])).join('')}</div></details>`;
}

function playHTML() {
  const inBattle = !!S;
  const leads = leadList(); const dbl = isDoublesMode(prefs.mode);
  const redTeam = redTeamFor(playDate(), prefs.mode); const redLv = redTeam[0].level;
  const gd = teamGenders(S ? S.lead : dbl ? leads : leads[0]);
  const names = (l: string[]) => l.map(esc).join(' &amp; ');
  return `
  ${inBattle ? (S?.watch ? watchBanner() : practice ? practiceBanner() : '') : `${controlsHTML()}
  <p class="blurb">${esc(modeInfo(prefs.mode).blurb)} ${esc(DIFFS.find(d => d.id === prefs.diff)!.blurb)}</p>
  ${practice ? practiceBanner() : `${todaySummary()}
  ${friendsStripHTML()}`}`}
  ${inBattle ? `<section id="battle" class="battle"></section>` : `
  <section class="prebattle">
    <div class="vs">
      <div class="vsmon">${redTeam.slice(0, leads.length).map(s => sprite(s.species, false, dbl ? 72 : 96)).join('')}<div><span class="lbl">Red leads with</span><b>${names(redTeam.slice(0, leads.length).map(s => s.species))}</b></div></div>
      <div class="vsx" aria-hidden="true">vs</div>
      <div class="vsmon">${leads.map(i => sprite(team[i].species, false, dbl ? 72 : 96)).join('')}<div><span class="lbl">${dbl ? 'Your leads' : 'Your lead'}</span><b>${names(leads.map(i => team[i].species))}</b></div></div>
    </div>
    <button class="go" id="start">Battle Red</button>
    <p class="note">${practice ? 'Same team and luck as that day. Nothing here is saved or counted.' : 'Every attempt today uses the same luck. Same choices, same result.'}</p>
    ${practice ? '' : syncHTML()}
    ${practice ? '' : pastPickerHTML()}
  </section>`}
  <section class="block">
    <h2>${practice ? `Team for ${esc(niceDate(practice))}` : "Today's team"}</h2>
    <p class="hint">${busy() ? 'Your six for this battle. To change your lead, tap RUN to restart this attempt.' : S?.ended ? (dbl ? 'Pick Lead 1 and Lead 2 for your next attempt.' : 'Tap "Set as lead" to pick who goes out first on your next attempt.') : dbl ? 'Pick who goes out first as Lead 1 and Lead 2.' : 'Tap "Set as lead" to choose who goes out first.'}</p>
    <div class="team">${team.map((s, i) => monCard(s, i, leads, busy(), gd.mine[i])).join('')}</div>
  </section>
  <details class="block" id="redteam"><summary><h2>Red's team</h2><span class="hint">${dbl ? 'Always the same six, with doubles moves. He always leads with Pikachu and Espeon.' : 'Always the same six. He always leads with Pikachu.'}${redLv !== 100 ? ` Today they're all level ${redLv}.` : ''}</span></summary>
    <div class="team red">${redTeam.map((s, i) => monCard(s, -1, i < leads.length ? [-1] : [], true, gd.red[i])).join('')}</div></details>`;
}

/**
 * Genders for the team cards. They're fixed per day from Oct 20; before that the simulator picked them when the
 * battle started (depending on who leads), so build that battle once to find out.
 */
let genderCache = {key: '', mine: [] as string[], red: [] as string[]};
function teamGenders(lead: number | number[]) {
  const key = `${playDate()}|${prefs.mode}|${JSON.stringify(lead)}|${team.map(t => t.species).join()}`;
  if (genderCache.key === key) return genderCache;
  let mine: string[] = [], red: string[] = [];
  try {
    const b = S && !S.watch ? S.battle : newBattle(orderedTeam(lead), battleSeed(playDate(), prefs.mode), isDoublesMode(prefs.mode), redTeamFor(playDate(), prefs.mode));
    mine = team.map(t => b.sides[0].pokemon.find((p: any) => p.species.name === t.species)?.gender || '');
    red = redTeamFor(playDate(), prefs.mode).map(t => b.sides[1].pokemon.find((p: any) => p.species.name === t.species)?.gender || '');
  } catch { /* leave blank */ }
  genderCache = {key, mine, red};
  return genderCache;
}
/** "Adamant (+Atk, −SpA)", or "Hardy (neutral)" for a nature that raises and lowers nothing. */
function natureText(s: PokemonSet) {
  const n = s.nature ? PS.Dex.natures.get(s.nature) : null;
  if (!n?.exists) return '—';
  const short: Record<string, string> = {atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe'};
  return n.plus ? `${n.name} (+${short[n.plus]}, \u2212${short[n.minus]})` : `${n.name} (neutral)`;
}
function monCard(s: PokemonSet, i: number, leads: number[], locked: boolean, gender?: string) {
  const sp = PS.Dex.species.get(s.species);
  const bst = Object.values(sp.baseStats as Record<string, number>).reduce((a, b) => a + b, 0);
  const statRow = (['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const).map(k =>
    `<div class="st"><span>${{hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe'}[k]}</span><i style="--w:${Math.min(100, sp.baseStats[k] / 1.8)}%"></i><b>${sp.baseStats[k]}</b></div>`).join('');
  const moves = s.moves.map(m => {
    const mv = PS.Dex.moves.get(m); const nm = moveName(m, s.ivs);
    return `<li class="mv t-${toID(nm.type)}-soft"><div class="mvh"><span class="mvn">${esc(nm.name)}</span><span class="mvm">${mv.category === 'Status' ? 'Status' : `${mv.basePower || '—'} BP`} · ${mv.accuracy === true ? '—' : mv.accuracy + '%'}</span></div><div class="mvd">${esc(DESC.m[mv.id] || '')}</div></li>`;
  }).join('');
  const isLead = leads.includes(i);
  const dblLeads = i >= 0 && leads.length === 2;
  const tag = dblLeads ? `Lead ${leads.indexOf(i) + 1}` : 'Lead';
  const btns = i < 0 || locked ? '' : dblLeads
    ? `<div class="leadbtns">${[0, 1].map(k => `<button class="setlead" data-lead${k + 1}="${i}" ${leads[k] === i ? 'disabled' : ''}>${leads[k] === i ? `Lead ${k + 1}` : `Set as Lead ${k + 1}`}</button>`).join('')}</div>`
    : `<button class="setlead" data-lead="${i}" ${isLead ? 'disabled' : ''}>${isLead ? 'Leading' : 'Set as lead'}</button>`;
  return `<article class="mon ${isLead ? 'is-lead' : ''}">
    <div class="monh">${sprite(s.species, false, 72)}<div class="monid"><h3>${esc(s.species)}${genderMark(gender)}${isLead ? `<span class="leadtag">${tag}</span>` : ''}</h3><div class="types">${sp.types.map(typeBadge).join('')}</div></div>
      ${btns}</div>
    <dl class="kv"><div><dt>Item</dt><dd title="${esc(DESC.i[toID(s.item)] || '')}">${esc(s.item)}</dd></div><div><dt>Ability</dt><dd title="${esc(DESC.a[toID(s.ability)] || '')}">${esc(s.ability)}</dd></div><div><dt>BST</dt><dd class="num">${bst}</dd></div>${i >= 0 ? `<div class="wide"><dt>Nature</dt><dd>${esc(natureText(s))}</dd></div>` : ''}</dl>
    <details class="more"><summary>Moves and stats</summary>
      <div class="abil"><b>${esc(s.ability)}:</b> ${esc(DESC.a[toID(s.ability)] || '')}</div>
      <div class="abil"><b>${esc(s.item)}:</b> ${esc(DESC.i[toID(s.item)] || '')}</div>
      <ul class="mvs">${moves}</ul><div class="stats">${statRow}</div></details>
    <ul class="chips">${s.moves.map(m => { const nm = moveName(m, s.ivs); return `<li class="chip t-${toID(nm.type)}">${esc(nm.name)}</li>`; }).join('')}</ul>
  </article>`;
}

// ---- Animated HP bars: each position (p1a, p1b, p2a, p2b) remembers what it last showed and slides to the new value ----
const shownHP: Record<string, {ident: string; hp: number}> = {};
const tweens: Record<string, number> = {};
function startHP(key: string, ident: string, m: {hp: number}) {
  const sh = shownHP[key];
  return sh && sh.ident === ident ? sh.hp : m.hp;
}
function hpText(key: string, hp: number, max: number) { return key.startsWith('p1') ? `${Math.round(hp)}/ ${max}` : `${Math.ceil(hp / max * 100)}%`; }
function tweenHP(key: string, ident: string, target: number, max: number) {
  const from = shownHP[key]?.ident === ident ? shownHP[key].hp : target;
  cancelAnimationFrame(tweens[key]);
  const bar = document.getElementById('bar-' + key), num = document.getElementById('hpn-' + key);
  const paint = (hp: number) => {
    shownHP[key] = {ident, hp};
    if (bar) { const f = max ? hp / max : 0; bar.style.width = (f * 100).toFixed(2) + '%'; bar.className = hpClass(f); }
    if (num) num.textContent = hpText(key, hp, max);
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (from === target || reduce || !S?.playing) { paint(target); return; }
  const dur = Math.min(750, 220 + Math.abs(target - from) / max * 750) * (prefs.fast ? 0.45 : 1);
  const t0 = performance.now();
  const frame = (now: number) => {
    const k = Math.min(1, (now - t0) / dur);
    paint(from + (target - from) * (1 - Math.pow(1 - k, 2)));
    if (k < 1) tweens[key] = requestAnimationFrame(frame);
  };
  tweens[key] = requestAnimationFrame(frame);
}
function hpClass(f: number) { return f > 0.5 ? 'hp-g' : f > 0.2 ? 'hp-y' : 'hp-r'; }

// UI state for the battle screen (which move is highlighted, party screen, etc.)
// In doubles, `slot` is the Pokémon you're choosing for and `pending` holds the choices already made this turn.
const UI = {sel: 0, chosen: -1, party: false, psel: -1, summary: false, run: false, slot: 0, pending: [] as string[], fhide: false};
function resetUI() { UI.fhide = false; UI.party = false; UI.psel = -1; UI.summary = false; UI.run = false; UI.chosen = -1; UI.slot = 0; UI.pending = []; }
const STAT_SHORT: Record<string, string> = {atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', accuracy: 'Acc', evasion: 'Eva'};
const WEATHER_NAME: Record<string, string> = {RainDance: 'Rain', SunnyDay: 'Harsh sunlight', Sandstorm: 'Sandstorm', Snowscape: 'Snow', DesolateLand: 'Extreme sun', PrimordialSea: 'Heavy rain', DeltaStream: 'Strong winds'};

function moveTypeFor(b: any, id: string, slot = 0) {
  const mv = PS.Dex.moves.get(id); const act = b.sides[0].active[slot];
  const type = mv.id === 'hiddenpower' && act ? act.hpType || mv.type : mv.type;
  return {mv, type, name: mv.id === 'hiddenpower' ? `Hidden Power ${type}` : mv.name};
}
function effectiveness(b: any, id: string, type: string, foe = b.sides[1].active[0]) {
  const mv = PS.Dex.moves.get(id);
  if (mv.category === 'Status') return 'Status move';
  if (!foe || foe.fainted) return '';
  if (!foe.runImmunity(type)) return 'No effect';
  const e = b.dex.getEffectiveness(type, foe);
  return e > 0 ? 'Super effective' : e < 0 ? 'Not very effective' : 'Normal damage';
}
const effBadge = (eff: string, extra = '') => eff === 'Super effective' ? `<span class="eb good">${extra}Super effective</span>` : eff === 'Not very effective' ? `<span class="eb weak">${extra}Not very effective</span>` : eff === 'No effect' ? `<span class="eb none">${extra}No effect</span>` : `<span class="ent">${extra}${esc(eff)}</span>`;

// ---- Choosing for each of your active Pokémon ----
const isFnt = (p: any) => String(p?.condition || '').includes('fnt');
/** Which of your positions need a choice from you for this request. */
function needSlots(req: any): number[] {
  if (req.forceSwitch) {
    const n = req.forceSwitch.length;
    const bench = req.side.pokemon.filter((p: any, i: number) => i >= n && !isFnt(p)).length;
    return req.forceSwitch.map((f: boolean, i: number) => f ? i : -1).filter((i: number) => i >= 0).slice(0, bench);
  }
  return (req.active || []).map((_: any, i: number) => i).filter((i: number) => !isFnt(req.side.pokemon[i]) && !req.side.pokemon[i]?.commanding);
}
// ---- Doubles target picker: positions are p2a/p2b (Red) and p1a/p1b (you) ----
type Pos = 'p2a' | 'p2b' | 'p1a' | 'p1b';
const POS: Pos[] = ['p2a', 'p2b', 'p1a', 'p1b'];
const LOC: Record<Pos, number> = {p2a: 1, p2b: 2, p1a: -1, p1b: -2}; // Showdown target numbers
const monAtPos = (b: any, p: Pos) => b.sides[p[1] === '1' ? 0 : 1].active[p[2] === 'a' ? 0 : 1];
/**
 * Who a move can be aimed at. "single" moves pick one of `valid`; "group" moves hit everyone in `valid`
 * at once (spread moves, field moves, moves on yourself), so picking any of them confirms.
 */
function targetSpec(b: any, slot: number, target: string): {kind: 'single' | 'group'; valid: Pos[]} {
  const self: Pos = slot === 0 ? 'p1a' : 'p1b', ally: Pos = slot === 0 ? 'p1b' : 'p1a';
  const alive = (ps: Pos[]) => ps.filter(p => { const m = monAtPos(b, p); return m && !m.fainted; });
  const foes: Pos[] = ['p2a', 'p2b'];
  const single = (ps: Pos[]) => { const a = alive(ps); return {kind: 'single' as const, valid: a.length ? a : ps}; };
  switch (target) {
  case 'normal': case 'any': return single([...foes, ally]);
  case 'adjacentFoe': return single(foes);
  case 'adjacentAlly': return single([ally]);
  case 'adjacentAllyOrSelf': return single([ally, self]);
  case 'allAdjacentFoes': case 'foeSide': case 'randomNormal': return {kind: 'group', valid: alive(foes)};
  case 'allAdjacent': return {kind: 'group', valid: alive([...foes, ally])};
  case 'allySide': case 'allyTeam': case 'allies': return {kind: 'group', valid: alive([self, ally])};
  case 'all': return {kind: 'group', valid: alive(POS)};
  default: return {kind: 'group', valid: [self]}; // self, scripted (Counter and friends)
  }
}
function targetPopupHTML(b: any, slot: number, m: any) {
  const spec = targetSpec(b, slot, m.target);
  const {type, name} = moveTypeFor(b, m.id, slot);
  const status = PS.Dex.moves.get(m.id).category === 'Status';
  const cell = (p: Pos) => {
    const mon = monAtPos(b, p); const ok = spec.valid.includes(p);
    if (!mon || mon.fainted) return ok // an ally-only move with no ally still has to be aimed somewhere (it will fail)
      ? `<button class="tc empty ok ${p[1] === '2' ? 'foe' : 'own'}" data-target="${spec.kind === 'single' ? LOC[p] : 'all'}"><span class="tn">—</span></button>`
      : `<div class="tc empty ${p[1] === '2' ? 'foe' : 'own'}"><span class="tn">—</span></div>`;
    const f = mon.hp / mon.maxhp;
    const eff = ok && !status ? effectiveness(b, m.id, type, mon) : '';
    const effLbl = eff === 'Normal damage' ? 'Effective' : eff;
    const effCls = eff === 'Super effective' ? 'good' : eff === 'Not very effective' ? 'weak' : eff === 'No effect' ? 'none' : 'norm';
    const hp = p[1] === '2' ? `${Math.ceil(f * 100)}%` : `${mon.hp}/${mon.maxhp}`;
    const isUser = p === (slot === 0 ? 'p1a' : 'p1b');
    return `<button class="tc ${p[1] === '2' ? 'foe' : 'own'} ${ok ? (spec.kind === 'group' ? 'grp' : 'ok') : 'no'}" ${ok ? `data-target="${spec.kind === 'single' ? LOC[p] : 'all'}"` : 'disabled'} aria-label="${esc(mon.species.name)}">
      ${effLbl ? `<span class="te ${effCls}">${esc(effLbl)}</span>` : isUser ? '<span class="te user">Using the move</span>' : '<span class="te blank"></span>'}
      <span class="tpic">${sprite(mon.species.name, false, 64)}</span>
      <span class="tn">${esc(mon.species.name)}${genderMark(mon.gender)}</span>
      <span class="hpr"><span class="bar"><i class="${hpClass(f)}" style="width:${(f * 100).toFixed(1)}%"></i></span></span><span class="thp">${hp}</span>
    </button>`;
  };
  const hint = spec.kind === 'group' ? (spec.valid.length > 1 ? 'Hits every highlighted Pokémon. Tap one to confirm.' : 'Tap to confirm.') : 'Choose a target.';
  return `<div class="dim" aria-hidden="true"></div><div class="party tgtpop" id="tgtpop" role="dialog" aria-label="Choose a target">
    <div class="tside red"><span class="reds">RED</span></div>
    <div class="tgrid">${cell('p2a')}${cell('p2b')}</div>
    <div class="tmove"><i class="tsq t-${toID(type)}"></i>${esc(name.toUpperCase())}</div>
    <div class="tgrid">${cell('p1a')}${cell('p1b')}</div>
    <div class="pfoot"><span>${hint}</span><button class="pbtn sm" id="tgt-cancel">CANCEL</button></div>
  </div>`;
}
/** Record the choice for the current position; when every position has one, send the turn. */
function slotChoice(c: string) {
  if (!S) return;
  const b = S.battle; const req = b.sides[0].activeRequest; if (!req) return;
  UI.pending[UI.slot] = c;
  const need = needSlots(req);
  const next = need.find(i => !UI.pending[i]);
  if (next !== undefined) { UI.slot = next; UI.chosen = -1; UI.sel = 0; UI.run = false; renderBattle(); return; }
  const n = req.forceSwitch ? req.forceSwitch.length : req.active.length;
  const parts = Array.from({length: n}, (_, i) => UI.pending[i] || 'pass');
  const sel = UI.sel;
  resetUI(); UI.sel = S.doubles ? 0 : sel;
  choose(parts.join(', '));
}
function slotBack() {
  const req = S?.battle.sides[0].activeRequest; if (!req) return;
  const need = needSlots(req); const at = need.indexOf(UI.slot);
  if (at <= 0) return;
  UI.slot = need[at - 1]; delete UI.pending[UI.slot];
  UI.fhide = false; UI.chosen = -1; UI.sel = 0; UI.party = false; UI.psel = -1; UI.summary = false; UI.run = false;
  renderBattle();
}

function renderBattle() {
  keepAwake();
  const el = document.getElementById('battle');
  if (!el || !S) return;
  const {view} = S; const b = S.battle; const dbl = S.doubles;
  const dots = (sid: 'p1' | 'p2') => view[sid].order.map(id => { const x = view[sid].mons[id]; return `<i class="${x.fainted ? 'out' : view[sid].active.includes(id) ? 'cur' : ''}"></i>`; }).join('');
  const req = b.sides[0].activeRequest; const s1 = b.sides[0];
  const waiting = !!S.watch || S.playing || S.ended || !s1.requestState || s1.isChoiceDone();
  if (!waiting && req) {
    const need = needSlots(req);
    if (!need.includes(UI.slot) || UI.pending[UI.slot]) UI.slot = need.find(i => !UI.pending[i]) ?? need[0] ?? 0;
  }
  const slot = UI.slot;
  const choosing = !waiting && !!req;
  const card = (sid: 'p1' | 'p2', pos: number) => {
    const sv = view[sid]; const ident = sv.active[pos] || ''; const m = sv.mons[ident];
    if (!m || (dbl && m.fainted)) return '';
    const key = sid + 'abc'[pos];
    const st = startHP(key, ident, m) / m.maxhp;
    const boosts = Object.entries(m.boosts).filter(([, n]) => n).map(([k, n]) => `<span class="bst ${n > 0 ? 'up' : 'down'}">${n > 0 ? '+' : ''}${n} ${STAT_SHORT[k] || k}</span>`).join('');
    const turn = dbl && choosing && sid === 'p1' && pos === slot;
    return `<div class="card ${sid} ${dbl ? 'sm' : ''} ${turn ? 'turn' : ''}">
      <div class="cn">${sid === 'p2' && !dbl ? '<span class="reds">RED\'s</span>&nbsp;' : ''}<b>${esc(m.species)}</b>${genderMark(m.gender)}${statusBadge(m.status)}<span class="lv">Lv${m.level}</span></div>
      <div class="hpr"><span class="hpl">HP</span><span class="bar" role="meter" aria-label="${esc(m.species)} HP" aria-valuemin="0" aria-valuemax="${m.maxhp}" aria-valuenow="${m.hp}"><i id="bar-${key}" class="${hpClass(st)}" style="width:${(st * 100).toFixed(1)}%"></i></span></div>
      ${dbl ? (sid === 'p1' || boosts ? `<div class="cfoot">${boosts ? `<span class="bsts">${boosts}</span>` : '<span></span>'}${sid === 'p1' ? `<span class="hpnum" id="hpn-${key}">${hpText(key, startHP(key, ident, m), m.maxhp)}</span>` : ''}</div>` : '')
        : `<div class="cfoot"><span class="sq">${dots(sid)}</span>${sid === 'p1' ? `<span class="hpnum" id="hpn-${key}">${hpText(key, startHP(key, ident, m), m.maxhp)}</span>` : `<span id="hpn-${key}" hidden></span>`}</div>
      ${boosts ? `<div class="bsts">${boosts}</div>` : ''}`}
    </div>`;
  };
  const force = choosing && !!req?.forceSwitch;
  if (!force) UI.fhide = false;
  if (force && !UI.fhide) UI.party = true;

  if (S.ended && !S.playing) { el.innerHTML = stripHTML() + replayBarHTML() + resultHTML() + logHTML(); scrollLog(); return; }

  const pendingSwitch = new Set(UI.pending.filter(c => c?.startsWith('switch')).map(c => +c.split(' ')[1] - 1));
  const need = choosing ? needSlots(req) : [];
  const canBack = dbl && need.indexOf(slot) > 0;
  let deck = '', tgtPop = '';
  if (force && UI.fhide) {
    // Replacement menu hidden so the team info below can be read; one button brings it back
    deck = `<div class="menu"><div class="ch"><span>Choose a POKéMON to send out.</span></div><div class="lbtns" style="grid-template-columns: 1fr"><button class="pbtn" id="open-party">POKéMON</button></div></div>`;
  } else if (!choosing || force) {
    const last = [...S.messages].reverse().find(m => !m.startsWith('—')) || '';
    deck = `<button class="msgbox" id="msgbox" aria-live="polite"><span>${esc(last).replace(/\*\*(.+?)\*\*/g, '$1')}</span><i class="tri" aria-hidden="true"></i></button>`;
  } else {
    const moves = req.active[slot].moves;
    if (UI.sel >= moves.length || moves[UI.sel]?.disabled || moves[UI.sel]?.pp <= 0) UI.sel = Math.max(0, moves.findIndex((m: any) => !m.disabled && m.pp > 0));
    if (UI.chosen >= 0 && (moves[UI.chosen]?.disabled || moves[UI.chosen]?.pp <= 0)) UI.chosen = -1;
    const act = b.sides[0].active[slot];
    const abil = act ? PS.Dex.abilities.get(act.ability).name : '';
    const m = moves[UI.chosen >= 0 ? UI.chosen : UI.sel];
    let info = '';
    if (m) {
      const {type} = moveTypeFor(b, m.id, slot);
      const foes = b.sides[1].active.filter((p: any) => p && !p.fainted);
      const effHTML = !dbl ? effBadge(effectiveness(b, m.id, type))
        : PS.Dex.moves.get(m.id).category === 'Status' ? effBadge('Status move')
        : `<span class="effs">${foes.map((f: any) => effBadge(effectiveness(b, m.id, type, f), `${esc(f.species.name.toUpperCase())}: `)).join('')}</span>`;
      info = `<div class="info ${dbl ? 'dbl' : ''}"><span>PP&nbsp;${m.pp}/${m.maxpp}</span><span>TYPE/&nbsp;${esc(type.toUpperCase())}</span>${effHTML}</div>`;
    }
    if (dbl && UI.chosen >= 0 && moves[UI.chosen]) tgtPop = targetPopupHTML(b, slot, moves[UI.chosen]);
    deck = `<div class="menu">
      <div class="ch"><span>What will ${esc((act?.name || act?.species.name || '').replace(/\u200b/g, '').toUpperCase())} do?${dbl && need.length > 1 ? ` <span class="slotn">${need.indexOf(slot) + 1}/${need.length}</span>` : ''}</span><span>${esc(abil.toUpperCase())}</span></div>
      <div class="mgrid">${moves.map((mm: any, i: number) => {
        const {type, name} = moveTypeFor(b, mm.id, slot); const dis = mm.disabled || mm.pp <= 0;
        return `<button class="mv2 ${i === UI.sel ? 'sel' : ''} ${i === UI.chosen ? 'chosen' : ''}" data-move="${i + 1}" ${dis ? 'disabled' : ''}><span class="arrow ${i === UI.sel || i === UI.chosen ? 'on' : ''}" aria-hidden="true"></span><i class="tsq t-${toID(type)}"></i><span class="mn">${esc(name.toUpperCase())}</span></button>`;
      }).join('')}</div></div>
      <div class="lower">${info}
        ${UI.run ? `<p class="runq">${S.endless ? 'Run? This forfeits the battle and ends your endless run.' : 'Run? This restarts the battle and counts as an attempt.'}</p><div class="lbtns"><button class="pbtn" id="run-yes">RUN</button><button class="pbtn" id="run-no">CANCEL</button></div>`
          : UI.chosen >= 0 && !dbl ? `<div class="lbtns"><button class="pbtn" id="use">USE</button><button class="pbtn" id="unchoose">CANCEL</button></div>`
          : `<div class="lbtns ${canBack ? 'three' : ''}"><button class="pbtn" id="open-party">POKéMON</button>${canBack ? '<button class="pbtn" id="slot-back">BACK</button>' : ''}<button class="pbtn" id="run">RUN</button></div>`}
      </div>`;
  }

  let party = '';
  if (UI.party && req && choosing) {
    const nAct = req.forceSwitch ? req.forceSwitch.length : req.active.length;
    const trapped = !force && req.active[slot].trapped;
    const list = req.side.pokemon.map((p: any, i: number) => {
      const cond = String(p.condition); const fnt = cond.includes('fnt');
      const [hp, maxRaw] = cond.split(' ')[0].split('/').map(Number); const st = fnt ? '' : cond.split(' ')[1] || '';
      const max = maxRaw || b.sides[0].pokemon[i]?.maxhp || 0; // a fainted Pokémon's condition is just "0 fnt"
      const name = p.ident.split(': ')[1].replace(/​/g, '');
      const f = fnt ? 0 : hp / max;
      const inBattle = i < nAct && !fnt;
      let summary = '';
      if (UI.psel === i && UI.summary) {
        const poke = b.sides[0].pokemon[i];
        const ab = PS.Dex.abilities.get(poke.baseAbility);
        summary = `<div class="summ">${poke.moveSlots.map((ms: any) => { const t = moveTypeFor(b, ms.id, i < nAct ? i : 0); return `<div class="sr"><span><i class="tsq t-${toID(t.type)}"></i>${esc(t.name.toUpperCase())}</span><span>PP ${ms.pp}/${ms.maxpp}</span></div>`; }).join('')}
          <div class="sr"><span>ITEM</span><span>${esc(poke.item ? PS.Dex.items.get(poke.item).name : 'None')}</span></div>
          <div class="sr"><span>ABILITY</span><span>${esc(ab.name)}</span></div>
          <p class="sd">${esc(DESC.a[ab.id] || '')}</p></div>`;
      }
      return `<button class="pm ${i === slot || (inBattle && dbl) ? 'act' : ''} ${UI.psel === i ? 'psel' : ''} ${fnt ? 'fnt' : ''}" data-pick="${i}">
          <span class="pic">${sprite(p.details.split(',')[0], false, 56)}</span>
          <span class="pn"><b>${esc(name)}${genderMark(b.sides[0].pokemon[i]?.gender)}</b><small>Lv${b.sides[0].pokemon[i]?.level ?? 100}${inBattle ? ', in battle' : ''}${pendingSwitch.has(i) ? ', switching in' : ''}${fnt ? ', Fainted' : ''}</small></span>
          <span class="php"><span class="hpr"><span class="hpl">HP</span><span class="bar"><i class="${hpClass(f)}" style="width:${(f * 100).toFixed(1)}%"></i></span></span><span class="pnum">${statusBadge(st)}${fnt ? 0 : hp}/ ${max}</span></span>
        </button>${summary}`;
    }).join('');
    const selP = UI.psel >= 0 ? req.side.pokemon[UI.psel] : null;
    // Revival Blessing: the same menu, but you pick a fainted Pokémon to bring back
    const reviving = force && !!req.side.pokemon[slot]?.reviving;
    const canShift = reviving ? !!selP && isFnt(selP) && !pendingSwitch.has(UI.psel)
      : selP && UI.psel >= nAct && !isFnt(selP) && !trapped && !pendingSwitch.has(UI.psel);
    const who = b.sides[0].active[slot]?.species.name || '';
    const prompt = reviving ? 'Choose a fainted POKéMON to revive.' : force ? (dbl ? `Choose a POKéMON to replace ${esc(who.toUpperCase())}.` : 'Choose a POKéMON.') : trapped ? 'You can\'t switch out right now.' : dbl ? `Switch out ${esc(who.toUpperCase())}? It uses its turn.` : 'Switch? It uses your turn.';
    const foot = UI.psel >= 0
      ? `<div class="pfoot three"><button class="pbtn" id="p-shift" ${canShift ? '' : 'disabled'}>${reviving ? 'REVIVE' : 'SWITCH'}</button><button class="pbtn" id="p-summary">SUMMARY</button><button class="pbtn" id="p-cancel">CANCEL</button></div>`
      : `<div class="pfoot"><span>${prompt}</span>${force ? `${canBack ? '<button class="pbtn sm" id="slot-back">BACK</button>' : ''}<button class="pbtn sm" id="p-hide">HIDE</button>` : '<button class="pbtn sm" id="p-close">CANCEL</button>'}</div>`;
    party = `<div class="dim" aria-hidden="true"></div><div class="party" id="party" role="dialog" aria-label="Your party"><div class="plist" id="plist">${list}</div>${foot}</div>`;
  }

  const weather = view.weather ? `<span class="wx">${esc(WEATHER_NAME[view.weather] || view.weather)}</span>` : '';
  const monAt = (sid: 'p1' | 'p2', pos: number) => { const m = view[sid].mons[view[sid].active[pos] || '']; return m && !m.fainted ? m : null; };
  let stage: string;
  if (!dbl) {
    const a1 = monAt('p1', 0), a2 = monAt('p2', 0);
    stage = `<div class="foe-mon"><span class="plat"></span>${a2 ? (a2.sub ? subSprite(false, 'big') : sprite(a2.form || a2.species, false, 96, 'big')) : ''}</div>
        <div class="me-mon"><span class="plat me"></span>${a1 ? (a1.sub ? subSprite(true, 'big me') : sprite(a1.form || a1.species, true, 96, 'big me')) : ''}</div>
        <div class="foe-card">${card('p2', 0)}</div>
        <div class="me-card">${card('p1', 0)}</div>`;
  } else {
    const spot = (sid: 'p1' | 'p2', pos: number) => { const m = monAt(sid, pos); return `<div class="spot">${m ? (m.sub ? subSprite(sid === 'p1', sid === 'p1' ? 'dbm' : 'dbf') : sprite(m.form || m.species, sid === 'p1', 96, sid === 'p1' ? 'dbm' : 'dbf')) : ''}</div>`; };
    stage = `<div class="foe-mons"><span class="plat"></span>${spot('p2', 0)}${spot('p2', 1)}</div>
        <div class="me-mons"><span class="plat me"></span>${spot('p1', 0)}${spot('p1', 1)}</div>
        <div class="foe-card dbl"><div class="sidelbl"><span class="reds">RED</span><span class="sq">${dots('p2')}</span></div>${card('p2', 0)}${card('p2', 1)}</div>
        <div class="me-card dbl"><div class="sidelbl"><span>YOU</span><span class="sq">${dots('p1')}</span></div>${card('p1', 0)}${card('p1', 1)}</div>`;
  }
  el.innerHTML = `${stripHTML()}
    <div class="console">
      <div class="scene ${dbl ? 'dbl' : ''}">
        <div class="sky"></div><div class="mtn"></div><div class="snow"></div>${weather}${S.watch?.paused ? '<div class="pausedtag" aria-live="polite"><i></i><i></i>PAUSED</div>' : ''}
        ${stage}
      </div>
      <div class="deck">${deck}</div>
      ${party}${tgtPop}
    </div>
    ${replayBarHTML()}
    ${logHTML()}`;
  scrollLog();
  fitParty();
  for (const sid of ['p1', 'p2'] as const) view[sid].active.forEach((ident, pos) => { const m = view[sid].mons[ident]; if (m) tweenHP(sid + 'abc'[pos], ident, m.hp, m.maxhp); });
}

/** Keep the party screen the same size while a summary is open; the list scrolls inside it instead. */
let partyH = 0, plistScroll = 0;
function fitParty() {
  const party = document.getElementById('party'), plist = document.getElementById('plist');
  if (!party || !plist) { partyH = 0; plistScroll = 0; return; }
  if (!UI.summary) { party.style.height = ''; partyH = party.offsetHeight; plistScroll = 0; return; }
  if (partyH) party.style.height = partyH + 'px';
  plist.scrollTop = plistScroll;
  const sel = plist.querySelector('.pm.psel') as HTMLElement | null, summ = plist.querySelector('.summ') as HTMLElement | null;
  if (sel && summ) {
    const top = sel.offsetTop - plist.offsetTop, bottom = summ.offsetTop - plist.offsetTop + summ.offsetHeight;
    if (bottom > plist.scrollTop + plist.clientHeight) plist.scrollTop = Math.min(top, bottom - plist.clientHeight);
    else if (top < plist.scrollTop) plist.scrollTop = top;
  }
  plist.onscroll = () => { plistScroll = plist.scrollTop; };
}

function stripHTML() {
  const mode = modeInfo(prefs.mode).label, diff = DIFFS.find(d => d.id === prefs.diff)!.label;
  const n = attemptsFor(loadAttempts(), today, prefs.mode, prefs.diff).length + (S!.ended ? 0 : 1);
  if (S!.endless) return `<div class="bstrip"><span class="tag">Endless battle ${erun?.n ?? ''}, ${mode.toLowerCase()} · ${diff.toLowerCase()} · streak ${erun?.wins ?? 0}</span><span class="turnlbl">Turn ${Math.max(1, S!.ended ? S!.battle.turn : S!.view.turn || 1)}</span></div>`;
  return `<div class="bstrip"><span class="tag">Daily Red No. ${dayNumber(playDate())}, ${mode.toLowerCase()} · ${diff.toLowerCase()} · ${S!.watch ? 'replay' : practice ? 'practice' : `attempt ${n}`}</span><span class="turnlbl">Turn ${Math.max(1, S!.ended ? S!.battle.turn : S!.view.turn || 1)}</span></div>`;
}
function logHTML() {
  const {view} = S!;
  const alive = (sd: 'p1' | 'p2') => Object.values(view[sd].mons).filter(x => !x.fainted).length;
  const lines = S!.messages.slice(-120).map(m => m.startsWith('—')
    ? `<p class="tl"><span>${esc(m.replace(/—/g, '').trim())}</span></p>`
    : `<p class="${/fainted!|won the battle|no more Pokémon/i.test(m) ? 'ko' : ''}">${esc(m).replace(/\*\*(.+?)\*\*/g, '$1')}</p>`).join('');
  return `<div class="logcard">
      <div class="lh"><h2>Battle log</h2><span>You ${alive('p1')}, Red ${alive('p2')}</span></div>
      <div class="log" id="log">${lines}</div>
      <div class="lf"><span>Text speed</span><div class="speed" role="radiogroup" aria-label="Text speed"><button role="radio" aria-checked="${!prefs.fast}" data-speed="normal">Normal</button><button role="radio" aria-checked="${prefs.fast}" data-speed="fast">Fast</button></div></div>
    </div>`;
}
function scrollLog() { const lg = document.getElementById('log'); if (lg) lg.scrollTop = lg.scrollHeight; }

function resultHTML() {
  const b = S!.battle; const a: Attempt | undefined = (S as any).attempt;
  const won = b.winner === 'You';
  const v = S!.view;
  const mine = v.p1.order.map(id => v.p1.mons[id]), red = v.p2.order.map(id => v.p2.mons[id]);
  const lost = mine.filter(m => m.fainted).length, downed = red.filter(m => m.fainted).length;
  const st = computeStats(loadAttempts(), prefs.mode, prefs.diff, today);
  const todayList = attemptsFor(loadAttempts(), today, prefs.mode, prefs.diff);
  const fl = todayList.find(isFlawless);
  // In a replay the winner is named: their display name (or yours when it's your own replay)
  const w = S!.watch; const ownReplay = !w || w.id === (MY_ID || 'me');
  const who = ownReplay ? 'You' : friendName(w!.id); // your own replay says "You", a friend's uses their name
  const whoUp = who.toUpperCase();
  const head = won ? (w ? `<span class="you">${esc(whoUp)}</span> WON.` : lost ? '<span class="you">YOU</span> WON.' : '<span class="you">FLAWLESS.</span>') : '<span class="red">RED</span> WON.';
  const their = who === 'You' ? 'your' : 'their';
  const sub = won ? (lost ? `${who} beat Red in ${b.turn} turns and lost ${lost} of ${their} 6.` : `${who} beat Red in ${b.turn} turns without losing a Pokémon.`)
    : `${who} took down ${downed} of Red's 6 in ${b.turn} turns.`;
  const blocks = (list: typeof mine, cls: string, aliveCls = '') => `<div class="blocks">${list.map(m => `<i class="${m.fainted ? cls : aliveCls}" title="${esc(m.species)}${m.fainted ? ', fainted' : ''}"></i>`).join('')}</div>`;
  return `<section class="result ${won ? (lost ? 'win' : 'flaw') : 'loss'}">
    <p class="rk">${S!.endless ? `Endless · battle ${erun?.n ?? ''} · ` : `${w ? 'Replay · ' : practice ? 'Practice · ' : ''}Daily Red No. ${dayNumber(playDate())}, `} ${esc(modeInfo(prefs.mode).label.toLowerCase())} · ${esc(DIFFS.find(d => d.id === prefs.diff)!.label.toLowerCase())}</p>
    <h3 class="rh">${head}</h3>
    <p class="rs">${esc(sub)}</p>
    <div class="rteam"><span>Your team</span>${blocks(mine, 'mine', 'alive')}</div>
    <div class="rteam"><span>Red</span>${blocks(red, 'reds')}</div>
    ${S!.endless ? (won ? `<p class="rs hint">Streak: ${erun?.wins ?? 0} ${erun?.wins === 1 ? 'win' : 'wins'}. A new team is waiting.</p>
    <div class="rbtns prbtns"><button class="pbtn red" id="e-next">NEXT BATTLE</button><button class="pbtn" id="e-giveup">END RUN</button></div>`
      : `<p class="rs hint">Run over with a streak of ${erun?.wins ?? 0} ${erun?.wins === 1 ? 'win' : 'wins'}.</p>
    <div class="rbtns prbtns"><button class="pbtn red" id="e-start">NEW RUN</button><button class="pbtn" id="e-home">RUN SUMMARY</button></div>`)
    : S!.watch ? `<p class="rs hint">${esc(S!.watch.who)} best attempt on ${esc(niceDate(playDate()))}.</p>
    <div class="rbtns prbtns"><button class="pbtn red" id="watch-again">WATCH AGAIN</button><button class="pbtn" id="watch-exit">BACK TO FRIENDS</button></div>`
    : practice ? `<p class="rs hint">Practice battle on ${esc(niceDate(practice))}. Not counted anywhere.</p>
    <div class="rbtns prbtns"><button class="pbtn red" id="again">TRY AGAIN</button><button class="pbtn" id="back-today">BACK TO TODAY</button></div>` : `<div class="rstats">
      <div><b>${a?.n ?? todayList.length}</b><span>Attempt</span></div>
      <div><b>${fl ? fl.n : '—'}</b><span>Flawless on</span></div>
      <div><b>${st.winRate === null ? '—' : Math.round(st.winRate * 100)}</b><span>Win %</span></div>
      <div><b>${st.dayStreak}</b><span>Day streak</span></div>
    </div>
    <div class="share"><h4>Share your result</h4><pre class="grid" id="grid">${esc(shareText(a))}</pre>
      <div class="rbtns"><button class="pbtn red" id="again">TRY AGAIN</button><button class="pbtn" id="copy">COPY RESULT</button></div></div>`}
  </section>`;
}

function shareText(a?: Attempt) {
  const b = S!.battle;
  const row = (ps: any[]) => ps.map((p: any) => p.fainted ? '🟥' : '🟩').join('');
  const myOrder = S!.view.p1.order.map(id => b.sides[0].pokemon.find((p: any) => `p1: ${p.name}` === id));
  const redOrder = S!.view.p2.order.map(id => b.sides[1].pokemon.find((p: any) => `p2: ${p.name}` === id));
  const mode = modeInfo(prefs.mode).label, diff = DIFFS.find(d => d.id === prefs.diff)!.label;
  return `Daily Red #${dayNumber(today)} · ${mode} · ${diff}\n${b.winner === 'You' ? 'Win' : 'Loss'} on attempt ${a?.n ?? '?'} in ${b.turn} turns\nYou ${row(myOrder)}\nRed ${row(redOrder)}`;
}

// ---------------- Stats ----------------
function statsHTML() {
  const all = loadAttempts();
  const st = computeStats(all, view.mode, view.diff, today);
  const pct = (x: number | null) => x === null ? '—' : `${Math.round(x * 100)}%`;
  const num = (x: number | null, d = 1) => x === null ? '—' : x.toFixed(d);
  const tile = (label: string, value: string, sub = '') => `<div class="tile"><span class="lbl">${label}</span><b class="num">${value}</b>${sub ? `<span class="tsub">${sub}</span>` : ''}</div>`;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const named = (x: {names: string[]; n: number} | null, unit: string, suffix = '') => {
    if (!x) return '—';
    const who = x.names.length > 2 ? `${x.names.length}-way tie` : x.names.join(' & ');
    return `${esc(who)}<span class="tsub">${plural(x.n, unit)}${suffix}${x.names.length > 1 ? ' each' : ''}</span>`;
  };
  return `
  ${controlsHTML()}
  <h2 class="sect">Daily Mode</h2>
  ${st.attempts === 0 ? `<div class="empty"><h2>No battles yet in ${modeInfo(view.mode).label} · ${DIFFS.find(d => d.id === view.diff)!.label}</h2><p>Finish a battle and your attempts, wins and flawless runs will show up here.</p></div>` : `
  <section class="tiles">
    ${tile('Avg attempts to flawless', num(st.avgToFlawless), `${st.flawlessDays} of ${plural(st.daysPlayed, 'day')} solved`)}
    ${tile('First-try wins', pct(st.firstTryRate), `streak ${st.firstStreak}, best ${st.bestFirstStreak}`)}
    ${tile('Left on first try', num(st.avgFirstLeft), `average over ${plural(st.firstsCounted, 'day')}`)}
    ${tile('Win rate', pct(st.winRate), plural(st.attempts, 'attempt'))}
    ${tile('Day streak', String(st.dayStreak), `${plural(st.daysPlayed, 'day')} played`)}
    ${tile('Turns per win', num(st.avgTurnsWin), 'average')}
  </section>
  <section class="block"><h2>Attempts to flawless</h2><p class="hint">Bars show the attempt you first beat Red without losing anyone. The line is your running average. Empty days were not solved.</p>${st.flawlessDays ? chartSVG(st.series.slice(-30)) : '<div class="empty"><p>No flawless wins yet. Once you beat Red without losing a Pokémon, the attempt it took shows up here.</p></div>'}</section>
  <section class="tiles three">
    <div class="tile"><span class="lbl">Your MVP</span><b>${named(st.mvp, 'KO')}</b></div>
    <div class="tile"><span class="lbl">Fell most often</span><b>${named(st.mostFallen, 'time')}</b></div>
    <div class="tile"><span class="lbl">Red's toughest</span><b>${named(st.redToughest, 'KO', ' on you')}</b></div>
  </section>
  <section class="block"><h2>Day by day</h2><div class="tablewrap"><table class="days"><thead><tr><th>Date</th><th>Attempts</th><th>First try</th><th>Flawless on</th></tr></thead><tbody>
    ${st.days.slice().reverse().slice(0, 60).map(d => `<tr><td>${d.date}</td><td class="num">${d.attempts}</td><td>${d.firstWin ? 'Won' : 'No'}</td><td class="num">${d.flawlessAt ?? '—'}</td></tr>`).join('')}
  </tbody></table></div></section>`}
  <p class="hint">Restarting a battle partway through counts as an attempt.</p>
  <h2 class="sect">Endless Mode</h2>${endlessStatsHTML(view.mode, view.diff)}
  ${syncHTML()}`;
}

function chartSVG(series: {date: string; value: number | null; avg: number | null}[]) {
  if (!series.length) return '';
  const W = 640, H = 220, L = 34, R = 10, T = 12, B = 30;
  const maxV = Math.max(3, ...series.map(s => Math.max(s.value ?? 0, s.avg ?? 0)));
  const top = Math.ceil(maxV);
  const n = series.length, bw = (W - L - R) / n;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const ticks = top <= 6 ? Array.from({length: top + 1}, (_, i) => i) : [...new Set([0, Math.round(top / 2), top])];
  const bars = series.map((s, i) => s.value === null ? '' :
    `<rect class="cbar" x="${(L + i * bw + bw * 0.18).toFixed(1)}" y="${y(s.value).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${(y(0) - y(s.value)).toFixed(1)}" rx="3"><title>${s.date}: flawless on attempt ${s.value}</title></rect>`).join('');
  const pts = series.map((s, i) => s.avg === null ? null : `${(L + i * bw + bw / 2).toFixed(1)},${y(s.avg).toFixed(1)}`).filter(Boolean);
  const last = series[series.length - 1];
  const labelEvery = Math.max(1, Math.ceil(n / 6));
  return `<div class="chart"><div class="legend"><span><i class="lg-bar"></i>Attempts that day</span><span><i class="lg-line"></i>Running average${last.avg !== null ? ` (${last.avg.toFixed(2)})` : ''}</span></div>
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Attempts to flawless per day">
    ${ticks.map(t => `<line class="cgrid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="ctick" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('')}
    ${bars}
    ${pts.length > 1 ? `<polyline class="cline" points="${pts.join(' ')}"/>` : ''}
    ${pts.length ? `<circle class="cdot" cx="${pts[pts.length - 1]!.split(',')[0]}" cy="${pts[pts.length - 1]!.split(',')[1]}" r="4"/>` : ''}
    ${series.map((s, i) => i % labelEvery === 0 ? `<text class="ctick" x="${L + i * bw + bw / 2}" y="${H - 10}" text-anchor="middle">${s.date.slice(5)}</text>` : '').join('')}
  </svg></div>`;
}

function howHTML() {
  return `<section class="block prose">
    <h2>How it works</h2>
    <p>Each day you get a team of six fully evolved level 100 Pokémon to beat Red on Mt. Silver. Every mode has its own team, and everyone who plays gets the same teams that day. A new day starts at midnight in your time zone.</p>
    <p>Play as many times as you like. All the luck is fixed for the day: if you make the same choices in the same order, the battle plays out exactly the same way, down to every crit and miss. Your first attempt is your blind run; after that, keep going until you beat Red without losing a Pokémon.</p>
    <h3>Modes</h3>
    <ul><li><b>Classic.</b> Each Pokémon always gets the same competitive set, taken from Pokémon Showdown's Random Battle sets.</li>
    <li><b>Random.</b> Random ability and item, but only moves that Showdown's teambuilder doesn't list as usually useless.</li>
    <li><b>Chaos.</b> Any four moves the Pokémon can learn in its latest generation, any of its abilities, and any held item that does something in battle. Every Chaos team has at least one Legendary or Mythical Pokémon and at least one Pokémon with a base stat total of 450 or less; Ultra Beasts and Paradox Pokémon can show up too.</li></ul>
    <h3>Singles and Doubles</h3>
    <p>Every mode can be played as Singles or Doubles. Both formats (and both difficulties) use the same six Pokémon that day, and each keeps its own attempts and stats. In Classic Doubles your Pokémon use Showdown's Random Doubles sets (often with Protect) where one exists; Chaos and Random sets are identical in both formats. In Doubles both sides send out two Pokémon at once and all six battle. You pick two leads, choose a move (and its target) for each of your Pokémon every turn, and Red uses the same six with moves built for doubles, like Fake Out, Protect and spread attacks.</p>
    <h3>Red</h3>
    <p>Red always has Pikachu, Espeon, Snorlax, Venusaur, Charizard and Blastoise at level 100, and always leads with Pikachu. On <b>Smart</b>, he picks moves that KO, sets up when he's safe, uses Sleep Powder, and switches out of losing matchups. On <b>Simple</b>, he always uses whichever move does the most damage and only switches when a Pokémon faints.</p>
    <h3>Rules</h3>
    <p>Gen 9 mechanics with National Dex rules, so older moves like Pursuit and Hidden Power still work. No Mega Evolution, Z-Moves, Dynamax or Terastallization. Every team is fully evolved. Outside Chaos, Legendary, Mythical and Ultra Beast Pokémon (and the legendary Paradox Pokémon) aren't in the pool.</p>
    ${WEB ? `<h3>Install it on your phone</h3>
    <p>On iPhone, open this page in Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>. On Android, use Chrome's menu and <b>Add to Home screen</b>. It opens like an app and works with no connection after the first launch: battles, stats and replays are saved on your phone and shared with friends when you're back online.</p>` : ''}
    <h3>Status conditions</h3>
    <p class="statusrow">${Object.keys(STATUS_NAME).map(s => '<span class="nowrap">' + statusBadge(s) + ' ' + ({psn: 'Poisoned', tox: 'Badly poisoned', brn: 'Burned', par: 'Paralyzed', slp: 'Asleep', frz: 'Frozen'} as any)[s] + '</span>').join(' ')}</p>
  </section>`;
}

// ---------------- Website build (Firebase) vs Claude page ----------------
const WEB: any = (globalThis as any).DR_WEB || null;

// ---------------- Friends ----------------
const modeKey = () => `${sel().mode}_${sel().diff}`;
// Friends shown: everyone else who has played at least once (and, on the website, picked a name)
const hasPlayed = (id: string) => Object.values(BOARD[id]?.days || {}).some(d => d && Object.keys(d).length > 0);
const friendIds = () => Object.keys(BOARD).filter(id => id !== MY_ID && hasPlayed(id) && (!WEB || !!NAMES[id]?.name));
const friendName = (id: string) => NAMES[id]?.name || 'Someone';
const revealed = () => attemptsFor(loadAttempts(), today, sel().mode, sel().diff).length > 0;
function avatar(id: string) {
  const n = NAMES[id];
  return n?.avatarUrl ? `<img class="av" src="${esc(n.avatarUrl)}" alt="">` : `<span class="av" style="background:${esc(n?.color || '#888')}"></span>`;
}
function dayText(d: DaySummary | undefined, show: boolean) {
  if (!d) return {main: 'Not played yet', cls: 'none'};
  if (!show) return {main: 'Played', cls: 'hid'};
  const tries = (n: number) => `${n} ${n === 1 ? 'attempt' : 'attempts'}`;
  if (d.fl) return {main: d.fl === 1 ? 'Flawless on attempt 1' : `Flawless on attempt ${d.fl}`, cls: 'flaw'};
  if (d.w) return {main: `${d.bl !== undefined ? `Won, ${6 - d.bl} remaining` : 'Won, not flawless'} · ${tries(d.a)}`, cls: 'win'};
  return {main: `No win yet · ${tries(d.a)}`, cls: 'loss'};
}
function friendsNote() {
  if (WEB) {
    if (!navigator.onLine) return '<p class="hint">You\'re offline. Showing friends\' results from your last connection; your own results will be shared when you reconnect.</p>';
    if (syncState === 'cloud') return '';
    if (syncState === 'syncing') return '<p class="hint">Connecting to the online scoreboard…</p>';
    const code = WEB.error?.() || '';
    return `<p class="hint">Can't reach the online scoreboard right now${code ? ` (${esc(code)})` : ''}. Your results are saved on this device and will be shared when it reconnects.</p>`;
  }
  if (syncState === 'readonly') return '<p class="hint">You can see your friends here, but your view-only access means your own results are not shared.</p>';
  if (syncState === 'local') return '<p class="hint">Sign in to Claude to see friends\' results.</p>';
  return '';
}
function stripRows() {
  return friendIds().map(id => ({id, d: BOARD[id].days?.[today]?.[modeKey()]}))
    .sort((x, y) => (x.d ? 0 : 1) - (y.d ? 0 : 1) || ((x.d?.fl ?? 99) - (y.d?.fl ?? 99)) || friendName(x.id).localeCompare(friendName(y.id)));
}
function statRows() {
  const show = revealed(); const key = modeKey();
  return friendIds().map(id => {
    const days = Object.entries(BOARD[id].days || {}).filter(([date]) => date !== today || show).map(([, v]) => v[key]).filter(Boolean) as DaySummary[];
    const solved = days.filter(d => d.fl);
    return {id, played: days.length,
      avg: solved.length ? solved.reduce((s, d) => s + d.fl!, 0) / solved.length : null,
      first: days.length ? days.filter(d => d.first === 'win').length / days.length : null,
      solvedN: solved.length, today: BOARD[id].days?.[today]?.[key]};
  }).filter(r => r.played || r.today).sort((x, y) => (x.avg ?? 99) - (y.avg ?? 99) || friendName(x.id).localeCompare(friendName(y.id)));
}
function friendsStripHTML() {
  const ids = friendIds();
  const show = revealed();
  const mode = modeInfo(sel().mode).label, diff = DIFFS.find(d => d.id === sel().diff)!.label;
  const rows = stripRows();
  const anyHidden = !show && rows.some(r => r.d);
  return `<section class="friends" id="friends-strip">
    <div class="fh"><h2>Friends today</h2><span class="hint">${esc(mode)} · ${esc(diff)}</span></div>
    ${ids.length ? `<ul class="fl">${rows.map(({id, d}) => { const t = dayText(d, show); return `<li class="fc f-${t.cls}">${avatar(id)}<span class="fn"></span><span class="fs">${esc(t.main)}</span></li>`; }).join('')}</ul>`
      : `<p class="hint">${WEB ? 'No friends have played yet. Send them the link to this page.' : 'No friends have played yet. Share this page and give them edit access from the Share menu so their results show up here.'}</p>`}
    ${anyHidden ? '<p class="hint">Results stay hidden until you finish your first attempt today.</p>' : ''}
    ${friendsNote()}
  </section>`;
}
/** The account box depends on the sign-in state, which can settle after the page first draws. */
function refreshAccount() { const el = document.getElementById('acct'); if (el) el.outerHTML = accountHTML(); }
function accountHTML() {
  if (!WEB) return '';
  const name = WEB.myName();
  return `<section class="acct" id="acct">
    <div><span class="lbl">Your name</span><b id="myname"></b></div>
    <div class="acctb"><button class="ghost" id="rename">Change name</button>${WEB.canLink() && WEB.signedIn?.() && !WEB.isLinked() ? '<button class="ghost" id="link-google">Keep progress on all devices</button>' : ''}</div>
    ${WEB.canLink() && WEB.signedIn?.() && !WEB.isLinked() ? '<p class="hint">Optional: sign in with Google so your progress follows you to other phones and computers.</p>' : ''}
  </section>`.replace('<b id="myname"></b>', `<b id="myname">${esc(name || 'Not set')}</b>`);
}
function friendsPageHTML() {
  return `${accountHTML()}${controlsHTML()}${friendsStripHTML()}${calendarHTML()}${friendsStatsHTML()}`;
}

// ---- Calendar: per day, how many players cleared and how many went flawless ----
let calMonth = '';            // YYYY-MM shown
let calSel = '';              // selected date
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
type CalPlayer = {id: string; d: DaySummary};
function dayPlayers(date: string): CalPlayer[] {
  const key = modeKey(); const out: CalPlayer[] = [];
  const mine = summarize(loadAttempts())[date]?.[key];
  if (mine) out.push({id: MY_ID || 'me', d: mine});
  for (const id of friendIds()) { const d = BOARD[id].days?.[date]?.[key]; if (d) out.push({id, d}); }
  return out;
}
/** The Locked button and its explanation (shown on hover with a mouse, on tap on a phone). */
function lockedHTML(p: CalPlayer) {
  const mine = remaining(summarize(loadAttempts())[today]?.[modeKey()]) ?? 0;
  const theirs = remaining(p.d);
  const left = (n: number) => n === 6 ? 'all 6 standing (flawless)' : n === 0 ? 'none standing' : `${n} of 6 standing`;
  const why = theirs === null ? 'Their win is better than your best today.' : `Their best today left ${left(theirs)}; yours left ${left(mine)}.`;
  return `<span class="lockwrap"><button class="ghost watch locked" data-locked aria-expanded="false">Locked</button>
    <span class="lockpop" role="tooltip"><b>Replay locked</b>${esc(why)} Match their result to unlock it, or come back tomorrow, when every replay from today opens up.</span></span>`;
}
/** Pokémon left standing in a day's best result (a loss leaves none). */
function remaining(d: DaySummary | undefined): number | null {
  if (!d) return 0;
  if (d.fl) return 6;
  if (d.w) return d.bl === undefined ? null : 6 - d.bl; // null: a win from an older version that didn't record how many were left
  return 0;
}
/** Today's replays only open up to your own best; any earlier day is open to everyone. */
function canWatch(p: CalPlayer, date: string) {
  if (date !== today || p.id === (MY_ID || 'me')) return true;
  const mine = remaining(summarize(loadAttempts())[date]?.[modeKey()]) ?? 0;
  const theirs = remaining(p.d);
  return theirs === null ? mine === 6 : theirs <= mine;
}
const isHidden = (date: string) => date === today && !revealed();
function calendarHTML() {
  if (!calMonth) calMonth = today.slice(0, 7);
  const [y, m] = calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate();
  const label = first.toLocaleDateString('en-US', {month: 'long', year: 'numeric'});
  const canPrev = calMonth > FIRST_DAY.slice(0, 7), canNext = calMonth < today.slice(0, 7);
  const cells: string[] = [];
  for (let i = 0; i < first.getDay(); i++) cells.push('<span class="cd blank"></span>');
  for (let d = 1; d <= days; d++) {
    const date = ymd(new Date(y, m - 1, d));
    if (date < FIRST_DAY || date > today) { cells.push(`<span class="cd off"><b>${d}</b></span>`); continue; }
    const ps = dayPlayers(date);
    const clears = ps.filter(p => p.d.w > 0 && !p.d.fl).length, flaw = ps.filter(p => p.d.fl).length;
    const me = ps.find(p => p.id === (MY_ID || 'me'))?.d;
    const meCls = !me ? '' : me.fl ? 'me-flaw' : me.w ? 'me-win' : 'me-try';
    const hid = isHidden(date);
    cells.push(`<button class="cd ${meCls} ${date === calSel ? 'sel' : ''} ${date === today ? 'today' : ''}" data-cal="${date}" aria-label="${date}: ${hid ? 'hidden until you play' : `${clears} cleared, ${flaw} flawless`}">
      <b>${d}</b>${ps.length ? (hid ? '<span class="cc">?</span>' : `<span class="cc"><i class="k-win"></i>${clears}<i class="k-flaw"></i>${flaw}</span>`) : ''}</button>`);
  }
  let detail = '';
  if (calSel) {
    const ps = dayPlayers(calSel);
    const nice = new Date(calSel + 'T12:00').toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric'});
    const playBtn = calSel < today ? `<button class="ghost" data-practice="${calSel}">Play this day's team</button>` : '';
    detail = `<div class="caldetail" id="cal-detail"><div class="cdh"><h3>${esc(nice)}</h3>${playBtn}</div>${
      isHidden(calSel) ? '<p class="hint">Finish your first attempt today to see results.</p>'
      : ps.length ? `<ul class="fl">${ps.map(p => { const t = dayText(p.d, true); return `<li class="fc f-${t.cls}">${p.id === (MY_ID || 'me') ? '<span class="av you"></span>' : avatar(p.id)}<span class="fn"></span><span class="fs">${esc(t.main)}</span>${replayOf(p.id, calSel, modeKey()) ? (canWatch(p, calSel) ? `<button class="ghost watch" data-watch="${esc(p.id)}">Watch</button>` : lockedHTML(p)) : ''}</li>`; }).join('')}</ul>`
      : '<p class="hint">Nobody played this mode that day.</p>'}</div>`;
  }
  return `<section class="block cal" id="calendar">
    <div class="calh"><button class="calnav" data-calnav="-1" ${canPrev ? '' : 'disabled'} aria-label="Previous month">‹</button><h2>${esc(label)}</h2><button class="calnav" data-calnav="1" ${canNext ? '' : 'disabled'} aria-label="Next month">›</button></div>
    <div class="calkey"><span><i class="k-win"></i>Cleared, not flawless</span><span><i class="k-flaw"></i>Flawless</span><span><i class="sw me-flaw"></i>You, flawless</span><span><i class="sw me-win"></i>You, cleared</span><span><i class="sw me-try"></i>You, no win</span></div>
    <div class="calgrid">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(w => `<span class="wd">${w}</span>`).join('')}${cells.join('')}</div>
    ${detail}
  </section>`;
}
function refreshCalendar() { const el = document.getElementById('calendar'); if (el) { el.outerHTML = calendarHTML(); nameFriends(); } }
function friendsStatsHTML() {
  const ids = friendIds();
  const show = revealed();
  const rows = statRows();
  const pct = (x: number | null) => x === null ? '—' : `${Math.round(x * 100)}%`;
  return `<section class="block" id="friends-stats"><h2>All time</h2>
    <p class="hint">${show ? 'Every day played, in this mode and difficulty.' : 'Today\'s results stay hidden until you finish your first attempt.'}</p>
    ${rows.length ? `<div class="tablewrap"><table class="days"><thead><tr><th>Player</th><th>Avg to flawless</th><th>First-try wins</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td><span class="pcell">${avatar(r.id)}<span class="fn"></span></span></td><td class="num">${r.avg === null ? '—' : r.avg.toFixed(1)} <span class="tsub">${r.solvedN}/${r.played} days</span></td><td class="num">${pct(r.first)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="hint">No friends have played this mode yet.</p>'}
    ${friendsNote()}
  </section>`;
}
/** Names are other people's text, so they are set with textContent after the HTML is in place. */
function fillNames(root: ParentNode, ids: string[]) {
  root.querySelectorAll('.fn').forEach((el, i) => { if (ids[i]) el.textContent = friendName(ids[i]); });
}
function refreshFriends() {
  const strip = document.getElementById('friends-strip');
  if (strip) { strip.outerHTML = friendsStripHTML(); }
  const st = document.getElementById('friends-stats');
  if (st) { st.outerHTML = friendsStatsHTML(); }
  const cal = document.getElementById('calendar'); if (cal) cal.outerHTML = calendarHTML();
  nameFriends();
}
function nameFriends() {
  const cd = document.getElementById('cal-detail');
  if (cd && calSel && !isHidden(calSel)) cd.querySelectorAll('.fn').forEach((el, i) => { const p = dayPlayers(calSel)[i]; if (p) el.textContent = p.id === (MY_ID || 'me') ? 'You' : friendName(p.id); });
  const strip = document.getElementById('friends-strip'); if (strip) fillNames(strip, stripRows().map(r => r.id));
  const st = document.getElementById('friends-stats'); if (st) fillNames(st, statRows().map(r => r.id));
}

// ---------------- Countdown & day rollover ----------------
let cdTimer: any;
function bindCountdown() {
  clearInterval(cdTimer);
  const tick = () => {
    const now = new Date(); const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    if (localDateKey(now) !== today && !S) { rollDay(); render(); return; }
    const ms = next.getTime() - now.getTime();
    const h = Math.floor(ms / 3.6e6), m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1000) % 60;
    const el = document.getElementById('cd'); if (el) el.textContent = `Next team ${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  tick(); cdTimer = setInterval(tick, 1000);
}

/** Move to the new day if midnight has passed and no battle is on screen. */
function rollDay() {
  const k = localDateKey();
  if (k === today || S) return;
  today = k; rebuildTeam(); restore();
}
// ---------------- Events ----------------
/** Choices in the battle resumed at page load, until the account sync has had its say (0 = none). */
let bootRestored = 0;
function restore() {
  if (practice) return;
  const cur = store<{lead: number | number[]; choices: string[]} | null>(currentKey(), null);
  if (cur && Array.isArray(cur.choices) && cur.choices.length) {
    try { startSession(cur.lead, cur.choices); } catch (e) { console.error(e); S = null; }
  }
}

document.addEventListener('click', e => {
  if (!(e.target as HTMLElement).closest('.lockwrap')) document.querySelectorAll('.watch.locked[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
  // During a replay, tapping anywhere on the battle screen pauses or resumes it
  if (S?.watch && !S.ended && (e.target as HTMLElement).closest('.console')) { togglePause(); return; }
  const t = (e.target as HTMLElement).closest('button, summary') as HTMLElement | null;
  if (!t) return;
  if (t.dataset.tab && watching) exitWatch(false);
  if (t.dataset.tab) {
    if (t.dataset.tab === 'endless' && tab !== 'endless') { if (watching) exitWatch(false); tab = 'endless'; enterEndless(); render(); window.scrollTo(0, 0); return; }
    if (t.dataset.tab !== 'endless' && tab === 'endless') exitEndless();
  }
  if (t.dataset.emode) { eprefs.mode = withFmt(t.dataset.emode as BaseMode, isDoublesMode(eprefs.mode)); save(EPREFS_KEY, eprefs); render(); return; }
  if (t.dataset.efmt) { eprefs.mode = withFmt(baseMode(eprefs.mode), t.dataset.efmt === 'doubles'); save(EPREFS_KEY, eprefs); render(); return; }
  if (t.dataset.ediff) { eprefs.diff = t.dataset.ediff as Difficulty; save(EPREFS_KEY, eprefs); render(); return; }
  if (t.id === 'e-start') { startRun(); render(); window.scrollTo(0, 0); return; }
  if (t.id === 'e-battle' && erun) { resetUI(); UI.sel = 0; const l = isDoublesMode(erun.mode) ? leadList() : leadIdx(); startSession(l); S!.endless = true; erun.lead = l; erun.lastTeam = team.map(x => x.species); saveRun(); render(); document.getElementById('battle')?.scrollIntoView({block: 'start'}); return; }
  if (t.id === 'e-next') { nextBattle(); render(); window.scrollTo(0, 0); return; }
  if (t.id === 'e-giveup' || t.id === 'e-quit') {
    if (!t.dataset.confirm) { t.dataset.confirm = '1'; t.textContent = 'Tap again to end the run'; setTimeout(() => { if (t.isConnected) { delete t.dataset.confirm; t.textContent = t.id === 'e-quit' ? 'End run' : 'END RUN'; } }, 3000); return; }
    endRun(); S = null; resetUI(); applyRun(); render(); window.scrollTo(0, 0); return;
  }
  if (t.id === 'e-home') { S = null; resetUI(); applyRun(); render(); window.scrollTo(0, 0); return; }
  if (t.dataset.locked !== undefined) {
    const open = t.getAttribute('aria-expanded') !== 'true';
    document.querySelectorAll('.watch.locked[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
    t.setAttribute('aria-expanded', String(open)); return;
  }
  if (t.dataset.watch !== undefined) { const p = dayPlayers(calSel).find(x => x.id === t.dataset.watch); if (!p || canWatch(p, calSel)) startWatch(t.dataset.watch, calSel, modeKey()); return; }
  if (t.id === 'watch-exit') { exitWatch(true); return; }
  if (t.dataset.rc) { replayControl(t.dataset.rc); return; }
  if (t.id === 'watch-again' && S?.watch) { const w = S.watch; exitWatch(false); startWatch(w.id, w.date, w.key); return; }
  if (t.dataset.tab) { const next = t.dataset.tab as any; if (next !== tab && next !== 'play' && tab === 'play') { view.mode = prefs.mode; view.diff = prefs.diff; } tab = next; render(); return; }
  if (t.dataset.vmode) { view.mode = withFmt(t.dataset.vmode as BaseMode, isDoublesMode(view.mode)); render(); return; }
  if (t.dataset.vfmt) { view.mode = withFmt(baseMode(view.mode), t.dataset.vfmt === 'doubles'); render(); return; }
  if (t.dataset.vdiff) { view.diff = t.dataset.vdiff as Difficulty; render(); return; }
  if (t.dataset.practice) { startPractice(t.dataset.practice); return; }
  if (t.id === 'back-today') { startPractice(today); return; }
  if (t.id === 'rename') { namePrompt(true); return; }
  if (t.id === 'link-google') { WEB?.linkGoogle().then((changed: boolean) => { if (changed) location.reload(); else render(); }).catch(() => {}); return; }
  if (t.dataset.cal) { calSel = calSel === t.dataset.cal ? '' : t.dataset.cal; refreshCalendar(); return; }
  if (t.dataset.calnav) { const [y, m] = calMonth.split('-').map(Number); calMonth = ymd(new Date(y, m - 1 + +t.dataset.calnav, 1)).slice(0, 7); calSel = ''; refreshCalendar(); return; }
  if ((t.dataset.mode || t.dataset.fmt) && !busy()) {
    const m = t.dataset.mode ? withFmt(t.dataset.mode as BaseMode, isDoublesMode(prefs.mode)) : withFmt(baseMode(prefs.mode), t.dataset.fmt === 'doubles');
    S = null; rollDay(); prefs.mode = m; savePrefs(); rebuildTeam(); if (!practice) restore(); render(); return;
  }
  if (t.dataset.diff && !busy()) { S = null; rollDay(); prefs.diff = t.dataset.diff as Difficulty; savePrefs(); if (!practice) restore(); render(); return; }
  if (t.dataset.lead) { prefs.leads[leadKey()] = +t.dataset.lead; savePrefs(); render(); return; }
  if (t.dataset.lead1 || t.dataset.lead2) {
    // Doubles: put this Pokémon in the chosen lead spot; if it was the other lead, the two swap
    const i = +(t.dataset.lead1 ?? t.dataset.lead2)!; const k = t.dataset.lead1 ? 0 : 1;
    const l = leadList(); const other = l[1 - k];
    l[k] = i; if (other === i) l[1 - k] = leadList()[k];
    prefs.leads[leadKey()] = l[0]; prefs.leads[leadKey() + ':b'] = l[1];
    savePrefs(); render(); return;
  }
  if (t.id === 'start') { resetUI(); UI.sel = 0; startSession(isDoublesMode(prefs.mode) ? leadList() : leadIdx()); render(); document.getElementById('battle')?.scrollIntoView({block: 'start'}); return; }
  if (t.dataset.move) { UI.chosen = UI.sel = +t.dataset.move - 1; UI.run = false; renderBattle(); return; } // in doubles this opens the target picker
  if (t.id === 'use' && UI.chosen >= 0) { const i = UI.chosen; slotChoice('move ' + (i + 1)); return; }
  if (t.dataset.target && UI.chosen >= 0) { slotChoice(t.dataset.target === 'all' ? `move ${UI.chosen + 1}` : `move ${UI.chosen + 1} ${t.dataset.target}`); return; }
  if (t.id === 'slot-back') { slotBack(); return; }
  if (t.id === 'unchoose' || t.id === 'tgt-cancel') { UI.chosen = -1; renderBattle(); return; }
  if (t.id === 'msgbox') { advance?.(); return; }
  if (t.id === 'p-hide') { UI.fhide = true; UI.party = false; UI.psel = -1; UI.summary = false; renderBattle(); return; }
  if (t.id === 'open-party') { UI.fhide = false; UI.party = true; UI.psel = -1; UI.summary = false; renderBattle(); return; }
  if (t.id === 'p-close' || t.id === 'p-cancel') { if (t.id === 'p-cancel' && UI.psel >= 0) { UI.psel = -1; UI.summary = false; } else UI.party = false; renderBattle(); return; }
  if (t.id === 'open-party') { UI.chosen = -1; }
  if (t.dataset.pick !== undefined) { const i = +t.dataset.pick; UI.summary = UI.psel === i ? UI.summary : false; UI.psel = i; renderBattle(); return; }
  if (t.id === 'p-summary') { UI.summary = !UI.summary; renderBattle(); return; }
  if (t.id === 'p-shift' && UI.psel >= 0 && !(t as HTMLButtonElement).disabled) { const i = UI.psel; UI.party = false; UI.psel = -1; UI.summary = false; slotChoice('switch ' + (i + 1)); return; }
  if (t.id === 'run') { UI.run = true; UI.chosen = -1; renderBattle(); return; }
  if (t.id === 'run-no') { UI.run = false; renderBattle(); return; }
  if (t.id === 'run-yes') { resetUI(); forfeitAndRetry(true); return; }
  if (t.dataset.speed) { prefs.fast = t.dataset.speed === 'fast'; savePrefs(); renderBattle(); return; }
  if (t.id === 'retry') {
    if (t.dataset.confirm) { forfeitAndRetry(true); return; }
    t.dataset.confirm = '1'; t.textContent = 'Tap again to restart (counts as an attempt)'; t.classList.add('warn');
    setTimeout(() => { if (t.isConnected) { delete t.dataset.confirm; t.textContent = 'Restart attempt'; t.classList.remove('warn'); } }, 3500);
    return;
  }
  if (t.id === 'again') { S = null; rollDay(); render(); return; }
  if (t.id === 'copy') {
    const txt = $('#grid').textContent || '';
    let settled = false;
    const say = (msg: string) => { t.textContent = msg; setTimeout(() => { if (t.isConnected) t.textContent = 'Copy result'; }, 2500); };
    const fail = () => { if (settled) return; settled = true; selectGrid(); say('Selected: press Copy or Ctrl+C'); };
    const done = () => { if (settled) return; settled = true; say('Copied'); };
    setTimeout(fail, 1200);
    try { navigator.clipboard.writeText(txt).then(done, fail); } catch { fail(); }
  }
});
function selectGrid() { const g = $('#grid'); const r = document.createRange(); r.selectNodeContents(g); const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(r); }
document.addEventListener('mouseover', e => {
  const t = (e.target as HTMLElement).closest('button[data-move]') as HTMLElement | null;
  if (!t || (t as HTMLButtonElement).disabled || !matchMedia('(hover: hover)').matches) return;
  const i = +t.dataset.move! - 1; if (i !== UI.sel && UI.chosen < 0) { UI.sel = i; renderBattle(); }
});
document.addEventListener('change', e => {
  const t = e.target as HTMLInputElement;
  if (t.id === 'pastday' && t.value) { startPractice(t.value); return; }
  if (t.id === 'fast') { prefs.fast = t.checked; savePrefs(); }
});

// ---------------- Boot ----------------
async function boot() {
  const get = (f: string) => fetch(f, {cache: 'no-cache'}).then(r => { if (!r.ok) throw new Error(f); return r.json(); });
  try {
    const [pool, desc, spr, text] = await Promise.all([get('pool.json'), get('desc.json'), get('sprites.json'), get('battletext.json')]);
    POOL = pool; DESC = desc; SPR = spr;
    document.documentElement.style.setProperty('--cols', String(spr.cols)); if (spr.v) { document.documentElement.style.setProperty('--front', `url("front.png?v=${spr.v}")`); document.documentElement.style.setProperty('--back', `url("back.png?v=${spr.v}")`); } document.documentElement.style.setProperty('--rows', String(spr.rows)); text.Default.default = {...text.Default.default, fullName: '{NICKNAME}', opposingPokemon: "RED's {NICKNAME}", startBattle: 'RED: ......\nRED wants to battle!', switchIn: 'RED sent out {FULLNAME}!', switchInOwn: 'Go! {FULLNAME}!', winBattle: '{TRAINER} won the battle!'};
    (globalThis as any).BattleText = {en: {...text,
      StatNames: {hp: 'HP', atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed', accuracy: 'accuracy', evasion: 'evasiveness', spc: 'Special'},
      StatMediumNames: {hp: 'HP', atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed', accuracy: 'Accuracy', evasion: 'Evasiveness', spc: 'Special'},
      StatShortNames: {hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', accuracy: 'Acc', evasion: 'Eva', spc: 'Spc'}}};
  } catch (e) {
    $('#app').innerHTML = `<div class="wrap empty"><h2>Couldn't load the game data</h2><p>Reload the page to try again.</p></div>`;
    return;
  }
  rebuildTeam();
  restore();
  bootRestored = S ? S.choices.length : 0;
  render();
  onSyncChange(() => { const el = document.getElementById('sync'); if (el) el.outerHTML = syncHTML(); refreshFriends(); refreshAccount(); });
  WEB?.onAuth?.(refreshAccount);
  // Going offline or back online changes what the sync notes say
  const onNet = () => { const el = document.getElementById('sync'); if (el) el.outerHTML = syncHTML(); refreshFriends(); };
  addEventListener('online', onNet); addEventListener('offline', onNet);
  onBoardChange(refreshFriends);
  const docs = await cloudInit();
  if (docs) applyCloud(docs);
  namePrompt();
}

function namePrompt(force = false) {
  if (!WEB || (!force && WEB.myName())) return;
  if (document.getElementById('namebox')) return;
  const wrap = document.createElement('div');
  wrap.id = 'namebox'; wrap.className = 'modal';
  wrap.innerHTML = `<form class="mbox" id="nameform"><h2>Pick a display name</h2><p class="hint">Friends see this next to your results. No sign-in needed.</p>
    <input id="namein" maxlength="24" autocomplete="nickname" required placeholder="e.g. Logan"><div class="rbtns"><button class="go" type="submit">Save</button>${force ? '<button class="ghost" type="button" id="namecancel">Cancel</button>' : ''}</div></form>`;
  document.body.appendChild(wrap);
  const input = wrap.querySelector('#namein') as HTMLInputElement;
  input.value = WEB.myName() || ''; input.focus();
  wrap.querySelector('#nameform')!.addEventListener('submit', async e => {
    e.preventDefault(); const v = input.value.trim().slice(0, 24); if (!v) return;
    await WEB.setName(v); publishSummary(); wrap.remove(); render();
  });
  wrap.querySelector('#namecancel')?.addEventListener('click', () => wrap.remove());
}

/** Bring in prefs and unfinished battles saved from another device or browser. */
function applyCloud(docs: Record<string, any>) {
  const cp = docs.prefs;
  const prevMode = prefs.mode;
  // An Endless run played more recently on another device takes over from this device's copy (and vice versa)
  const cr = docs.endless_cur as EndlessRun | undefined;
  if (cr?.id && (!erun || (cr.t || 0) > (erun.t || 0))) {
    erun = JSON.parse(JSON.stringify(cr)); save(ERUN_KEY, erun);
    if (tab === 'endless' && endlessCtx && !(S && S.choices.length > (erun!.choices?.length || 0))) { exitEndless(); enterEndless(); }
  } else if (erun && (!cr || (erun.t || 0) > (cr.t || 0))) cloudSet('endless_cur', {...erun, t: erun.t || Date.now()});
  if (docs.endless_runs?.list) { const ids = new Set(edone.map(r => r.id)); for (const r of docs.endless_runs.list as EndlessDone[]) if (!ids.has(r.id)) edone.push(r); edone.sort((a, b) => a.ended - b.ended); save(EDONE_KEY, edone); }
  if (cp && (cp.t || 0) > (prefs.t || 0) && !endlessCtx && !watching) { Object.assign(prefs, cp); save(PREFS_KEY, prefs); }
  else if (!cp || (prefs.t || 0) > (cp.t || 0)) cloudSet('prefs', {...prefs});
  type Cur = {lead: number | number[]; choices: string[]; t?: number};
  const seenKeys = new Set<string>();
  for (const [id, body] of Object.entries(docs)) {
    if (id.startsWith('cur_')) { cloudDel(id); continue; } // battles saved before the EV change
    if (!id.startsWith('cur2_')) continue;
    const [, date, mode, diff] = id.split('_');
    if (date !== today) { cloudDel(id); continue; }
    const key = `dailyred:v2:current:${date}:${mode}:${diff}`; seenKeys.add(key);
    const local = store<Cur | null>(key, null);
    // The most recently played copy wins (by time when both have one, otherwise the longer battle)
    const cloudNewer = !local || (body.t && local.t ? body.t > local.t : (body.choices?.length || 0) > (local.choices?.length || 0));
    const localNewer = local && (body.t && local.t ? local.t > body.t : (local.choices?.length || 0) > (body.choices?.length || 0));
    if (cloudNewer) save(key, {lead: body.lead, choices: body.choices, t: body.t});
    else if (localNewer) cloudSet(id, {...local!, t: local!.t || Date.now()});
  }
  // A battle saved on this device but no longer in the cloud was finished or restarted on another device
  // (an attempt was recorded after it was last played), so drop it instead of resuming a stale battle
  try {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(`dailyred:v2:current:${today}:`) || seenKeys.has(k)) continue;
      const [, , , , mode, diff] = k.split(':');
      const local = store<Cur | null>(k, null);
      const later = attemptsFor(loadAttempts(), today, mode as Mode, diff as Difficulty).some(a => a.at > (local?.t || 0));
      if (later) localStorage.removeItem(k);
    }
  } catch { /* storage unavailable */ }
  // A battle resumed when the page opened, and not touched since, gives way to what the account says now
  if (S && bootRestored && S.choices.length === bootRestored) { S = null; resetUI(); rebuildTeam(); }
  bootRestored = 0;
  if (!S || S.ended) {
    if (prefs.mode !== prevMode) rebuildTeam();
    if (!S) restore();
    render();
  } else {
    const el = document.getElementById('today'); if (el) refreshSummary();
  }
}

function syncHTML() {
  if (WEB) {
    const linked = WEB.isLinked();
    const msg = !navigator.onLine ? 'You\'re offline. Progress is saved on this phone and syncs when you reconnect.' : syncState === 'cloud' ? (linked ? 'Progress is backed up to your Google account and follows you across devices.' : 'Progress is backed up online for this device.') : syncState === 'syncing' ? 'Syncing progress…' : 'Progress is saved on this device.';
    return `<p class="hint sync" id="sync">${esc(msg)}</p>`;
  }
  const msg = {local: 'Progress is saved in this browser only.', syncing: 'Syncing progress…', cloud: 'Progress is saved to your Claude account and follows you across devices.',
    readonly: 'Your access to this page is view-only, so progress is saved in this browser only.'}[syncState];
  return `<p class="hint sync s-${syncState}" id="sync">${esc(msg)}</p>`;
}
// ---------------- Keep the screen awake during a battle or replay ----------------
let wakeLock: any = null;
const wantAwake = () => !!S && !S.ended && !S.watch?.paused && document.visibilityState === 'visible'; // a paused replay may sleep
let wakeBusy = false;
async function keepAwake() {
  if (wakeBusy) return; wakeBusy = true;
  try {
    const wl = (navigator as any).wakeLock;
    if (!wl) return;
    const held = wakeLock && !wakeLock.released;
    if (wantAwake() && !held) wakeLock = await wl.request('screen');
    else if (!wantAwake() && held) { await wakeLock.release(); wakeLock = null; }
  } catch { /* not supported, or the browser wants a tap first */ }
  wakeBusy = false;
  if ((wakeLock && !wakeLock.released) !== wantAwake() && (navigator as any).wakeLock) setTimeout(keepAwake, 500); // state changed while busy
}
// The lock is dropped whenever the page is hidden, so take it again on return; some browsers only allow it after a tap
document.addEventListener('visibilitychange', keepAwake);
document.addEventListener('pointerdown', () => setTimeout(keepAwake, 0), {passive: true});
// Test hook: end the current battle as a win (used by the automated browser tests)
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) (globalThis as any).__drDebug = {S: () => S, winBattle() { if (!S || S.ended) return; S.battle.winner = 'You'; S.battle.ended = true; S.queue = []; S.playing = false; finish(); render(); }};
boot();
void stat;
