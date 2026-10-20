import * as esbuild from '/opt/npm-tools/node_modules/esbuild/lib/main.js';
import fs from 'fs'; import vm from 'vm';
const OUT = '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/solver/';
await esbuild.build({entryPoints: ['/home/claude/dailyred/src/solver.ts'], bundle: true, format: 'iife', globalName: 'T', outfile: OUT + 'solver.js', logLevel: 'error'});
const ctx = {console}; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('/home/claude/dailyred/out/engine.js', 'utf8'), ctx);
ctx.POOL = JSON.parse(fs.readFileSync('/home/claude/dailyred/build/pool.json', 'utf8'));
vm.runInContext(fs.readFileSync(OUT + 'solver.js', 'utf8'), ctx);
const [start, n, step, mode, diff, budget] = [process.argv[2], +process.argv[3], +process.argv[4] || 1, process.argv[5] || 'classic', process.argv[6] || 'smart', +process.argv[7] || 300];
const d0 = new Date(start + 'T12:00');
for (let i = 0; i < n; i++) {
  const d = new Date(d0); d.setDate(d.getDate() + i * step);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const t = Date.now(); const r = ctx.T.solve(key, mode, diff, budget);
  console.log(JSON.stringify({...r, secs: Math.round((Date.now() - t) / 1000)}));
}
