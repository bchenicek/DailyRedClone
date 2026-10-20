import * as esbuild from '/opt/npm-tools/node_modules/esbuild/lib/main.js';
import fs from 'fs'; import vm from 'vm';
await esbuild.build({entryPoints: ['/home/claude/dailyred/src/selftest.ts'], bundle: true, format: 'iife', globalName: 'T', outfile: '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/selftest.js', logLevel: 'error'});
const ctx = {console}; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('/home/claude/dailyred/out/engine.js', 'utf8'), ctx);
ctx.POOL = JSON.parse(fs.readFileSync('/home/claude/dailyred/build/pool.json', 'utf8'));
vm.runInContext(fs.readFileSync('/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/selftest.js', 'utf8'), ctx);
console.log(ctx.T.run(+process.argv[2] || 3));
