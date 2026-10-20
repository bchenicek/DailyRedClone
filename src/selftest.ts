import {generateTeam, newBattle, redTeamFor, redChoice, battleSeed, matchups, Mode, Difficulty} from './game';
declare const POOL: any;
export function run(days: number) {
  const out: string[] = []; const cnt: Record<string, number> = {}; let errors = 0, wins = 0, total = 0;
  for (let d = 0; d < days; d++) {
    const date = `2026-11-${String(d % 28 + 1).padStart(2, '0')}`;
    for (const mode of ['classic', 'chaos', 'random', 'classicD', 'chaosD', 'randomD'] as Mode[]) {
      for (const diff of ['smart', 'simple'] as Difficulty[]) {
        const team = generateTeam(POOL, date, mode);
        const play = () => {
          const b = newBattle(team, battleSeed(date, mode), mode.endsWith('D'), redTeamFor(date, mode)); const memo = {lastSwitchTurn: -9};
          let guard = 0;
          while (!b.ended && guard++ < 400) {
            const s1 = b.sides[0], s2 = b.sides[1];
            if (s2.requestState && !s2.isChoiceDone()) { b.choose('p2', redChoice(b, diff, memo)); continue; }
            if (s1.requestState && !s1.isChoiceDone()) {
              if (mode.endsWith('D')) { b.choose('p1', 'default'); continue; }
              const req = s1.activeRequest;
              if (req.forceSwitch) { const i = s1.pokemon.findIndex((p: any, k: number) => k > 0 && !p.fainted); b.choose('p1', 'switch ' + (i + 1)); }
              else { const ms = req.active[0].moves; const k = ms.findIndex((m: any) => !m.disabled && m.pp > 0); b.choose('p1', 'move ' + (k + 1 || 1)); }
              continue;
            }
            break;
          }
          return {log: b.log.filter((l: string) => !l.startsWith('|t:|')).join('\n'), winner: b.winner, turns: b.turn};
        };
        try {
          const a = play(), c = play();
          if (a.log !== c.log) { out.push(`NONDETERMINISTIC ${date} ${mode} ${diff}`); errors++; }
          total++; if (a.winner === 'You') wins++;
          for (const l of a.log.split('\n')) { const m = l.match(/^\|move\|p2a: \w+\|([^|]+)/); if (m) cnt[diff + ':' + m[1]] = (cnt[diff + ':' + m[1]] || 0) + 1; if (/^\|switch\|p2a/.test(l)) cnt[diff + ':switch'] = (cnt[diff + ':switch'] || 0) + 1; }
          if (d === 0) out.push(`${mode}/${diff}: ${team.map(t => t.species + '[' + t.moves.join(',') + '|' + t.item + '|' + t.ability + ']').join('  ')} -> ${a.winner} in ${a.turns}`);
        } catch (e: any) { errors++; out.push(`ERROR ${date} ${mode} ${diff}: ${e.stack}`); }
      }
    }
  }
  out.push(JSON.stringify(cnt)); out.push(`total ${total}, player(first-move bot) wins ${wins}, errors ${errors}`);
  out.push(JSON.stringify(matchups(generateTeam(POOL, '2026-11-01', 'classic'))));
  return out.join('\n');
}
