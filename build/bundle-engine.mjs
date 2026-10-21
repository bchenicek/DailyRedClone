import * as esbuild from '/opt/npm-tools/node_modules/esbuild/lib/main.js';
import fs from 'fs';
const shim = n => `/home/claude/dailyred/src/shims/${n}.js`;
const dynPlugin = {
  name: 'dyn',
  setup(b) {
    b.onResolve({filter: /^(fs|path|ts-chacha20|node:crypto|crypto)$/}, a => ({path: shim({fs: 'fs', path: 'path', 'ts-chacha20': 'chacha'}[a.path] || 'empty')}));
    b.onResolve({filter: /team-validator|battle-stream|^\.\.\/lib$|^\.\.\/lib\/index$|repl|readline|process-manager|\/net$|\/sql$|^(child_process|cluster|https|http|os|net|worker_threads|stream)$/}, a => ({path: shim('empty')}));
    b.onResolve({filter: /^(node:util|util)$/}, a => ({path: shim('util')}));
    b.onLoad({filter: /\/ps\/dist\/.*\.js$/}, a => {
      let src = fs.readFileSync(a.path, 'utf8');
      src = src.replace(/\brequire\(`/g, 'globalThis.__dynreq(`')
        .replace(/\brequire\((filePath|path\.resolve\(DATA_DIR, "aliases"\))\)/g, 'globalThis.__dynreq($1)')
        .replace(/__dirname/g, '"/ps/' + a.path.split('/ps/dist/')[1].split('/')[0] + '"');
      return {contents: src, loader: 'js'};
    });
  },
};
await esbuild.build({
  entryPoints: ['/home/claude/dailyred/src/engine.js'], bundle: true, format: 'iife', globalName: 'PS',
  platform: 'browser', target: 'es2020', minify: true, outfile: '/home/claude/dailyred/out/engine.js',
  plugins: [dynPlugin], logLevel: 'error', metafile: true, keepNames: true, // Showdown's battle copying relies on class names define: {'process.env.NODE_ENV': '"production"', global: 'globalThis'},
});
const r = 0; console.log('engine', fs.statSync('/home/claude/dailyred/out/engine.js').size);
