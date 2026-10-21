// Attempt records in browser storage, and the statistics derived from them.
import type {Mode, Difficulty} from './game';

export interface Attempt {
  date: string; mode: Mode; diff: Difficulty; n: number;
  result: 'win' | 'loss' | 'forfeit';
  lost: number;          // how many of your Pokémon fainted
  redLeft: number;       // Red's Pokémon still standing
  turns: number; lead: string; at: number;
  kos: Record<string, number>;       // your species -> KOs
  fainted: string[];                 // your species that fainted
  redKos: Record<string, number>;    // Red species -> KOs on you
  rp?: string;                       // replay: lead positions and every choice, packed (see packReplay)
}

const KEY = 'dailyred:v1:attempts';
export function store<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
export function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}
// ---------- Account sync ----------
// Attempts live in memory, are mirrored to browser storage, and (when the viewer is signed in and allowed
// to write) to this artifact's private per-person store, one document per day: data/users/<id>/att_<date>.
let ATT: Attempt[] = store(KEY, [] as Attempt[]);
let DB: any = null, UID: string | null = null;
export let syncState: 'local' | 'syncing' | 'cloud' | 'readonly' = 'local';
const chains: Record<string, Promise<unknown>> = {};
const listeners: (() => void)[] = [];
export const onSyncChange = (fn: () => void) => listeners.push(fn);
const setSync = (s: typeof syncState) => { syncState = s; listeners.forEach(f => f()); };

export const loadAttempts = (): Attempt[] => ATT;
export function addAttempt(a: Attempt) { ATT.push(a); save(KEY, ATT); putDay(a.date); publishSummary(); }
// The website keeps one record per month (atm_YYYY-MM) so opening the page reads a dozen records a year instead of
// one per day; the Claude page keeps one per day (att_YYYY-MM-DD). Replay data is only kept on each day's best
// attempts, so a month record stays small.
const MONTHLY = !!(globalThis as any).DR_WEB;
function slim(list: Attempt[]) {
  const keepRp = new Set<Attempt>();
  const groups: Record<string, Attempt[]> = {};
  for (const a of list) (groups[`${a.date}|${a.mode}|${a.diff}`] ||= []).push(a);
  for (const g of Object.values(groups)) { const b = bestAttempt(g); if (b) keepRp.add(b); }
  return list.map(a => { if (keepRp.has(a) || !a.rp) return a; const {rp, ...rest} = a; void rp; return rest as Attempt; });
}
function putDay(date: string) {
  if (MONTHLY) { const m = date.slice(0, 7); cloudSet('atm_' + m, {list: slim(ATT.filter(x => x.date.startsWith(m)))}); }
  else cloudSet('att_' + date, {list: ATT.filter(x => x.date === date)});
}

function write(id: string, op: (ref: any) => Promise<unknown>, path?: string) {
  if (!DB || !UID) return;
  const ref = DB.doc(path || `data/users/${UID}/${id}`);
  const run = async () => {
    try { await op(ref); }
    catch (e: any) {
      if (e?.code === 'unavailable') { await new Promise(r => setTimeout(r, 400 + Math.random() * 600)); try { await op(ref); return; } catch { /* fall through */ } }
      if (e?.code === 'invalid_argument' || e?.code === 'not_granted' || e?.code === 'revoked') { DB = null; setSync('readonly'); }
    }
  };
  // The website (Firestore) applies writes in the order they're made and saves them on the phone straight away, so
  // send each one immediately. Waiting for the server to confirm each write before sending the next left a backlog
  // on slow connections; closing the app then lost the newest writes (like deleting a finished battle).
  if (MONTHLY) { void run(); return; }
  chains[id] = (chains[id] || Promise.resolve()).then(run);
}
export const cloudSet = (id: string, body: Record<string, unknown>) => write(id, ref => ref.set(body));
export const cloudDel = (id: string) => write(id, ref => ref.delete());

