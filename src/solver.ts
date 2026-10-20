// Offline estimate: for a day's team, search for any sequence of choices that beats Red.
// Battles are deterministic for a given day, so a win found here is a real, replayable win.
import {generateTeam, newBattle, redTeamFor, redChoice, battleSeed, estimateDamage, Mode, Difficulty} from './game';
declare const POOL: any;

function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

interface Result { win: boolean; flawless: boolean; score: number; choices: string[]; redDown: number; lost: number }

function play(date: string, mode: Mode, diff: Difficulty, prefix: string[], rand: () => number, eps: number): Result {
  const team = generateTeam(POOL, date, mode);
  const b = newBattle(team, battleSeed(date, mode), false, redTeamFor(date, mode));
  const memo = {lastSwitchTurn: -9};
  const choices: string[] = [];
  let guard = 0;
  while (!b.ended && guard++ < 600) {
    const s1 = b.sides[0], s2 = b.sides[1];
    if (s2.requestState && !s2.isChoiceDone()) { b.choose('p2', redChoice(b, diff, memo)); continue; }
    if (!(s1.requestState && !s1.isChoiceDone())) break;
    let c: string;
    if (choices.length < prefix.length) c = prefix[choices.length];
    else c = policy(b, rand, eps);
    try { b.choose('p1', c); } catch { c = 'default'; b.choose('p1', c); }
    choices.push(c);
    if (b.turn > 150) break;
  }
  const red = b.sides[1].pokemon, me = b.sides[0].pokemon;
  const dealt = red.reduce((s: number, p: any) => s + (p.fainted ? 1 : 1 - p.hp / p.maxhp), 0);
  const kept = me.reduce((s: number, p: any) => s + (p.fainted ? 0 : p.hp / p.maxhp), 0);
  const win = b.winner === 'You';
  const lost = me.filter((p: any) => p.fainted).length;
  return {win, flawless: win && lost === 0, score: dealt * 100 + kept * 15 + (win ? 10000 : 0), choices, redDown: red.filter((p: any) => p.fainted).length, lost};
}

function policy(b: any, rand: () => number, eps: number): string {
  const s1 = b.sides[0]; const req = s1.activeRequest;
  const foe = b.sides[1].active[0];
  const bench = s1.pokemon.map((p: any, i: number) => ({p, i})).filter(({p, i}: any) => i > 0 && !p.fainted);
  const valueOf = (p: any) => { if (!foe || foe.fainted) return 0; let best = 0; for (const m of p.moveSlots) { if (m.pp <= 0) continue; best = Math.max(best, estimateDamage(b, p, foe, m.id) / Math.max(1, foe.hp)); } return best; };
  if (req.forceSwitch) {
    if (rand() < eps) return 'switch ' + (bench[Math.floor(rand() * bench.length)].i + 1);
    bench.sort((x: any, y: any) => valueOf(y.p) - valueOf(x.p));
    return 'switch ' + (bench[0].i + 1);
  }
  const me = s1.active[0];
  const moves = req.active[0].moves.map((m: any, i: number) => ({m, i})).filter(({m}: any) => !m.disabled && m.pp > 0);
  const trapped = req.active[0].trapped || req.active[0].maybeTrapped;
  if (rand() < eps) {
    const opts = [...moves.map(({i}: any) => 'move ' + (i + 1)), ...(trapped ? [] : bench.map(({i}: any) => 'switch ' + (i + 1)))];
    if (opts.length) return opts[Math.floor(rand() * opts.length)];
  }
  if (!moves.length) return 'default';
  let best = moves[0], bv = -1;
  for (const x of moves) { const v = foe && !foe.fainted ? estimateDamage(b, me, foe, x.m.id) : 0; if (v > bv) { bv = v; best = x; } }
  return 'move ' + (best.i + 1);
}

/** Hill-climb on choice sequences: keep the best line, replay a prefix of it, and explore from there. */
export function solve(date: string, mode: Mode, diff: Difficulty, budget: number, seed = 1) {
  const rand = rng(seed * 7919 + date.split('-').reduce((a, x) => a * 31 + +x, 0));
  let best = play(date, mode, diff, [], rand, 0);
  let tries = 1, firstWin = best.win ? 1 : 0, flawless = best.flawless;
  while (tries < budget && !(best.win && flawless)) {
    const k = Math.floor(rand() * (best.choices.length + 1));
    const r = play(date, mode, diff, best.choices.slice(0, k), rand, 0.15 + rand() * 0.35);
    tries++;
    if (r.win && !firstWin) firstWin = tries;
    if (r.flawless) flawless = true;
    if (r.score >= best.score) best = r;
  }
  const team = generateTeam(POOL, date, mode).map(t => t.species).join(', ');
  return {date, mode, diff, win: best.win, firstWin, flawless, tries, redDown: best.redDown, lost: best.lost, team};
}