const attKey = (a: Attempt) => `${a.at}|${a.mode}|${a.diff}`;
/** Connect to the account store, merge it with this browser's copy, and return the other synced documents. */
export async function cloudInit(): Promise<Record<string, any> | null> {
  const c = (globalThis as any).claude;
  if (!c?.use) return null;
  setSync('syncing');
  try {
    const [db, user] = await Promise.all([c.use('db'), c.use('user')]);
    USER = user;
    const uid = db && user ? await user.id() : null;
    if (db) watchBoard(db);
    MY_ID = uid;
    if (!db || !uid) { setSync('local'); return null; }
    const snap = await db.collection(`data/users/${uid}`).limit(1000).get();
    const docs: Record<string, any> = {};
    for (const d of snap.docs) if (d.exists) docs[d.id] = JSON.parse(JSON.stringify(d.data())); // store snapshots are frozen; copy so the page can edit them
    // Merge attempts: union of both copies, numbered again in time order
    // A reset marker drops every attempt for that day made before the reset, from both copies
    const reset = docs.reset as {date?: string; before?: number} | undefined;
    const keep = (x: Attempt) => !(reset?.date && x.date === reset.date && x.at <= (reset.before || 0));
    ATT = ATT.filter(keep);
    if (reset?.date) {
      try { for (const k of Object.keys(localStorage)) if ((k.startsWith(`dailyred:v1:current:${reset.date}:`) || k.startsWith(`dailyred:v2:current:${reset.date}:`))) localStorage.removeItem(k); } catch { /* ignore */ }
      for (const id of Object.keys(docs)) if (id.startsWith(`cur_${reset.date}_`) || id.startsWith(`cur2_${reset.date}_`)) delete docs[id];
    }
    const seen = new Map<string, Attempt>();
    const cloudKeys = new Set<string>();
    for (const [id, body] of Object.entries(docs)) if (id.startsWith('att_') || id.startsWith('atm_')) for (const a of ((body.list || []) as Attempt[]).filter(keep)) { seen.set(attKey(a), a); cloudKeys.add(attKey(a)); }
    const missingDays = new Set<string>();
    for (const a of ATT) {
      const c = seen.get(attKey(a));
      if (!c) { seen.set(attKey(a), a); missingDays.add(a.date); }
      else if (!c.rp && a.rp) seen.set(attKey(a), {...c, rp: a.rp}); // month records drop replay data that isn't needed
    }
    const merged = [...seen.values()].sort((x, y) => x.at - y.at);
    const counter: Record<string, number> = {};
    for (const a of merged) { const k = `${a.date}|${a.mode}|${a.diff}`; a.n = counter[k] = (counter[k] || 0) + 1; }
    ATT = merged; save(KEY, ATT);
    DB = db; UID = uid; MY_ID = uid; setSync('cloud');
    if (reset?.date) missingDays.add(reset.date);
    if (MONTHLY) {
      // Move any per-day records into month records, then remove the per-day ones
      const oldDays = Object.keys(docs).filter(id => id.startsWith('att_'));
      const months = new Set([...oldDays.map(id => id.slice(4, 11)), ...[...missingDays].map(d => d.slice(0, 7))]);
      for (const m of months) putDay(m + '-01');
      for (const id of oldDays) cloudDel(id);
    } else for (const d of missingDays) putDay(d);
    publishSummary();
    return docs;
  } catch {
    setSync('local'); return null;
  }
}

export const isFlawless = (a: Attempt) => a.result === 'win' && a.lost === 0;

export function attemptsFor(all: Attempt[], date: string, mode: Mode, diff: Difficulty) {
  return all.filter(a => a.date === date && a.mode === mode && a.diff === diff).sort((x, y) => x.n - y.n);
}

export interface DayRow { date: string; attempts: number; firstWin: boolean; flawlessAt: number | null; wins: number }

export function computeStats(all: Attempt[], mode: Mode, diff: Difficulty, today: string) {
  const mine = all.filter(a => a.mode === mode && a.diff === diff);
  const byDay = new Map<string, Attempt[]>();
  for (const a of mine) { if (!byDay.has(a.date)) byDay.set(a.date, []); byDay.get(a.date)!.push(a); }
  const days: DayRow[] = [...byDay.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([date, list]) => {
    list.sort((x, y) => x.n - y.n);
    const fl = list.find(isFlawless);
    return {date, attempts: list.length, firstWin: list[0]?.n === 1 && list[0].result === 'win',
      flawlessAt: fl ? fl.n : null, wins: list.filter(a => a.result === 'win').length};
  });
  const solved = days.filter(d => d.flawlessAt !== null);
  const avgToFlawless = solved.length ? solved.reduce((s, d) => s + d.flawlessAt!, 0) / solved.length : null;
  // running average of attempts-to-flawless, day by day
  let sum = 0, cnt = 0;
  const series = days.map(d => {
    if (d.flawlessAt !== null) { sum += d.flawlessAt; cnt++; }
    return {date: d.date, value: d.flawlessAt, avg: cnt ? sum / cnt : null, attempts: d.attempts};
  });
  const wins = mine.filter(a => a.result === 'win');
  const firstTries = days.filter(d => d.firstWin).length;
  // Pokémon left standing on each day's first attempt (a loss leaves none)
  const firsts = [...byDay.values()].map(l => l.find(a => a.n === 1)).filter((a): a is Attempt => !!a);
  const avgFirstLeft = firsts.length ? firsts.reduce((s, a) => s + (a.result === 'win' ? 6 - a.lost : 0), 0) / firsts.length : null;

  // Day streak: consecutive days played ending today or yesterday
  const dayset = new Set(days.map(d => d.date));
  const shift = (key: string, n: number) => { const [y, m, d] = key.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
  let dayStreak = 0; let cur = dayset.has(today) ? today : shift(today, -1);
  while (dayset.has(cur)) { dayStreak++; cur = shift(cur, -1); }
  // First-try win streak (over days played, most recent first)
  let firstStreak = 0;
  const recent = days.length && (days[days.length - 1].date === today || days[days.length - 1].date === shift(today, -1));
  if (recent) for (let i = days.length - 1; i >= 0; i--) { if (days[i].firstWin) firstStreak++; else break; }
  let bestFirstStreak = 0, run = 0;
  for (const d of days) { run = d.firstWin ? run + 1 : 0; bestFirstStreak = Math.max(bestFirstStreak, run); }

  const tally = (f: (a: Attempt) => Record<string, number>) => {
    const t: Record<string, number> = {};
    for (const a of mine) for (const [k, v] of Object.entries(f(a))) t[k] = (t[k] || 0) + v;
    return Object.entries(t).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  };
  const top = (t: [string, number][]) => t.length ? {n: t[0][1], names: t.filter(x => x[1] === t[0][1]).map(x => x[0])} : null;
  const mvp = tally(a => a.kos);
  const redToughest = tally(a => a.redKos);
  const fallen = tally(a => Object.fromEntries(a.fainted.map(s => [s, 1])));

  return {
    daysPlayed: days.length, attempts: mine.length,
    winRate: mine.length ? wins.length / mine.length : null,
    firstTryRate: days.length ? firstTries / days.length : null,
    flawlessDays: solved.length, avgToFlawless, series, days,
    dayStreak, firstStreak, bestFirstStreak, avgFirstLeft, firstsCounted: firsts.length,
    avgTurnsWin: wins.length ? wins.reduce((s, a) => s + a.turns, 0) / wins.length : null,
    mvp: top(mvp), redToughest: top(redToughest), mostFallen: top(fallen),
    redTally: redToughest,
  };
}


// ---------- Friends board ----------
// Each player's summary lives in a shared document players/<id>: anyone can read it, only its owner writes it.
export interface DaySummary { a: number; first: 'win' | 'loss' | 'forfeit'; firstLost: number; fl: number | null; w: number; bl?: number } // bl: fewest lost in a win
export interface PlayerDoc { days: Record<string, Record<string, DaySummary>>; rp?: Record<string, Record<string, string>>; t: number }
export let BOARD: Record<string, PlayerDoc> = {};
export let MY_ID: string | null = null;
export let NAMES: Record<string, {name: string; avatarUrl: string; color: string}> = {};
let USER: any = null;
const boardListeners: (() => void)[] = [];
export const onBoardChange = (fn: () => void) => boardListeners.push(fn);
const boardChanged = () => boardListeners.forEach(f => f());

export function summarize(list: Attempt[]): PlayerDoc['days'] {
  const days: PlayerDoc['days'] = {};
  const dates = [...new Set(list.map(a => a.date))].sort().slice(-120);
  for (const d of dates) {
    const out: Record<string, DaySummary> = {};
    const byKey: Record<string, Attempt[]> = {};
    for (const a of list) if (a.date === d) (byKey[`${a.mode}_${a.diff}`] ||= []).push(a);
    for (const [k, l] of Object.entries(byKey)) {
      l.sort((x, y) => x.n - y.n);
      const fl = l.find(isFlawless);
      const wins = l.filter(x => x.result === 'win');
      out[k] = {a: l.length, first: l[0].result, firstLost: l[0].lost, fl: fl ? fl.n : null, w: wins.length, ...(wins.length ? {bl: Math.min(...wins.map(x => x.lost))} : {})};
    }
    days[d] = out;
  }
  return days;
}
// ---------- Best-attempt replays ----------
// A battle is fully decided by the day, mode, leads and your choices, so a replay is just those, packed small:
// "0.3|m1 2,m3;s4;..." (lead positions | choices, one per turn, with "move "->"m", "switch "->"s", "pass"->"p").
export function packReplay(lead: number[], choices: string[]) {
  return lead.join('.') + '|' + choices.map(c => c.replace(/move /g, 'm').replace(/switch /g, 's').replace(/pass/g, 'p').replace(/, /g, ',')).join(';');
}
export function unpackReplay(s: string): {lead: number[]; choices: string[]} {
  const [l, c] = s.split('|');
  return {lead: l.split('.').map(Number), choices: c ? c.split(';').map(x => x.split(',').map(p => p.replace(/^m/, 'move ').replace(/^s/, 'switch ').replace(/^p$/, 'pass')).join(', ')) : []};
}
/** The attempt to show for a day: the first flawless win, otherwise the first attempt that lost the fewest (restarts don't count). */
export function bestAttempt(list: Attempt[]) {
  const done = list.filter(a => a.result !== 'forfeit' && a.rp).sort((x, y) => x.n - y.n);
  let best: Attempt | undefined;
  for (const a of done) if (!best || a.lost < best.lost) best = a;
  return best;
}
const REPLAY_DAYS = 60;
export function bestReplays(list: Attempt[]) {
  const out: Record<string, Record<string, string>> = {};
  const dates = [...new Set(list.map(a => a.date))].sort().slice(-REPLAY_DAYS);
  for (const d of dates) {
    const byKey: Record<string, Attempt[]> = {};
    for (const a of list) if (a.date === d) (byKey[`${a.mode}_${a.diff}`] ||= []).push(a);
    for (const [k, l] of Object.entries(byKey)) { const b = bestAttempt(l); if (b) (out[d] ||= {})[k] = b.rp!; }
  }
  return out;
}
export function publishSummary() {
  if (!DB || !UID) return;
  write('board', ref => ref.set({days: summarize(ATT), rp: bestReplays(ATT), t: Date.now()}), `players/${UID}`);
}
function watchBoard(db: any) {
  db.collection('players').onSnapshot(async (snap: any) => {
    const next: Record<string, PlayerDoc> = {};
    for (const d of snap.docs) if (d.exists) next[d.id] = d.data() as PlayerDoc;
    BOARD = next;
    const ids = Object.keys(BOARD);
    if (USER && ids.length) {
      const ps = await USER.profiles(ids);
      NAMES = {};
      for (const id of ids) NAMES[id] = {name: ps[id]?.name || '', avatarUrl: ps[id]?.avatarUrl || '', color: ps[id]?.color || '#888'};
    }
    boardChanged();
  }, () => { /* board unavailable for this view */ });
}
